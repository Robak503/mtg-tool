/**
 * undeadButler.test.js — ⭐ OPTIONAL-EXILE-SELF payment (Undead Butler, Teval shelf, 2026-08-15):
 * "When this creature dies, you may exile it. When you do, return target creature card from your
 * graveyard to your hand."
 *
 * A NEW pause kind on the optional-payment pattern (NOT the α2/reflexiveGate route — that would run
 * the payoff even when the dead card left the graveyard during the pause window, a free return, the
 * FP this design exists to prevent). The settler RE-SCANS the card across every graveyard at settle
 * (CR 603.6e), pays by moving it graveyard → exile, and ONLY a real move runs the payoff (with the
 * flush-locked target replayed — CR 603.3d). The parser lifts the payoff's targetType onto the
 * wrapper (flush-time enumeration) and stamps excludeTriggeringCard (the dead card never targets
 * itself — CR 603.7: the real reflexive chooses after the exile).
 *
 * Mutation-checked (2026-08-15): the settler's graveyard re-scan short-circuited to paid=true with no
 * move → the vanished-card control dies (the payoff runs for an unpaid cost). Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalExileSelfChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BUTLER = { id: "ub-c", name: "Undead Butler", type: "Creature — Zombie", power: "1", toughness: "2", mana: "{1}{B}",
  oracle: "When this creature enters, mill three cards.\nWhen this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand." };

describe("parse + classify", () => {
  it("⭐ the dies effect parses to ONE pausing wrapper (payoff nested, target lifted, self excluded); the card is NATIVE", () => {
    const p = parseEffectClause("you may exile it. When you do, return target creature card from your graveyard to your hand", "Instant");
    const row = { conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(BUTLER) };
    console.log("  WITNESS undeadButler", JSON.stringify({ conf: row.conf, tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({
      op: "optional-exile-self-payment", targetType: "graveyardCard",
      effectAtoms: [{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", excludeTriggeringCard: true }],
    });
    expect(row.tier).toBe("native-trigger");
  });

  it("seen-to-fail: a chained second reflexive still nulls", () => {
    expect(programConfidence(parseEffectClause("you may exile it. When you do, draw a card. When you do, draw a card", "Instant"))).toBe("low");
  });
});

/** Kill the Butler through the real lethal pipeline and flush its dies trigger to the pause. */
function dieAndPause(extraGy = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const butler = createPermanent({ id: "ub", card: BUTLER, controller: "user" });
  let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user,
    battlefield: [{ ...butler, damageMarked: 99 }],
    graveyard: [{ id: "g-prey", name: "Prey", type: "Creature — Bear", oracle: "" }, ...extraGy] } } };
  const lethal = destroyLethalCreatures(s);
  s = checkDiesTriggers(lethal.state, lethal.dead);
  s = flushTriggers(s, {});
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
}

describe("⭐⭐ the runtime loop — pay exiles + returns; decline does nothing; a vanished card can NEVER yield the payoff", () => {
  it("⭐⭐ PAY: the Butler moves graveyard → exile, and the flush-locked Prey returns to hand", () => {
    const paused = dieAndPause();
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-exile-self-payment", controller: "user", available: true, cardId: "ub-c" });
    expect(paused.pendingChoice.targets.map((t) => t.id)).toEqual(["g-prey"]); // locked at flush; the Butler itself excluded
    const out = resolveOptionalExileSelfChoice(paused, true);
    const row = {
      butlerExiled: out.players.user.exile.some((c) => c.id === "ub-c"),
      butlerInGy: out.players.user.graveyard.some((c) => c.id === "ub-c"),
      preyInHand: out.players.user.hand.some((c) => c.id === "g-prey"),
    };
    console.log("  WITNESS butlerPay", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ butlerExiled: true, butlerInGy: false, preyInHand: true });
  });

  it("DECLINE: the Butler stays in the graveyard, the Prey stays put — nothing runs", () => {
    const paused = dieAndPause();
    const out = resolveOptionalExileSelfChoice(paused, false);
    expect(out.players.user.graveyard.some((c) => c.id === "ub-c")).toBe(true);
    expect(out.players.user.exile).toHaveLength(0);
    expect(out.players.user.hand.some((c) => c.id === "g-prey")).toBe(false);
  });

  it("⭐ THE DESIGN'S REASON: the card VANISHES during the pause → taking pays nothing and the payoff NEVER runs", () => {
    const paused = dieAndPause();
    // Simulate a response recurring/exiling the Butler out of the graveyard mid-pause.
    const drained = { ...paused, players: { ...paused.players, user: { ...paused.players.user,
      graveyard: paused.players.user.graveyard.filter((c) => c.id !== "ub-c") } } };
    const out = resolveOptionalExileSelfChoice(drained, true);
    expect(out.players.user.exile).toHaveLength(0);                              // nothing exiled
    expect(out.players.user.hand.some((c) => c.id === "g-prey")).toBe(false);    // NO free return
    expect((out.log || []).some((e) => e.effect === "optional-exile-self" && e.paid === false)).toBe(true);
  });
});
