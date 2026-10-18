/**
 * controlTimestamps.test.js — control-changing effects are layer 2 (CR 613.1b), applied in timestamp order (CR 613.7):
 * the LATEST control effect still in force decides who controls a permanent. An "until end of turn" effect ends in the
 * cleanup step (CR 514.2), a control Aura's effect ends when it stops being attached (and an Aura gets a new timestamp each
 * time it becomes attached, CR 613.7e), and an effect with no stated duration lasts until the end of the game (CR 611.2a).
 *
 * THE BUG. The engine kept ONE level of control history per permanent (`controlOriginal` + a single until-end-of-turn
 * flag or a single stealing Aura), so whichever effect ENDED sent the permanent to its original controller — not to the
 * controller of the latest effect still in force:
 *   · Act of Treason, then Control Magic on the same creature: at cleanup the creature went back to its owner although
 *     Control Magic was still attached (the threaten's flag survived the Aura's steal).
 *   · Control Magic, then Act of Treason: at cleanup it went to its OWNER, not back to the Control Magic player.
 *   · Act of Treason, then an indefinite steal (Sliver Overlord): the threaten's flag survived and cleanup reverted the
 *     permanent theft (effects/atoms/control.js — the single-target atom kept the stash; the mass one cleared it).
 *   · Two control Auras: removing the later one sent the creature home past the earlier one still attached.
 *   · An Aura moved off the creature it stole — Illusory Gains' own trigger, or Codsworth, Handy Helper — left that
 *     creature stolen for good (gameState.attachPermanent detached it from the old host without ending its effect).
 * THE FIX. Each permanent carries its temporary control effects in timestamp order (`controlEffects`, oldest first) over
 * the controller it returns to when they have all ended (`controlOriginal`). Ending one effect hands the permanent to the
 * latest remaining effect's controller; an indefinite effect, later than every effect on the permanent, outlasts them all,
 * so it clears the list.
 *
 * Every steal here goes through the engine's real entry points (legal action → dispatch → resolve; the cleanup tail),
 * except Hellkite Tyrant's, whose combat-damage trigger is handed straight to its atom. The pod cases make the casting
 * seat the active player for its sorcery-speed cast — nothing here reads whose turn it is.
 * Real oracle fixtures (bundled Scryfall data, 2026-10-17); the trailing comment on each is its tier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets, finishCleanupActions } from "./gameEngine.js";
import { gainControlClauseParser, applyGainControlAll } from "./effects/atoms/control.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ─────────────────────────────────────────────────────────────────────────────
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const MIND_CONTROL = {"name":"Mind Control","type":"Enchantment — Aura","mana":"{3}{U}{U}","cmc":5,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const SLIVER_OVERLORD = {"name":"Sliver Overlord","type":"Legendary Creature — Sliver Mutant","mana":"{W}{U}{B}{R}{G}","cmc":5,"power":"7","toughness":"7","keywords":[],"colors":["B","G","R","U","W"],"oracle":"{3}: Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.\n{3}: Gain control of target Sliver. (This effect lasts indefinitely.)"}; // native-activated
const METALLIC_SLIVER = {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""}; // native-body
const CODSWORTH = {"name":"Codsworth, Handy Helper","type":"Legendary Artifact Creature — Robot","mana":"{2}{W}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["W"],"oracle":"Commanders you control have ward {2}.\n{T}: Add {W}{W}. Spend this mana only to cast Aura and/or Equipment spells.\n{T}: Attach target Aura or Equipment you control to target creature you control. Activate only as a sorcery."}; // native-mana
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const ILLUSORY_GAINS = {"name":"Illusory Gains","type":"Enchantment — Aura","mana":"{3}{U}{U}","cmc":5,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature.\nWhenever a creature an opponent controls enters, attach this Aura to that creature."}; // native-trigger
const NATURALIZE = {"name":"Naturalize","type":"Instant","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Destroy target artifact or enchantment."}; // native-spell
const HOMEWARD_PATH = {"name":"Homeward Path","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Each player gains control of all creatures they own."}; // land
// Hellkite Tyrant's trigger — "Whenever this creature deals combat damage to a player, gain control of all artifacts that
// player controls." — reaches the control atom as its damaged-player sentinel (triggers.js rewrites "that player").
const HELLKITE_GAIN_ALL = gainControlClauseParser("gain control of all artifacts the damaged player controls");

// ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, controller, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const H = (id, card) => ({ id, ...card });
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const library = (tag, n = 3) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${tag}${i}` }));
const mainPhase = (s) => ({ ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [] });

/** A two-seat board (user, ai) in the user's precombat main phase. `bf` and `hands` are keyed by seat. */
function board(bf = {}, hands = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const pid of Object.keys(s.players)) {
    players[pid] = { ...s.players[pid], battlefield: bf[pid] || [], hand: hands[pid] || [], manaPool: { ...s.players[pid].manaPool, ...POOL }, library: library(`${pid}-l`) };
  }
  return mainPhase({ ...s, players });
}
/** A four-seat Commander pod (user, ai1, ai2, ai3). */
function pod(bf = {}, hands = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const pid of Object.keys(s.players)) {
    players[pid] = { ...s.players[pid], battlefield: bf[pid] || [], hand: hands[pid] || [], manaPool: { ...s.players[pid].manaPool, ...POOL }, library: library(`${pid}-l`) };
  }
  return mainPhase({ ...s, players });
}
const settle = (s) => {
  let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 30 && (st.stack || []).length && !st.pendingChoice; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets });
  return st;
};
/** Take the first offered legal action matching `pred` for `pid`, then settle. Throws when nothing matches (never a silent skip). */
const act = (s, pid, pred, label) => {
  const a = legalActionsForPlayer(s, pid).find(pred);
  if (!a) throw new Error(`no legal action: ${label}`);
  return settle(dispatchAction(s, a));
};
/** `pid` becomes the active player with priority — its sorcery-speed cast is legal — and casts `cardId` at `targetId`. */
const cast = (s, pid, cardId, targetId) => act({ ...s, activePlayer: pid, priorityHolder: pid, consecutivePasses: 0 }, pid,
  (a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || (a.targets || []).some((t) => t.id === targetId)), `${pid} casts ${cardId} at ${targetId}`);
