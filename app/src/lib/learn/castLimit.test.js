/**
 * castLimit.test.js — BLITZ RL-1 (CR 604.2): "Each player can't cast more than one spell each turn."
 * (Rule of Law / Arcane Laboratory / Eidolon of Rhetoric). While ANY battlefield carries the static, a
 * player whose spellsCastThisTurn ≥ 1 is offered NO cast-family actions (the cantCast gate); land drops,
 * activations and special actions are untouched (only CASTING is limited, CR 601). The marker static
 * classifies the line as modeled (the blockRestriction pattern); castsPerTurnLimitOf is the ONE reader
 * both sides consult. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { castsPerTurnLimitOf } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RULE_OF_LAW = { id: "rol", name: "Rule of Law", type: "Enchantment", mana: "{2}{W}",
  oracle: "Each player can't cast more than one spell each turn." };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}",
  oracle: "Lightning Bolt deals 3 damage to any target." };

describe("reader + classify", () => {
  it("the exact line reads limit 1; variants stay null and park", () => {
    expect(castsPerTurnLimitOf(RULE_OF_LAW)).toBe(1);
    expect(castsPerTurnLimitOf({ oracle: "Enchanted player can't cast more than one spell each turn." })).toBe(null);
    expect(classifyCard(RULE_OF_LAW)).toBe("native-static");
    expect(classifyCard({ id: "eor", name: "Eidolon of Rhetoric", type: "Enchantment Creature — Spirit", power: "1", toughness: "4", mana: "{2}{W}",
      oracle: "Each player can't cast more than one spell each turn." })).toBe("native-static");
  });
});

describe("runtime — the cast gate", () => {
  function board({ withLaw, castsSoFar }) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mtn = createPermanent({ id: "m1", card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false });
    const perms = withLaw ? [mtn, createPermanent({ id: "rol", card: RULE_OF_LAW, controller: "ai1", summoningSick: false })] : [mtn];
    const own = perms.filter((p) => p.controller === "user");
    const theirs = perms.filter((p) => p.controller === "ai1");
    return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players,
        user: { ...s.players.user, battlefield: own, hand: [BOLT], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, spellsCastThisTurn: castsSoFar },
        ai1: { ...s.players.ai1, battlefield: theirs } } };
  }
  const castOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");

  it("under the law: the second cast this turn is not offered; the first is; no law → unrestricted", () => {
    expect(castOffers(board({ withLaw: true, castsSoFar: 0 })).length).toBeGreaterThan(0);  // first cast fine
    expect(castOffers(board({ withLaw: true, castsSoFar: 1 }))).toHaveLength(0);            // second suppressed
    expect(castOffers(board({ withLaw: false, castsSoFar: 1 })).length).toBeGreaterThan(0); // no law → free
    // Non-cast actions survive the law (tap-for-mana / pass are untouched).
    const limited = legalActionsForPlayer(board({ withLaw: true, castsSoFar: 1 }), "user");
    expect(limited.some((a) => a.kind === "tap-for-mana" || a.kind === "pass-priority")).toBe(true);
  });
});
