/**
 * ownerZoneRouting.test.js — a permanent keeps its OWNER through control changes (CR 110.2), so every exit lands in its
 * owner's zone (CR 400.3: "If an object would go to any library, graveyard, or hand other than its owner's, it goes to its
 * owner's corresponding zone.").
 *
 * THE BUG. controlMove.moveControl — the one control move behind the gain-control atom (Act of Treason, Sliver Overlord), the
 * control Auras (Control Magic, Mind Control, Treachery), Homeward Path and the end-of-turn revert — spliced the permanent into
 * the new controller's battlefield without recording its owner. The engine records ownership SPARSELY: a permanent carries an
 * `owner` field only when it may differ from the player whose battlefield holds it, and an absent field means "owned by this
 * battlefield's player". The battlefield-exit chokepoint (gameState.moveCardToZone) already routes a card to its owner's zone
 * by that field — but a stolen permanent never had it, so it read as the THIEF's own: Act of Treason + Lightning Bolt put the
 * opponent's creature in the thief's graveyard, Unsummon in the thief's hand, Excommunicate on the thief's library, Unmake in
 * the thief's exile; Chaos Warp and Ephemerate handed it to the thief permanently; Homeward Path and Sword of Hearth and Home
 * could not find it; a stolen commander landed in the thief's graveyard and was offered to the thief's command zone.
 *
 * THE FIX. moveControl stamps `owner` on every move — the existing stamp, else the seat it is leaving (its owner, by the same
 * convention) — written after the caller's extra fields so no caller can overwrite it. Every exit already funnels through the
 * chokepoint, so that one stamp covers death, sacrifice, destruction, combat, bounce, tuck, exile and the blinks. The
 * self-return atoms that assumed "the dead card is in its last controller's graveyard" now read the graveyard that HOLDS it
 * (the owner's) — undying (CR 702.93a), persist (CR 702.79a), the granted dies-return, the Enduring return and the return to
 * its owner's hand; with the stamp in place they would otherwise find nothing. And the battlefield form of "shuffle this into
 * its owner's library" no longer bypasses the chokepoint for a permanent owned by another player.
 *
 * Every steal and every exit here goes through the engine's real entry points (legal action → dispatch → resolve; combat
 * damage; the cleanup tail; the commander SBA). Real oracle fixtures, generated from the bundled Scryfall data (2026-10-01);
 * the trailing comment on each is its tier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, attachPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets, finishCleanupActions } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { returnCommandersToZone } from "./learnSession.js";
import { moveControl } from "./controlMove.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ─────────────────────────────────────────────────────────────────────────────
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const VISCERA_SEER = {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Scry"],"colors":["B"],"oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)"}; // native-activated
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Return target creature to its owner's hand."}; // native-spell
const EXCOMMUNICATE = {"name":"Excommunicate","type":"Sorcery","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Put target creature on top of its owner's library."}; // native-spell
const UNMAKE = {"name":"Unmake","type":"Instant","mana":"{W/B}{W/B}{W/B}","cmc":3,"keywords":[],"colors":["B","W"],"oracle":"Exile target creature."}; // native-spell
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature. Its controller gains life equal to its power."}; // native-spell
const CHAOS_WARP = {"name":"Chaos Warp","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield."}; // native-spell
const EPHEMERATE = {"name":"Ephemerate","type":"Instant","mana":"{W}","cmc":1,"keywords":["Rebound"],"colors":["W"],"oracle":"Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)"}; // native-spell
const CLOUDSHIFT = {"name":"Cloudshift","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature you control, then return that card to the battlefield under your control."}; // native-spell
const RAISE_THE_ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 white Soldier creature tokens."}; // native-spell
const HOMEWARD_PATH = {"name":"Homeward Path","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Each player gains control of all creatures they own."}; // land
const DISENCHANT = {"name":"Disenchant","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Destroy target artifact or enchantment."}; // native-spell
const YOUNG_WOLF = {"name":"Young Wolf","type":"Creature — Wolf","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Undying"],"colors":["G"],"oracle":"Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)"}; // native-body
const SAFEHOLD_ELITE = {"name":"Safehold Elite","type":"Creature — Elf Scout","mana":"{1}{G/W}","cmc":2,"power":"2","toughness":"2","keywords":["Persist"],"colors":["G","W"],"oracle":"Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)"}; // native-body
const MORTUS_STRIDER = {"name":"Mortus Strider","type":"Creature — Skeleton","mana":"{1}{U}{B}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["B","U"],"oracle":"When this creature dies, return it to its owner's hand."}; // native-trigger
const ENDURING_CURIOSITY = {"name":"Enduring Curiosity","type":"Enchantment Creature — Cat Glimmer","mana":"{2}{U}{U}","cmc":4,"power":"4","toughness":"3","keywords":["Flash"],"colors":["U"],"oracle":"Flash\nWhenever a creature you control deals combat damage to a player, draw a card.\nWhen Enduring Curiosity dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)"}; // native-trigger
const SUPERNATURAL_STAMINA = {"name":"Supernatural Stamina","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Until end of turn, target creature gets +2/+0 and gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\""}; // native-spell
const FEIGN_DEATH = {"name":"Feign Death","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Until end of turn, target creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it.\""}; // native-spell
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const SWORD_OF_HEARTH_AND_HOME = {"name":"Sword of Hearth and Home","type":"Artifact — Equipment","mana":"{3}","cmc":3,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+2 and has protection from green and from white.\nWhenever equipped creature deals combat damage to a player, exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle.\nEquip {2}"}; // native-mixed
const REFLECTOR_MAGE = {"name":"Reflector Mage","type":"Creature — Human Wizard","mana":"{1}{W}{U}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["U","W"],"oracle":"When this creature enters, return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn."}; // native-trigger
const FBLTHP = {"name":"Fblthp, the Lost","type":"Legendary Creature — Homunculus","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"When Fblthp enters, draw a card. If it entered from your library or was cast from your library, draw two cards instead.\nWhen Fblthp becomes the target of a spell, shuffle Fblthp into its owner's library."}; // native-trigger
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const REANIMATE = {"name":"Reanimate","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value."}; // native-spell

// ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, controller, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const H = (id, card) => ({ id, ...card });
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const library = (tag, n = 3) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${tag}${i}` }));

/** A two-seat board in the user's precombat main phase, both seats holding plenty of mana. */
function board({ user = [], ai = [], hand = [], aiHand = [], aiLibrary = library("al") } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...POOL }, library: library("ul") },
      ai: { ...s.players.ai, battlefield: ai, hand: aiHand, manaPool: { ...s.players.ai.manaPool, ...POOL }, library: aiLibrary } } };
}
/** Flush triggers and resolve the stack down (stopping at a pause), with the engine's own trigger-target chooser by default. */
const settle = (s, chooseTargets = chooseTriggerTargets) => {
  let st = flushTriggers(s, { chooseTargets });
  for (let i = 0; i < 30 && (st.stack || []).length && !st.pendingChoice; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets });
  return st;
};
/** Take the first offered legal action matching `pred` for `pid`, then settle. Throws when nothing matches (never a silent skip). */
const act = (s, pid, pred, label) => {
  const a = legalActionsForPlayer(s, pid).find(pred);
  if (!a) throw new Error(`no legal action: ${label}`);
  return settle(dispatchAction(s, a));
};
const cast = (s, pid, cardId, targetId) => act(s, pid,
  (a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || (a.targets || []).some((t) => t.id === targetId)), `${pid} casts ${cardId} at ${targetId}`);
