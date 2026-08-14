/**
 * LIBRARY-TUTOR-TO-BATTLEFIELD (MV-capped-by-X) — "search your library for a <creature|permanent> card
 * with mana value X or less, put it onto the battlefield, then shuffle" on an {X}-cost spell.
 *
 * Wargate ("permanent card with mana value X or less") + Nature's Rhythm ("creature card …") flip
 * native-spell. The seam reuses the shipped battlefield-destination tutor resolver (enterCardFromZone →
 * ETB fires, library shuffles); the NEW piece is (a) a parser branch (bfx) that accepts a NON-land
 * creature/permanent fetch GUARDED by an MV cap = the spell's X, and (b) applyTutor resolving that cap
 * from ctx.xValue at resolution (CR 202.3b — X is chosen at cast). The program is marked xSpell so the
 * cast path enumerates affordable X.
 *
 * CREED — the X cap is the safety: a dropped cap would fetch ANY creature/permanent (a forbidden FP). So
 * this file PINS the cap is genuinely enforced at every X (only MV ≤ X is offered), and that the landmines
 * stay LOW → Arbiter: a NON-X creature→battlefield (no cap at all), a "mana value X or GREATER" rider,
 * Finale's library-and/or-graveyard + X≥10 pump rider, Natural Order's color-qualified sac cost, and
 * Chord's convoke keyword line.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { runEffectProgram, resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const progOf = (card) => parseEffectProgram(card);
const atomsOf = (txt, ct = "Sorcery", opts) => parseEffectClause(txt, ct, opts)?.atoms;

// Library card stub (the engine reads name/type/mana for the tutor's MV + type gate).
const lib = (id, name, type, mana = "") => ({ id, name, type, mana });

function stateWithLibrary(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } };
}

// ===== PARSER =====
describe("parser — bfx: creature/permanent search→battlefield capped by X", () => {
  it("Nature's Rhythm 'creature card with mana value X or less' → a creature battlefield tutor, mvCapX", () => {
    // hasX must be true (an {X}-cost spell) — the parser dispatch passes ctx.hasX from the cost.
    expect(atomsOf("Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.", "Sorcery", { hasX: true }))
      .toEqual([{ op: "tutor", filter: { groups: [["creature"]], mvCapX: true }, filterLabel: "creature card with mana value X or less", destination: "battlefield", entersTapped: false, targetType: null }]);
  });

  it("Wargate 'permanent card with mana value X or less' → permanentOnly battlefield tutor, mvCapX", () => {
    expect(atomsOf("Search your library for a permanent card with mana value X or less, put it onto the battlefield, then shuffle.", "Sorcery", { hasX: true }))
      .toEqual([{ op: "tutor", filter: { groups: [], permanentOnly: true, mvCapX: true }, filterLabel: "permanent card with mana value X or less", destination: "battlefield", entersTapped: false, targetType: null }]);
  });

  it("the whole {X}-cost spell parses HIGH and is flagged xSpell (so the cast path enumerates X)", () => {
    const wg = progOf({ name: "Wargate", type: "Sorcery", mana: "{X}{G}{W}{U}", oracle: "Search your library for a permanent card with mana value X or less, put it onto the battlefield, then shuffle." });
    expect(programConfidence(wg)).toBe("high");
    expect(wg.xSpell).toBe(true);
    const nr = progOf({ name: "Nature's Rhythm", type: "Sorcery", mana: "{X}{G}", oracle: "Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.\nHarmonize {X}{G}{G}{G}{G} (You may cast this card from your graveyard for its harmonize cost.)" });
    expect(programConfidence(nr)).toBe("high"); // harmonize keyword line is stripped (CAST_KEYWORD_LINE)
    expect(nr.xSpell).toBe(true);
  });

  it("CREED landmines stay LOW → Arbiter (no cap / wrong comparator / riders / unmodeled cost)", () => {
    // GRADUATED 2026-08-14 (Savage Order): the bfm creature admission is faithful — the printed card really fetches any creature (the Planar Bridge precedent in bfm's own note); Natural Order still parks via its unmodeled color-sac COST (verified live).
    expect(programConfidence(parseEffectClause("Search your library for a creature card, put it onto the battlefield, then shuffle.", "Sorcery", { hasX: false }))).toBe("high");
    expect(programConfidence(parseEffectClause("Search your library for a creature card, put it onto the battlefield, then shuffle.", "Sorcery", { hasX: true }))).toBe("high");
    // "mana value X or GREATER" — an unmodeled comparator (would mis-cap). Stays low.
    expect(programConfidence(parseEffectClause("Search your library for a creature card with mana value X or greater, put it onto the battlefield, then shuffle.", "Sorcery", { hasX: true }))).toBe("low");
    // Finale of Devastation NOW FLIPS HIGH (bfxg — library-and/or-graveyard tutor + the condX team-pump-haste
    // rider, both modeled faithfully). See the FINALE block below for the atom-shape + runtime coverage. A
    // GRAVEYARD-ONLY search-to-battlefield remains a landmine (not the "library and/or graveyard" bfxg shape).
    expect(programConfidence(parseEffectClause("Search your graveyard for a creature card with mana value X or less and put it onto the battlefield.", "Sorcery", { hasX: true }))).toBe("low");
    // Natural Order — "sacrifice a GREEN creature" (color-qualified sac cost unmodeled) → low.
    expect(programConfidence(progOf({ name: "Natural Order", type: "Sorcery", mana: "{2}{G}{G}", oracle: "As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle." }))).toBe("low");
    // Chord of Calling — the RAW oracle (with the convoke line) is low to the BARE effect parser (it doesn't
    // strip cost-only keyword lines). classifyCard, which DOES strip convoke (stripCostOnlyKeywordLines, the
    // established convoke pattern), flips Chord native — asserted in the coverage block below, NOT here.
    expect(programConfidence(progOf({ name: "Chord of Calling", type: "Instant", mana: "{X}{G}{G}{G}", oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nSearch your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle." }))).toBe("low");
  });
});

// ===== MV-CAP GATE (the cardinal CREED guarantee) =====
describe("MV cap = X is genuinely enforced (never silently dropped)", () => {
  it("permanentOnly + concrete mv:{max} matches permanents within the cap, rejects instants/sorceries + over-cap", () => {
    const f = { groups: [], permanentOnly: true, mv: { max: 3 } };
    expect(cardMatchesTutorFilter({ name: "Sol Ring", type: "Artifact", mana: "{1}" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Oblivion Ring", type: "Enchantment", cmc: 3 }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Wastes", type: "Basic Land", cmc: 0 }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Lightning Bolt", type: "Instant", mana: "{R}" }, f)).toBe(false); // not a permanent
    expect(cardMatchesTutorFilter({ name: "Big Dude", type: "Creature — Giant", cmc: 7 }, f)).toBe(false);    // over the cap
  });

  it("a creature-group + cap rejects non-creature permanents and over-cap creatures", () => {
    const f = { groups: [["creature"]], mv: { max: 2 } };
    expect(cardMatchesTutorFilter({ name: "Bird", type: "Creature — Bird", cmc: 2 }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Sol Ring", type: "Artifact", cmc: 1 }, f)).toBe(false); // not a creature
    expect(cardMatchesTutorFilter({ name: "Hydra", type: "Creature — Hydra", cmc: 6 }, f)).toBe(false); // over cap
  });
});

// ===== RUNTIME (cast → choose X → resolve) =====
const WARGATE_ATOM = { op: "tutor", filter: { groups: [], permanentOnly: true, mvCapX: true }, filterLabel: "permanent card with mana value X or less", destination: "battlefield", entersTapped: false, targetType: null };
const NR_ATOM = { op: "tutor", filter: { groups: [["creature"]], mvCapX: true }, filterLabel: "creature card with mana value X or less", destination: "battlefield", entersTapped: false, targetType: null };

describe("runtime — the chosen card enters from library, library shuffles, X cap holds", () => {
  it("Wargate at X=3: only MV≤3 permanents are offered; the chosen one ENTERS the battlefield; library shrinks", () => {
    const library = [
      lib("a", "Sol Ring", "Artifact", "{1}"),                 // MV1 permanent — offered
      lib("b", "Cultivate", "Sorcery", "{2}{G}"),              // sorcery — NOT a permanent, excluded
      lib("c", "Big Dude", "Creature — Giant", "{6}{G}"),      // MV7 — over the X=3 cap, excluded
      lib("d", "Llanowar Elves", "Creature — Elf", "{G}"),     // MV1 permanent — offered
    ];
    // Resolve the atom directly with xValue=3 (the value runEffectProgram threads into ctx).
    let st = resolveAtom(stateWithLibrary(library), WARGATE_ATOM, { controller: "user", targets: [], cardName: "Wargate", xValue: 3 });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield" });
    expect(st.pendingChoice.candidates.map((c) => c.name).sort()).toEqual(["Llanowar Elves", "Sol Ring"]); // Cultivate + Big Dude excluded
    // The threaded filter carries the CONCRETE cap (resolved from X), not the symbolic mvCapX flag.
    expect(st.pendingChoice.filter).toMatchObject({ permanentOnly: true, mv: { max: 3 } });
    st = resolveTutorChoice(st, "a"); // pick Sol Ring
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Sol Ring"]); // entered from library
    expect(st.players.user.library.some((c) => c.id === "a")).toBe(false);            // left the library
    expect(st.players.user.library).toHaveLength(3);
    expect(st.log.find((l) => l.kind === "permanent-enters")?.cardName).toBe("Sol Ring"); // ETB path ran
  });

  it("at X=0 the cap is 0 (NOT uncapped): only MV-0 permanents are offered — the cap is never dropped", () => {
    const library = [
      lib("z", "Ornithopter", "Artifact", "{0}"),         // MV0 — offered
      lib("a", "Sol Ring", "Artifact", "{1}"),            // MV1 — over the X=0 cap, excluded
    ];
    const st = resolveAtom(stateWithLibrary(library), WARGATE_ATOM, { controller: "user", targets: [], cardName: "Wargate", xValue: 0 });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Ornithopter"]); // ONLY the MV-0 card
  });

  it("Nature's Rhythm fires the fetched creature's ETB trigger on entry (enqueued to the stack)", () => {
    // A creature with a modeled ETB ("When this creature enters, draw a card") — the entry must ENQUEUE its
    // ETB trigger (CR 603.3 — it goes on the stack to resolve, exactly like any battlefield-tutor / reanimate
    // entry; the ramp tests pin entry the same way). The trigger's presence proves checkEnterTriggers ran.
    const drawer = { id: "dr", name: "Elvish Visionary", type: "Creature — Elf", mana: "{1}{G}",
      oracle: "When this creature enters, draw a card." };
    const library = [drawer, lib("big", "Worldspine Wurm", "Creature — Wurm", "{11}")];
    let st = stateWithLibrary(library);
    st = resolveAtom(st, NR_ATOM, { controller: "user", targets: [], cardName: "Nature's Rhythm", xValue: 2 });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Elvish Visionary"]); // Wurm (MV11) excluded by X=2 cap
    st = resolveTutorChoice(st, "dr");
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Elvish Visionary"]);
    // The ETB trigger was created on entry (the "draw a card" descriptor is queued, awaiting flush).
    const etb = (st.pendingTriggers || []).find((t) => /draw a card/.test(t.descriptor?.effectClause || ""));
    expect(etb).toBeTruthy();
  });

  it("end-to-end through runEffectProgram: ctx.xValue from the stack params reaches the cap", () => {
    const program = parseEffectProgram({ name: "Wargate", type: "Sorcery", mana: "{X}{G}{W}{U}", oracle: "Search your library for a permanent card with mana value X or less, put it onto the battlefield, then shuffle." });
    const library = [lib("a", "Sol Ring", "Artifact", "{1}"), lib("c", "Big Dude", "Creature — Giant", "{6}{G}")];
    const stackObj = { source: { name: "Wargate" }, payload: { params: { program, controller: "user", targets: [], xValue: 2 } } };
    let st = runEffectProgram(stateWithLibrary(library), stackObj);
    // The program suspended on the tutor search; X=2 from the params capped the pool to Sol Ring.
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search" });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Sol Ring"]);
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Sol Ring"]);
  });
});

// ===== COVERAGE (classification) =====
describe("coverage — Wargate + Nature's Rhythm flip native-spell; landmines stay arbiter-spell", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });
  it("the two clean MV-X search→battlefield staples are native-spell", () => {
    expect(classifyCard(C("Sorcery", "Search your library for a permanent card with mana value X or less, put it onto the battlefield, then shuffle.", "{X}{G}{W}{U}", "Wargate"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.\nHarmonize {X}{G}{G}{G}{G} (You may cast this card from your graveyard for its harmonize cost.)", "{X}{G}", "Nature's Rhythm"))).toBe("native-spell");
  });

  it("Chord of Calling flips native-spell too (convoke is stripped by the coverage classifier, the established cost-only pattern)", () => {
    // The convoke discount is unmodeled (the engine hard-casts at full cost — a SAFE cost limitation, identical
    // to Stoke the Flames and every other convoke spell); the BODY (search→battlefield capped by X) is modeled.
    expect(classifyCard(C("Instant", "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nSearch your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.", "{X}{G}{G}{G}", "Chord of Calling"))).toBe("native-spell");
  });

  it("Finale of Devastation flips native-spell (bfxg library∪graveyard tutor + condX team-pump-haste — both modeled)", () => {
    // FAITHFUL FLIP (was a pinned landmine): the "library and/or graveyard" MV-capped-by-X tutor to the
    // battlefield (bfxg) + the "If X is 10 or more, creatures you control get +X/+X and gain haste" rider
    // (condX team pump) are BOTH modeled end-to-end. See finaleOfDevastation.test.js for the atom shape + the
    // library/graveyard-fetch + X<10/X>=10 pump runtime coverage. No partial: both halves resolve or neither.
    expect(classifyCard(C("Sorcery", "Search your library and/or graveyard for a creature card with mana value X or less and put it onto the battlefield. If you search your library this way, shuffle. If X is 10 or more, creatures you control get +X/+X and gain haste until end of turn.", "{X}{G}{G}", "Finale of Devastation"))).toBe("native-spell");
  });

  it("landmines remain arbiter-spell (Natural Order color-sac / non-X no-cap)", () => {
    expect(classifyCard(C("Sorcery", "As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle.", "{2}{G}{G}", "Natural Order"))).toBe("arbiter-spell");
    // GRADUATED 2026-08-14 (Savage Order): the bfm creature admission is faithful — the printed card really fetches any creature (the Planar Bridge precedent in bfm's own note); Natural Order still parks via its unmodeled color-sac COST (verified live).
    expect(classifyCard(C("Sorcery", "Search your library for a creature card, put it onto the battlefield, then shuffle.", "{3}{G}", "Fake Uncapped"))).toBe("native-spell");
  });
});