/** The permanent made from hand card `cardId` (an Aura cast from hand gets a fresh permanent id). */
const permIdOfCard = (s, cardId) => Object.values(s.players).flatMap((p) => p.battlefield || []).find((x) => x.card?.id === cardId)?.id;
/** Who controls `id` — the battlefield array AND the permanent's own field, which must agree. */
const holder = (s, id) => {
  const lk = findPermanent(s, id);
  if (!lk) return "GONE";
  return lk.controller === lk.permanent.controller ? lk.controller : `SPLIT(array=${lk.controller}, field=${lk.permanent.controller})`;
};
const cleanup = (s) => finishCleanupActions(s);

// ── a later control effect wins ────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ a later control effect wins (CR 613.1b, 613.7) — and outlasts an earlier until-end-of-turn one (CR 514.2)", () => {
  it("⭐ Act of Treason, then Control Magic by the same player: the creature stays with the Control Magic player after cleanup", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("aot", ACT_OF_TREASON), H("cm", CONTROL_MAGIC)] });
    s = cast(s, "user", "aot", "bear");
    s = cast(s, "user", "cm", "bear");
    expect(holder(s, "bear")).toBe("user");
    expect(holder(cleanup(s), "bear")).toBe("user");
  });

  it("⭐ Act of Treason, then another player's Control Magic: the Control Magic player keeps it after cleanup", () => {
    let s = pod({ ai1: [P("bear", "ai1", GRIZZLY_BEARS)] }, { user: [H("aot", ACT_OF_TREASON)], ai2: [H("cm", CONTROL_MAGIC)] });
    s = cast(s, "user", "aot", "bear");
    s = cast(s, "ai2", "cm", "bear");
    expect(holder(s, "bear")).toBe("ai2");
    expect(holder(cleanup(s), "bear")).toBe("ai2");
  });

  it("⭐ Control Magic, then the owner's Act of Treason: after cleanup it returns to the Control Magic player, not the owner", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("cm", CONTROL_MAGIC)], ai: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "user", "cm", "bear");
    s = cast(s, "ai", "aot", "bear");
    expect(holder(s, "bear")).toBe("ai");
    expect(holder(cleanup(s), "bear")).toBe("user");
  });

  it("⭐ Control Magic, then a third player's Act of Treason: after cleanup it returns to the Control Magic player", () => {
    let s = pod({ ai1: [P("bear", "ai1", GRIZZLY_BEARS)] }, { user: [H("cm", CONTROL_MAGIC)], ai2: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "user", "cm", "bear");
    s = cast(s, "ai2", "aot", "bear");
    expect(holder(s, "bear")).toBe("ai2");
    expect(holder(cleanup(s), "bear")).toBe("user");
  });

  it("⭐ Act of Treason, then Sliver Overlord's indefinite steal by the same player: it stays after cleanup (CR 611.2a)", () => {
    let s = board({ user: [P("overlord", "user", SLIVER_OVERLORD)], ai: [P("sliver", "ai", METALLIC_SLIVER)] }, { user: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "user", "aot", "sliver");
    s = act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "overlord" && (a.targets || []).some((t) => t.id === "sliver"), "Overlord steals the Sliver");
    expect(holder(s, "sliver")).toBe("user");
    expect(holder(cleanup(s), "sliver")).toBe("user");
  });

  it("⭐ Act of Treason, then another player's Sliver Overlord: the Overlord's controller keeps it after cleanup", () => {
    let s = pod({ ai1: [P("sliver", "ai1", METALLIC_SLIVER)], ai2: [P("overlord", "ai2", SLIVER_OVERLORD)] }, { user: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "user", "aot", "sliver");
    s = act({ ...s, activePlayer: "ai2", priorityHolder: "ai2" }, "ai2",
      (a) => a.kind === "activate-ability" && a.permanentId === "overlord" && (a.targets || []).some((t) => t.id === "sliver"), "Overlord steals the Sliver");
    expect(holder(s, "sliver")).toBe("ai2");
    expect(holder(cleanup(s), "sliver")).toBe("ai2");
  });
});

