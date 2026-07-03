/**
 * DOUBLE-MANA-POOL (Doubling Cube — "{3}, {T}: Double the amount of each type of unspent mana you have.").
 *
 * A MANA ability (CR 605.1a) that resolves WITHOUT the stack (CR 605.3a), like tap-for-mana: the parser flags
 * it `isManaEffect`/`doubleManaPool`, legalChoices offers it as a `double-mana-pool` action (off the stack
 * `activate-ability` path), and the dispatcher pays `{3}` + taps the source, then doubles the pool. The
 * classifier credits it native-mana. These tests pin the flip, the runtime resolution, and — the CREED gate —
 * that a partial-shape variant (double a subset, double + a rider) stays parked (never a half-modeled play).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CUBE_ORACLE = "{3}, {T}: Double the amount of each type of unspent mana you have.";
const cube = (over = {}) => ({ id: "c-cube", name: "Doubling Cube", type: "Artifact", oracle: CUBE_ORACLE, ...over });

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withUser(state, over) {
  return { ...state, players: { ...state.players, user: { ...state.players.user, ...over } } };
}
function doubleActions(state, playerId = "user") {
  return legalActionsForPlayer(state, playerId).filter((a) => a.kind === "double-mana-pool");
}

describe("double-mana-pool — parse + classify", () => {
  it("parses the ability as a mana effect with a doubleManaPool marker (cost {3},{T}, no stack program)", () => {
    const ab = parseActivatedAbilities(cube())[0];
    expect(ab).toMatchObject({ isManaEffect: true, doubleManaPool: true, manaPips: "{3}", tapSelf: true });
    // It's a mana ability → never offered on the stack `activate-ability` path (modeled stays false).
    expect(ab.modeled).toBe(false);
  });

  it("Doubling Cube flips to native-mana", () => {
    expect(classifyCard(cube())).toBe("native-mana");
  });

  it("CREED near-miss — a variant that doubles only a SUBSET of mana stays non-native", () => {
    const nm = cube({ oracle: "{3}, {T}: Double the amount of unspent green mana you have." });
    expect(parseActivatedAbilities(nm)[0].doubleManaPool).toBe(false);
    expect(classifyCard(nm)).toBe("body-only");
  });

  it("CREED near-miss — doubling PLUS an extra rider (a life cost we'd silently drop) stays non-native", () => {
    // The exact-shape matcher requires the effect to be ONLY the doubling sentence. A trailing rider ("You
    // lose 3 life.") means modeling just the double would drop the life-loss — a forbidden partial. Parked.
    const nm = cube({ oracle: "{3}, {T}: Double the amount of each type of unspent mana you have. You lose 3 life." });
    expect(parseActivatedAbilities(nm)[0]?.doubleManaPool ?? false).toBe(false);
    expect(classifyCard(nm)).toBe("body-only");
  });

  it("CREED near-miss — a different multiplier (Triple) is not this mechanic and stays non-native", () => {
    const nm = cube({ oracle: "{3}, {T}: Triple the amount of each type of unspent mana you have." });
    expect(parseActivatedAbilities(nm)[0]?.doubleManaPool ?? false).toBe(false);
    expect(classifyCard(nm)).toBe("body-only");
  });
});

describe("double-mana-pool — legal actions", () => {
  it("offers the ability when the source is untapped and the {3} cost is affordable from the pool", () => {
    let s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 5, C: 0 } });
    const acts = doubleActions(s);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ kind: "double-mana-pool", permanentId: "p", tapSelf: true });
  });

  it("does NOT offer the ability when the {3} cost is unaffordable (empty pool, no other sources)", () => {
    const s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    expect(doubleActions(s)).toHaveLength(0);
  });

  it("does NOT offer the ability when the source is already tapped (can't pay {T})", () => {
    const s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false, tapped: true })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 5, C: 0 } });
    expect(doubleActions(s)).toHaveLength(0);
  });

  it("does NOT offer the ability outside the player's main phase", () => {
    const s = withUser(mainState({ step: "upkeep", phase: "beginning" }), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 5, C: 0 } });
    expect(doubleActions(s)).toHaveLength(0);
  });
});

describe("double-mana-pool — dispatch resolution (CR 605.3a)", () => {
  it("pays {3} from the pool, taps the source, then doubles the REMAINING pool", () => {
    let s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 6, C: 0 } });
    const act = doubleActions(s)[0];
    const after = dispatchAction(s, act);
    // {3} paid first (R2 then 1 G → R0 G5), THEN the remainder doubles: G5 → G10, R0 → 0.
    expect(after.players.user.manaPool).toMatchObject({ R: 0, G: 10 });
    // Source tapped, still on the battlefield (a mana ability isn't the permanent leaving).
    const src = after.players.user.battlefield.find((p) => p.id === "p");
    expect(src.tapped).toBe(true);
    expect(src).toBeTruthy();
    // Resolves WITHOUT using the stack (CR 605.3a) — nothing pushed.
    expect(after.stack).toHaveLength(0);
  });

  it("doubles a multi-color pool per color (each color independently 2×)", () => {
    // A multi-color pool of 12 mana with the {3} cost paid FROM it; whichever colors the planner spends for
    // the {3}, the REMAINING pool (9 mana) must end up exactly doubled (18 mana), each color 2× its
    // post-payment amount. Assert the doubling RELATIONSHIP (total 18, every color even) rather than a fixed
    // color split, so the test pins the mechanic (per-color 2×) without over-fitting the planner's generic
    // color-choice (which is exercised precisely in the single-color test below).
    let s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 2, U: 3, B: 1, R: 4, G: 0, C: 2 } }); // total 12
    const after = dispatchAction(s, doubleActions(s)[0]).players.user.manaPool;
    const total = after.W + after.U + after.B + after.R + after.G + after.C;
    expect(total).toBe(18); // (12 − 3 paid) × 2
    for (const c of ["W", "U", "B", "R", "G", "C"]) expect(after[c] % 2).toBe(0); // each color is a doubled (even) count
  });

  it("doubles a single leftover color exactly (unambiguous payment)", () => {
    // Pool is pure green — the {3} is unambiguously paid from G, leaving G(n−3), which doubles to 2·(n−3).
    let s = withUser(mainState(), { battlefield: [createPermanent({ id: "p", card: cube(), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 7, C: 0 } });
    const after = dispatchAction(s, doubleActions(s)[0]).players.user.manaPool;
    expect(after).toMatchObject({ G: 8, W: 0, U: 0, B: 0, R: 0, C: 0 }); // (7 − 3) × 2 = 8
  });
});
