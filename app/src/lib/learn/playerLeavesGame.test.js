/**
 * playerLeavesGame.test.js — a player leaving a four-player game (CR 800.4a): "When a player leaves the game, all objects
 * owned by that player leave the game and any effects which give that player control of any objects or players end. Then,
 * if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there
 * are any objects still controlled by that player, those objects are exiled."
 *
 * THE BUG. learnSession.removePlayerFromGame dropped the leaving player's record — their whole battlefield with it — and
 * filtered the stack by controller. So:
 *   · a creature the leaver had stolen (Control Magic, Act of Treason, Sliver Overlord) vanished instead of going back — CR
 *     800.4a's own examples;
 *   · a creature of theirs another player had stolen stayed in the game, the stealing Aura still on it;
 *   · their Aura on another player's creature left a dangling attachment on its host;
 *   · a card of theirs another player was casting stayed on the stack, and another player's card they were casting vanished;
 *   · a trigger of theirs still waiting for the stack was put on it after they had gone (CR 800.4d);
 *   · a creature they had reanimated from another player's graveyard vanished instead of being exiled to its owner's exile;
 *   · a card their Banishing Light held stayed exiled for good; the monarch designation stayed with them (CR 725.4); an extra
 *     turn queued for them began with them as the active player (CR 800.4k); another player's Equipment and Aura on their
 *     creature stayed attached to nothing.
 * THE FIX (playerLeavesGame.js): the control effects giving the leaver control end first, each permanent going to the player
 * beneath (controlMove.releaseControlOnLeave); every object they own leaves, wherever it is (the battlefield exit without a
 * landing — gameState.removePermanentFromGame); their abilities and waiting triggers cease to exist; what they still control
 * is exiled to its owners' exile.
 *
 * Every elimination here runs through the session's real driver loop (advanceUntilDecision: the state-based check, the
 * elimination, then the user's next decision — a Shock in the user's hand keeps the user from auto-passing). Every steal and
 * cast goes through the engine's real entry points (legal action → dispatch → resolve). Two cards are staged rather than
 * cast: the card another player casts out of the leaver's exile carries the permission stamp Ragavan, Nimble Pilferer's
 * combat-damage trigger leaves (`_impulseFor`, library.js), and the Bonesplitter starts attached.
 * Real oracle fixtures (bundled Scryfall data, 2026-10-17); the trailing comment on each is its tier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets, advanceStep, finishCleanupActions } from "./gameEngine.js";
import { advanceUntilDecision } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ─────────────────────────────────────────────────────────────────────────────
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const MIND_CONTROL = {"name":"Mind Control","type":"Enchantment — Aura","mana":"{3}{U}{U}","cmc":5,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const ASSAULT_GRIFFIN = {"name":"Assault Griffin","type":"Creature — Griffin","mana":"{3}{W}","cmc":4,"power":"3","toughness":"2","keywords":["Flying"],"colors":["W"],"oracle":"Flying"}; // native-body
const RUNECLAW_BEAR = {"name":"Runeclaw Bear","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Shock deals 2 damage to any target."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const BANISHING_LIGHT = {"name":"Banishing Light","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield."}; // native-trigger
const OBLIVION_RING = {"name":"Oblivion Ring","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control."}; // native-trigger
const REANIMATE = {"name":"Reanimate","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value."}; // native-spell
const SLIVER_OVERLORD = {"name":"Sliver Overlord","type":"Legendary Creature — Sliver Mutant","mana":"{W}{U}{B}{R}{G}","cmc":5,"power":"7","toughness":"7","keywords":[],"colors":["B","G","R","U","W"],"oracle":"{3}: Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.\n{3}: Gain control of target Sliver. (This effect lasts indefinitely.)"}; // native-activated
const METALLIC_SLIVER = {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""}; // native-body
const PALACE_SENTINELS = {"name":"Palace Sentinels","type":"Creature — Human Soldier","mana":"{3}{W}","cmc":4,"power":"2","toughness":"4","keywords":[],"colors":["W"],"oracle":"When this creature enters, you become the monarch."}; // native-trigger
const TIME_WALK = {"name":"Time Walk","type":"Sorcery","mana":"{1}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Take an extra turn after this one."}; // native-spell
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"power":"0","toughness":"1","keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life."}; // native-trigger
const DRONE_TOKEN = {"name":"Drone","type":"Token Artifact Creature — Drone","mana":"","cmc":0,"power":"2","toughness":"2","keywords":["Deathtouch"],"colors":[],"oracle":"Deathtouch\nWhen this creature leaves the battlefield, each opponent loses 2 life and you gain 2 life."}; // native-trigger
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana

// ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, controller, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const H = (id, card, over = {}) => ({ id, ...card, ...over });
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const library = (tag, n = 3) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${tag}${i}` }));
const atMain = (s) => ({ ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [] });
/** A four-seat Commander pod (user → ai1 → ai2 → ai3) in the user's precombat main phase. `extra` merges into a seat. */
function pod(bf = {}, hands = {}, extra = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const pid of Object.keys(s.players)) {
    players[pid] = { ...s.players[pid], battlefield: bf[pid] || [], hand: hands[pid] || [], manaPool: { ...s.players[pid].manaPool, ...POOL }, library: library(`${pid}-l`), ...(extra[pid] || {}) };
  }
  return atMain({ ...s, players });
}
const settle = (s) => {
  let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 30 && (st.stack || []).length && !st.pendingChoice; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets });
  return st;
};
const offered = (s, pid, pred, label) => {
  const a = legalActionsForPlayer(s, pid).find(pred);
  if (!a) throw new Error(`no legal action: ${label}`);
  return a;
};
/** `pid` becomes the active player with priority (its sorcery-speed cast is legal) and casts `cardId` at `targetId`;
 *  `resolve: false` leaves the spell on the stack. */
