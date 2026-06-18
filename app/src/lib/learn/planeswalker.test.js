/**
 * Planeswalker / loyalty subsystem (PW-1) — the framework foundation.
 *
 * Covers the whole loyalty machinery end-to-end: parsing loyalty abilities (`[+N]/[−N]/[0]:`),
 * the all-or-nothing native-coverage gate, starting loyalty at ETB, the loyalty-ability offer +
 * dispatch (sorcery-speed, once-per-turn CR 606.3, −N affordability CR 118.3), the 0-loyalty SBA
 * (CR 704.5i), attacking a planeswalker, and combat damage removing loyalty (CR 120.3c).
 *
 * Synthetic walkers use confirmed-HIGH effect clauses so the fixtures are genuinely native; the
 * corpus pins at the end assert real cards (Jace/Jaya/Sorin/Tibalt) stay on the Arbiter (CREED).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import {
  _resetIdsForTests, createGameState, createPermanent, findPermanent,
  isPlaneswalker, castsAsPlaneswalker, startingLoyalty, adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers, untapAll,
} from "./gameState.js";
import { parseLoyaltyAbilities, planeswalkerNativelyCovered, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { classifyCard } from "./coverage.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ── Fixtures ──────────────────────────────────────────────────────────────────
const pw = (name, oracle, over = {}) =>
  ({ id: `card-${name}`, name, type: "Legendary Planeswalker — Test", loyalty: "3", mana: "", oracle, ...over });
const creature = (name, over = {}) =>
  ({ id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", ...over });

// A genuinely-native walker: pure loyalty abilities, every effect HIGH, no residue.
const NATIVE_ORACLE = "+1: Draw a card.\n−2: Destroy target creature."; // − = Unicode minus

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", startingPlayer: "user", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
// A planeswalker permanent with its loyalty counter set (createPermanent alone doesn't set it —
// enterPermanent does; tests that place one directly use this).
function pwPerm(id, card, controller, loyalty = 3) {
  const p = createPermanent({ id, card, controller, summoningSick: false });
  return { ...p, counters: { ...p.counters, loyalty } };
}
const loyaltyActions = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "activate-loyalty");
const attackActions = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "declare-attacker");

// ── Parsing + card-shape reads ──────────────────────────────────────────────────
describe("planeswalker card-shape reads", () => {
  it("isPlaneswalker matches the type line and a DFC planeswalker face", () => {
    expect(isPlaneswalker(pw("A", ""))).toBe(true);
    expect(isPlaneswalker(creature("Bear"))).toBe(false);
    expect(isPlaneswalker({ name: "Flip", type: "Creature — Wizard", card_faces: [{ type_line: "Creature — Wizard" }, { type_line: "Legendary Planeswalker — Jace", loyalty: "5" }] })).toBe(true);
  });

  it("startingLoyalty reads the printed number, a DFC face, and rejects non-numeric", () => {
    expect(startingLoyalty(pw("A", "", { loyalty: "4" }))).toBe(4);
    expect(startingLoyalty(pw("A", "", { loyalty: "X" }))).toBeNull();
    expect(startingLoyalty({ type: "Creature", card_faces: [{ type_line: "Creature" }, { type_line: "Planeswalker — Jace", loyalty: "5" }] })).toBe(5);
  });
});

describe("parseLoyaltyAbilities", () => {
  it("parses +N / −N (Unicode) / 0 costs and effect clauses", () => {
    const abs = parseLoyaltyAbilities(pw("A", "+2: Draw a card.\n0: You gain 3 life.\n−3: Destroy target creature."));
    expect(abs.map((a) => a.costDelta)).toEqual([2, 0, -3]);
    expect(abs.every((a) => a.modeled)).toBe(true);
    expect(abs[2].needsTarget).toBe(true);
  });

  it("accepts an ASCII-hyphen minus too", () => {
    const abs = parseLoyaltyAbilities(pw("A", "-1: Draw a card."));
    expect(abs).toHaveLength(1);
    expect(abs[0].costDelta).toBe(-1);
  });

  it("leaves an unmodeled ability un-modeled (an emblem ultimate)", () => {
    const abs = parseLoyaltyAbilities(pw("A", "+1: Draw a card.\n−6: You get an emblem with \"Creatures you control get +2/+2.\""));
    expect(abs[0].modeled).toBe(true);
    expect(abs[1].modeled).toBe(false);
  });

  it("does NOT treat an −X loyalty line as a recognized ability (stays a residue line)", () => {
    // \d+ only — an −X cost can't be paid by the framework, so the line is unrecognized.
    expect(parseLoyaltyAbilities(pw("A", "−X: Deal X damage."))).toHaveLength(0);
  });
});

describe("planeswalkerNativelyCovered (the all-or-nothing CREED gate)", () => {
  it("is true for a pure-loyalty walker whose every ability is modeled", () => {
    expect(planeswalkerNativelyCovered(pw("Native", NATIVE_ORACLE))).toBe(true);
  });
  it("is false when an unmodeled static/triggered line is present (residue)", () => {
    expect(planeswalkerNativelyCovered(pw("Staty", "Creatures you control get +1/+1.\n+1: Draw a card."))).toBe(false);
  });
  it("is false when any single loyalty ability is unmodeled", () => {
    expect(planeswalkerNativelyCovered(pw("Ulty", "+1: Draw a card.\n−6: You get an emblem with \"X\"."))).toBe(false);
  });
  it("is false for a non-planeswalker and for non-numeric loyalty", () => {
    expect(planeswalkerNativelyCovered(creature("Bear"))).toBe(false);
    expect(planeswalkerNativelyCovered(pw("Xloy", NATIVE_ORACLE, { loyalty: "X" }))).toBe(false);
  });
});

// ── ETB: starting loyalty ───────────────────────────────────────────────────────
describe("planeswalker enters with starting loyalty (CR 306.5b)", () => {
  it("sets counters.loyalty from the printed value", () => {
    const s = enterPermanent(mainState(), pw("Native", NATIVE_ORACLE, { loyalty: "5" }), "user");
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Native");
    expect(perm.counters.loyalty).toBe(5);
  });
});

// ── SBA + adjustLoyalty ─────────────────────────────────────────────────────────
describe("adjustLoyalty + the 0-loyalty SBA (CR 704.5i)", () => {
  it("adjustLoyalty keeps the loyalty key present even at 0", () => {
    let s = withBattlefield(mainState(), "user", [pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 2)]);
    s = adjustLoyalty(s, { permanentId: "perm-w", delta: -2 });
    expect(findPermanent(s, "perm-w").permanent.counters.loyalty).toBe(0);
  });
  it("puts a 0-loyalty planeswalker into the graveyard; leaves a positive one", () => {
    let s = withBattlefield(mainState(), "user", [
      pwPerm("perm-dead", pw("Dead", NATIVE_ORACLE), "user", 0),
      pwPerm("perm-live", pw("Live", NATIVE_ORACLE), "user", 1),
    ]);
    const { state: next, dead } = destroyZeroLoyaltyPlaneswalkers(s);
    expect(dead.map((d) => d.name)).toEqual(["Dead"]);
    expect(next.players.user.battlefield.map((p) => p.id)).toEqual(["perm-live"]);
    expect(next.players.user.graveyard.map((c) => c.name)).toEqual(["Dead"]);
  });
  it("never kills a planeswalker that has no loyalty counter (non-numeric loyalty)", () => {
    const bare = createPermanent({ id: "perm-bare", card: pw("Bare", NATIVE_ORACLE), controller: "user" });
    const s = withBattlefield(mainState(), "user", [bare]);
    expect(destroyZeroLoyaltyPlaneswalkers(s).dead).toHaveLength(0);
  });
});

// ── Loyalty-ability offer ───────────────────────────────────────────────────────
describe("loyalty-ability offer (legalChoices)", () => {
  it("offers the modeled abilities of a native walker at sorcery speed", () => {
    const walker = pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3);
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin"), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [walker]);
    s = withBattlefield(s, "ai", [enemy]);
    const acts = loyaltyActions(s);
    expect(acts.some((a) => a.costDelta === 1)).toBe(true);               // +1 draw (no target)
    expect(acts.some((a) => a.costDelta === -2 && a.targets[0]?.id === "perm-e")).toBe(true); // −2 destroy the enemy
  });

  it("does NOT offer a −N ability when loyalty is too low (CR 118.3)", () => {
    const walker = pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 1); // can't pay −2
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin"), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [walker]);
    s = withBattlefield(s, "ai", [enemy]);
    const acts = loyaltyActions(s);
    expect(acts.some((a) => a.costDelta === -2)).toBe(false);
    expect(acts.some((a) => a.costDelta === 1)).toBe(true); // +1 still fine
  });

  it("offers nothing once a loyalty ability was activated this turn (CR 606.3)", () => {
    const walker = { ...pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3), loyaltyActivatedThisTurn: true };
    const s = withBattlefield(mainState(), "user", [walker]);
    expect(loyaltyActions(s)).toHaveLength(0);
  });

  it("is sorcery-speed only (not on the opponent's turn, not with a non-empty stack)", () => {
    const walker = pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3);
    expect(loyaltyActions(withBattlefield(mainState({ activePlayer: "ai", priorityHolder: "ai" }), "user", [walker]))).toHaveLength(0);
    expect(loyaltyActions(withBattlefield(mainState({ stack: [{ id: "x" }] }), "user", [walker]))).toHaveLength(0);
  });

  it("does NOT offer abilities for a partially-modeled (non-native) walker", () => {
    const walker = pwPerm("perm-w", pw("Staty", "Creatures you control get +1/+1.\n+1: Draw a card."), "user", 3);
    expect(loyaltyActions(withBattlefield(mainState(), "user", [walker]))).toHaveLength(0);
  });
});

// ── Loyalty-ability dispatch ────────────────────────────────────────────────────
describe("loyalty-ability dispatch (actionDispatcher)", () => {
  it("+1 raises loyalty, marks the walker used, and resolves the effect (draw)", () => {
    let s = withBattlefield(mainState(), "user", [pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3)]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "lib1", name: "Card", type: "Instant" }] } } };
    const plus = loyaltyActions(s).find((a) => a.costDelta === 1);
    s = dispatchAction(s, plus);
    const perm = findPermanent(s, "perm-w").permanent;
    expect(perm.counters.loyalty).toBe(4);
    expect(perm.loyaltyActivatedThisTurn).toBe(true);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.players.user.hand.map((c) => c.id)).toContain("lib1");
  });

  it("−N to exactly 0 puts the walker in the graveyard but the ability still resolves", () => {
    // −3 (re-using the destroy ability slot) on a 3-loyalty walker → 0 → dies, but the destroy resolves.
    const walker = pwPerm("perm-w", pw("W", "+1: Draw a card.\n−3: Destroy target creature."), "user", 3);
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin"), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [walker]);
    s = withBattlefield(s, "ai", [enemy]);
    const ult = loyaltyActions(s).find((a) => a.costDelta === -3);
    s = dispatchAction(s, ult);
    // Walker already left as an SBA the moment loyalty hit 0…
    expect(findPermanent(s, "perm-w")).toBeNull();
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("W");
    // …but its ability is on the stack and resolves, destroying the enemy.
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(findPermanent(s, "perm-e")).toBeNull();
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Goblin");
  });

  it("rejects a second loyalty activation in the same turn", () => {
    const walker = { ...pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3), loyaltyActivatedThisTurn: true };
    const s = withBattlefield(mainState(), "user", [walker]);
    expect(() => dispatchAction(s, { kind: "activate-loyalty", playerId: "user", permanentId: "perm-w", costDelta: 1, program: parseLoyaltyAbilities(walker.card)[0].program, targets: [] }))
      .toThrow(/already activated/i);
  });
});

describe("the once-per-turn loyalty flag resets at untap", () => {
  it("untapAll clears loyaltyActivatedThisTurn for the active player", () => {
    const walker = { ...pwPerm("perm-w", pw("W", NATIVE_ORACLE), "user", 3), loyaltyActivatedThisTurn: true };
    const s = untapAll(withBattlefield(mainState(), "user", [walker]), { playerId: "user" });
    expect(findPermanent(s, "perm-w").permanent.loyaltyActivatedThisTurn).toBe(false);
  });
});

// ── Combat: attacking a planeswalker ────────────────────────────────────────────
describe("attacking a planeswalker", () => {
  it("offers an attack at an enemy planeswalker AND at the player's face", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Attacker"), controller: "user", summoningSick: false });
    const enemyPw = pwPerm("perm-pw", pw("EnemyPW", NATIVE_ORACLE), "ai", 3);
    let s = withBattlefield(mainState({ phase: "combat", step: "declare-attackers" }), "user", [attacker]);
    s = withBattlefield(s, "ai", [enemyPw]);
    const acts = attackActions(s);
    expect(acts.some((a) => a.defenderId === "ai" && !a.defenderPlaneswalkerId)).toBe(true); // face
    expect(acts.some((a) => a.defenderPlaneswalkerId === "perm-pw")).toBe(true);             // the walker
  });

  it("keeps the simple Standard shape when there's no enemy planeswalker", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Attacker"), controller: "user", summoningSick: false });
    const s = withBattlefield(mainState({ phase: "combat", step: "declare-attackers" }), "user", [attacker]);
    const acts = attackActions(s);
    expect(acts).toHaveLength(1);
    expect(acts[0].defenderId).toBeUndefined();
  });

  it("combat damage removes loyalty from the attacked walker, not life from its controller", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Attacker", { power: 2, toughness: 2 }), controller: "user", summoningSick: false });
    const enemyPw = pwPerm("perm-pw", pw("EnemyPW", NATIVE_ORACLE), "ai", 3);
    let s = withBattlefield(mainState({ phase: "combat", step: "combat-damage" }), "user", [attacker]);
    s = withBattlefield(s, "ai", [enemyPw]);
    const lifeBefore = s.players.ai.life;
    s = { ...s, combat: { attackers: [{ permanentId: "perm-a", attackingPlayer: "user", defender: "ai", defenderPlaneswalkerId: "perm-pw" }], blockers: [] } };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "perm-pw").permanent.counters.loyalty).toBe(1); // 3 − 2
    expect(s.players.ai.life).toBe(lifeBefore);                              // life untouched
  });

  it("lethal combat damage kills the walker (0 loyalty SBA)", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Big", { power: 4, toughness: 4 }), controller: "user", summoningSick: false });
    const enemyPw = pwPerm("perm-pw", pw("EnemyPW", NATIVE_ORACLE), "ai", 3);
    let s = withBattlefield(mainState({ phase: "combat", step: "combat-damage" }), "user", [attacker]);
    s = withBattlefield(s, "ai", [enemyPw]);
    s = { ...s, combat: { attackers: [{ permanentId: "perm-a", attackingPlayer: "user", defender: "ai", defenderPlaneswalkerId: "perm-pw" }], blockers: [] } };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "perm-pw")).toBeNull();
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("EnemyPW");
  });

  it("a blocked attacker (no trample) deals to the blocker, leaving the walker's loyalty intact", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Attacker", { power: 2, toughness: 2 }), controller: "user", summoningSick: false });
    const blocker = createPermanent({ id: "perm-b", card: creature("Blocker", { power: 1, toughness: 3 }), controller: "ai", summoningSick: false });
    const enemyPw = pwPerm("perm-pw", pw("EnemyPW", NATIVE_ORACLE), "ai", 3);
    let s = withBattlefield(mainState({ phase: "combat", step: "combat-damage" }), "user", [attacker]);
    s = withBattlefield(s, "ai", [blocker, enemyPw]);
    s = { ...s, combat: { attackers: [{ permanentId: "perm-a", attackingPlayer: "user", defender: "ai", defenderPlaneswalkerId: "perm-pw" }], blockers: [{ blockerId: "perm-b", blockingPlayer: "ai", attackerId: "perm-a" }] } };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "perm-pw").permanent.counters.loyalty).toBe(3); // untouched
    expect(findPermanent(s, "perm-b").permanent.damageMarked).toBe(2);
  });
});

// ── Cast path gating ────────────────────────────────────────────────────────────
describe("casting a planeswalker", () => {
  it("a native walker enters the battlefield with its loyalty", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [pw("Native", NATIVE_ORACLE, { loyalty: "4" })] } } };
    s = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "card-Native", cost: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Native");
    expect(perm).toBeTruthy();
    expect(perm.counters.loyalty).toBe(4);
  });

  it("a partially-modeled walker routes to the Arbiter seam and does NOT enter (CREED)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [pw("Staty", "Creatures you control get +1/+1.\n+1: Draw a card.")] } } };
    s = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "card-Staty", cost: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Staty")).toBeUndefined();
  });
});

// ── PW-2 HYBRID: pure-loyalty walkers are playable; unmodeled abilities route to the Arbiter ──
describe("PW-2 hybrid — planeswalkerPlayable", () => {
  // +1 draw is modeled; −6 emblem is not. Pure-loyalty (no static/trigger residue) → playable.
  const HYBRID = "+1: Draw a card.\n−6: You get an emblem with \"Creatures you control get +2/+2.\"";
  it("is true for a pure-loyalty walker even when some abilities are unmodeled", () => {
    expect(planeswalkerPlayable(pw("Hybrid", HYBRID, { loyalty: "4" }))).toBe(true);
    expect(planeswalkerNativelyCovered(pw("Hybrid", HYBRID, { loyalty: "4" }))).toBe(false); // not ALL modeled
  });
  it("is false when there's an unmodeled static/triggered line (residue)", () => {
    expect(planeswalkerPlayable(pw("Staty", "Creatures you control get +1/+1.\n+1: Draw a card."))).toBe(false);
  });
  it("is false for a non-planeswalker and non-numeric loyalty", () => {
    expect(planeswalkerPlayable(creature("Bear"))).toBe(false);
    expect(planeswalkerPlayable(pw("X", HYBRID, { loyalty: "X" }))).toBe(false);
  });
});

describe("PW-2 hybrid — offer surfaces every ability (modeled native, unmodeled → Arbiter)", () => {
  const HYBRID = "+1: Draw a card.\n−6: You get an emblem with \"X\".";
  it("offers both the modeled +1 (native) and the unmodeled −6 (Arbiter-routed)", () => {
    const walker = pwPerm("perm-w", pw("Hybrid", HYBRID), "user", 6); // 6 loyalty so the −6 is payable
    const acts = loyaltyActions(withBattlefield(mainState(), "user", [walker]));
    const plus = acts.find((a) => a.costDelta === 1);
    const ult = acts.find((a) => a.costDelta === -6);
    expect(plus.program).toBeTruthy();          // modeled → native effect program
    expect(plus.routeToArbiter).toBeFalsy();
    expect(ult).toMatchObject({ routeToArbiter: true, program: null, targets: [] });
  });
  it("the −N affordability gate applies to Arbiter-routed abilities too", () => {
    const walker = pwPerm("perm-w", pw("Hybrid", "+1: Draw a card.\n−3: You get an emblem with \"X\"."), "user", 2);
    const acts = loyaltyActions(withBattlefield(mainState(), "user", [walker]));
    expect(acts.some((a) => a.costDelta === -3)).toBe(false); // 2 loyalty < 3
    expect(acts.some((a) => a.costDelta === 1)).toBe(true);
  });
});

describe("PW-2 hybrid — dispatch routes an unmodeled ability to the Arbiter (cost paid first)", () => {
  it("pays the loyalty cost, marks it used, then flags pendingArbiter on resolution", () => {
    // Loyalty 8, −6 → 2 (survives, so we can inspect it post-dispatch).
    const walker = pwPerm("perm-w", pw("Hybrid", "+1: Draw a card.\n−6: You get an emblem with \"X\"."), "user", 8);
    let s = withBattlefield(mainState(), "user", [walker]);
    const ult = loyaltyActions(s).find((a) => a.costDelta === -6);
    s = dispatchAction(s, ult);
    expect(findPermanent(s, "perm-w").permanent.counters.loyalty).toBe(2); // 8 − 6, cost paid natively
    expect(findPermanent(s, "perm-w").permanent.loyaltyActivatedThisTurn).toBe(true);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.pendingArbiter).toBeTruthy();
    expect(s.pendingArbiter.reason).toMatch(/loyalty ability \(unmodeled/i);
  });
});

describe("PW-2 hybrid — cast gate uses playability", () => {
  it("a pure-loyalty walker with an unmodeled ability now ENTERS (hybrid), with its loyalty", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [pw("Hybrid", "+1: Draw a card.\n−6: You get an emblem with \"X\".", { loyalty: "4" })] } } };
    s = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "card-Hybrid", cost: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Hybrid");
    expect(perm?.counters.loyalty).toBe(4);
  });
  it("a walker with an unmodeled STATIC line still routes whole-card to the Arbiter (does NOT enter)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [pw("Staty", "Creatures you control get +1/+1.\n+1: Draw a card.")] } } };
    s = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "card-Staty", cost: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Staty")).toBeUndefined();
  });
  it("classifies a hybrid walker as playable-pw (not native, not arbiter-pw)", () => {
    expect(classifyCard({ type: "Legendary Planeswalker — Test", oracle: "+1: Draw a card.\n−6: You get an emblem with \"X\".", loyalty: "4", name: "Hybrid" })).toBe("playable-pw");
  });
});

// ── Creature-front double-faced cards (review P2.1) ──────────────────────────────
describe("creature-front DFCs cast as their creature side, not as a planeswalker", () => {
  const flip = {
    id: "card-flip", name: "Flipwalker",
    type: "Creature — Wizard // Legendary Planeswalker — Flip",
    power: 0, toughness: 2, loyalty: "5",
    oracle: "{T}: Draw a card, then discard a card.\n+1: Draw a card.",
    card_faces: [
      { type_line: "Creature — Wizard", oracle_text: "{T}: Draw a card, then discard a card." },
      { type_line: "Legendary Planeswalker — Flip", loyalty: "5", oracle_text: "+1: Draw a card." },
    ],
  };

  it("castsAsPlaneswalker reads the FRONT face (false here) though isPlaneswalker (any face) is true", () => {
    expect(isPlaneswalker(flip)).toBe(true);
    expect(castsAsPlaneswalker(flip)).toBe(false);
    expect(castsAsPlaneswalker(pw("Real", NATIVE_ORACLE))).toBe(true); // single-faced walker
    expect(castsAsPlaneswalker(creature("Bear"))).toBe(false);
  });

  it("classifies body-only (never native, never arbiter-pw) — its transform + back face are unmodeled", () => {
    const tier = classifyCard({ type: flip.type, oracle: flip.oracle, loyalty: flip.loyalty, card_faces: flip.card_faces, name: flip.name });
    expect(tier).toBe("body-only");
  });

  it("casts as a creature: enters the battlefield WITHOUT a loyalty counter", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [flip] } } };
    s = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "card-flip", cost: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Flipwalker");
    expect(perm).toBeTruthy();
    expect(perm.counters.loyalty).toBeUndefined();
  });

  it("an enemy creature-front DFC is NOT offered as an attackable planeswalker", () => {
    const attacker = createPermanent({ id: "perm-a", card: creature("Attacker"), controller: "user", summoningSick: false });
    const enemyFlip = createPermanent({ id: "perm-f", card: flip, controller: "ai", summoningSick: false }); // no loyalty counter
    let s = withBattlefield(mainState({ phase: "combat", step: "declare-attackers" }), "user", [attacker]);
    s = withBattlefield(s, "ai", [enemyFlip]);
    expect(attackActions(s).some((a) => a.defenderPlaneswalkerId === "perm-f")).toBe(false);
  });
});

// ── Corpus pins (CREED): real walkers and their honest tiers — NEVER native (no false positives) ──
describe("corpus pins — real planeswalkers classify correctly and never leak native", () => {
  const PINS = [
    // Static/triggered residue → the WHOLE card routes to the Arbiter (can't hybrid-route a static).
    { name: "Jaya, Venerated Firemage", type: "Legendary Planeswalker — Jaya", loyalty: "5", tier: "arbiter-pw",
      oracle: "If another red source you control would deal damage to a permanent or player, it deals that much damage plus 1 to that permanent or player instead.\n−2: Jaya deals 2 damage to any target." },
    { name: "Sorin, Vengeful Bloodlord", type: "Legendary Planeswalker — Sorin", loyalty: "4", tier: "arbiter-pw",
      oracle: "During your turn, creatures and planeswalkers you control have lifelink.\n+2: Sorin deals 1 damage to target player or planeswalker.\n−X: Return target creature card with mana value X from your graveyard to the battlefield." },
    // Pure-loyalty, none of its abilities modeled → PLAYABLE (PW-2 hybrid): it enters/ticks/dies and
    // every ability routes to the Arbiter at activation. Playable, but NOT counted native.
    { name: "Tibalt, the Fiend-Blooded", type: "Legendary Planeswalker — Tibalt", loyalty: "2", tier: "playable-pw",
      oracle: "+1: Draw a card, then discard a card at random.\n−4: Tibalt deals damage equal to the number of cards in target player's hand to that player.\n−6: Gain control of all creatures until end of turn. Untap them. They gain haste until end of turn." },
  ];
  for (const card of PINS) {
    it(`${card.name} → ${card.tier} (never native)`, () => {
      expect(planeswalkerNativelyCovered(card)).toBe(false);
      expect(classifyCard({ type: card.type, oracle: card.oracle, loyalty: card.loyalty, name: card.name })).toBe(card.tier);
    });
  }

  it("the synthetic fully-modeled walker classifies native-planeswalker (the positive pin)", () => {
    expect(classifyCard({ type: "Legendary Planeswalker — Test", oracle: NATIVE_ORACLE, loyalty: "3", name: "Native" })).toBe("native-planeswalker");
  });
});
