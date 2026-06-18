/**
 * RAMP-1 — land ramp to the BATTLEFIELD (a new tutor destination).
 *
 * The shipped tutor fetches a card to HAND; ramp fetches a basic land onto the BATTLEFIELD (tapped per
 * the card), reusing the same tutor atom + resolution-time picker. The fetched card enters via the shared
 * `enterCardFromZone` helper (also used by reanimation), firing its ETB triggers. The atom is reused across
 * every path — spell (Rampant Growth), ETB trigger (Farhaven Elf), dies trigger (Viridian Emissary), and
 * activated ability (Sakura-Tribe Elder) — and a splitter fix lets the optional "you may search …" wrapper
 * keep its tutor body intact. This file pins:
 *   1. the parser — single-land "onto the battlefield[ tapped]" parses HIGH; the multi-land / split-
 *      destination (Cultivate) / non-land cheat (Natural Order) landmines stay LOW; hand tutor unchanged;
 *   2. the engine — the fetched basic enters the battlefield TAPPED (and untapped), library shrinks + only
 *      basics are offered;
 *   3. the "you may" fix — an optional ETB/dies ramp creature routes natively; a "you may" HAND tutor too;
 *   4. coverage — the staples flip native across spell/trigger/activated, and Solemn Simulacrum (a DUAL
 *      trigger — the board's flagged FP) is native only because BOTH its triggers are modeled; landmines bounce.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom, enterCardFromZone } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;
const isHigh = (txt, ct = "Sorcery") => programConfidence(parseEffectClause(txt, ct)) === "high";
const RAMP_ATOM = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, targetType: null };

function stateWithLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: lib } } };
}
const forest = { id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" };
const island = { id: "i1", name: "Island", type: "Basic Land — Island", oracle: "" };
const bear = { id: "b1", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" };

describe("parser — battlefield-destination tutor (RAMP-1)", () => {
  it("parses single-land 'onto the battlefield' (tapped + untapped, 'it' + 'that card') to a battlefield tutor", () => {
    expect(atomsOf("Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, targetType: null }]);
    expect(atomsOf("Search your library for a basic land card, put it onto the battlefield, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: false, targetType: null }]);
    // "a land card" (any land, e.g. Crop Rotation) and "a snow land card" (Into the North) are land fetches too.
    expect(isHigh("Search your library for a land card, put it onto the battlefield, then shuffle.")).toBe(true);
    expect(isHigh("Search your library for a snow land card, put it onto the battlefield tapped, then shuffle.")).toBe(true);
  });

  it("CREED: multi-land / split-destination / non-land battlefield fetches stay LOW → Arbiter", () => {
    expect(isHigh("Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.")).toBe(false);                       // Explosive Vegetation
    expect(isHigh("Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.")).toBe(false); // Kodama's Reach (split)
    expect(isHigh("Search your library for a green creature card, put it onto the battlefield, then shuffle.")).toBe(false);                                      // Natural Order (non-land cheat)
  });

  it("regression: the HAND tutor is unchanged (destination hand, no entersTapped)", () => {
    expect(atomsOf("Search your library for a basic land card, put it into your hand, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "hand", targetType: null }]);
  });
});

describe("engine — the fetched basic enters the battlefield", () => {
  it("enters TAPPED, removed from library, only basics offered as candidates", () => {
    let st = resolveAtom(stateWithLibrary([forest, island, bear]), RAMP_ATOM, { controller: "user", targets: [], cardName: "Rampant Growth" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield", entersTapped: true });
    expect(st.pendingChoice.candidates.map((c) => c.name).sort()).toEqual(["Forest", "Island"]); // the Bear is excluded
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield).toHaveLength(1);
    expect(st.players.user.battlefield[0].tapped).toBe(true);
    expect(st.players.user.library).toHaveLength(2); // one basic left the library
  });

  it("the untapped variant enters untapped", () => {
    let st = resolveAtom(stateWithLibrary([forest]), { ...RAMP_ATOM, entersTapped: false }, { controller: "user", targets: [], cardName: "Untamed Wilds" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield[0].tapped).toBe(false);
  });

  it("enterCardFromZone returns entered:false (state unchanged) when the card isn't in the zone", () => {
    const st = stateWithLibrary([forest]);
    const r = enterCardFromZone(st, { playerId: "user", cardId: "nonexistent", fromZone: "library", tapped: true });
    expect(r.entered).toBe(false);
    expect(r.state).toBe(st);
  });
});

describe("coverage — ramp flips native across every path; landmines bounce", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("spell ramp is native-spell (incl. removal+ramp and additional-cost ramp)", () => {
    expect(classifyCard(C("Sorcery", "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "Rampant Growth"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Destroy target creature. Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", "Deathsprout"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for a land card, put that card onto the battlefield, then shuffle.", "Crop Rotation"))).toBe("native-spell");
  });

  it("activated + ETB + dies ramp route natively (the atom is reused on every path)", () => {
    expect(classifyCard(C("Creature — Snake", "Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "Sakura-Tribe Elder"))).toBe("native-activated");
    expect(classifyCard(C("Artifact", "{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "Wayfarer's Bauble"))).toBe("native-activated");
    expect(classifyCard(C("Creature — Elf Druid", "When this creature enters, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", "Farhaven Elf"))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Elf Warrior", "When this creature dies, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", "Viridian Emissary"))).toBe("native-trigger");
  });

  it("CREED: Solemn Simulacrum (DUAL trigger) is native only because BOTH triggers are modeled — neither dropped", () => {
    // The board's flagged FP: an ETB ramp + a SECOND 'dies → draw' trigger. The all-or-nothing gate
    // requires both to route; the ETB ramp (RAMP-1) + the dies-draw (already modeled) both do.
    expect(classifyCard(C("Artifact Creature — Golem", "When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.", "Solemn Simulacrum"))).toBe("native-trigger");
    // Swap the dies-draw for an UNMODELED second trigger → the whole card must fall out of native (not a partial).
    expect(classifyCard(C("Artifact Creature — Golem", "When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, exile target permanent an opponent controls unless its controller pays 3 life.", "Fake Solemn"))).not.toBe("native-trigger");
  });

  it("the 'you may' splitter fix makes optional HAND tutors native too (Sylvan Ranger), a free side-benefit", () => {
    expect(classifyCard(C("Creature — Elf Scout", "When this creature enters the battlefield, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.", "Sylvan Ranger"))).toBe("native-trigger");
  });

  it("CREED: multi-land and non-land battlefield fetches stay Arbiter", () => {
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", "Explosive Vegetation"))).toBe("arbiter-spell");
    expect(classifyCard(C("Instant", "Search your library for a green creature card, put it onto the battlefield, then shuffle.", "Natural Order"))).toBe("arbiter-spell");
  });
});
