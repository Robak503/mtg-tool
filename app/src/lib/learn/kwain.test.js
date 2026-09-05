/**
 * KWAIN, ITINERANT MEDDLER — SHELF-85 · Bumble Flower F5 (2026-09-05). "{T}: Each player may draw a card, then each player who
 * drew a card this way gains 1 life." The per-seat "may" pause already existed for the Step Between Worlds wheel (APNAP —
 * the controller first, each seat answers for itself, only the yes-seats fold). A DRAW effect kind joins it: the yes-seats
 * draw through the trigger-threading draw path and, when the atom carries lifePerDrawer, gain that much life through the
 * lifegain-trigger path (CR 119.3). No seat's choice is made for it.
 *
 * Mutation-checked: see the run ledger (docs-sk74).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveEachPlayerMayChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KWAIN = { name: "Kwain, Itinerant Meddler", type: "Legendary Creature — Rabbit Wizard", mana: "{W}{U}", keywords: [], power: 1, toughness: 3, oracle: "{T}: Each player may draw a card, then each player who drew a card this way gains 1 life." };
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const kw = createPermanent({ id: "kw", card: { id: "c-kw", ...KWAIN }, controller: "user", summoningSick: false });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, battlefield: [kw], library: [{ id: "U1", name: "User Card", type: "Sorcery", cmc: 1 }], life: 20 }, ai: { ...b.players.ai, library: [{ id: "A1", name: "Ai Card", type: "Sorcery", cmc: 1 }], life: 20 } } };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const snap = (s) => ({ pause: s.pendingChoice ? [s.pendingChoice.kind, s.pendingChoice.controller, s.pendingChoice.effect] : null, userHand: s.players.user.hand.length, aiHand: s.players.ai.hand.length, userLife: s.players.user.life, aiLife: s.players.ai.life });

describe("parse + classify", () => {
  it("the activated body parses to ONE each-player-may-draw atom with lifePerDrawer 1; Kwain classifies native-activated", () => {
    const p = parseEffectProgram({ name: "Probe", type: "Instant", mana: "{1}", keywords: [], oracle: "Each player may draw a card, then each player who drew a card this way gains 1 life." });
    const row = { confidence: p.confidence, atoms: p.atoms, tier: classifyCard(KWAIN) };
    console.log("  WITNESS kwainParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "each-player-may-draw", draw: 1, lifePerDrawer: 1, targetType: null }]);
    expect(row.tier).toBe("native-activated");
  });
});

describe("the per-seat may at runtime", () => {
  it("activating pauses for the controller first, then the opponent; both yes → both draw one and gain one", () => {
    const s0 = state();
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "kw");
    expect(act).toBeTruthy();
    const s1 = settle(dispatchAction(s0, act));
    const s2 = settle(resolveEachPlayerMayChoice(s1, true));
    const s3 = settle(resolveEachPlayerMayChoice(s2, true));
    const row = { first: snap(s1), second: snap(s2), done: snap(s3) };
    console.log("  WITNESS kwainBothYes", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.first).toEqual({ pause: ["each-player-may", "user", "draw"], userHand: 0, aiHand: 0, userLife: 20, aiLife: 20 });
    expect(row.second).toEqual({ pause: ["each-player-may", "ai", "draw"], userHand: 0, aiHand: 0, userLife: 20, aiLife: 20 });
    expect(row.done).toEqual({ pause: null, userHand: 1, aiHand: 1, userLife: 21, aiLife: 21 });
  });
  it("the controller declines and the opponent accepts → only the opponent draws and gains; nothing is decided for a seat", () => {
    const s0 = state();
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "kw");
    const s3 = settle(resolveEachPlayerMayChoice(settle(resolveEachPlayerMayChoice(settle(dispatchAction(s0, act)), false)), true));
    const row = snap(s3);
    console.log("  WITNESS kwainOneNo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pause: null, userHand: 0, aiHand: 1, userLife: 20, aiLife: 21 });
  });
});
