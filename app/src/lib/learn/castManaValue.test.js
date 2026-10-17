/**
 * castManaValue.test.js — a cast offer's `cmc` is the spell's MANA VALUE, whatever was paid to cast it (2026-10-17).
 *
 * CR 202.3: the mana value is the total amount of mana in the MANA COST. CR 118.8d: an additional cost (kicker,
 * multikicker — CR 702.33a/c) doesn't change a spell's mana cost, only what its controller pays. CR 118.9c: an
 * alternative cost (bestow — CR 702.103a) doesn't either. A cost increase (strive) is part of the total cost
 * (CR 601.2f), never of the mana cost. CR 202.3f: a hybrid symbol counts its largest component, so {2/W} is 2.
 *
 * THE BUG. legalChoices stamped `cmc` = printed + kicker on a kicked cast (creature, spell, Aura), printed + k × the
 * multikicker on a cast kicked k times, the BESTOW cost on a bestowed cast, the whole payable cost (tax included) on
 * a strive cast with extra targets, and read a {2/X} pip as 1 in every cast (`totalCmc`). The `cmc` of an offer is
 * read by the AI's cast scorer (opponentAI.scoreCastTier / scoreByRole — the aggro "cheap body" curve, the ramp
 * "7 or more" finisher) and its tie-break, so a kicked Kavu Titan stopped being a two-drop and a Wildgrowth Archaic
 * became one.
 *
 * WHAT WAS NEVER WRONG (pinned here as guards): a spell on the stack reads its mana value off its stack object's
 * source card (stack.counterMvOk / spellEffects.spellMatchesCounterFilter / stack.stackSpellManaValue /
 * triggers.spellManaValue), and the dispatcher puts the CARD there, never the offer's `cmc`. The guards below cast the
 * kicked / bestowed / multikicked spell through the real dispatcher and read it back through real mana-value counters
 * (Thoughtbind, Disdainful Stroke, Spell Snare, Minor Misstep) and Mana Drain's payout.
 *
 * Card text: bundled Scryfall oracle data (oracle-index.json), copied verbatim with its `cmc` (a game card carries
 * the index's cmc — learnDeckEnrich.mergeCardData).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions, parseManaCost, totalCmc } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction, __scoreCastActionForTests as scoreCast } from "./opponentAI.js";
import { stackSpellManaValue } from "./effects/atoms/stack.js";

beforeEach(() => _resetIdsForTests());

// ── Real cards (bundled Scryfall oracle text, cmc as the index carries it) ─────────────────────────────────────────
const BALOTH_GORGER = { name: "Baloth Gorger", type: "Creature — Beast", mana: "{2}{G}{G}", cmc: 4, power: 4, toughness: 4, colors: ["G"],
  keywords: ["Kicker"], oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it." };
const KAVU_TITAN = { name: "Kavu Titan", type: "Creature — Kavu", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, colors: ["G"],
  keywords: ["Kicker"], oracle: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample." };
const INTO_THE_ROIL = { name: "Into the Roil", type: "Instant", mana: "{1}{U}", cmc: 2, colors: ["U"], keywords: ["Kicker"],
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." };
const GALADRIELS_DISMISSAL = { name: "Galadriel's Dismissal", type: "Instant", mana: "{W}", cmc: 1, colors: ["W"], keywords: ["Kicker"],
  oracle: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature phases out. If this spell was kicked, each creature target player controls phases out instead. (Treat phased-out creatures and anything attached to them as though they don't exist until their controller's next turn.)" };
const BUBBLE_SNARE = { name: "Bubble Snare", type: "Enchantment — Aura", mana: "{U}", cmc: 1, colors: ["U"], keywords: ["Enchant", "Kicker"],
  oracle: "Kicker {2}{U} (You may pay an additional {2}{U} as you cast this spell.)\nEnchant creature\nWhen this Aura enters, if it was kicked, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };
const EVERFLOWING_CHALICE = { name: "Everflowing Chalice", type: "Artifact", mana: "{0}", cmc: 0, colors: [], keywords: ["Multikicker"],
  oracle: "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact." };
const BOON_SATYR = { name: "Boon Satyr", type: "Enchantment Creature — Satyr", mana: "{1}{G}{G}", cmc: 3, power: 4, toughness: 2, colors: ["G"],
  keywords: ["Bestow", "Flash"], oracle: "Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2." };
const ROUSE_THE_MOB = { name: "Rouse the Mob", type: "Instant", mana: "{R}", cmc: 1, colors: ["R"], keywords: ["Strive"],
  oracle: "Strive — This spell costs {2}{R} more to cast for each target beyond the first.\nAny number of target creatures each get +2/+0 and gain trample until end of turn." };
const SPECTRAL_PROCESSION = { name: "Spectral Procession", type: "Sorcery", mana: "{2/W}{2/W}{2/W}", cmc: 6, colors: ["W"], keywords: [],
  oracle: "Create three 1/1 white Spirit creature tokens with flying." };
const FLAME_JAVELIN = { name: "Flame Javelin", type: "Instant", mana: "{2/R}{2/R}{2/R}", cmc: 6, colors: ["R"], keywords: [],
  oracle: "({2/R} can be paid with any two mana or with {R}. This card's mana value is 6.)\nFlame Javelin deals 4 damage to any target." };
const WILDGROWTH_ARCHAIC = { name: "Wildgrowth Archaic", type: "Creature — Avatar", mana: "{2/G}{2/G}", cmc: 4, power: 0, toughness: 0, colors: ["G"],
  keywords: ["Reach", "Converge", "Trample"], oracle: "Reach, trample\nConverge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nWhenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of colors of mana spent to cast it." };
const GRAY_OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, colors: ["R"], keywords: [], oracle: "" };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, colors: ["G"], keywords: [], oracle: "" };
// The mana-value readers of a spell on the stack.
const THOUGHTBIND = { name: "Thoughtbind", type: "Instant", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Counter target spell with mana value 4 or less." };
const DISDAINFUL_STROKE = { name: "Disdainful Stroke", type: "Instant", mana: "{1}{U}", cmc: 2, colors: ["U"], keywords: [], oracle: "Counter target spell with mana value 4 or greater." };
const SPELL_SNARE = { name: "Spell Snare", type: "Instant", mana: "{U}", cmc: 1, colors: ["U"], keywords: [], oracle: "Counter target spell with mana value 2." };
const MINOR_MISSTEP = { name: "Minor Misstep", type: "Instant", mana: "{U}", cmc: 1, colors: ["U"], keywords: [], oracle: "Counter target spell with mana value 1 or less." };
const MANA_DRAIN = { name: "Mana Drain", type: "Instant", mana: "{U}{U}", cmc: 2, colors: ["U"], keywords: [],
  oracle: "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value." };

const POOL = { W: 6, U: 6, B: 6, R: 6, G: 6, C: 6 };
const bears = (id, controller) => createPermanent({ id, card: { ...GRIZZLY_BEARS, id: `card-${id}` }, controller, summoningSick: false });

/** `seat`'s own main phase, with priority; `hand` and `pool` for that seat; both seats' battlefields. */
function mainState({ seat = "user", hand = [], pool = POOL, userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } };
  players[seat] = { ...players[seat], hand, manaPool: { ...players[seat].manaPool, ...pool } };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const castsOf = (state, seat, cardId) => filterActions(legalActionsForPlayer(state, seat), "cast-spell").filter((a) => a.cardId === cardId);

