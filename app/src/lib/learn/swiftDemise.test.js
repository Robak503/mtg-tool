/**
 * SWIFT DEMISE — the OPPONENT-creature mass destroy. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "Swift Demise deals 1 damage to target creature. Then destroy each creature you don't control that was dealt damage
 *  this turn."
 *
 * The ping and the "then" sequence were modelled; "destroy all creatures that were dealt damage this turn" already parsed
 * HIGH (the shared dealtDamageThisTurn restriction); the mass BOUNCE family already enumerates "each creature you don't
 * control" (eachOpponentCreature). Only the destroy op lacked that scope — one arm, the bounce family's scope on the
 * destroy op, with the optional dealt-damage rider as the restriction the enumerator applies to every mass scope.
 *
 * Mutation-checked: see the run ledger (docs-sk90).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DEMISE = { id: "c-sd", name: "Swift Demise", type: "Instant", mana: "{2}{B}", keywords: [],
  oracle: "Swift Demise deals 1 damage to target creature. Then destroy each creature you don't control that was dealt damage this turn." };
const bear = (id, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false }), ...over });

describe("the parser", () => {
  it("the second sentence reads to the opponent-creature scope with the dealt-damage restriction; the bare form has none; the whole program is HIGH; Swift Demise flips native", () => {
    const rider = parseEffectClause("Destroy each creature you don't control that was dealt damage this turn.", "Instant");
    const bare = parseEffectClause("Destroy each creature you don't control.", "Instant");
    const whole = parseEffectProgram(DEMISE);
    const row = { rider: rider?.atoms?.[0], bare: bare?.atoms?.[0], whole: [programConfidence(whole), whole?.atoms?.map((a) => a.op)], tier: classifyCard(DEMISE) };
    console.log("  WITNESS swiftDemise", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.rider).toMatchObject({ op: "destroy", targetType: "eachOpponentCreature", restrictions: [{ kind: "dealtDamageThisTurn", value: true }] });
    expect(row.bare).toMatchObject({ op: "destroy", targetType: "eachOpponentCreature" });
    expect(row.bare.restrictions).toBeUndefined();
    expect(row.whole).toEqual(["high", ["deal-damage", "destroy"]]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("RUNTIME — the ping marks the target, the destroy takes exactly the opponent's damaged creatures", () => {
  it("the pinged opponent creature dies; an undamaged opponent creature lives; your own pre-damaged creature lives", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const swamp = (i) => createPermanent({ id: `sw${i}`, card: { id: `c-sw${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "" }, controller: "user" });
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [DEMISE], battlefield: [swamp(1), swamp(2), swamp(3), bear("mine", "user", { damageMarked: 1 })] },
        ai: { ...s0.players.ai, battlefield: [bear("a", "ai"), bear("b", "ai")] } } };
    const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-sd");
    expect(casts.map((x) => x.targets?.[0]?.id).sort()).toEqual(["a", "b", "mine"]);
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((x) => x.targets?.[0]?.id === "a")));
    const row = { ai: resolved.players.ai.battlefield.map((p) => p.id), aiGy: resolved.players.ai.graveyard.map((c) => c.id), mine: resolved.players.user.battlefield.filter((p) => p.id === "mine").length };
    console.log("  WITNESS swiftDemiseRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai: ["b"], aiGy: ["c-a"], mine: 1 });
  });
});
