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

  it("RAMP-SPLIT: the split-destination fetch is now native; 'up to three' / non-land battlefield fetches still stay LOW → Arbiter", () => {
    // NOTE: the bare "up to two <land> → battlefield" multi-fetch (Explosive Vegetation / Skyshroud Claim)
    // is MODELED by RAMP-MULTI; the split destination (Cultivate / Kodama's Reach) is MODELED by RAMP-SPLIT.
    // "up to three" + the non-land cheat stay low:
    expect(isHigh("Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.")).toBe(true);  // Kodama's Reach (split) — RAMP-SPLIT
    expect(isHigh("Search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.")).toBe(false);                       // "up to three" (only "up to two" modeled)
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

  it("RAMP-SPLIT: the split-destination Cultivate fetch is now native; the non-land battlefield cheat stays Arbiter (multi-land 'up to two' is RAMP-MULTI)", () => {
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", "Cultivate"))).toBe("native-spell"); // RAMP-SPLIT — one -> battlefield tapped, other -> hand
    expect(classifyCard(C("Instant", "Search your library for a green creature card, put it onto the battlefield, then shuffle.", "Natural Order"))).toBe("arbiter-spell"); // non-land cheat
  });
});

/**
 * RAMP-TYPED (Dex, real-deck-unlock slice 1) — the typed-basic ramp staples that extend RAMP-1 from
 * the literal "basic land" phrase to a basic-land-TYPE fetch (CR 305.6). Nature's Lore "a Forest card"
 * (8 of the 15 profile decks), Farseek "a Plains, Island, Swamp, or Mountain card" (a comma-union typed
 * basic), Three Visits, Spoils of Victory (a 5-way union), plus the same clause inside Wood Elves' /
 * Kor Cartographer's ETB. Safe because a basic land TYPE only ever appears on a LAND (verified: zero
 * non-land corpus cards carry one), so the land-guard still admits only land fetches. CREED landmines:
 * an AMBIGUOUS-basic union (Quandrix Cultivator "a basic Forest or Island card" — "basic" must distribute
 * but the split can't prove it) and the "up to two" / intervening-if / Crew shells all stay LOW → Arbiter.
 */
