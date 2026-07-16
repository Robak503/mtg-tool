/**
 * landAuraEtbRider.test.js — BLITZ LA-1: the mana-grant aura WITH a modeled aura-own ETB rider
 * (Gift of Paradise / Abundant Growth / Urban Utopia frame). An Aura enters through the SAME
 * enterPermanent chokepoint every permanent uses (checkEnterTriggers is the single ETB-fire site),
 * so "When this Aura enters, <native effect>" is modeled end-to-end — the metric admits the line as
 * non-residue when its SINGLE descriptor is event=etb, scope=self, and routes natively.
 * CREED FP guarded: an aura-own trigger that does NOT route stays residue (body-only).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GIFT_OF_PARADISE = { id: "gop", name: "Gift of Paradise", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant land\nWhen this Aura enters, you gain 3 life.\nEnchanted land has \"{T}: Add two mana of any one color.\"" };
const ABUNDANT_GROWTH = { id: "abg", name: "Abundant Growth", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land has \"{T}: Add one mana of any color.\"" };
const UNROUTABLE = { id: "unr", name: "Probe Growth", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant land\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nEnchanted land has \"{T}: Add one mana of any color.\"" };

describe("classify", () => {
  it("the ramp staples flip native-mana-aura", () => {
    expect(classifyCard(GIFT_OF_PARADISE)).toBe("native-mana-aura");
    expect(classifyCard(ABUNDANT_GROWTH)).toBe("native-mana-aura");
  });
  it("CREED — an aura-own ETB that does NOT route natively stays residue (body-only)", () => {
    expect(classifyCard(UNROUTABLE)).toBe("body-only");
  });
});

describe("runtime — the aura's own ETB fires through the shared enter chokepoint", () => {
  it("entering (attached to a land) enqueues the gain-life ETB trigger", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const forest = createPermanent({ id: "f1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [forest] } } };
    const after = enterPermanent(s, GIFT_OF_PARADISE, "user", { attachTo: "f1" });
    const etb = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb");
    expect(etb.length).toBe(1);
    expect(etb[0].descriptor.effectClause).toMatch(/gain 3 life/i);
  });
});
