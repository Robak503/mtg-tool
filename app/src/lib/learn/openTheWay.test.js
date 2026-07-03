/**
 * OPEN-THE-WAY — the {X}-cost reveal-until-X-lands ramp sorcery (X ≤ number of players).
 *
 * "X can't be greater than the number of players in the game. Reveal cards from the top of your library until
 * you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your
 * library in a random order." (Open the Way — {X}{G}{G}.)
 *
 * THE SEAM: a new `reveal-until-n-lands` atom (applyRevealUntilNLands in atoms/library.js) reveals the top of
 * the controller's library ONE AT A TIME until X land cards have appeared (or the library runs out), puts EVERY
 * such land onto the battlefield TAPPED via the SHARED enterCardFromZone helper (so each entry fires ETB /
 * landfall / permanent-enters exactly like a Wargate fetch or a reanimation), then bottoms every OTHER revealed
 * card (the interleaved nonlands) in a deterministic random order via bottomTopNInRandomOrder. There is NO
 * choice (every found land is put), so it's non-pausing like genesis-wave. X (bound at cast, CR 601.2b) is
 * CAPPED at the number of players — the printed "X can't be greater than the number of players in the game"
 * constraint — enforced at RESOLUTION (min(X, players)). The parser collapses the three-sentence template up
 * front (matchOpenTheWay, gated to an {X}-cost spell) so the clause splitter can't shatter it; the program is
 * xSpell so the cast path enumerates affordable X into ctx.xValue.
 *
 * CREED — the player-count cap is the printed constraint, enforced (never dropped/uncapped): this file PINS the
 * cap holds at every X (X=5 in a 2-player game reveals only 2 lands), the WHOLE card runs (reveal-until +
 * lands-tapped + rest-to-bottom, no clause dropped), and the near-misses stay non-native: a "into your hand"
 * disposition, an untapped put, a "reveal until X CREATURE cards" dig, a missing player-count cap sentence, and
 * a NON-{X} spell (no cap binding at all).
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

// Library card stub (the engine reads name/type/mana for the reveal + land gate).
const lib = (id, name, type, mana = "") => ({ id, name, type, mana });

function stateWithLibrary(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } };
}

const OTW_ORACLE =
  "X can't be greater than the number of players in the game. Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.";
const OTW_ATOM = { op: "reveal-until-n-lands", capPlayerCount: true, entersTapped: true, targetType: null };

// ===== PARSER =====
describe("parser — matchOpenTheWay: the {X}-cost reveal-until-X-lands template", () => {
  it("Open the Way → ONE reveal-until-n-lands atom with capPlayerCount (only on an {X} spell)", () => {
    expect(atomsOf(OTW_ORACLE, "Sorcery", { hasX: true })).toEqual([OTW_ATOM]);
  });

  it("the whole {X}-cost spell parses HIGH and is flagged xSpell (so the cast path enumerates X)", () => {
    const otw = progOf({ name: "Open the Way", type: "Sorcery", mana: "{X}{G}{G}", oracle: OTW_ORACLE });
    expect(programConfidence(otw)).toBe("high");
    expect(otw.xSpell).toBe(true);
    expect(otw.atoms).toEqual([OTW_ATOM]);
  });

  it("CREED near-misses stay LOW → Arbiter (no {X} / wrong disposition / untapped / wrong dig / no cap)", () => {
    // NON-{X} spell: no cap binding at all — X would be undefined. Must NOT be native even with the exact text.
    expect(programConfidence(parseEffectClause(OTW_ORACLE, "Sorcery", { hasX: false }))).toBe("low");
    // "into your hand" disposition — a DIFFERENT effect (the hint's shape); this atom only bottoms the rest. Low.
    expect(programConfidence(parseEffectClause(
      "X can't be greater than the number of players in the game. Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest into your hand.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // UNTAPPED put — the lands must enter tapped; an untapped variant is a different, unmodeled shape. Stays low.
    expect(programConfidence(parseEffectClause(
      "X can't be greater than the number of players in the game. Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield and the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // "reveal until X CREATURE cards" — a DIFFERENT dig (not lands). The resolver only puts LANDS. Stays low.
    expect(programConfidence(parseEffectClause(
      "X can't be greater than the number of players in the game. Reveal cards from the top of your library until you reveal X creature cards. Put those creature cards onto the battlefield tapped and the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // MISSING the player-count cap sentence — the resolver's cap enforces a constraint the card wouldn't have;
    // a card WITHOUT that printed cap is a different card (a different X limit), so the exact anchor rejects it.
    expect(programConfidence(parseEffectClause(
      "Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
    // A DIFFERENT cap ("can't be greater than the number of Islands you control") — not the player-count cap the
    // resolver models. Stays low (never mis-capped by the player-count clamp).
    expect(programConfidence(parseEffectClause(
      "X can't be greater than the number of Islands you control. Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.",
      "Sorcery", { hasX: true },
    ))).toBe("low");
  });
});

// ===== RUNTIME (reveal-until-X-lands → all lands tapped → rest to the bottom; cap held) =====
describe("runtime — reveal-until-X-lands: all lands enter tapped, the interleaved rest is bottomed, cap holds", () => {
  it("X=2 (2 players): reveals until 2 lands, puts BOTH tapped, bottoms the interleaved nonlands, below-window untouched", () => {
    const library = [
      lib("a", "Grizzly Bears", "Creature — Bear", "{1}{G}"), // nonland — revealed, bottomed
      lib("b", "Island", "Basic Land — Island", ""),          // land #1 — PUT tapped
      lib("c", "Shock", "Instant", "{R}"),                     // nonland — revealed, bottomed
      lib("d", "Forest", "Basic Land — Forest", ""),           // land #2 — PUT tapped (reveal stops here)
      lib("e", "Mountain", "Basic Land — Mountain", ""),       // below the reveal window — UNTOUCHED (stays on top)
    ];
    const st = resolveAtom(stateWithLibrary(library), OTW_ATOM, { controller: "user", targets: [], cardName: "Open the Way", xValue: 2 });
    // Both revealed lands entered the battlefield TAPPED (CR: "onto the battlefield tapped").
    expect(st.players.user.battlefield.map((p) => ({ name: p.card.name, tapped: p.tapped })))
      .toEqual([{ name: "Island", tapped: true }, { name: "Forest", tapped: true }]);
    // Mountain (below the reveal window) is still the TOP of the library; the 2 bottomed nonlands are below it.
    expect(st.players.user.library[0].id).toBe("e");
    expect(st.players.user.library.map((c) => c.id).sort()).toEqual(["a", "c", "e"]);
    expect(st.log.find((l) => l.effect === "reveal-until-n-lands")).toMatchObject({ n: 2, lands: 2, bottomed: 2 });
    // The entering lands fired the ETB path (permanent-enters logged).
    expect(st.log.filter((l) => l.kind === "permanent-enters").map((l) => l.cardName)).toEqual(["Island", "Forest"]);
  });

  it("PLAYER-COUNT CAP: X=5 in a 2-player game reveals only 2 lands (the cap is enforced, never uncapped)", () => {
    const library = [
      lib("a", "Forest", "Basic Land — Forest", ""),  // land #1 — PUT
      lib("b", "Island", "Basic Land — Island", ""),   // land #2 — PUT (cap = 2 players → stop)
      lib("c", "Swamp", "Basic Land — Swamp", ""),      // would be land #3 — but the cap stops the reveal → UNTOUCHED
      lib("d", "Plains", "Basic Land — Plains", ""),
    ];
    const st = resolveAtom(stateWithLibrary(library), OTW_ATOM, { controller: "user", targets: [], cardName: "Open the Way", xValue: 5 });
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Forest", "Island"]);
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Swamp", "Plains"]); // untouched — cap held
    expect(st.log.find((l) => l.effect === "reveal-until-n-lands")).toMatchObject({ n: 2, lands: 2, bottomed: 0 });
  });

  it("at X=0 the cap is 0 (NOT uncapped): reveals nothing, puts nothing, bottoms nothing — the cap is never dropped", () => {
    const library = [lib("a", "Forest", "Basic Land — Forest", "")];
    const st = resolveAtom(stateWithLibrary(library), OTW_ATOM, { controller: "user", targets: [], cardName: "Open the Way", xValue: 0 });
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(1); // untouched
    expect(st.log.find((l) => l.effect === "reveal-until-n-lands")).toMatchObject({ n: 0, lands: 0, bottomed: 0 });
  });

  it("a library with FEWER than the (capped) X lands reveals the WHOLE library, puts what it found (no fabricated cards)", () => {
    const library = [
      lib("a", "Forest", "Basic Land — Forest", ""), // only ONE land in the whole library
      lib("b", "Shock", "Instant", "{R}"),
      lib("c", "Bolt", "Instant", "{R}"),
    ];
    // Default 2-player state → X=5 clamps to n=2; only 1 land exists → reveal the whole library, put the 1 land.
    const st = resolveAtom(stateWithLibrary(library), OTW_ATOM, { controller: "user", targets: [], cardName: "Open the Way", xValue: 5 });
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Forest"]);
    // The 2 nonlands are all bottomed; the library is exactly those 2 (nothing fabricated, nothing lost).
    expect(st.players.user.library.map((c) => c.name).sort()).toEqual(["Bolt", "Shock"]);
    // n is the CAPPED value (2, the player count), not the chosen X (5): the reveal-until target was 2 lands.
    expect(st.log.find((l) => l.effect === "reveal-until-n-lands")).toMatchObject({ n: 2, lands: 1, bottomed: 2 });
  });

  it("end-to-end through runEffectProgram: ctx.xValue from the stack params reaches the reveal+cap", () => {
    const program = parseEffectProgram({ name: "Open the Way", type: "Sorcery", mana: "{X}{G}{G}", oracle: OTW_ORACLE });
    const library = [
      lib("a", "Forest", "Basic Land — Forest", ""), // land #1 — PUT
      lib("b", "Shock", "Instant", "{R}"),            // nonland — bottomed
      lib("c", "Island", "Basic Land — Island", ""),  // land #2 — PUT (X=2 stop)
      lib("d", "Mountain", "Basic Land — Mountain", ""), // below window — untouched
    ];
    const stackObj = { source: { name: "Open the Way" }, payload: { params: { program, controller: "user", targets: [], xValue: 2 } } };
    const st = runEffectProgram(stateWithLibrary(library), stackObj);
    expect(st.players.user.battlefield.map((p) => ({ name: p.card.name, tapped: p.tapped })))
      .toEqual([{ name: "Forest", tapped: true }, { name: "Island", tapped: true }]);
    expect(st.players.user.library[0].id).toBe("d"); // Mountain still on top
  });
});

// ===== COVERAGE (classification) =====
describe("coverage — Open the Way flips native-spell; the near-misses stay non-native", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });
  it("Open the Way is native-spell", () => {
    expect(classifyCard(C("Sorcery", OTW_ORACLE, "{X}{G}{G}", "Open the Way"))).toBe("native-spell");
  });

  it("the CREED near-misses remain non-native (into-hand / untapped / non-X / no-cap)", () => {
    // "into your hand" disposition (the mechanic-hint shape) — a DIFFERENT effect. Stays non-native.
    expect(classifyCard(C("Sorcery",
      "X can't be greater than the number of players in the game. Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest into your hand.",
      "{X}{G}{G}", "Fake Into-Hand"))).toBe("arbiter-spell");
    // A NON-{X} spell with the exact body — no cap binding at all. Must never be native.
    expect(classifyCard(C("Sorcery", OTW_ORACLE, "{3}{G}", "Fake Uncapped Open"))).toBe("arbiter-spell");
    // MISSING the player-count cap sentence — the resolver's clamp models a constraint this card wouldn't have.
    expect(classifyCard(C("Sorcery",
      "Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.",
      "{X}{G}{G}", "Fake No-Cap"))).toBe("arbiter-spell");
  });
});
