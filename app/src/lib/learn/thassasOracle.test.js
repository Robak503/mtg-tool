/**
 * THASSA'S ORACLE — POD-SIM THREE · KN-1 (2026-09-05).
 *
 * "When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one
 *  of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or
 *  equal to the number of cards in your library, you win the game."
 *
 * One atom for the three sentences (they share X). X is read at RESOLUTION (CR 608.2c): the runbook's named FP is a
 * stale X, so the live-devotion pin changes the board between the trigger and its resolution. The win is the win-game
 * stamp (CR 104.2a state-based end); the look is the impulse-dig pause with a TOP destination and a decline.
 *
 * Mutation-checked: see the run ledger (docs-sk43).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORACLE_TEXT = "When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game. (Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)";
const ORACLE = { id: "thor", name: "Thassa's Oracle", type: "Creature — Merfolk Wizard", mana: "{U}{U}", cmc: 2, colors: ["U"], power: 1, toughness: 3, oracle: ORACLE_TEXT };

const lib = (...ids) => ids.map((id) => ({ id, name: id, type: "Sorcery", cmc: 1 }));
/** A permanent carrying two blue pips ({1}{U}{U/B} — the hybrid counts, CR 700.5). */
function bluePerm(id) {
  return { id, card: { name: `Blue ${id}`, type: "Artifact", mana: "{1}{U}{U/B}", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function state({ library = [], battlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand: [ORACLE], library, battlefield, manaPool: { ...s.players.user.manaPool, U: 2 } } },
  };
}
/** Cast the Oracle and resolve the creature spell; the ETB trigger is then the stack's top (not yet resolved). */
function castOracle(s) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "thor");
  expect(cast).toBeTruthy();
  const afterSpell = resolveTopOfStack(dispatchAction(s, cast));
  expect(afterSpell.players.user.battlefield.some((p) => p.card?.name === "Thassa's Oracle")).toBe(true);
  return afterSpell;
}
/** Resolve until the stack is empty or a pause is raised. */
function settle(s) {
  let next = s;
  while (next.stack.length && !next.pendingChoice) next = resolveTopOfStack(next);
  return next;
}
const libIds = (s) => s.players.user.library.map((c) => c.id);
const oracleLog = (s) => (s.log || []).filter((e) => e.effect === "devotion-dig-win");

describe("parse + classify", () => {
  it("the three sentences fold into ONE devotion-dig-win atom (blue); the card classifies native-trigger", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: ORACLE_TEXT.replace(/^When this creature enters, /, "") });
    const row = { confidence: p.confidence, atoms: p.atoms, tier: classifyCard({ ...ORACLE, keywords: [] }) };
    console.log("  WITNESS thorParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "devotion-dig-win", color: "U" }]);
    expect(row.tier).toBe("native-trigger");
  });
});

