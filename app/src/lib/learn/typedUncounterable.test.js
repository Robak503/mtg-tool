/**
 * typedUncounterable.test.js — "CREATURE spells you control can't be countered" (CR 701.6a):
 * Prowling Serpopard #3581 · Surrak Dragonclaw #3186.
 *
 * An AND of the two axes the cantBeCountered family already had separately — a card TYPE and a
 * CONTROLLER — and the same descriptor shape the Monument cost-reducer needed one slice earlier. Read as
 * an OR (or as controller-only) it protects every spell the controller casts, which is Chimil: a
 * materially bigger card, and invisible in the coverage tier.
 *
 * The runtime read had to change shape with it. `uncounterablePlayersOnBattlefield` returned a SET of
 * players — a per-player answer to what is now a per-SPELL question. It returns a Map of
 * playerId → filters, where `null` means "every spell" (Chimil) and a type string means only that type.
 * A player controlling both keeps both entries, so the broad one wins without a special case.
 *
 * Oracle text is the bundled Scryfall text, read from the index — my first fixture for the Serpopard was
 * typed from memory as "This CREATURE can't be countered", the card says "This SPELL", and the wrong
 * fixture made a working slice look broken.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, uncounterablePlayersOnBattlefield, uncounterableCoversSpell } from "./staticAbilityParser.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SERPOPARD = { id: "c-ps", name: "Prowling Serpopard", type: "Creature — Cat Snake", mana: "{2}{G}", power: 4, toughness: 3, keywords: [],
  oracle: "This spell can't be countered.\nCreature spells you control can't be countered." };
const SURRAK = { id: "c-sd", name: "Surrak Dragonclaw", type: "Legendary Creature — Human Warrior", mana: "{2}{G}{U}{R}", power: 6, toughness: 6, keywords: ["Flash"],
  oracle: "Flash\nThis spell can't be countered.\nCreature spells you control can't be countered.\nOther creatures you control have trample." };
const CHIMIL = { id: "c-ch", name: "Chimil, the Inner Sun", type: "Legendary Artifact", mana: "{6}", keywords: [],
  oracle: "Spells you control can't be countered." };

const BEAR = { id: "s-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };
const BOLT = { id: "s-bolt", name: "Bolt", type: "Instant", mana: "{R}", oracle: "" };

/** `mine` on the AI's battlefield; a creature spell and an instant on the AI's stack. */
function stacked(mine) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: { ...s.players, ai: { ...s.players.ai, battlefield: mine.map((c, i) => createPermanent({ id: `m${i}`, card: c, controller: "ai" })) } },
    stack: [
      createStackObject({ id: "cre", kind: "spell", source: BEAR, controller: "ai", payload: { resolver: "PERMANENT_ETB", params: { controller: "ai", card: BEAR } } }),
      createStackObject({ id: "ins", kind: "spell", source: BOLT, controller: "ai", payload: { resolver: "EFFECT_PROGRAM", params: { controller: "ai" } } }),
    ],
  };
}
const counterable = (mine) => enumerateTargets(stacked(mine), "user", parseEffectClause("counter target spell").atoms[0], [], {}).map((t) => t.id).sort();

describe("the parser — an AND on one descriptor", () => {
  it("the typed form carries BOTH the controller scope and the card type", () => {
    expect(parseStaticAbilities(SERPOPARD).find((d) => d.cantBeCountered?.cardType).cantBeCountered)
      .toEqual({ scope: "youControl", cardType: "Creature" });
  });

  it("REGRESSION PIN — Chimil's unfiltered form carries no cardType", () => {
    expect(parseStaticAbilities(CHIMIL).find((d) => d.cantBeCountered).cantBeCountered)
      .toEqual({ scope: "youControl" });
  });
});

describe("the coverage read — per SPELL, not per player", () => {
  it("Serpopard covers a creature spell and NOT an instant", () => {
    const m = uncounterablePlayersOnBattlefield(stacked([SERPOPARD]));
    expect(uncounterableCoversSpell(m, "ai", "Creature — Bear")).toBe(true);
    expect(uncounterableCoversSpell(m, "ai", "Instant")).toBe(false);
  });

  it("Chimil covers everything; a player with neither is covered for nothing", () => {
    const m = uncounterablePlayersOnBattlefield(stacked([CHIMIL]));
    expect(uncounterableCoversSpell(m, "ai", "Instant")).toBe(true);
    expect(uncounterableCoversSpell(m, "user", "Instant")).toBe(false);
  });

  it("BOTH on one board — the broad one wins, no special case", () => {
    const m = uncounterablePlayersOnBattlefield(stacked([SERPOPARD, CHIMIL]));
    expect(uncounterableCoversSpell(m, "ai", "Instant")).toBe(true);
  });
});

describe("TARGETING — the counter can still take the instant", () => {
  it("no static: both spells are legal counter targets", () => {
    expect(counterable([])).toEqual(["cre", "ins"]);
  });

  it("THE LOAD-BEARING ONE — under the Serpopard ONLY the instant is offered", () => {
    // Dropping the type filter protects the instant too. That is Chimil, not the Serpopard, and the
    // coverage tier reads native either way.
    expect(counterable([SERPOPARD])).toEqual(["ins"]);
  });

  it("REGRESSION PIN — under Chimil NOTHING is offered", () => {
    expect(counterable([CHIMIL])).toEqual([]);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Prowling Serpopard #3581 and Surrak Dragonclaw #3186 flip", () => {
    expect(classifyCard(SERPOPARD)).toBe("native-static");
    expect(classifyCard(SURRAK)).toMatch(/^native/);
  });

  it("Rhythm of the Wild #211 stays PARKED — riot is unmodeled (whole-card law)", () => {
    expect(classifyCard({ name: "Rhythm of the Wild", type: "Enchantment", mana: "{1}{R}{G}", keywords: [],
      oracle: "Creature spells you control can't be countered.\nNontoken creatures you control have riot." })).toBe("body-only");
  });
});