const withPriority = (s, pid, over = {}) => ({ ...s, priorityHolder: pid, ...over });
/** Refill a seat's pool — the cleanup tail empties every pool (CR 500.5), and a test that runs it then casts again needs mana. */
const refill = (s, pid) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], manaPool: { ...s.players[pid].manaPool, ...POOL } } } });
const sacrificeTo = (s, pid, outletId, victimId) =>
  act(s, pid, (a) => a.kind === "activate-ability" && a.permanentId === outletId && a.sacCreatureId === victimId, `${pid} sacrifices ${victimId}`);
/** Every zone holding `cardId` ("ai.graveyard", "user.battlefield", …) — one entry means it is in exactly one place. */
const where = (s, cardId) => {
  const out = [];
  for (const [pid, p] of Object.entries(s.players)) {
    for (const z of ["hand", "library", "graveyard", "exile", "command"]) if ((p[z] || []).some((c) => c.id === cardId)) out.push(`${pid}.${z}`);
    if ((p.battlefield || []).some((x) => x.card?.id === cardId)) out.push(`${pid}.battlefield`);
  }
  return out.join(",") || "nowhere";
};
const permOfCard = (s, cardId) => {
  for (const [pid, p] of Object.entries(s.players)) {
    const perm = (p.battlefield || []).find((x) => x.card?.id === cardId);
    if (perm) return { pid, perm };
  }
  return null;
};
/** The user takes the AI's Grizzly Bears with a real Act of Treason cast. */
const stealBears = ({ user = [], ai = [], hand = [], aiHand = [], aiLibrary } = {}) =>
  cast(board({ user, ai: [P("bear", "ai", GRIZZLY_BEARS), ...ai], hand: [H("aot", ACT_OF_TREASON), ...hand], aiHand, aiLibrary }), "user", "aot", "bear");

