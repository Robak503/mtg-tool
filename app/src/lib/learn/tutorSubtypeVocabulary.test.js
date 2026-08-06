/**
 * tutorSubtypeVocabulary.test.js — TF-1: eight creature subtypes join the tutor/reveal filter vocabulary.
 * Giant Harbinger, Forerunner of the Coalition.
 *
 * ⭐ A TIER SPLIT INSIDE ONE ALLOWLIST: "reveal an ELF card" parsed and "reveal a HUMAN card" did not, from
 * the same matcher, on the same shape. `TUTOR_FILTER_WORDS` is curated, and the wording diff was the bug.
 *
 * ⭐⭐ THE LIST STATES ITS OWN TWO CRITERIA, AND BOTH WERE MEASURED RATHER THAN ASSUMED:
 *   (a) at least one "search your library for / reveal a <subtype> card" carrier exists in the corpus;
 *   (b) the word appears ONLY on the subtype side of the em dash — zero occurrences left of it, or on a
 *       dashless type line — so `\b<word>\b` containment matches exactly the subtyped cards.
 *
 * ⛔ I FIRST ADDED EIGHTEEN WORDS AND TRIMMED TO EIGHT. Ten of them (beast, spirit, knight, rogue, druid,
 * shaman, dwarf, cat, bird, snake) passed (b) and FAILED (a) with ZERO carriers — pure untested surface in
 * a gate whose entire job is to refuse. Same +2 either way, less than half the surface. Criterion (a) is
 * not decoration; it is what stops this list accumulating words no card can exercise.
 *
 * ⛔⛔ THE COLLISION CHECK ALMOST PASSED BROKEN, and that is the part worth remembering. Its first run
 * reported ZERO subtype-side hits for every candidate — impossible, "Human" is on thousands of type lines —
 * and at a glance it read as "all safe", which is the exact answer I wanted. A shell-eaten backslash had
 * turned `\b` into a literal BACKSPACE so nothing matched at all. The all-zero rule caught it. The probe now
 * lives in a file with a sanity gate that exits non-zero if a known type line stops splitting.
 * ⭐ A verification that returns the convenient answer deserves MORE suspicion than one that returns an
 * inconvenient one, not less.
 *
 * ⚠️ THE FILE'S OWN STANDING WARNING, honoured: a group word is matched by containment against the TYPE
 * LINE, so a word that appears in no type line would classify the card native and then match nothing, for
 * ever, invisibly. The runtime row below is the direct check — including "Giant Growth", an Instant with
 * "Giant" in its NAME, which must NOT match.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the eight words removed -> both cards park.
 *   · "giant" alone removed -> Giant Harbinger parks, Forerunner unaffected (the words are independent).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";

const GIANT_HARBINGER = { id: "c-gh", name: "Giant Harbinger", type: "Creature — Giant Shaman", mana: "{4}{R}", power: "3", toughness: "3",
  oracle: "When this creature enters, you may search your library for a Giant card, reveal it, then shuffle and put that card on top." };
const FORERUNNER = { id: "c-fc", name: "Forerunner of the Coalition", type: "Creature — Human Pirate", mana: "{2}{B}", power: "2", toughness: "2",
  oracle: "When this creature enters, you may search your library for a Pirate card, reveal it, then shuffle and put that card on top.\nWhenever another Pirate you control enters, each opponent loses 1 life." };

describe("the carriers", () => {
  it("⭐ both flip native", () => {
    for (const c of [GIANT_HARBINGER, FORERUNNER]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐⭐ the eight new words parse — and the gate is NOT loosened", () => {
    const row = {};
    for (const w of ["human", "soldier", "zombie", "angel", "warrior", "cleric", "pirate", "giant"]) {
      row[w] = parseTutorFilter(w);
    }
    // ⛔ THE REFUSALS. `beast` is a REAL creature type with zero tutor carriers — criterion (a) keeps it
    // out, which makes it a stable negative. An invented word must obviously still park.
    row.beast_realTypeNoCarrier = parseTutorFilter("beast");
    row.invented = parseTutorFilter("zzzqcreature");
    row.nonlegendary = parseTutorFilter("nonlegendary");
    console.log("  WITNESS tutorSubtypeVocabulary", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.human).toEqual({ groups: [["human"]] });
    expect(row.giant).toEqual({ groups: [["giant"]] });
    expect(row.pirate).toEqual({ groups: [["pirate"]] });
    expect(row.beast_realTypeNoCarrier).toBeNull();
    expect(row.invented).toBeNull();
    expect(row.nonlegendary).toBeNull();
  });
});

describe("⭐⭐ the filter MATCHES real cards — the vacuous-filter guard this file warns about", () => {
  it("⭐⭐ a Giant filter finds a Giant, and never a card with Giant in its NAME", () => {
    // ⛔ "Giant Growth" IS THE ASSERTION. The filter is containment against the TYPE LINE; a word that
    // leaked into a name match would let this Instant answer a creature-type tutor. A filter that matched
    // nothing at all would be the mirror failure — native tier, empty result, for ever, invisibly.
    const F = { groups: [["giant"]] };
    const row = {
      giantCreature: cardMatchesTutorFilter({ name: "Bramblewood Paragon", type: "Creature — Giant Warrior", oracle: "" }, F),
      plainCreature: cardMatchesTutorFilter({ name: "Bear", type: "Creature — Bear", oracle: "" }, F),
      giantInNameOnly: cardMatchesTutorFilter({ name: "Giant Growth", type: "Instant", oracle: "" }, F),
    };
    console.log("  WITNESS tutorSubtypeMatch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ giantCreature: true, plainCreature: false, giantInNameOnly: false });
  });
});