// ── an ended effect hands the permanent to the latest effect still in force ───────────────────────────────────────────────
describe("⭐ an effect that ends hands the permanent to the latest control effect still in force", () => {
  it("⭐ Control Magic, Act of Treason, then the Aura destroyed: the threatener keeps it until cleanup, then it goes home", () => {
    let s = pod({ ai1: [P("bear", "ai1", GRIZZLY_BEARS)] }, { user: [H("cm", CONTROL_MAGIC)], ai2: [H("aot", ACT_OF_TREASON)], ai3: [H("nat", NATURALIZE)] });
    s = cast(s, "user", "cm", "bear");
    s = cast(s, "ai2", "aot", "bear");
    s = cast(s, "ai3", "nat", permIdOfCard(s, "cm"));
    expect(holder(s, "bear")).toBe("ai2");
    expect(holder(cleanup(s), "bear")).toBe("ai1");
  });

  it("⭐ Act of Treason, Control Magic, then the Aura destroyed: back to the threatener until cleanup, then home", () => {
    let s = pod({ ai1: [P("bear", "ai1", GRIZZLY_BEARS)] }, { user: [H("aot", ACT_OF_TREASON)], ai2: [H("cm", CONTROL_MAGIC)], ai3: [H("nat", NATURALIZE)] });
    s = cast(s, "user", "aot", "bear");
    s = cast(s, "ai2", "cm", "bear");
    s = cast(s, "ai3", "nat", permIdOfCard(s, "cm"));
    expect(holder(s, "bear")).toBe("user");
    expect(holder(cleanup(s), "bear")).toBe("ai1");
  });

  it("⭐ two control Auras: removing the later one hands the creature to the earlier Aura's controller", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("mc", MIND_CONTROL)], ai: [H("cm", CONTROL_MAGIC), H("nat", NATURALIZE)] });
    s = cast(s, "user", "mc", "bear");
    s = cast(s, "ai", "cm", "bear");
    expect(holder(s, "bear")).toBe("ai");
    s = cast(s, "ai", "nat", permIdOfCard(s, "cm"));
    expect(holder(s, "bear")).toBe("user");          // Mind Control is still attached
    expect(holder(cleanup(s), "bear")).toBe("user");
  });

  it("⭐ Codsworth moves Control Magic off the creature it stole: that creature goes home, the new host stays put", () => {
    let s = board({ user: [P("cods", "user", CODSWORTH), P("giant", "user", HILL_GIANT)], ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("cm", CONTROL_MAGIC)] });
    s = cast(s, "user", "cm", "bear");
    expect(holder(s, "bear")).toBe("user");
    const cm = permIdOfCard(s, "cm");
    s = act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "cods"
      && (a.targets || []).some((t) => t.id === cm) && (a.targets || []).some((t) => t.id === "giant"), "Codsworth moves Control Magic to the Giant");
    expect(findPermanent(s, cm).permanent.attachedTo).toBe("giant");
    expect({ bear: holder(s, "bear"), giant: holder(s, "giant") }).toEqual({ bear: "ai", giant: "user" });
  });

  it("⭐ Illusory Gains moves itself onto the opponent's next creature: the creature it held goes back, the new one is taken", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("ig", ILLUSORY_GAINS)], ai: [H("giant", HILL_GIANT)] });
    s = cast(s, "user", "ig", "bear");
    expect(holder(s, "bear")).toBe("user");
    s = cast(s, "ai", "giant");                        // a creature an opponent of the Aura's controller controls enters
    const giant = permIdOfCard(s, "giant");
    expect(findPermanent(s, permIdOfCard(s, "ig")).permanent.attachedTo).toBe(giant);
    expect({ bear: holder(s, "bear"), giant: holder(s, giant) }).toEqual({ bear: "ai", giant: "user" });
  });
});

