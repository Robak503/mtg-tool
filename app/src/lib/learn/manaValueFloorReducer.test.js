/**
 * manaValueFloorReducer.test.js — "<filter> spells you cast with mana value N or greater cost {M} less to cast."
 *
 *   - It That Heralds the End (EDHREC #2310): "Colorless spells you cast with mana value 7 or greater cost {1} less to cast."
 *   - Krosan Drover: "Creature spells you cast with mana value 6 or greater cost {2} less to cast."
 *   - Spectacle Mage: "Instant and sorcery spells you cast with mana value 5 or greater cost {1} less to cast."
 *
 * A reducer with a floor on the SPELL's mana value (CR 202.3 — its mana cost, whatever the total cost paid; CR 601.2f — the
 * reduction is generic mana only, floored at {0}). Colorless is the spell's colour as cast (CR 105.2c; devoid, CR 702.114a,
 * makes a coloured-cost card colourless). The bundled rulings witnessed: Spectacle Mage "only looks at the mana value of a
 * spell, not the cost you're paying for it", and "can't reduce the colored mana requirements".
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const IT_THAT_HERALDS = { name: "It That Heralds the End", type: "Creature — Eldrazi Drone", mana: "{1}{C}", cmc: 2, colors: [], keywords: [], power: "2", toughness: "2",
  oracle: "Colorless spells you cast with mana value 7 or greater cost {1} less to cast.\nOther colorless creatures you control get +1/+1." };
const KROSAN_DROVER = { name: "Krosan Drover", type: "Creature — Elf", mana: "{3}{G}", cmc: 4, colors: ["G"], keywords: [], power: "2", toughness: "2",
  oracle: "Creature spells you cast with mana value 6 or greater cost {2} less to cast." };
const SPECTACLE_MAGE = { name: "Spectacle Mage", type: "Creature — Bird Shaman", mana: "{1}{U}{R}", cmc: 3, colors: ["U", "R"], keywords: ["Flying"], power: "2", toughness: "2",
  oracle: "Flying\nInstant and sorcery spells you cast with mana value 5 or greater cost {1} less to cast." };

const ULAMOGS_CRUSHER = { id: "uc", name: "Ulamog's Crusher", type: "Creature — Eldrazi", mana: "{8}", mana_cost: "{8}", cmc: 8, colors: [], keywords: ["Annihilator"], power: "8", toughness: "8",
  oracle: "Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able." };
const MYR_BATTLESPHERE = { id: "mb", name: "Myr Battlesphere", type: "Artifact Creature — Myr Construct", mana: "{7}", mana_cost: "{7}", cmc: 7, colors: [], keywords: [], power: "4", toughness: "7",
  oracle: "When this creature enters, create four 1/1 colorless Myr artifact creature tokens.\nWhenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking." };
const WURMCOIL_ENGINE = { id: "we", name: "Wurmcoil Engine", type: "Artifact Creature — Phyrexian Wurm", mana: "{6}", mana_cost: "{6}", cmc: 6, colors: [], keywords: ["Deathtouch", "Lifelink"], power: "6", toughness: "6",
  oracle: "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink." };
const DARKSTEEL_FORGE = { id: "df", name: "Darksteel Forge", type: "Artifact", mana: "{9}", mana_cost: "{9}", cmc: 9, colors: [], keywords: [],
  oracle: "Artifacts you control have indestructible. (Effects that say \"destroy\" don't destroy them. Artifact creatures with indestructible can't be destroyed by damage.)" };
const DREAD_DEFILER = { id: "dd", name: "Dread Defiler", type: "Creature — Eldrazi", mana: "{6}{B}", mana_cost: "{6}{B}", cmc: 7, colors: [], keywords: ["Devoid"], power: "6", toughness: "8",
  oracle: "Devoid (This card has no color.)\n{3}{C}, Exile a creature card from your graveyard: Target opponent loses life equal to the exiled card's power. ({C} represents colorless mana.)" };
const PELAKKA_WURM = { id: "pw", name: "Pelakka Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}{G}", mana_cost: "{4}{G}{G}{G}", cmc: 7, colors: ["G"], keywords: ["Trample"], power: "7", toughness: "7",
  oracle: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nWhen this creature enters, you gain 7 life.\nWhen this creature dies, draw a card." };
const CRAW_WURM = { id: "cw", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", mana_cost: "{4}{G}{G}", cmc: 6, colors: ["G"], keywords: [], power: "6", toughness: "4", oracle: "" };
const THRAGTUSK = { id: "tt", name: "Thragtusk", type: "Creature — Beast", mana: "{4}{G}", mana_cost: "{4}{G}", cmc: 5, colors: ["G"], keywords: [], power: "5", toughness: "3",
  oracle: "When this creature enters, you gain 5 life.\nWhen this creature leaves the battlefield, create a 3/3 green Beast creature token." };
const LAVA_AXE = { id: "la", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: "Lava Axe deals 5 damage to target player or planeswalker." };
const OPPORTUNITY = { id: "op", name: "Opportunity", type: "Instant", mana: "{4}{U}{U}", mana_cost: "{4}{U}{U}", cmc: 6, colors: ["U"], keywords: [],
  oracle: "Target player draws four cards." };
const DIVINATION = { id: "dv", name: "Divination", type: "Sorcery", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: "Draw two cards." };

const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const RICH = { W: 0, U: 3, B: 3, R: 3, G: 3, C: 9 };
function board({ hand = [], userBf = [], aiBf = [], pool = RICH } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield: userBf, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, battlefield: aiBf } } };
}
const generic = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId)?.cost?.generic ?? null;

describe("the clauses", () => {
  it("⭐ each parses to a reducer with a mana-value floor, and all three carriers read native", () => {
    expect(parseStaticAbilities(KROSAN_DROVER)).toEqual([{ costReduction: { subtype: "Creature", amount: 2, minManaValue: 6 } }]);
    expect(parseStaticAbilities(SPECTACLE_MAGE)).toEqual([{ costReduction: { subtypes: ["Instant", "Sorcery"], amount: 1, minManaValue: 5 } }]);
    expect(parseStaticAbilities(IT_THAT_HERALDS)[0]).toEqual({ costReduction: { colorless: true, amount: 1, minManaValue: 7 } });
    expect([IT_THAT_HERALDS, KROSAN_DROVER, SPECTACLE_MAGE].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true, true]);
  });
  it("CREED near-miss: an \"or less\" floor stays unread", () => {
    const nearMiss = { ...KROSAN_DROVER, name: "Near Miss", oracle: "Creature spells you cast with mana value 2 or less cost {1} less to cast." };
    expect({ statics: parseStaticAbilities(nearMiss), native: isNativeTier(classifyCard(nearMiss)) }).toEqual({ statics: [], native: false });
  });
});

describe("⭐ It That Heralds the End on the real cast offer", () => {
  const heralds = () => perm(IT_THAT_HERALDS, "ith", "user");
  it("⭐ colorless spells of mana value 7 or more cost {1} less: Ulamog's Crusher {7}, Myr Battlesphere {6}, Darksteel Forge {8}", () => {
    const s = board({ hand: [ULAMOGS_CRUSHER, MYR_BATTLESPHERE, DARKSTEEL_FORGE], userBf: [heralds()] });
    const row = { crusher: generic(s, "uc"), battlesphere: generic(s, "mb"), forge: generic(s, "df") };
    console.log(`WITNESS itThatHeralds ${JSON.stringify(row)}`);
    expect(row).toEqual({ crusher: 7, battlesphere: 6, forge: 8 });
  });
  it("⭐ a devoid spell is colorless: Dread Defiler {6}{B} costs {5}{B}", () => {
    expect(generic(board({ hand: [DREAD_DEFILER], userBf: [heralds()] }), "dd")).toBe(5);
  });
  it("control: below the floor (Wurmcoil Engine, mana value 6) or coloured (Pelakka Wurm) — full cost", () => {
    const s = board({ hand: [WURMCOIL_ENGINE, PELAKKA_WURM], userBf: [heralds()] });
    expect({ wurmcoil: generic(s, "we"), pelakka: generic(s, "pw") }).toEqual({ wurmcoil: 6, pelakka: 4 });
  });
  it("control: an opponent's It That Heralds the End discounts nothing of mine", () => {
    expect(generic(board({ hand: [ULAMOGS_CRUSHER], aiBf: [perm(IT_THAT_HERALDS, "ith", "ai")] }), "uc")).toBe(8);
  });
});

describe("⭐ Krosan Drover and Spectacle Mage on the real cast offer", () => {
  it("⭐ Krosan Drover: Craw Wurm {2}{G}{G}, Pelakka Wurm {2}{G}{G}{G}; Thragtusk (5) and Darksteel Forge (no creature) full", () => {
    const s = board({ hand: [CRAW_WURM, PELAKKA_WURM, THRAGTUSK, DARKSTEEL_FORGE], userBf: [perm(KROSAN_DROVER, "kd", "user")] });
    const row = { craw: generic(s, "cw"), pelakka: generic(s, "pw"), thragtusk: generic(s, "tt"), forge: generic(s, "df") };
    console.log(`WITNESS krosanDrover ${JSON.stringify(row)}`);
    expect(row).toEqual({ craw: 2, pelakka: 2, thragtusk: 4, forge: 9 });
  });
  it("⭐ Spectacle Mage: Lava Axe {3}{R}, Opportunity {3}{U}{U}; Divination (3) and Craw Wurm (a creature) full", () => {
    const s = board({ hand: [LAVA_AXE, OPPORTUNITY, DIVINATION, CRAW_WURM], userBf: [perm(SPECTACLE_MAGE, "sm", "user")] });
    const row = { axe: generic(s, "la"), opportunity: generic(s, "op"), divination: generic(s, "dv"), craw: generic(s, "cw") };
    console.log(`WITNESS spectacleMage ${JSON.stringify(row)}`);
    expect(row).toEqual({ axe: 3, opportunity: 3, divination: 2, craw: 4 });
  });
  it("two Spectacle Mages, the ruling's example: a {4}{U} sorcery costs {2}{U} (the floor reads the mana value, not the cost)", () => {
    const sorcery = { ...LAVA_AXE, id: "s5", name: "Test Sorcery", mana: "{4}{U}", mana_cost: "{4}{U}", colors: ["U"] };
    const s = board({ hand: [sorcery], userBf: [perm(SPECTACLE_MAGE, "sm1", "user"), perm(SPECTACLE_MAGE, "sm2", "user")] });
    expect(generic(s, "s5")).toBe(2);
  });
  it("unit: fail-closed — without the spell's mana value a floored reducer never applies", () => {
    const r = [{ subtype: "Creature", amount: 2, minManaValue: 6 }];
    expect({ none: costReductionForSpell(r, CRAW_WURM), six: costReductionForSpell(r, CRAW_WURM, "hand", { manaValue: 6 }), five: costReductionForSpell(r, CRAW_WURM, "hand", { manaValue: 5 }) })
      .toEqual({ none: 0, six: 2, five: 0 });
  });
});