// ── the steal ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the steal writes the owner down (CR 110.2)", () => {
  it("⭐ Act of Treason: the stolen permanent is the user's to control and still the AI's to own", () => {
    const s = stealBears();
    const lk = findPermanent(s, "bear");
    expect({ array: lk.controller, controller: lk.permanent.controller, owner: lk.permanent.owner }).toEqual({ array: "user", controller: "user", owner: "ai" });
  });

  it("Control Magic (the Aura path) stamps the same owner", () => {
    const s = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("cm", CONTROL_MAGIC)] }), "user", "cm", "bear");
    expect({ controller: findPermanent(s, "bear").controller, owner: findPermanent(s, "bear").permanent.owner }).toEqual({ controller: "user", owner: "ai" });
  });

  it("⛔ the move can never overwrite ownership — a caller's extra fields are applied BEFORE the owner stamp", () => {
    const s = board({ ai: [P("bear", "ai", GRIZZLY_BEARS)] });
    const moved = moveControl(s, "bear", "user", { owner: "user", controlOriginal: "ai" });
    expect(findPermanent(moved, "bear").permanent).toMatchObject({ controller: "user", owner: "ai", controlOriginal: "ai" });
  });

  it("⛔ a game saved before the stamp existed (the control stash, no owner): when the Aura goes, the host goes home owned by its original controller", () => {
    let s = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("cm", CONTROL_MAGIC), H("bolt", LIGHTNING_BOLT)], aiHand: [H("dis", DISENCHANT)] }), "user", "cm", "bear");
    // The shape the control move wrote before this fix: the stash (controlOriginal / controlStolenBy) and no `owner` field.
    const { owner: _unstamped, ...legacy } = findPermanent(s, "bear").permanent;
    expect(legacy).toMatchObject({ controller: "user", controlOriginal: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "bear" ? legacy : p)) } } };
    const aura = s.players.user.battlefield.find((p) => p.card?.id === "cm");
    s = cast(withPriority(s, "ai"), "ai", "dis", aura.id);         // the Aura leaves: the host reverts through the control move
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "ai", permanent: { owner: "ai" } });
    s = cast(withPriority(s, "user"), "user", "bolt", "bear");
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });

  it("⛔ nothing else changes shape: a permanent that never changed hands — battlefield-built or cast — carries no owner field", () => {
    const s = cast(board({ user: [P("mine", "user", GRIZZLY_BEARS)], hand: [H("giant", HILL_GIANT)] }), "user", "giant");
    const giant = permOfCard(s, "giant").perm;
    expect("owner" in giant).toBe(false);
    expect("owner" in findPermanent(s, "mine").permanent).toBe(false);
  });
});

