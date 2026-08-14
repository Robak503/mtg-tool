/**
 * sliverBounce.test.js — the SUBTYPE bounce (2026-08-12 — Vedalken Aethermage "When this creature
 * enters, return target Sliver to its owner's hand"). Test Rashmi 81→82.
 *
 * ⭐ ONE parser arm: a CURATED subtype set (one entry per measured carrier — TF-1; a generic capture
 * would swallow non-subtype nouns) emitting the creature targetType + the kind:"subtype" restriction
 * creatureRestrictions already enforces at enumeration — one evaluator, no new machinery.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the sliver entry removed from BOUNCE_SUBTYPES -> Aethermage parks.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => {});

describe("the carrier and the shape", () => {
  it("⭐ Aethermage flips; the arm carries the subtype restriction; an uncurated noun refuses", () => {
    expect(classifyCard({ id: "c-va", name: "Vedalken Aethermage", type: "Creature — Vedalken Wizard", mana: "{1}{U}", power: "1", toughness: "2",
      oracle: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, return target Sliver to its owner's hand.\nWizardcycling {3} ({3}, Discard this card: Search your library for a Wizard card, reveal it, put it into your hand, then shuffle.)" })).toMatch(/^native/);
    const p = parseEffectClause("return target Sliver to its owner's hand", "Creature");
    expect(p.atoms[0]).toMatchObject({ op: "bounce", targetType: "creature", restrictions: [{ kind: "subtype", subtype: "Sliver" }] });
    expect(parseEffectClause("return target Wombat to its owner's hand", "Creature")?.confidence ?? "low").toBe("low");
  });
});
