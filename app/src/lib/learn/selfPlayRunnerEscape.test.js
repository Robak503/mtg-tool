/**
 * selfPlayRunnerEscape.test.js — the runner's record of a throw that escapes advanceUntilDecision (2026-11-01).
 *
 * advanceUntilDecision plays the whole game in ONE call, so the session the runner handed it is still on turn 1 when a throw
 * comes back out. The record used to say `turns: session.state.turn` — turn 1 — for a game that died on turn 34 (seed
 * 3277877396), and every escaped throw read as a turn-1 crash. The driver now turns every throw inside its loop into the
 * engine-error stop (engineThrowGuard.test.js), so this catch is the backstop for a throw outside it; its record says the turn
 * is unknown (null — the grind header already reads `turns ?? null`) and keeps the message and the stack (`errorStack`).
 */

import { describe, expect, it, vi } from "vitest";

vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("./learnSession.js", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, advanceUntilDecision: () => { throw new Error("escaped from the driver"); } };
});

const { runSelfPlayGame } = await import("./selfPlayRunner.js");

function deck(prefix) {
  const out = [];
  for (let i = 0; i < 25; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
  for (let i = 0; i < 25; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 });
  return out;
}

describe("WITNESS — an escaped throw's record does not claim the handed-in turn", () => {
  it("turns is unknown (null), never the turn-1 session the runner handed in; the message and the non-result stay", () => {
    const game = runSelfPlayGame({ deckA: deck("u"), deckB: deck("a"), mode: "standard" });
    expect(game.result).toBe("dispatch-error");
    expect(game.turns).toBeNull();
    expect(game.error).toBe("escaped from the driver");
    expect(typeof game.errorStack).toBe("string");
    expect(game.errorStack).toMatch(/Error: escaped from the driver/); // the stack rides the record, not only the log
    expect(game.reason).toBe("escaped from the driver");
    expect(game.trainingWeight).toBe(0);
  });
});
