/**
 * RAZORKIN NEEDLEHEAD — a suffix-gated self keyword + the object-pronoun draw referent. SHELF-85 · Phase 3 (Nekusar), 2026-09-05.
 * "This creature has first strike during your turn. / Whenever an opponent draws a card, this creature deals 1 damage to them."
 *
 * Two one-word seams on two native lanes: (1) the your-turn self keyword grant knew only the PREFIX form ("During your turn,
 * this creature has …") — the suffix form takes the identical yourTurn-gated descriptor; (2) the card-drawn referent rewrite
 * knew "that player" and the clause-leading "they lose N life" — the clause-final OBJECT pronoun "… damage to them" now
 * rewrites to the same drawing-player sentinel, only when the watched drawer is another player.
 *
 * Mutation-checked: see the run ledger (docs-sk118).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAZORKIN = { id: "c-rz", name: "Razorkin Needlehead", type: "Creature — Human Assassin", mana: "{R}{R}", power: 2, toughness: 1, keywords: [],
  oracle: "This creature has first strike during your turn.\nWhenever an opponent draws a card, this creature deals 1 damage to them." };

function board(activePlayer) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const rz = createPermanent({ id: "rz", card: RAZORKIN, controller: "user", summoningSick: false });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer, priorityHolder: activePlayer, turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [rz] } } };
}
function drawThenResolve(state, drawer) {
  let s = checkCardDrawnTriggers({ ...state, players: { ...state.players, [drawer]: { ...state.players[drawer], cardsDrawnThisTurn: 1 } } }, drawer, 1);
  s = flushTriggers(s);
  let guard = 0;
  while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
  return s;
}

describe("the parser", () => {
  it("both lines read: the suffix-gated first strike and the draw trigger aimed at the drawing player; native", () => {
    const trig = detectTriggers(RAZORKIN)[0];
    const row = { tier: classifyCard(RAZORKIN), event: trig?.event, scope: trig?.scope };
    console.log("  WITNESS razorkin", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toMatch(/^native/);
    expect(row).toMatchObject({ event: "cardDrawn", scope: "opponentDraw" });
  });
  it("seen-to-fail: 'you draw … damage to them' has no antecedent and stays parked (the SCOPE allowlist — the own-draw scope also carries whose:'any')", () => {
    const bad = { ...RAZORKIN, id: "c-bad", oracle: "Whenever you draw a card, this creature deals 1 damage to them." };
    expect(classifyCard(bad)).not.toMatch(/^native/);
  });
});

describe("RUNTIME", () => {
  it("first strike is live on the controller's turn and gone on an opponent's turn (the yourTurn gate)", () => {
    const row = { mine: permanentHasKeyword(board("user"), "rz", "first strike"), theirs: permanentHasKeyword(board("ai"), "rz", "first strike") };
    console.log("  WITNESS razorkinFirstStrike", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ mine: true, theirs: false });
  });
  it("an opponent's draw costs THEM 1 life; the controller's own draw fires nothing", () => {
    const before = board("ai");
    const theirs = drawThenResolve(before, "ai");
    const mine = drawThenResolve(before, "user");
    const row = { aiBefore: before.players.ai.life, aiAfter: theirs.players.ai.life, userAfterTheirs: theirs.players.user.life, userAfterMine: mine.players.user.life, aiAfterMine: mine.players.ai.life };
    console.log("  WITNESS razorkinPing", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.aiAfter).toBe(row.aiBefore - 1);
    expect(row.userAfterTheirs).toBe(before.players.user.life);
    expect(row.userAfterMine).toBe(before.players.user.life);
    expect(row.aiAfterMine).toBe(row.aiBefore);
  });
});
