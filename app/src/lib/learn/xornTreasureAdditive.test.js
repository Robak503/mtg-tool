/**
 * XORN — token-count ADDITIVE replacement (CR 614). Xorn's ONLY text is a NARROWER token-count replacement:
 * "If you would create one or more Treasure tokens, instead create those tokens plus an additional Treasure
 * token." Not a ×2 multiply (Mondrak) — a FIXED +1 of a SPECIFIC token kind (Treasure). Same replacement layer
 * (replacementEffects.js) as the token doubler; a new `tokenAdd` profile field + `tokenAdditive` runtime helper
 * wired into applyCreateNamedToken (the single Treasure-mint chokepoint).
 *
 * CREED: the extra Treasure is REALLY minted (not a parse-only flip) and TAPS FOR MANA like any Treasure. The
 * additive is kind-FILTERED (only Treasure, never a Clue/Food), YOU-scoped (an opponent's Xorn never boosts my
 * Treasures), fires ONCE PER CREATION EVENT (not per token), and composes with a doubler by CR 616.1e greedy-max
 * ordering ((base + add) × mult). A base of 0 Treasures stays 0 (CR 614 replaces an existing creation, never
 * manufactures one).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { doublerProfile, tokenAdditive, isModeledDoublerSentence, stripModeledDoublerClauses } from "./replacementEffects.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const XORN = {
  name: "Xorn", type: "Creature — Elemental",
  oracle: "If you would create one or more Treasure tokens, instead create those tokens plus an additional Treasure token.",
};
// Real doubler for the CR 616 stacking case — the ×2 "create one or more tokens" replacement (Adrix & Nev shape).
const DOUBLING = {
  name: "Doubling Season", type: "Enchantment",
  oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.",
};

const xornPerm = (id, controller = "user") => createPermanent({ id, card: XORN, controller, summoningSick: false });
const doublingPerm = (id, controller = "user") => createPermanent({ id, card: DOUBLING, controller, summoningSick: false });
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;
const clueCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Clue/.test(p.card?.type || "")).length;

function board(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}

describe("Xorn — classification + profile", () => {
  it("flips native-static (the additive replacement is the whole card)", () => {
    expect(classifyCard(XORN)).toBe("native-static");
  });
  it("doublerProfile carries a Treasure-filtered additive token bonus, no counter/multiply profile", () => {
    const p = doublerProfile(XORN);
    expect(p.tokenAdd).toMatchObject({ filter: "treasure", additive: 1, scope: "you" });
    expect(p.token).toBeNull();
    expect(p.counter).toBeNull();
  });
  it("recognizes + strips the Xorn clause for the whole-card residue check", () => {
    expect(isModeledDoublerSentence(XORN.oracle.toLowerCase())).toBe(true);
    expect(stripModeledDoublerClauses(XORN.oracle).trim()).toBe("");
  });
});

describe("Xorn — tokenAdditive runtime helper (scope + filter)", () => {
  const state = (bf, oppBf = []) => ({ players: { user: { battlefield: bf }, ai: { battlefield: oppBf } } });
  it("+1 for the controller's own Treasures", () => {
    expect(tokenAdditive(state([xornPerm("x")]), "user", "Treasure")).toBe(1);
  });
  it("0 for a NON-Treasure token kind (Clue) — kind-filtered", () => {
    expect(tokenAdditive(state([xornPerm("x")]), "user", "Clue")).toBe(0);
  });
  it("0 for an OPPONENT's Treasures — you-scoped, never over-applies", () => {
    expect(tokenAdditive(state([], [xornPerm("x", "ai")]), "user", "Treasure")).toBe(0);
  });
  it("two Xorns stack additively (+2)", () => {
    expect(tokenAdditive(state([xornPerm("x"), xornPerm("y")]), "user", "Treasure")).toBe(2);
  });
  it("0 for an empty kind", () => {
    expect(tokenAdditive(state([xornPerm("x")]), "user", "")).toBe(0);
  });
});

describe("Xorn — end-to-end mint (the extra Treasure is REAL and taps for mana)", () => {
  it("creating 1 Treasure with Xorn out mints 2 (the base + the additional)", () => {
    let s = board([xornPerm("xorn")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 1 }, { controller: "user" });
    expect(treasureCount(s, "user")).toBe(2); // base 1 + Xorn's +1
  });
  it("the additive is ONCE PER EVENT, not per token — creating 3 Treasures mints 4, not 6", () => {
    let s = board([xornPerm("xorn")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 3 }, { controller: "user" });
    expect(treasureCount(s, "user")).toBe(4); // base 3 + a SINGLE additional (CR 614 "an additional")
  });
  it("the extra Treasure TAPS FOR MANA (it's a genuine mana source, not a phantom count)", () => {
    let s = board([xornPerm("xorn")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 1 }, { controller: "user" });
    const treasures = s.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.type || ""));
    expect(treasures).toHaveLength(2);
    // Crack BOTH Treasures for mana; each is sacrificed on use → 0 remain (proves both are real, functioning sources).
    for (const t of treasures) {
      s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: t.id, color: "C", amount: 1, sacrifices: true });
    }
    expect(treasureCount(s, "user")).toBe(0); // both cracked → each was a valid tap-for-mana Treasure
  });
});

describe("Xorn — CR 616.1e greedy-max ordering with a token doubler", () => {
  it("Xorn + Doubling Season on 1 Treasure = (1 + 1) × 2 = 4 (add-first maximizes, beats 1×2+1=3)", () => {
    let s = board([xornPerm("xorn"), doublingPerm("ds")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 1 }, { controller: "user" });
    expect(treasureCount(s, "user")).toBe(4);
  });
});

describe("Xorn — CREED near-misses (no over-mint / no over-apply)", () => {
  it("Xorn does NOT boost a Clue mint (kind filter — a Clue-maker gets exactly its base count)", () => {
    let s = board([xornPerm("xorn")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "clue", count: 1 }, { controller: "user" });
    expect(clueCount(s, "user")).toBe(1);   // base 1, NOT boosted
    expect(treasureCount(s, "user")).toBe(0);
  });
  it("an OPPONENT's Xorn does NOT add a Treasure to MY creation (you-scoped)", () => {
    let s = board([], [xornPerm("oppxorn", "ai")]); // Xorn under ai's control
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 2 }, { controller: "user" });
    expect(treasureCount(s, "user")).toBe(2); // base only — the opponent's Xorn never fires for me
  });
  it("creating ZERO Treasures with Xorn out mints ZERO (CR 614 replaces a creation, never manufactures one)", () => {
    // A dynamic X-count of 0 ("create X Treasures" with X=0) is a clean no-op; the additive must NOT fabricate a
    // Treasure out of a non-event (CR 614 replaces an existing creation; there is none to replace).
    let s = board([xornPerm("xorn")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", countX: true }, { controller: "user", xValue: 0 });
    expect(treasureCount(s, "user")).toBe(0);
  });
});
