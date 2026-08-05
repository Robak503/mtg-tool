/**
 * namedTutorMultiZone.test.js — "search your library AND/OR GRAVEYARD for a card named <X>, reveal it, and
 * put it into your hand" — Dominaria's legendary-partner cycle and its descendants (Niambi Faithful Healer,
 * Ashiok's Forerunner, Sorin's Guide, Visage of Bolas, Angrath's Fury, Tower Winder, 19 more).
 *
 * ⭐ THE MULTI-ZONE RUNTIME WAS ALREADY BUILT and this arm only ignites it. The tutor resolver's
 * `sourceZones` union — added for Finale of Devastation's identical "library and/or graveyard" search —
 * gathers candidates across both zones and returns each pick to the right one. There is no new search, no
 * new candidate pool and no new auto-pick. The `bfxg` arm above it already proves the wire, for the
 * to-BATTLEFIELD destination; this is the same wire with destination "hand" and a name filter.
 *
 * Everything else is shared verbatim with the library-only `tnm` arm beneath it: the same `filter.name`
 * positive gate, the same disjunctive-name refusal, and the same handling of "you may" (peeled by the
 * leading-optional wrapper, so `optional` is deliberately NOT set here — setting it would ask twice).
 *
 * BOTH PRINTED CONNECTIVES are spelled out rather than loosened to `.*`: the cycle prints "reveal it, AND
 * put it into your hand" (Niambi) and "reveal it, THEN put it into your hand" (Sun-Blessed Mount), and the
 * conditional shuffle appears as both "if you search" and "if you searched". The anchor still refuses any
 * rider it has not been shown.
 *
 * The trailing "If you search your library this way, shuffle." is conditional on WHICH zone was searched,
 * which the shuffle-unconditionally path (CR 701.19e) already satisfies: shuffling a library that was not
 * searched is a no-op on an already-randomized zone, never an observable difference.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test — the clause
 * was parsed directly and yielded [] before the suite was read): the arm disabled -> every pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram, autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "search your library and/or graveyard for a card named Teferi, Timebender, reveal it, and put it into your hand. If you search your library this way, shuffle.";
const NIAMBI = { id: "c-nb", name: "Niambi, Faithful Healer", type: "Legendary Creature — Human Cleric", mana: "{1}{W}",
  power: 2, toughness: 3, oracle: "When Niambi enters, you may search your library and/or graveyard for a card named Teferi, Timebender, reveal it, and put it into your hand. If you search your library this way, shuffle." };
const SUN_BLESSED_MOUNT = { id: "c-sbm", name: "Sun-Blessed Mount", type: "Creature — Dinosaur", mana: "{4}{W}",
  power: 4, toughness: 4, oracle: "When this creature enters, you may search your library and/or graveyard for a card named Huatli, Dinosaur Knight, reveal it, then put it into your hand. If you searched your library this way, shuffle." };

const TEFERI = { id: "tf", name: "Teferi, Timebender", type: "Legendary Planeswalker — Teferi", oracle: "", mana: "{4}{W}{U}" };
const JUNK = { id: "jk", name: "Mountain", type: "Basic Land — Mountain", oracle: "" };

/** Resolve the clause with `library` / `graveyard` stocked, auto-picking any tutor choice it raises. */
function search(library, graveyard) {
  const prog = parseEffectClause(CLAUSE, "Creature");
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...b, players: { ...b.players, user: { ...b.players.user, library, graveyard, hand: [] } } };
  const r = runEffectProgram(s, { id: "so", source: { name: "Probe" },
    payload: { params: { program: prog, controller: "user", targets: [], sourceId: "p1" } } });
  let st = r?.state || r;
  if (st.pendingChoice) {
    const done = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    st = done?.state || done;
  }
  return { hand: (st.players.user.hand || []).map((c) => c.name), lib: (st.players.user.library || []).length, gy: (st.players.user.graveyard || []).length };
}

describe("parse", () => {
  it("⭐ emits the tutor atom with BOTH zones and a clean name", () => {
    // The comma'd legendary name is the thing to watch: a looser anchor swallows ", reveal it, and" into
    // the name and the filter then matches no real card — a native card that silently finds nothing.
    expect(parseEffectClause(CLAUSE, "Creature").atoms).toEqual([{
      op: "tutor",
      filter: { name: "teferi, timebender" },
      filterLabel: "card named teferi, timebender",
      destination: "hand",
      sourceZones: ["library", "graveyard"],
      targetType: null,
    }]);
  });

  it("both printed connectives parse — 'and put' and 'then put'", () => {
    expect(classifyCard(NIAMBI)).toBe("native-trigger");
    expect(classifyCard(SUN_BLESSED_MOUNT)).toBe("native-trigger");
  });

  it("⛔ a DISJUNCTIVE name is refused — admitting it would drop half the choice", () => {
    expect((parseEffectClause("search your library and/or graveyard for a card named Halvar, God of Battle or an Equipment card, reveal it, and put it into your hand.", "Creature").atoms || []))
      .toEqual([]);
  });

  it("⛔ the LIBRARY-ONLY wording keeps its own single-zone atom", () => {
    const [a] = parseEffectClause("search your library for a card named Shivan Dragon, reveal it, put it into your hand, then shuffle.", "Sorcery").atoms || [];
    expect(a.op).toBe("tutor");
    expect(a.sourceZones).toBeUndefined();
  });
});

describe("⭐ LAW 6 — the search really reaches BOTH zones", () => {
  it("finds the named card in the LIBRARY", () => {
    const r = search([TEFERI, JUNK], []);
    expect(r.hand).toEqual(["Teferi, Timebender"]);
    expect(r.lib).toBe(1); // the junk card remains
  });

  it("⭐ finds the named card in the GRAVEYARD — the half the single-zone arm cannot reach", () => {
    const r = search([JUNK], [TEFERI]);
    expect(r.hand).toEqual(["Teferi, Timebender"]);
    expect(r.gy).toBe(0);
  });

  it("⛔ finds nothing when the named card is in neither zone, and disturbs neither", () => {
    const r = search([JUNK], [JUNK]);
    expect(r.hand).toEqual([]);
    expect(r.lib).toBe(1);
    expect(r.gy).toBe(1);
  });
});
