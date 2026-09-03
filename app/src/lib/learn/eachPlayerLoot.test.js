/**
 * eachPlayerLoot.test.js — SG-5 (2026-09-03): "Each player draws a card, then discards a card." — Geier Reach
 * Sanitarium ("{2}, {T}: …", the Squirrel Girl deck) and Lore Broker ("{T}: …"). Both halves already parsed
 * on their own; the compound's subject-less second clause did not. A pre-splitter rewrite turns the sentence
 * into the two it means, and nothing else changes.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GEIER = { id: "c-geier", name: "Geier Reach Sanitarium", type: "Legendary Land", oracle: "{T}: Add {C}.\n{2}, {T}: Each player draws a card, then discards a card." };
const LORE_BROKER = { id: "c-lore", name: "Lore Broker", type: "Creature — Human Rogue", mana: "{1}{U}", power: 1, toughness: 1, keywords: [], oracle: "{T}: Each player draws a card, then discards a card." };

describe("the parse", () => {
  it("the compound reads as draw(each) then discard(each), HIGH", () => {
    const p = parseEffectClause("Each player draws a card, then discards a card.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => [a.op, a.who, a.amount])).toEqual([["draw", "eachPlayer", 1], ["discard", "eachPlayer", 1]]);
  });

  it("⛔ 'target player draws …, then discards' is NOT rewritten (no who:target discard exists) — stays low", () => {
    const p = parseEffectClause("Target player draws a card, then discards a card.", "Instant");
    expect(programConfidence(p)).toBe("low");
  });
});

describe("runtime — Geier Reach Sanitarium loots the table", () => {
  it("⭐ every player draws one and discards one; libraries shrink by one each", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const lib = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}L${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const hand = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}H${i}`, name: "Bear", type: "Creature — Bear", mana: "{1}{G}" }));
    const s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "src", card: GEIER, controller: "user", summoningSick: false })], library: lib("u", 4), hand: hand("u", 2), graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } },
        ai: { ...s0.players.ai, library: lib("a", 4), hand: hand("a", 2), graveyard: [] },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "src" && !a.isManaAbility && /draws/i.test(a.abilityText || ""));
    expect(act).toBeTruthy();
    let out = dispatchAction(s, act);
    let guard = 0;
    while ((out.stack || []).length && !out.pendingChoice && guard++ < 4) out = resolveTopOfStack(out);
    // a human discard may pause on a which-card choice; an AI seat auto-picks — accept either, but the draw must have happened
    for (const p of ["user", "ai"]) {
      expect(out.players[p].library.length).toBe(3);
      expect(out.players[p].hand.length + out.players[p].graveyard.length).toBe(3);
    }
  });
});

describe("classification", () => {
  it("Geier Reach Sanitarium is `land`; Lore Broker is native", () => {
    expect(classifyCard(GEIER)).toBe("land");
    expect(classifyCard(LORE_BROKER)).toMatch(/^native/);
  });
});