/** The AI casts `card` with the offer `pick` selects; then the user holds priority with `responses` in hand. */
function aiCastsThenUserResponds(card, pick, { responses = [], userBf = [], aiBf = [] } = {}) {
  const s = mainState({ seat: "ai", hand: [{ ...card, id: "spell" }], userBf, aiBf });
  const offer = castsOf(s, "ai", "spell").find(pick);
  expect(offer, `${card.name}: the offer under test exists`).toBeTruthy();
  const cast = dispatchAction(s, offer);
  expect(cast.stack).toHaveLength(1);
  const user = { ...cast.players.user, hand: responses.map((r, i) => ({ ...r, id: `resp-${i}` })), manaPool: { ...cast.players.user.manaPool, ...POOL } };
  return { offer, state: { ...cast, priorityHolder: "user", consecutivePasses: 0, players: { ...cast.players, user } } };
}
const counterOffers = (state, respIdx) => castsOf(state, "user", `resp-${respIdx}`).filter((a) => a.targets?.some((t) => t.type === "spell"));

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the offer's cmc is the printed mana value — kicker (CR 702.33a, 118.8d)", () => {
  it("Baloth Gorger: the kicked offer pays 8 and its cmc is 4, the same as the unkicked offer's", () => {
    const s = mainState({ hand: [{ ...BALOTH_GORGER, id: "c1" }] });
    const offers = castsOf(s, "user", "c1");
    const normal = offers.find((a) => a.kicked === false);
    const kicked = offers.find((a) => a.kicked === true);
    expect(totalCmc(kicked.cost)).toBe(8); // the kicker is still PAID
    expect({ normal: normal.cmc, kicked: kicked.cmc }).toEqual({ normal: 4, kicked: 4 });
  });

  it("Into the Roil / Galadriel's Dismissal: a kicked instant's offer keeps the printed mana value", () => {
    const s = mainState({ hand: [{ ...INTO_THE_ROIL, id: "roil" }, { ...GALADRIELS_DISMISSAL, id: "gd" }], userBf: [bears("b1", "user")], aiBf: [bears("b2", "ai")] });
    const roil = castsOf(s, "user", "roil");
    const dismissal = castsOf(s, "user", "gd");
    expect(roil.some((a) => a.kicked === true) && dismissal.some((a) => a.kicked === true)).toBe(true);
    for (const a of roil) expect(a.cmc, `Into the Roil kicked=${a.kicked}`).toBe(2);
    for (const a of dismissal) expect(a.cmc, `Galadriel's Dismissal kicked=${a.kicked}`).toBe(1);
  });

  it("Bubble Snare: a kicked Aura's offer keeps the printed mana value", () => {
    const s = mainState({ hand: [{ ...BUBBLE_SNARE, id: "snare" }], aiBf: [bears("b2", "ai")] });
    const offers = castsOf(s, "user", "snare");
    expect(offers.some((a) => a.kicked === true)).toBe(true);
    for (const a of offers) expect(a.cmc, `kicked=${a.kicked}`).toBe(1);
  });
});

