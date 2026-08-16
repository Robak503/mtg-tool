/**
 * anyPlayerDraw.test.js — "Whenever A PLAYER draws a card, …" (SHELF-TAIL ND1 — Spiteful Visions; CR 121.2).
 *
 * The SYMMETRIC twin of the opponentDraw watcher (Underworld Dreams / Fate Unraveler, already native):
 * "a player draws" fires for EVERY draw, the controller's own included. scope:"anyDraw" is fired in BOTH
 * checkCardDrawnTriggers scans — the drawer's OWN sources (like "you draw") and the drawer's OPPONENTS'
 * sources (like "opponentDraw") — so a single watcher punishes all draws. The "that player" referent still
 * rewrites to the drawing player (the cardDrawn rewrite is event-gated, not scope-gated), so the payload
 * (deals 1 damage to the drawing player) is byte-identical to the opponent form. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): the detection arm → not detected → classify + fires die; the scopeMatches
 * anyDraw case → fires die; the opponent-scan scopeFilter widening → the OPPONENT-draw fire pin dies (the
 * watcher stops punishing opponents' draws — the exact half a naive "you draw"-only read would miss).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "At the beginning of each player's draw step, that player draws an additional card.\nWhenever a player draws a card, Spiteful Visions deals 1 damage to that player.";
const spitefulCard = { id: "c-spite", name: "Spiteful Visions", type: "Enchantment", mana: "{2}{R}{R}", oracle: ORACLE };

function board(ownerOfSpiteful) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = { id: "spite", controller: ownerOfSpiteful, card: spitefulCard };
  const P = s0.players;
  return { ...s0, players: { ...P, [ownerOfSpiteful]: { ...P[ownerOfSpiteful], battlefield: [perm] } } };
}
const drawnBy = (state, pid) => (checkCardDrawnTriggers({ ...state, players: { ...state.players, [pid]: { ...state.players[pid], cardsDrawnThisTurn: 1 } } }, pid, 1).pendingTriggers || []);

describe("ND1 — detection + classify", () => {
  it("'a player draws a card' → cardDrawn anyDraw; the opponent form is unchanged", () => {
    expect(detectTriggers({ name: "X", type: "Enchantment", oracle: "Whenever a player draws a card, this enchantment deals 1 damage to that player." })[0])
      .toMatchObject({ event: "cardDrawn", scope: "anyDraw", whose: "any" });
    expect(detectTriggers({ name: "Y", type: "Enchantment", oracle: "Whenever an opponent draws a card, this enchantment deals 1 damage to that player." })[0])
      .toMatchObject({ event: "cardDrawn", scope: "opponentDraw" });
  });
  it("Spiteful Visions classifies native-trigger", () => {
    expect(classifyCard({ name: "Spiteful Visions", type: "Enchantment", oracle: ORACLE })).toBe("native-trigger");
  });
});

describe("ND1 — the symmetric scope fires on BOTH the controller's AND an opponent's draw", () => {
  it("user's Spiteful fires when the USER draws (own-draw scan) — targeting the user", () => {
    const fired = drawnBy(board("user"), "user").filter((t) => t.source?.permanentId === "spite");
    expect(fired.length).toBe(1);
    expect(fired[0].context.drawingPlayerId).toBe("user");
  });
  it("THE MUTATION PIN — user's Spiteful fires when an OPPONENT draws (opponent-draw scan)", () => {
    const fired = drawnBy(board("user"), "ai1").filter((t) => t.source?.permanentId === "spite");
    expect(fired.length).toBe(1);
    expect(fired[0].context.drawingPlayerId).toBe("ai1"); // the drawing opponent is the damage target
  });
  it("an unrelated third player's draw also fires it (any player, not just one opponent)", () => {
    const fired = drawnBy(board("user"), "ai2").filter((t) => t.source?.permanentId === "spite");
    expect(fired.length).toBe(1);
  });
});
