/**
 * strivePermanents.test.js — ④-AT (2026-09-04 night): the two Strive cards on the PERMANENT lane — Consign to Dust
 * "Destroy any number of target artifacts and/or enchantments" and Kiora's Dismissal "Return any number of target
 * enchantments to their owners' hands". The permanent lane's fixed-count arms ("up to two target artifacts and/or
 * enchantments", "return up to N target <permanents> to their owners' hands") learned the unbounded count word: maxTargets
 * 99 / minTargets 0 / anyNumber. The Strive cost rides the cast lane exactly as ④-AS built it. Real oracle fixtures
 * (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CONSIGN = { id: "h-cd", name: "Consign to Dust", type: "Instant", mana: "{2}{G}", mana_cost: "{2}{G}", cmc: 3, keywords: ["Strive"],
  oracle: "Strive — This spell costs {2}{G} more to cast for each target beyond the first.\nDestroy any number of target artifacts and/or enchantments." };
const KIORA = { id: "h-kd", name: "Kiora's Dismissal", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: ["Strive"],
  oracle: "Strive — This spell costs {U} more to cast for each target beyond the first.\nReturn any number of target enchantments to their owners' hands." };

const ench = (id, name, controller) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Enchantment", mana: "{1}{W}", cmc: 2, keywords: [], oracle: "" }, controller });
function mainPhase(hand, pool, aiPerms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const castsOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const sizes = (casts) => casts.map((a) => (a.targets || []).length).sort();

describe("the parse", () => {
  it("⭐ 'any number of' on the permanent lane's destroy and bounce arms — unbounded, zero legal, largest subsets first", () => {
    expect(parseEffectClause("Destroy any number of target artifacts and/or enchantments.", "Instant").atoms[0])
      .toMatchObject({ op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: 99, anyNumber: true });
    expect(parseEffectClause("Return any number of target enchantments to their owners' hands.", "Instant").atoms[0])
      .toMatchObject({ op: "bounce", targetType: "enchantment", minTargets: 0, maxTargets: 99, anyNumber: true });
    // the fixed counts keep their own shape
    expect(parseEffectClause("Destroy up to two target artifacts and/or enchantments.", "Instant").atoms[0]).toMatchObject({ minTargets: 0, maxTargets: 2 });
    expect(parseEffectClause("Return up to two target enchantments to their owners' hands.", "Instant").atoms[0]).toMatchObject({ minTargets: 0, maxTargets: 2 });
    expect(parseEffectProgram(CONSIGN).strivePerTarget).toBe("{2}{G}");
  });
  it("the tiers", () => {
    expect(classifyCard(CONSIGN)).toBe("native-spell");
    expect(classifyCard(KIORA)).toBe("native-spell");
  });
});

describe("runtime — Consign to Dust pays {2}{G} per extra target", () => {
  it("⭐ with {G}{G} + {4} against three enchantments: 0, 1 and 2 targets offered, 3 not; the two-target cast destroys exactly those two", () => {
    const s = mainPhase([CONSIGN], { G: 2, C: 4 }, [ench("a", "A", "ai"), ench("b", "B", "ai"), ench("c", "C", "ai")]);
    const casts = castsOf(s, "h-cd");
    expect(Math.max(...sizes(casts))).toBe(2);
    expect(Math.min(...sizes(casts))).toBe(0);
    const two = casts.find((a) => (a.targets || []).length === 2);
    expect(two.cost).toMatchObject({ G: 2, generic: 4 });
    const resolved = resolveTopOfStack(dispatchAction(s, two));
    const left = resolved.players.ai.battlefield.map((p) => p.id);
    expect(left).toHaveLength(1);
    expect(two.targets.some((t) => t.id === left[0])).toBe(false);
  });
});
