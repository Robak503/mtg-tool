/**
 * perEachCostReduction.test.js — "This spell costs {1} less to cast FOR EACH <thing>" was not a shape the
 * self-metric cost table could express, so it reduced NOTHING. Blasphemous Act — a Commander staple that
 * usually costs about {R} — was being offered at its full {8}{R}.
 *
 * Every entry in SELF_COST_METRICS is the "{X} less to cast, WHERE X IS <metric>" form: one number, one
 * regex, one kind. The per-each form is a per-unit TIMES A COUNT, which that table has no way to carry, so
 * the clause fell straight through to null and the spell paid full price.
 *
 * ⭐ REUSES parseSelfCountSource RATHER THAN GROWING A SECOND COUNT VOCABULARY. Every source that vocabulary
 * admits already carries its own exactness argument, and the evaluator this metric reaches — countForSpec —
 * is the SAME dispatcher already imported at this call site for greatestPowerYouControl, and the same one
 * the layer-7c P/T lane reads. So the cost path and the P/T path cannot disagree about what a count source
 * means. An unmodeled source returns null and the card parks: "for each creature in your PARTY" has no
 * evaluator, so Shatterskull Minotaur and Coveted Prize are untouched. Pinned.
 *
 * ⛔ AFFINITY IS NOT AFFECTED, AND THAT WAS THE THING TO CHECK BEFORE BUILDING. Myr Enforcer, Broodstar,
 * Furnace Dragon and ~30 others print exactly this sentence — inside REMINDER TEXT for the affinity keyword.
 * `selfCostReductionMetric` strips parentheses (CR 207.2) before matching, so those cards yield null here
 * and cannot be reduced twice. Pinned, because a double-reduction on affinity would have been a silent
 * mana-cost error across a large, popular slice of the corpus.
 *
 * ⓘ ZERO TIER MOVEMENT, deliberately shipped anyway: flip-diff 0/0/0. The three cards this actually pays
 * out on (Blasphemous Act, Vanquish the Horde, Overwhelming Remorse) were ALREADY native — they were simply
 * being cast at the wrong price. The carriers that would flip (Karador, Nemesis of Mortals, Hollow Marauder)
 * are each blocked by a DIFFERENT second line, so this buys correctness rather than coverage.
 *
 * ⚠️ Two harness misses before the first honest row, both recorded: the action list keys on `kind`, not
 * `type`, and a castable card needs an `id` plus `phase: "precombat-main"` and a stocked `manaPool`. Both
 * produced "NO CAST OFFERED" at EVERY arity — a uniform negative that reads exactly like a working feature
 * finding nothing. The 0-creature row below is the witness: it must show FULL price, or the harness is lying.
 *
 * Mutation-checked (2026-08-04, grep-verified as applied): the per-each branch removed -> every cost pin red
 * while the affinity and party guards stay green (they assert absence, and absence is the unfixed state).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { selfCostReductionMetric } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BLASPHEMOUS_ACT = { id: "act1", name: "Blasphemous Act", type: "Sorcery", mana: "{8}{R}",
  oracle: "This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature." };
const KARADOR = { id: "kar1", name: "Karador, Ghost Chieftain", type: "Legendary Creature — Centaur Spirit", mana: "{5}{B}{G}{W}",
  power: 3, toughness: 4, oracle: "This spell costs {1} less to cast for each creature card in your graveyard.\nOnce during each of your turns, you may cast a creature spell from your graveyard." };
const MYR_ENFORCER = { id: "myr1", name: "Myr Enforcer", type: "Artifact Creature — Myr", mana: "{7}", power: 4, toughness: 4,
  oracle: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)" };
const SHATTERSKULL = { id: "sk1", name: "Shatterskull Minotaur", type: "Creature — Minotaur Warrior", mana: "{5}{R}", power: 5, toughness: 4,
  oracle: "This spell costs {1} less to cast for each creature in your party. (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)\nHaste" };

const bear = (id, controller = "user") => ({ id, card: { name: `Bear${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });

function castOf(card, { mine = 0, theirs = 0, graveyard = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: Array.from({ length: mine }, (_, i) => bear(`b${i}`)), graveyard,
        hand: [card], manaPool: { ...s0.players.user.manaPool, R: 99, B: 99, G: 99, W: 99, C: 99 } },
      ai: { ...s0.players.ai, battlefield: Array.from({ length: theirs }, (_, i) => bear(`x${i}`, "ai")) } } };
  return legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === card.id);
}

describe("the metric now carries a per-unit and a count", () => {
  it("Blasphemous Act parses to a per-each count", () => {
    expect(selfCostReductionMetric(BLASPHEMOUS_ACT)).toEqual({ kind: "perEachCount", per: 1,
      countSpec: { kind: "subtypeOnBattlefield", subtype: "Creature", excludeSelf: false } });
  });

  it("a graveyard-scaled carrier parses too", () => {
    expect(selfCostReductionMetric(KARADOR)).toEqual({ kind: "perEachCount", per: 1,
      countSpec: { kind: "cardsInGraveyard", cardType: "creature" } });
  });

  it("⛔ AFFINITY reminder text yields NOTHING — a double-reduction would be a silent mana error", () => {
    expect(selfCostReductionMetric(MYR_ENFORCER)).toBeNull();
  });

  it("⛔ an unmodeled count source (party) yields nothing and the card is untouched", () => {
    expect(selfCostReductionMetric(SHATTERSKULL)).toBeNull();
  });
});

describe("⭐ LAW 6 — driven at a real cast, through legalActionsForPlayer", () => {
  it("the harness itself is honest: with nothing on the battlefield, the spell is offered at FULL price", () => {
    // The witness row. Two harness bugs (the action key is `kind` not `type`; a castable card needs an id,
    // precombat-main, and a stocked pool) both produced "no cast" at EVERY arity — a uniform negative that
    // reads exactly like a working feature finding nothing. If this row ever stops showing {8}, stop reading
    // the rows below as evidence.
    expect(castOf(BLASPHEMOUS_ACT, { mine: 0 }).cost.generic).toBe(8);
  });

  it("each creature shaves exactly {1} of GENERIC", () => {
    expect(castOf(BLASPHEMOUS_ACT, { mine: 4 }).cost.generic).toBe(4);
    expect(castOf(BLASPHEMOUS_ACT, { mine: 8 }).cost.generic).toBe(0);
  });

  it("⛔ the COLORED pip is never reduced (CR 202.3) — only generic moves", () => {
    for (const mine of [0, 4, 8, 12]) expect(castOf(BLASPHEMOUS_ACT, { mine }).cost.R).toBe(1);
  });

  it("⛔ the reduction floors at zero — a huge board does not make mana", () => {
    expect(castOf(BLASPHEMOUS_ACT, { mine: 12 }).cost.generic).toBe(0);
  });

  it("⭐ 'on the battlefield' counts EVERY player's creatures, as printed", () => {
    expect(castOf(BLASPHEMOUS_ACT, { mine: 2, theirs: 3 }).cost.generic).toBe(3);
  });

  it("⛔ a party carrier is offered at full price (no evaluator, no discount)", () => {
    expect(castOf(SHATTERSKULL, { mine: 4 }).cost.generic).toBe(5);
  });
});
