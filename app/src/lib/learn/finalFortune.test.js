/**
 * finalFortune.test.js — SHELF-85 runbook V12 (2026-09-04): the extra-turn trio — Final Fortune, Last Chance,
 * Warrior's Oath (Killer Turts) — and the unplanned One with Death.
 *
 *   "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game."
 *
 * The extra-turn atom and the delayed-trigger lane existed. New:
 *   · the timing word "that turn's end step" → fireStep end, fireScope `thatTurn`;
 *   · advanceStep stamps `extraTurnOf` on the turn it pops off the extra-turn stack and clears it on a normal rotation;
 *   · the drain fires a thatTurn record ONLY at the end step of the controller's extra turn — never the casting turn's
 *     own end step, never an opponent's turn;
 *   · "you lose the game" is the win-game atom with outcome lose on the controller (the Pact rider's flag, on "you");
 *   · the opponent AI never casts a spell that schedules (or is) its own loss — a human may.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { matchDelayedTrigger } from "./effects/spanMatchers.js";
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FINAL_FORTUNE = { id: "c-ff", name: "Final Fortune", type: "Instant", mana: "{R}{R}", keywords: [], oracle: "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." };
const LAST_CHANCE = { id: "c-lc", name: "Last Chance", type: "Sorcery", mana: "{R}{R}", keywords: [], oracle: "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." };
const WARRIORS_OATH = { id: "c-wo", name: "Warrior's Oath", type: "Sorcery", mana: "{R}{R}", keywords: [], oracle: "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." };
const ONE_WITH_DEATH = { id: "c-owd", name: "One with Death", type: "Instant", mana: "{B}", keywords: [], oracle: "You lose the game." };

const lib = (t) => Array.from({ length: 8 }, (_, i) => ({ id: `${t}${i}`, name: "Card", type: "Instant", oracle: "" }));
const land = (id, ctrl, color = "R") => createPermanent({ id, card: { name: color === "R" ? "Mountain" : "Swamp", type: `Basic Land — ${color === "R" ? "Mountain" : "Swamp"}`, oracle: `{T}: Add {${color}}.` }, controller: ctrl });
function board(pid = "user", hand = [FINAL_FORTUNE]) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const opp = pid === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: pid, priorityHolder: pid, consecutivePasses: 0, turn: 3,
    players: { ...s.players, [pid]: { ...s.players[pid], hand, library: lib(pid[0]), battlefield: [land("L1", pid), land("L2", pid), land("L3", pid, "B"), land("L4", pid, "B")] }, [opp]: { ...s.players[opp], library: lib(opp[0]) } } };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const step = (s) => resolveAll(flushTriggers(runStepActions(advanceStep(s)), { chooseTargets: chooseTriggerTargets }));

describe("parse", () => {
  it("the timing word: that turn's end step → end / thatTurn", () => {
    expect(matchDelayedTrigger("Take an extra turn after this one. At the beginning of that turn's end step, you lose the game.")).toMatchObject({ immediateClause: "Take an extra turn after this one.", delayedClause: "you lose the game", fireStep: "end", fireScope: "thatTurn" });
  });
  it("the whole program: the extra turn, then the scheduled loss", () => {
    expect(parseEffectProgram(FINAL_FORTUNE).atoms).toEqual([{ op: "extra-turn", targetType: null }, { op: "schedule-delayed", fireStep: "end", fireScope: "thatTurn", delayedClause: "you lose the game", targetType: null }]);
    expect(parseEffectClause("you lose the game.", "Instant").atoms).toEqual([{ op: "win-game", who: "controller", outcome: "lose", targetType: null }]);
  });
});

describe("the drain — a thatTurn record fires only on the controller's extra turn", () => {
  const rec = (controller = "user") => ({ id: "dly-1", controller, fireStep: "end", fireScope: "thatTurn", effectClause: "you lose the game", sourceName: "Final Fortune", createdTurn: 3 });
  it("not on a turn with no extra-turn stamp; not on an opponent's stamped turn; yes on the controller's", () => {
    const base = { ...createGameState({ userDeck: [], aiDeck: [] }), delayedTriggers: [rec()] };
    expect(drainDelayedTriggers({ ...base, extraTurnOf: null }, "end", "user").fired).toHaveLength(0);
    expect(drainDelayedTriggers({ ...base, extraTurnOf: "ai" }, "end", "ai").fired).toHaveLength(0);
    expect(drainDelayedTriggers({ ...base, extraTurnOf: "user" }, "end", "user").fired).toHaveLength(1);
    expect(drainDelayedTriggers({ ...base, extraTurnOf: "user" }, "upkeep", "user").fired).toHaveLength(0);
  });
});

describe("end to end — the extra turn, then the loss at ITS end step", () => {
  it("Final Fortune: no loss at the casting turn's end step; the extra turn is stamped; the loss lands at its end step", () => {
    let s = board();
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-ff");
    expect(cast).toBeTruthy();
    s = resolveAll(dispatchAction(s, cast));
    expect(s.extraTurns).toEqual([{ player: "user" }]);
    expect(s.delayedTriggers.map((r) => [r.fireStep, r.fireScope])).toEqual([["end", "thatTurn"]]);
    let seenTurn3End = false, turn4Start = null, lost = null;
    for (let i = 0; i < 60 && !lost; i++) {
      s = step(s);
      if (s.turn === 3 && s.step === "end") { seenTurn3End = true; expect(s.players.user.lostGame).toBeFalsy(); }
      if (s.turn === 4 && s.step === "untap") turn4Start = { active: s.activePlayer, extraTurnOf: s.extraTurnOf };
      if (s.players.user.lostGame) lost = { turn: s.turn, step: s.step, active: s.activePlayer };
    }
    expect(seenTurn3End).toBe(true);
    expect(turn4Start).toEqual({ active: "user", extraTurnOf: "user" });
    expect(lost).toEqual({ turn: 4, step: "end", active: "user" });
  });
  it("the stamp clears on a normal rotation", () => {
    let s = { ...board(), extraTurnOf: "user", phase: "ending", step: "cleanup" };
    s = advanceStep(s);
    expect(s.activePlayer).toBe("ai");
    expect(s.extraTurnOf).toBeNull();
  });
});

describe("the AI never gambles", () => {
  it("holding Final Fortune with the mana up, the AI does not cast it; nor One with Death", () => {
    for (const card of [FINAL_FORTUNE, ONE_WITH_DEATH]) {
      const s = board("ai", [card]);
      const offered = legalActionsForPlayer(s, "ai").some((a) => a.kind === "cast-spell" && a.cardId === card.id);
      expect(offered).toBe(true);
      const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
      expect(pick && pick.kind === "cast-spell" && pick.cardId === card.id).toBe(false);
    }
  });
});

describe("classifier", () => {
  it("the trio and One with Death are native-spell", () => {
    for (const c of [FINAL_FORTUNE, LAST_CHANCE, WARRIORS_OATH, ONE_WITH_DEATH]) expect(classifyCard(c)).toBe("native-spell");
  });
});
