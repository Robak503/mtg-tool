/**
 * forgottenAncient.test.js — MOVE-COUNTERS-FROM-SELF (Forgotten Ancient, SHELF-TAIL W1 — CR 122.5).
 *
 * "At the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto
 * other creatures." A MOVE = remove from the source + put on the recipients (CR 122.5, both halves),
 * modeled as the EXISTING distribute-counters pause with two pendingChoice extensions:
 *   - `moveFromId`: resolveDistributeChoice removes the spent total from the source at settle. Placement
 *     still routes through add-counter (recipient-side doublers compose, CR 616/121.5); the REMOVED side
 *     is the literal chosen count — a doubler inflates what lands, never what leaves.
 *   - `anyNumber`: the printed "any number" makes ZERO legal — the settler's full-assignment rule is
 *     waived (learnSession required=0), which is also how the trigger's "you may" is realized (the atom
 *     stays UN-optional; declining = moving nothing — the free-cast convention, no double-prompt).
 *
 * ⚠️ HOLLOW-CREDIT GUARD (the Raul no-op law): the AI policy must REALLY move — a decline-only shortcut
 * would credit a card whose signature ability never moves a counter. autoPickDistributeCounters' move
 * branch puts the WHOLE pile on the controller's STRONGEST OWN other creature (deterministic), and moves
 * nothing only when no own-side candidate exists (counters never land on an enemy creature).
 *
 * Mutation-checked: `false && pc.moveFromId` in resolveDistributeChoice's remove block → "THE MOVE" dies
 * (source pile survives); disabling the mv arm in distributeCountersClauseParser → the HIGH pin + the
 * classifier flip die; `false && pc.moveFromId` in autoPickDistributeCounters → the AI-policy pins die.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { applyMoveCountersFromSelf } from "./effects/atoms/distributeCounters.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { autoPickDistributeCounters, resolveDistributeChoice } from "./effects/runProgram.js";
import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { setPendingDistributeChoice } from "./pendingChoice.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "you may move any number of +1/+1 counters from this creature onto other creatures";
const conf = (t) => programConfidence(parseEffectClause(t, "Instant", { sourceScoped: true }));

// createPermanent hard-initializes counters:{} (its signature has no counters param) — stamp the pile after.
const creature = (id, controller = "user", power = 1, counters = null) => ({
  ...createPermanent({ id, controller, card: { id: `c-${id}`, name: id, type: "Creature — Elemental", power, toughness: 3 } }),
  ...(counters ? { counters } : {}),
});
function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const pileOf = (s, seat, id) => (s.players[seat].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"]) || 0;

const FORGOTTEN_ANCIENT = {
  name: "Forgotten Ancient", type: "Creature — Elemental", mana: "{3}{G}", power: 0, toughness: 3,
  oracle: "Whenever a player casts a spell, you may put a +1/+1 counter on this creature.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto other creatures.",
};

describe("move-counters-from-self — parser + routing", () => {
  it("MUST STAY HIGH: the you-may clause → ONE UN-optional move atom (the picker's zero row IS the 'may')", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "move-counters-from-self", counterType: "+1/+1", anyNumber: true });
    expect(p.atoms[0].optional).toBeUndefined(); // free-cast convention — never a yes/no before a declinable picker
  });
  it("MUST DROP TO LOW: wrong kind / wrong count-shape / wrong recipient / rider → Arbiter", () => {
    expect(conf("you may move any number of -1/-1 counters from this creature onto other creatures")).toBe("low"); // wrong kind
    expect(conf("you may move a +1/+1 counter from this creature onto another target creature")).toBe("low");      // fixed count + targeted
    expect(conf("you may move any number of +1/+1 counters from this creature onto other creatures you control")).toBe("low"); // own-side restriction ≠ printed
    expect(conf("you may move any number of +1/+1 counters from target creature onto other creatures")).toBe("low"); // non-self source
  });
  it("registry: the op resolves through ATOM_RESOLVERS (the KNOWN gate is transitive)", () => {
    expect(ATOM_RESOLVERS["move-counters-from-self"]).toBe(applyMoveCountersFromSelf);
  });
  it("both of Forgotten Ancient's triggers route natively; the whole card classifies native-trigger", () => {
    const trigs = detectTriggers({ name: FORGOTTEN_ANCIENT.name, type_line: FORGOTTEN_ANCIENT.type, oracle_text: FORGOTTEN_ANCIENT.oracle, power: "0", toughness: "3" });
    expect(trigs).toHaveLength(2);
    expect(trigs.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect(classifyCard(FORGOTTEN_ANCIENT)).toBe("native-trigger");
  });
});

describe("move-counters-from-self — the pause", () => {
  it("gathers EVERY other creature (enemy included, controller-stamped), reads the LIVE pile, excludes the source", () => {
    const s = stateWith([creature("fa", "user", 0, { "+1/+1": 4 }), creature("mine", "user", 2)], [creature("theirs", "ai", 5)]);
    const paused = applyMoveCountersFromSelf(s, { op: "move-counters-from-self", counterType: "+1/+1", anyNumber: true }, { controller: "user", sourceId: "fa", cardName: "Forgotten Ancient" });
    expect(paused.pendingChoice).toMatchObject({ kind: "distribute-counters", controller: "user", amount: 4, moveFromId: "fa", anyNumber: true });
    const byId = Object.fromEntries(paused.pendingChoice.candidates.map((c) => [c.id, c]));
    expect(Object.keys(byId).sort()).toEqual(["mine", "theirs"]); // never the source itself
    expect(byId.mine.controller).toBe("user");
    expect(byId.theirs.controller).toBe("ai"); // the printed "other creatures" has no controller restriction
  });
  it("no counters / source gone / no other creatures → a logged no-op, never a pause", () => {
    const bare = stateWith([creature("fa", "user", 0)], [creature("theirs", "ai", 5)]);
    expect(applyMoveCountersFromSelf(bare, {}, { controller: "user", sourceId: "fa" }).pendingChoice).toBeUndefined();       // empty pile
    const gone = stateWith([], []);
    expect(applyMoveCountersFromSelf(gone, {}, { controller: "user", sourceId: "fa" }).pendingChoice).toBeUndefined();       // CR 608.2b
    const alone = stateWith([creature("fa", "user", 0, { "+1/+1": 3 })], []);
    expect(applyMoveCountersFromSelf(alone, {}, { controller: "user", sourceId: "fa" }).pendingChoice).toBeUndefined();      // nowhere to move
  });
});

describe("move-counters-from-self — the AI policy (the hollow-credit guard)", () => {
  it("moves the WHOLE pile onto the STRONGEST OWN creature — never an enemy, never a decline-only", () => {
    const s = stateWith([creature("fa", "user", 0, { "+1/+1": 4 }), creature("weak", "user", 2), creature("strong", "user", 5)], [creature("theirs", "ai", 9)]);
    const pc = { kind: "distribute-counters", controller: "user", amount: 4, counterType: "+1/+1", moveFromId: "fa", anyNumber: true,
      candidates: [{ id: "weak", controller: "user" }, { id: "strong", controller: "user" }, { id: "theirs", controller: "ai" }] };
    expect(autoPickDistributeCounters(s, pc)).toEqual([{ id: "strong", type: "creature", amount: 4 }]);
  });
  it("enemy-only candidates → move nothing (an enemy pump is worse than holding the pile)", () => {
    const s = stateWith([creature("fa", "user", 0, { "+1/+1": 4 })], [creature("theirs", "ai", 9)]);
    const pc = { kind: "distribute-counters", controller: "user", amount: 4, moveFromId: "fa", anyNumber: true, candidates: [{ id: "theirs", controller: "ai" }] };
    expect(autoPickDistributeCounters(s, pc)).toEqual([]);
  });
});

describe("move-counters-from-self — THE MOVE at settle (CR 122.5)", () => {
  const pausedState = () => {
    const s = stateWith([creature("fa", "user", 0, { "+1/+1": 4 }), creature("mine", "user", 2)], [creature("theirs", "ai", 5)]);
    return setPendingDistributeChoice(s, { controller: "user", amount: 4, counterType: "+1/+1", candidates: [{ id: "mine", controller: "user" }, { id: "theirs", controller: "ai" }], sourceName: "Forgotten Ancient", moveFromId: "fa", anyNumber: true });
  };
  it("recipient gains the counters AND the source loses exactly that many — both halves of the move", () => {
    const after = resolveDistributeChoice(pausedState(), [{ id: "mine", type: "creature", amount: 4 }]);
    expect(pileOf(after, "user", "mine")).toBe(4);
    expect(pileOf(after, "user", "fa")).toBe(0); // THE MOVE — the remove half (mutation-check line)
    expect(after.pendingChoice).toBeUndefined();
  });
  it("a partial move leaves the rest on the source ('any number' — 1 of 4)", () => {
    const after = resolveDistributeChoice(pausedState(), [{ id: "mine", type: "creature", amount: 1 }]);
    expect(pileOf(after, "user", "mine")).toBe(1);
    expect(pileOf(after, "user", "fa")).toBe(3);
  });
  it("ZERO settles cleanly — the printed decline: nothing placed, the pile stays, no re-surface", () => {
    const after = resolveDistributeChoice(pausedState(), []);
    expect(pileOf(after, "user", "fa")).toBe(4);
    expect(pileOf(after, "user", "mine")).toBe(0);
    expect(after.pendingChoice).toBeUndefined();
  });
  it("CR 616: a recipient-side doubler inflates what LANDS, never what LEAVES the source", () => {
    let s = stateWith([
      creature("fa", "user", 0, { "+1/+1": 4 }), creature("mine", "user", 2),
      createPermanent({ id: "dbl", controller: "user", card: { id: "c-dbl", name: "Doubler", type: "Enchantment", oracle: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead." } }),
    ], []);
    s = setPendingDistributeChoice(s, { controller: "user", amount: 4, counterType: "+1/+1", candidates: [{ id: "mine", controller: "user" }], moveFromId: "fa", anyNumber: true });
    const after = resolveDistributeChoice(s, [{ id: "mine", type: "creature", amount: 4 }]);
    expect(pileOf(after, "user", "mine")).toBe(8); // doubled placement
    expect(pileOf(after, "user", "fa")).toBe(0);   // literal removal — never 8 off a 4-pile
  });
});

describe("move-counters-from-self — the anyNumber waiver at the HUMAN seam (WI-7)", () => {
  function humanSession() {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players, user: { ...base.players.user, battlefield: [creature("fa", "user", 0, { "+1/+1": 3 }), creature("mine", "user", 2)] } },
    };
    const paused = setPendingDistributeChoice(s, { controller: "user", amount: 3, counterType: "+1/+1", candidates: [{ id: "mine", name: "mine", controller: "user" }], sourceName: "Forgotten Ancient", moveFromId: "fa", anyNumber: true });
    return { status: "active", state: paused, difficulty: "beginner", decisionLog: [] };
  }
  it("surfaces anyNumber + moveFromId to the panel", () => {
    const { decision } = advanceUntilDecision(humanSession());
    expect(decision.kind).toBe("distribute-counters");
    expect(decision.anyNumber).toBe(true);
    expect(decision.moveFromId).toBe("fa");
  });
  it("an EMPTY distribution settles (required=0 — no full-assignment soft-lock on 'any number')", () => {
    const { session: after } = applyPendingChoice(humanSession(), { kind: "distribute-counters", distribution: [] });
    expect(after.state.pendingChoice).toBeUndefined();
    expect(pileOf(after.state, "user", "fa")).toBe(3); // declined — the pile stays put
  });
  it("a partial human move settles too (1 of 3)", () => {
    const { session: after } = applyPendingChoice(humanSession(), { kind: "distribute-counters", distribution: [{ id: "mine", amount: 1 }] });
    expect(after.state.pendingChoice).toBeUndefined();
    expect(pileOf(after.state, "user", "mine")).toBe(1);
    expect(pileOf(after.state, "user", "fa")).toBe(2);
  });
});