function cast(s, pid, cardId, targetId, { resolve = true } = {}) {
  const st = { ...s, activePlayer: pid, priorityHolder: pid, consecutivePasses: 0 };
  const a = offered(st, pid, (x) => x.kind === "cast-spell" && x.cardId === cardId && (targetId == null || (x.targets || []).some((t) => t.id === targetId)), `${pid} casts ${cardId} at ${targetId}`);
  const out = dispatchAction(st, a);
  return resolve ? settle(out) : out;
}
/** `pid` loses (life 0) and the session's own elimination runs (the real driver loop, to the user's next decision). The
 *  table is back in the user's precombat main phase, the user active with priority, unless `active` says otherwise. */
function leave(s, pid, { active = "user", mode = "commander" } = {}) {
  const user = s.players.user;
  const state = {
    ...s, activePlayer: active, priorityHolder: active, consecutivePasses: 0, humanSeats: ["user"],
    ...(mode === "commander" ? { rules: { ...(s.rules || {}), ffaSoleSurvivor: true } } : {}),
    players: { ...s.players, user: { ...user, hand: [...(user.hand || []), H("user-shock", SHOCK)], manaPool: { ...user.manaPool, ...POOL } }, [pid]: { ...s.players[pid], life: 0 } },
  };
  const out = advanceUntilDecision({ id: "leave", createdAt: "2026-10-17T00:00:00.000Z", difficulty: "beginner", mode, state, decisionLog: [], status: "active" });
  return { s: out.session.state, decision: out.decision, status: out.session.status };
}
/** Who controls `id` — the battlefield array AND the permanent's own field, which must agree; "GONE" when on no battlefield. */
const holder = (s, id) => {
  const lk = findPermanent(s, id);
  if (!lk) return "GONE";
  return lk.controller === lk.permanent.controller ? lk.controller : `SPLIT(array=${lk.controller}, field=${lk.permanent.controller})`;
};
/** Every place a card is now, by its card id: "pid.zone" ("pid.battlefield" for a permanent made from it), "stack". */
function where(s, cardId) {
  const out = [];
  for (const [pid, p] of Object.entries(s.players)) {
    for (const z of ["hand", "library", "graveyard", "exile", "command"]) if ((p[z] || []).some((c) => c?.id === cardId)) out.push(`${pid}.${z}`);
    if ((p.battlefield || []).some((x) => x.card?.id === cardId)) out.push(`${pid}.battlefield`);
  }
  if ((s.stack || []).some((o) => o.source?.id === cardId)) out.push("stack");
  return out;
}

