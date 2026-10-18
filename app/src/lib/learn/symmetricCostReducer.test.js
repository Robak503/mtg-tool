/**
 * symmetricCostReducer.test.js — "Spells cost {1} less to cast." (Helm of Awakening, EDHREC #1914).
 *
 * The bare reducer names no "you": it reduces EVERY player's spells (CR 601.2f — generic mana only, floored at {0}; the mana
 * value untouched, CR 202.3). The cast site collects the caster's own reducers, so a reducer that reaches every caster rides as
 * `everyCaster` and is collected from every battlefield. The bundled rulings witnessed: "The effect is cumulative." · "This can
 * lower the cost to zero, but not below zero." · "Can never affect the colored part of the cost."
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HELM_OF_AWAKENING = { name: "Helm of Awakening", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "Spells cost {1} less to cast." };
const STONE_CALENDAR = { name: "Stone Calendar", type: "Artifact", mana: "{5}", cmc: 5, colors: [], keywords: [],
  oracle: "Spells you cast cost {1} less to cast." };
const LAVA_AXE = { id: "la", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: "Lava Axe deals 5 damage to target player or planeswalker." };
const DIVINATION = { id: "dv", name: "Divination", type: "Sorcery", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: "Draw two cards." };
const SHOCK = { id: "sh", name: "Shock", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, colors: ["R"], keywords: [],
  oracle: "Shock deals 2 damage to any target." };

const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function board({ active = "user", userHand = [], aiHand = [], userBf = [], aiBf = [], userPool = {}, aiPool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: userHand, battlefield: userBf, manaPool: { ...EMPTY_POOL, ...userPool } },
      ai: { ...g.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } } } };
}
const castOf = (s, who, cardId) => legalActionsForPlayer(s, who).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const costRow = (a) => (a ? { generic: a.cost.generic, R: a.cost.R || 0, U: a.cost.U || 0, cmc: a.cmc } : null);

describe("the clause", () => {
  it("⭐ the bare reducer parses to an every-caster reducer and Helm of Awakening reads native", () => {
    expect(parseStaticAbilities(HELM_OF_AWAKENING)).toEqual([{ costReduction: { allSpells: true, amount: 1, everyCaster: true } }]);
    expect(isNativeTier(classifyCard(HELM_OF_AWAKENING))).toBe(true);
  });
  it("control: \"Spells you cast\" (Stone Calendar) keeps its caster-only reducer", () => {
    expect(parseStaticAbilities(STONE_CALENDAR)).toEqual([{ costReduction: { allSpells: true, amount: 1 } }]);
  });
});

describe("⭐ every player's spells, on the real cast offer", () => {
  it("⭐ the controller's own Lava Axe costs {3}{R} under its Helm; mana value still 5", () => {
    const row = costRow(castOf(board({ userHand: [LAVA_AXE], userBf: [perm(HELM_OF_AWAKENING, "h1", "user")], userPool: { R: 1, C: 3 } }), "user", "la"));
    console.log(`WITNESS helmOwn ${JSON.stringify(row)}`);
    expect(row).toEqual({ generic: 3, R: 1, U: 0, cmc: 5 });
  });
  it("⭐ an OPPONENT's Helm discounts my Lava Axe too", () => {
    const row = costRow(castOf(board({ userHand: [LAVA_AXE], aiBf: [perm(HELM_OF_AWAKENING, "h1", "ai")], userPool: { R: 1, C: 3 } }), "user", "la"));
    console.log(`WITNESS helmOpponent ${JSON.stringify(row)}`);
    expect(row).toEqual({ generic: 3, R: 1, U: 0, cmc: 5 });
  });
  it("⭐ my Helm discounts the opponent's Divination on its turn: {1}{U}", () => {
    const row = costRow(castOf(board({ active: "ai", aiHand: [DIVINATION], userBf: [perm(HELM_OF_AWAKENING, "h1", "user")], aiPool: { U: 1, C: 1 } }), "ai", "dv"));
    expect(row).toEqual({ generic: 1, R: 0, U: 1, cmc: 3 });
  });
  it("the effect is cumulative: my Helm and the opponent's Helm make Lava Axe {2}{R}", () => {
    const s = board({ userHand: [LAVA_AXE], userBf: [perm(HELM_OF_AWAKENING, "h1", "user")], aiBf: [perm(HELM_OF_AWAKENING, "h2", "ai")], userPool: { R: 1, C: 2 } });
    expect(costRow(castOf(s, "user", "la"))).toEqual({ generic: 2, R: 1, U: 0, cmc: 5 });
  });
  it("the dispatcher pays exactly the reduced cost — four mana spent, the Axe on the stack", () => {
    const s = board({ userHand: [LAVA_AXE], aiBf: [perm(HELM_OF_AWAKENING, "h1", "ai")], userPool: { R: 1, C: 3 } });
    const out = dispatchAction(s, castOf(s, "user", "la"));
    const pool = out.players.user.manaPool;
    expect({ onStack: out.stack.some((o) => o.source?.name === "Lava Axe"), left: pool.R + pool.C }).toEqual({ onStack: true, left: 0 });
  });
  it("⛔ generic only: Shock still costs {R} under two Helms (no mana, no cast)", () => {
    const s = board({ userHand: [SHOCK], userBf: [perm(HELM_OF_AWAKENING, "h1", "user")], aiBf: [perm(HELM_OF_AWAKENING, "h2", "ai")] });
    expect(castOf(s, "user", "sh")).toBeUndefined();
  });
  it("control: an opponent's Stone Calendar (\"spells you cast\") still discounts nothing of mine", () => {
    expect(castOf(board({ userHand: [LAVA_AXE], aiBf: [perm(STONE_CALENDAR, "sc", "ai")], userPool: { R: 1, C: 3 } }), "user", "la")).toBeUndefined();
  });
});
