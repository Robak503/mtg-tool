/**
 * ANIMIST'S AWAKENING — the {X}-cost mass reveal-top-X → put-all-LANDS-tapped → bottom-the-rest family, with a
 * spell-mastery untap rider.
 *
 * "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and
 * the rest on the bottom of your library in a random order.
 *  Spell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands."
 * (Animist's Awakening — {X}{G}.)
 *
 * THE SEAM: a new `animist-awakening` atom (applyAnimistAwakening in atoms/library.js) reveals the top X of the
 * controller's library, puts EVERY revealed LAND onto the battlefield TAPPED via the SHARED enterCardFromZone
 * (tapped:true — so each entry fires ETB / landfall exactly like a Cultivate/Wargate/reanimation entry), bottoms
 * the REST (the revealed non-lands) in a random order via the shared bottomLibraryCardsByIds, then — if the
 * controller's graveyard holds two-or-more instant-and/or-sorcery cards (spell mastery) — UNTAPS exactly the
 * lands it just put out. X (bound at cast, CR 601.2b) caps the reveal count ONLY (a type-only filter, no MV cap).
 * The parser collapses the whole card up front (matchAnimistAwakening, gated to an {X}-cost spell) so the clause
 * splitter can't shatter the base line + the "those lands" back-referencing rider; the program is xSpell so the
 * cast path enumerates affordable X.
 *
 * CREED — the whole card is modeled, no clause dropped: (a) lands enter TAPPED, (b) the rest bottoms in random
 * order (NOT milled/shuffled/kept), (c) the spell-mastery untap fires in FULL when the threshold is met and NOT
 * otherwise. This file PINS every part, and the CREED near-misses stay non-native: a NON-{X} spell (no reveal
 * cap), a milled/shuffled/graveyard disposition, a non-tapped entry, a nonland/typed filter, and a missing or
 * different spell-mastery rider (a bare base line that silently drops the untap).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const progOf = (card) => parseEffectProgram(card);
const atomsOf = (txt, ct = "Sorcery", opts) => parseEffectClause(txt, ct, opts)?.atoms;

// Library / graveyard card stub (the engine reads name/type for the reveal + land + IS-graveyard gate).
const card = (id, name, type, mana = "") => ({ id, name, type, mana });

function stateWith({ library = [], graveyard = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library, graveyard } } };
}

const AA_ORACLE =
  "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.";
const AA_ATOM = { op: "animist-awakening", targetType: null };

// ===== PARSER =====
describe("parser — matchAnimistAwakening: the {X}-cost land-flood + spell-mastery template", () => {
  it("Animist's Awakening (base + spell-mastery rider) → an animist-awakening atom (only on an {X} spell)", () => {
    expect(atomsOf(AA_ORACLE, "Sorcery", { hasX: true })).toEqual([AA_ATOM]);
  });

  it("the whole {X}-cost spell parses HIGH and is flagged xSpell (so the cast path enumerates X)", () => {
    const aa = progOf({ name: "Animist's Awakening", type: "Sorcery", mana: "{X}{G}", oracle: AA_ORACLE });
    expect(programConfidence(aa)).toBe("high");
    expect(aa.xSpell).toBe(true);
    expect(aa.atoms).toEqual([AA_ATOM]);
  });

  it("CREED near-misses stay LOW → Arbiter (no {X} / wrong disposition / non-tapped / wrong filter / missing rider)", () => {
    // NON-{X} spell: no reveal cap binding at all. Must NOT be native even with the identical text.
    expect(programConfidence(parseEffectClause(AA_ORACLE, "Sorcery", { hasX: false }))).toBe("low");
    // Milled/graveyard disposition ("into your graveyard") instead of "bottom … in a random order" — a different
    // shape (and one the untap rider wouldn't make sense on). Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest into your graveyard.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // NON-tapped entry ("onto the battlefield" without "tapped") — a different disposition the atom doesn't model
    // (its untap rider is meaningless if they already enter untapped). Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // A typed/nonland filter ("all creature cards") — the atom puts LANDS; a different filter is a different card. Low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. Put all creature cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // The BASE line WITHOUT the spell-mastery rider — modeling the base alone would silently DROP the untap (a
    // forbidden partial). It must NOT match this atom (the anchor requires the exact rider) → low → Arbiter.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // A DIFFERENT spell-mastery threshold ("three or more") — an unmodeled count. Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are three or more instant and/or sorcery cards in your graveyard, untap those lands.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
  });
});

// ===== RUNTIME (reveal → put-all-lands-tapped → bottom-the-rest → spell-mastery untap) =====
describe("runtime — all revealed lands enter TAPPED; the rest bottom in random order; spell mastery untaps them", () => {
  it("at X=3: revealed LANDS enter tapped, the non-land rest bottoms, cards below the reveal window are untouched", () => {
    const library = [
      card("a", "Forest", "Basic Land — Forest"),       // revealed → PUT tapped
      card("b", "Lightning Bolt", "Instant", "{R}"),     // revealed non-land → BOTTOMED
      card("c", "Mountain", "Basic Land — Mountain"),    // revealed → PUT tapped
      card("d", "Sol Ring", "Artifact", "{1}"),          // below the X=3 reveal window → untouched
    ];
    const st = resolveAtom(stateWith({ library }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 3 });
    // Both revealed lands entered TAPPED.
    const bf = st.players.user.battlefield;
    expect(bf.map((p) => p.card.name).sort()).toEqual(["Forest", "Mountain"]);
    expect(bf.every((p) => p.tapped === true)).toBe(true);
    // The library: Sol Ring (untouched, still on top after the top 3 left) then the bottomed Lightning Bolt.
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Sol Ring", "Lightning Bolt"]);
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ x: 3, lands: 2, bottomed: 1, spellMastery: false });
    // Each entering land fired the ETB / landfall path (permanent-enters logged).
    expect(st.log.filter((l) => l.kind === "permanent-enters").map((l) => l.cardName).sort()).toEqual(["Forest", "Mountain"]);
  });

  it("SPELL MASTERY (two+ instant/sorcery in the graveyard) UNTAPS exactly the lands just put out", () => {
    const library = [card("a", "Forest", "Basic Land — Forest"), card("c", "Mountain", "Basic Land — Mountain")];
    const graveyard = [card("g1", "Opt", "Instant", "{U}"), card("g2", "Ponder", "Sorcery", "{U}")];
    const st = resolveAtom(stateWith({ library, graveyard }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 2 });
    const bf = st.players.user.battlefield;
    expect(bf.map((p) => p.card.name).sort()).toEqual(["Forest", "Mountain"]);
    // Spell mastery met → the lands are UNTAPPED (ready to tap for mana), not the printed tapped default.
    expect(bf.every((p) => p.tapped === false)).toBe(true);
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ lands: 2, spellMastery: true });
  });

  it("ONE instant/sorcery in the graveyard is BELOW the spell-mastery threshold — the lands stay TAPPED", () => {
    const library = [card("a", "Forest", "Basic Land — Forest")];
    const graveyard = [card("g1", "Opt", "Instant", "{U}")]; // only ONE → threshold (2) NOT met
    const st = resolveAtom(stateWith({ library, graveyard }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 1 });
    expect(st.players.user.battlefield.map((p) => p.tapped)).toEqual([true]); // stays tapped (printed default)
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ spellMastery: false });
  });

  it("a creature in the graveyard does NOT count toward spell mastery (only instant/sorcery)", () => {
    const library = [card("a", "Forest", "Basic Land — Forest")];
    const graveyard = [card("g1", "Opt", "Instant", "{U}"), card("g2", "Grizzly Bears", "Creature — Bear", "{1}{G}")];
    const st = resolveAtom(stateWith({ library, graveyard }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 1 });
    // 1 instant + 1 creature = only 1 instant/sorcery → below threshold → stays tapped.
    expect(st.players.user.battlefield.map((p) => p.tapped)).toEqual([true]);
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ spellMastery: false });
  });

  it("at X=0 the reveal cap is 0 (NOT uncapped): reveals nothing, puts nothing, library untouched", () => {
    const library = [card("a", "Forest", "Basic Land — Forest")];
    const st = resolveAtom(stateWith({ library }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 0 });
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(1); // untouched
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ x: 0, lands: 0, bottomed: 0, spellMastery: false });
  });

  it("a short library reveals only what's there (no fabricated cards); no lands → nothing enters", () => {
    const library = [card("a", "Lightning Bolt", "Instant", "{R}"), card("b", "Ponder", "Sorcery", "{U}")];
    const st = resolveAtom(stateWith({ library }), AA_ATOM, { controller: "user", targets: [], cardName: "Animist's Awakening", xValue: 10 });
    expect(st.players.user.battlefield).toHaveLength(0); // no lands revealed
    expect(st.players.user.library.map((c) => c.name).sort()).toEqual(["Lightning Bolt", "Ponder"]); // both bottomed
    expect(st.log.find((l) => l.effect === "animist-awakening")).toMatchObject({ lands: 0, bottomed: 2 });
  });

  it("end-to-end through runEffectProgram: ctx.xValue from the stack params reaches the reveal + tapped entry", () => {
    const program = parseEffectProgram({ name: "Animist's Awakening", type: "Sorcery", mana: "{X}{G}", oracle: AA_ORACLE });
    const library = [card("a", "Forest", "Basic Land — Forest"), card("b", "Island", "Basic Land — Island")];
    const stackObj = { source: { name: "Animist's Awakening" }, payload: { params: { program, controller: "user", targets: [], xValue: 2 } } };
    const st = runEffectProgram(stateWith({ library }), stackObj);
    expect(st.players.user.battlefield.map((p) => p.card.name).sort()).toEqual(["Forest", "Island"]);
    expect(st.players.user.battlefield.every((p) => p.tapped === true)).toBe(true);
  });
});

// ===== COVERAGE (classification) =====
describe("coverage — Animist's Awakening flips native-spell; the family's non-matching cards stay non-native", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });
  it("Animist's Awakening is native-spell", () => {
    expect(classifyCard(C("Sorcery", AA_ORACLE, "{X}{G}", "Animist's Awakening"))).toBe("native-spell");
  });

  it("the CREED near-misses remain non-native (non-X / missing rider / genesis-wave sibling untouched)", () => {
    // A NON-{X} spell with the same body — no reveal cap at all. Must never be native.
    expect(classifyCard(C("Sorcery", AA_ORACLE, "{3}{G}", "Fake Uncapped Awakening"))).toBe("arbiter-spell");
    // The base line WITHOUT the spell-mastery rider — modeling it here would drop the untap (a forbidden partial).
    // The exact anchor requires the rider, so a bare base line stays non-native.
    expect(classifyCard(C("Sorcery", "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.", "{X}{G}", "Bare Awakening"))).toBe("arbiter-spell");
    // Genesis Wave (the sibling mass reveal-top-X → put permanents → mill) is UNCHANGED by this slice — still
    // native-spell via matchGenesisWave, proving the two disjoint anchors don't cross-wire.
    expect(classifyCard(C("Sorcery", "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.", "{X}{G}{G}{G}", "Genesis Wave"))).toBe("native-spell");
  });
});
