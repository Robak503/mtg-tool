/**
 * COLOUR WORDS IN A SPEND RESTRICTION — Shrine of the Forsaken Gods ("{T}: Add {C}{C}. Spend this mana only to cast colorless
 * spells. Activate only if you control seven or more lands.") · Eldrazi Temple ("… only to cast colorless Eldrazi spells or
 * activate abilities of colorless Eldrazi."). QUARTET Phase 4 step 3's LAST class, 2026-09-06.
 *
 * A colour PREDICATE beside the type words: castColorless (the cast card's colours) and abilityColorless (the activating
 * source's colours — every activation site passes activatingColors, layer-aware). The extra-mana-line regex admits a restricted
 * pip line with an activation gate; Shrine's gate rides the existing activationCondition read.
 *
 * Mutation-checked: see the run ledger (docs-q4e).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources, canAfford, parseSpendRestriction } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHRINE = { id: "c-shrine", name: "Shrine of the Forsaken Gods", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if you control seven or more lands." };
const TEMPLE = { id: "c-temple", name: "Eldrazi Temple", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless Eldrazi spells or activate abilities of colorless Eldrazi." };
const GREY_ELDRAZI = { id: "c-ge", name: "Endless One", type: "Creature — Eldrazi", mana: "{X}", power: 0, toughness: 0, keywords: [], oracle: "" };
const RED_ELDRAZI = { id: "c-re", name: "Red Eldrazi", type: "Creature — Eldrazi", mana: "{2}{R}", power: 3, toughness: 3, keywords: [], oracle: "" };
const GREY_BEAR = { id: "c-gb", name: "Grey Bear", type: "Artifact Creature — Bear", mana: "{2}", power: 2, toughness: 2, keywords: [], oracle: "" };
const basic = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Wastes", type: "Basic Land", mana: "", keywords: [], oracle: "{T}: Add {C}." }, controller: "user" });

function board(land, extraLands) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 8,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "land", card: land, controller: "user" }), ...Array.from({ length: extraLands }, (_, i) => basic(`w${i}`))], hand: [], library: [] } } };
}
const restrictedOf = (s) => manaSources(s, "user").find((m) => m.permanentId === "land" && m.restriction);

describe("the parser and the classifier", () => {
  it("both restrictions carry the colour predicate; both lands read land", () => {
    const sh = parseSpendRestriction(SHRINE.oracle), te = parseSpendRestriction(TEMPLE.oracle);
    const row = { shrine: sh, temple: te, shrineTier: classifyCard(SHRINE), templeTier: classifyCard(TEMPLE) };
    console.log("  WITNESS colorlessSpend", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(sh).toEqual({ castTypes: ["@any-spell"], castColorless: true });
    expect(te).toEqual({ castTypes: ["eldrazi"], abilityOf: ["eldrazi"], castColorless: true, abilityColorless: true });
    expect(row.shrineTier).toBe("land");
    expect(row.templeTier).toBe("land");
  });
});

describe("RUNTIME", () => {
  it("Eldrazi Temple's {C}{C} pays a colourless Eldrazi spell or a colourless Eldrazi source's ability — never a red Eldrazi's, a colourless Bear's, or a context-less spend", () => {
    const s = board(TEMPLE, 0);
    const rec = restrictedOf(s);
    const pool = s.players.user.manaPool;
    const two = parseManaCost("{2}");
    const row = { greyCast: canAfford(pool, [rec], two, { castCard: GREY_ELDRAZI }), redCast: canAfford(pool, [rec], two, { castCard: RED_ELDRAZI }), bearCast: canAfford(pool, [rec], two, { castCard: GREY_BEAR }),
      greyAbility: canAfford(pool, [rec], two, { activatingIsCreature: true, activatingTypeLine: GREY_ELDRAZI.type, activatingColors: [] }),
      redAbility: canAfford(pool, [rec], two, { activatingIsCreature: true, activatingTypeLine: RED_ELDRAZI.type, activatingColors: ["R"] }),
      bearAbility: canAfford(pool, [rec], two, { activatingIsCreature: true, activatingTypeLine: GREY_BEAR.type, activatingColors: [] }),
      noColours: canAfford(pool, [rec], two, { activatingIsCreature: true, activatingTypeLine: GREY_ELDRAZI.type }) };
    console.log("  WITNESS colorlessSpendTemple", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ greyCast: true, redCast: false, bearCast: false, greyAbility: true, redAbility: false, bearAbility: false, noColours: false });
  });
  it("Shrine's {C}{C} exists only with seven lands and pays a colourless spell of any type, never a coloured one", () => {
    const seven = board(SHRINE, 6), six = board(SHRINE, 5);
    const rec7 = restrictedOf(seven), rec6 = restrictedOf(six);
    const pool = seven.players.user.manaPool;
    const two = parseManaCost("{2}");
    const row = { withSeven: !!rec7, withSix: !!rec6, bearCast: rec7 ? canAfford(pool, [rec7], two, { castCard: GREY_BEAR }) : null, redCast: rec7 ? canAfford(pool, [rec7], two, { castCard: RED_ELDRAZI }) : null };
    console.log("  WITNESS colorlessSpendShrine", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ withSeven: true, withSix: false, bearCast: true, redCast: false });
  });
});
