/**
 * RAMP-MULTI (Dex, real-deck-unlock follow-up) — multi-land battlefield ramp: "Search your library for UP
 * TO TWO <LAND> cards, put them onto the battlefield[ tapped], then shuffle." (Explosive Vegetation /
 * Skyshroud Claim (5 decks) / Ranger's Path / Migration Path / Nissa's Expedition). Modeled as a tutor
 * fetching up to TWO matching lands (`remaining:2`): resolveTutorChoice chains a second single-pick from the
 * still-legal candidates and shuffles once at the end. The driver loop drains the re-suspend (AI auto-picks
 * both; a human gets two pickers) — the codebase already anticipates a re-paused "second tutor"
 * (learnSession.settleTutorChoice). Reuses the RAMP-1/RAMP-TYPED land-guard + ambiguous-basic guard; a split
 * destination (Cultivate), "up to three", a non-land fetch, or any trailing rider stays LOW → Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;
const isHigh = (txt, ct = "Sorcery") => programConfidence(parseEffectClause(txt, ct)) === "high";
const MULTI = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null };

function stateWithLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: lib, battlefield: [] } } };
}
const forest = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const island = (id) => ({ id, name: "Island", type: "Basic Land — Island", oracle: "" });
const bear = { id: "b1", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" };

describe("parser — multi-land battlefield ramp (RAMP-MULTI)", () => {
  it("parses 'up to two <land>' to a battlefield tutor with remaining:2 (basic + typed, tapped + untapped)", () => {
    expect(atomsOf("Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null }]);
    expect(atomsOf("Search your library for up to two Forest cards, put them onto the battlefield, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["forest"]] }, filterLabel: "forest card", destination: "battlefield", entersTapped: false, remaining: 2, targetType: null }]);
    expect(isHigh("Search your library for up to two land cards, put them onto the battlefield tapped, then shuffle.")).toBe(true); // Hour of Promise body / Primeval Titan clause ("land")
  });

  it("RAMP-SPLIT: the split-destination fetch is now native; WAVE-2b widens the bare multi-fetch to up-to-N (N=3..5); non-land / ambiguous-basic / rider multi-fetches still stay LOW → Arbiter", () => {
    expect(isHigh("Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.")).toBe(true); // Cultivate (split) — RAMP-SPLIT
    // WAVE-2b UP-TO-N — the bare both-to-battlefield "up to three" land fetch is now native (Nissa's Renewal /
    // Seedguide Ash / Horizon Boughs). (The SPLIT "up to three, put one … and the other …" is still LOW — its
    // "one … the other" phrasing is intrinsically two; pinned low in parser.test.js.)
    expect(atomsOf("Search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 3, targetType: null }]);
    // MULTI-FETCH-CREATURES (Defense of the Heart) — the PLAIN "up to two creature cards" fetch to battlefield
    // is now native (its resolver enters each creature via enterCardFromZone, firing ETB). Was parked; the slice
    // opens exactly the single-unqualified-"creature" filter. A SUBTYPED / MV-capped / unioned creature fetch
    // (none in the corpus) still stays LOW → Arbiter (CREED — no wrong-cheat FP).
    expect(isHigh("Search your library for up to two creature cards, put them onto the battlefield, then shuffle.")).toBe(true);                               // plain creature — now native
    expect(isHigh("Search your library for up to two Dragon cards, put them onto the battlefield, then shuffle.")).toBe(false);                                // subtyped creature — stays Arbiter (CREED)
    expect(isHigh("Search your library for up to two basic Forest or Island cards, put them onto the battlefield, then shuffle.")).toBe(false);                // ambiguous-basic union
    // GRADUATED 2026-07-29 — Hour of Promise. This asserted false BECAUSE a "Then if <cond>, <effect>" rider
    // had no route; that was a capability statement, not a refusal to keep. Both halves are now genuinely
    // modelled and VERIFIED, not assumed: the condition "you control three or more Deserts" evaluates
    // correctly at the 3-or-more boundary (0/2 → false, 3/5 → true), and the rider parses to a real
    // create-token atom carrying that condition. A rider that fires only when its condition holds is not a
    // dropped rider.
    expect(isHigh("Search your library for up to two land cards, put them onto the battlefield tapped, then shuffle. Then if you control three or more Deserts, create two 2/2 black Zombie creature tokens.")).toBe(true); // Hour of Promise (rider — now modelled)
    // …and the guarantee that pin protected keeps a LIVE fixture: a rider whose condition is OUTSIDE the
    // vocabulary still parks the whole card, so an unreadable rider is never silently dropped (CREED).
    expect(isHigh("Search your library for up to two land cards, put them onto the battlefield tapped, then shuffle. Then if you control a creature named Bob and it is raining, create two 2/2 black Zombie creature tokens.")).toBe(false);
  });
});

describe("engine — 'up to two' fetches both lands, chaining the second pick (RAMP-MULTI)", () => {
  it("auto-picks both: two tapped basics enter, the library shrinks by two, no pending choice remains", () => {
    let st = resolveAtom(stateWithLibrary([forest("f1"), forest("f2"), island("i1"), bear]), MULTI, { controller: "user", targets: [], cardName: "Explosive Vegetation" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", remaining: 2, destination: "battlefield", entersTapped: true });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));   // fetch 1
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", remaining: 1 }); // re-suspended for the 2nd
    expect(st.players.user.battlefield).toHaveLength(1);
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));   // fetch 2
    expect(st.pendingChoice).toBeFalsy();                                          // done
    expect(st.players.user.battlefield).toHaveLength(2);
    expect(st.players.user.battlefield.every((p) => p.tapped)).toBe(true);
    expect(st.players.user.battlefield.every((p) => /Land/.test(p.card.type))).toBe(true);
    expect(st.players.user.library).toHaveLength(2);                              // 4 → 2 (two lands left)
  });

  it("'up to two' with only ONE legal land: fetches one, the second finds nothing (no fabricated land)", () => {
    let st = resolveAtom(stateWithLibrary([forest("f1"), bear]), MULTI, { controller: "user", targets: [], cardName: "Explosive Vegetation" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));   // fetch the one Forest
    expect(st.pendingChoice).toMatchObject({ remaining: 1, candidates: [] });     // re-suspended, but nothing left
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));   // auto-pick → null → finds nothing
    expect(st.pendingChoice).toBeFalsy();
    expect(st.players.user.battlefield).toHaveLength(1);                          // exactly one land (not two)
  });

  it("declining the FIRST pick ends the search (the player takes fewer; no second picker)", () => {
    let st = resolveAtom(stateWithLibrary([forest("f1"), forest("f2")]), MULTI, { controller: "user", targets: [], cardName: "Explosive Vegetation" });
    st = resolveTutorChoice(st, null);                                            // decline the first
    expect(st.pendingChoice).toBeFalsy();                                          // search over — no chained pick
    expect(st.players.user.battlefield).toHaveLength(0);
  });
});

describe("coverage — RAMP-MULTI staples flip native; landmines bounce", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("the multi-fetch ramp staples are native-spell (incl. a stripped cast-keyword: Migration Path's Cycling)", () => {
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", "Explosive Vegetation"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for up to two Forest cards, put them onto the battlefield, then shuffle.", "Skyshroud Claim"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for up to two Forest cards, put them onto the battlefield tapped, then shuffle.", "Ranger's Path"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.\nCycling {2} ({2}, Discard this card: Draw a card.)", "Migration Path"))).toBe("native-spell");
  });
  it("RAMP-SPLIT: the split-destination Cultivate family is now native", () => {
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", "Cultivate"))).toBe("native-spell");
  });
});
