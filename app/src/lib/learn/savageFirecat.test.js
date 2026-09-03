/**
 * savageFirecat.test.js — CORPUS ④-I (2026-09-03 night): SAVAGE FIRECAT — "Trample / This creature enters with seven +1/+1
 * counters on it. / Whenever you tap a land for mana, remove a +1/+1 counter from this creature." Two small arms on
 * the ④-D tapped-for-mana event: the "you tap a land for mana" detector (its MANA payoffs — the doubler family — are
 * dropped at the descriptor builder, so Vorinclex's first line stays the mana model's static) and the +1/+1 spelling
 * in the self counter-removal effect. Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIRECAT = { id: "c-cat", name: "Savage Firecat", type: "Creature — Elemental Cat", mana: "{5}{R}{R}", cmc: 7, power: 0, toughness: 0, keywords: ["Trample"], oracle: "Trample\nThis creature enters with seven +1/+1 counters on it.\nWhenever you tap a land for mana, remove a +1/+1 counter from this creature." };
const DOUBLER = { id: "c-dbl", name: "Groundchuck & Dirtbag", type: "Legendary Creature — Ox Mole Mutant", mana: "{3}{G}", cmc: 4, power: 3, toughness: 3, keywords: ["Trample"], oracle: "Trample\nWhenever you tap a land for mana, add {G}." };
const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" });
const GREEN_SPELL = { id: "h-gs", name: "Synthetic Growth", type: "Sorcery", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "You gain 2 life." };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [GREEN_SPELL], graveyard: [], library: [], battlefield: [{ ...createPermanent({ id: "cat", card: FIRECAT, controller: "user" }), counters: { "+1/+1": 7 } }, createPermanent({ id: "forest", card: FOREST("c-f1"), controller: "user" })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
    },
  };
}

describe("the parse + the tiers", () => {
  it("the counter-removal effect parses with the +1/+1 spelling; the land-tap detector fires; the doubler payoff is dropped", () => {
    const p = parseEffectClause("remove a +1/+1 counter from this creature", "Creature");
    expect(p.atoms).toEqual([{ op: "remove-named-counter-self", counterType: "+1/+1", amount: 1 }]);
    const d = detectTriggers(FIRECAT).filter((x) => x.event === "tapForMana");
    expect(d.length).toBe(1);
    expect(d[0]).toMatchObject({ scope: "you", whose: "you", tappedFilter: "land" });
    expect(detectTriggers(DOUBLER).filter((x) => x.event === "tapForMana").length).toBe(0); // the doubler line is the mana model's
    expect(classifyCard(FIRECAT)).toMatch(/^native/);
    expect(classifyCard(DOUBLER)).toMatch(/^native/); // still native through the augment static — never demoted
  });
});

describe("runtime", () => {
  it("⭐ cast from hand, the Firecat enters with SEVEN +1/+1 counters (the number word the reader learned)", () => {
    const s0 = board();
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...FIRECAT, id: "h-cat" }], battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 5 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-cat");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    const cat = out.players.user.battlefield.find((p) => p.card?.name === "Savage Firecat");
    expect(cat).toBeTruthy();
    expect(cat.counters["+1/+1"]).toBe(7);
  });
  it("⭐ tapping a Forest to pay a spell removes a +1/+1 counter from the Firecat (7 → 6)", () => {
    const s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-gs");
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const out = resolveTopOfStack(cast);
    expect(out.players.user.battlefield.find((p) => p.id === "cat").counters["+1/+1"]).toBe(6);
  });
});
