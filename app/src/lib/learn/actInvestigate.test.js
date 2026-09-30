/**
 * Integration tests for KWACT-INVEST — the "Investigate" keyword action.
 *
 * "Investigate" (and "Investigate N times") is an alias for "create [N] Clue token(s)" (CR 701.16), wired to
 * the shipped TOK-2 create-named-token(clue) atom (a real artifact with "{2}, Sacrifice: Draw a card"). The
 * parser change is first-person only — a 3rd-person "<subject> investigates" stays on the Arbiter so a Clue
 * is never minted for the wrong player.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}

describe("KWACT-INVEST — classification", () => {
  it("a first-person Investigate (spell effect / ETB trigger) is native; the rest of the card must also be modeled", () => {
    expect(classifyCard({ name: "Deduce", type: "Sorcery", oracle: "Draw a card. Investigate." })).toBe("native-spell");
    expect(classifyCard({ name: "Confirm Suspicions", type: "Instant", oracle: "Counter target spell. Investigate three times." })).toBe("native-spell");
    expect(classifyCard({ name: "Thraben Inspector", type: "Creature — Human Soldier", oracle: "When this creature enters, investigate." })).toBe("native-trigger");
  });
  it("a 3rd-person (wrong-owner) or variable-count investigate is NOT native", () => {
    expect(classifyCard({ name: "Wrong", type: "Sorcery", oracle: "Each player investigates." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Variable", type: "Sorcery", oracle: "Investigate X times." })).toBe("arbiter-spell");
  });
});

describe("KWACT-INVEST — resolve creates a real Clue token", () => {
  it("casting Deduce draws a card AND puts a Clue artifact token on the battlefield", () => {
    const deduce = { id: "card-deduce", name: "Deduce", type: "Sorcery", mana: "{1}{U}", oracle: "Draw a card. Investigate." };
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [deduce], library: [{ id: "lib1", name: "L1" }], manaPool: { ...s.players.user.manaPool, U: 1, C: 1 } } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "card-deduce");
    expect(cast).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.players.user.hand.some((c) => c.id === "lib1")).toBe(true);                        // drew the card
    expect(after.players.user.battlefield.some((p) => /Clue/.test(p.card?.type || ""))).toBe(true); // Clue token minted
  });
});
