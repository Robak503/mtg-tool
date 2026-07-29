/**
 * eachPlayerDrawStep.test.js — "At the beginning of EACH PLAYER'S DRAW STEP" (CR 504.1 + 603.2b), plus the
 * SELF TAP-STATE intervening-if (CR 603.4 + 106.1) that Howling Mine #723 needs on top of it.
 *
 * The draw-step arm is the structural twin of the shipped each-player's-UPKEEP arm and deliberately reuses
 * its machinery rather than duplicating it: `checkStepTriggers` fires the "draw" event once per draw-step
 * ENTRY (so "once per player per turn cycle" is structural), and the player whose draw step it is IS the
 * active player, the same identity the upkeep referent relies on. The "that player" → "the upkeep player"
 * SENTINEL is therefore shared, and the historical name is read as "the player whose STEP it is".
 *
 * ⚠️ THE REFERENT IS A DOUBLE GATE and the two halves must be widened together — `checkStepTriggers` threads
 * ctx.upkeepPlayerId, and `triggerRouting` pins who:"upkeepPlayer" to the allowed events. Thread without
 * routing and the card is refused (a safe FN); route without threading and the referent is unset at
 * resolution and the clause silently NO-OPS while the card claims native — the dropped-clause FP. Both
 * halves are asserted below, on a board.
 *
 * Cards: Kami of the Crescent Moon #1817 · Dictate of Kruphix #1907 · Font of Mythos #2207 ·
 * Howling Mine #723 (which additionally needs the self-tap gate).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { evaluateInterveningIf } from "./interveningIf.js";

beforeEach(() => _resetIdsForTests());

const KAMI = {
  id: "kami", name: "Kami of the Crescent Moon", type: "Creature — Spirit", power: 1, toughness: 3,
  oracle: "At the beginning of each player's draw step, that player draws an additional card.",
};
const HOWLING_MINE = {
  id: "hm", name: "Howling Mine", type: "Artifact", mana: "{2}",
  oracle: "At the beginning of each player's draw step, if this artifact is untapped, that player draws an additional card.",
};

const libCard = (id) => ({ id, name: `Card ${id}`, type: "Instant", oracle: "" });

function board(card, { tapped = false } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = { ...createPermanent({ id: "src", card, controller: "user" }), tapped };
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [perm], library: ["l1", "l2", "l3"].map(libCard), hand: [] },
      ai: { ...s.players.ai, library: ["m1", "m2", "m3"].map(libCard), hand: [] },
    },
  };
}
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 20) st = resolveTopOfStack(st); return st; };
const runDrawStep = (s, active) => resolveAll(flushTriggers(checkStepTriggers({ ...s, step: "draw", activePlayer: active }, "draw"), { chooseTargets: chooseTriggerTargets }));

describe("detection + classification", () => {
  it("routes to the draw event with the each-player flag, and rewrites the referent to the shared sentinel", () => {
    const d = detectTriggers(KAMI);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "draw", scope: "you", whose: "any", eachPlayersDrawStep: true });
    expect(d[0].effectClause).toBe("the upkeep player draws an additional card");
  });

  it("Kami of the Crescent Moon classifies native", () => {
    expect(classifyCard(KAMI)).toBe("native-trigger");
  });

  it("Howling Mine classifies native — the self-tap intervening-if is modeled too", () => {
    expect(classifyCard(HOWLING_MINE)).toBe("native-trigger");
  });

  it("⭐ CREED — a rider on the condition leaves it UNDETECTED rather than approximated", () => {
    expect(detectTriggers({ ...KAMI, oracle: "At the beginning of each player's draw step during your turn, that player draws an additional card." })).toHaveLength(0);
  });
});

describe("⭐ RUNTIME — it fires on EVERY player's draw step, and the RIGHT player draws", () => {
  it("on the controller's own draw step, the CONTROLLER draws", () => {
    const s = runDrawStep(board(KAMI), "user");
    expect(s.players.user.hand.length).toBe(1);
    expect(s.players.ai.hand.length).toBe(0);
  });

  it("⭐ on the OPPONENT'S draw step, the OPPONENT draws — not the controller", () => {
    // This is the half that fails if ctx.upkeepPlayerId is not threaded on the draw event: the clause
    // would silently no-op (or bind the wrong seat) while the card still classified native.
    const s = runDrawStep(board(KAMI), "ai");
    expect(s.players.ai.hand.length).toBe(1);
    expect(s.players.user.hand.length).toBe(0);
  });

  it("a two-card version draws two (Font of Mythos shape)", () => {
    const font = { ...KAMI, id: "font", name: "Font of Mythos", type: "Artifact", oracle: "At the beginning of each player's draw step, that player draws two additional cards." };
    const s = runDrawStep(board(font), "ai");
    expect(s.players.ai.hand.length).toBe(2);
  });
});

describe("⭐ RUNTIME — the SELF TAP-STATE intervening-if actually gates (CR 603.4)", () => {
  it("UNTAPPED Howling Mine draws for the active player", () => {
    const s = runDrawStep(board(HOWLING_MINE, { tapped: false }), "ai");
    expect(s.players.ai.hand.length).toBe(1);
  });

  it("⭐ TAPPED Howling Mine draws NOTHING — the gate is real, not decorative", () => {
    const s = runDrawStep(board(HOWLING_MINE, { tapped: true }), "ai");
    expect(s.players.ai.hand.length).toBe(0);
    expect(s.players.user.hand.length).toBe(0);
  });

  it("the INVERSE wording is honoured too (Mana Vault #145 — \"if this artifact is tapped\")", () => {
    const ctx = { sourcePermanentId: "src" };
    const tapped = board(HOWLING_MINE, { tapped: true });
    const untapped = board(HOWLING_MINE, { tapped: false });
    expect(evaluateInterveningIf(tapped, "this artifact is tapped", "user", ctx)).toBe(true);
    expect(evaluateInterveningIf(untapped, "this artifact is tapped", "user", ctx)).toBe(false);
    expect(evaluateInterveningIf(tapped, "this artifact is untapped", "user", ctx)).toBe(false);
    expect(evaluateInterveningIf(untapped, "this artifact is untapped", "user", ctx)).toBe(true);
  });

  it("⭐ FN-SAFE — a source that has LEFT the battlefield returns null (can't confirm), never a false true", () => {
    const s = board(HOWLING_MINE);
    expect(evaluateInterveningIf(s, "this artifact is untapped", "user", { sourcePermanentId: "gone" })).toBe(null);
    expect(evaluateInterveningIf(s, "this artifact is untapped", "user", null)).toBe(null);
  });
});