// ── controls ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("controls — the single-effect cases are unchanged", () => {
  it("a lone Act of Treason reverts to the owner at cleanup", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("aot", ACT_OF_TREASON)] });
    s = cast(s, "user", "aot", "bear");
    expect(holder(s, "bear")).toBe("user");
    expect(holder(cleanup(s), "bear")).toBe("ai");
  });

  it("a lone Control Magic holds through cleanup, and its removal afterwards still sends the creature home", () => {
    let s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] }, { user: [H("cm", CONTROL_MAGIC)], ai: [H("nat", NATURALIZE)] });
    s = cast(s, "user", "cm", "bear");
    s = cleanup(s);
    expect(holder(s, "bear")).toBe("user");
    s = cast({ ...s, players: { ...s.players, ai: { ...s.players.ai, manaPool: { ...s.players.ai.manaPool, ...POOL } } } }, "ai", "nat", permIdOfCard(s, "cm"));
    expect(holder(s, "bear")).toBe("ai");
  });

  it("Homeward Path over a threaten-back: the owner, who threatened it back from a Control Magic, keeps it after cleanup", () => {
    // Homeward Path is an indefinite effect later than both, so the Aura underneath no longer decides anything.
    let s = board({ user: [P("bear", "user", GRIZZLY_BEARS), P("path", "user", HOMEWARD_PATH)] }, { user: [H("aot", ACT_OF_TREASON)], ai: [H("cm", CONTROL_MAGIC)] });
    s = cast(s, "ai", "cm", "bear");
    s = cast(s, "user", "aot", "bear");
    expect(holder(s, "bear")).toBe("user");
    s = act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "path", "Homeward Path");
    expect(holder(cleanup(s), "bear")).toBe("user");
  });

  it("Hellkite Tyrant's mass steal of an artifact creature held by Control Magic: the Aura leaving later moves nothing", () => {
    let s = board({ user: [P("sliver", "user", METALLIC_SLIVER)] }, { ai: [H("cm", CONTROL_MAGIC), H("nat", NATURALIZE)] });
    s = cast(s, "ai", "cm", "sliver");
    expect(holder(s, "sliver")).toBe("ai");
    s = applyGainControlAll(s, HELLKITE_GAIN_ALL, { controller: "user", damagedPlayerId: "ai" });
    expect(holder(s, "sliver")).toBe("user");
    s = cast(s, "ai", "nat", permIdOfCard(s, "cm"));
    expect(holder(s, "sliver")).toBe("user");
  });

  it("a game saved before the effect list existed: the single-level stash still reverts (threaten at cleanup, Aura on leaving)", () => {
    const threatened = board({ user: [P("bear", "user", GRIZZLY_BEARS, { owner: "ai", controlOriginal: "ai", controlUntilEndOfTurn: true })] });
    expect(holder(cleanup(threatened), "bear")).toBe("ai");
    let auraHeld = board({ user: [P("cm", "user", CONTROL_MAGIC, { attachedTo: "bear" }), P("bear", "user", GRIZZLY_BEARS, { owner: "ai", controlOriginal: "ai", controlStolenBy: "cm", attachments: ["cm"] })] }, { ai: [H("nat", NATURALIZE)] });
    auraHeld = cast(auraHeld, "ai", "nat", "cm");
    expect(holder(auraHeld, "bear")).toBe("ai");
  });
});
