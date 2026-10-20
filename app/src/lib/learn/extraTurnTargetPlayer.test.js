/**
 * THE CHOSEN PLAYER'S EXTRA TURN — "Target player takes an extra turn after this one.":
 *   · Time Warp (EDHREC #1985);
 *   · Beacon of Tomorrows (#6173) — "… Shuffle Beacon of Tomorrows into its owner's library." (its ruling: countered or not
 *     resolving, it goes to the graveyard instead).
 * Any player may be chosen (CR 115.1); the turn is added directly after this one and the most recently created is taken first
 * (CR 500.7; Time Warp's ruling: "If multiple 'extra turn' effects resolve in the same turn, take them in the reverse of the order
 * that the effects resolved"). A chooser that is not a person gives the turn to its own controller.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, advanceStep } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { applyExtraTurn } from "./effects/atoms/misc.js";
import { atomTargetIntent } from "./effects/programQueries.js";

beforeEach(() => _resetIdsForTests());

const TIME_WARP = {"name":"Time Warp","type":"Sorcery","mana":"{3}{U}{U}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Target player takes an extra turn after this one."}; // arbiter-spell on 0fbdec14
const BEACON_OF_TOMORROWS = {"name":"Beacon of Tomorrows","type":"Sorcery","mana":"{6}{U}{U}","cmc":8,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Target player takes an extra turn after this one. Shuffle Beacon of Tomorrows into its owner's library."}; // arbiter-spell on 0fbdec14

function pod(spell, mana) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-spell");
function castAt(s, pid) {
  const action = casts(s).find((a) => a.targets?.[0]?.id === pid);
  expect(action, `a cast aimed at ${pid}`).toBeDefined();
  return resolveTopOfStack(dispatchAction(s, action));
}

describe("the reader", () => {
  it("⭐ both cards play their whole text", () => {
    expect({ warp: classifyCard(TIME_WARP), beacon: classifyCard(BEACON_OF_TOMORROWS) }).toEqual({ warp: "native-spell", beacon: "native-spell" });
  });
  it("⭐ the atom: the extra turn with a player target, aimed at its own controller by a chooser; the caster's form is unchanged", () => {
    const atom = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || [];
    const warp = atom(TIME_WARP.oracle);
    expect({ warp, intent: atomTargetIntent(warp[0]), walk: atom("Take an extra turn after this one."), opponent: atom("Target opponent takes an extra turn after this one.") })
      .toEqual({ warp: [{ op: "extra-turn", targetType: "player" }], intent: "own", walk: [{ op: "extra-turn", targetType: null }], opponent: [] });
  });
});

describe("Time Warp", () => {
  it("⭐ offered on every player; aimed at ai2, the next turn is ai2's — then the rotation resumes with ai1, the player after the caster", () => {
    const s0 = pod(TIME_WARP, { U: 2, C: 3 });
    const offered = [...new Set(casts(s0).map((a) => a.targets?.[0]?.id))].sort();
    const s = castAt(s0, "ai2");
    const t1 = advanceStep({ ...s, phase: "ending", step: "cleanup" });
    const t2 = advanceStep({ ...t1, phase: "ending", step: "cleanup" });
    expect({ offered, queued: s.extraTurns, next: t1.activePlayer, extraTurnOf: t1.extraTurnOf, after: t2.activePlayer, inGraveyard: s.players.user.graveyard.some((c) => c.id === "h-spell") })
      .toEqual({ offered: ["ai1", "ai2", "ai3", "user"], queued: [{ player: "ai2" }], next: "ai2", extraTurnOf: "ai2", after: "ai1", inGraveyard: true });
  });
  it("⭐ aimed at its caster, the caster takes the next turn", () => {
    const s = castAt(pod(TIME_WARP, { U: 2, C: 3 }), "user");
    expect({ queued: s.extraTurns, next: advanceStep({ ...s, phase: "ending", step: "cleanup" }).activePlayer }).toEqual({ queued: [{ player: "user" }], next: "user" });
  });
});

describe("the turn order after extra turns (CR 500.7 — added directly after the turn that created them)", () => {
  // A state at the cleanup step of `active`'s turn, four seats in turn order user → ai1 → ai2 → ai3.
  const atCleanup = (active) => ({ ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), activePlayer: active, phase: "ending", step: "cleanup" });
  const endTurn = (s) => advanceStep({ ...s, phase: "ending", step: "cleanup" });
  const sequence = (s, n) => { const seats = []; for (let i = 0; i < n; i++) { s = endTurn(s); seats.push(s.activePlayer); } return seats; };

  it("⭐ an extra turn taken after ANOTHER player's turn (Nexus of Fate cast in ai1's turn): ai1 → user → ai2, never ai1 again", () => {
    const s = applyExtraTurn(atCleanup("ai1"), { op: "extra-turn", targetType: null }, { controller: "user" });
    expect(sequence(s, 3)).toEqual(["user", "ai2", "ai3"]);
  });
  it("⭐ two queued in ai1's turn (user's, then ai2's): ai2's first, then user's, then ai2's NORMAL turn — the player after ai1", () => {
    let s = applyExtraTurn(atCleanup("ai1"), { op: "extra-turn", targetType: null }, { controller: "user" });
    s = applyExtraTurn(s, { op: "extra-turn", targetType: null }, { controller: "ai2" });
    expect(sequence(s, 4)).toEqual(["ai2", "user", "ai2", "ai3"]);
  });
  it("CONTROL — a player's own extra turn on their own turn: user → user → ai1, as before", () => {
    const s = applyExtraTurn(atCleanup("user"), { op: "extra-turn", targetType: null }, { controller: "user" });
    expect(sequence(s, 3)).toEqual(["user", "ai1", "ai2"]);
  });
});

describe("Beacon of Tomorrows", () => {
  it("⭐ the chosen player's extra turn, and the Beacon is shuffled into its owner's library, not the graveyard", () => {
    const s = castAt(pod(BEACON_OF_TOMORROWS, { U: 2, C: 6 }), "ai1");
    expect({ queued: s.extraTurns, library: s.players.user.library.map((c) => c.id), graveyard: s.players.user.graveyard.length })
      .toEqual({ queued: [{ player: "ai1" }], library: ["h-spell"], graveyard: 0 });
  });
});
