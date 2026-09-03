/**
 * dosanCastLock.test.js — SG-8 (2026-09-03): Dosan the Falling Leaf — "Players can cast spells only during
 * their own turns." (the Squirrel Girl deck). A symmetric static (CR 604.2): while ANY battlefield permanent
 * prints it, no player may cast a spell on another player's turn — the instant-speed cast gate refuses,
 * own-turn casting is untouched. The static parser emits a coverage marker off the same sentence.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { castOwnTurnOnlyLock } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DOSAN = { id: "c-dosan", name: "Dosan the Falling Leaf", type: "Legendary Creature — Human Monk", mana: "{1}{G}{G}", power: 2, toughness: 3, keywords: [], oracle: "Players can cast spells only during their own turns." };
const OPT = { id: "h-opt", name: "Opt", type: "Instant", mana: "{U}", mana_cost: "{U}", oracle: "Scry 1.\nDraw a card." };

function board({ dosanController = null, activePlayer, priorityHolder = "user" }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const dosan = dosanController ? [createPermanent({ id: "dosan", card: DOSAN, controller: dosanController, summoningSick: false })] : [];
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer, priorityHolder, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [OPT], battlefield: dosanController === "user" ? dosan : [], manaPool: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: dosanController === "ai" ? dosan : [] },
    },
  };
}
const canCastOpt = (s) => legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-opt");

describe("the lock", () => {
  it("reads the sentence; a near-miss does not", () => {
    expect(castOwnTurnOnlyLock(DOSAN)).toBe(true);
    expect(castOwnTurnOnlyLock({ oracle: "Players can cast spells only during their own turns if they control a Forest." })).toBe(false);
  });

  it("⭐ with Dosan out, the user cannot cast Opt on the AI's turn — but can on their own", () => {
    expect(canCastOpt(board({ dosanController: "user", activePlayer: "ai" }))).toBe(false);
    expect(canCastOpt(board({ dosanController: "user", activePlayer: "user" }))).toBe(true);
  });

  it("⛔ symmetric: the OPPONENT's Dosan locks the user off-turn too", () => {
    expect(canCastOpt(board({ dosanController: "ai", activePlayer: "ai" }))).toBe(false);
  });

  it("without Dosan, an off-turn instant is castable as before", () => {
    expect(canCastOpt(board({ dosanController: null, activePlayer: "ai" }))).toBe(true);
  });
});

describe("classification", () => {
  it("Dosan is native; a rider parks", () => {
    expect(classifyCard(DOSAN)).toMatch(/^native/);
    expect(classifyCard({ ...DOSAN, oracle: "Players can cast spells only during their own turns if they control a Forest." })).not.toMatch(/^native/);
  });
});
