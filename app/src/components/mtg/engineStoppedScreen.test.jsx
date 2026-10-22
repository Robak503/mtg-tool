/**
 * engineStoppedScreen.test.jsx — the screen a person sees when one of the engine's guards stops their Academy game
 * (2026-10-22): the board's end-of-game card says the engine stopped the game, what stopped it, and that nobody won or
 * lost, with the usual "New game" back to the deck picker; the game log's last line says the same, with no seat named.
 * Before, the board showed "⚠ The engine got stuck: … — use “Abandon game” below to start over." and no choices.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LearnBoard from "./LearnBoard.jsx";
import { LearnLogEntry } from "./LearnLogEntry.jsx";

const text = (markup) => markup.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const seat = (id) => ({ id, isUser: id === "user", life: 40, handCount: 0, hand: id === "user" ? [] : null, libraryCount: 50,
  lands: [], permanents: [], graveyard: [], exile: [], command: [], manaPool: id === "user" ? {} : null });
const board = { stack: [], players: [seat("user"), seat("ai")] };

const DETAIL = "Opponent controlled 2,001 permanents, past the engine's limit of 2,000 — a loop kept adding to the board.";
const MESSAGE = `The engine stopped the game: ${DETAIL}`;
const STOP_LINE = { ts: 900, turn: 31, phase: "ending", step: "end", actor: null, action: { kind: "game-stopped", guard: "runaway", message: MESSAGE }, auto: true, reasoning: "runaway battlefield (2001 permanents, ai)" };
const PASS_LINE = { ts: 800, turn: 31, phase: "ending", step: "end", actor: "ai", action: { kind: "pass-priority", playerId: "ai" }, auto: false, reasoning: "" };

const renderBoard = (props) => text(renderToStaticMarkup(createElement(LearnBoard, {
  board, onAction: () => {}, onNewGame: () => {}, turn: 31, step: "end", difficulty: "beginner", ...props,
})));

describe("the end of a game the engine stopped", () => {
  const html = renderBoard({
    status: "ended",
    decision: { kind: "game-over", reason: "engine-stopped", guard: "runaway", message: MESSAGE, detail: DETAIL },
    logTail: [PASS_LINE, STOP_LINE],
  });

  it("the end-of-game card says the engine stopped it and why — no win, no loss, no abandon — with the way back", () => {
    expect(html).toContain("<h2");
    expect(html).toContain(">The engine stopped the game.</h2>");
    expect(html).toContain(`<p>${DETAIL.charAt(0).toUpperCase()}${DETAIL.slice(1)} Nobody won or lost.`);
    expect(html).toContain("its record is kept.</p>");
    expect(html).toContain(">New game</button>");
    expect(html).not.toMatch(/You won|You lost|Game abandoned|ended the game early|engine got stuck|Abandon game/);
  });

  it("the game log's last line is the message alone, with no seat", () => {
    expect(html).toContain(`<div class="lb-ln">${MESSAGE}</div>`);
    expect(html).toContain("<b>Opponent</b> · Pass");
    expect(html).not.toMatch(/\? \(auto\)|>\?<|Game stopped/);
  });

  it("the replay scrubber's entry is headed by its turn alone", () => {
    const entry = text(renderToStaticMarkup(createElement(LearnLogEntry, { entry: STOP_LINE })));
    expect(entry).toContain(">T31</div>");
    expect(entry).toContain(`<div>${MESSAGE}</div>`);
    expect(entry).not.toContain("?");
  });
});
