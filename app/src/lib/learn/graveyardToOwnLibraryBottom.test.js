/**
 * graveyardToOwnLibraryBottom.test.js — "{2}: Put target card from YOUR graveyard on the bottom of YOUR
 * library." Barkform Harvester, Epitaph Golem, Tomb Trawler, Transplant Theorist.
 *
 * ⭐ FOUND BY SPLITTING THE SHAPE BY TIER, and the split was decisive:
 *   · "from A graveyard on the bottom of ITS OWNER'S library"  → 10 native, 4 parked  (modelled)
 *   · "from YOUR graveyard on the bottom of YOUR library"      →  1 native, 6 parked  ← the bug
 *   · "from YOUR graveyard on TOP of YOUR library"             → 17 native, 9 parked  (modelled)
 * The scope wording was the entire difference, and the parked wording is the SIMPLER one — own graveyard,
 * own library, no cross-player routing at all. The engine could already do the harder version.
 *
 * ⓘ NOTHING NEW IN THE RESOLVER. Leaving `anyGraveyard` unset makes the holder resolve to ctx.controller,
 * which is byte-identical to the path the OWN-TOP arm (17 native carriers) has always taken; only the
 * destination flag differs, and `toLibraryBottom` is the same one the any-graveyard arm already sets.
 * "Bottom" is a plain library append — index 0 is the TOP — which is why the drive below asserts the card's
 * POSITION and not merely that it left the graveyard.
 *
 * ⛔ SEPARATELY ANCHORED, not folded into one regex with an alternation. The two forms differ in WHOSE
 * library receives the card; a single loosened pattern accepting "a graveyard … your library" would
 * silently move an OPPONENT'S card into the caster's library. Pinned below.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the arm
 * removed -> all four carriers park; `toLibraryBottom` swapped for `toLibraryTop` -> the drive shows the
 * card arriving at the TOP of the library instead of the bottom.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EPITAPH_GOLEM = { id: "c-eg", name: "Epitaph Golem", type: "Artifact Creature — Golem", mana: "{4}",
  power: "2", toughness: "4",
  oracle: "{2}: Put target card from your graveyard on the bottom of your library." };
const BARKFORM_HARVESTER = { id: "c-bh", name: "Barkform Harvester", type: "Artifact Creature — Shapeshifter",
  mana: "{3}", power: "2", toughness: "3",
  oracle: "Changeling (This card is every creature type.)\nReach\n{2}: Put target card from your graveyard on the bottom of your library." };

const CLAUSE = "put target card from your graveyard on the bottom of your library";

describe("the own-graveyard wording parses like its any-graveyard twin", () => {
  it("⭐ a bottom-destination return, scoped to the caster's own graveyard", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", toLibraryBottom: true }]);
    // ⛔ anyGraveyard must be ABSENT — its presence would open every player's graveyard to this effect.
    expect(p.atoms[0].anyGraveyard).toBeUndefined();
    expect(classifyCard(EPITAPH_GOLEM)).toBe("native-activated");
    expect(classifyCard(BARKFORM_HARVESTER)).toBe("native-activated");
  });

  it("⛔ the ANY-graveyard twin keeps its own scope — the two arms stay distinct", () => {
    const any = parseEffectClause("put target card from a graveyard on the bottom of its owner's library", "Instant");
    expect(any.atoms[0].anyGraveyard).toBe(true);
  });

  it("⛔ a MIXED scope is refused — 'a graveyard' into 'your library' must not parse", () => {
    // This is the false positive the separate anchors exist to prevent: it would move an opponent's card
    // into the caster's library.
    expect(parseEffectClause("put target card from a graveyard on the bottom of your library", "Instant").atoms).toEqual([]);
  });
});

describe("⭐ LAW 6 — the card really lands at the BOTTOM of the caster's library", () => {
  it("⭐ driven on the PARSED atom: graveyard → last library slot, opponent's zones untouched", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s0 = { ...g, players: { ...g.players,
      user: { ...g.players.user,
        graveyard: [{ id: "gy1", name: "Buried Bear", type: "Creature — Bear", oracle: "" }],
        library: [{ id: "L0", name: "Top", type: "Instant", oracle: "" }, { id: "L1", name: "Mid", type: "Instant", oracle: "" }] },
      ai1: { ...g.players.ai1, graveyard: [{ id: "ogy", name: "Their Bear", type: "Creature — Bear", oracle: "" }], library: [] } } };

    // ⛔ Atom from the PARSER, not a literal — otherwise parser and runtime are tested separately and a
    // disagreement between them leaves both halves green.
    const atoms = parseEffectClause(CLAUSE, "Instant").atoms;
    const s = runEffectProgram(s0, { source: EPITAPH_GOLEM,
      payload: { params: { program: { version: 1, structure: "sequence", atoms }, controller: "user",
        targets: [{ type: "graveyardCard", id: "gy1", controller: "user", atomIndex: 0 }] } } });

    const row = {
      libraryOrder: s.players.user.library.map((c) => c.id),
      userGraveyard: s.players.user.graveyard.map((c) => c.id),
      opponentGraveyard: s.players.ai1.graveyard.map((c) => c.id),
    };
    console.log("  WITNESS", JSON.stringify(row)); // printed so a broken harness can't read as a clean negative
    // ⭐ LAST slot, not first — library index 0 is the TOP, so "bottom" is the append. A toLibraryTop
    // implementation would put gy1 first and this row is what tells the two apart.
    expect(row.libraryOrder).toEqual(["L0", "L1", "gy1"]);
    expect(row.userGraveyard).toEqual([]);
    // ⛔ The opponent's graveyard is untouched — this arm is own-graveyard scoped.
    expect(row.opponentGraveyard).toEqual(["ogy"]);
  });
});
