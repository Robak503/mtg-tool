/**
 * gyFunctioningTrigger.test.js — the GRAVEYARD-FUNCTIONING milled trigger (Infesting Radroach — SHELF S7;
 * the Bloodghast-class zone shape, CR 603.3d).
 *
 * "Whenever an opponent mills a nonland card, if this creature is in your graveyard, you may return it to
 * your hand." Seams:
 *   1. detectTriggers stamps functionsFromGraveyard + rewrites the effect to the [gy-self-return:hand]
 *      sentinel when the intervening-if is EXACTLY the zone statement;
 *   2. checkMilledTriggers fires it from the GRAVEYARD scan only (the battlefield scan excludes it — a
 *      battlefield Radroach's copy of this ability functions nowhere, per its zone statement);
 *   3. the IN-YOUR-GRAVEYARD intervening-if re-checks the zone live (flush AND resolution, CR 603.4) off
 *      ctx.sourceCardId;
 *   4. applyGySelfReturnHand moves exactly that card graveyard → hand (CR 608.2b no-op when gone).
 * CREED FP = a battlefield fire, a fire for the wrong player's mill, or returning a different card.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, checkMilledTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const RADROACH_ORACLE =
  "Flying\nThis creature can't block.\nWhenever this creature deals combat damage to a player, they get that many rad counters.\nWhenever an opponent mills a nonland card, if this creature is in your graveyard, you may return it to your hand.";
const radroachCard = (id = "ir-card") => ({
  id, name: "Infesting Radroach", type: "Creature — Insect Mutant",
  power: "2", toughness: "2", mana: "{2}{B}", oracle: RADROACH_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withGraveyard(state, pid, cards) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], graveyard: cards } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
const NONLAND = { id: "ml1", name: "Milled Spell", type: "Instant", oracle: "" };

describe("detection + routing + classify", () => {
  it("the milled trigger is stamped functionsFromGraveyard with the sentinel effect, and routes natively", () => {
    const [d] = detectTriggers(radroachCard()).filter((t) => t.event === "milled");
    expect(d).toMatchObject({ functionsFromGraveyard: true, milledFilter: "nonland", whose: "opponent", interveningIf: "this creature is in your graveyard" });
    expect(d.effectClause).toBe("[gy-self-return:hand] return it to your hand");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("Infesting Radroach → native-trigger (cdmg rad was already modeled)", () => {
    expect(classifyCard(radroachCard())).toBe("native-trigger");
  });
});

describe("intervening-if (IN-YOUR-GRAVEYARD, CR 603.3d + 603.4)", () => {
  it("parseable; true iff the source card is in the controller's graveyard NOW; null without the thread", () => {
    expect(interveningIfParseable("this creature is in your graveyard")).toBe(true);
    let s = baseState();
    s = withGraveyard(s, "user", [radroachCard("ir1")]);
    expect(evaluateInterveningIf(s, "this creature is in your graveyard", "user", { sourceCardId: "ir1" })).toBe(true);
    expect(evaluateInterveningIf(s, "this creature is in your graveyard", "user", { sourceCardId: "gone" })).toBe(false);
    expect(evaluateInterveningIf(s, "this creature is in your graveyard", "user", {})).toBeNull();
  });
});

describe("engine (CREED core — fires from the graveyard only, returns exactly itself)", () => {
  it("an opponent milling a nonland returns the graveyard Radroach to its owner's hand", () => {
    let s = baseState();
    s = withGraveyard(s, "user", [radroachCard("ir1")]);
    s = checkMilledTriggers(s, { milledByPlayer: "ai1", milledCards: [NONLAND] });
    expect((s.pendingTriggers || [])).toHaveLength(1);
    s = resolveAll(s);
    expect(s.players.user.graveyard.some((c) => c.id === "ir1")).toBe(false);
    expect(s.players.user.hand.some((c) => c.id === "ir1")).toBe(true);
  });

  it("the CONTROLLER's own mill never fires it (whose: opponent)", () => {
    let s = baseState();
    s = withGraveyard(s, "user", [radroachCard("ir1")]);
    s = checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [NONLAND] });
    expect((s.pendingTriggers || [])).toHaveLength(0);
  });

  it("a LAND-only mill never fires it (nonland filter)", () => {
    let s = baseState();
    s = withGraveyard(s, "user", [radroachCard("ir1")]);
    s = checkMilledTriggers(s, { milledByPlayer: "ai1", milledCards: [{ id: "l1", name: "Forest", type: "Basic Land — Forest", oracle: "" }] });
    expect((s.pendingTriggers || [])).toHaveLength(0);
  });

  it("a BATTLEFIELD Radroach never fires this trigger (the zone statement — graveyard scan only)", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "irb", card: radroachCard("ir1"), controller: "user" })] } } };
    s = checkMilledTriggers(s, { milledByPlayer: "ai1", milledCards: [NONLAND] });
    expect((s.pendingTriggers || [])).toHaveLength(0);
  });
});