// ── what the leaver controlled through an effect ───────────────────────────────────────────────────────────────────────────
describe("⭐ the effects that gave the leaver control end (CR 800.4a)", () => {
  it("⭐ the leaver stole a creature with Control Magic: on leaving, Control Magic leaves with them and the creature returns to its owner", () => {
    let s = pod({ ai1: [P("bear", "ai1", RUNECLAW_BEAR)] }, { ai2: [H("cm", CONTROL_MAGIC)] });
    s = cast(s, "ai2", "cm", "bear");
    expect(holder(s, "bear")).toBe("ai2");
    const { s: out, decision } = leave(s, "ai2");
    expect(decision.kind).toBe("ask");
    expect(out.players.ai2).toBeUndefined();
    expect(holder(out, "bear")).toBe("ai1");
    expect(where(out, "cm")).toEqual([]);                                   // Control Magic left the game (it went nowhere)
    const bear = findPermanent(out, "bear").permanent;
    expect(bear.controlEffects).toBeUndefined();                            // nothing holds it any more
    expect(bear.attachments).toEqual([]);
  });

  it("⭐ the leaver's Act of Treason: the creature reverts to its owner (CR 800.4a, its second example)", () => {
    let s = pod({ ai1: [P("bear", "ai1", RUNECLAW_BEAR)] }, { ai2: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "ai2", "aot", "bear");
    expect(holder(s, "bear")).toBe("ai2");
    const { s: out } = leave(s, "ai2");
    expect(holder(out, "bear")).toBe("ai1");
    expect(findPermanent(out, "bear").permanent.controlEffects).toBeUndefined();
  });

  it("⭐ the leaver's indefinite steal (Sliver Overlord, CR 611.2a) ends too: the Sliver returns to its owner", () => {
    let s = pod({ ai2: [P("overlord", "ai2", SLIVER_OVERLORD)], user: [P("sliver", "user", METALLIC_SLIVER)] });
    const st = { ...s, activePlayer: "ai2", priorityHolder: "ai2" };
    s = settle(dispatchAction(st, offered(st, "ai2", (a) => a.kind === "activate-ability" && a.permanentId === "overlord" && (a.targets || []).some((t) => t.id === "sliver"), "Overlord steals the Sliver")));
    expect(holder(s, "sliver")).toBe("ai2");
    const { s: out } = leave(s, "ai2");
    expect(holder(out, "sliver")).toBe("user");
    expect(where(out, "c-overlord")).toEqual([]);
  });

  it("⭐ the leaver's indefinite steal beneath another player's Act of Treason: the threatener keeps it this turn, then it goes to its owner — not to the departed thief", () => {
    let s = pod({ ai2: [P("overlord", "ai2", SLIVER_OVERLORD)], user: [P("sliver", "user", METALLIC_SLIVER)] }, { ai1: [H("aot", ACT_OF_TREASON)] });
    const st = { ...s, activePlayer: "ai2", priorityHolder: "ai2" };
    s = settle(dispatchAction(st, offered(st, "ai2", (a) => a.kind === "activate-ability" && a.permanentId === "overlord" && (a.targets || []).some((t) => t.id === "sliver"), "Overlord steals the Sliver")));
    s = cast(s, "ai1", "aot", "sliver");
    expect(holder(s, "sliver")).toBe("ai1");
    const { s: out } = leave(s, "ai2");
    expect(holder(out, "sliver")).toBe("ai1");                              // the Act of Treason is still in force
    expect(holder(finishCleanupActions(out), "sliver")).toBe("user");       // it ends (CR 514.2): the owner, not a gone seat's hold
  });
});

// ── what the leaver owned ──────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ every object the leaver owns leaves the game (CR 800.4a)", () => {
  it("⭐ the leaver's creature another player stole with Mind Control leaves the game, and Mind Control goes to its owner's graveyard (CR 800.4a, its first example)", () => {
    let s = pod({ ai1: [P("griffin", "ai1", ASSAULT_GRIFFIN)] }, { ai2: [H("mc", MIND_CONTROL)] });
    s = cast(s, "ai2", "mc", "griffin");
    expect(holder(s, "griffin")).toBe("ai2");
    const { s: out } = leave(s, "ai1");
    expect(out.players.ai1).toBeUndefined();
    expect(holder(out, "griffin")).toBe("GONE");
    expect(where(out, "c-griffin")).toEqual([]);
    expect(where(out, "mc")).toEqual(["ai2.graveyard"]);
  });

  it("⭐ the leaver's Pacifism on another player's creature leaves: nothing is attached to the creature any more", () => {
    let s = pod({ user: [P("bear", "user", GRIZZLY_BEARS)] }, { ai2: [H("pac", PACIFISM)] });
    s = cast(s, "ai2", "pac", "bear");
    expect(findPermanent(s, "bear").permanent.attachments).toHaveLength(1);
    const { s: out } = leave(s, "ai2");
    expect(where(out, "pac")).toEqual([]);
    expect(findPermanent(out, "bear").permanent.attachments).toEqual([]);
  });

  it("⭐ another player's Equipment on the leaver's creature stays on the battlefield unattached, and their Aura on it goes to their graveyard (CR 301.5c, 303.4c)", () => {
    let s = pod({ user: [P("bs", "user", BONESPLITTER, { attachedTo: "lb" })], ai2: [P("lb", "ai2", GRIZZLY_BEARS, { attachments: ["bs"] }), P("lb2", "ai2", RUNECLAW_BEAR)] }, { user: [H("pac", PACIFISM)] });
    s = cast(s, "user", "pac", "lb2");
    const { s: out } = leave(s, "ai2");
    expect(holder(out, "bs")).toBe("user");
    expect(findPermanent(out, "bs").permanent.attachedTo).toBe(null);
    expect(where(out, "pac")).toEqual(["user.graveyard"]);
  });

  it("⭐ a token the leaver owns that another player stole leaves the game too, and its leaves-the-battlefield ability triggers for the player who controlled it (CR 603.6c)", () => {
    let s = pod({ ai2: [P("drone", "ai2", { ...DRONE_TOKEN, token: true })] }, { user: [H("cm", CONTROL_MAGIC)] });
    s = cast(s, "user", "cm", "drone");
    expect(holder(s, "drone")).toBe("user");
    const { s: out } = leave(s, "ai2");
    const after = settle(out);
    expect(holder(after, "drone")).toBe("GONE");
    expect(where(after, "cm")).toEqual(["user.graveyard"]);
    expect([after.players.user.life, after.players.ai1.life, after.players.ai3.life]).toEqual([42, 38, 38]);
  });

  it("⭐ the leaver's own token leaves with them; its leaves-the-battlefield ability triggers, theirs, and is dropped — logged — instead of being put on the stack (CR 603.6c, 800.4d)", () => {
    const s = pod({ ai2: [P("drone", "ai2", { ...DRONE_TOKEN, token: true })] });
    const { s: out } = leave(s, "ai2");
    const after = settle(out);
    expect(holder(after, "drone")).toBe("GONE");
    expect((after.stack || []).filter((o) => o.controller === "ai2")).toEqual([]);
    expect([after.players.user.life, after.players.ai1.life, after.players.ai3.life]).toEqual([40, 40, 40]);
    expect(after.log.filter((e) => e.kind === "trigger-controller-left").map((e) => [e.source, e.controller])).toEqual([["Drone", "ai2"]]);
  });

  it("⭐ the leaver's Banishing Light leaves the game, so the creature it held returns to the battlefield under its owner's control (CR 610.3)", () => {
    let s = pod({ user: [P("bear", "user", GRIZZLY_BEARS)] }, { ai2: [H("bl", BANISHING_LIGHT)] });
    s = cast(s, "ai2", "bl", null);
    expect(where(s, "c-bear")).toEqual(["user.exile"]);
    const { s: out } = leave(s, "ai2");
    const back = settle(out);
    expect(where(back, "c-bear")).toEqual(["user.battlefield"]);
    expect(where(back, "bl")).toEqual([]);
  });

  it("control: the leaver's Oblivion Ring returns its card with a triggered ability of theirs, which is never put on the stack (CR 800.4d) — the creature stays exiled", () => {
    let s = pod({ user: [P("bear", "user", GRIZZLY_BEARS)] }, { ai2: [H("or", OBLIVION_RING)] });
    s = cast(s, "ai2", "or", null);
    expect(where(s, "c-bear")).toEqual(["user.exile"]);
    const { s: out } = leave(s, "ai2");
    const after = settle(out);
    expect(where(after, "c-bear")).toEqual(["user.exile"]);
    expect(where(after, "or")).toEqual([]);
  });
});

