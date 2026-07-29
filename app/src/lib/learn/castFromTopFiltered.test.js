/**
 * castFromTopFiltered.test.js — TYPE-FILTERED cast-from-top-of-library (CR 118.6 / 601.3e).
 *
 * The bare permissions were already modeled ("play lands and cast spells", "play lands"). The FILTERED forms
 * were deliberately left body-only, and together they outnumber both bare forms: "you may cast CREATURE
 * spells from the top of your library" alone is on 9 cards (Elven Chorus #1376, Eladamri #2093, Augur of
 * Autumn #1124), with instant-and-sorcery, artifact, and subtype variants behind it.
 *
 * ⚠️ THE FILTER MUST BE ENFORCED AT RUNTIME OR THE CREDIT IS A LIE — and worse than a no-op. An unenforced
 * filter offers ANY top card, which makes Eladamri cast Sol Ring off the library: a BIGGER card than the one
 * printed. That is the same failure the lands-only gate already guards (Courser of Kruphix casting spells),
 * so the enforcement half is pinned here on a board, not through the tier.
 *
 * ⭐ AND THE VOCABULARY IS CLOSED. Every filter word must be a card type or a printed creature type; an
 * unlisted word parks the whole clause. That is the direct lesson of the vacuous-subtype-filter class — a
 * filter no type line can satisfy would classify native while permitting nothing, invisibly. Galea #12094
 * ("aura and equipment spells") pays for that line and parks; it is the correct trade.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, playFromTopPermission, castFromTopFilterAllows } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const perm = (oracle) => ({ id: "src", name: "Elven Chorus", type: "Enchantment", mana: "{2}{G}", oracle });
const CREATURE_ONLY = "You may cast creature spells from the top of your library.";

describe("parsing — the filtered permission is recognized and carries its word list", () => {
  it("\"creature spells\" → a creature-filtered permission with no land half", () => {
    const d = parseStaticAbilities(perm(CREATURE_ONLY)).find((x) => x.playFromTop);
    expect(d.playFromTop).toEqual({ lands: false, spellFilter: ["Creature"] });
  });

  it("\"play lands and cast creature spells\" keeps the land half", () => {
    const d = parseStaticAbilities(perm("You may play lands and cast creature spells from the top of your library.")).find((x) => x.playFromTop);
    expect(d.playFromTop).toEqual({ lands: true, spellFilter: ["Creature"] });
  });

  it("a multi-word list splits on and/or/commas (Nalia's four classes)", () => {
    const d = parseStaticAbilities(perm("You may cast cleric, rogue, warrior, and wizard spells from the top of your library.")).find((x) => x.playFromTop);
    expect(d.playFromTop.spellFilter).toEqual(["Cleric", "Rogue", "Warrior", "Wizard"]);
  });

  it("⭐ CREED — a word outside the closed vocabulary parks the WHOLE clause, never a vacuous filter", () => {
    expect(parseStaticAbilities(perm("You may cast glorb spells from the top of your library.")).some((x) => x.playFromTop)).toBe(false);
    // Galea #12094 — Aura and Equipment are non-creature SUBTYPES, outside both sets. A real card, parked.
    expect(classifyCard(perm("You may cast aura and equipment spells from the top of your library."))).toBe("body-only");
  });

  it("Elven Chorus #1376 classifies native (its other two lines already did)", () => {
    expect(classifyCard({
      name: "Elven Chorus", type: "Enchantment", mana: "{2}{G}{G}",
      oracle: "You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.\nCreatures you control have \"{T}: Add one mana of any color.\"",
    })).toMatch(/^native/);
  });
});

describe("⭐ RUNTIME — the filter actually gates what the top card may be cast as", () => {
  function board(oracle, topCard) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const granter = createPermanent({ id: "src", card: perm(oracle), controller: "user" });
    return {
      // canCastSorcerySpeed wants these EXACT names — phase "precombat-main" + step "main" + priorityHolder
      // + an empty stack. A fixture using "main1" produced zero actions of any kind and briefly looked like
      // an engine bug.
      ...s, activePlayer: "user", priorityHolder: "user", stack: [], phase: "precombat-main", step: "main",
      players: {
        ...s.players,
        user: {
          ...s.players.user, battlefield: [granter], hand: [], library: [topCard], landsPlayedThisTurn: 0,
          manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 },
        },
      },
    };
  }
  const fromLibrary = (state) => legalActionsForPlayer(state, "user").filter((a) => a.fromZone === "library");

  const bear = { id: "t1", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
  const bolt = { id: "t2", name: "Zap", type: "Instant", mana: "{R}", oracle: "Zap deals 3 damage to any target." };
  const forest = { id: "t3", name: "Forest", type: "Basic Land — Forest", oracle: "" };

  it("a CREATURE on top IS offered under a creature-filtered permission", () => {
    expect(fromLibrary(board(CREATURE_ONLY, bear)).length).toBeGreaterThan(0);
  });

  it("⭐ an INSTANT on top is NOT offered — the filter is real, not decorative", () => {
    expect(fromLibrary(board(CREATURE_ONLY, bolt))).toEqual([]);
  });

  it("⭐ a LAND on top is NOT offered by a cast-only permission (no land half was granted)", () => {
    expect(fromLibrary(board(CREATURE_ONLY, forest))).toEqual([]);
  });

  it("the lands-and-cast form DOES offer the land", () => {
    const acts = fromLibrary(board("You may play lands and cast creature spells from the top of your library.", forest));
    expect(acts.some((a) => a.kind === "play-land")).toBe(true);
  });
});

describe("⭐ CHOSEN-TYPE cast-from-top (Realmwalker #607) — a DYNAMIC filter", () => {
  const REALMWALKER = {
    id: "rw", name: "Realmwalker", type: "Creature — Shapeshifter", mana: "{2}{G}", power: 2, toughness: 3,
    oracle: "Changeling\nAs this creature enters, choose a creature type.\nYou may look at the top card of your library any time.\nYou may cast creature spells of the chosen type from the top of your library.",
  };
  const elfCard = { id: "e", name: "Elf Scout", type: "Creature — Elf Scout", mana: "{G}", power: 1, toughness: 1, oracle: "" };
  const bearCard = { id: "b", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

  function rwBoard(chosenType, topCard) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const granter = { ...createPermanent({ id: "rw", card: REALMWALKER, controller: "user" }), ...(chosenType ? { chosenType } : {}) };
    return {
      ...s, activePlayer: "user", priorityHolder: "user", stack: [], phase: "precombat-main", step: "main",
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [granter], hand: [], library: [topCard], landsPlayedThisTurn: 0, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } },
      },
    };
  }
  const libActions = (st) => legalActionsForPlayer(st, "user").filter((a) => a.fromZone === "library");

  it("the filter cannot be a word list at parse time, so the parser leaves it dynamic", () => {
    const d = parseStaticAbilities({ ...REALMWALKER, oracle: "You may cast creature spells of the chosen type from the top of your library." }).find((x) => x.playFromTop);
    expect(d.playFromTop).toEqual({ lands: false, spellFilter: { chosenTypeOfSource: true } });
  });

  it("playFromTopPermission resolves it against the GRANTER'S stored chosenType", () => {
    expect(playFromTopPermission(rwBoard("Elf", elfCard), "user").spellFilter).toEqual(["Elf"]);
  });

  it("Realmwalker #607 classifies native", () => {
    expect(classifyCard(REALMWALKER)).toMatch(/^native/);
  });

  it("⭐ RUNTIME — having chosen Elf, an Elf on top IS castable", () => {
    expect(libActions(rwBoard("Elf", elfCard)).length).toBeGreaterThan(0);
  });

  it("⭐ CREED — having chosen Elf, a BEAR on top is not", () => {
    expect(libActions(rwBoard("Elf", bearCard))).toEqual([]);
  });

  it("⭐ CREED — with NO type chosen the granter permits NOTHING (never everything)", () => {
    // The unsafe direction would be treating an unresolved dynamic filter as truthy, which is how the
    // runtime's boolean gate used to read any non-null spellFilter.
    expect(playFromTopPermission(rwBoard(null, elfCard), "user").spellFilter).toBe(null);
    expect(libActions(rwBoard(null, elfCard))).toEqual([]);
  });
});

describe("the ETB chosen-type CHOOSER is explained text, not residue", () => {
  it("it parses to a marker (the engine really does implement it — resolvers.autoPickCreatureType)", () => {
    expect(parseStaticAbilities({ name: "X", type: "Creature — Shapeshifter", oracle: "As this creature enters, choose a creature type." }))
      .toEqual([{ chosenTypeChooser: true }]);
  });

  it("⭐ it no longer parks a card that sits outside the chosen-type COMPOSITE classifiers", () => {
    // This is what kept Realmwalker parked: every composite drops the chooser by its own regex, but the
    // general path had no account of it, so a card the composites don't own died on a line the engine runs.
    const oracle = "You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.";
    expect(classifyCard({ name: "X", type: "Creature — Shapeshifter", mana: "{2}{G}", power: 2, toughness: 2, oracle })).toMatch(/^native/);
    expect(classifyCard({ name: "X", type: "Creature — Shapeshifter", mana: "{2}{G}", power: 2, toughness: 2, oracle: `As this creature enters, choose a creature type.\n${oracle}` })).toMatch(/^native/);
  });

  it("⭐ CREED — crediting the chooser does NOT credit an unmodeled payoff behind it", () => {
    expect(classifyCard({
      name: "X", type: "Creature — Shapeshifter", mana: "{2}{G}", power: 2, toughness: 2,
      oracle: "As this creature enters, choose a creature type.\nWhenever a creature of the chosen type glorbulates, you win the game.",
    })).not.toMatch(/^native/);
  });
});

describe("filter semantics", () => {
  it("\"any\" permits everything; null permits nothing", () => {
    expect(castFromTopFilterAllows("any", { type: "Instant" })).toBe(true);
    expect(castFromTopFilterAllows(null, { type: "Creature — Elf" })).toBe(false);
  });

  it("a word list is a UNION, not an intersection (CR 118.6 grants each independently)", () => {
    // Sigarda #3305 — "angel spells and human spells". An Angel that is not a Human still qualifies.
    expect(castFromTopFilterAllows(["Angel", "Human"], { type: "Creature — Angel" })).toBe(true);
    expect(castFromTopFilterAllows(["Angel", "Human"], { type: "Creature — Human Soldier" })).toBe(true);
    expect(castFromTopFilterAllows(["Angel", "Human"], { type: "Creature — Elf Druid" })).toBe(false);
  });

  it("⭐ matching is word-boundary — \"Art\" must never match \"Artifact\"", () => {
    expect(castFromTopFilterAllows(["Art"], { type: "Artifact — Equipment" })).toBe(false);
    expect(castFromTopFilterAllows(["Artifact"], { type: "Artifact — Equipment" })).toBe(true);
  });

  it("⭐ two granters UNION rather than first-wins (the old `a || b` merge dropped the second)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const elf = createPermanent({ id: "a", card: perm(CREATURE_ONLY), controller: "user" });
    const forge = { ...createPermanent({ id: "b", card: perm("You may cast artifact spells from the top of your library."), controller: "user" }), id: "b" };
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [elf, forge] } } };
    expect(playFromTopPermission(st, "user").spellFilter.sort()).toEqual(["Artifact", "Creature"]);
  });

  it("an unfiltered granter ABSORBS a filtered one", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const any = createPermanent({ id: "a", card: perm("You may play lands and cast spells from the top of your library."), controller: "user" });
    const only = { ...createPermanent({ id: "b", card: perm(CREATURE_ONLY), controller: "user" }), id: "b" };
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [any, only] } } };
    expect(playFromTopPermission(st, "user").spellFilter).toBe("any");
  });
});