describe("the offer's cmc is the printed mana value — multikicker (CR 702.33c)", () => {
  it("Everflowing Chalice: every kick count is offered at mana value 0", () => {
    const s = mainState({ hand: [{ ...EVERFLOWING_CHALICE, id: "ch" }], pool: { C: 6 } });
    const offers = castsOf(s, "user", "ch");
    expect(offers.map((a) => a.kickCount)).toEqual([0, 1, 2, 3]);
    expect(offers.map((a) => totalCmc(a.cost))).toEqual([0, 2, 4, 6]); // each kick is still paid
    expect(offers.map((a) => a.cmc)).toEqual([0, 0, 0, 0]);
  });
});

describe("the offer's cmc is the printed mana value — bestow (CR 702.103a, 118.9c)", () => {
  it("Boon Satyr: the bestow offer pays {3}{G}{G} and its cmc is the card's 3", () => {
    const s = mainState({ hand: [{ ...BOON_SATYR, id: "boon" }], userBf: [bears("b1", "user")] });
    const offers = castsOf(s, "user", "boon");
    const bestow = offers.find((a) => a.bestow);
    const creature = offers.find((a) => !a.isAuraSpell);
    expect(totalCmc(bestow.cost)).toBe(5);
    expect({ creature: creature.cmc, bestow: bestow.cmc }).toEqual({ creature: 3, bestow: 3 });
  });
});

