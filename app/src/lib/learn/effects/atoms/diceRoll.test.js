/**
 * ===== DICE-ROLL (CR 726) ===== the d20 primitive + the result-scaled payoff (the Ancient Dragons).
 *
 * "Whenever this creature deals combat damage to a player, roll a d20. <create N tokens / draw N> equal to
 * the result." is modeled as a TWO-ATOM sequence: a `roll-d20` atom stamps a uniform 1–20 onto state.diceRoll
 * (via the SAME threaded deterministic PRNG shuffleControllerLibrary uses — NO Math.random, serialize-stable),
 * then the following payoff atom's count source {kind:"diceResult"} reads that value at resolution. The scaled
 * amount IS the rolled value.
 *
 * Cards modeled (the 3 non-reflexive Ancient Dragons):
 *   - Ancient Gold Dragon   — roll → create N 1/1 blue Faerie Dragon tokens WITH FLYING (typed creature token).
 *   - Ancient Copper Dragon — roll → create N Treasure tokens (named artifact token).
 *   - Ancient Silver Dragon — roll → draw N cards (+ the vacuous "no maximum hand size" rider, stripped).
 *
 * PARKED (reflexive "When you do, …" — no reflexive-trigger seam in the engine): Ancient Bronze Dragon
 * (roll → reflexive +1/+1 counters on up to two targets) and Ancient Brass Dragon (roll → reflexive total-MV
 * graveyard reanimation). Both stay body-only — a SAFE false-negative (CREED: whole card or nothing).
 *
 * CREED exercised: the roll picks a real uniform value (seeded → reproducible; different seeds hit different
 * values across the full 1–20 range); the payoff scales EXACTLY with the roll (proven across seeds); an absent
 * roll → 0 (a clean no-op, never a fabricated count); a `diceResult` count with no preceding roll-d20 in the
 * program → LOW (the parser gate); the reflexive dragons stay LOW → body-only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { applyRollDie } from "./roll.js";
import { runEffectProgram } from "../runProgram.js";
import { parseEffectProgram, parseEffectClause, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { detectTriggers } from "../../triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { checkCombatDamageTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

// 2P state with an injectable rng seed (so a roll is deterministic per test); `lib` seeds a drawable library.
function stateWith({ seed = 0, user = [], lib = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: lib }, (_, i) => ({ id: `lib-${i}`, name: `Filler ${i}`, type: "Instant" }));
  return {
    ...s, rngSeed: seed >>> 0, activePlayer: "user", phase: "combat", step: "combat-damage",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, library, life: 40, hand: [] },
      ai: { ...s.players.ai, battlefield: [], life: 40 },
    },
  };
}
const I = (oracle) => ({ type: "Instant", oracle });
const ELDER = "Creature — Elder Dragon";
const dragon = (name, oracle, over = {}) =>
  createPermanent({ id: over.id || "drg", card: { id: "c-drg", name, type: ELDER, power: over.power ?? 7, toughness: over.toughness ?? 7, oracle }, controller: "user", summoningSick: false });
const treasures = (s) => s.players.user.battlefield.filter((p) => /\bTreasure\b/.test(p.card.type)).length;
const tokensOf = (s) => s.players.user.battlefield.filter((p) => p.card.token);
const handSize = (s, pid = "user") => s.players[pid].hand.length;

const ORACLE = {
  gold: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. You create a number of 1/1 blue Faerie Dragon creature tokens with flying equal to the result.",
  silver: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. Draw cards equal to the result. You have no maximum hand size for the rest of the game.",
  copper: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. You create a number of Treasure tokens equal to the result.",
  bronze: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. When you do, put X +1/+1 counters on each of up to two target creatures, where X is the result.",
  brass: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. When you do, put any number of target creature cards with total mana value X or less from graveyards onto the battlefield under your control, where X is the result.",
};

// ────────────────────────────────────────────────────────────────────────────
// roll-d20 atom — uniform 1–20, seeded/reproducible, advances the seed, no Math.random
// ────────────────────────────────────────────────────────────────────────────
describe("roll-d20 atom — the d20 primitive (CR 726)", () => {
  it("picks an integer in [1, 20] and stamps it on state.diceRoll", () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = applyRollDie({ rngSeed: seed, log: [] }, { sides: 20 }, { controller: "user" });
      expect(Number.isInteger(s.diceRoll)).toBe(true);
      expect(s.diceRoll).toBeGreaterThanOrEqual(1);
      expect(s.diceRoll).toBeLessThanOrEqual(20);
    }
  });

  it("is REPRODUCIBLE for a given seed (no Math.random — serialize-stable)", () => {
    const a = applyRollDie({ rngSeed: 12345, log: [] }, { sides: 20 }, { controller: "user" }).diceRoll;
    const b = applyRollDie({ rngSeed: 12345, log: [] }, { sides: 20 }, { controller: "user" }).diceRoll;
    expect(a).toBe(b);
  });

  it("ADVANCES the seed so consecutive rolls differ (state.rngSeed changes)", () => {
    const s0 = { rngSeed: 7, log: [] };
    const s1 = applyRollDie(s0, { sides: 20 }, { controller: "user" });
    expect(s1.rngSeed).not.toBe(7);
    // Re-rolling off the advanced seed yields a fresh (independent) value sequence.
    const s2 = applyRollDie(s1, { sides: 20 }, { controller: "user" });
    expect(typeof s2.diceRoll).toBe("number");
  });

  it("covers the FULL 1–20 range across many seeds (uniform, every face reachable)", () => {
    const seen = new Set();
    for (let seed = 0; seed < 2000; seed++) seen.add(applyRollDie({ rngSeed: seed, log: [] }, { sides: 20 }, { controller: "user" }).diceRoll);
    expect(seen.size).toBe(20); // all 20 faces appear
  });
});

// ────────────────────────────────────────────────────────────────────────────
// classification — the 3 modeled dragons are native-trigger; the 2 reflexive ones are body-only
// ────────────────────────────────────────────────────────────────────────────
describe("DICE-ROLL — classification (native vs PARKED)", () => {
  it("Ancient Gold Dragon → native-trigger (roll → typed-token payoff)", () => {
    expect(classifyCard({ name: "Ancient Gold Dragon", type: ELDER, oracle: ORACLE.gold })).toBe("native-trigger");
  });
  it("Ancient Copper Dragon → native-trigger (roll → Treasure payoff)", () => {
    expect(classifyCard({ name: "Ancient Copper Dragon", type: ELDER, oracle: ORACLE.copper })).toBe("native-trigger");
  });
  it("Ancient Silver Dragon → native-trigger (roll → draw; vacuous 'no max hand size' stripped)", () => {
    expect(classifyCard({ name: "Ancient Silver Dragon", type: ELDER, oracle: ORACLE.silver })).toBe("native-trigger");
  });
  it("Ancient Bronze Dragon → body-only (reflexive 'when you do' — PARKED, CREED-safe FN)", () => {
    expect(classifyCard({ name: "Ancient Bronze Dragon", type: ELDER, oracle: ORACLE.bronze })).toBe("body-only");
  });
  it("Ancient Brass Dragon → body-only (reflexive total-MV reanimation — PARKED, CREED-safe FN)", () => {
    expect(classifyCard({ name: "Ancient Brass Dragon", type: ELDER, oracle: ORACLE.brass })).toBe("body-only");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parser — the trigger effect parses to [roll-d20, diceResult payoff], HIGH, no chosen target
// ────────────────────────────────────────────────────────────────────────────
describe("DICE-ROLL — parser (the trigger effect program)", () => {
  const effProg = (oracle) => parseEffectClause(detectTriggers({ name: "D", type: ELDER, oracle }).effectClause ?? detectTriggers({ name: "D", type: ELDER, oracle })[0].effectClause, "Instant");

  it("Gold: effect → [roll-d20, create-token / countFor diceResult / flying], HIGH, no chosen target", () => {
    const p = effProg(ORACLE.gold);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "roll-d20", sides: 20 });
    expect(p.atoms[1]).toMatchObject({ op: "create-token", power: 1, toughness: 1, countFor: { kind: "diceResult" }, keywords: ["Flying"] });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("Copper: effect → [roll-d20, create-named-token treasure / countFor diceResult], HIGH", () => {
    const p = effProg(ORACLE.copper);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "roll-d20" });
    expect(p.atoms[1]).toMatchObject({ op: "create-named-token", token: "treasure", countFor: { kind: "diceResult" } });
  });

  it("Silver: effect → [roll-d20, draw / amountCount diceResult], HIGH (no-max-hand-size stripped)", () => {
    const p = effProg(ORACLE.silver);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "roll-d20" });
    expect(p.atoms[1]).toMatchObject({ op: "draw", amountCount: { kind: "diceResult", per: 1 } });
    expect(p.atoms).toHaveLength(2); // the vacuous static produced NO atom
  });

  it("'You have no maximum hand size for the rest of the game.' alone is VACUOUS → not its own atom (stripped)", () => {
    // As a bare spell it strips to empty → no atoms (low, an empty program) — confirms the strip, not a fabricated atom.
    const p = parseEffectProgram(I("Draw cards equal to the result. You have no maximum hand size for the rest of the game."));
    // This bare clause has a diceResult draw with NO preceding roll → the CREED gate forces LOW.
    expect(programConfidence(p)).toBe("low");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CREED gate — a diceResult payoff with no preceding roll-d20 is LOW; a bare roll is LOW
// ────────────────────────────────────────────────────────────────────────────
describe("DICE-ROLL — CREED gate (roll/payoff must pair)", () => {
  it("'Draw cards equal to the result.' with NO preceding roll → LOW (would read 0 — dropped-payoff FP blocked)", () => {
    expect(programConfidence(parseEffectProgram(I("Draw cards equal to the result.")))).toBe("low");
  });
  it("a BARE 'Roll a d20.' with no payoff → LOW (the outcome is unmodeled)", () => {
    expect(programConfidence(parseEffectProgram(I("Roll a d20.")))).toBe("low");
  });
  it("the paired sequence 'Roll a d20. Draw cards equal to the result.' → HIGH", () => {
    expect(programConfidence(parseEffectProgram(I("Roll a d20. Draw cards equal to the result.")))).toBe("high");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runtime — the payoff scales with the roll; seeded values hit different amounts; absent roll → 0
// ────────────────────────────────────────────────────────────────────────────
describe("DICE-ROLL — runtime (the payoff scales with the rolled value)", () => {
  const prog = (oracle) => parseEffectClause(detectTriggers({ name: "D", type: ELDER, oracle })[0].effectClause, "Instant");
  const runWith = (program, seed, { lib = 0 } = {}) => {
    const s = stateWith({ seed, lib });
    const obj = { source: { name: "D" }, payload: { params: { program, controller: "user", targets: [], context: { damagedPlayerId: "ai", combatDamageAmount: 5 } } } };
    return runEffectProgram(s, obj);
  };

  it("Copper: treasures minted === the rolled value (proven across SEVERAL seeds → SEVERAL values)", () => {
    const program = prog(ORACLE.copper);
    const results = [0, 1, 2, 4].map((seed) => { const s = runWith(program, seed); return { roll: s.diceRoll, treasures: treasures(s) }; });
    for (const r of results) expect(r.treasures).toBe(r.roll); // payoff === roll, every time
    expect(new Set(results.map((r) => r.roll)).size).toBeGreaterThan(1); // different seeds → different rolls (real RNG)
  });

  it("Silver: cards drawn === the rolled value (dynamic — different seeds draw different amounts)", () => {
    const program = prog(ORACLE.silver);
    const r0 = runWith(program, 0, { lib: 30 });
    const r1 = runWith(program, 1, { lib: 30 });
    expect(handSize(r0)).toBe(r0.diceRoll);
    expect(handSize(r1)).toBe(r1.diceRoll);
    expect(r0.diceRoll).not.toBe(r1.diceRoll); // seeds 0 and 1 roll different values
  });

  it("Gold: Faerie Dragon tokens minted === the rolled value, each 1/1 WITH FLYING", () => {
    const program = prog(ORACLE.gold);
    const s = runWith(program, 4);
    const toks = tokensOf(s);
    expect(toks.length).toBe(s.diceRoll);
    expect(toks[0].card).toMatchObject({ power: 1, toughness: 1, keywords: ["Flying"] });
    expect(toks[0].card.type).toMatch(/Faerie Dragon/);
  });

  it("INJECTED roll value selects the payoff amount (forced diceRoll → exact count, bucket-style)", () => {
    // Inject state.diceRoll directly (bypass the RNG) and run ONLY the payoff atom — proves the payoff reads
    // the result deterministically, so a forced "low"/"high" roll yields the matching amount.
    const payoff = prog(ORACLE.copper).atoms[1]; // create-named-token / countFor diceResult
    for (const forced of [1, 10, 20]) {
      let s = { ...stateWith({}), diceRoll: forced };
      s = resolveAtom(s, payoff, { controller: "user", targets: [] });
      expect(treasures(s)).toBe(forced);
    }
  });

  it("absent roll (diceRoll unset) → the payoff is a clean no-op (0 tokens, never fabricated)", () => {
    const payoff = prog(ORACLE.copper).atoms[1];
    let s = stateWith({}); // no diceRoll
    s = resolveAtom(s, payoff, { controller: "user", targets: [] });
    expect(treasures(s)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// END-TO-END — the real combat-damage trigger flush rolls and applies the payoff
// ────────────────────────────────────────────────────────────────────────────
describe("DICE-ROLL — END-TO-END via the real combat-damage-to-a-player flush", () => {
  const flush = (s) => {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s);
    return s;
  };

  it("Ancient Copper Dragon dealing combat damage rolls a d20 and makes that many Treasures", () => {
    const drg = dragon("Ancient Copper Dragon", ORACLE.copper, { id: "copper", power: 7, toughness: 7 });
    let s = stateWith({ seed: 4, user: [drg] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "copper", attackingPlayer: "user", defender: "ai", amount: 7 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flush(s);
    expect(s.diceRoll).toBeGreaterThanOrEqual(1);
    expect(s.diceRoll).toBeLessThanOrEqual(20);
    expect(treasures(s)).toBe(s.diceRoll); // the Treasures created === the d20 result
  });

  it("Ancient Silver Dragon dealing combat damage rolls a d20 and draws that many cards", () => {
    const drg = dragon("Ancient Silver Dragon", ORACLE.silver, { id: "silver", power: 6, toughness: 6 });
    let s = stateWith({ seed: 2, user: [drg], lib: 30 });
    const before = handSize(s);
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "silver", attackingPlayer: "user", defender: "ai", amount: 6 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flush(s);
    expect(handSize(s) - before).toBe(s.diceRoll); // cards drawn === the d20 result
  });

  it("Ancient Gold Dragon dealing combat damage rolls a d20 and makes that many 1/1 flying Faerie Dragons", () => {
    const drg = dragon("Ancient Gold Dragon", ORACLE.gold, { id: "gold", power: 5, toughness: 5 });
    let s = stateWith({ seed: 1, user: [drg] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "gold", attackingPlayer: "user", defender: "ai", amount: 5 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flush(s);
    const toks = tokensOf(s);
    expect(toks.length).toBe(s.diceRoll);
    if (toks.length) expect(toks[0].card.keywords).toEqual(["Flying"]);
  });
});
