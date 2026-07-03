/**
 * GREEN SUN'S ZENITH ({X}{G}, Sorcery) — the COLOR-QUALIFIED X-tutor-to-battlefield PLUS the self-shuffle
 * disposition:
 *
 *   "Search your library for a green creature card with mana value X or less, put it onto the battlefield,
 *    then shuffle. Shuffle Green Sun's Zenith into its owner's library."
 *
 * Two NEW seams on top of the shipped bfx (Nature's Rhythm / Wargate) X-tutor-with-MV-cap:
 *   1. COLOR FILTER — the tutor's filter carries `colors:["green"]`; cardMatchesTutorFilter's color gate
 *      (already shipped for the hand→battlefield PUT-FROM-HAND lane — Dramatic Entrance) reads the card's
 *      enriched `colors` array (CR 105 / 202.2) and offers ONLY green creatures with MV ≤ the chosen X. The
 *      color is as load-bearing as the MV cap — a green fetch that dropped "green" would over-fetch (a
 *      forbidden FP).
 *   2. SELF-SHUFFLE DISPOSITION — the program is stamped `selfShuffle`; runEffectProgram's GY-1 shuffles the
 *      resolving spell into its OWNER's library instead of the graveyard (the exact mechanical mirror of Finale
 *      of Revelation's `selfExile`). Since the tutor is GSZ's ONLY atom (it suspends on the search), the
 *      disposition fires from resumeAfterChoice's terminal GY-1 path — which now honors selfShuffle.
 *
 * THE FAMILY (audited siblings that flip for free on the SAME two seams): Blue Sun's Zenith (draw X), Red Sun's
 * Zenith (X damage + exile-if-dies), White Sun's Zenith (X Cat tokens), Beacon of Destruction (5 damage),
 * Beacon of Creation (per-Forest tokens) — every one is a modeled body + a self-shuffle tail.
 *
 * CREED near-misses (stay non-native → Arbiter): an UNCOLORED green-permanent fetch, a NON-green creature the
 * color gate must reject at runtime, a family member whose BODY is unmodeled (Black Sun's -1/-1-on-each, Beacon
 * of Immortality's double-life), and a "shuffle it/that card into its owner's library" that names something
 * ELSE (a permanent's triggered/replacement ability, never a spell's resolution disposition). No partial: the
 * whole card resolves faithfully or it's parked.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { resolveTutorChoice, autoPickTutorCandidate, runEffectProgram, finishSpellResolution } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GSZ = {
  name: "Green Sun's Zenith",
  type: "Sorcery",
  mana: "{X}{G}",
  oracle:
    "Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle. Shuffle Green Sun's Zenith into its owner's library.",
};

// A creature CARD (not a permanent) for the library, with mana_cost + colors so the MV cap + color gate read it.
const creatureCard = (id, name, cmc, colors) => ({ id, name, type: "Creature — Beast", mana_cost: `{${cmc}}`, cmc, colors, oracle: "" });

function boardWithLibrary(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } };
}

const atomsOf = (txt) => parseEffectClause(txt, "Sorcery", { hasX: true })?.atoms;
const isHighX = (txt) => programConfidence(parseEffectClause(txt, "Sorcery", { hasX: true })) === "high";

describe("Green Sun's Zenith — parse + classify", () => {
  it("classifies native-spell and emits the color-qualified MV-X tutor + selfShuffle", () => {
    expect(classifyCard(GSZ)).toBe("native-spell");
    const p = parseEffectProgram(GSZ);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.selfShuffle).toBe(true);
    expect(p.atoms).toEqual([
      {
        op: "tutor",
        filter: { groups: [["creature"]], mvCapX: true, colors: ["green"] },
        filterLabel: "green creature card with mana value X or less",
        destination: "battlefield",
        entersTapped: false,
        targetType: null,
      },
    ]);
  });

  it("the plain (uncolored) Nature's Rhythm shape is unaffected — NO colors key (regression guard)", () => {
    const atoms = atomsOf("Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.");
    expect(atoms).toEqual([
      { op: "tutor", filter: { groups: [["creature"]], mvCapX: true }, filterLabel: "creature card with mana value X or less", destination: "battlefield", entersTapped: false, targetType: null },
    ]);
    expect(atoms[0].filter.colors).toBeUndefined();
  });
});

describe("Green Sun's Zenith — RUNTIME: color gate + MV cap + self-shuffle disposition", () => {
  it("offers ONLY green creatures with MV ≤ X; fetches one to the battlefield; shuffles GSZ into the library (NOT the graveyard)", () => {
    const program = parseEffectProgram(GSZ);
    // library: a green MV2 (legal), a RED MV1 (color-excluded), a green MV8 (over the X=3 cap).
    let s = boardWithLibrary([
      creatureCard("g1", "Fauna Shaman", 2, ["G"]),
      creatureCard("r1", "Goblin Guide", 1, ["R"]),
      creatureCard("g2", "Craterhoof Behemoth", 8, ["G"]),
    ]);
    const gszCard = { id: "gsz1", name: "Green Sun's Zenith", type: "Sorcery", mana: "{X}{G}" };
    const stackObj = { source: { name: "Green Sun's Zenith" }, payload: { params: { program, controller: "user", targets: [], xValue: 3, spellToGraveyard: { playerId: "user", card: gszCard } } } };

    let st = runEffectProgram(s, stackObj);
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield" });
    // ONLY the green MV≤3 creature is offered — red excluded by color, big-green excluded by the MV cap.
    expect(st.pendingChoice.candidates.map((c) => c.id)).toEqual(["g1"]);
    // The threaded filter carries the concrete MV cap AND the color constraint.
    expect(st.pendingChoice.filter).toMatchObject({ mv: { max: 3 }, colors: ["green"] });

    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Fauna Shaman"]); // entered from library
    expect(st.players.user.library.some((c) => c.id === "g1")).toBe(false);                // left the library
    // SELF-SHUFFLE DISPOSITION: GSZ tucks into its OWNER's library, NEVER the graveyard.
    expect(st.players.user.library.some((c) => c.id === "gsz1")).toBe(true);
    expect(st.players.user.graveyard.some((c) => c.id === "gsz1")).toBe(false);
    expect(st.log.some((l) => l.kind === "spell-to-library-shuffled")).toBe(true);
    expect(st.log.some((l) => l.kind === "spell-to-graveyard")).toBe(false);
  });

  it("at X=0 the cap is 0 (never dropped): only a green MV-0 creature is offered", () => {
    const program = parseEffectProgram(GSZ);
    let s = boardWithLibrary([
      creatureCard("z", "Ornithopter-Beast", 0, ["G"]), // MV0 green — offered
      creatureCard("g1", "Fauna Shaman", 2, ["G"]),      // MV2 green — over the X=0 cap, excluded
    ]);
    const stackObj = { source: { name: "Green Sun's Zenith" }, payload: { params: { program, controller: "user", targets: [], xValue: 0, spellToGraveyard: { playerId: "user", card: { id: "gsz1", name: "Green Sun's Zenith" } } } } };
    const st = runEffectProgram(s, stackObj);
    expect(st.pendingChoice.candidates.map((c) => c.id)).toEqual(["z"]);
  });

  it("a colorless creature within the MV cap is NOT offered — the color gate is enforced, never dropped (CREED)", () => {
    const program = parseEffectProgram(GSZ);
    // A colorless artifact-creature within the cap must be excluded (GSZ fetches GREEN creatures only).
    let s = boardWithLibrary([{ id: "c1", name: "Ornithopter", type: "Artifact Creature — Thopter", mana_cost: "{0}", cmc: 0, colors: [] }]);
    const stackObj = { source: { name: "Green Sun's Zenith" }, payload: { params: { program, controller: "user", targets: [], xValue: 5, spellToGraveyard: { playerId: "user", card: { id: "gsz1", name: "Green Sun's Zenith" } } } } };
    const st = runEffectProgram(s, stackObj);
    // No legal candidate → the search finds nothing (CR 701.19f); GSZ still self-shuffles.
    expect(st.pendingChoice.candidates).toEqual([]);
  });
});

describe("cardMatchesTutorFilter — the green color gate (belt-and-braces)", () => {
  const f = { groups: [["creature"]], mv: { max: 3 }, colors: ["green"] };
  it("matches a green creature within the cap; rejects non-green + over-cap + non-creature", () => {
    expect(cardMatchesTutorFilter({ name: "Elf", type: "Creature — Elf", cmc: 1, colors: ["G"] }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Bear", type: "Creature — Bear", cmc: 2, colors: ["R"] }, f)).toBe(false); // red
    expect(cardMatchesTutorFilter({ name: "Multi", type: "Creature — Hydra", cmc: 2, colors: ["G", "U"] }, f)).toBe(true); // green among its colors
    expect(cardMatchesTutorFilter({ name: "Hydra", type: "Creature — Hydra", cmc: 6, colors: ["G"] }, f)).toBe(false); // over cap
    expect(cardMatchesTutorFilter({ name: "Rock", type: "Artifact", cmc: 1, colors: [] }, f)).toBe(false); // not a creature
    expect(cardMatchesTutorFilter({ name: "Stub", type: "Creature — Elf", cmc: 1 }, f)).toBe(false); // no colors array → FN-safe exclude
  });
});

describe("Green Sun's Zenith family — sibling flips (same two seams)", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });
  it("Blue / Red / White Sun's Zenith + Beacon of Destruction + Beacon of Creation all flip native-spell", () => {
    expect(classifyCard(C("Instant", "Target player draws X cards. Shuffle Blue Sun's Zenith into its owner's library.", "{X}{U}{U}{U}", "Blue Sun's Zenith"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Red Sun's Zenith deals X damage to any target. If a creature dealt damage this way would die this turn, exile it instead. Shuffle Red Sun's Zenith into its owner's library.", "{X}{R}", "Red Sun's Zenith"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Create X 2/2 white Cat creature tokens. Shuffle White Sun's Zenith into its owner's library.", "{X}{W}{W}{W}", "White Sun's Zenith"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Beacon of Destruction deals 5 damage to any target. Shuffle Beacon of Destruction into its owner's library.", "{3}{R}{R}", "Beacon of Destruction"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Create a 1/1 green Insect creature token for each Forest you control. Shuffle Beacon of Creation into its owner's library.", "{3}{G}", "Beacon of Creation"))).toBe("native-spell");
  });
});

describe("Green Sun's Zenith — CREED near-misses stay non-native (→ Arbiter)", () => {
  const C = (type, oracle, mana, name) => ({ type, oracle, mana, name });

  it("a COLORED 'permanent' fetch is NOT a modeled shape (a 'green permanent' is out of scope) → low", () => {
    expect(isHighX("Search your library for a green permanent card with mana value X or less, put it onto the battlefield, then shuffle.")).toBe(false);
  });

  it("a UNION color ('white or blue creature') is NOT modeled (only a single leading color word peels) → low", () => {
    expect(isHighX("Search your library for a white or blue creature card with mana value X or less, put it onto the battlefield, then shuffle.")).toBe(false);
  });

  it("a family member whose BODY is unmodeled stays arbiter-spell (Black Sun's -1/-1-each, Beacon of Immortality)", () => {
    expect(classifyCard(C("Sorcery", "Put X -1/-1 counters on each creature. Shuffle Black Sun's Zenith into its owner's library.", "{X}{B}{B}", "Black Sun's Zenith"))).toBe("arbiter-spell");
    expect(classifyCard(C("Instant", "Double target player's life total. Shuffle Beacon of Immortality into its owner's library.", "{5}{W}", "Beacon of Immortality"))).toBe("arbiter-spell");
  });

  it("a 'shuffle it into its owner's library' that names something ELSE (a permanent ability) does NOT set selfShuffle", () => {
    // Alabaster Dragon's death trigger is a PERMANENT ability, not a spell's resolution disposition — the
    // self-name anchor (subject == this card's own name, on an instant/sorcery) never matches "it".
    const dragon = { name: "Alabaster Dragon", type: "Sorcery", mana: "{4}{W}{W}", oracle: "Draw a card. When this creature dies, shuffle it into its owner's library." };
    const p = parseEffectProgram(dragon);
    // (the body here parses HIGH on the draw, but the "shuffle IT" tail is NOT the self-name disposition)
    expect(p?.selfShuffle).toBeFalsy();
  });

  it("selfShuffle disposition of a TOKEN/COPY spell is a no-op (a token ceases to exist, never library-shuffled)", () => {
    // finishSpellResolution short-circuits a token/copy before any zone move — mirrors selfExile's guard.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const out = finishSpellResolution(s, { playerId: "user", card: { id: "tk", name: "Copy", token: true } }, { selfShuffle: true });
    expect(out.players.user.library.some((c) => c.id === "tk")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.id === "tk")).toBe(false);
  });
});
