/**
 * reanimateFilterVocabulary.test.js — the BARE reanimate arm gets the filter vocabulary its own MV-capped
 * twin already had (CR 608).
 *
 * Third slice in a row found the same way: a subsystem where the machinery was already built and only the
 * vocabulary was absent. Here it was even sharper — the asymmetry was INSIDE ONE FUNCTION.
 *
 *   "return target <X> card with mana value N or less from your graveyard to the battlefield"  → any
 *       permanent-compatible filter, via parseGraveyardFilter + isPermanentReanimateFilter
 *   "return target <X> card from your graveyard to the battlefield"                            → CREATURE ONLY
 *
 * Same clause family, same destination, fifteen lines apart. ~50 corpus cards parked on a filter the file
 * could already parse one branch away — Sevinne's Reclamation (#339), Titania (#1135), Forge Anew (#1263),
 * Daretti (#1920), Starfield of Nyx (#2197).
 *
 * ⛔ isPermanentReanimateFilter IS WHAT MAKES THE WIDENING LEGAL. A card entering the battlefield must BE a
 * permanent, so an instant/sorcery filter — or the unfiltered "any" — must never reach the reanimate atom.
 * Putting a sorcery onto the battlefield is not a thing the rules allow, and no tier diff would show it.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

const atomOf = (word) => parseEffectClause(
  `return target ${word} card from your graveyard to the battlefield`, "Sorcery", { hasX: false })?.atoms?.[0] || null;

describe("⭐ the bare arm now takes every permanent-compatible filter", () => {
  it("the single card types", () => {
    expect(atomOf("artifact")).toMatchObject({ op: "reanimate", cardFilter: { typeFilter: "artifact" } });
    expect(atomOf("land")).toMatchObject({ op: "reanimate", cardFilter: { typeFilter: "land" } });
    expect(atomOf("enchantment")).toMatchObject({ op: "reanimate", cardFilter: { typeFilter: "enchantment" } });
  });

  it('⭐ "permanent" — the broadest legal filter for this destination', () => {
    expect(atomOf("permanent")).toMatchObject({ op: "reanimate", cardFilter: { typeFilter: "permanent" } });
  });

  it("a union keeps both halves", () => {
    expect(atomOf("artifact or creature")).toMatchObject({ op: "reanimate", cardFilter: { typeFilter: "artifact|creature" } });
  });

  it("CONTROL — the creature form is byte-identical to before (a plain string, not the new object)", () => {
    // The pinned shape. Changing it would ripple into every existing reanimate consumer.
    expect(atomOf("creature")).toMatchObject({ op: "reanimate", cardFilter: "creature" });
  });
});

describe("⛔ CREED — what must NOT reanimate", () => {
  it("⛔ an INSTANT or SORCERY filter parks — those cards cannot enter the battlefield", () => {
    // The load-bearing guard. A sorcery put onto the battlefield is not a legal game state, and nothing
    // downstream would catch it.
    expect(atomOf("instant")).toBeNull();
    expect(atomOf("sorcery")).toBeNull();
    expect(atomOf("instant or sorcery")).toBeNull();
  });

  it("⛔ the UNFILTERED form parks too — 'any card' includes instants", () => {
    expect(parseEffectClause("return target card from your graveyard to the battlefield", "Sorcery", { hasX: false })?.atoms?.[0] || null).toBeNull();
  });

  it("⛔ a SUBTYPE / negation / intersection still parks (parseGraveyardFilter returns null)", () => {
    // Safe FNs, and the reason the flip count is smaller than the raw corpus tally for this phrasing.
    expect(atomOf("rebel permanent")).toBeNull();
    expect(atomOf("nonland permanent")).toBeNull();
    expect(atomOf("legendary creature")).toBeNull();
  });
});

describe("⛔ the MV-CAPPED twin is unchanged", () => {
  const mvAtom = (word) => parseEffectClause(
    `return target ${word} card with mana value 3 or less from your graveyard to the battlefield`, "Sorcery", { hasX: false })?.atoms?.[0] || null;

  it("still carries its mvMax, and still refuses a non-permanent", () => {
    expect(mvAtom("creature")).toMatchObject({ cardFilter: { cardType: "creature", mvMax: 3 } });
    expect(mvAtom("artifact")).toMatchObject({ cardFilter: { typeFilter: "artifact", mvMax: 3 } });
    expect(mvAtom("instant")).toBeNull();
  });
});

describe("tier", () => {
  it("⭐ Trash for Treasure flips on the artifact filter", () => {
    expect(classifyCard({ name: "Trash for Treasure", type: "Sorcery", mana: "{3}{R}",
      oracle: "As an additional cost to cast this spell, sacrifice an artifact.\nReturn target artifact card from your graveyard to the battlefield." }))
      .toBe("native-spell");
  });

  it("⛔ Sevinne's Reclamation stays PARKED — its flashback rider is a separate blocker", () => {
    // Honest about reach: the filter lands, this card does not. Same shape as Natural Order in the tutor
    // slice — a vocabulary landing is not a card landing.
    expect(classifyCard({ name: "Sevinne's Reclamation", type: "Sorcery", mana: "{2}{W}",
      oracle: "Return target permanent card with mana value 3 or less from your graveyard to the battlefield.\nFlashback {4}{W}{W}\nIf this spell was cast from a graveyard, copy it twice." }))
      .not.toMatch(/^native/);
  });
});