// ── the stack ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ the leaver's spells and abilities on the stack (CR 800.4a, 800.4d)", () => {
  it("⭐ the leaver's card another player is casting (Ragavan's permission) leaves the stack — it does not resolve for them", () => {
    let s = pod({}, {}, { ai2: { exile: [H("div", DIVINATION, { _impulse: true, _impulseFor: "user", _impulseTurn: 4 })] } });
    s = cast(s, "user", "div", null, { resolve: false });
    expect(s.stack.map((o) => [o.source?.id, o.controller, o.owner])).toEqual([["div", "user", "ai2"]]);
    const { s: out } = leave(s, "ai2");
    expect(out.stack).toEqual([]);
    expect(where(out, "div")).toEqual([]);
  });

  it("⭐ another player's card the leaver is casting is exiled to its owner's exile", () => {
    let s = pod({}, {}, { user: { exile: [H("div", DIVINATION, { _impulse: true, _impulseFor: "ai2", _impulseTurn: 4 })] } });
    s = cast(s, "ai2", "div", null, { resolve: false });
    expect(s.stack.map((o) => [o.source?.id, o.controller, o.owner])).toEqual([["div", "ai2", "user"]]);
    const { s: out } = leave(s, "ai2");
    expect(out.stack).toEqual([]);
    expect(where(out, "div")).toEqual(["user.exile"]);
  });

  it("⭐ the leaver's trigger still waiting for the stack leaves the queue with them and never resolves (CR 800.4d) — their Blood Artist dying in the same check", () => {
    const s = pod({ ai2: [P("artist", "ai2", BLOOD_ARTIST, { damageMarked: 1 })], user: [P("bear", "user", GRIZZLY_BEARS)] });
    const { s: out } = leave(s, "ai2");
    expect(out.players.ai2).toBeUndefined();
    expect((out.pendingTriggers || []).filter((t) => t.controller === "ai2")).toEqual([]);
    expect((out.stack || []).filter((o) => o.controller === "ai2")).toEqual([]);
    expect(settle(out).players.user.life).toBe(40);                         // its "target player loses 1 life" never happens
  });

  it("control: the leaver's own spell leaves the stack — the card is gone and its target is untouched", () => {
    let s = pod({ user: [P("bear", "user", GRIZZLY_BEARS)] }, { ai2: [H("bolt", LIGHTNING_BOLT)] });
    s = cast(s, "ai2", "bolt", "bear", { resolve: false });
    const { s: out } = leave(s, "ai2");
    expect(out.stack).toEqual([]);
    expect(where(out, "bolt")).toEqual([]);
    expect(holder(settle(out), "bear")).toBe("user");
  });

  it("control: a spell targeting the leaver loses its only target and leaves the stack without resolving (CR 608.2b)", () => {
    let s = pod({}, { ai1: [H("bolt", LIGHTNING_BOLT)] });
    const st = { ...s, activePlayer: "ai1", priorityHolder: "ai1" };
    s = dispatchAction(st, offered(st, "ai1", (x) => x.kind === "cast-spell" && x.cardId === "bolt" && (x.targets || []).some((t) => t.id === "ai2"), "Bolt at ai2"));
    const { s: out } = leave(s, "ai2");
    const after = settle(out);
    expect(after.stack).toEqual([]);
    expect(where(after, "bolt")).toEqual(["ai1.graveyard"]);
    expect(after.log.some((e) => e.kind === "spell-fizzle")).toBe(true);
  });
});

