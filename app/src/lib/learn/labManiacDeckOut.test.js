/**
 * labManiacDeckOut.test.js — LABORATORY MANIAC + THE DECK-OUT RULE ITSELF (2026-08-14).
 * "If you would draw a card while your library has no cards in it, you win the game instead."
 *
 * ⭐⭐ THE BASE RULE WAS THE REAL GAP: CR 104.3c / 120.3 deck-out was NOT modeled — drawCards silently
 * drew fewer, its own doc-comment claimed "the engine handles deck-out as a state-based action", and no
 * such SBA existed (the "decking" epoch label was a post-hoc died-while-empty heuristic). A hollow
 * claim, found because Lab Man's win-INSTEAD had no loss to replace. Both halves built together:
 *   · drawCards stamps `triedToDrawFromEmpty` on a shortfall (CR 120.3 — draw what's there, lose at
 *     the next SBA check); isPlayerDead reads the stamp (after the can't-lose guard, CR 104.3a).
 *   · a live Lab-Man static flips the same shortfall to `wonGame` instead (CR 614.1) — the INERT
 *     layer-6 op emptyDrawWins, consumed at the ONE draw chokepoint.
 * hasWonGame's cantWin guard (Abyssal Persecutor) applies ON READ: with both statics live the player
 * neither wins nor decks out — the draw stays replaced, the printed CR 614.1 behaviour. Witnessed.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · parser arm disabled -> Lab Man parks (body-only).
 *   · the winsInstead branch removed at the chokepoint -> the Lab-Man witness DECKS OUT instead of winning.
 *   · the isPlayerDead stamp-read removed -> nobody ever decks out (the base-rule witness dies).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, drawCards } from "./gameState.js";
import { hasWonGame, isPlayerDead } from "./learnSession.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const LAB_MAN = { id: "c-lm", name: "Laboratory Maniac", type: "Creature — Human Wizard", mana: "{2}{U}",
  power: "2", toughness: "2", oracle: "If you would draw a card while your library has no cards in it, you win the game instead." };
const ABYSSAL_PERSECUTOR = { id: "c-ap", name: "Abyssal Persecutor", type: "Creature — Demon", mana: "{2}{B}{B}",
  power: "6", toughness: "6", oracle: "Flying, trample\nYou can't win the game and your opponents can't lose the game." };

function board({ battlefield = [], library = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perms = battlefield.map((card, i) => createPermanent({ id: "src" + i, card, controller: "user", summoningSick: false }));
  return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: perms, library, hand: [] } } };
}

describe("the carrier and the shape", () => {
  it("⭐ Laboratory Maniac flips native-static; the line parses to the self-scoped op", () => {
    expect(classifyCard(LAB_MAN)).toBe("native-static");
    expect(parseStaticAbilities(LAB_MAN).map((e) => e.op)).toEqual([{ layerOp: "emptyDrawWins" }]);
  });
});

describe("⭐⭐ LAW 6 — deck-out is REAL, and Lab Man replaces it with the win", () => {
  it("⭐⭐ the base rule: an empty-library draw stamps the CR 120.3 loss — the player is dead at the next check", () => {
    const s = drawCards(board(), { playerId: "user", count: 1 });
    const row = { dead: isPlayerDead(s, "user"), won: hasWonGame(s, "user"), handSize: s.players.user.hand.length };
    console.log("  WITNESS deckOutLoss", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dead: true, won: false, handSize: 0 });
  });

  it("⭐⭐ with Lab Man out, the same draw WINS instead — no loss stamp", () => {
    const s = drawCards(board({ battlefield: [LAB_MAN] }), { playerId: "user", count: 1 });
    const row = { dead: isPlayerDead(s, "user"), won: hasWonGame(s, "user") };
    console.log("  WITNESS labManWin", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dead: false, won: true });
  });

  it("⭐ CR 120.3 shortfall: library of 1, draw 3 — the one card IS drawn, the shortfall still triggers", () => {
    const lib = [{ id: "lib1", name: "Island", type: "Basic Land — Island", oracle: "" }];
    const s = drawCards(board({ library: lib }), { playerId: "user", count: 3 });
    const row = { drew: s.players.user.hand.length, dead: isPlayerDead(s, "user") };
    console.log("  WITNESS shortfallDraw", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ drew: 1, dead: true });
  });

  it("⛔⛔ Lab Man + Abyssal Persecutor: the draw is REPLACED but the win is blocked — neither win nor deck-out (CR 614.1 + 104.2a)", () => {
    const s = drawCards(board({ battlefield: [LAB_MAN, ABYSSAL_PERSECUTOR] }), { playerId: "user", count: 1 });
    const row = { dead: isPlayerDead(s, "user"), won: hasWonGame(s, "user") };
    console.log("  WITNESS labManCantWin", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dead: false, won: false });
  });

  it("⛔ SILENCE: a normal draw with Lab Man out is just a draw — no win, no stamp", () => {
    const lib = [{ id: "lib1", name: "Island", type: "Basic Land — Island", oracle: "" }];
    const s = drawCards(board({ battlefield: [LAB_MAN], library: lib }), { playerId: "user", count: 1 });
    const row = { drew: s.players.user.hand.length, dead: isPlayerDead(s, "user"), won: hasWonGame(s, "user") };
    console.log("  WITNESS labManSilence", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ drew: 1, dead: false, won: false });
  });

  it("⛔ an OPPONENT's Lab Man does not save you (self-scoped static)", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "srcO", card: LAB_MAN, controller: "ai1", summoningSick: false });
    const s0 = { ...g, players: { ...g.players, ai1: { ...g.players.ai1, battlefield: [perm] }, user: { ...g.players.user, library: [], hand: [] } } };
    const s = drawCards(s0, { playerId: "user", count: 1 });
    expect(isPlayerDead(s, "user")).toBe(true);
    expect(hasWonGame(s, "user")).toBe(false);
  });
});
