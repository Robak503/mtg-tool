/**
 * castNthOpponentsTurn.test.js — the DURING-EACH-OPPONENT'S-TURN rider on the castNth event (2026-08-14
 * — Wavebreak Hippocamp "Whenever you cast your first spell during each opponent's turn, draw a card").
 * Flip-diff +5/0/0: Wavebreak, Dreamstalker Manticore, Mischievous Chimera, Arena Trickster, Nymris.
 *
 * ⭐ TWO SMALL PIECES: the blanket qualifier-refusal (any "during" → null) gained an EXACT-phrase
 * exemption so the castNth arm can see the rider, and the fire handler gained the turn gate (fire only
 * when the ACTIVE player is an opponent of the watcher's controller — the printed scope, never wider).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the exemption removed -> all five park (the refusal eats the rider again).
 *   · the fire-time turn gate removed -> the own-turn silence row dies (the over-fire direction).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WAVEBREAK = { id: "c-wh", name: "Wavebreak Hippocamp", type: "Creature — Horse Fish", mana: "{1}{U}", power: "1", toughness: "3",
  oracle: "Whenever you cast your first spell during each opponent's turn, draw a card." };

describe("the carriers", () => {
  it("⭐ Wavebreak flips; the descriptor carries the rider flag", () => {
    expect(classifyCard(WAVEBREAK)).toMatch(/^native/);
    const d = detectTriggers(WAVEBREAK).find((t) => t.event === "castNth");
    expect(d).toMatchObject({ nth: 1, whose: "you", duringOpponentsTurn: true });
  });
});

describe("⭐⭐ LAW 6 — fires on an OPPONENT's turn, silent on your own", () => {
  function board(activePlayer) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const watcher = createPermanent({ id: "WH", controller: "user", summoningSick: false, card: WAVEBREAK });
    return { ...s0, activePlayer,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [watcher], spellsCastThisTurn: 1 } } };
  }
  const SPELL = { id: "sp1", name: "Opt", type: "Instant", mana: "{U}", oracle: "Draw a card." };

  it("⭐⭐ my first spell on AI1's turn: the trigger fires", () => {
    const fired = checkCastTriggers(board("ai1"), { spellCard: SPELL, casterId: "user" });
    const mine = (fired.pendingTriggers || []).filter((t) => t.source?.name === "Wavebreak Hippocamp");
    console.log("  WITNESS wavebreakFires", JSON.stringify({ count: mine.length })); // vitest 4 needs --disable-console-intercept
    expect(mine.length).toBe(1);
  });

  it("⛔⛔ my first spell on MY OWN turn: SILENT — the printed scope, never wider", () => {
    const fired = checkCastTriggers(board("user"), { spellCard: SPELL, casterId: "user" });
    const mine = (fired.pendingTriggers || []).filter((t) => t.source?.name === "Wavebreak Hippocamp");
    console.log("  WITNESS wavebreakOwnTurnSilent", JSON.stringify({ count: mine.length })); // vitest 4 needs --disable-console-intercept
    expect(mine.length).toBe(0);
  });
});