describe("the look — X = devotion, the pick stays on top, the rest bottom", () => {
  it("devotion 4 (Oracle's {U}{U} + a {1}{U}{U/B} artifact) over a 6-card library: 4 candidates; the pick becomes the top, the other three go under the untouched two", () => {
    const s = state({ library: lib("c1", "c2", "c3", "c4", "c5", "c6"), battlefield: [bluePerm("art")] });
    const paused = settle(castOracle(s));
    expect(paused.pendingChoice).toMatchObject({ kind: "impulse-dig", controller: "user", chosenTo: "top", restOrder: "random", keep: 1 });
    const candidates = paused.pendingChoice.candidates.map((c) => c.id);
    const after = settle(resolveImpulseDigChoice(paused, "c3"));
    const ids = libIds(after);
    const row = { candidates, top: ids[0], untouched: ids.slice(1, 3), bottomed: ids.slice(3).sort(), won: !!after.players.user.wonGame, log: oracleLog(paused)[0] };
    console.log("  WITNESS thorLook", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.candidates).toEqual(["c1", "c2", "c3", "c4"]);
    expect(row.top).toBe("c3");
    expect(row.untouched).toEqual(["c5", "c6"]);
    expect(row.bottomed).toEqual(["c1", "c2", "c4"]);
    expect(row.won).toBe(false);
    expect(row.log).toMatchObject({ devotion: 4, library: 6, won: false, looked: 4 });
    expect(after.pendingChoice).toBeFalsy();
    expect(after.stack).toHaveLength(0);
  });

  it("\"up to one\": declining bottoms every looked-at card — the former fifth card is the new top", () => {
    const s = state({ library: lib("c1", "c2", "c3", "c4", "c5", "c6"), battlefield: [bluePerm("art")] });
    const paused = settle(castOracle(s));
    const after = settle(resolveImpulseDigChoice(paused, null));
    const ids = libIds(after);
    expect(ids.slice(0, 2)).toEqual(["c5", "c6"]);
    expect(ids.slice(2).sort()).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("devotion 2 (the Oracle alone) over a 5-card library: two candidates, no win", () => {
    const paused = settle(castOracle(state({ library: lib("c1", "c2", "c3", "c4", "c5") })));
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(oracleLog(paused)[0]).toMatchObject({ devotion: 2, library: 5, won: false });
  });
});

describe("the win — X ≥ library, read LIVE at resolution", () => {
  it("devotion 4 over a 3-card library: the win is stamped, no pause, the library untouched", () => {
    const s = state({ library: lib("c1", "c2", "c3"), battlefield: [bluePerm("art")] });
    const after = settle(castOracle(s));
    const row = { won: !!after.players.user.wonGame, pause: after.pendingChoice?.kind || null, lib: libIds(after), log: oracleLog(after)[0] };
    console.log("  WITNESS thorWin", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.won).toBe(true);
    expect(row.pause).toBe(null);
    expect(row.lib).toEqual(["c1", "c2", "c3"]);
    expect(row.log).toMatchObject({ devotion: 4, library: 3, won: true });
  });

  it("⭐ LIVE X (CR 608.2c): devotion 2 at the trigger would only look; a two-pip permanent arriving BEFORE the trigger resolves lifts X to 4 ≥ library 4 — the win", () => {
    const s = state({ library: lib("c1", "c2", "c3", "c4") });
    const triggered = castOracle(s); // the ETB is on the stack, unresolved; devotion right now = 2
    expect(triggered.stack.length).toBeGreaterThan(0);
    const u = triggered.players.user;
    const boosted = { ...triggered, players: { ...triggered.players, user: { ...u, battlefield: [...u.battlefield, bluePerm("late")] } } };
    const after = settle(boosted);
    const control = settle(triggered); // the same trigger without the late arrival: a look, not a win
    const row = { won: !!after.players.user.wonGame, controlWon: !!control.players.user.wonGame, controlPause: control.pendingChoice?.kind || null };
    console.log("  WITNESS thorLive", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.won).toBe(true);
    expect(row.controlWon).toBe(false);
    expect(row.controlPause).toBe("impulse-dig");
  });

  it("the Oracle gone in response: X = 0 — an EMPTY library still wins (0 ≥ 0, the Consultation line); a one-card library looks at nothing and does not win", () => {
    const gone = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.card?.name !== "Thassa's Oracle") } } });
    const empty = settle(gone(castOracle(state({ library: [] }))));
    const one = settle(gone(castOracle(state({ library: lib("c1") }))));
    const row = { emptyWon: !!empty.players.user.wonGame, oneWon: !!one.players.user.wonGame, onePause: one.pendingChoice?.kind || null, oneLog: oracleLog(one)[0] };
    console.log("  WITNESS thorZero", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.emptyWon).toBe(true);
    expect(row.oneWon).toBe(false);
    expect(row.onePause).toBe(null);
    expect(row.oneLog).toMatchObject({ devotion: 0, library: 1, won: false, looked: 0 });
  });
});
