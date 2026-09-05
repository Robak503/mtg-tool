/**
 * THE OPPONENT COUNT — "for each opponent you have". SHELF-85 · Halfshell Q4 (Big Apple, 3 a.m.), 2026-09-05.
 * "{5}, {T}: Create a 1/1 black Rat creature token for each opponent you have."
 *
 * The land's other lines were the LANDS-12 lane; the Rat line parked on its COUNT — "opponent(s) you have" was not a
 * count source (the same absence that sized Killer Service's ETB up). One kind: the count-source parser reads the exact
 * phrase to `opponents`, and the shared evaluator answers it with the seat's live opponents (opponentsOf), so every
 * for-each consumer inherits it.
 *
 * Mutation-checked: see the run ledger (docs-sk92).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BIG_APPLE = { id: "c-ba", name: "Big Apple, 3 a.m.", type: "Land", mana: "", keywords: [],
  oracle: "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.\n{5}, {T}: Create a 1/1 black Rat creature token for each opponent you have." };
const swamp = (i) => createPermanent({ id: `sw${i}`, card: { id: `c-sw${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "" }, controller: "user" });

function board(seats) {
  const s = seats === 4 ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const apple = { ...createPermanent({ id: "apple", card: BIG_APPLE, controller: "user" }), chosenColor: "B" };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: [apple, swamp(1), swamp(2), swamp(3), swamp(4), swamp(5)] } } };
}
function rats(s) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "apple");
  expect(act).toBeTruthy();
  const resolved = resolveTopOfStack(dispatchAction(s, act));
  return resolved.players.user.battlefield.filter((p) => p.card?.token && /Rat/.test(p.card.name)).length;
}

describe("the count source and the evaluator", () => {
  it("'opponent you have' / 'opponents you have' read to the opponents kind; an unrelated phrase is refused; the evaluator counts the seat's live opponents", () => {
    const four = board(4), two = board(2);
    const row = { one: parseCountSource("opponent you have"), many: parseCountSource("opponents you have"), friends: parseCountSource("friends you have"),
      four: countForSpec(four, { controller: "user" }, { kind: "opponents" }), two: countForSpec(two, { controller: "user" }, { kind: "opponents" }), tier: classifyCard(BIG_APPLE) };
    console.log("  WITNESS opponentsYouHave", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.one).toEqual({ kind: "opponents" });
    expect(row.many).toEqual({ kind: "opponents" });
    expect(row.friends).toBeNull();
    expect(row.four).toBe(3);
    expect(row.two).toBe(1);
    expect(row.tier).toBe("land");
  });
});

describe("RUNTIME — the Rat line through the real activation lane", () => {
  it("three Rats in a four-seat game, one in a two-seat game", () => {
    const row = { four: rats(board(4)), two: rats(board(2)) };
    console.log("  WITNESS bigAppleRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ four: 3, two: 1 });
  });
});
