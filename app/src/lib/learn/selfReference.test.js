/**
 * Self-reference trigger/activated vocabulary — "this creature gets +N/+N until end of turn" and
 * "put a +1/+1 counter on this creature" refer to the ability's SOURCE (CR 109.2). Modeled with a
 * `target:"self"` atom (no targetType → non-targeted), resolved against ctx.sourceId threaded from
 * the trigger flush + activated dispatcher. Covers: the parser shapes, the resolver binding to the
 * source (and no-op with no source), the trigger-flush integration, and native coverage.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { triggersForEvent } from "./triggers.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PUMP = parseEffectClause("This creature gets +2/+0 until end of turn.", "Instant");
const COUNTER = parseEffectClause("Put a +1/+1 counter on this creature.", "Instant");
const creature = (name, p, t, oracle = "") => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle });

function boardWith(perm) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } },
  };
}

// Resolve a self-effect program against a source via the real effect-program resolver.
const runSelf = (state, program, sourceId) =>
  runEffectProgram(state, { source: { permanentId: sourceId, name: "X" }, payload: { params: { program, controller: "user", sourceId, targets: [] } } });

describe("parser — self-reference atoms", () => {
  it("models 'this creature gets …' and 'put a +1/+1 counter on this creature' as target:self", () => {
    expect(PUMP.atoms).toEqual([{ op: "pump", target: "self", ptDelta: { p: 2, t: 0 } }]);
    expect(COUNTER.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" }]);
    expect(programConfidence(PUMP)).toBe("high");
    // self atoms are NON-targeted (no chosen target → route natively on the trigger flush).
    expect(programNeedsChosenTarget(PUMP)).toBe(false);
    expect(programNeedsChosenTarget(COUNTER)).toBe(false);
  });
});

describe("resolver — binds to the source, no-ops with no source", () => {
  it("a self pump buffs the source creature", () => {
    let s = boardWith(createPermanent({ id: "u1", card: creature("Bear", 2, 2), controller: "user", summoningSick: false }));
    s = runSelf(s, PUMP, "u1");
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([4, 2]);
  });
  it("a self counter puts a +1/+1 counter on the source", () => {
    let s = boardWith(createPermanent({ id: "u1", card: creature("Bear", 2, 2), controller: "user", summoningSick: false }));
    s = runSelf(s, COUNTER, "u1");
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([3, 3]);
  });
  it("a self atom with no source is a clean no-op (never a fabricated pump)", () => {
    let s = boardWith(createPermanent({ id: "u1", card: creature("Bear", 2, 2), controller: "user", summoningSick: false }));
    s = runSelf(s, PUMP, null);
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([2, 2]);
  });
});

describe("trigger flush — an attack self-pump resolves against the source", () => {
  it("'Whenever ~ attacks, this creature gets +2/+0 until end of turn' pumps the attacker", () => {
    const card = creature("Raging Bear", 2, 2, "Whenever Raging Bear attacks, this creature gets +2/+0 until end of turn.");
    let s = boardWith(createPermanent({ id: "u1", card, controller: "user", summoningSick: false }));
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: s.players.user.battlefield[0], triggeringPermanent: s.players.user.battlefield[0] });
    expect(fired).toHaveLength(1);
    s = flushTriggers({ ...s, pendingTriggers: fired });
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([4, 2]); // pumped itself
  });
});

describe("restriction guard — a dropped restriction must NOT over-fire a self effect (review catch)", () => {
  const T = (oracle) => detectTriggers({ type: "Creature — Beast", name: "X", oracle });
  it("a RESTRICTED dies/etb condition stays UNDETECTED (safe no-op); bare conditions still classify", () => {
    // The classifier doesn't enforce these restrictions, so widening them to each-scope would
    // over-fire on disallowed deaths/entries (Malakir Cullblade counting an OWN creature's death).
    expect(T("Whenever a creature an opponent controls dies, put a +1/+1 counter on this creature.")).toEqual([]);
    expect(T("Whenever another creature you control enters, put a +1/+1 counter on this creature.")).toEqual([]);
    expect(T("Whenever a creature with flying dies, put a +1/+1 counter on this creature.")).toEqual([]);
    // BARE conditions (no dropped restriction) and self-triggers still classify and route.
    expect(T("Whenever a creature dies, put a +1/+1 counter on this creature.")[0]).toMatchObject({ event: "dies", scope: "eachCreature" });
    expect(T("Whenever another creature enters the battlefield, this creature gets +1/+1 until end of turn.")[0]).toMatchObject({ event: "etb", scope: "eachOtherCreature" });
    expect(T("Whenever this creature attacks, this creature gets +1/+0 until end of turn.")[0]).toMatchObject({ event: "attacks", scope: "self" });
  });
});

describe("X-rewrite hardening — an X-cost self pump keeps its self-binding (review catch)", () => {
  it("does not silently drop the target:self binding (the amount comes from X, so no ptDelta)", () => {
    const p = parseEffectClause("This creature gets +X/+X until end of turn.", "Instant", { hasX: true });
    expect(p.atoms[0]).toMatchObject({ op: "pump", target: "self", amountX: true });
    expect(p.atoms[0].ptDelta).toBeUndefined();
  });
});

describe("coverage — self-reference triggers are native-trigger", () => {
  it("an attack self-pump / a dies self-counter classify native-trigger", () => {
    expect(classifyCard({ type: "Creature — Beast", name: "A", oracle: "Whenever this creature attacks, this creature gets +1/+1 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Beast", name: "B", oracle: "Whenever this creature attacks, put a +1/+1 counter on this creature." })).toBe("native-trigger");
  });
});
