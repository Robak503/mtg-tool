/**
 * tasigur.test.js — SHELF-85 runbook Phase 2 · T7 (2026-09-04): Tasigur, the Golden Fang (Teval).
 *
 *   "Delve
 *    {2}{G/U}{G/U}: Mill two cards, then return a nonland card of an opponent's choice from your graveyard to your hand."
 *
 * The non-targeted single return (④-AA) chose at resolution through the milled-pick pause aimed at the controller.
 * Tasigur hands the choice to an OPPONENT: the pause is aimed at the controller's first opponent (CR 608.2c) with
 * `owner` = the controller, so the pick still leaves the controller's graveyard for the controller's hand. Candidates
 * are ordered worst-first (lowest mana value) so the AI driver's deterministic first pick is the least-wanted card.
 * "nonland" joined the graveyard-filter vocabulary as the one admitted negation (front face is not a Land).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveMilledPickChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseGraveyardFilter, cardMatchesGraveyardFilter } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TASIGUR = { id: "c-tas", name: "Tasigur, the Golden Fang", type: "Legendary Creature — Human Shaman", keywords: ["Delve"], power: 4, toughness: 5, mana_cost: "{5}{B}", cmc: 6,
  oracle: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\n{2}{G/U}{G/U}: Mill two cards, then return a nonland card of an opponent's choice from your graveyard to your hand." };
const EFFECT = "Mill two cards, then return a nonland card of an opponent's choice from your graveyard to your hand.";

const forest = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl });
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", cmc: 1, mana_cost: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const BIG = { id: "big", name: "Colossal Dreadmaw", type: "Creature — Dinosaur", cmc: 6, mana_cost: "{4}{G}{G}", power: 6, toughness: 6, oracle: "Trample" };
const MID = { id: "mid", name: "Cultivate", type: "Sorcery", cmc: 3, mana_cost: "{2}{G}", oracle: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle." };
const SWAMP = { id: "gy-swamp", name: "Swamp", type: "Basic Land — Swamp", cmc: 0, oracle: "{T}: Add {B}." };

/** `ctrl` controls Tasigur + four Forests; their library is [BOLT, BIG] (both milled) and their graveyard starts with SWAMP + MID. */
function board(ctrl, { graveyard = [SWAMP, MID], library = [BOLT, BIG] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const other = ctrl === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: ctrl, priorityHolder: ctrl, consecutivePasses: 0, turn: 6,
    players: { ...s.players,
      [ctrl]: { ...s.players[ctrl], battlefield: [createPermanent({ id: "TAS", card: TASIGUR, controller: ctrl, summoningSick: false }), forest("L1", ctrl), forest("L2", ctrl), forest("L3", ctrl), forest("L4", ctrl)], library, graveyard, hand: [] },
      [other]: { ...s.players[other], battlefield: [forest("O1", other)], library: [{ id: "olib", name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }], graveyard: [{ id: "o-gy", name: "Opt", type: "Instant", cmc: 1, oracle: "Scry 1. Draw a card." }], hand: [] } } };
}
const activation = (s, ctrl) => legalActionsForPlayer(s, ctrl).find((a) => a.kind === "activate-ability" && a.permanentId === "TAS");
function activate(s, ctrl) {
  const act = activation(s, ctrl);
  expect(act).toBeTruthy();
  s = dispatchAction(s, act);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
}

describe("parse", () => {
  it("mill two, then the non-targeted nonland return with the opponent as chooser", () => {
    const atoms = parseEffectClause(EFFECT, "Creature").atoms;
    expect(atoms).toEqual([
      { op: "mill", amount: 2, who: "controller", targetType: null },
      { op: "return-from-graveyard-pick", cardFilter: "nonland", targetType: null, chooser: "opponent" },
    ]);
  });
  it("without the rider the pick has no chooser (the ④-AA shape is unchanged)", () => {
    expect(parseEffectClause("Return a creature card from your graveyard to your hand.", "Instant").atoms).toEqual([
      { op: "return-from-graveyard-pick", cardFilter: "creature", targetType: null },
    ]);
  });
  it("'nonland' is the one admitted negation; other negations and intersections still park", () => {
    expect(parseGraveyardFilter("nonland")).toBe("nonland");
    expect(parseGraveyardFilter("noncreature")).toBeNull();
    expect(parseGraveyardFilter("nonland permanent")).toBeNull();
    expect(cardMatchesGraveyardFilter(BOLT, "nonland")).toBe(true);
    expect(cardMatchesGraveyardFilter(SWAMP, "nonland")).toBe(false);
    // Front face only (CR 712.4a): a Land // Creature MDFC is a land in the graveyard.
    expect(cardMatchesGraveyardFilter({ name: "Westvale Abbey // Ormendahl", type: "Land // Legendary Creature — Demon" }, "nonland")).toBe(false);
  });
});

describe("runtime — the opponent chooses which nonland card comes back", () => {
  it("user activates: the AI is the chooser, the candidates are worst-first, and the pick lands in the USER's hand", () => {
    let s = board("user");
    s = activate(s, "user");
    expect(s.players.user.library).toHaveLength(0); // milled two
    expect(s.pendingChoice).toMatchObject({ kind: "milled-pick", controller: "ai", owner: "user", toZone: "hand" });
    // nonland only (the Swamp is out), lowest mana value first: Bolt (1) · Cultivate (3) · Dreadmaw (6)
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["bolt", "mid", "big"]);
    // The AI driver's deterministic pick is the FIRST candidate — settle the same way (a null submit = first).
    s = resolveMilledPickChoice(s, null);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["bolt"]);
    expect(s.players.user.graveyard.map((c) => c.id).sort()).toEqual(["big", "gy-swamp", "mid"]);
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["o-gy"]);
  });
  it("AI activates: the USER is the chooser and their explicit pick goes to the AI's hand", () => {
    let s = board("ai");
    s = activate(s, "ai");
    expect(s.pendingChoice).toMatchObject({ kind: "milled-pick", controller: "user", owner: "ai" });
    s = resolveMilledPickChoice(s, "mid");
    expect(s.players.ai.hand.map((c) => c.id)).toEqual(["mid"]);
    expect(s.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["big", "bolt", "gy-swamp"]);
    expect(s.players.user.hand).toHaveLength(0);
  });
  it("a lone nonland candidate needs no choice — it comes straight back", () => {
    let s = board("user", { graveyard: [SWAMP], library: [SWAMP, BOLT].map((c, i) => ({ ...c, id: c.id + "-lib" + i })) });
    s = activate(s, "user");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]);
  });
  it("no nonland card at all — a logged no-op, no pause", () => {
    let s = board("user", { graveyard: [SWAMP], library: [{ ...SWAMP, id: "s1" }, { ...SWAMP, id: "s2" }] });
    s = activate(s, "user");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.graveyard).toHaveLength(3);
  });
});

describe("classifier", () => {
  it("Tasigur is native-activated (delve credited, the ability modeled)", () => {
    expect(classifyCard(TASIGUR)).toBe("native-activated");
  });
});