describe("the offer's cmc is the printed mana value — strive's extra targets (CR 601.2f, 202.3)", () => {
  it("Rouse the Mob: a two-target offer pays {R} + {2}{R} and its cmc stays 1", () => {
    const s = mainState({ hand: [{ ...ROUSE_THE_MOB, id: "rm" }], userBf: [bears("b1", "user"), bears("b3", "user")] });
    const offers = castsOf(s, "user", "rm");
    const two = offers.find((a) => a.targets.length === 2);
    const one = offers.find((a) => a.targets.length === 1);
    expect(totalCmc(two.cost)).toBe(4);
    expect({ one: one.cmc, two: two.cmc }).toEqual({ one: 1, two: 1 });
  });
});

describe("a {2/X} pip counts 2 (CR 202.3f)", () => {
  it("totalCmc: {2/W} is 2, a two-colour hybrid and a Phyrexian pip are 1", () => {
    expect(totalCmc(parseManaCost("{2/W}{2/W}{2/W}"))).toBe(6);
    expect(totalCmc(parseManaCost("{1}{W/U}{W/U}"))).toBe(3); // CR 202.3f's own example
    expect(totalCmc(parseManaCost("{1}{W/P}{W/P}"))).toBe(3); // CR 202.3g's own example
    expect(totalCmc(parseManaCost("{2/B}{2/B}{2/B}"))).toBe(6); // CR 202.3f's own example
  });
  it("Spectral Procession / Flame Javelin / Wildgrowth Archaic are offered at their printed mana value", () => {
    const s = mainState({ hand: [{ ...SPECTRAL_PROCESSION, id: "sp" }, { ...FLAME_JAVELIN, id: "fj" }, { ...WILDGROWTH_ARCHAIC, id: "wa" }], aiBf: [bears("b2", "ai")] });
    expect(castsOf(s, "user", "sp").map((a) => a.cmc)).toEqual([6]);
    expect(new Set(castsOf(s, "user", "fj").map((a) => a.cmc))).toEqual(new Set([6]));
    expect(castsOf(s, "user", "wa").map((a) => a.cmc)).toEqual([4]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the AI's cast scorer reads the mana value (opponentAI.scoreCastTier)", () => {
  it("aggro: a kicked Kavu Titan is still a two-drop — it scores like the unkicked cast", () => {
    const s = mainState({ hand: [{ ...KAVU_TITAN, id: "kt" }] });
    const offers = castsOf(s, "user", "kt");
    const normal = offers.find((a) => a.kicked === false);
    const kicked = offers.find((a) => a.kicked === true);
    expect(scoreCast(kicked, KAVU_TITAN, "aggro")).toBe(scoreCast(normal, KAVU_TITAN, "aggro"));
  });
  it("aggro: a bestowed Boon Satyr scores like its creature cast", () => {
    const s = mainState({ hand: [{ ...BOON_SATYR, id: "boon" }], userBf: [bears("b1", "user")] });
    const offers = castsOf(s, "user", "boon");
    expect(scoreCast(offers.find((a) => a.bestow), BOON_SATYR, "aggro")).toBe(scoreCast(offers.find((a) => !a.isAuraSpell), BOON_SATYR, "aggro"));
  });
  it("aggro: Wildgrowth Archaic ({2/G}{2/G}, mana value 4) is not a cheap body", () => {
    const s = mainState({ hand: [{ ...WILDGROWTH_ARCHAIC, id: "wa" }] });
    const [offer] = castsOf(s, "user", "wa");
    expect(scoreCast(offer, WILDGROWTH_ARCHAIC, "aggro")).toBeGreaterThan(1); // 0 and 1 are the two- and three-drop bodies
  });
  it("aggro AI with Kavu Titan (kicker affordable) and Gray Ogre: casts the two-drop, kicked", () => {
    const s = mainState({ seat: "ai", hand: [{ ...KAVU_TITAN, id: "kt" }, { ...GRAY_OGRE, id: "go" }], pool: { G: 3, R: 2 } });
    expect(pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "aggro" })).toMatchObject({ kind: "cast-spell", cardId: "kt", kicked: true });
  });
  it("tie-break: Everflowing Chalice kicked three times (mana value 0) sorts before Mind Stone (2)", () => {
    const s = mainState({ seat: "ai", hand: [{ ...MIND_STONE, id: "ms" }, { ...EVERFLOWING_CHALICE, id: "ch" }], pool: { C: 6 } });
    expect(pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" })).toMatchObject({ kind: "cast-spell", cardId: "ch", kickCount: 3 });
  });
  it("control: an unkicked cast keeps its printed mana value (Baloth Gorger, Kavu Titan)", () => {
    const s = mainState({ hand: [{ ...BALOTH_GORGER, id: "bg" }, { ...KAVU_TITAN, id: "kt" }], pool: { G: 4 } });
    expect(castsOf(s, "user", "bg").map((a) => [a.kicked, a.cmc])).toEqual([[false, 4]]);
    expect(castsOf(s, "user", "kt").map((a) => [a.kicked, a.cmc])).toEqual([[false, 2]]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// GUARDS — a spell on the stack. These held before the fix (the stack object carries the card, never the offer's
// cmc); they pin that a kicked / bestowed / multikicked spell is countered, or not, by its PRINTED mana value.
describe("guard: the mana value of a kicked / bestowed / multikicked spell on the stack", () => {
  it("kicked Baloth Gorger (paid 8) is mana value 4: Thoughtbind counters it, Mana Drain pays {C}{C}{C}{C}", () => {
    const { state } = aiCastsThenUserResponds(BALOTH_GORGER, (a) => a.kicked === true, { responses: [THOUGHTBIND, MANA_DRAIN] });
    const tb = counterOffers(state, 0);
    expect(tb).toHaveLength(1);
    expect(stackSpellManaValue(state.stack[0])).toBe(4);
    const countered = resolveTopOfStack(dispatchAction(state, tb[0]));
    expect(countered.stack).toHaveLength(0);
    expect(countered.players.ai.graveyard.map((c) => c.name)).toEqual(["Baloth Gorger"]);
    const drained = resolveTopOfStack(dispatchAction(state, counterOffers(state, 1)[0]));
    expect((drained.delayedTriggers || []).map((r) => r.effectClause)).toEqual(["add {c}{c}{c}{c}"]);
  });
  it("control: the unkicked Baloth Gorger reads the same 4", () => {
    const { state } = aiCastsThenUserResponds(BALOTH_GORGER, (a) => a.kicked === false, { responses: [THOUGHTBIND] });
    expect(stackSpellManaValue(state.stack[0])).toBe(4);
    expect(counterOffers(state, 0)).toHaveLength(1);
  });
  it("bestowed Boon Satyr (paid 5) is mana value 3: Thoughtbind may target it, Disdainful Stroke (4 or greater) may not", () => {
    const { state } = aiCastsThenUserResponds(BOON_SATYR, (a) => a.bestow, { responses: [THOUGHTBIND, DISDAINFUL_STROKE], aiBf: [bears("b2", "ai")] });
    expect(counterOffers(state, 1)).toHaveLength(0);
    expect(counterOffers(state, 0)).toHaveLength(1);
    expect(stackSpellManaValue(state.stack[0])).toBe(3);
  });
  it("Everflowing Chalice kicked twice (paid 4) is mana value 0: Minor Misstep may target it, Spell Snare (exactly 2) may not", () => {
    const { state } = aiCastsThenUserResponds(EVERFLOWING_CHALICE, (a) => a.kickCount === 2, { responses: [MINOR_MISSTEP, SPELL_SNARE] });
    expect(counterOffers(state, 0)).toHaveLength(1);
    expect(counterOffers(state, 1)).toHaveLength(0);
    expect(stackSpellManaValue(state.stack[0])).toBe(0);
  });
});
