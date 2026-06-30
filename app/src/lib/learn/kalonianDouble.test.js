/**
 * DOUBLE-COUNTERS-EACH (CR 121 + 122.6) — the BOARD-WIDE counter-doubler, "double the number of +1/+1
 * counters on EACH creature you control". Extends the ENTER-WITH-X-COUNTERS / counter-doubler subsystem
 * (the SELF form — "…on this creature" — was already modeled for Voracious / Mossborn / Primordial's
 * upkeep). The board-wide form can't be a single countForSpec read (each creature doubles its OWN counters),
 * so it's a youControl-scoped add-counter carrying a `perTargetDouble` marker that counters.applyAddCounter
 * resolves PER target: the amount added to a creature = that creature's current +1/+1 count, read against the
 * pre-mutation board, routed through addCounter's doubler hook (Doubling Season composes per target, CR 616).
 *
 * This flips Kalonian Hydra (Zaxara TIER-2) — its only non-keyword, non-enters-with-counters clause is the
 * attack-trigger board-wide double, so once the double parses HIGH the trigger routes natively (native-trigger).
 *
 * CREED: a 0-counter creature gets 0 (no fabricated floor); an OPPONENT's creature is never touched ("you
 * control"); the SELF form ("on this creature") still routes to its own self-double path (this is additive);
 * and a board-wide double of a NON-+1/+1 counter, or on TARGET, stays LOW → Arbiter (only +1/+1 / youControl).
 * Real oracle (Kalonian / Bristly Bill / She-Hulk / Court of Garenbrig), verified vs the local index.
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyAddCounter } from "./effects/atoms/counters.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";

const BOARD_DOUBLE = "Double the number of +1/+1 counters on each creature you control";

// Real Kalonian Hydra (literal-4 enters + Trample + the board-wide attack-double).
const KALONIAN = {
  name: "Kalonian Hydra", type: "Creature — Hydra", mana: "{3}{G}{G}", power: 0, toughness: 0,
  oracle: "Trample\nThis creature enters with four +1/+1 counters on it.\nWhenever this creature attacks, double the number of +1/+1 counters on each creature you control.",
};

describe("DOUBLE-COUNTERS-EACH — parser emits a youControl perTargetDouble add-counter", () => {
  it("parses HIGH to one add-counter atom (scope youControl, perTargetDouble +1/+1)", () => {
    const prog = parseEffectClause(BOARD_DOUBLE, "Instant", {});
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", scope: "youControl", perTargetDouble: "+1/+1" }]);
  });
  it("the SELF form is unaffected — still a self-targeted countersOnSource double (additive, no overlap)", () => {
    const prog = parseEffectClause("Double the number of +1/+1 counters on this creature", "Instant", {});
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "add-counter", counterType: "+1/+1", target: "self", countFor: { kind: "countersOnSource", counterType: "+1/+1" } });
  });
});

describe("DOUBLE-COUNTERS-EACH — runtime: each MY creature doubles its OWN counters; opponents untouched", () => {
  const atom = () => parseEffectClause(BOARD_DOUBLE, "Instant", {}).atoms[0];
  const board = ({ mine, theirs }) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (spec, controller) => {
      const p = createPermanent({ id: spec.id, card: { id: spec.id, name: spec.id, type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller });
      p.counters = { "+1/+1": spec.c };
      return p;
    };
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: mine.map((m) => mk(m, "user")) },
        ai: { ...s.players.ai, battlefield: theirs.map((m) => mk(m, "ai")) },
      },
    };
  };
  const cnt = (s, pl, id) => s.players[pl].battlefield.find((p) => p.id === id).counters["+1/+1"] || 0;

  it("two of my creatures each double (4→8, 2→4); the enemy's 3 is left alone", () => {
    let s = board({ mine: [{ id: "kal", c: 4 }, { id: "bear", c: 2 }], theirs: [{ id: "enemy", c: 3 }] });
    s = applyAddCounter(s, atom(), { controller: "user", sourceId: "kal", targets: [] });
    expect(cnt(s, "user", "kal")).toBe(8);
    expect(cnt(s, "user", "bear")).toBe(4);
    expect(cnt(s, "ai", "enemy")).toBe(3); // "you control" — opponents never doubled
  });
  it("a 0-counter creature stays at 0 (CR 121 — no fabricated floor)", () => {
    let s = board({ mine: [{ id: "z", c: 0 }], theirs: [] });
    s = applyAddCounter(s, atom(), { controller: "user", sourceId: "z", targets: [] });
    expect(cnt(s, "user", "z")).toBe(0);
  });
  it("composes with Doubling Season PER target (CR 616): 4 counters → add 4 doubled to 8 → 12 total", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const kal = createPermanent({ id: "kal", card: { id: "kal", name: "Kalonian Hydra", type: "Creature — Hydra", power: 0, toughness: 0, oracle: "" }, controller: "user" });
    kal.counters = { "+1/+1": 4 };
    const ds = createPermanent({ id: "ds", card: { id: "ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [kal, ds] } } };
    s = applyAddCounter(s, atom(), { controller: "user", sourceId: "kal", targets: [] });
    expect(s.players.user.battlefield.find((p) => p.id === "kal").counters["+1/+1"]).toBe(12);
  });
});

describe("DOUBLE-COUNTERS-EACH — Kalonian Hydra flips native-trigger + resolves end-to-end", () => {
  it("Kalonian Hydra → native-trigger (Trample + literal-4 enters + board-wide attack-double, all modeled)", () => {
    expect(classifyCard(KALONIAN)).toBe("native-trigger");
  });
  it("declaring Kalonian as an attacker doubles every creature you control via the real flush", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const kal = createPermanent({ id: "kal", card: { ...KALONIAN, id: "kal" }, controller: "user", summoningSick: false });
    kal.counters = { "+1/+1": 4 };
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    bear.counters = { "+1/+1": 2 };
    s = {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [kal, bear] } },
      combat: { attackers: [{ permanentId: "kal", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    };
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1); // the attack-double trigger fired
    s = flushTriggers(s);
    let guard = 0;
    while (s.stack && s.stack.length > 0 && guard < 12) { s = resolveTopOfStack(s); guard += 1; }
    expect(s.players.user.battlefield.find((p) => p.id === "kal").counters["+1/+1"]).toBe(8);
    expect(s.players.user.battlefield.find((p) => p.id === "bear").counters["+1/+1"]).toBe(4);
  });
});

describe("DOUBLE-COUNTERS-EACH — CREED guards: only +1/+1 / youControl; other riders stay parked", () => {
  const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Instant", {}))).not.toBe("high");
  it("a -1/-1 board-wide double stays LOW (only +1/+1 is enforced)", () => {
    low("Double the number of -1/-1 counters on each creature you control");
  });
  it("a board-wide double on EACH CREATURE (all players, no 'you control') stays LOW (board-wide non-self double of an opponent's counters not modeled)", () => {
    low("Double the number of +1/+1 counters on each creature");
  });
  it("the TARGET-creature double stays LOW (a chosen-target form not modeled)", () => {
    low("Double the number of +1/+1 counters on target creature");
  });
  // Bristly Bill = the board-wide double (this activated ability, native-activated) + a MODELED landfall
  // counter-on-target trigger. It composes to native-mixed via the LANDFALL-composite fix (permanentFully-
  // Covered now strips the "Landfall —" ability-word label before its trigger-sentence strip — see
  // landfall.test.js). Court of Garenbrig still carries an UNMODELED rider (monarch + distribute-counters
  // upkeep), so it stays body-only (whole-card CREED) — the new double atom never masks that text.
  it("Bristly Bill, Spine Sower is native-mixed (board-double activated + a modeled landfall counter trigger)", () => {
    expect(classifyCard({
      name: "Bristly Bill, Spine Sower", type: "Legendary Creature — Plant Druid", mana: "{1}{G}",
      oracle: "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature.\n{3}{G}{G}: Double the number of +1/+1 counters on each creature you control.",
    })).toBe("native-mixed");
  });
  it("Court of Garenbrig stays body-only (the monarch + distribute-counters upkeep clause is unmodeled)", () => {
    expect(classifyCard({
      name: "Court of Garenbrig", type: "Enchantment", mana: "{1}{G}{G}",
      oracle: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, distribute two +1/+1 counters among up to two target creatures. Then if you're the monarch, double the number of +1/+1 counters on each creature you control.",
    })).toBe("body-only");
  });
});
