/**
 * tevalBalancedScale.test.js — ⭐ TEVAL, THE BALANCED SCALE (the Teval deck's own commander, 2026-08-15).
 *
 * The card was ONE clause from native: both triggers already detect (the attack mill + the BATCHED
 * gyLeave Zombie watcher — that machinery predates this slice), and the only gap was the attack tail's
 * ARTICLE-form land return: "Then you may return A land card from your graveyard to the battlefield
 * tapped." — NOT a targeted return (CR 601.2c: nothing is targeted; the card is chosen as the effect
 * resolves), so the new pickFromGraveyard reanimate variant synthesizes the choice off the live
 * graveyard at resolution (deterministic first-match — lands are near-fungible, the riot discipline).
 *
 * Mutation-checked (2026-08-15): the pickFromGraveyard synthesis disabled in applyReanimate → the
 * land-returns witness dies (the may resolves to nothing). Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalChoice } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const TEVAL = { name: "Teval, the Balanced Scale", type: "Legendary Creature — Dragon Spirit", power: "4", toughness: "4", mana: "{2}{B}{G}{U}",
  oracle: "Flying\nWhenever Teval attacks, mill three cards. Then you may return a land card from your graveyard to the battlefield tapped.\nWhenever one or more cards leave your graveyard, create a 2/2 black Zombie Druid creature token." };
const TAIL = "Return a land card from your graveyard to the battlefield tapped.";

describe("parse + classify", () => {
  it("⭐ Teval classifies NATIVE-TRIGGER — both triggers detected, the article-form land return modeled", () => {
    const row = { tier: classifyCard(TEVAL), events: detectTriggers(TEVAL).map((d) => d.event) };
    console.log("  WITNESS teval", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("native-trigger");
    expect(row.events.sort()).toEqual(["attacks", "gyLeaveBatch"]);
  });

  it("the article form parses to the pickFromGraveyard reanimate (no targetType — nothing is targeted)", () => {
    const p = parseEffectClause(TAIL, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reanimate", targetType: null, pickFromGraveyard: true, cardFilter: { typeFilter: "land" }, entersTapped: true }]);
    // the seen-to-fail boundary: a non-land article form stays LOW (the pick policy is land-scoped this slice)
    expect(programConfidence(parseEffectClause("Return a creature card from your graveyard to the battlefield.", "Instant"))).toBe("low");
  });
});

describe("⭐⭐ resolution — the pick synthesizes off the live graveyard; the may declines to a clean no-op", () => {
  function withGy(gy) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: gy } } };
  }
  const run = (s, oracle) => runEffectProgram(s, {
    id: "stk-t", kind: "spell", controller: "user", source: { name: "Teval Tail" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectClause(oracle, "Instant"), controller: "user", targets: [] } },
  });

  it("⭐⭐ a land in the graveyard returns TAPPED (first match — deterministic); the creature stays put", () => {
    const s = withGy([
      { id: "g-bear", name: "Bear", type: "Creature — Bear", oracle: "" },
      { id: "g-swamp", name: "Swamp", type: "Basic Land — Swamp", oracle: "" },
      { id: "g-isle", name: "Island", type: "Basic Land — Island", oracle: "" },
    ]);
    const out = run(s, TAIL);
    const perm = out.players.user.battlefield.find((p) => p.card?.id === "g-swamp");
    const row = { returned: perm?.card?.name, tapped: perm?.tapped, islandStays: out.players.user.graveyard.some((c) => c.id === "g-isle"), bearStays: out.players.user.graveyard.some((c) => c.id === "g-bear") };
    console.log("  WITNESS tevalPick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ returned: "Swamp", tapped: true, islandStays: true, bearStays: true });
  });

  it("no land in the graveyard → a clean logged no-op (nothing fabricated)", () => {
    const out = run(withGy([{ id: "g-bear", name: "Bear", type: "Creature — Bear", oracle: "" }]), TAIL);
    expect(out.players.user.battlefield).toHaveLength(0);
    expect(out.players.user.graveyard).toHaveLength(1);
  });

  it("the printed 'you may' pauses as a real optional; declining leaves the graveyard untouched", () => {
    const s = withGy([{ id: "g-swamp", name: "Swamp", type: "Basic Land — Swamp", oracle: "" }]);
    const paused = run(s, "You may return a land card from your graveyard to the battlefield tapped.");
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-effect", effectOp: "reanimate" });
    const declined = resolveOptionalChoice(paused, false);
    expect(declined.players.user.graveyard.some((c) => c.id === "g-swamp")).toBe(true);
    const taken = resolveOptionalChoice(paused, true);
    expect(taken.players.user.battlefield.some((p) => p.card?.id === "g-swamp")).toBe(true);
  });
});
