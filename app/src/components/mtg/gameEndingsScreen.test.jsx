/**
 * gameEndingsScreen.test.jsx — what a person sees and clicks as an Academy game ends (2026-10-22).
 *
 *   - "Abandon game" on a game in progress ends it on the server (useLearnSession.abandon → POST /api/learn/abandon);
 *     until now it only reset the page, so the game stayed under "Continue a game". On a game already over it is just
 *     the way back to the deck picker, like the end card's "New game".
 *   - The header names the decks the GAME carries (start / resume / resume-puzzle answer them), never the deck pickers:
 *     after a restart the pickers are empty and a resumed game read "You vs Opponent".
 *   - A puzzle attempt the person abandoned gets no puzzle verdict over its end card, and leaving a missed attempt that
 *     is still in progress ("Back to Academy") ends it the same way, so it is not left under "Continue a game".
 *   - The records name the table from the fields the routes write (`userDeckName`, `opponentNames`) — every Academy
 *     record read "—" — and the Crucible's result labels read "abandoned".
 *
 * SSR via react-dom/server (the project bans jsdom/RTL — see SimCenter.test.jsx). The hook is mocked with a plain
 * session object, and the JSX runtime is wrapped to keep every element's props, so a button's real onClick handler can
 * be called.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const seen = vi.hoisted(() => ({ props: [], session: null }));
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, jsxDEV: (type, props, ...rest) => { seen.props.push(props); return real.jsxDEV(type, props, ...rest); } };
});
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const real = await importOriginal();
  const keep = (fn) => (type, props, ...rest) => { seen.props.push(props); return fn(type, props, ...rest); };
  return { ...real, jsx: keep(real.jsx), jsxs: keep(real.jsxs) };
});
vi.mock("../../hooks/useLearnSession", async (importOriginal) => ({ ...(await importOriginal()), default: () => seen.session }));

import LearnView from "./LearnView.jsx";
import * as Records from "./RecordsView.jsx";
import CrucibleRail from "./CrucibleRail.jsx";
import * as hook from "../../hooks/useLearnSession.js";

const text = (markup) => markup.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const seat = (id) => ({ id, isUser: id === "user", life: 20, handCount: 0, hand: id === "user" ? [] : null, libraryCount: 50,
  lands: [], permanents: [], graveyard: [], exile: [], command: [], manaPool: id === "user" ? {} : null });
const board = { stack: [], players: [seat("user"), seat("ai")] };
const ABANDONED = { kind: "game-over", reason: "abandoned" };

/** A session as useLearnSession hands it to LearnView: a game resumed after a restart (the deck pickers are empty). */
function session(over = {}) {
  return {
    status: "active",
    sessionId: "learn-game-1",
    mode: "standard",
    difficulty: "beginner",
    turn: 3,
    activePlayer: "user",
    step: "main",
    table: [],
    board,
    decision: { kind: "ask", prompt: "Your pre-combat main phase.", options: [{ kind: "pass-priority", playerId: "user" }] },
    decisionLogTail: [],
    puzzle: null,
    userDeckName: "Forest Bears",
    opponentDeckNames: ["Bear Forest"],
    saveFailure: null,
    saveFailureDismissed: false,
    error: null,
    reset: vi.fn(),
    abandon: vi.fn(async () => ABANDONED),
    applyChoice: vi.fn(),
    listSaves: vi.fn(async () => []),
    listPuzzles: vi.fn(async () => []),
    ...over,
  };
}

/** Render the Academy for `s`; returns its text and the props of every element it built. */
function renderAcademy(s) {
  seen.session = s;
  seen.props = [];
  const html = text(renderToStaticMarkup(createElement(LearnView, { savedDecks: [], fontFamily: "serif" })));
  return { html, props: seen.props.slice() };
}
// An export of the (mocked) hook module, or undefined — the mock proxy throws on a name the module lacks.
const hookExport = (name) => (name in hook ? hook[name] : undefined);
const button = (props, label) => props.find((p) => p && p.children === label && typeof p.onClick === "function");

