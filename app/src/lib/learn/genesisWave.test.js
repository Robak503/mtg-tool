/**
 * GENESIS-WAVE — the {X}-cost mass reveal-top-X → put-permanents-onto-battlefield → mill-the-rest family.
 *
 * "Reveal the top X cards of your library. You may put any number of <permanent|artifact|…> cards with mana
 * value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put
 * onto the battlefield into your graveyard." (Genesis Wave — {X}{G}{G}{G}.)
 *
 * THE SEAM: a new `genesis-wave` atom (applyGenesisWave in atoms/library.js) reveals the top X of the
 * controller's library, puts EVERY eligible permanent (matching the type filter AND MV ≤ X) onto the
 * battlefield via the SHARED enterCardFromZone helper (so each entry fires ETB / landfall / permanent-enters
 * exactly like a Wargate fetch or a reanimation), then mills the leftover-revealed cards to the graveyard
 * through the millOnePlayer chokepoint. X (bound at cast, CR 601.2b) caps BOTH the reveal count and the MV.
 * The parser collapses the three-sentence template up front (matchGenesisWave, gated to an {X}-cost spell) so
 * the clause splitter can't shatter it; the program is xSpell so the cast path enumerates affordable X.
 *
 * CREED — the X cap is the safety (a dropped cap would put ANY-MV permanent onto the battlefield, a forbidden
 * FP), so this file PINS the cap is genuinely enforced at every X (only MV ≤ X permanents enter; instants /
 * sorceries / over-cap cards are milled), the WHOLE card runs (reveal + selective put + mill-the-rest, no
 * clause dropped), and the CREED near-misses stay non-native: a "put A nonland permanent" (singular) variant,
 * a "shuffle the rest" / "bottom of your library in a random order" disposition (Genesis Hydra / Majestic
 * Genesis), a NON-{X} spell (no cap at all), and a "mana value X or GREATER" comparator.
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

// Library card stub (the engine reads name/type/mana for the reveal + MV + type gate).
const lib = (id, name, type, mana = "") => ({ id, name, type, mana });

function stateWithLibrary(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } };
}

const GW_ORACLE =
  "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.";
const GW_ATOM = { op: "genesis-wave", filter: { groups: [], permanentOnly: true }, filterLabel: "permanent card with mana value X or less", targetType: null };

// ===== PARSER =====
describe("parser — matchGenesisWave: the {X}-cost mass permanent-drop template", () => {
  it("Genesis Wave 'permanent cards with mana value X or less' → a permanentOnly genesis-wave atom (only on an {X} spell)", () => {
    expect(atomsOf(GW_ORACLE, "Sorcery", { hasX: true })).toEqual([GW_ATOM]);
  });

  it("a typed variant ('artifact cards …') → a groups-filtered genesis-wave atom", () => {
    expect(atomsOf(
      "Reveal the top X cards of your library. You may put any number of artifact cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.",
      "Sorcery", { hasX: true },
    )).toEqual([{ op: "genesis-wave", filter: { groups: [["artifact"]] }, filterLabel: "artifact card with mana value X or less", targetType: null }]);
  });

  it("the whole {X}-cost spell parses HIGH and is flagged xSpell (so the cast path enumerates X)", () => {
    const gw = progOf({ name: "Genesis Wave", type: "Sorcery", mana: "{X}{G}{G}{G}", oracle: GW_ORACLE });
    expect(programConfidence(gw)).toBe("high");
    expect(gw.xSpell).toBe(true);
    expect(gw.atoms).toEqual([GW_ATOM]);
  });

  it("CREED near-misses stay LOW → Arbiter (no {X} / singular / wrong disposition / wrong comparator)", () => {
    // NON-{X} spell: no cap binding at all — would put ANY-MV permanent. Must NOT be native even with the text.
    expect(programConfidence(parseEffectClause(GW_ORACLE, "Sorcery", { hasX: false }))).toBe("low");
    // Singular "put A nonland permanent" (Genesis Hydra body) — not the "any number" mass put. Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // "shuffle the rest into your library" disposition (Genesis Hydra) — not "into your graveyard". Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // "bottom of your library in a random order" disposition (Majestic Genesis / Knickknack Ouphe). Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // "mana value X or GREATER" — an unmodeled comparator that would mis-cap. Stays low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or greater from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // A non-permanent filter word (would put an instant/sorcery onto the battlefield) — a malformed shape. Low.
    expect(programConfidence(parseEffectClause(
      "Reveal the top X cards of your library. You may put any number of instant cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
  });
});

// ===== RUNTIME (reveal → put-all-eligible → mill-the-rest, cap held) =====
describe("runtime — every eligible permanent (MV ≤ X) enters; the rest are milled; the cap holds", () => {
  it("Genesis Wave at X=3: MV≤3 permanents ENTER, over-cap + nonpermanents are MILLED, library shrinks by X", () => {
    // Top 4 will be revealed at X=3? No — X=3 reveals the TOP 3. Put 5 cards so the 4th+ stay untouched.
    const library = [
      lib("a", "Sol Ring", "Artifact", "{1}"),            // MV1 permanent — PUT
      lib("b", "Cultivate", "Sorcery", "{2}{G}"),          // sorcery — not a permanent → MILLED
      lib("c", "Big Dude", "Creature — Giant", "{6}{G}"),  // MV7 — over the X=3 cap → MILLED
      lib("d", "Llanowar Elves", "Creature — Elf", "{G}"), // MV1 — revealed? no: X=3 reveals only a,b,c
      lib("e", "Forest", "Basic Land — Forest", ""),        // below the reveal window — untouched
    ];
    const st = resolveAtom(stateWithLibrary(library), GW_ATOM, { controller: "user", targets: [], cardName: "Genesis Wave", xValue: 3 });
    // Top 3 (a,b,c) revealed: Sol Ring put; Cultivate (sorcery) + Big Dude (over cap) milled.
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Sol Ring"]);
    expect(st.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Big Dude", "Cultivate"]);
    // The library lost exactly the revealed top 3; d + e remain in order.
    expect(st.players.user.library.map((c) => c.id)).toEqual(["d", "e"]);
    expect(st.log.find((l) => l.effect === "genesis-wave")).toMatchObject({ x: 3, put: 1, milled: 2 });
    // The entering permanent fired the ETB path (permanent-enters logged).
    expect(st.log.find((l) => l.kind === "permanent-enters")?.cardName).toBe("Sol Ring");
  });

  it("puts MULTIPLE eligible permanents (the 'any number' resolves to put-all)", () => {
    const library = [
      lib("a", "Sol Ring", "Artifact", "{1}"),             // MV1 permanent — PUT
      lib("b", "Llanowar Elves", "Creature — Elf", "{G}"),  // MV1 — PUT
      lib("c", "Wall of Roots", "Creature — Plant Wall", "{1}{G}"), // MV2 — PUT
    ];
    const st = resolveAtom(stateWithLibrary(library), GW_ATOM, { controller: "user", targets: [], cardName: "Genesis Wave", xValue: 4 });
    expect(st.players.user.battlefield.map((p) => p.card.name).sort()).toEqual(["Llanowar Elves", "Sol Ring", "Wall of Roots"]);
    expect(st.players.user.graveyard).toHaveLength(0); // nothing left to mill (all 3 eligible)
    expect(st.players.user.library).toHaveLength(0);
  });

  it("at X=0 the cap is 0 (NOT uncapped): reveals 0, puts nothing, mills nothing — the cap is never dropped", () => {
    const library = [lib("a", "Sol Ring", "Artifact", "{1}")];
    const st = resolveAtom(stateWithLibrary(library), GW_ATOM, { controller: "user", targets: [], cardName: "Genesis Wave", xValue: 0 });
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.players.user.graveyard).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(1); // untouched
    expect(st.log.find((l) => l.effect === "genesis-wave")).toMatchObject({ x: 0, put: 0, milled: 0 });
  });

  it("a short library reveals only what's there (no fabricated cards)", () => {
    const library = [lib("a", "Sol Ring", "Artifact", "{1}"), lib("b", "Bolt", "Instant", "{R}")];
    const st = resolveAtom(stateWithLibrary(library), GW_ATOM, { controller: "user", targets: [], cardName: "Genesis Wave", xValue: 10 });
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Sol Ring"]);
    expect(st.players.user.graveyard.map((c) => c.name)).toEqual(["Bolt"]); // the instant is milled
    expect(st.players.user.library).toHaveLength(0);
  });

  it("end-to-end through runEffectProgram: ctx.xValue from the stack params reaches the reveal+cap", () => {
    const program = parseEffectProgram({ name: "Genesis Wave", type: "Sorcery", mana: "{X}{G}{G}{G}", oracle: GW_ORACLE });
    const library = [
      lib("a", "Sol Ring", "Artifact", "{1}"),            // MV1 — PUT
      lib("c", "Big Dude", "Creature — Giant", "{6}{G}"),  // MV7 — over the X=2 cap → MILLED
    ];
    const stackObj = { source: { name: "Genesis Wave" }, payload: { params: { program, controller: "user", targets: [], xValue: 2 } } };
    const st = runEffectProgram(stateWithLibrary(library), stackObj);
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Sol Ring"]);
    expect(st.players.user.graveyard.map((c) => c.name)).toEqual(["Big Dude"]);
  });
});

// ===== COVERAGE (classification) =====
describe("coverage — Genesis Wave flips native-spell; the family's non-matching cards stay non-native", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });
  it("Genesis Wave is native-spell", () => {
    expect(classifyCard(C("Sorcery", GW_ORACLE, "{X}{G}{G}{G}", "Genesis Wave"))).toBe("native-spell");
  });

  it("the CREED near-misses remain non-native (singular put / shuffle / bottom disposition / non-X)", () => {
    // Genesis Hydra's reveal-put (singular "a nonland permanent", shuffle the rest) — a triggered creature ability,
    // and even the effect shape isn't the mass "any number → graveyard" template. Stays non-native.
    expect(classifyCard(C("Creature — Plant Hydra", "When you cast this spell, reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library.\nThis creature enters with X +1/+1 counters on it.", "{X}{G}{G}", "Genesis Hydra"))).not.toBe("native-spell");
    // Majestic Genesis — dynamic non-cost X ("where X is …"), no MV cap, rest to bottom. Stays non-native.
    expect(classifyCard(C("Sorcery", "Reveal the top X cards of your library, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. You may put any number of permanent cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order.", "{6}{G}{G}", "Majestic Genesis"))).toBe("arbiter-spell");
    // A NON-{X} spell with the same body — no cap at all (would put anything). Must never be native.
    expect(classifyCard(C("Sorcery", GW_ORACLE, "{3}{G}", "Fake Uncapped Genesis"))).toBe("arbiter-spell");
  });
});