// ── every exit ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ every exit of a stolen permanent lands in its OWNER's zone (CR 400.3)", () => {
  it("dies to Lightning Bolt → the owner's graveyard (CR 404.1 / 700.4)", () => {
    const s = cast(stealBears({ hand: [H("bolt", LIGHTNING_BOLT)] }), "user", "bolt", "bear");
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });

  it("sacrificed by the thief (Viscera Seer) → the owner's graveyard (CR 701.21a)", () => {
    const s = sacrificeTo(stealBears({ user: [P("seer", "user", VISCERA_SEER)] }), "user", "seer", "bear");
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });

  it("destroyed (Murder) while Control Magic holds it → the owner's graveyard; the Aura goes to its own owner's", () => {
    let s = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("cm", CONTROL_MAGIC), H("murder", MURDER)] }), "user", "cm", "bear");
    s = cast(s, "user", "murder", "bear");
    expect({ bear: where(s, "c-bear"), aura: where(s, "cm") }).toEqual({ bear: "ai.graveyard", aura: "user.graveyard" });
  });

  it("dies in combat — the hasty stolen Bears attacks its owner and is blocked by a Hill Giant → the owner's graveyard", () => {
    let s = stealBears({ ai: [P("giant", "ai", HILL_GIANT)] });
    s = { ...s, phase: "combat", step: "declare-attackers" };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "bear"));
    s = withPriority({ ...s, step: "declare-blockers" }, "ai");
    s = dispatchAction(s, legalActionsForPlayer(s, "ai").find((a) => a.kind === "declare-blocker" && a.permanentId === "giant" && a.attackerId === "bear"));
    s = settle(resolveCombatDamage({ ...s, step: "combat-damage" }));
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });

  it("bounced (Unsummon) → the owner's hand", () => {
    const s = cast(stealBears({ hand: [H("uns", UNSUMMON)] }), "user", "uns", "bear");
    expect(where(s, "c-bear")).toBe("ai.hand");
  });

  it("tucked (Excommunicate) → the TOP of the owner's library", () => {
    const s = cast(stealBears({ hand: [H("exc", EXCOMMUNICATE)] }), "user", "exc", "bear");
    expect(where(s, "c-bear")).toBe("ai.library");
    expect(s.players.ai.library[0].id).toBe("c-bear");
  });

  it("exiled (Unmake) → filed under the owner's exile, as an opponent-owned creature exiled straight off its owner's side is", () => {
    const stolen = cast(stealBears({ hand: [H("unmake", UNMAKE)] }), "user", "unmake", "bear");
    const native = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("unmake", UNMAKE)] }), "user", "unmake", "bear");
    expect({ stolen: where(stolen, "c-bear"), native: where(native, "c-bear") }).toEqual({ stolen: "ai.exile", native: "ai.exile" });
  });

  it("Swords to Plowshares → the owner's exile, while ITS CONTROLLER (the thief) gains the life — the two readings stay apart", () => {
    const before = stealBears({ hand: [H("stp", SWORDS)] });
    const s = cast(before, "user", "stp", "bear");
    expect(where(s, "c-bear")).toBe("ai.exile");
    expect({ user: s.players.user.life - before.players.user.life, ai: s.players.ai.life - before.players.ai.life }).toEqual({ user: 2, ai: 0 });
  });

  it("Chaos Warp → the OWNER shuffles it into their library, reveals it, and puts it onto THEIR battlefield", () => {
    const s = cast(stealBears({ hand: [H("warp", CHAOS_WARP)], aiLibrary: [] }), "user", "warp", "bear");
    expect(where(s, "c-bear")).toBe("ai.battlefield");
    expect([...s.log].reverse().find((e) => e.effect === "owner-tuck-reveal-put")?.revealed?.[0]).toMatchObject({ owner: "ai", card: "Grizzly Bears", entered: true });
  });

  it("Ephemerate (\"under its owner's control\") → back on the OWNER's battlefield, a new object", () => {
    const s = cast(stealBears({ hand: [H("eph", EPHEMERATE)] }), "user", "eph", "bear");
    const back = permOfCard(s, "c-bear");
    expect(back.pid).toBe("ai");
    expect(back.perm.id).not.toBe("bear");
  });

  it("Cloudshift (\"under your control\") → the thief keeps the NEW object for good (CR 400.7) — still the AI's to own, so it dies home", () => {
    let s = cast(stealBears({ hand: [H("cs", CLOUDSHIFT), H("bolt", LIGHTNING_BOLT)] }), "user", "cs", "bear");
    const back = permOfCard(s, "c-bear");
    expect({ pid: back.pid, owner: back.perm.owner, eot: back.perm.controlUntilEndOfTurn }).toEqual({ pid: "user", owner: "ai", eot: undefined });
    s = finishCleanupActions(s);                                   // the Act of Treason end-of-turn revert does not reach the new object
    expect(permOfCard(s, "c-bear").pid).toBe("user");
    s = cast(refill(s, "user"), "user", "bolt", back.perm.id);
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });
});

// ── unstolen permanents ────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⛔ unstolen permanents are unchanged", () => {
  it("your own creature dies into YOUR graveyard; an opponent's own creature into THEIRS", () => {
    let s = board({ user: [P("mine", "user", GRIZZLY_BEARS)], ai: [P("theirs", "ai", GRIZZLY_BEARS)], hand: [H("b1", LIGHTNING_BOLT), H("b2", LIGHTNING_BOLT)] });
    s = cast(s, "user", "b1", "mine");
    s = cast(s, "user", "b2", "theirs");
    expect({ mine: where(s, "c-mine"), theirs: where(s, "c-theirs") }).toEqual({ mine: "user.graveyard", theirs: "ai.graveyard" });
  });

  it("an opponent's own creature bounced goes to their hand", () => {
    const s = cast(board({ ai: [P("theirs", "ai", GRIZZLY_BEARS)], hand: [H("uns", UNSUMMON)] }), "user", "uns", "theirs");
    expect(where(s, "c-theirs")).toBe("ai.hand");
  });
});