beforeEach(() => {
  seen.props = [];
  seen.session = null;
});

describe("the header names the decks the game carries", () => {
  it("a resumed game (empty deck pickers) reads its own decks, not “You vs Opponent”", () => {
    const { html } = renderAcademy(session());
    expect(html).toContain("The Academy · Forest Bears vs Bear Forest");
    expect(html).not.toContain("You vs Opponent");
  });

  it("control: a Commander game keeps its pod title", () => {
    const { html } = renderAcademy(session({ mode: "commander", opponentDeckNames: ["A", "B", "C"] }));
    expect(html).toContain("The Academy · Commander 4P pod");
  });
});

describe("“Abandon game”", () => {
  it("on a game in progress ends it on the server (abandon with its id), not just the page", async () => {
    const s = session();
    const { props } = renderAcademy(s);
    const abandonButton = button(props, "Abandon game");
    expect(abandonButton).toBeTruthy();
    await abandonButton.onClick();
    expect(s.abandon).toHaveBeenCalledTimes(1);
    expect(s.abandon).toHaveBeenCalledWith("learn-game-1");
    expect(s.reset).not.toHaveBeenCalled();
  });

  it("at the opening-hand mulligans ends it on the server too", async () => {
    const s = session({ decision: { kind: "mulligan", hand: [], mulligansTaken: 0, options: [] } });
    const { props } = renderAcademy(s);
    await button(props, "Abandon game").onClick();
    expect(s.abandon).toHaveBeenCalledWith("learn-game-1");
  });

  it("control: on a game already over it is the way back to the deck picker", async () => {
    const s = session({ status: "ended", decision: { kind: "game-over", reason: "ai-wins" } });
    const { props } = renderAcademy(s);
    await button(props, "Abandon game").onClick();
    expect(s.reset).toHaveBeenCalledTimes(1);
    expect(s.abandon).not.toHaveBeenCalled();
  });

  it("control: the end card says the person ended it, and its “New game” goes back to the deck picker", async () => {
    const s = session({ status: "ended", decision: ABANDONED });
    const { html, props } = renderAcademy(s);
    expect(html).toContain(">Game abandoned.</h2>");
    expect(html).toContain("<p>You ended the game early.");
    await button(props, "New game").onClick();
    expect(s.reset).toHaveBeenCalledTimes(1);
    expect(s.abandon).not.toHaveBeenCalled();
  });
});

describe("a puzzle attempt", () => {
  const puzzle = { id: "pz-1", goal: { type: "win-this-turn" }, startTurn: 3 };

  it("abandoned: no puzzle verdict over its end card", () => {
    const { html } = renderAcademy(session({ puzzle, status: "ended", decision: ABANDONED }));
    expect(html).toContain(">Game abandoned.</h2>");
    expect(html).not.toContain("Puzzle failed");
    expect(html).not.toContain("Puzzle solved");
  });

  it("missed and still in progress: “Back to Academy” ends it like “Abandon game”, then goes back to the deck picker", async () => {
    const s = session({ puzzle, turn: 4 }); // the turn passed without the win
    const { html, props } = renderAcademy(s);
    expect(html).toContain("Puzzle failed");
    await button(props, "Back to Academy").onClick();
    expect(s.abandon).toHaveBeenCalledWith("learn-game-1");
    expect(s.reset).toHaveBeenCalledTimes(1);
  });

  it("control: a solved attempt (the game is over) goes straight back", async () => {
    const s = session({ puzzle, status: "ended", decision: { kind: "game-over", reason: "user-wins" } });
    const { html, props } = renderAcademy(s);
    expect(html).toContain("Puzzle solved");
    await button(props, "Back to Academy").onClick();
    expect(s.reset).toHaveBeenCalledTimes(1);
    expect(s.abandon).not.toHaveBeenCalled();
  });
});

