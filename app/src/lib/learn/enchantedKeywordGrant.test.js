/**
 * enchantedKeywordGrant.test.js — "Enchanted creature gains <keyword> until end of turn" (slice 36).
 *
 * The effect of an Aura's own ETB trigger (Starlit Mantle, Accelerated Evolution). The targeted sibling
 * ("target creature gains hexproof until end of turn") and the self form ("this creature gains …") both
 * already parsed HIGH; only the ENCHANTED subject was missing — a subject widening, not new machinery.
 *
 * There is no CHOSEN target here: the referent is the Aura's host, resolved at resolution by
 * shared.enchantedTargets off the source's `attachedTo`. That referent already existed (and was made
 * layer-aware earlier the same day, so an animated host counts). A detached Aura, or one whose host has
 * left, resolves to [] — a clean no-op, never a fabricated grant.
 *
 * FOUND BY the census's honest column: 5 SOLE blockers with 0 co-blockers. The lesson from the slice
 * reverted just before this one is why that mattered — a grouped count says a shape exists; the
 * sole-blocker column says fixing it actually flips something. This one flipped 11.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const MANTLE = { id: "c-sm", name: "Starlit Mantle", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nWhen this Aura enters, enchanted creature gains hexproof until end of turn.\nEnchanted creature gets +1/+1." };

describe("parse", () => {
  it("the enchanted subject now yields a pump atom bound to the ENCHANTED referent", () => {
    expect(parseEffectClause("enchanted creature gains hexproof until end of turn", "Enchantment")).toMatchObject({
      confidence: "high", atoms: [{ op: "pump", target: "enchanted", grantKeywords: ["hexproof"] }],
    });
  });
  it("the targeted and self siblings are unchanged", () => {
    expect(parseEffectClause("target creature gains hexproof until end of turn", "Instant").confidence).toBe("high");
    expect(parseEffectClause("this creature gains hexproof until end of turn", "Creature").confidence).toBe("high");
  });
  it("an UNMODELED keyword still drops the clause (parseGrantedKeywords is the gate)", () => {
    expect(parseEffectClause("enchanted creature gains glorbulation until end of turn", "Enchantment").confidence).toBe("low");
  });
  it("Starlit Mantle classifies native-aura", () => {
    expect(classifyCard(MANTLE)).toBe("native-aura");
  });
});

describe("RUNTIME — the grant lands on the HOST", () => {
  function board(attached = true) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "au", card: MANTLE, controller: "user" });
    let st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura] } } };
    if (attached) st = attachPermanent(st, { equipId: "au", targetId: "bear" });
    st = checkEnterTriggers(st, st.players.user.battlefield.find((p) => p.id === "au"));
    st = runStepActions(st);
    let g = 0; while (st.stack.length && g++ < 8) st = resolveTopOfStack(st);
    return st;
  }

  it("the enchanted creature gains the keyword", () => {
    expect(permanentHasKeyword(board(), "bear", "hexproof")).toBe(true);
  });

  it("…and the AURA itself does not — the referent is the host, not the source", () => {
    expect(permanentHasKeyword(board(), "au", "hexproof")).toBe(false);
  });

  it("a DETACHED Aura grants nothing — a clean no-op, never a fabricated grant", () => {
    expect(permanentHasKeyword(board(false), "bear", "hexproof")).toBe(false);
  });
});