// ── tokens ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("tokens — the owner is the player who created it (CR 111.2)", () => {
  /** The AI makes two Soldiers (a real Raise the Alarm at instant speed); the user steals one with Act of Treason. */
  const stolenSoldier = (extra = {}) => {
    let s = board({ aiHand: [H("rta", RAISE_THE_ALARM)], hand: [H("aot", ACT_OF_TREASON), ...(extra.hand || [])], ai: extra.ai || [] });
    s = withPriority(cast(withPriority(s, "ai"), "ai", "rta"), "user");
    const token = s.players.ai.battlefield.find((p) => p.card?.token);
    return { s: cast(s, "user", "aot", token.id), token };
  };

  it("a stolen token carries its creator as owner; one never stolen carries no owner field", () => {
    const { s, token } = stolenSoldier();
    expect(findPermanent(s, token.id)).toMatchObject({ controller: "user", permanent: { owner: "ai" } });
    expect("owner" in s.players.ai.battlefield.find((p) => p.card?.token)).toBe(false);
  });

  it("Homeward Path (the creator's) brings the stolen token home", () => {
    const { s, token } = stolenSoldier({ ai: [P("path", "ai", HOMEWARD_PATH)] });
    // The engine offers activations in the acting seat's own main phase (legalChoices' activation window), so it is the AI's turn.
    const out = act(withPriority(s, "ai", { activePlayer: "ai" }), "ai", (a) => a.kind === "activate-ability" && a.permanentId === "path", "Homeward Path");
    expect(findPermanent(out, token.id).controller).toBe("ai");
  });

  it("⛔ a bounced stolen token ceases to exist (CR 111.7) — it reaches nobody's hand", () => {
    const { s, token } = stolenSoldier({ hand: [H("uns", UNSUMMON)] });
    const out = cast(s, "user", "uns", token.id);
    expect(where(out, token.card.id)).toBe("nowhere");
    expect(findPermanent(out, token.id)).toBe(null);
  });
});

// ── more than one control change ───────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ more than one control change — the owner never moves", () => {
  it("two seats: Control Magic, the Aura destroyed (home), Act of Treason, sacrificed → the owner's graveyard", () => {
    let s = board({ user: [P("seer", "user", VISCERA_SEER)], ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("cm", CONTROL_MAGIC), H("aot", ACT_OF_TREASON)], aiHand: [H("dis", DISENCHANT)] });
    s = cast(s, "user", "cm", "bear");
    const aura = s.players.user.battlefield.find((p) => p.card?.id === "cm");
    s = cast(withPriority(s, "ai"), "ai", "dis", aura.id);
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "ai", permanent: { controller: "ai", owner: "ai" } }); // home — the stamp stays, equal to its controller
    s = cast(withPriority(s, "user"), "user", "aot", "bear");
    s = sacrificeTo(s, "user", "seer", "bear");
    expect(where(s, "c-bear")).toBe("ai.graveyard");
  });

  it("a reanimated creature (the AI's card, the user's to control) taken back by its owner until end of turn: it reverts to the user and stays the AI's", () => {
    let s = board({ hand: [H("rean", REANIMATE), H("bolt", LIGHTNING_BOLT)], aiHand: [H("aot", ACT_OF_TREASON)] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, graveyard: [H("c-giant", HILL_GIANT)] } } };
    s = cast(s, "user", "rean", "c-giant");
    const giant = permOfCard(s, "c-giant").perm;
    expect(giant).toMatchObject({ controller: "user", owner: "ai" });               // the cross-player entry stamps the owner
    s = cast(withPriority(s, "ai", { activePlayer: "ai" }), "ai", "aot", giant.id);
    // The original controller (where the revert sends it) and the owner are DIFFERENT players here.
    expect(findPermanent(s, giant.id)).toMatchObject({ controller: "ai", permanent: { owner: "ai", controlOriginal: "user" } });
    s = finishCleanupActions(s);
    expect(findPermanent(s, giant.id)).toMatchObject({ controller: "user", permanent: { owner: "ai" } });
    s = cast(refill(withPriority({ ...s, activePlayer: "user" }, "user"), "user"), "user", "bolt", giant.id);
    expect(where(s, "c-giant")).toBe("ai.graveyard");
  });

  it("…and the same taken back with Control Magic: when the Aura goes (the stash still on it as it moves) it reverts to the user and stays the AI's", () => {
    let s = board({ hand: [H("rean", REANIMATE), H("dis", DISENCHANT), H("bolt", LIGHTNING_BOLT)], aiHand: [H("cm", CONTROL_MAGIC)] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, graveyard: [H("c-giant", HILL_GIANT)] } } };
    s = cast(s, "user", "rean", "c-giant");
    const giant = permOfCard(s, "c-giant").perm;
    s = cast(withPriority(s, "ai", { activePlayer: "ai" }), "ai", "cm", giant.id);
    expect(findPermanent(s, giant.id)).toMatchObject({ controller: "ai", permanent: { owner: "ai", controlOriginal: "user" } });
    const aura = s.players.ai.battlefield.find((p) => p.card?.id === "cm");
    s = cast(withPriority(s, "user", { activePlayer: "user" }), "user", "dis", aura.id);
    expect(findPermanent(s, giant.id)).toMatchObject({ controller: "user", permanent: { owner: "ai" } });
    s = cast(s, "user", "bolt", giant.id);
    expect(where(s, "c-giant")).toBe("ai.graveyard");
  });

  it("a four-seat pod: ai2's creature taken by the user (Control Magic), then by ai1 (Act of Treason), sacrificed by ai1 → ai2's graveyard", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    let s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [H("cm", CONTROL_MAGIC)], manaPool: { ...s0.players.user.manaPool, ...POOL }, library: library("u") },
        ai1: { ...s0.players.ai1, hand: [H("aot", ACT_OF_TREASON)], battlefield: [P("seer", "ai1", VISCERA_SEER)], manaPool: { ...s0.players.ai1.manaPool, ...POOL }, library: library("a") },
        ai2: { ...s0.players.ai2, battlefield: [P("bear", "ai2", GRIZZLY_BEARS)], library: library("b") },
        ai3: { ...s0.players.ai3, library: library("c") } } };
    s = cast(s, "user", "cm", "bear");
    s = cast(withPriority(s, "ai1", { activePlayer: "ai1" }), "ai1", "aot", "bear");
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "ai1", permanent: { owner: "ai2" } });
    s = sacrificeTo(s, "ai1", "seer", "bear");
    expect(where(s, "c-bear")).toBe("ai2.graveyard");
  });
});