describe("parser — typed-basic battlefield ramp (RAMP-TYPED)", () => {
  it("a single basic land TYPE fetches HIGH (Nature's Lore 'Forest', untapped + 'that card'/'it')", () => {
    expect(atomsOf("Search your library for a Forest card, put that card onto the battlefield, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["forest"]] }, filterLabel: "forest card", destination: "battlefield", entersTapped: false, targetType: null }]);
    expect(atomsOf("Search your library for a Forest card, put it onto the battlefield, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["forest"]] }, filterLabel: "forest card", destination: "battlefield", entersTapped: false, targetType: null }]);
  });

  it("a comma-union of basic land TYPES fetches HIGH, honoring tapped (Farseek, Spoils of Victory)", () => {
    expect(atomsOf("Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle."))
      .toEqual([{ op: "tutor", filter: { groups: [["plains"], ["island"], ["swamp"], ["mountain"]] }, filterLabel: "plains, island, swamp, or mountain card", destination: "battlefield", entersTapped: true, targetType: null }]);
    // Spoils of Victory — a 5-way union with the "and put" (Oxford-and) phrasing, untapped.
    expect(isHigh("Search your library for a Plains, Island, Swamp, Mountain, or Forest card and put that card onto the battlefield. Then shuffle.")).toBe(true);
  });

  it("CREED: an AMBIGUOUS-basic union (Quandrix Cultivator) stays LOW → Arbiter", () => {
    // "a basic Forest or Island card" — "basic" distributes to BOTH, but the split yields a bare "island"
    // group that would over-permissively offer a NONBASIC dual. Drop to Arbiter rather than mis-fetch.
    expect(isHigh("Search your library for a basic Forest or Island card, put it onto the battlefield, then shuffle.")).toBe(false);
    // NOTE: Skyshroud Claim ("up to two Forest cards → battlefield") is now MODELED by RAMP-MULTI.
  });

  it("regression: the 'basic land' phrase and the HAND tutor are unchanged by the type loosening", () => {
    expect(isHigh("Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.")).toBe(true);
    expect(atomsOf("Search your library for a Forest card, put it into your hand, then shuffle.")[0].destination).toBe("hand");
  });
});

describe("engine — the fetched typed basic enters the battlefield (RAMP-TYPED)", () => {
  const dual = { id: "d1", name: "Breeding Pool", type: "Land — Forest Island", oracle: "" };
  const TYPED_FOREST = { op: "tutor", filter: { groups: [["forest"]] }, filterLabel: "Forest card", destination: "battlefield", entersTapped: false, targetType: null };
  it("only LANDS with the Forest type are offered — duals included, other basics + non-lands excluded", () => {
    const st = resolveAtom(stateWithLibrary([forest, island, bear, dual]), TYPED_FOREST, { controller: "user", targets: [], cardName: "Nature's Lore" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield", entersTapped: false });
    // Forest + Breeding Pool (both carry the Forest type); Island and the Bear are NOT offered.
    expect(st.pendingChoice.candidates.map((c) => c.name).sort()).toEqual(["Breeding Pool", "Forest"]);
  });
  it("the chosen typed land enters the battlefield and leaves the library", () => {
    let st = resolveAtom(stateWithLibrary([forest, island]), TYPED_FOREST, { controller: "user", targets: [], cardName: "Three Visits" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.map((c) => c.card.name)).toEqual(["Forest"]); // the Forest, not the Island
    expect(st.players.user.battlefield[0].tapped).toBe(false);                       // Nature's Lore / Three Visits are untapped
    expect(st.players.user.library).toHaveLength(1);
  });
  it("Farseek's tapped union enters TAPPED", () => {
    const TAPPED_UNION = { op: "tutor", filter: { groups: [["plains"], ["island"], ["swamp"], ["mountain"]] }, filterLabel: "land", destination: "battlefield", entersTapped: true, targetType: null };
    let st = resolveAtom(stateWithLibrary([island, forest]), TAPPED_UNION, { controller: "user", targets: [], cardName: "Farseek" });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Island"]); // only the Island matches the union (Forest is not in it)
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield[0].card.name).toBe("Island");
    expect(st.players.user.battlefield[0].tapped).toBe(true);
  });
});

describe("coverage — typed-basic ramp flips native; the rider-shelled cards bounce (RAMP-TYPED)", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("the typed-basic ramp staples are native (spell + trigger + removal-rider)", () => {
    expect(classifyCard(C("Sorcery", "Search your library for a Forest card, put that card onto the battlefield, then shuffle.", "Nature's Lore"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a Forest card, put it onto the battlefield, then shuffle.", "Three Visits"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.", "Farseek"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a Plains, Island, Swamp, Mountain, or Forest card and put that card onto the battlefield. Then shuffle.", "Spoils of Victory"))).toBe("native-spell");
    // Mwonvuli Acid-Moss — destroy-target-land + the typed ramp; BOTH atoms modeled, neither dropped.
    expect(classifyCard(C("Sorcery", "Destroy target land. Search your library for a Forest card, put that card onto the battlefield tapped, then shuffle.", "Mwonvuli Acid-Moss"))).toBe("native-spell");
    // Clean ETB ramp creatures (no rider) route native-trigger.
    expect(classifyCard(C("Creature — Elf Scout", "When this creature enters, search your library for a Forest card, put that card onto the battlefield, then shuffle.", "Wood Elves"))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Soldier", "When this creature enters, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.", "Kor Cartographer"))).toBe("native-trigger");
  });

  it("CREED: typed-ramp cards wrapped in an unmodeled clause stay out of native", () => {
    // Quandrix Cultivator — ambiguous-basic union → the clause itself drops to Arbiter.
    expect(classifyCard(C("Creature — Turtle Druid", "When this creature enters, you may search your library for a basic Forest or Island card, put it onto the battlefield, then shuffle.", "Quandrix Cultivator"))).not.toBe("native-trigger");
    // Loyal Warhound / Knight of the White Orchid — an INTERVENING-IF gate the flush stage doesn't evaluate.
    expect(classifyCard(C("Creature — Dog", "Vigilance\nWhen this creature enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.", "Loyal Warhound"))).not.toBe("native-trigger");
    // Karametra — a devotion-based static ("isn't a creature") the engine doesn't model.
    expect(classifyCard(C("Legendary Enchantment Creature — God", "Indestructible\nAs long as your devotion to green and white is less than seven, Karametra isn't a creature.\nWhenever you cast a creature spell, you may search your library for a Forest or Plains card, put it onto the battlefield tapped, then shuffle.", "Karametra, God of Harvests"))).not.toBe("native-trigger");
    // Aerial Surveyor — a Crew ability + an intervening-if attack trigger; not a clean native.
    expect(classifyCard(C("Artifact — Vehicle", "Flying\nWhenever this Vehicle attacks, if defending player controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.\nCrew 2", "Aerial Surveyor"))).not.toBe("native-trigger");
  });
});
