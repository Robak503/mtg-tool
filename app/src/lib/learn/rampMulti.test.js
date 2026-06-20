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

  it("CREED: split-destination / 'up to three' / non-land / rider multi-fetches stay LOW → Arbiter", () => {
    expect(isHigh("Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.")).toBe(false); // Cultivate (split)
    expect(isHigh("Search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.")).toBe(false);                   // up to three
    expect(isHigh("Search your library for up to two creature cards, put them onto the battlefield, then shuffle.")).toBe(false);                              // non-land
    expect(isHigh("Search your library for up to two basic Forest or Island cards, put them onto the battlefield, then shuffle.")).toBe(false);                // ambiguous-basic union
    expect(isHigh("Search your library for up to two land cards, put them onto the battlefield tapped, then shuffle. Then if you control three or more Deserts, create two 2/2 black Zombie creature tokens.")).toBe(false); // Hour of Promise (rider)
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
  it("CREED: the split-destination Cultivate family stays Arbiter", () => {
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", "Cultivate"))).toBe("arbiter-spell");
  });
});
