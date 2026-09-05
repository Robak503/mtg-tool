/**
 * ELANOR GARDNER — SHELF-85 · Bumble Flower F6 (2026-09-05). "At the beginning of your end step, if you sacrificed a Food
 * this turn, you may search your library for a basic land card, put that card onto the battlefield tapped, then
 * shuffle." The only gap was the condition: a per-player SACRIFICED-THIS-TURN memo, stamped at the one sacrifice
 * chokepoint every path calls (checkSacrificeTriggers), reset for all seats at turn start, read word-bounded against each
 * sacrificed card's type line ("Food" on "Token Artifact — Food"; "permanent" = any sacrifice). An empty memo reads
 * false, not null — the parseable probe admits the shape and an untouched turn is simply "no".
 *
 * Mutation-checked: see the run ledger (docs-sk67).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, resetCreatureDeathsAllPlayers } from "./gameState.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ELANOR = { name: "Elanor Gardner", type: "Legendary Creature — Halfling Scout", mana: "{3}{G}", keywords: [], power: 2, toughness: 4, oracle: "When Elanor enters, create a Food token.\nAt the beginning of your end step, if you sacrificed a Food this turn, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." };
const perm = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
const food = (id) => perm(id, { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", token: true });
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, battlefield: [perm("el", ELANOR), food("f1")], library: [{ id: "F1", name: "Forest", type: "Basic Land — Forest", oracle: "" }], manaPool: { ...b.players.user.manaPool, C: 2 } } } };
}
const crack = (s) => { const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "f1"); expect(a).toBeTruthy(); return dispatchAction(s, a); };

describe("classify + the condition reader", () => {
  it("the end-step trigger detects with the sacrificed-Food intervening-if; the condition is parseable; the card classifies native-trigger", () => {
    const d = detectTriggers(ELANOR).map((x) => [x.event, x.interveningIf ?? null]);
    const row = { d, parseable: interveningIfParseable("you sacrificed a Food this turn"), tier: classifyCard(ELANOR) };
    console.log("  WITNESS elanorDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toEqual([["etb", null], ["endStep", "you sacrificed a Food this turn"]]); // the descriptor keeps the printed casing; the reader lowercases
    expect(row.parseable).toBe(true);
    expect(row.tier).toBe("native-trigger");
  });
  it("the reader: false on an untouched turn; true after the Food's own cost-sacrifice; the memo is word-bounded by type (a sacrificed Food is not a 'creature'; it IS a 'permanent'); the next turn's reset clears it", () => {
    const s0 = state();
    const s1 = crack(s0);
    const s2 = resetCreatureDeathsAllPlayers(s1);
    const row = {
      before: evaluateInterveningIf(s0, "you sacrificed a Food this turn", "user", {}),
      after: evaluateInterveningIf(s1, "you sacrificed a Food this turn", "user", {}),
      contraction: evaluateInterveningIf(s1, "you've sacrificed a Food this turn", "user", {}),
      creature: evaluateInterveningIf(s1, "you sacrificed a creature this turn", "user", {}),
      permanent: evaluateInterveningIf(s1, "you sacrificed a permanent this turn", "user", {}),
      memo: s1.players.user.sacrificedThisTurn,
      afterReset: evaluateInterveningIf(s2, "you sacrificed a Food this turn", "user", {}),
    };
    console.log("  WITNESS elanorReader", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.before).toBe(false);
    expect(row.after).toBe(true);
    expect(row.contraction).toBe(true);
    expect(row.creature).toBe(false);
    expect(row.permanent).toBe(true);
    expect(row.memo).toEqual([{ name: "Food", type: "Token Artifact — Food" }]);
    expect(row.afterReset).toBe(false);
  });
});

describe("the end step", () => {
  it("the end-step trigger enqueues either way (the engine checks an intervening-if at RESOLUTION); with a Food sacrificed this turn it resolves into the printed 'you may' pause, on an untouched turn it resolves to nothing", () => {
    const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
    const untouched = settle(checkStepTriggers({ ...state(), step: "end", phase: "ending", pendingTriggers: [] }, "endStep"));
    const cracked = settle(checkStepTriggers({ ...crack(state()), step: "end", phase: "ending", pendingTriggers: [] }, "endStep"));
    const row = { untouched: { pause: untouched.pendingChoice?.kind ?? null, library: untouched.players.user.library.length, stack: untouched.stack.length }, cracked: { pause: cracked.pendingChoice?.kind ?? null, library: cracked.players.user.library.length } };
    console.log("  WITNESS elanorEndStep", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.untouched).toEqual({ pause: null, library: 1, stack: 0 }); // the condition read false → nothing happened
    expect(row.cracked).toEqual({ pause: "optional-effect", library: 1 });  // the condition read true → the printed "you may" pauses
  });
});
