/**
 * tutorFilterVocabulary.test.js — two additions to the tutor's FILTER vocabulary (CR 701.19a / 110.4a).
 *
 * The graveyard-destination slice ended on the pin "a destination landing does not widen the search
 * vocabulary" (Unmarked Grave). This is the other axis of that same subsystem, and it turned out to be the
 * same shape twice over: BOTH gates already existed in cardMatchesTutorFilter and only the PARSE was missing.
 *   • `filter.permanentOnly` — built for Wargate's MV-capped permanent fetch.
 *   • `filter.colors`        — built for the color-qualified X-tutor (Green Sun's Zenith).
 *
 * ⛔ WHY COLORS MUST NOT BECOME GROUP WORDS. A group word is matched by `\b<word>\b` CONTAINMENT AGAINST THE
 * TYPE LINE. No type line contains "green", so admitting it to TUTOR_FILTER_WORDS would make the tutor
 * classify native, find nothing, ever — and the tier would never show it, because the card was already being
 * counted. That is the vacuous-subtype-filter FP class the ledger keeps a dedicated probe for. The
 * discrimination assertions below are what prove these gates are not vacuous.
 *
 * ⛔ AND WHY A COLOR UNION PARKS. cardMatchesTutorFilter's color loop is an AND over the list; printed text
 * means OR ("blue or black creature" = blue OR black). Emitting both would demand a card be BOTH — narrower
 * than printed. Parking (Kaito Shizuki) is the honest read until the gate learns OR.
 */
import { describe, expect, it } from "vitest";

import { parseTutorFilter } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

const DRAGON = { name: "Shivan Dragon", type: "Creature — Dragon", colors: ["R"] };
const ELF = { name: "Llanowar Elves", type: "Creature — Elf Druid", colors: ["G"] };
const BOLT = { name: "Lightning Bolt", type: "Instant", colors: ["R"] };
const SOL_RING = { name: "Sol Ring", type: "Artifact", colors: [] };
const match = (phrase, card) => cardMatchesTutorFilter(card, parseTutorFilter(phrase));

describe("PERMANENT-CARD filter (CR 110.4a)", () => {
  it("⭐ a bare 'permanent' parses to the permanentOnly gate with no type groups", () => {
    expect(parseTutorFilter("permanent")).toEqual({ groups: [], permanentOnly: true });
  });

  it("⭐ a qualifier keeps BOTH — 'dragon permanent' is a Dragon AND a permanent", () => {
    expect(parseTutorFilter("dragon permanent")).toEqual({ groups: [["dragon"]], permanentOnly: true });
  });

  it("⛔ NOT VACUOUS — it admits permanents and rejects an instant", () => {
    expect(match("permanent", DRAGON)).toBe(true);
    expect(match("permanent", SOL_RING)).toBe(true);
    expect(match("permanent", BOLT)).toBe(false); // the whole point of the gate
  });

  it("⛔ the qualifier still discriminates — a Dragon permanent is not an Elf", () => {
    expect(match("dragon permanent", DRAGON)).toBe(true);
    expect(match("dragon permanent", ELF)).toBe(false);
  });
});

describe("COLOR-QUALIFIED filter", () => {
  it("⭐ 'green creature' is a creature GROUP plus a COLOR gate — never a color group word", () => {
    const f = parseTutorFilter("green creature");
    expect(f).toEqual({ groups: [["creature"]], colors: ["green"] });
    // ⛔ the load-bearing half: "green" must not appear as a type-line word, or the filter is vacuous.
    expect(f.groups.flat()).not.toContain("green");
  });

  it("⛔ NOT VACUOUS — it admits a green creature and rejects a red one", () => {
    expect(match("green creature", ELF)).toBe(true);
    expect(match("green creature", DRAGON)).toBe(false);
  });

  it("⛔ a color UNION parks the whole tutor rather than narrowing it to an AND", () => {
    expect(parseTutorFilter("blue or black creature")).toBeNull();
  });

  it("colors compose with the permanent gate", () => {
    expect(parseTutorFilter("green permanent")).toEqual({ groups: [], permanentOnly: true, colors: ["green"] });
  });
});

describe("⛔ the existing vocabulary is unchanged", () => {
  it("every previously-known phrase parses exactly as before", () => {
    expect(parseTutorFilter("creature")).toEqual({ groups: [["creature"]] });
    expect(parseTutorFilter("basic land")).toEqual({ groups: [["basic", "land"]] });
    expect(parseTutorFilter("instant or sorcery")).toEqual({ groups: [["instant"], ["sorcery"]] });
    expect(parseTutorFilter("plains, island, swamp, or mountain"))
      .toEqual({ groups: [["plains"], ["island"], ["swamp"], ["mountain"]] });
  });

  it("⛔ an unknown word still parks (CREED) — the new arms do not loosen the gate", () => {
    expect(parseTutorFilter("zombie")).toBeNull();       // not a curated subtype
    expect(parseTutorFilter("nonlegendary")).toBeNull(); // Unmarked Grave, still out
  });
});

describe("tier", () => {
  it("⭐ Planar Bridge flips on the permanent-card filter", () => {
    expect(classifyCard({ name: "Planar Bridge", type: "Legendary Artifact", mana: "{6}",
      oracle: "{4}, {T}: Search your library for a permanent card, put it onto the battlefield, then shuffle. Activate only as a sorcery." }))
      .toBe("native-activated");
  });

  it("⛔ Natural Order stays PARKED — its additional cost is a separate blocker", () => {
    // Recorded so the vocabulary's reach is not overstated: the filter lands, the card does not.
    expect(classifyCard({ name: "Natural Order", type: "Sorcery", mana: "{2}{G}{G}",
      oracle: "As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle." }))
      .not.toMatch(/^native/);
  });
});
