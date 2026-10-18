/**
 * scaledCostReducer.test.js — "<filter> spells you cast cost {1} less to cast for each <count>." (CR 601.2f — generic mana only,
 * floored at {0}; the mana value untouched, CR 202.3; the count read as the cost is determined.)
 *
 *   - Animar, Soul of Elements (EDHREC #2371): "Creature spells you cast cost {1} less to cast for each +1/+1 counter on Animar."
 *   - Herald of War: "Angel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on this creature."
 *   - Mindsplice Apparatus: "Instant and sorcery spells you cast cost {1} less to cast for each oil counter on this artifact."
 *   - Temur Battlecrier (#2239): "During your turn, spells you cast cost {1} less to cast for each creature you control with
 *     power 4 or greater."
 *   - Sami, Wildcat Captain: "Spells you cast have affinity for artifacts. (They cost {1} less to cast for each artifact you
 *     control.)" (CR 702.41a).
 *   - Sokka, Swordmaster: "Equipment spells you cast cost {1} less to cast for each Ally you control."
 *
 * The bundled rulings witnessed: Animar — "The counter put on Animar for a creature spell won't affect the cost of that creature
 * spell, only future ones."; Herald of War — "A creature spell that's both an Angel and a Human will cost {1} less to cast for
 * each +1/+1 counter on Herald of War." (once per counter, not twice) and "The cost reduction is based on the total number of
 * +1/+1 counters on Herald of War, not just the ones put on it by its own ability."; Sami — "If a spell has multiple instances of
 * affinity, each one applies."; Sokka — "Sokka will count himself as an Ally for his second ability."
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities, collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ANIMAR = { name: "Animar, Soul of Elements", type: "Legendary Creature — Elemental", mana: "{G}{U}{R}", cmc: 3, colors: ["G", "U", "R"], keywords: ["Protection"], power: "1", toughness: "1",
  oracle: "Protection from white and from black\nWhenever you cast a creature spell, put a +1/+1 counter on Animar.\nCreature spells you cast cost {1} less to cast for each +1/+1 counter on Animar." };
const HERALD_OF_WAR = { name: "Herald of War", type: "Creature — Angel", mana: "{3}{W}{W}", cmc: 5, colors: ["W"], keywords: ["Flying"], power: "3", toughness: "3",
  oracle: "Flying\nWhenever this creature attacks, put a +1/+1 counter on it.\nAngel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on this creature." };
const MINDSPLICE = { name: "Mindsplice Apparatus", type: "Artifact", mana: "{3}{U}", cmc: 4, colors: ["U"], keywords: ["Flash"],
  oracle: "Flash\nAt the beginning of your upkeep, put an oil counter on this artifact.\nInstant and sorcery spells you cast cost {1} less to cast for each oil counter on this artifact." };
const TEMUR_BATTLECRIER = { name: "Temur Battlecrier", type: "Creature — Orc Ranger", mana: "{G}{U}{R}", cmc: 3, colors: ["G", "U", "R"], keywords: [], power: "4", toughness: "3",
  oracle: "During your turn, spells you cast cost {1} less to cast for each creature you control with power 4 or greater." };
const SAMI = { name: "Sami, Wildcat Captain", type: "Legendary Creature — Human Artificer Rogue", mana: "{4}{R}{W}", cmc: 6, colors: ["R", "W"], keywords: ["Double strike", "Vigilance"], power: "4", toughness: "4",
  oracle: "Double strike, vigilance\nSpells you cast have affinity for artifacts. (They cost {1} less to cast for each artifact you control.)" };

const CRAW_WURM = { id: "cw", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", mana_cost: "{4}{G}{G}", cmc: 6, colors: ["G"], keywords: [], power: "6", toughness: "4", oracle: "" };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "2", oracle: "" };
const LAVA_AXE = { id: "la", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: "Lava Axe deals 5 damage to target player or planeswalker." };
const OPPORTUNITY = { id: "op", name: "Opportunity", type: "Instant", mana: "{4}{U}{U}", mana_cost: "{4}{U}{U}", cmc: 6, colors: ["U"], keywords: [],
  oracle: "Target player draws four cards." };
const SERRA_ANGEL = { id: "sa", name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", mana_cost: "{3}{W}{W}", cmc: 5, colors: ["W"], keywords: ["Flying", "Vigilance"], power: "4", toughness: "4",
  oracle: "Flying\nVigilance (Attacking doesn't cause this creature to tap.)" };
const MENTOR_OF_THE_MEEK = { id: "mm", name: "Mentor of the Meek", type: "Creature — Human Soldier", mana: "{2}{W}", mana_cost: "{2}{W}", cmc: 3, colors: ["W"], keywords: [], power: "2", toughness: "2",
  oracle: "Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card." };
const ERRANT_AND_GIADA = { id: "eg", name: "Errant and Giada", type: "Legendary Creature — Human Angel", mana: "{1}{W}{U}", mana_cost: "{1}{W}{U}", cmc: 3, colors: ["W", "U"], keywords: ["Flash", "Flying"], power: "2", toughness: "3",
  oracle: "Flash\nFlying\nYou may look at the top card of your library any time.\nYou may cast spells with flash or flying from the top of your library." };
const SOKKA = { name: "Sokka, Swordmaster", type: "Legendary Creature — Human Warrior Ally", mana: "{2}{W}", cmc: 3, colors: ["W"], keywords: ["Vigilance"], power: "3", toughness: "3",
  oracle: "Vigilance\nEquipment spells you cast cost {1} less to cast for each Ally you control.\nAt the beginning of combat on your turn, attach up to one target Equipment you control to Sokka." };
const ONDU_CLERIC = { name: "Ondu Cleric", type: "Creature — Kor Cleric Ally", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: [], power: "1", toughness: "1",
  oracle: "Whenever this creature or another Ally you control enters, you may gain life equal to the number of Allies you control." };
const LOXODON_WARHAMMER = { id: "lw", name: "Loxodon Warhammer", type: "Artifact — Equipment", mana: "{3}", mana_cost: "{3}", cmc: 3, colors: [], keywords: [],
  oracle: "Equipped creature gets +3/+0 and has trample and lifelink.\nEquip {3}" };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const JAYEMDAE_TOME = { name: "Jayemdae Tome", type: "Artifact — Book", mana: "{4}", cmc: 4, colors: [], keywords: [], oracle: "{4}, {T}: Draw a card." };

const perm = (card, id, controller, counters = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), counters });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const RICH = { W: 3, U: 3, B: 0, R: 3, G: 3, C: 9 };
function board({ active = "user", priority = active, hand = [], userBf = [], aiBf = [], pool = RICH } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: priority, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield: userBf, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, battlefield: aiBf } } };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const generic = (s, cardId) => castOf(s, cardId)?.cost?.generic ?? null;
const reducersOf = (card) => parseStaticAbilities(card).filter((d) => d.costReduction).map((d) => d.costReduction);

describe("the clauses", () => {
  it("⭐ a reducer per counter on its source, per board count, and per artifact (affinity)", () => {
    expect({
      animar: reducersOf(ANIMAR),
      herald: reducersOf(HERALD_OF_WAR),
      mindsplice: reducersOf(MINDSPLICE),
      battlecrier: reducersOf(TEMUR_BATTLECRIER),
      sami: reducersOf(SAMI),
    }).toEqual({
      animar: [{ subtype: "Creature", amount: 0, per: 1, perCounterOnSource: "+1/+1" }],
      herald: [{ subtypes: ["Angel", "Human"], amount: 0, per: 1, perCounterOnSource: "+1/+1" }],
      mindsplice: [{ subtypes: ["Instant", "Sorcery"], amount: 0, per: 1, perCounterOnSource: "oil" }],
      battlecrier: [{ allSpells: true, amount: 0, per: 1, perEachCount: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 4 }, duringYourTurn: true }],
      sami: [{ allSpells: true, amount: 0, per: 1, perEachCount: { kind: "permanentsYouControl", cardType: "artifact" } }],
    });
  });
  it("⭐ Animar, Temur Battlecrier, Herald of War, Mindsplice Apparatus, Sami and Sokka read native", () => {
    expect([ANIMAR, TEMUR_BATTLECRIER, HERALD_OF_WAR, MINDSPLICE, SAMI, SOKKA].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true, true, true, true, true]);
  });
  it("CREED near-misses stay unread: an \"other\" count (the source isn't known at the cast) and a counter on another permanent", () => {
    const other = { ...TEMUR_BATTLECRIER, name: "Near Miss A", oracle: "Spells you cast cost {1} less to cast for each other creature you control." };
    const elsewhere = { ...ANIMAR, name: "Near Miss B", oracle: "Creature spells you cast cost {1} less to cast for each +1/+1 counter on creatures you control." };
    expect([other, elsewhere].map((c) => ({ statics: reducersOf(c), native: isNativeTier(classifyCard(c)) })))
      .toEqual([{ statics: [], native: false }, { statics: [], native: false }]);
  });
});

describe("⭐ per counter on the source", () => {
  it("⭐ Animar with two +1/+1 counters: Craw Wurm {2}{G}{G}; Lava Axe (no creature) full; no counters → full", () => {
    const row = {
      craw: generic(board({ hand: [CRAW_WURM], userBf: [perm(ANIMAR, "an", "user", { "+1/+1": 2 })] }), "cw"),
      axe: generic(board({ hand: [LAVA_AXE], userBf: [perm(ANIMAR, "an", "user", { "+1/+1": 2 })] }), "la"),
      bare: generic(board({ hand: [CRAW_WURM], userBf: [perm(ANIMAR, "an", "user")] }), "cw"),
    };
    console.log(`WITNESS animar ${JSON.stringify(row)}`);
    expect(row).toEqual({ craw: 2, axe: 4, bare: 4 });
  });
  it("floored at {0}: Animar with five counters makes Craw Wurm {G}{G}", () => {
    expect(generic(board({ hand: [CRAW_WURM], userBf: [perm(ANIMAR, "an", "user", { "+1/+1": 5 })] }), "cw")).toBe(0);
  });
  it("control: an opponent's Animar discounts nothing of mine", () => {
    expect(generic(board({ hand: [CRAW_WURM], aiBf: [perm(ANIMAR, "an", "ai", { "+1/+1": 3 })] }), "cw")).toBe(4);
  });
  it("the ruling: the counter Animar gets for a creature spell doesn't change that spell's cost — the cast pays {2}{G}{G}", () => {
    const s = board({ hand: [CRAW_WURM], userBf: [perm(ANIMAR, "an", "user", { "+1/+1": 2 })], pool: { G: 2, C: 2 } });
    const out = dispatchAction(s, castOf(s, "cw"));
    const pool = out.players.user.manaPool;
    expect({ onStack: out.stack.some((o) => o.source?.name === "Craw Wurm"), left: pool.G + pool.C }).toEqual({ onStack: true, left: 0 });
  });
  it("⭐ Herald of War with two counters: Serra Angel {1}{W}{W}, Mentor of the Meek {W}; Craw Wurm full", () => {
    const s = board({ hand: [SERRA_ANGEL, MENTOR_OF_THE_MEEK, CRAW_WURM], userBf: [perm(HERALD_OF_WAR, "hw", "user", { "+1/+1": 2 })] });
    const row = { angel: generic(s, "sa"), human: generic(s, "mm"), wurm: generic(s, "cw") };
    console.log(`WITNESS heraldOfWar ${JSON.stringify(row)}`);
    expect(row).toEqual({ angel: 1, human: 0, wurm: 4 });
  });
  it("the ruling: a Human Angel is reduced once per counter, not twice", () => {
    const reducers = collectCostReducers([perm(HERALD_OF_WAR, "hw", "user", { "+1/+1": 1 })]);
    expect({ reducers, errant: costReductionForSpell(reducers, ERRANT_AND_GIADA) })
      .toEqual({ reducers: [{ subtypes: ["Angel", "Human"], amount: 1, per: 1, perCounterOnSource: "+1/+1" }], errant: 1 });
  });
  it("⭐ Mindsplice Apparatus with three oil counters: Lava Axe {1}{R}, Opportunity {1}{U}{U}; Craw Wurm full", () => {
    const s = board({ hand: [LAVA_AXE, OPPORTUNITY, CRAW_WURM], userBf: [perm(MINDSPLICE, "ma", "user", { oil: 3 })] });
    expect({ axe: generic(s, "la"), opportunity: generic(s, "op"), wurm: generic(s, "cw") }).toEqual({ axe: 1, opportunity: 1, wurm: 4 });
  });
});

describe("⭐ per board count", () => {
  it("⭐ Temur Battlecrier and a Craw Wurm, my turn: Lava Axe costs {2}{R}", () => {
    const row = generic(board({ hand: [LAVA_AXE], userBf: [perm(TEMUR_BATTLECRIER, "tb", "user"), perm(CRAW_WURM, "cw0", "user")] }), "la");
    console.log(`WITNESS temurBattlecrier ${JSON.stringify(row)}`);
    expect(row).toBe(2);
  });
  it("⭐ power is read through the layers: a Grizzly Bears with two +1/+1 counters counts, a plain one doesn't", () => {
    const pumped = generic(board({ hand: [LAVA_AXE], userBf: [perm(TEMUR_BATTLECRIER, "tb", "user"), perm(GRIZZLY_BEARS, "gb", "user", { "+1/+1": 2 })] }), "la");
    const plain = generic(board({ hand: [LAVA_AXE], userBf: [perm(TEMUR_BATTLECRIER, "tb", "user"), perm(GRIZZLY_BEARS, "gb", "user")] }), "la");
    expect({ pumped, plain }).toEqual({ pumped: 2, plain: 3 });
  });
  it("⭐ \"during your turn\": on the opponent's turn my Opportunity costs the full {4}{U}{U}", () => {
    const s = board({ active: "ai", priority: "user", hand: [OPPORTUNITY], userBf: [perm(TEMUR_BATTLECRIER, "tb", "user"), perm(CRAW_WURM, "cw0", "user")] });
    expect(generic(s, "op")).toBe(4);
  });
  it("control: the opponent's big creatures don't count (\"you control\")", () => {
    expect(generic(board({ hand: [LAVA_AXE], userBf: [perm(TEMUR_BATTLECRIER, "tb", "user")], aiBf: [perm(CRAW_WURM, "cw1", "ai")] }), "la")).toBe(3);
  });
  it("⭐ Sami's affinity for artifacts: three artifacts make Lava Axe {1}{R}; the opponent's artifacts don't count", () => {
    const mine = generic(board({ hand: [LAVA_AXE], userBf: [perm(SAMI, "sw", "user"), perm(SOL_RING, "a1", "user"), perm(SOL_RING, "a2", "user"), perm(JAYEMDAE_TOME, "a3", "user")] }), "la");
    const theirs = generic(board({ hand: [LAVA_AXE], userBf: [perm(SAMI, "sw", "user")], aiBf: [perm(SOL_RING, "a1", "ai"), perm(JAYEMDAE_TOME, "a3", "ai")] }), "la");
    expect({ mine, theirs }).toEqual({ mine: 1, theirs: 4 });
  });
  it("two Samis: each affinity applies — two artifacts make Lava Axe {0}{R}", () => {
    expect(generic(board({ hand: [LAVA_AXE], userBf: [perm(SAMI, "sw1", "user"), perm(SAMI, "sw2", "user"), perm(SOL_RING, "a1", "user"), perm(SOL_RING, "a2", "user")] }), "la")).toBe(0);
  });
  it("⭐ Sokka counts himself: with Ondu Cleric, Loxodon Warhammer costs {1}; Lava Axe (no Equipment) full", () => {
    const s = board({ hand: [LOXODON_WARHAMMER, LAVA_AXE], userBf: [perm(SOKKA, "sk", "user"), perm(ONDU_CLERIC, "oc", "user")] });
    const row = { hammer: generic(s, "lw"), axe: generic(s, "la"), alone: generic(board({ hand: [LOXODON_WARHAMMER], userBf: [perm(SOKKA, "sk", "user")] }), "lw") };
    console.log(`WITNESS sokka ${JSON.stringify(row)}`);
    expect(row).toEqual({ hammer: 1, axe: 4, alone: 2 });
  });
  it("Hamza's second line reads (a +1/+1-counter count); the card stays parked on its unread self-discount line", () => {
    const hamza = { name: "Hamza, Guardian of Arashin", type: "Legendary Creature — Elephant Warrior", mana: "{4}{G}{W}", cmc: 6, colors: ["G", "W"], keywords: [], power: "5", toughness: "5",
      oracle: "This spell costs {1} less to cast for each creature you control with a +1/+1 counter on it.\nCreature spells you cast cost {1} less to cast for each creature you control with a +1/+1 counter on it." };
    const s = board({ hand: [CRAW_WURM], userBf: [perm(hamza, "hz", "user"), perm(GRIZZLY_BEARS, "gb1", "user", { "+1/+1": 1 }), perm(GRIZZLY_BEARS, "gb2", "user", { "+1/+1": 3 }), perm(GRIZZLY_BEARS, "gb3", "user")] });
    expect({ craw: generic(s, "cw"), native: isNativeTier(classifyCard(hamza)) }).toEqual({ craw: 2, native: false });
  });
  it("unit: an unresolved board count reduces nothing (amount 0 until the cast site counts)", () => {
    expect(costReductionForSpell(reducersOf(TEMUR_BATTLECRIER), LAVA_AXE)).toBe(0);
  });
});
