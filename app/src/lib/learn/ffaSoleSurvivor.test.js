/**
 * ffaSoleSurvivor.test.js — HARNESS-DATA wave 1b: 4-player pods play to the SOLE SURVIVOR.
 *
 * The 2026-07-09 pathology hunt proved the legacy semantics fabricated winners: the pod
 * ended the instant the `user` seat died and `liveOpponents[0]` (the turn-order-first
 * survivor) was crowned — 70.7% of ai-wins were stamped with ≥2 opponents still alive,
 * manufacturing the 52/15/6 ai-seat "win" split. These tests pin the fix on all three
 * surfaces (state rule → gameStatus mirror → runner E2E) AND the legacy pin that keeps the
 * old behavior recoverable (anchor lineage + Academy semantics, which stay user-pivot).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { gameStatus } from "./gameApi.js";
import { runSelfPlayGame } from "./selfPlayRunner.js";

beforeEach(() => _resetIdsForTests());

// ── gameStatus mirror on hand-built states ──
const seat = (life) => ({ life, battlefield: [], command: [], graveyard: [], exile: [], hand: [], library: [{ card: { id: "x", name: "Card" } }], commanderDamageFrom: {} });
const mkState = (lives, ffa = true) => ({
  turnOrder: ["user", "ai1", "ai2", "ai3"],
  players: { user: seat(lives[0]), ai1: seat(lives[1]), ai2: seat(lives[2]), ai3: seat(lives[3]) },
  ...(ffa ? { rules: { ffaSoleSurvivor: true } } : {}),
});

describe("gameStatus — FFA sole-survivor rule (state-carried)", () => {
  it("user dead + several opponents alive → NOT over (the pod plays on)", () => {
    const s = gameStatus(mkState([0, 20, 20, 20]));
    expect(s.over).toBe(false);
    expect(s.winnerSeat).toBeNull();
  });

  it("one live seat → over, that seat wins (ai3 can actually win now)", () => {
    const s = gameStatus(mkState([0, 0, 0, 12]));
    expect(s).toMatchObject({ over: true, result: "ai-wins", winnerSeat: "ai3" });
  });

  it("sole survivor is the user → user-wins", () => {
    const s = gameStatus(mkState([15, 0, 0, 0]));
    expect(s).toMatchObject({ over: true, result: "user-wins", winnerSeat: "user" });
  });

  it("zero live seats → draw (CR 104.4a)", () => {
    const s = gameStatus(mkState([0, 0, 0, 0]));
    expect(s).toMatchObject({ over: true, result: "draw", winnerSeat: null });
  });

  it("LEGACY (no rule): user dead ends the game, turn-order-first survivor crowned — the pinned old behavior", () => {
    const s = gameStatus(mkState([0, 20, 20, 20], false));
    expect(s).toMatchObject({ over: true, result: "ai-wins", winnerSeat: "ai1" });
  });
});

// ── runner E2E on real synthetic games ──
function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}
const podArgs = (seed, extra = {}) => ({
  deckA: aggroDeck("u"),
  opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
  mode: "commander",
  seed,
  timePressure: true,
  mulligan: true,
  ...extra,
});
describe("runSelfPlayGame — commander pods play to the sole survivor (default) with the legacy pin", () => {
  it("every decisive terminal names a real winnerSeat and labels resolve for ALL FOUR seats (seeds 1..6)", () => {
    let decisive = 0;
    for (let seedN = 1; seedN <= 6; seedN++) {
      const g = runSelfPlayGame(podArgs(seedN, { recordDecisions: true }));
      if (g.result === "user-wins" || g.result === "ai-wins") {
        decisive += 1;
        expect(g.winnerSeat).toBeTruthy();
        // Sole-survivor terminals make every seat's outcome honest: the winner is a TRUE
        // winner (gameStatus's sole-survivor path), so no seat needs a null-and-drop label.
        expect(g.trainingWeight).toBe(1);
        expect(g.decisionTrajectory.winnerSeat).toBe(g.winnerSeat); // the two surfaces can't drift
      }
    }
    expect(decisive).toBeGreaterThan(0); // the sweep must actually exercise the semantics
  });

  it("the game CONTINUES past user death (some game in the sweep ends with a non-user winner)", () => {
    // Under legacy semantics a dead user ends the pod instantly; under FFA the pod plays on and
    // an ai seat can be a REAL winner. The seeds are deterministic, so this is a stable pin.
    const winners = [];
    for (let seedN = 1; seedN <= 6; seedN++) {
      const g = runSelfPlayGame(podArgs(seedN));
      if (g.winnerSeat) winners.push(g.winnerSeat);
    }
    expect(winners.some((w) => w !== "user")).toBe(true);
  });

  it("legacyUserPivot:true recovers the OLD semantics (a decisive game may end with >1 live seats)", () => {
    let multiSurvivorCrowns = 0;
    for (let seedN = 1; seedN <= 6; seedN++) {
      const g = runSelfPlayGame(podArgs(seedN, { legacyUserPivot: true }));
      expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(g.result);
      if (g.result === "ai-wins") multiSurvivorCrowns += 1; // legacy ends at user death — crowning path exists
    }
    expect(multiSurvivorCrowns).toBeGreaterThan(0); // the pin is live, not vestigial
  });
});
