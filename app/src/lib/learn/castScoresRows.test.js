/**
 * castScoresRows.test.js — ROWS v3: nearTie/top-k cast scores (M5.1, Omnath handoff).
 *
 * pickCastAction's final ranking rides a TICK-SCOPED side-channel (opponentAI.takeLastCastRanking;
 * cleared at every pickAction entry) into the decision recorder: a recorded CAST row carries
 * `castScores` (top-3, ascending = best-first) + `scoreGap` (runnerUp − best; small = near-tie).
 * Non-cast rows stay null — the honest scored-class scope (combat/pending windows have no uniform
 * score). Gated by featuresV=3.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { pickAction, takeLastCastRanking } from "./opponentAI.js";
import { runSelfPlayGame } from "./selfPlayRunner.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { FEATURES_VERSION } from "./gameFeatures.js";

beforeEach(() => _resetIdsForTests());

describe("the side-channel mechanics", () => {
  it("pickAction entry CLEARS a stale ranking; a cast decision fills it; take() reads-and-clears", () => {
    const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const draw3 = { id: "c1", name: "Big Draw", type: "Sorcery", mana: "{2}", oracle: "Draw three cards.", cmc: 2 };
    const draw1 = { id: "c2", name: "Small Draw", type: "Sorcery", mana: "{1}", oracle: "Draw a card.", cmc: 1 };
    const s = {
      ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s0.players, user: { ...s0.players.user, hand: [draw3, draw1], battlefield: [forest("L1"), forest("L2"), forest("L3")], library: [{ id: "x1", name: "X", type: "Sorcery" }] } },
    };
    const casts = [
      { kind: "cast-spell", playerId: "user", cardId: "c1", name: "Big Draw", cost: { generic: 2 }, cmc: 2 },
      { kind: "cast-spell", playerId: "user", cardId: "c2", name: "Small Draw", cost: { generic: 1 }, cmc: 1 },
    ];
    const pick = pickAction(s, "user", casts, {});
    expect(pick).toBeTruthy();
    const ranking = takeLastCastRanking();
    expect(ranking.length).toBe(2);
    expect(ranking[0].score).toBeLessThanOrEqual(ranking[1].score); // ascending = best-first
    expect(ranking[0].cardId).toBe(pick.cardId);                    // the ranking's best IS the pick
    expect(takeLastCastRanking()).toBeNull();                       // read-and-clear
    // A non-cast tick clears any leftover: fill, then run pickAction over a pass-only set.
    pickAction(s, "user", casts, {});
    pickAction(s, "user", [{ kind: "pass-priority", playerId: "user" }], {});
    expect(takeLastCastRanking()).toBeNull();                       // entry-clear killed the stale ranking
  });
});

describe("rows carry the scores end-to-end (featuresV=3)", () => {
  it("a recorded game's CAST rows carry castScores + scoreGap; non-cast rows stay null", () => {
    expect(FEATURES_VERSION).toBe(3);
    const mk = (i, extra) => ({ id: `c${i}`, ...extra });
    const deck = [];
    for (let i = 0; i < 16; i++) deck.push(mk(i, { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }));
    for (let i = 16; i < 24; i++) deck.push(mk(i, { name: "Cheap Draw", type: "Sorcery", mana: "{1}", cmc: 1, oracle: "Draw a card." }));
    for (let i = 24; i < 30; i++) deck.push(mk(i, { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" }));
    const out = runSelfPlayGame({ deckA: deck, deckB: deck.map((c, i) => ({ ...c, id: `d${i}` })), seed: 7, recordDecisions: true });
    const rows = out.decisionTrajectory?.rows || [];
    expect(rows.length).toBeGreaterThan(0);
    const castRows = rows.filter((r) => r.action?.kind === "cast-spell" && r.castScores);
    expect(castRows.length).toBeGreaterThan(0);                     // scored cast decisions recorded
    for (const r of castRows) {
      expect(Array.isArray(r.castScores)).toBe(true);
      expect(r.castScores.length).toBeGreaterThan(0);
      if (r.castScores.length > 1) {
        expect(r.scoreGap).toBeGreaterThanOrEqual(0);               // runnerUp − best, ascending scores
        expect(r.castScores[0].score).toBeLessThanOrEqual(r.castScores[1].score);
      }
    }
    // Non-cast decisions never wear a ranking.
    for (const r of rows.filter((x) => x.action?.kind !== "cast-spell")) {
      expect(r.castScores).toBeNull();
      expect(r.scoreGap).toBeNull();
    }
  });
});
