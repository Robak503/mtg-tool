/**
 * upToNCreatures.test.js — ④-AR (2026-09-04 night): "UP TO TWO / THREE target creatures …" on the creature lane — Markov
 * Warlord / Abandon the Post "up to two target creatures can't block this turn", Unearthly Blizzard (up to three), Deadly
 * Designs' "destroy up to two target creatures", "exile up to two target creatures", "up to two target creatures gain
 * flying". The bounce and pump arms already carried their own multi-count; can't-block, destroy, exile and the keyword
 * grant did not. The same fallback peel as ④-AQ's "up to one": the count word comes off, the verb agrees back to the
 * singular ("gain" → "gains", "each get" → "gets"), the reduced clause parses on its own merits, and the marker
 * minTargets:0 / maxTargets:N lands on a plain creature-targeting atom whose applier loops its chosen targets. Real oracle
 * fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ABANDON = { id: "h-ap", name: "Abandon the Post", type: "Sorcery", mana: "{1}{R}", mana_cost: "{1}{R}", cmc: 2, keywords: ["Flashback"],
  oracle: "Up to two target creatures can't block this turn.\nFlashback {3}{R}" };
const BLIZZARD = { id: "h-ub", name: "Unearthly Blizzard", type: "Sorcery", mana: "{2}{R}", mana_cost: "{2}{R}", cmc: 3, keywords: [],
  oracle: "Up to three target creatures can't block this turn." };

const bear = (id, name, controller) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
function mainPhase(hand, userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: userPerms, manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}

describe("the parse", () => {
  it("⭐ the count word peels off with verb agreement; the marker carries N", () => {
    expect(parseEffectClause("Up to two target creatures can't block this turn.", "Instant").atoms[0]).toMatchObject({ op: "cant-block", targetType: "creature", minTargets: 0, maxTargets: 2 });
    expect(parseEffectClause("Up to three target creatures can't block this turn.", "Instant").atoms[0]).toMatchObject({ op: "cant-block", minTargets: 0, maxTargets: 3 });
    expect(parseEffectClause("Destroy up to two target creatures.", "Instant").atoms[0]).toMatchObject({ op: "destroy", targetType: "creature", minTargets: 0, maxTargets: 2 });
    expect(parseEffectClause("Exile up to two target creatures.", "Instant").atoms[0]).toMatchObject({ op: "exile", targetType: "creature", minTargets: 0, maxTargets: 2 });
    expect(parseEffectClause("Up to two target creatures gain flying until end of turn.", "Instant").atoms[0]).toMatchObject({ op: "pump", grantKeywords: ["Flying"], minTargets: 0, maxTargets: 2 });
    // the arms that already carried a count keep their own shape (the bounce)
    expect(parseEffectClause("Return up to two target creatures to their owners' hands.", "Instant").atoms[0]).toMatchObject({ op: "bounce", minTargets: 0, maxTargets: 2 });
  });
  it("the tiers", () => {
    expect(classifyCard(BLIZZARD)).toBe("native-spell");
    expect(classifyCard(ABANDON)).toBe("native-spell");
  });
});

describe("runtime — zero to N chosen targets, the effect on each", () => {
  it("⭐ Unearthly Blizzard against three bears: the zero-, one-, two- and three-target casts are offered; the two-target cast locks both", () => {
    const s = mainPhase([BLIZZARD], [], [bear("a", "A", "ai"), bear("b", "B", "ai"), bear("c", "C", "ai")]);
    const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "h-ub");
    const sizes = casts.map((x) => (x.targets || []).length);
    expect(Math.min(...sizes)).toBe(0);
    expect(Math.max(...sizes)).toBe(3);
    const two = casts.find((x) => (x.targets || []).length === 2 && x.targets.every((t) => ["a", "b"].includes(t.id)));
    expect(two).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, two));
    expect(permanentHasKeyword(resolved, "a", "cantBlock")).toBe(true);
    expect(permanentHasKeyword(resolved, "b", "cantBlock")).toBe(true);
    expect(permanentHasKeyword(resolved, "c", "cantBlock")).toBe(false);
  });
});
