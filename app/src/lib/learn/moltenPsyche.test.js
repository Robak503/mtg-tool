/**
 * MOLTEN PSYCHE — metalcraft damage equal to each opponent's own draws this turn. SHELF-85 · Phase 3 (Nekusar), 2026-09-05.
 * "Each player shuffles the cards from their hand into their library, then draws that many cards. / Metalcraft — If you
 * control three or more artifacts, Molten Psyche deals damage to each opponent equal to the number of cards that player has
 * drawn this turn."
 *
 * The wheel half and the metalcraft condition were native; the damage half needed a PER-OPPONENT amount — each opponent's
 * own cardsDrawnThisTurn, read at resolution (after the wheel's own redraw, CR 608.2c order). One arm (`amountPerOpponent`)
 * and a per-player override in applyDamageEffect's each-opponent branch.
 *
 * Mutation-checked: see the run ledger (docs-sk116).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MP = { id: "c-mp", name: "Molten Psyche", type: "Sorcery", mana: "{1}{R}{R}", keywords: [],
  oracle: "Each player shuffles the cards from their hand into their library, then draws that many cards.\nMetalcraft — If you control three or more artifacts, Molten Psyche deals damage to each opponent equal to the number of cards that player has drawn this turn." };

describe("the parser", () => {
  it("the whole card reads to the wheel + the metalcraft-gated per-opponent damage; native-spell", () => {
    const p = parseEffectProgram(MP);
    const row = { conf: programConfidence(p), ops: p.atoms.map((a) => a.op), dmg: p.atoms[p.atoms.length - 1], tier: classifyCard(MP) };
    console.log("  WITNESS moltenPsyche", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.dmg).toEqual({ op: "deal-damage", targetType: "eachOpponent", amountPerOpponent: "cardsDrawnThisTurn", condition: "you control three or more artifacts" });
    expect(row.tier).toBe("native-spell");
  });
  it("seen-to-fail: a label left in front of an unpeeled condition never yields UNCONDITIONAL damage (the arm's prefix is comma-free)", () => {
    // Through parseEffectClause the label is not stripped and the "If …, " is not peeled — a lazy `.+?` prefix would swallow
    // "metalcraft — if you control three or more artifacts, molten psyche" and hand back damage with NO condition (an FP).
    const q = parseEffectClause("Metalcraft — If you control three or more artifacts, Molten Psyche deals damage to each opponent equal to the number of cards that player has drawn this turn.", "Sorcery");
    expect(programConfidence(q)).toBe("low");
  });
});

const card = (id) => ({ id, name: `Card ${id}`, type: "Instant", mana: "{U}", keywords: [], oracle: "" });
const lib = (pid, n) => Array.from({ length: n }, (_, i) => card(`${pid}-l${i}`));
const rock = (i) => createPermanent({ id: `rock${i}`, card: { id: `c-rock${i}`, name: "Rock", type: "Artifact", mana: "{1}", keywords: [], oracle: "" }, controller: "user" });
function cast(artifacts, aiDrawn, aiHand) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const mountains = Array.from({ length: 3 }, (_, i) => createPermanent({ id: `m${i}`, card: { id: `c-m${i}`, name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "user" }));
  const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [MP, card("uh1")], library: lib("user", 4), battlefield: [...mountains, ...Array.from({ length: artifacts }, (_, i) => rock(i))] },
      ai: { ...s0.players.ai, hand: Array.from({ length: aiHand }, (_, i) => card(`ah${i}`)), library: lib("ai", 6), cardsDrawnThisTurn: aiDrawn } } };
  const act = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-mp");
  expect(act).toBeTruthy();
  const out = resolveTopOfStack(dispatchAction(s, act));
  return { lifeBefore: s.players.ai.life, life: out.players.ai.life, aiHand: out.players.ai.hand.length, aiDrawn: out.players.ai.cardsDrawnThisTurn, userLife: out.players.user.life, userLifeBefore: s.players.user.life };
}

describe("RUNTIME — the wheel, then the metalcraft damage from each opponent's own draws", () => {
  it("three artifacts: the opponent (3 drawn before, a 2-card hand) wheels to a 2-card hand and takes 5 (3 + the 2 redrawn); the caster takes nothing", () => {
    const row = cast(3, 3, 2);
    console.log("  WITNESS moltenPsycheMetal", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.aiHand).toBe(2);
    expect(row.aiDrawn).toBe(5);
    expect(row.lifeBefore - row.life).toBe(5);
    expect(row.userLife).toBe(row.userLifeBefore);
  });
  it("two artifacts: the wheel still happens, no damage", () => {
    const row = cast(2, 3, 2);
    console.log("  WITNESS moltenPsycheNoMetal", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.aiHand).toBe(2);
    expect(row.aiDrawn).toBe(5);
    expect(row.lifeBefore - row.life).toBe(0);
  });
});
