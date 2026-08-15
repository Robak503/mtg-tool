/**
 * theOzolith.test.js — THE OZOLITH (SHELF-TAIL W2): the leave-counters accumulator + the combat move-all.
 *
 * Trigger 1 — "Whenever a creature you control leaves the battlefield, if it had counters on it, put
 * those counters on The Ozolith." Three new pieces riding existing seams:
 *   - the BARE LTB watcher subject ("a creature you control" — scope creatureYouControlLeaves, the
 *     self-inclusive sibling of the Ninth Bridge Patrol "another" arm), fired by checkLeavesTriggers
 *     off pendingLeaveEvents for EVERY exit kind (death, bounce, exile — CR 603.6c, no dies-only partial);
 *   - the LOOK-BACK intervening-if "it had counters on it" (HAD_ANY_COUNTERS — the undying/persist LKI
 *     discipline: ctx.triggeringHadCounters stamped at enqueue off the leave event's counter snapshot,
 *     frozen history so flush and resolution read the same value; missing → null → FN-safe drop);
 *   - the payoff atom put-leave-counters-on-self ("put THOSE counters on this permanent" after the
 *     self-name rewrite): copies the snapshot EXACTLY, every kind, through addCounter (CR 616 doublers
 *     compose on the landing side).
 *
 * Trigger 2 — "At the beginning of combat on your turn, if The Ozolith has counters on it, you may move
 * all counters from The Ozolith onto target creature." The self-name normalizes in BOTH slots (the
 * condition → "this permanent has counters on it", a live any-kind source read; the effect → the
 * move-all-counters-to-target atom, α2-optional + targeted, intent "own" so the flush chooser never
 * gifts the pile). The move is CR 122.5 both-halves: every kind lands on the target (doublers apply),
 * the source loses the LITERAL pile, and the lethal SBA sweep runs after removal.
 *
 * Mutation-checked: disabling the "a creature you control" subject arm kills the trigger-1 route pin;
 * disabling applyMoveAllCountersToTarget's removeCounter loop kills "THE MOVE" (source keeps its pile);
 * disabling the HAD_ANY_COUNTERS reader kills the look-back evaluator pins.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkLeavesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { applyPutLeaveCountersOnSelf, applyMoveAllCountersToTarget } from "./effects/atoms/distributeCounters.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OZOLITH = {
  name: "The Ozolith", type: "Legendary Artifact", mana: "{1}",
  oracle: "Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on The Ozolith.\nAt the beginning of combat on your turn, if The Ozolith has counters on it, you may move all counters from The Ozolith onto target creature.",
};
const ozCard = { name: OZOLITH.name, type_line: OZOLITH.type, oracle_text: OZOLITH.oracle };

const perm = (id, card, controller = "user", counters = null) => ({
  ...createPermanent({ id, controller, card }),
  ...(counters ? { counters } : {}),
});
const creature = (id, controller = "user", counters = null) =>
  perm(id, { id: `c-${id}`, name: id, type: "Creature — Elemental", power: 2, toughness: 3 }, controller, counters);
const ozPerm = (id = "oz", counters = null) => perm(id, { id: "c-oz", name: "The Ozolith", type: "Legendary Artifact", oracle: OZOLITH.oracle }, "user", counters);
function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const pileOf = (s, seat, id) => s.players[seat].battlefield.find((p) => p.id === id)?.counters || {};

describe("The Ozolith — detection + routing (both triggers)", () => {
  it("MUST STAY ROUTED: both descriptors detect with the normalized forms and route natively", () => {
    const ds = detectTriggers(ozCard);
    expect(ds).toHaveLength(2);
    const [leave, combat] = ds;
    expect(leave).toMatchObject({ event: "permanentLeaves", scope: "creatureYouControlLeaves", interveningIf: "it had counters on it" });
    expect(leave.effectClause).toBe("put those counters on this permanent");       // the self-name rewrite
    expect(combat).toMatchObject({ event: "combatBegin", interveningIf: "this permanent has counters on it" }); // the condition-slot rewrite
    expect(combat.effectClause).toBe("you may move all counters from this permanent onto target creature");
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect(classifyCard(OZOLITH)).toBe("native-trigger");
  });
  it("CREED near-misses: an unlisted subject / a foreign name / a non-creature move target all stay parked", () => {
    // "a creature leaves the battlefield" (no "you control") — no subject arm → undetected → body-only.
    expect(classifyCard({ ...OZOLITH, name: "Wide Watcher", oracle: "Whenever a creature leaves the battlefield, if it had counters on it, put those counters on Wide Watcher." })).toBe("body-only");
    // A DIFFERENT card's name in the condition slot must NOT rewrite (CR 201.4 is self-reference only).
    const foreign = detectTriggers({ name: "Not Ozolith", type_line: "Artifact", oracle_text: "At the beginning of combat on your turn, if The Ozolith has counters on it, you may move all counters from The Ozolith onto target creature." });
    expect(foreign[0]?.interveningIf).toBe("The Ozolith has counters on it");      // raw → unparseable → not native
    expect(foreign[0] ? triggerRoutesNatively(foreign[0]) : false).toBe(false);
    // "onto target permanent" misses the anchored arm → LOW.
    expect(programConfidence(parseEffectClause("move all counters from this permanent onto target permanent", "Instant", { sourceScoped: true }))).toBe("low");
  });
  it("the move-all atom's chooser intent is OWN (the pile is never gifted across the table)", () => {
    const p = parseEffectClause("you may move all counters from this permanent onto target creature", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "move-all-counters-to-target", targetType: "creature", optional: true });
    expect(atomTargetIntent(p.atoms[0])).toBe("own");
  });
});

describe("The Ozolith — the look-back condition (HAD_ANY_COUNTERS) + the live source read", () => {
  it("'it had counters on it' reads the stamped boolean; missing context → null (FN-safe)", () => {
    const s = stateWith([]);
    expect(evaluateInterveningIf(s, "it had counters on it", "user", { triggeringHadCounters: true })).toBe(true);
    expect(evaluateInterveningIf(s, "it had counters on it", "user", { triggeringHadCounters: false })).toBe(false);
    expect(evaluateInterveningIf(s, "it had counters on it", "user", {})).toBe(null);
    expect(interveningIfParseable("it had counters on it")).toBe(true);
  });
  it("'this permanent has counters on it' is a LIVE any-kind source read; gone source → null", () => {
    const s = stateWith([ozPerm("oz", { charge: 1 })]);
    expect(evaluateInterveningIf(s, "this permanent has counters on it", "user", { sourcePermanentId: "oz" })).toBe(true);
    const bare = stateWith([ozPerm("oz")]);
    expect(evaluateInterveningIf(bare, "this permanent has counters on it", "user", { sourcePermanentId: "oz" })).toBe(false);
    expect(evaluateInterveningIf(bare, "this permanent has counters on it", "user", { sourcePermanentId: "gone" })).toBe(null);
    expect(interveningIfParseable("this permanent has counters on it")).toBe(true);
  });
});

describe("The Ozolith — the leave event threads the counter snapshot", () => {
  it("a counter-laden creature leaving enqueues the watcher trigger with the LKI context stamped", () => {
    let s = stateWith([ozPerm("oz")]);
    s = { ...s, pendingLeaveEvents: [{ id: "dead1", controller: "user", card: { id: "c-dead1", name: "dead1", type: "Creature — Bear" }, toGraveyard: true, counters: { "+1/+1": 3, charge: 2 } }] };
    const after = checkLeavesTriggers(s);
    const trig = (after.pendingTriggers || []).find((t) => t.source?.name === "The Ozolith");
    expect(trig).toBeTruthy();
    expect(trig.context.triggeringHadCounters).toBe(true);
    expect(trig.context.triggeringLeaveCounters).toEqual({ "+1/+1": 3, charge: 2 });
    // The flush-level CR 603.4 gate reads the SAME context this enqueue stamped:
    expect(evaluateInterveningIf(after, trig.descriptor.interveningIf, "user", trig.context)).toBe(true);
  });
  it("a counterLESS leave stamps false — the flush gate drops it (CR 603.4)", () => {
    let s = stateWith([ozPerm("oz")]);
    s = { ...s, pendingLeaveEvents: [{ id: "dead1", controller: "user", card: { id: "c-dead1", name: "dead1", type: "Creature — Bear" }, toGraveyard: false, counters: {} }] };
    const after = checkLeavesTriggers(s);
    const trig = (after.pendingTriggers || []).find((t) => t.source?.name === "The Ozolith");
    expect(trig).toBeTruthy(); // enqueued — the CONDITION (not the scope) is what drops it
    expect(evaluateInterveningIf(after, trig.descriptor.interveningIf, "user", trig.context)).toBe(false);
  });
  it("an OPPONENT's creature leaving never matches the you-control scope", () => {
    let s = stateWith([ozPerm("oz")]);
    s = { ...s, pendingLeaveEvents: [{ id: "theirs", controller: "ai", card: { id: "c-x", name: "x", type: "Creature — Bear" }, toGraveyard: true, counters: { "+1/+1": 5 } }] };
    const after = checkLeavesTriggers(s);
    expect((after.pendingTriggers || []).find((t) => t.source?.name === "The Ozolith")).toBeUndefined();
  });
});

describe("The Ozolith — the accumulator payoff (put-leave-counters-on-self)", () => {
  it("copies the snapshot EXACTLY — every kind, exact amounts", () => {
    const s = stateWith([ozPerm("oz")]);
    const after = applyPutLeaveCountersOnSelf(s, { op: "put-leave-counters-on-self" }, { controller: "user", sourceId: "oz", triggeringLeaveCounters: { "+1/+1": 3, charge: 2 } });
    expect(pileOf(after, "user", "oz")).toEqual({ "+1/+1": 3, charge: 2 });
  });
  it("no snapshot / source gone → a clean no-op (never a fabricated pile)", () => {
    const s = stateWith([ozPerm("oz")]);
    expect(pileOf(applyPutLeaveCountersOnSelf(s, {}, { controller: "user", sourceId: "oz" }), "user", "oz")).toEqual({});
    const gone = stateWith([]);
    expect(applyPutLeaveCountersOnSelf(gone, {}, { controller: "user", sourceId: "oz", triggeringLeaveCounters: { "+1/+1": 3 } }).players.user.battlefield).toHaveLength(0);
  });
});

describe("The Ozolith — THE MOVE-ALL at combat (CR 122.5, both halves)", () => {
  it("every kind lands on the target AND the source empties — the literal pile", () => {
    const s = stateWith([ozPerm("oz", { "+1/+1": 3, charge: 2 }), creature("mine")]);
    const after = applyMoveAllCountersToTarget(s, { op: "move-all-counters-to-target", targetType: "creature" }, { controller: "user", sourceId: "oz", targets: [{ type: "creature", id: "mine" }] });
    expect(pileOf(after, "user", "mine")).toEqual({ "+1/+1": 3, charge: 2 });
    expect(pileOf(after, "user", "oz")).toEqual({}); // THE MOVE — the remove half (mutation-check line)
  });
  it("CR 616: a +1/+1 doubler inflates what LANDS (that kind only), never what LEAVES", () => {
    const dbl = perm("dbl", { id: "c-dbl", name: "Doubler", type: "Enchantment", oracle: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead." });
    const s = stateWith([ozPerm("oz", { "+1/+1": 3, charge: 2 }), creature("mine"), dbl]);
    const after = applyMoveAllCountersToTarget(s, { op: "move-all-counters-to-target" }, { controller: "user", sourceId: "oz", targets: [{ type: "creature", id: "mine" }] });
    expect(pileOf(after, "user", "mine")).toEqual({ "+1/+1": 6, charge: 2 }); // +1/+1 doubled; charge untouched (the doubler is kind-scoped)
    expect(pileOf(after, "user", "oz")).toEqual({});                          // literal removal — never the doubled count
  });
  it("empty pile / vanished target → a clean no-op (no half-move)", () => {
    const s = stateWith([ozPerm("oz"), creature("mine")]);
    expect(pileOf(applyMoveAllCountersToTarget(s, {}, { controller: "user", sourceId: "oz", targets: [{ type: "creature", id: "mine" }] }), "user", "mine")).toEqual({});
    const s2 = stateWith([ozPerm("oz", { "+1/+1": 2 })]);
    const after = applyMoveAllCountersToTarget(s2, {}, { controller: "user", sourceId: "oz", targets: [{ type: "creature", id: "vanished" }] });
    expect(pileOf(after, "user", "oz")).toEqual({ "+1/+1": 2 }); // target gone → the pile STAYS (never remove without placing)
  });
});