describe("the hook's side of an abandon", () => {
  const prev = { ...session(), decision: { kind: "ask", options: [] }, status: "active" };

  it("the server's answer: the game over with its end decision; nothing to end (404 / 409): back to the deck picker; a failure: the deck picker, saying so", () => {
    expect(typeof hookExport("stateAfterAbandon")).toBe("function");
    const ended = hook.stateAfterAbandon(prev, 200, { sessionId: "learn-game-1", decision: ABANDONED, status: "abandoned", turn: 3, activePlayer: "user", step: "main", table: [], board, decisionLogTail: [] });
    expect(ended).toMatchObject({ status: "ended", decision: ABANDONED, sessionId: "learn-game-1", userDeckName: "Forest Bears", error: null });

    for (const gone of [404, 409]) {
      expect(hook.stateAfterAbandon(prev, gone, { error: "x" })).toMatchObject({ status: "idle", sessionId: null, error: null });
    }
    const failed = hook.stateAfterAbandon(prev, 500, { error: "EPERM: operation not permitted" });
    expect(failed).toMatchObject({ status: "idle", sessionId: null });
    expect(failed.error).toBe("The game could not be abandoned: EPERM: operation not permitted. It may still be listed under “Continue a game”.");
  });

  it("deck names from a game-opening response", () => {
    expect(typeof hookExport("deckNamesFrom")).toBe("function");
    expect(hook.deckNamesFrom({ userDeckName: "Forest Bears", opponentDeckNames: ["Bear Forest", 7] })).toEqual({ userDeckName: "Forest Bears", opponentDeckNames: ["Bear Forest"] });
    expect(hook.deckNamesFrom({})).toEqual({ userDeckName: null, opponentDeckNames: [] });
  });
});

describe("the records name the table and read the result", () => {
  it("seatLine reads what the routes write — your deck, then each opponent's", () => {
    expect(Records.seatLine({ userDeckId: "d1", userDeckName: "Forest Bears", opponentNames: ["Bear Forest"] })).toBe("Forest Bears vs Bear Forest");
    expect(Records.seatLine({ userDeckName: "Mine", opponentNames: ["A", "B", "C"] })).toBe("Mine vs A vs B vs C");
    expect(Records.seatLine({ userDeckName: null, opponentNames: ["Bear Forest"] })).toBe("You vs Bear Forest");
    expect(Records.seatLine({ userDeckName: "Forest Bears", opponentNames: [], puzzleId: "pz-1" })).toBe("Forest Bears");
  });

  it("control: a record with no names reads “—”, and seat names (the self-play meta) are still read", () => {
    expect(Records.seatLine(null)).toBe("—");
    expect(Records.seatLine({ userDeckName: null, opponentNames: [] })).toBe("—");
    expect(Records.seatLine({ seatNames: ["Deck A", "Deck B"] })).toBe("Deck A vs Deck B");
  });

  it("the Crucible's result label (its home and Teferi's rail): abandoned and stopped games say so", () => {
    expect(typeof Records.recordStatusLabel).toBe("function");
    expect(Records.recordStatusLabel("abandoned")).toBe("Abandoned (no result)");
    expect(Records.recordStatusLabel("engine-stopped")).toBe("Stopped (no result)");
    expect(Records.recordStatusLabel("user-wins")).toBe("You won");
    expect(Records.recordStatusLabel("ai-wins")).toBe("The engine won");
    expect(Records.recordStatusLabel("draw")).toBe("Draw");
  });

  it("Teferi's rail shows the latest table by its decks and an abandoned game's result", () => {
    const html = text(renderToStaticMarkup(createElement(CrucibleRail, {
      fontFamily: "serif",
      records: [{ id: "learn-game-1", status: "abandoned", turns: 3, difficulty: "beginner", endedAt: "2026-10-22T10:00:00.000Z", logLines: 4, meta: { userDeckName: "Forest Bears", opponentNames: ["Bear Forest"] } }],
    })));
    expect(html).toContain("Forest Bears vs Bear Forest");
    expect(html).toContain("Abandoned (no result)");
    expect(html).not.toContain("Unknown result");
  });
});