// ── the until-end-of-turn steal reverting ──────────────────────────────────────────────────────────────────────────────────
describe("the until-end-of-turn steal reverting (CR 514.2)", () => {
  it("the cleanup step sends it home with its owner intact, and a later steal still routes every exit home", () => {
    let s = stealBears({ hand: [H("aot2", ACT_OF_TREASON), H("uns", UNSUMMON)] });
    s = finishCleanupActions(s);
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "ai", permanent: { owner: "ai" } });
    expect(findPermanent(s, "bear").permanent.controlUntilEndOfTurn).toBeUndefined();
    s = refill(withPriority({ ...s, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user" }, "user"), "user");
    s = cast(s, "user", "aot2", "bear");
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "user", permanent: { owner: "ai" } });
    s = cast(s, "user", "uns", "bear");
    expect(where(s, "c-bear")).toBe("ai.hand");
  });
});

// ── the readers ────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ the readers that name the OWNER", () => {
  it("Homeward Path — \"each player gains control of all creatures they own\" — finds a creature Control Magic took", () => {
    let s = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS), P("path", "ai", HOMEWARD_PATH)], hand: [H("cm", CONTROL_MAGIC)] }), "user", "cm", "bear");
    s = act(withPriority(s, "ai", { activePlayer: "ai" }), "ai", (a) => a.kind === "activate-ability" && a.permanentId === "path", "Homeward Path");
    expect(findPermanent(s, "bear").controller).toBe("ai");
  });

  it("Sword of Hearth and Home — \"target creature you own\" — offers your creature an opponent took, and brings it home", () => {
    let s = board({ user: [P("bear", "user", GRIZZLY_BEARS), P("w", "user", HILL_GIANT), P("sw", "user", SWORD_OF_HEARTH_AND_HOME)], aiHand: [H("cm", CONTROL_MAGIC)] });
    s = attachPermanent(s, { equipId: "sw", targetId: "w" });
    s = cast(withPriority(s, "ai", { activePlayer: "ai" }), "ai", "cm", "bear");
    expect(findPermanent(s, "bear")).toMatchObject({ controller: "ai", permanent: { owner: "user" } });
    s = withPriority({ ...s, activePlayer: "user", phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai" }], blockers: [] } }, "user");
    let offered = [];
    const pickTheStolenBear = (cands) => { offered = cands.flatMap((c) => (c.targets || []).map((t) => t.id)); return cands.find((c) => (c.targets || []).some((t) => t.id === "bear")); };
    s = settle(resolveCombatDamage(s), pickTheStolenBear);
    expect(offered).toContain("bear");
    expect(permOfCard(s, "c-bear").pid).toBe("user");
  });

  it("Reflector Mage — bounces the creature an opponent controls to ITS OWNER's hand, and locks THAT owner", () => {
    let s = cast(board({ ai: [P("bear", "ai", GRIZZLY_BEARS)], hand: [H("cm", CONTROL_MAGIC)], aiHand: [H("rm", REFLECTOR_MAGE)] }), "user", "cm", "bear");
    s = cast(withPriority({ ...s, turn: 5 }, "ai", { activePlayer: "ai" }), "ai", "rm");
    expect(where(s, "c-bear")).toBe("ai.hand");
    expect(s.nameCastLocks).toEqual([{ playerId: "ai", name: "Grizzly Bears", lockedBy: "ai", setTurn: 5 }]);
  });

  it("undying (CR 702.93a) — the stolen Young Wolf dies and returns under its OWNER's control with a +1/+1 counter", () => {
    let s = cast(board({ ai: [P("wolf", "ai", YOUNG_WOLF)], hand: [H("aot", ACT_OF_TREASON), H("bolt", LIGHTNING_BOLT)] }), "user", "aot", "wolf");
    s = cast(s, "user", "bolt", "wolf");
    const back = permOfCard(s, "c-wolf");
    expect({ pid: back?.pid, counters: back?.perm.counters }).toEqual({ pid: "ai", counters: { "+1/+1": 1 } });
  });

  it("persist (CR 702.79a) — the stolen Safehold Elite returns under its OWNER's control with a -1/-1 counter", () => {
    let s = cast(board({ ai: [P("elite", "ai", SAFEHOLD_ELITE)], hand: [H("aot", ACT_OF_TREASON), H("bolt", LIGHTNING_BOLT)] }), "user", "aot", "elite");
    s = cast(s, "user", "bolt", "elite");
    const back = permOfCard(s, "c-elite");
    expect({ pid: back?.pid, counters: back?.perm.counters }).toEqual({ pid: "ai", counters: { "-1/-1": 1 } });
  });

  it("\"return it to its owner's hand\" — the stolen Mortus Strider dies into the AI's graveyard and goes to the AI's hand", () => {
    let s = cast(board({ ai: [P("ms", "ai", MORTUS_STRIDER)], hand: [H("aot", ACT_OF_TREASON), H("bolt", LIGHTNING_BOLT)] }), "user", "aot", "ms");
    s = cast(s, "user", "bolt", "ms");
    expect(where(s, "c-ms")).toBe("ai.hand");
  });

  it("the Enduring return — the stolen Enduring Curiosity comes back under its OWNER's control, as an enchantment", () => {
    let s = cast(board({ ai: [P("ec", "ai", ENDURING_CURIOSITY)], hand: [H("aot", ACT_OF_TREASON), H("bolt", LIGHTNING_BOLT)] }), "user", "aot", "ec");
    s = cast(s, "user", "bolt", "ec");
    const back = permOfCard(s, "c-ec");
    expect({ pid: back?.pid, type: back?.perm.card.type }).toEqual({ pid: "ai", type: "Enchantment — Cat Glimmer" });
  });

  it("a granted dies-return (Supernatural Stamina, Feign Death) on the stolen creature returns it TAPPED under its OWNER's control", () => {
    for (const [card, counters] of [[SUPERNATURAL_STAMINA, {}], [FEIGN_DEATH, { "+1/+1": 1 }]]) {
      _resetIdsForTests();
      let s = cast(stealBears({ user: [P("seer", "user", VISCERA_SEER)], hand: [H("grant", card)] }), "user", "grant", "bear");
      s = sacrificeTo(s, "user", "seer", "bear");
      const back = permOfCard(s, "c-bear");
      expect({ card: card.name, pid: back?.pid, tapped: back?.perm.tapped, counters: back?.perm.counters }).toEqual({ card: card.name, pid: "ai", tapped: true, counters });
    }
  });

  it("⭐ commander ownership — a stolen commander dies into its OWNER's graveyard and the CR 903.9a return is the owner's, never the thief's", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [], aiCommanders: [H("c-isa", ISAMARU)] });
    let s = { ...s0, turn: 4, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [H("aot", ACT_OF_TREASON), H("bolt", LIGHTNING_BOLT)], manaPool: { ...s0.players.user.manaPool, ...POOL }, library: library("ul") },
        ai: { ...s0.players.ai, manaPool: { ...s0.players.ai.manaPool, ...POOL }, library: library("al") } } };
    s = cast(s, "ai", "c-isa");                                     // the AI casts its commander from the command zone
    const commander = permOfCard(s, "c-isa").perm;
    s = withPriority({ ...s, activePlayer: "user" }, "user");
    s = cast(s, "user", "aot", commander.id);
    s = cast(s, "user", "bolt", commander.id);
    expect(where(s, "c-isa")).toBe("ai.graveyard");
    const r = returnCommandersToZone(s);
    expect({ where: where(r, "c-isa"), offeredToTheThief: r.pendingChoice?.kind ?? null }).toEqual({ where: "ai.command", offeredToTheThief: null });
  });
});

