/**
 * discardCost.test.js — BLITZ DC-1 (γ1h, CR 601.2h): the "Discard a card" activation cost (Rummaging
 * Goblin / Mad Prophet / Tin Street Market / Trading Post / the granted looter interiors — and the
 * Immobilizing Ink family returns from its UT-1 eviction WITH runtime support). legalChoices expands
 * one action per DISTINCT-named hand card (copies are fungible); the dispatcher moves the chosen card
 * hand → graveyard BEFORE the ability goes on the stack. Real oracle fixtures (bundled Scryfall,
 * verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RUMMAGING_GOBLIN = { id: "rg", name: "Rummaging Goblin", type: "Creature — Goblin Rogue", power: "1", toughness: "1", mana: "{2}{R}",
  oracle: "{T}, Discard a card: Draw a card." };

describe("parse + classify", () => {
  it("the discard cost models; count/filter variants stay deferred; the looters flip", () => {
    const [ab] = parseActivatedAbilities(RUMMAGING_GOBLIN);
    expect(ab.discardCard).toBe(1);
    expect(ab.costModeled).toBe(true);
    expect(ab.modeled).toBe(true);
    expect(parseActivatedAbilities({ oracle: "{T}, Discard two cards: Draw a card.", type: "Creature", name: "X" })[0]?.modeled).toBeFalsy();
    expect(parseActivatedAbilities({ oracle: "{T}, Discard a creature card: Draw a card.", type: "Creature", name: "Y" })[0]?.modeled).toBeFalsy();
    expect(classifyCard(RUMMAGING_GOBLIN)).toBe("native-activated");
    expect(classifyCard({ id: "ink", name: "Immobilizing Ink", type: "Enchantment — Aura", mana: "{1}{U}",
      oracle: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nEnchanted creature has \"{1}, Discard a card: Untap this creature.\"" })).toBe("native-activated");
  });
});

describe("runtime — the loot loop", () => {
  function board(hand) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const gob = createPermanent({ id: "rg", card: RUMMAGING_GOBLIN, controller: "user", summoningSick: false });
    return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [gob], hand,
        library: [{ id: "l1", name: "Top Card" }] } } };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "rg");

  it("one offer per DISTINCT hand card; dispatch pays the pitch; resolution draws", () => {
    const s = board([{ id: "h1", name: "Bolt", type: "Instant" }, { id: "h2", name: "Bolt", type: "Instant" }, { id: "h3", name: "Bear", type: "Creature" }]);
    const os = offers(s);
    expect(os).toHaveLength(2); // Bolt (copies fungible) + Bear
    const pitchBear = os.find((a) => a.discardCardName === "Bear");
    let after = dispatchAction(s, pitchBear);
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Bear"); // the cost paid up front
    after = resolveTopOfStack(after);
    expect(after.players.user.hand.map((c) => c.name).sort()).toEqual(["Bolt", "Bolt", "Top Card"].sort()); // drew the top
    expect(after.players.user.battlefield.find((p) => p.id === "rg").tapped).toBe(true); // {T} paid too
  });
  it("an empty hand → the cost can't be paid → not offered", () => {
    expect(offers(board([]))).toHaveLength(0);
  });
});
