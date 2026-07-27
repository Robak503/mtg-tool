/**
 * flashAuraAndCondUnblock.test.js — two micro-slices:
 *
 * FA-1 — FLASH on an Aura is not residue (Tiger Claws / Capture Sphere / Eel Umbra / Alexi's Cloak):
 * the engine hard-casts at the main-phase window, so the flash speed simply goes unused — the card still
 * does exactly its printed thing at sorcery speed (an FN-safe timing simplification, the bloodrush
 * inverse). The residue walk admits the bare "Flash" line; every other keyword line stays residue.
 *
 * AB-1 — the defender-board TYPE-conditional unblockable (Neurok Spy "…controls an artifact" /
 * Bubbling Beebles "…an enchantment" / Hazy Homunculus "…an untapped land"): the rad-gate mirror,
 * enforced live in canBlockAttacker per block-legality query.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { canBlockAttacker, typeConditionalUnblockableOf } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("FA-1 — flash auras", () => {
  it("flash + a modeled body flips; flash + an unmodeled clause still parks", () => {
    expect(classifyCard({ id: "tc", name: "Tiger Claws", type: "Enchantment — Aura", mana: "{3}{G}",
      oracle: "Flash\nEnchant creature\nEnchanted creature gets +1/+1 and has trample." })).toBe("native-aura");
    expect(classifyCard({ id: "csp", name: "Capture Sphere", type: "Enchantment — Aura", mana: "{3}{U}",
      oracle: "Flash\nEnchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." })).toBe("native-aura");
    // NOTE (2026-07-25): Shimmering Wings FLIPPED — its blocker was the self-bounce activated ("{U}:
    // Return this Aura to its owner's hand"), which is now modeled (the self-bounce atom's noun
    // alternation was widened past creature|permanent; zoneOptionKeywords.test.js holds the positive pin).
    expect(classifyCard({ id: "sw", name: "Shimmering Wings", type: "Enchantment — Aura", mana: "{U}",
      oracle: "Flash\nEnchant creature\nEnchanted creature has flying.\n{U}: Return this Aura to its owner's hand." })).toMatch(/^native/);
    // …and the "unmodeled clause still parks" half of this guard keeps a REAL unmodeled subject: a
    // control-change aura ("You control enchanted creature" — Illusory Gains / Spirit Away, still a live
    // 7-sole-blocker census cluster). Swapped in deliberately so the negative can't rot into a tautology.
    expect(classifyCard({ id: "ig", name: "Illusory Gains", type: "Enchantment — Aura", mana: "{2}{U}{U}",
      oracle: "Flash\nEnchant creature\nYou control enchanted creature.\nWhenever a creature enters, attach this Aura to that creature." })).toBe("body-only");
  });
});

describe("AB-1 — the type-conditional unblockable", () => {
  const NEUROK_SPY = { id: "ns", name: "Neurok Spy", type: "Creature — Human Rogue", power: "2", toughness: "1", mana: "{2}{U}",
    oracle: "This creature can't be blocked as long as defending player controls an artifact." };
  it("the reader + classify; a different condition stays null", () => {
    expect(typeConditionalUnblockableOf(NEUROK_SPY)).toBe("artifact");
    expect(typeConditionalUnblockableOf({ oracle: "This creature can't be blocked as long as defending player controls a Gate." })).toBe(null);
    expect(classifyCard(NEUROK_SPY)).toBe("native-body");
  });
  it("blockable with no artifact; unblockable the moment the defender controls one (live read)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const spy = createPermanent({ id: "ns", card: NEUROK_SPY, controller: "user", summoningSick: false });
    const wall = createPermanent({ id: "wl", card: { name: "Wall", type: "Creature — Wall", power: "0", toughness: "4", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [spy] }, ai1: { ...s.players.ai1, battlefield: [wall] } } };
    expect(canBlockAttacker(s, "wl", "ns", "ai1")).toBe(true); // no artifact → blockable
    const withArtifact = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [wall,
      createPermanent({ id: "mox", card: { name: "Mox Probe", type: "Artifact", oracle: "" }, controller: "ai1", summoningSick: false })] } } };
    expect(canBlockAttacker(withArtifact, "wl", "ns", "ai1")).toBe(false); // artifact present → can't block
  });
});
