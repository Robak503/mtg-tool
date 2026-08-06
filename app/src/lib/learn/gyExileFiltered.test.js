/**
 * gyExileFiltered.test.js — GX-2: "exile target CREATURE card from a graveyard" and its filter family.
 * Shamble Back, Vile Rebirth, Thraben Heretic, Cemetery Reaper, Selesnya Eulogist, Necrogenesis,
 * Conversion Chamber, Grave Robbers.
 *
 * ⭐⭐ THE VERB WAS THE ENTIRE TIER SPLIT, and that is what made this findable. `return … from a graveyard`
 * was native on 53 + 28 carriers while `exile … from a graveyard` sat at 25 carriers and ONE native —
 * identical shape, identical filter vocabulary, one verb never wired to it. A phrase census ranked by
 * parked carriers put it near the top; the split by VERB is what turned "these cards park" into a cause.
 *
 * ⭐ NOTHING NEW WAS BUILT. The `exile-from-graveyard` atom, `applyExileFromGraveyard`, the `cardFilter`
 * vocabulary and `cardMatchesGraveyardFilter` (which enforces the filter at ENUMERATION, front-face per
 * CR 712.4a) all predate this slice. Only the bare-noun matcher was reachable, so ANY filter parked the
 * card. `parseGraveyardFilter` is REUSED rather than re-implemented, so the exile lane and the return lane
 * cannot drift into two different ideas of what "creature card" means.
 *
 * ⛔ THE REFUSAL THIS REPLACES SAID "type filter — not bare card", which was true of the PARSER and never
 * of the machinery. The real boundary is an UNMODELED filter word: `parseGraveyardFilter` returns null and
 * the card parks, rather than exiling something the card never named. That boundary is asserted below —
 * it is the assertion that actually protects the CREED here, not the one that was there before.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the filtered matcher removed -> all eight park.
 *   · `cardFilter` hard-coded to "any" -> all eight STILL classify native while the pool opens to every card
 *     in every graveyard: Shamble Back would exile a Mountain. The tier cannot see it; only the pool row can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHAMBLE_BACK = { id: "c-sb", name: "Shamble Back", type: "Sorcery", mana: "{B}",
  oracle: "Exile target creature card from a graveyard. Create a 2/2 black Zombie creature token. You gain 2 life." };
const THRABEN_HERETIC = { id: "c-th", name: "Thraben Heretic", type: "Creature — Human Wizard", mana: "{1}{W}", power: "2", toughness: "2",
  oracle: "{T}: Exile target creature card from a graveyard." };
const GRAVE_ROBBERS = { id: "c-gr", name: "Grave Robbers", type: "Creature — Human Rogue", mana: "{1}{B}{B}", power: "2", toughness: "1",
  oracle: "{B}, {T}: Exile target artifact card from a graveyard. You gain 2 life." };
const SELESNYA_EULOGIST = { id: "c-se", name: "Selesnya Eulogist", type: "Creature — Centaur Druid", mana: "{2}{G}", power: "2", toughness: "3",
  oracle: "{2}{G}: Exile target creature card from a graveyard, then populate. (Create a token that's a copy of a creature token you control.)" };

describe("the carriers", () => {
  it("⭐ the filter no longer parks the card — creature AND artifact filters", () => {
    for (const c of [SHAMBLE_BACK, THRABEN_HERETIC, GRAVE_ROBBERS, SELESNYA_EULOGIST]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ the parsed atom per zone scope — and the UNMODELED filter that must still park", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      anyGraveyard: p("exile target creature card from a graveyard"),
      ownGraveyard: p("exile target creature card from your graveyard"),
      opponentGraveyard: p("exile target creature card from an opponent's graveyard"),
      // ⛔ The incumbent bare form must be untouched — its matcher runs first and this slice added a
      // second one after it, not a replacement.
      bareIncumbent: p("exile target card from a graveyard"),
      // ⛔ THE REAL BOUNDARY. An unmodeled filter word parks rather than exiling something unnamed.
      unmodeledFilter: p("exile target zzzq card from a graveyard"),
    };
    console.log("  WITNESS gyExileFilteredParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.anyGraveyard).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true }]);
    expect(row.ownGraveyard).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" }]);
    expect(row.opponentGraveyard).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true }]);
    expect(row.bareIncumbent).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" }]);
    expect(row.unmodeledFilter).toEqual([]);
  });
});

describe("⭐⭐ LAW 6 — the enumerated pools, with the land and the instant named", () => {
  it("⭐⭐ a creature filter offers ONLY creature cards, in the zone the card names", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const card = (id, name, type) => ({ id, name, type, oracle: "" });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players,
        user: { ...s.players.user, graveyard: [
          card("g1", "MyBear", "Creature — Bear"), card("g2", "MyForest", "Land — Forest"), card("g3", "MyBolt", "Instant")] },
        ai1: { ...s.players.ai1, graveyard: [
          card("g4", "OppOgre", "Creature — Ogre"), card("g5", "OppIsland", "Land — Island")] } } };
    const pool = (spec) => enumerateTargets(st, "user", spec, []).map((t) => t.id).sort();
    const row = {
      anyGraveyard: pool({ targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true }),
      ownGraveyard: pool({ targetType: "graveyardCard", cardFilter: "creature" }),
      opponentGraveyard: pool({ targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true }),
      // The control: unfiltered offers everything, so each exclusion above is the filter doing work.
      unfiltered: pool({ targetType: "graveyardCard", cardFilter: "any", anyGraveyard: true }),
    };
    console.log("  WITNESS gyExileFilteredPools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // ⛔ g2/g5 (lands) and g3 (an instant) ABSENT — a cardFilter:"any" regression would exile a Mountain.
      anyGraveyard: ["g1", "g4"],
      ownGraveyard: ["g1"],          // ⛔ the opponent's creature is out of zone
      opponentGraveyard: ["g4"],     // ⛔ and mine is
      unfiltered: ["g1", "g2", "g3", "g4", "g5"],
    });
  });
});
