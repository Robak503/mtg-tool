/**
 * fieldOfTheDead.test.js — SHELF-85 runbook Phase 2 · T3 (2026-09-05): Field of the Dead (Teval).
 *
 *   "This land enters tapped.
 *    {T}: Add {C}.
 *    Whenever this land or another land you control enters, if you control seven or more lands with different names,
 *    create a 2/2 black Zombie creature token."
 *
 * The trigger already detected as a land-ETB watcher (scope subtypeYouControl / Land) the play-land path fires, and the
 * Zombie token parsed. The one missing cell was the intervening-if word: "you control N or more lands with different
 * names" — the number of DISTINCT card names among the controller's lands, placed ABOVE the generic "you control <N>
 * <filter>" family (which swallowed the phrase as an unparseable filter and returned null).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FIELD = { id: "c-fod", name: "Field of the Dead", type: "Land", keywords: [],
  oracle: "This land enters tapped.\n{T}: Add {C}.\nWhenever this land or another land you control enters, if you control seven or more lands with different names, create a 2/2 black Zombie creature token." };
const COND = "you control seven or more lands with different names";
const NAMES = ["Forest", "Island", "Swamp", "Mountain", "Plains", "Wastes"];
const landCard = (id, name) => ({ id, name, type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
const landPerm = (id, name) => createPermanent({ id, card: landCard("c-" + id, name), controller: "user" });

function board(bf, hand) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 8,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, hand } } };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const settle = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const zombies = (s) => s.players.user.battlefield.filter((p) => /Zombie/.test(String(p.card?.type || "")) && p.card?.token).length;

describe("the intervening-if word", () => {
  it("is parseable and counts DISTINCT land names, not lands", () => {
    expect(interveningIfParseable(COND)).toBe(true);
    const six = NAMES.map((n, i) => landPerm("L" + i, n));
    expect(evaluateInterveningIf(board([...six, landPerm("L6", "Forest")], []), COND, "user")).toBe(false);   // 7 lands, 6 names
    expect(evaluateInterveningIf(board([...six, landPerm("L6", "Field of the Dead")], []), COND, "user")).toBe(true); // 7 names
  });
  it("a non-land with a seventh distinct name does not count", () => {
    const six = NAMES.map((n, i) => landPerm("L" + i, n));
    const bear = createPermanent({ id: "B", card: { id: "c-b", name: "Seventh Name", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    expect(evaluateInterveningIf(board([...six, bear], []), COND, "user")).toBe(false);
  });
  it("detectTriggers carries it on the land-ETB watcher", () => {
    expect(detectTriggers(FIELD)[0]).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Land", interveningIf: COND, effectClause: "create a 2/2 black Zombie creature token" });
  });
});

describe("end to end — the seventh distinct land makes the Zombie", () => {
  it("Field plus six named lands; playing a seventh distinct land → one Zombie; a duplicate name → none", () => {
    const six = NAMES.map((n, i) => landPerm("L" + i, n));
    const field = { ...createPermanent({ id: "FOD", card: FIELD, controller: "user" }), tapped: true };
    let s = board([field, ...six], [landCard("h1", "Field of the Dead")]);
    // Field itself is a land with a name: with the six basics that is seven distinct names once ANY land enters.
    s = settle(dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h1", name: "Field of the Dead" }));
    expect(zombies(s)).toBe(1);
  });
  it("only six distinct names on the board after the drop → the gate is closed, no Zombie", () => {
    const five = NAMES.slice(0, 5).map((n, i) => landPerm("L" + i, n));
    const field = { ...createPermanent({ id: "FOD", card: FIELD, controller: "user" }), tapped: true };
    let s = board([field, ...five], [landCard("h1", "Forest")]);   // Forest duplicates L0 → 6 names after the drop
    s = settle(dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h1", name: "Forest" }));
    expect(zombies(s)).toBe(0);
  });
  it("Field entering as the seventh distinct land fires its own trigger ('this land or another land')", () => {
    const six = NAMES.map((n, i) => landPerm("L" + i, n));
    let s = board(six, [{ ...FIELD, id: "h-fod" }]);
    s = settle(dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h-fod", name: "Field of the Dead" }));
    expect(zombies(s)).toBe(1);
  });
});

describe("classifier", () => {
  it("Field of the Dead is a land", () => {
    expect(classifyCard(FIELD)).toBe("land");
  });
});
