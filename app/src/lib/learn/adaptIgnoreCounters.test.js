/**
 * adaptIgnoreCounters.test.js — Biomancer's Familiar (CR 701.46a).
 * "{T}: The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it."
 *
 * CR 701.46a: adapt N means "If this permanent has no +1/+1 counters on it, put N +1/+1 counters on it."
 * This effect suppresses that gate ONCE, for ONE creature, for THIS turn.
 *
 * ⭐ THE SEAM WAS ANTICIPATED. applyAdapt's own comment already explained that adapt re-reads the LIVE
 * counter count rather than latching, and named Biomancer's Familiar as the reason. This fills that seam.
 *
 * ⭐ THE THREE WAYS IT COULD BE WRONG, and each is a test below:
 *   - it never fires        → adapt still refuses on a countered creature
 *   - it fires FOREVER      → the creature adapts every activation, stacking counters (the CR-forbidden
 *                             direction applyAdapt's comment warns about)
 *   - it fires NEXT TURN    → "this turn" ignored, a stale stamp keeps working
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { applyAdapt, applyAdaptIgnoreCounters, adaptIgnoreCountersClauseParser } from "./effects/atoms/counters.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FAMILIAR = { name: "Biomancer's Familiar", type: "Creature — Mutant", power: "2", toughness: "1", mana: "{G}{U}",
  oracle: "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.\n{T}: The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it." };

const OOZE = { id: "ooze-c", name: "Sauroform Hybrid", type: "Creature — Lizard Druid", mana: "{1}{G}", oracle: "" };

/** A board with one creature that already carries a +1/+1 counter (so adapt would normally refuse). */
function board(counters) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = { ...createPermanent({ id: "ooze", card: OOZE, controller: "user", summoningSick: false }), ...(counters ? { counters } : {}) };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
}
const plusOne = (s) => findPermanent(s, "ooze")?.permanent?.counters?.["+1/+1"] || 0;
const adapt = (s) => applyAdapt(s, { op: "adapt", amount: 2, target: "self" }, { controller: "user", sourceId: "ooze" });
const grant = (s) => applyAdaptIgnoreCounters(s, { op: "adapt-ignore-counters", targetType: "creature" },
  { controller: "user", targets: [{ type: "creature", id: "ooze" }] });

describe("⭐ THE GATE — CR 701.46a, suppressed exactly once", () => {
  it("VACUITY CONTROL: adapt works normally on a creature with NO counters", () => {
    expect(plusOne(adapt(board(null)))).toBe(2);
  });

  it("⛔ and normally REFUSES on a creature that already has one", () => {
    expect(plusOne(adapt(board({ "+1/+1": 1 })))).toBe(1);   // unchanged — the gate held
  });

  it("⭐ with the grant, the countered creature adapts anyway", () => {
    const s = adapt(grant(board({ "+1/+1": 1 })));
    expect(plusOne(s)).toBe(3);   // 1 existing + 2 from the adapt
  });

  it("⛔ ONE-SHOT — a SECOND adapt the same turn gets the gate back", () => {
    // "The NEXT time it adapts" — the stamp is spent by the adapt happening. Firing forever is the
    // CR-forbidden direction applyAdapt's own comment warns about.
    let s = adapt(grant(board({ "+1/+1": 1 })));
    expect(plusOne(s)).toBe(3);
    s = adapt(s);
    expect(plusOne(s)).toBe(3);   // refused the second time
  });

  it("⛔ TURN-SCOPED — a stamp from an earlier turn is inert", () => {
    const granted = grant(board({ "+1/+1": 1 }));
    const nextTurn = { ...granted, turn: (granted.turn || 0) + 1 };
    expect(plusOne(adapt(nextTurn))).toBe(1);   // the stale stamp did nothing
  });

  it("⛔ no legal target at resolution → a clean no-op, never a stamp on nobody", () => {
    const s = applyAdaptIgnoreCounters(board(null), { op: "adapt-ignore-counters" }, { controller: "user", targets: [] });
    expect(s.log.at(-1)).toMatchObject({ effect: "adapt-ignore-counters", applied: false });
  });

  it("the grant does not itself add counters", () => {
    expect(plusOne(grant(board({ "+1/+1": 1 })))).toBe(1);
  });
});

describe("parse + intent", () => {
  it("emits the targeted atom", () => {
    expect(parseEffectClause("The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it.", "Instant")?.atoms)
      .toEqual([{ op: "adapt-ignore-counters", targetType: "creature" }]);
  });

  it("⭐ intent is OWN — you spend the tap on your own creature", () => {
    expect(atomTargetIntent({ op: "adapt-ignore-counters", targetType: "creature" })).toBe("own");
  });

  it("⛔ a rider defeats the whole-clause anchor (SAFE FN)", () => {
    expect(adaptIgnoreCountersClauseParser("the next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it. Draw a card")).toBeNull();
  });
});

describe("the corpus row", () => {
  it("Biomancer's Familiar flips", () => {
    // native-mixed: the cost-reduction static was already modelled; this adds the activated half.
    expect(classifyCard(FAMILIAR)).toBe("native-mixed");
  });
});