// ── what the leaver still controlled ───────────────────────────────────────────────────────────────────────────────────────
describe("⭐ objects the leaver still controls are exiled (CR 800.4a)", () => {
  it("⭐ a creature the leaver reanimated from another player's graveyard (theirs by default, CR 110.2) is exiled to its owner's exile", () => {
    let s = pod({}, { ai2: [H("rean", REANIMATE)] }, { user: { graveyard: [H("ug", ASSAULT_GRIFFIN)] } });
    s = cast(s, "ai2", "rean", "ug");
    expect(where(s, "ug")).toEqual(["ai2.battlefield"]);
    const { s: out } = leave(s, "ai2");
    expect(where(out, "ug")).toEqual(["user.exile"]);
  });
});

// ── the table afterwards ───────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ the remaining players' game afterwards", () => {
  it("⭐ the monarch leaves: the active player becomes the monarch (CR 725.4)", () => {
    let s = pod({}, { ai2: [H("ps", PALACE_SENTINELS)] });
    s = cast(s, "ai2", "ps", null);
    expect(s.monarchId).toBe("ai2");
    const { s: out } = leave(s, "ai2");
    expect(out.monarchId).toBe("user");
  });

  it("⭐ an extra turn queued for the leaver doesn't begin (CR 800.4k) — the next turn is the next seat's", () => {
    let s = pod({}, { ai2: [H("tw", TIME_WALK)] });
    s = cast(s, "ai2", "tw", null);
    expect(s.extraTurns).toEqual([{ player: "ai2" }]);
    const { s: out } = leave(s, "ai2");
    const next = advanceStep({ ...out, phase: "ending", step: "cleanup", stack: [], pendingTriggers: [] });
    expect(next.activePlayer).toBe("ai1");
    expect(next.extraTurns).toEqual([]);
  });

  it("control: a plain elimination — the leaver's own permanents, cards and commander go; the others' boards, life and the commander damage their own commanders dealt stay", () => {
    const cmdr = { ...LLANOWAR_ELVES, id: "cmdr", isCommander: true, commanderInstanceId: "ai2::cmdr" };
    const s = pod(
      { ai2: [P("lb", "ai2", GRIZZLY_BEARS), { ...createPermanent({ id: "cp", card: cmdr, controller: "ai2", summoningSick: false }) }], user: [P("bear", "user", GRIZZLY_BEARS)], ai1: [P("elf", "ai1", LLANOWAR_ELVES)] },
      { ai2: [H("bolt", LIGHTNING_BOLT)] },
      { user: { commanderDamageFrom: { "ai2::cmdr": 5, "ai1::x": 3 } } },
    );
    const { s: out } = leave(s, "ai2");
    expect(out.players.ai2).toBeUndefined();
    expect(out.turnOrder).toEqual(["user", "ai1", "ai3"]);
    expect(holder(out, "lb")).toBe("GONE");
    expect(holder(out, "cp")).toBe("GONE");
    expect(holder(out, "bear")).toBe("user");
    expect(holder(out, "elf")).toBe("ai1");
    expect(out.players.user.commanderDamageFrom).toEqual({ "ai1::x": 3 });
    expect(out.log.some((e) => e.kind === "player-eliminated" && e.player === "ai2")).toBe(true);
    expect(out.log.some((e) => e.kind === "left-game-objects")).toBe(false);
  });

  it("control: a two-player game ends when a player loses — nothing is removed from the board", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = atMain({ ...s0, players: {
      user: { ...s0.players.user, hand: [H("cm", CONTROL_MAGIC)], manaPool: { ...s0.players.user.manaPool, ...POOL }, library: library("u") },
      ai: { ...s0.players.ai, battlefield: [P("bear", "ai", GRIZZLY_BEARS)], manaPool: { ...s0.players.ai.manaPool, ...POOL }, library: library("a") } } });
    s = cast(s, "user", "cm", "bear");
    expect(holder(s, "bear")).toBe("user");
    const { s: out, decision, status } = leave(s, "ai", { mode: "standard" });
    expect(status).toBe("user-wins");
    expect(decision.kind).toBe("game-over");
    expect(holder(out, "bear")).toBe("user");
    expect(out.players.ai).toBeDefined();
  });
});

