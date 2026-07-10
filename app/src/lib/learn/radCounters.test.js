/**
 * radCounters.test.js — RAD-COUNTERS subsystem (CR 728).
 *
 * Anchor: The Wise Mothman (Joe's deck) — "Whenever The Wise Mothman enters or attacks, each player gets a
 * rad counter." Rad is a player-level counter with an INHERENT triggered ability (CR 728.1): at the beginning
 * of a player's precombat main phase, if they have ≥1 rad counter, they mill that many cards; for each NONLAND
 * card milled this way they lose 1 life and remove one rad counter from themselves (lands milled cost nothing).
 *
 * Built here: the player-counter mutators (addRadCounters / removeRadCounters), the CR 728.1 resolver
 * (applyRadiation) with FRONT-FACE land detection (CR 712.8a — an MDFC whose back is a land is a NONLAND when
 * milled), the engine hook (runStepActions fires it for the active player at precombat-main only), the grant
 * atom + parser (each player / each opponent / you / target player|opponent — fixed-N only), coverage
 * (native-spell / native-trigger), atomTargetIntent (targeted rad is enemy-side), and proliferate (CR 701.34a
 * adds a rad counter to an opponent who has one). Mothman itself stays NON-native — its 3rd clause (variable-X
 * "+1/+1 on up to X target creatures … where X is the number of nonland cards milled") is unmodeled (safe FN).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, applyRadiation, addRadCounters, removeRadCounters } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { applyProliferate } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const nonland = (id) => ({ id, name: id, type: SORCERY, oracle: "Draw a card." });
const basicland = (id) => ({ id, name: id, type: "Basic Land — Forest" });
// MDFC whose BACK is a land (Malakir Rebirth // Malakir Mire = Instant // Land): NONLAND when milled (front face).
const mdfcLandBack = (id) => ({ id, name: id, type: SORCERY, card_faces: [{ type_line: "Instant" }, { type_line: "Land" }] });
// A type string joined as "Sorcery // Land" (no card_faces) — still NONLAND via the "//"-split front face.
const joinedLandBack = (id) => ({ id, name: id, type: "Sorcery // Land" });
// MDFC whose FRONT is a land: a LAND when milled.
const mdfcLandFront = (id) => ({ id, name: id, card_faces: [{ type_line: "Land — Forest" }, { type_line: "Creature — Elf" }] });
const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-l${i}`, name: `${prefix}Card${i}`, type: SORCERY, mana: "{1}", oracle: "Draw a card." }));

function radState({ library = [], radCounters = 0, life = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, radCounters, life, library } } };
}

// ─── gameState mutators ─────────────────────────────────────────────────────────
describe("RAD mutators — addRadCounters / removeRadCounters", () => {
  it("addRadCounters stacks; removeRadCounters floors at 0", () => {
    let s = radState({ radCounters: 0 });
    s = addRadCounters(s, { playerId: "user", amount: 3 });
    expect(s.players.user.radCounters).toBe(3);
    s = addRadCounters(s, { playerId: "user", amount: 2 });
    expect(s.players.user.radCounters).toBe(5);
    s = removeRadCounters(s, { playerId: "user", amount: 99 });
    expect(s.players.user.radCounters).toBe(0); // floored, never negative
  });
  it("a fresh player starts with 0 rad counters", () => {
    expect(createGameState({ userDeck: [], aiDeck: [] }).players.user.radCounters).toBe(0);
  });
});

// ─── applyRadiation (CR 728.1) ──────────────────────────────────────────────────
describe("applyRadiation — mill N; lose 1 life + remove 1 counter per NONLAND milled; lands free", () => {
  it("mills rad-count cards, drains 1 life + 1 counter per nonland, leaves lands free", () => {
    // top 3 of library = [nonland, nonland, land] → 2 nonland, 1 land
    const s = radState({ library: [nonland("n0"), nonland("n1"), basicland("L0"), nonland("n2")], radCounters: 3, life: 40 });
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["n0", "n1", "L0"]); // milled top 3
    expect(after.players.user.library.map((c) => c.id)).toEqual(["n2"]);
    expect(after.players.user.life).toBe(40 - 2);        // 2 nonland milled → lose 2
    expect(after.players.user.radCounters).toBe(3 - 2);  // remove 1 per nonland → 1 left
  });
  it("lands milled cost nothing (no life loss, no counter removal)", () => {
    const s = radState({ library: [basicland("L0"), basicland("L1"), nonland("n0")], radCounters: 2, life: 40 });
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["L0", "L1"]);
    expect(after.players.user.life).toBe(40);           // both milled were lands
    expect(after.players.user.radCounters).toBe(2);     // unchanged
  });
  it("0 rad counters is a clean no-op", () => {
    const s = radState({ library: [nonland("n0")], radCounters: 0, life: 40 });
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.library.length).toBe(1);
    expect(after.players.user.life).toBe(40);
    expect(after.players.user.radCounters).toBe(0);
  });
  it("a short library mills what it can — fewer nonlands → fewer counters removed (rad persists)", () => {
    const s = radState({ library: [nonland("n0"), nonland("n1")], radCounters: 5, life: 40 });
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.library.length).toBe(0);
    expect(after.players.user.life).toBe(40 - 2);        // only 2 nonlands available to mill
    expect(after.players.user.radCounters).toBe(5 - 2);  // 3 rad counters persist
  });
  it("an empty library is a clean no-op — the counters persist (CR-correct partial)", () => {
    const s = radState({ library: [], radCounters: 3, life: 40 });
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.life).toBe(40);
    expect(after.players.user.radCounters).toBe(3);
  });
  it("FRONT-FACE land detection: an MDFC whose BACK is a land is a NONLAND when milled", () => {
    const fromCardFaces = applyRadiation(radState({ library: [mdfcLandBack("m0")], radCounters: 1, life: 40 }), { playerId: "user" });
    expect(fromCardFaces.players.user.life).toBe(39);          // front face Instant → nonland → lose 1
    expect(fromCardFaces.players.user.radCounters).toBe(0);
    const fromJoined = applyRadiation(radState({ library: [joinedLandBack("j0")], radCounters: 1, life: 40 }), { playerId: "user" });
    expect(fromJoined.players.user.life).toBe(39);             // "Sorcery // Land" → front "Sorcery" → nonland
    expect(fromJoined.players.user.radCounters).toBe(0);
  });
  it("FRONT-FACE land detection: an MDFC whose FRONT is a land is a LAND when milled (free)", () => {
    const after = applyRadiation(radState({ library: [mdfcLandFront("f0")], radCounters: 1, life: 40 }), { playerId: "user" });
    expect(after.players.user.life).toBe(40);                  // front face Land → no drain
    expect(after.players.user.radCounters).toBe(1);
  });
});

// ─── engine hook (runStepActions) ───────────────────────────────────────────────
describe("RAD engine hook — radiation resolves at the active player's PRECOMBAT main only", () => {
  function hookState(phase, { userRad = 0, aiRad = 0 } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const players = {
      ...s.players,
      user: { ...s.players.user, radCounters: userRad, life: 40, library: [nonland("n0"), nonland("n1"), basicland("L0")] },
      ai: { ...s.players.ai, radCounters: aiRad, life: 40, library: [nonland("a0"), nonland("a1"), nonland("a2")] },
    };
    return { ...s, phase, step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
  }
  it("precombat-main 'main' step mills + drains the active player", () => {
    const after = runStepActions(hookState("precombat-main", { userRad: 3 }));
    expect(after.players.user.graveyard.length).toBe(3); // milled 3 (2 nonland + 1 land)
    expect(after.players.user.life).toBe(40 - 2);
    expect(after.players.user.radCounters).toBe(1);
    expect(after.log.some((e) => e.kind === "radiation")).toBe(true);
  });
  it("postcombat-main 'main' step does NOT resolve radiation (gated on phase)", () => {
    const after = runStepActions(hookState("postcombat-main", { userRad: 3 }));
    expect(after.players.user.graveyard.length).toBe(0);
    expect(after.players.user.life).toBe(40);
    expect(after.players.user.radCounters).toBe(3); // untouched
    expect(after.log.some((e) => e.kind === "radiation")).toBe(false);
  });
  it("only the ACTIVE player's rad resolves on their turn (CR 728.1 — each player on their OWN precombat main)", () => {
    const after = runStepActions(hookState("precombat-main", { userRad: 2, aiRad: 2 }));
    expect(after.players.user.radCounters).toBe(0);  // user active → resolved (2 nonland milled)
    expect(after.players.user.life).toBe(38);
    expect(after.players.ai.radCounters).toBe(2);    // ai not active → untouched
    expect(after.players.ai.life).toBe(40);
  });
});

// ─── parser ─────────────────────────────────────────────────────────────────────
describe("RAD parser — fixed-N grant forms; variable / 'may' / referent forms drop to Arbiter", () => {
  it("each player / each opponent / you / target player|opponent → the right who + targetType", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player gets a rad counter." }).atoms)
      .toEqual([{ op: "rad", amount: 1, who: "eachPlayer", targetType: null }]);
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player gets four rad counters." }).atoms)
      .toEqual([{ op: "rad", amount: 4, who: "eachPlayer", targetType: null }]);
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each opponent gets two rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 2, who: "eachOpponent" });
    expect(parseEffectProgram({ type: SORCERY, oracle: "You get three rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 3, who: "controller" });
    expect(parseEffectProgram({ type: SORCERY, oracle: "Target player gets two rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 2, who: "target", targetType: "player" });
    expect(parseEffectProgram({ type: SORCERY, oracle: "Target opponent gets four rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 4, who: "target", targetType: "opponent" });
    // CDMG-PLAYER-PAYOFF — the combat-damage-trigger referent forms ("they"/"that player" = the just-damaged
    // player, carried as ctx.damagedPlayerId). who:"damagedPlayer", NON-targeted (targetType:null); absent
    // damagedPlayerId (a spell / non-combat trigger) is a clean no-op. See cdmgPayoff.test.js for resolution.
    expect(parseEffectProgram({ type: SORCERY, oracle: "They get four rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 4, who: "damagedPlayer", targetType: null });
    expect(parseEffectProgram({ type: SORCERY, oracle: "That player gets two rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", amount: 2, who: "damagedPlayer", targetType: null });
    expect(parseEffectProgram({ type: SORCERY, oracle: "They get that many rad counters." }).atoms[0])
      .toMatchObject({ op: "rad", who: "damagedPlayer", countContext: "combatDamageAmount", targetType: null });
  });
  it("MUST_DROP_TO_LOW: variable-X, 'for each', optional 'may', and a conditional/trailing referent stay low → Arbiter", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle: o }))).toBe("low");
    low("Each player gets X rad counters.");                                  // variable X
    low("Each player gets a rad counter for each creature you control.");     // scaled rider
    low("You may get two rad counters.");                                     // optional choice (unmodeled)
    // The Vexing Radgull branch is MODELED now (SHELF S7 — matchRadOrProliferate → ifNoRadElseProliferate,
    // asserted in its own describe below); the Nuka-Nuke Launcher "…whenever they cast a spell" trailing
    // form keeps its tail, fails every anchor, and stays LOW (unmodeled).
    low("That player gets two rad counters whenever they cast a spell this turn.");
    low("That player gets two rad counters whenever they cast a spell.");
  });
});

// ─── coverage classification ────────────────────────────────────────────────────
describe("RAD coverage — clean rad-grant cards classify native; Mothman stays non-native (safe FN)", () => {
  it("standalone rad-grant spells are native-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Fallout", oracle: "Each player gets four rad counters." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Dose", oracle: "You get two rad counters." })).toBe("native-spell");
  });
  it("an ETB 'target player gets N rad counters' trigger is native-trigger", () => {
    expect(classifyCard({ type: "Creature — Mutant", name: "Ghoul", oracle: "When this creature enters, target player gets two rad counters." })).toBe("native-trigger");
  });
  it("The Wise Mothman IS native (SHELF C1+M1c — the disjunction split + the milled distribute both model)", () => {
    const mothman = {
      type: "Legendary Creature — Insect Mutant", name: "The Wise Mothman",
      oracle: "Flying\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.\nWhenever one or more nonland cards are milled, put a +1/+1 counter on each of up to X target creatures, where X is the number of nonland cards milled this way.",
    };
    expect(classifyCard(mothman)).toBe("native-trigger");
  });
});

// ─── atomTargetIntent ───────────────────────────────────────────────────────────
describe("RAD atomTargetIntent — a targeted rad is enemy-side (never self-directed)", () => {
  it("targeted rad → enemy; non-targeted rad → null", () => {
    expect(atomTargetIntent({ op: "rad", targetType: "opponent" })).toBe("enemy");
    expect(atomTargetIntent({ op: "rad", targetType: "player" })).toBe("enemy");
    expect(atomTargetIntent({ op: "rad", targetType: null })).toBe(null);
  });
});

// ─── grant atom resolves through the cast path ──────────────────────────────────
describe("RAD grant — casting a rad-grant spell lands counters (no immediate mill — that waits for precombat main)", () => {
  function castState(card, extraSeats = null) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const players = {
      ...s.players,
      user: { ...s.players.user, hand: [card], library: lib("u", 10), manaPool: { ...s.players.user.manaPool, C: 12, B: 5 } },
      ai: { ...s.players.ai, library: lib("a", 10) },
    };
    if (extraSeats) for (const id of extraSeats) players[id] = { ...s.players.ai, library: lib(id, 10) };
    // opponentsOf reads state.turnOrder — extend it so an added seat is a real opponent, not just a map entry.
    const turnOrder = ["user", "ai", ...(extraSeats || [])];
    return { ...s, turnOrder, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
  }
  function castAndResolve(s, cardId) {
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
    expect(cast).toBeTruthy();
    let next = resolveTopOfStack(dispatchAction(s, cast));
    while (next.stack.length) next = resolveTopOfStack(next);
    return next;
  }
  it("'Each player gets two rad counters' gives every seat 2", () => {
    const s = castState({ id: "ep", name: "EachRad", type: SORCERY, mana: "{B}", oracle: "Each player gets two rad counters." }, ["ai2"]);
    const after = castAndResolve(s, "ep");
    expect(after.players.user.radCounters).toBe(2);
    expect(after.players.ai.radCounters).toBe(2);
    expect(after.players.ai2.radCounters).toBe(2);
  });
  it("'You get three rad counters' gives only the caster 3", () => {
    const s = castState({ id: "yr", name: "YouRad", type: SORCERY, mana: "{B}", oracle: "You get three rad counters." });
    const after = castAndResolve(s, "yr");
    expect(after.players.user.radCounters).toBe(3);
    expect(after.players.ai.radCounters).toBe(0);
  });
  it("'Each opponent gets two rad counters' skips the caster", () => {
    const s = castState({ id: "eo", name: "OppRad", type: SORCERY, mana: "{B}", oracle: "Each opponent gets two rad counters." }, ["ai2"]);
    const after = castAndResolve(s, "eo");
    expect(after.players.user.radCounters).toBe(0);
    expect(after.players.ai.radCounters).toBe(2);
    expect(after.players.ai2.radCounters).toBe(2);
  });
});

// ─── proliferate ────────────────────────────────────────────────────────────────
describe("RAD proliferate — adds a rad counter to an opponent who has one; leaves my own rad alone", () => {
  it("proliferate boosts an opponent's rad, not the controller's", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const seeded = { ...s, players: {
      ...s.players,
      user: { ...s.players.user, radCounters: 2 },
      ai: { ...s.players.ai, radCounters: 2 },
    } };
    const after = applyProliferate(seeded, { op: "proliferate" }, { controller: "user" });
    expect(after.players.ai.radCounters).toBe(3);   // opponent rad proliferated (good for me)
    expect(after.players.user.radCounters).toBe(2); // my own rad untouched (bad for me)
  });
});

// ── RAD-OR-PROLIFERATE branch (Vexing Radgull, SHELF S7) ──
describe("RAD-OR-PROLIFERATE — Vexing Radgull", () => {
  const GULL = {
    name: "Vexing Radgull", type: "Creature — Bird Mutant", power: 2, toughness: 2,
    oracle: "Flying\nWhenever this creature deals combat damage to a player, that player gets two rad counters if they don't have any rad counters. Otherwise, proliferate.",
  };
  it("classifies native-trigger (the branch payoff models whole)", () => {
    expect(classifyCard(GULL)).toBe("native-trigger");
  });
  it("resolver: rad when the damaged player has NONE; proliferate (controller-driven) when they have some", async () => {
    const { resolveAtom } = await import("./effects/effectAtoms.js");
    const { createGameState, createPermanent } = await import("./gameState.js");
    const atom = { op: "rad", who: "damagedPlayer", amount: 2, ifNoRadElseProliferate: true, targetType: null };
    const mk = (aiRad) => {
      const s0 = createGameState({ userDeck: [], aiDeck: [] });
      const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
      bear.counters = { "+1/+1": 1 }; // a proliferate target for the else-arm
      return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear] }, ai: { ...s0.players.ai, radCounters: aiRad } } };
    };
    // No rad → +2 rad, no proliferate.
    const a = resolveAtom(mk(0), atom, { controller: "user", damagedPlayerId: "ai", targets: [] });
    expect(a.players.ai.radCounters).toBe(2);
    expect(a.players.user.battlefield[0].counters["+1/+1"]).toBe(1);
    // Has rad → the else-arm proliferates for the CONTROLLER: the bear's +1/+1 grows AND the opponent's
    // existing rad grows too (CR 701.34a — proliferate adds one of EACH kind already there; rad on an
    // opponent is a benefit, so the auto-chooser correctly includes them).
    const b = resolveAtom(mk(3), atom, { controller: "user", damagedPlayerId: "ai", targets: [] });
    expect(b.players.ai.radCounters).toBe(4);
    expect(b.players.user.battlefield[0].counters["+1/+1"]).toBe(2);
  });
});

// ── RADIATION LIFE-GAIN REPLACEMENT (Strong, the Brutish Thespian — SHELF S7) ──
describe("RADIATION LIFE-GAIN — 'You gain life rather than lose life from radiation.'", () => {
  const STRONG = { id: "strong-c", name: "Strong, the Brutish Thespian", type: "Legendary Creature — Mutant", power: 3, toughness: 3,
    oracle: "Ward {2}\nEnrage — Whenever Strong is dealt damage, you get three rad counters and put three +1/+1 counters on Strong.\nYou gain life rather than lose life from radiation." };

  it("classifies native (the replacement + the compound enrage payoff both model)", () => {
    expect(classifyCard(STRONG)).toMatch(/^native/);
  });

  it("radiation GAINS life for Strong's controller; rad counters still removed; others still lose", async () => {
    const { createPermanent } = await import("./gameState.js");
    const strong = createPermanent({ id: "strong", card: STRONG, controller: "user" });
    let s = radState({ library: [nonland("n0"), nonland("n1")], radCounters: 2, life: 40 });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [strong] } } };
    const after = applyRadiation(s, { playerId: "user" });
    expect(after.players.user.life).toBe(42);           // +2 instead of −2 (CR 614 replacement)
    expect(after.players.user.radCounters).toBe(0);     // counters still removed
    // Control: without Strong, the same state loses life.
    const ctrl = applyRadiation(radState({ library: [nonland("m0"), nonland("m1")], radCounters: 2, life: 40 }), { playerId: "user" });
    expect(ctrl.players.user.life).toBe(38);
  });
});
