/**
 * lostManaBecomesColorless.test.js — "If you would lose unspent mana, that mana becomes colorless instead." (Horizon Stone,
 * Kruphix, God of Horizons — the 09-06 plan's stage ③, census row ⑳, 2026-09-30).
 *
 * Both cards sat in cardEffects' name-keyed registry as "keeps every colour": Kruphix's entry quoted a line the card never
 * printed, and Horizon Stone's called itself an approximation. The line is read from the Oracle now (staticAbilityParser's
 * lostManaBecomesColorless), and gameEngine.emptyManaPools — the single CR 500.4 drain — keeps the mana a player would lose, as
 * {C}. From the bundled rulings: restrictions or riders stay with that mana, and once the permanent is gone the mana is lost at
 * the next drain.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, emptyManaPools, finishCleanupActions, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const STONE = { name: "Horizon Stone", type: "Artifact", mana: "{5}", oracle: "If you would lose unspent mana, that mana becomes colorless instead." };
const KRUPHIX = { name: "Kruphix, God of Horizons", type: "Legendary Enchantment Creature — God", mana: "{3}{G}{U}", power: 4, toughness: 7,
  oracle: "Indestructible\nAs long as your devotion to green and blue is less than seven, Kruphix isn't a creature.\nYou have no maximum hand size.\nIf you would lose unspent mana, that mana becomes colorless instead." };
const OMNATH = { name: "Omnath, Locus of Mana", type: "Legendary Creature — Elemental", mana: "{2}{G}", power: 1, toughness: 1,
  oracle: "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have." };
const MIND_STONE = { id: "card-mind", name: "Mind Stone", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const MYR_SIRE = { id: "card-myr", name: "Myr Sire", type: "Artifact Creature — Phyrexian Myr", mana: "{2}", power: 1, toughness: 1,
  oracle: "When this creature dies, create a 1/1 colorless Phyrexian Myr artifact creature token." };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const ONLY_CREATURES = { castTypes: ["creature"] }; // "Spend this mana only to cast creature spells."
const perm = (card, id, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });
function game({ user = [], pool = {}, aiPool = {}, hand = [], restricted } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...EMPTY, ...pool }, ...(restricted ? { restrictedMana: restricted } : {}) },
      ai: { ...s.players.ai, manaPool: { ...EMPTY, ...aiPool } } } };
}
// Walk the turn with the engine's own transition — advanceStep drains the pools as each step ends — until `phase` is reached.
function advanceTo(s0, phase) {
  let s = s0;
  for (let i = 0; i < 20 && s.phase !== phase; i++) s = advanceStep(s);
  expect(s.phase).toBe(phase);
  return { ...s, priorityHolder: s.activePlayer };
}
const castOf = (s, name) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === name);

describe("classification", () => {
  it("Horizon Stone and Kruphix read the line from the Oracle → native", () => {
    expect(classifyCard(STONE)).toMatch(/^native-/);
    expect(classifyCard(KRUPHIX)).toMatch(/^native-/);
  });

  it("the coloured conversions stay residue — Omnath, Locus of All's black and Ozai's red are not colorless", () => {
    for (const oracle of ["If you would lose unspent mana, that mana becomes black instead.", "If you would lose unspent mana, that mana becomes red instead."]) {
      expect(parseStaticAbilities({ name: "Probe", type: "Artifact", mana: "{3}", oracle })).toEqual([]);
    }
  });
});

describe("RUNTIME — the mana a player would lose stays, as colorless", () => {
  it("VACUITY CONTROL — no Horizon Stone: floating {R}{R}{G} is gone when the step ends", () => {
    expect(emptyManaPools(game({ pool: { R: 2, G: 1 } })).players.user.manaPool).toEqual(EMPTY);
  });

  it("⭐ Horizon Stone: floating {R}{R}{G} stays as {C}{C}{C} — the same amount, no colours", () => {
    const pool = emptyManaPools(game({ user: [perm(STONE, "hs")], pool: { R: 2, G: 1 } })).players.user.manaPool;
    expect(pool).toEqual({ ...EMPTY, C: 3 });
    console.log(`WITNESS stoneDrain ${JSON.stringify(pool)}`);
  });

  it("⭐ the carried {C}{C} casts Mind Stone in the second main phase; without the Stone there is nothing to cast with", () => {
    const run = (withStone) => {
      const s0 = game({ user: withStone ? [perm(STONE, "hs")] : [], pool: { R: 2 }, hand: [MIND_STONE] });
      const s = advanceTo(s0, "postcombat-main");
      return { s, cast: castOf(s, "Mind Stone") };
    };
    const off = run(false);
    expect(off.s.players.user.manaPool).toEqual(EMPTY);
    expect(off.cast).toBeUndefined();
    const on = run(true);
    expect(on.s.players.user.manaPool).toEqual({ ...EMPTY, C: 2 });
    expect(on.cast).toBeDefined();
    const after = resolveTopOfStack(dispatchAction(on.s, on.cast));
    expect(after.players.user.battlefield.map((p) => p.card.name)).toContain("Mind Stone");
    expect(after.players.user.manaPool).toEqual(EMPTY);
  });

  it("⭐ it lasts across turns: the {C} survives cleanup and the next turn's drains", () => {
    let s = game({ user: [perm(STONE, "hs")], pool: { U: 1 } });
    s = finishCleanupActions(advanceTo(s, "ending"));
    for (let i = 0; i < 20 && s.turn === 3; i++) s = advanceStep(s);
    s = advanceTo(s, "precombat-main");
    expect(s.turn).toBe(4);
    expect(s.players.user.manaPool).toEqual({ ...EMPTY, C: 1 });
  });

  it("⭐ Kruphix's printed line does the same (and it is the controller's: the AI's mana still empties)", () => {
    const out = emptyManaPools(game({ user: [perm(KRUPHIX, "kr")], pool: { U: 2, B: 1 }, aiPool: { G: 3 } })).players;
    expect(out.user.manaPool).toEqual({ ...EMPTY, C: 3 });
    expect(out.ai.manaPool).toEqual(EMPTY);
  });

  it("⭐ with Omnath: the green is never lost, so it stays GREEN; only the blue turns colorless", () => {
    const pool = emptyManaPools(game({ user: [perm(OMNATH, "om"), perm(STONE, "hs")], pool: { G: 2, U: 1 } })).players.user.manaPool;
    expect(pool).toEqual({ ...EMPTY, G: 2, C: 1 });
  });

  it("the Stone gone: the next drain loses the mana as normal (the ruling)", () => {
    const s = emptyManaPools(game({ user: [perm(STONE, "hs")], pool: { R: 2 } }));
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(emptyManaPools(gone).players.user.manaPool).toEqual(EMPTY);
  });
});

describe("RUNTIME — restricted mana keeps its restriction when it turns colorless (both cards' rulings)", () => {
  it("VACUITY CONTROL — no Stone: a creature-only entry is dropped at the step end", () => {
    const s = emptyManaPools(game({ restricted: [{ pool: { ...EMPTY, R: 2 }, restriction: ONLY_CREATURES }] }));
    expect(s.players.user.restrictedMana).toEqual([]);
  });

  it("⭐ under the Stone the entry stays as {C}{C}, still creature-only: Myr Sire is castable with it, Mind Stone is not", () => {
    let s = game({ user: [perm(STONE, "hs")], hand: [MYR_SIRE, MIND_STONE], restricted: [{ pool: { ...EMPTY, R: 2 }, restriction: ONLY_CREATURES }] });
    s = advanceTo(s, "postcombat-main");
    expect(s.players.user.restrictedMana).toEqual([{ pool: { ...EMPTY, C: 2 }, restriction: ONLY_CREATURES }]);
    expect(s.players.user.manaPool).toEqual(EMPTY);
    expect(castOf(s, "Mind Stone")).toBeUndefined();
    const cast = castOf(s, "Myr Sire");
    expect(cast).toBeDefined();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.players.user.battlefield.map((p) => p.card.name)).toContain("Myr Sire");
    expect(after.players.user.restrictedMana || []).toEqual([]);
  });

  it("⭐ an until-end-of-turn hold: kept as it is at a step end, then at cleanup it stays colorless instead of dropping", () => {
    const held = { pool: { ...EMPTY, G: 3 }, restriction: ONLY_CREATURES, holdUntilEndOfTurn: true };
    const stepEnd = emptyManaPools(game({ user: [perm(STONE, "hs")], restricted: [held] }));
    expect(stepEnd.players.user.restrictedMana).toEqual([held]);
    expect(finishCleanupActions(stepEnd).players.user.restrictedMana).toEqual([{ pool: { ...EMPTY, C: 3 }, restriction: ONLY_CREATURES }]);
    const without = emptyManaPools(game({ restricted: [held] }));
    expect(finishCleanupActions(without).players.user.restrictedMana).toEqual([]);
  });
});
