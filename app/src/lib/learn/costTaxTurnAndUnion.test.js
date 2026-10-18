/**
 * costTaxTurnAndUnion.test.js — two static cost taxes the most-played still lacked (CR 601.2f — a cost increase, generic mana,
 * applied before reductions; the mana value untouched, CR 202.3):
 *   - Defense Grid (EDHREC #1918) "Each spell costs {3} more to cast except during its controller's turn." — every spell, the
 *     Grid's controller's included, cast on a turn that isn't its caster's. Bundled rulings: "The additional cost can be reduced
 *     by effects that reduce costs, such as Sapphire Medallion."
 *   - Aura of Silence (#2192) "Artifact and enchantment spells your opponents cast cost {2} more to cast." — one tax over the
 *     union of two card types: an artifact enchantment pays it once. Bundled ruling: "Aura of Silence affects all opponents in
 *     a multiplayer game."
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities, collectCostTaxers, costTaxForSpell } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DEFENSE_GRID = { name: "Defense Grid", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "Each spell costs {3} more to cast except during its controller's turn." };
const AURA_OF_SILENCE = { name: "Aura of Silence", type: "Enchantment", mana: "{1}{W}{W}", cmc: 3, colors: ["W"], keywords: [],
  oracle: "Artifact and enchantment spells your opponents cast cost {2} more to cast.\nSacrifice this enchantment: Destroy target artifact or enchantment." };
const RUBY_MEDALLION = { name: "Ruby Medallion", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "Red spells you cast cost {1} less to cast." };
const LAVA_AXE = { id: "la", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: "Lava Axe deals 5 damage to target player or planeswalker." };
const SHOCK = { id: "sh", name: "Shock", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, colors: ["R"], keywords: [],
  oracle: "Shock deals 2 damage to any target." };
const DIVINATION = { id: "dv", name: "Divination", type: "Sorcery", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: "Draw two cards." };
const MIND_STONE = { id: "ms", name: "Mind Stone", type: "Artifact", mana: "{2}", mana_cost: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const INTANGIBLE_VIRTUE = { id: "iv", name: "Intangible Virtue", type: "Enchantment", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, colors: ["W"], keywords: [],
  oracle: "Creature tokens you control get +1/+1 and have vigilance." };
const BIDENT_OF_THASSA = { id: "bt", name: "Bident of Thassa", type: "Legendary Enchantment Artifact", mana: "{2}{U}{U}", mana_cost: "{2}{U}{U}", cmc: 4, colors: ["U"], keywords: [],
  oracle: "Whenever a creature you control deals combat damage to a player, you may draw a card.\n{1}{U}, {T}: Creatures your opponents control attack this turn if able." };
const GRIZZLY_BEARS = { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, colors: ["G"], keywords: [],
  power: "2", toughness: "2", oracle: "" };

const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function board({ active = "user", priority = active, userHand = [], aiHand = [], userBf = [], aiBf = [], userPool = {}, aiPool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: priority, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: userHand, battlefield: userBf, manaPool: { ...EMPTY_POOL, ...userPool } },
      ai: { ...g.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } } } };
}
const castOf = (s, who, cardId) => legalActionsForPlayer(s, who).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const generic = (a) => (a ? a.cost.generic : null);

describe("Defense Grid — the clause", () => {
  it("⭐ parses to a tax that skips its caster's own turn, and the card reads native", () => {
    expect(parseStaticAbilities(DEFENSE_GRID)).toEqual([{ costTax: { amount: 3, oppOnly: false, exceptCasterTurn: true } }]);
    expect(isNativeTier(classifyCard(DEFENSE_GRID))).toBe(true);
  });
});

describe("⭐ Defense Grid on the real cast offer", () => {
  const grid = () => perm(DEFENSE_GRID, "dg", "user");
  it("⭐ an opponent's instant on my turn costs {3}{R}; with only {R} it isn't offered", () => {
    const row = {
      taxed: generic(castOf(board({ priority: "ai", aiHand: [SHOCK], userBf: [grid()], aiPool: { R: 1, C: 3 } }), "ai", "sh")),
      short: castOf(board({ priority: "ai", aiHand: [SHOCK], userBf: [grid()], aiPool: { R: 1 } }), "ai", "sh") ?? null,
    };
    console.log(`WITNESS defenseGridOpponent ${JSON.stringify(row)}`);
    expect(row).toEqual({ taxed: 3, short: null });
  });
  it("⭐ its controller's own instant on an opponent's turn costs {3}{R} too (\"each spell\")", () => {
    expect(generic(castOf(board({ active: "ai", priority: "user", userHand: [SHOCK], userBf: [grid()], userPool: { R: 1, C: 3 } }), "user", "sh"))).toBe(3);
  });
  it("control: on its caster's own turn no tax — my Lava Axe {4}{R}, the opponent's Divination on its turn {2}{U}", () => {
    const row = {
      mine: generic(castOf(board({ userHand: [LAVA_AXE], userBf: [grid()], userPool: { R: 1, C: 4 } }), "user", "la")),
      theirs: generic(castOf(board({ active: "ai", aiHand: [DIVINATION], userBf: [grid()], aiPool: { U: 1, C: 2 } }), "ai", "dv")),
    };
    expect(row).toEqual({ mine: 4, theirs: 2 });
  });
  it("the ruling: a cost reduction applies to the increased cost — the opponent's Ruby Medallion makes its Shock {2}{R}", () => {
    const s = board({ priority: "ai", aiHand: [SHOCK], userBf: [grid()], aiBf: [perm(RUBY_MEDALLION, "rm", "ai")], aiPool: { R: 1, C: 2 } });
    expect(generic(castOf(s, "ai", "sh"))).toBe(2);
  });
  it("the dispatcher pays the tax — four mana spent, Shock on the stack", () => {
    const s = board({ priority: "ai", aiHand: [SHOCK], userBf: [grid()], aiPool: { R: 1, C: 3 } });
    const out = dispatchAction(s, castOf(s, "ai", "sh"));
    const pool = out.players.ai.manaPool;
    expect({ onStack: out.stack.some((o) => o.source?.name === "Shock"), left: pool.R + pool.C }).toEqual({ onStack: true, left: 0 });
  });
  it("unit: with no active player named the tax applies (the full cost, never a discount)", () => {
    const taxers = collectCostTaxers([{ controller: "user", battlefield: [{ card: DEFENSE_GRID }] }]);
    expect({ unnamed: costTaxForSpell(taxers, SHOCK, "ai"), ownTurn: costTaxForSpell(taxers, SHOCK, "ai", "ai"), otherTurn: costTaxForSpell(taxers, SHOCK, "ai", "user") })
      .toEqual({ unnamed: 3, ownTurn: 0, otherTurn: 3 });
  });
});

describe("Aura of Silence — the clause", () => {
  it("⭐ parses to ONE union tax over artifact and enchantment, and the card reads native", () => {
    expect(parseStaticAbilities(AURA_OF_SILENCE)).toEqual([{ costTax: { amount: 2, oppOnly: true, cardTypes: ["artifact", "enchantment"] } }]);
    expect(isNativeTier(classifyCard(AURA_OF_SILENCE))).toBe(true);
  });
  it("CREED near-miss: a union naming a non-card-type word stays unread", () => {
    const nearMiss = { ...AURA_OF_SILENCE, name: "Near Miss", oracle: "Artifact and legendary spells your opponents cast cost {2} more to cast." };
    expect({ statics: parseStaticAbilities(nearMiss), native: isNativeTier(classifyCard(nearMiss)) }).toEqual({ statics: [], native: false });
  });
});

describe("⭐ Aura of Silence on the real cast offer", () => {
  const aura = () => perm(AURA_OF_SILENCE, "aos", "user");
  const oppCast = (card, pool) => castOf(board({ active: "ai", aiHand: [card], userBf: [aura()], aiPool: pool }), "ai", card.id);
  it("⭐ the opponent's artifact costs {4}, its enchantment {3}{W}, its artifact enchantment {4}{U}{U} — taxed once", () => {
    const row = {
      artifact: generic(oppCast(MIND_STONE, { C: 4 })),
      enchantment: generic(oppCast(INTANGIBLE_VIRTUE, { W: 1, C: 3 })),
      artifactEnchantment: generic(oppCast(BIDENT_OF_THASSA, { U: 2, C: 4 })),
    };
    console.log(`WITNESS auraOfSilence ${JSON.stringify(row)}`);
    expect(row).toEqual({ artifact: 4, enchantment: 3, artifactEnchantment: 4 });
  });
  it("⭐ with only {2} the opponent's Mind Stone isn't offered", () => {
    expect(oppCast(MIND_STONE, { C: 2 })).toBeUndefined();
  });
  it("control: the opponent's creature is untaxed, and so is the Aura's controller's own artifact", () => {
    const row = {
      creature: generic(oppCast(GRIZZLY_BEARS, { G: 1, C: 1 })),
      own: generic(castOf(board({ userHand: [MIND_STONE], userBf: [aura()], userPool: { C: 2 } }), "user", "ms")),
    };
    expect(row).toEqual({ creature: 1, own: 2 });
  });
});