// ── the battlefield self-shuffle ───────────────────────────────────────────────────────────────────────────────────────────
describe("\"shuffle this into its owner's library\" on a permanent another player owns goes through the battlefield exit", () => {
  /** The user reanimates the AI's Fblthp (owner ai) and equips Bonesplitter to it — an ability, so Fblthp's spell trigger stays quiet. */
  const reanimatedFblthp = (s) => {
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, graveyard: [H("c-fb", FBLTHP)] } } };
    s = cast(s, "user", "rean", "c-fb");
    const fb = permOfCard(s, "c-fb").perm;
    s = act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "bs" && (a.targets || []).some((t) => t.id === fb.id), "equip Bonesplitter");
    return { s, fb };
  };

  it("the AI targets it with a spell → into the OWNER's library, shuffled there, and the Equipment comes off (CR 301.5c — it stays, unattached)", () => {
    let { s, fb } = reanimatedFblthp(board({ user: [P("bs", "user", BONESPLITTER)], hand: [H("rean", REANIMATE)], aiHand: [H("bolt", LIGHTNING_BOLT)] }));
    expect(fb.owner).toBe("ai");
    expect(s.players.user.battlefield.find((p) => p.id === "bs").attachedTo).toBe(fb.id);
    const ids = (st, pid) => st.players[pid].library.map((c) => c.id);
    const userLibrary = ids(s, "user");
    const unshuffledAiLibrary = [...ids(s, "ai"), "c-fb"];         // where a plain append would leave it
    expect(s.nonlandLeftBattlefieldTurn).toBeUndefined();
    s = cast(withPriority(s, "ai"), "ai", "bolt", fb.id);
    expect(where(s, "c-fb")).toBe("ai.library");
    // A real battlefield exit: the chokepoint records it (the turn's nonland-left stamp, read by the "if a nonland permanent
    // left the battlefield this turn" condition) and takes the Equipment off.
    expect(s.nonlandLeftBattlefieldTurn).toBe(s.turn);
    expect(s.players.user.battlefield.find((p) => p.id === "bs").attachedTo).toBe(null);
    expect([...s.log].reverse().find((e) => e.effect === "shuffle-self-into-library")).toMatchObject({ owner: "ai" });
    // The OWNER's library is the one shuffled; the controller's is untouched.
    expect([...ids(s, "ai")].sort()).toEqual([...unshuffledAiLibrary].sort());
    expect(ids(s, "ai")).not.toEqual(unshuffledAiLibrary);
    expect(ids(s, "user")).toEqual(userLibrary);
  });

  it("⛔ an owner who has left the game: the card falls back to its controller's library, and THAT library is the one shuffled", () => {
    // The board removePlayerFromGame leaves behind (learnSession — the seat's record is dropped; a permanent it owned on another
    // battlefield keeps its stamp): ai2's Fblthp under the user's control, ai2 gone.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const { ai2: _gone, ...players } = s0.players;
    let s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "ai1", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
      turnOrder: s0.turnOrder.filter((p) => p !== "ai2"), rngSeed: 7,
      players: { ...players,
        user: { ...players.user, battlefield: [P("fb", "user", FBLTHP, { owner: "ai2" })], library: library("u") },
        ai1: { ...players.ai1, hand: [H("bolt", LIGHTNING_BOLT)], manaPool: { ...players.ai1.manaPool, ...POOL }, library: library("a") } } };
    const out = cast(s, "ai1", "bolt", "fb");
    expect(where(out, "c-fb")).toBe("user.library");
    expect(Object.keys(out.players).sort()).toEqual(["ai1", "ai3", "user"]);
    expect([...out.log].reverse().find((e) => e.effect === "shuffle-self-into-library")).toMatchObject({ owner: "user" });
    expect(out.rngSeed).not.toBe(7);                               // the shuffle ran (the seeded RNG advanced)
  });
});
