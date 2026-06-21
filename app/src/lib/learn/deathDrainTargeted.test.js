/**
 * DEATH-DRAIN-TARGETED — "target player/opponent loses N life [and you gain N life]" (Blood Artist,
 * Falkenrath Noble, Vengeful Bloodwitch, and the broad single-target drain family: Sovereign's Bite, Soul
 * Feast, Absorb Vis, Last Caress, the {cost}: drain activated abilities…).
 *
 * A targeted life LOSS is enemy-side like targeted DAMAGE (atomTargetIntent → "enemy"): draining yourself is
 * strictly bad, so the α1 trigger-flush chooser always picks an OPPONENT — no self-drain hazard (unlike the
 * edict's "target player", which could self-sacrifice). who:"target" + a chosen player targetType reuses the
 * existing targeted-draw machinery (cast path enumerates a player target; the resolver reads ctx.targets).
 *
 * CREED: non-targeted lose-life (each opponent / each player / you) is unchanged; a scaled/"for each" drain
 * fails the `$` anchor and stays on the Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent, programTriggerTargetsResolvable, parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

describe("DEATH-DRAIN-TARGETED — parse", () => {
  it("'target player loses N life' → who:target, a chosen player targetType", () => {
    expect(parseEffectClause("target player loses 1 life").atoms).toEqual([{ op: "lose-life", amount: 1, who: "target", targetType: "player" }]);
    expect(parseEffectClause("target opponent loses 3 life").atoms).toEqual([{ op: "lose-life", amount: 3, who: "target", targetType: "opponent" }]);
  });
  it("the drain composes: 'target player loses N and you gain N' → [lose-life target, gain-life]", () => {
    expect(parseEffectClause("target player loses 1 life and you gain 1 life").atoms).toEqual([
      { op: "lose-life", amount: 1, who: "target", targetType: "player" },
      { op: "gain-life", amount: 1, targetType: null },
    ]);
  });
  it("CREED: non-targeted lose-life is unchanged (no new targetType)", () => {
    expect(parseEffectClause("each opponent loses 1 life").atoms).toEqual([{ op: "lose-life", amount: 1, who: "eachOpponent", targetType: null }]);
    expect(parseEffectClause("you lose 2 life").atoms).toEqual([{ op: "lose-life", amount: 2, who: "controller", targetType: null }]);
  });
});

describe("DEATH-DRAIN-TARGETED — targeting intent (enemy-side, like damage)", () => {
  it("targeted lose-life is enemy-intent → resolvable on the trigger-flush path", () => {
    expect(atomTargetIntent({ op: "lose-life", who: "target", targetType: "player", amount: 1 })).toBe("enemy");
    expect(atomTargetIntent({ op: "lose-life", who: "target", targetType: "opponent", amount: 1 })).toBe("enemy");
    // non-targeted forms carry no targetType → null (no chosen target)
    expect(atomTargetIntent({ op: "lose-life", who: "eachOpponent", targetType: null })).toBe(null);
    expect(programTriggerTargetsResolvable(parseEffectProgram({ type: "Instant", oracle: "Target player loses 1 life and you gain 1 life." }))).toBe(true);
  });
});

describe("DEATH-DRAIN-TARGETED — coverage flips (synthetic cards, real oracle text)", () => {
  it("the targeted-drain trigger family flips native", () => {
    expect(classifyCard({ type: "Creature — Vampire", name: "Blood Artist", mana: "{1}{B}", oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." })).toMatch(/^native/);
    expect(classifyCard({ type: "Creature — Vampire", name: "Falkenrath Noble", mana: "{3}{B}", oracle: "Flying\nWhenever this creature or another creature dies, target player loses 1 life and you gain 1 life." })).toMatch(/^native/);
  });
  it("the targeted-drain SPELL family flips native", () => {
    expect(classifyCard({ type: "Instant", name: "Sovereign's Bite", mana: "{1}{B}", oracle: "Target opponent loses 2 life and you gain 2 life." })).toMatch(/^native/);
    expect(classifyCard({ type: "Sorcery", name: "Soul Feast", mana: "{3}{B}{B}", oracle: "Target player loses 4 life and you gain 4 life." })).toMatch(/^native/);
  });
  it("CREED — a SCALED drain ('loses life equal to …') stays body-only (not the numeric form)", () => {
    expect(classifyCard({ type: "Sorcery", name: "Scaled Drain", mana: "{2}{B}", oracle: "Target player loses life equal to the number of creatures you control." })).not.toMatch(/^native/);
  });
});

describe("DEATH-DRAIN-TARGETED — engine: the drain hits an OPPONENT and the controller gains (never self-drains)", () => {
  it("Blood Artist's trigger drains the opponent and gains the controller life (α1 enemy-side targeting)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const u0 = s.players.user.life, a0 = s.players.ai.life;
    s = { ...s, pendingTriggers: [{
      event: "dies", source: { name: "Blood Artist", permanentId: "src" }, controller: "user",
      descriptor: { event: "dies", scope: "eachCreature", whose: "any", effectClause: "target player loses 1 life and you gain 1 life", interveningIf: null },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    expect(out.players.ai.life).toBe(a0 - 1);   // the OPPONENT was drained
    expect(out.players.user.life).toBe(u0 + 1); // the controller gained — and did NOT drain itself
  });
  it("the resolver pays the chosen player target directly (spell path)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const a0 = s.players.ai.life;
    const program = parseEffectClause("target opponent loses 2 life and you gain 2 life");
    const out = runEffectProgram(s, { payload: { params: { program, controller: "user", targets: [{ type: "player", id: "ai" }] } } });
    expect(out.players.ai.life).toBe(a0 - 2);
    expect(out.players.user.life).toBe(s.players.user.life + 2);
  });
});
