/**
 * SAMWISE GAMGEE — SHELF-85 · Bumble Flower F6 (2026-09-05). "Whenever another nontoken creature you control enters,
 * create a Food token. / Sacrifice three Foods: Return target historic card from your graveyard to your hand." The Food
 * trigger and the sacrifice-three-Foods cost were already modelled; the graveyard return parked on ONE word — "historic"
 * (CR 205.4h: an artifact, a legendary, or a Saga) was not in the graveyard filter vocabulary. It is a whole token now,
 * matched off the front-face type line by any of its three words.
 *
 * Mutation-checked: see the run ledger (docs-sk69).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseGraveyardFilter, cardMatchesGraveyardFilter } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SAMWISE = { name: "Samwise Gamgee", type: "Legendary Creature — Halfling Peasant", mana: "{G}{W}", keywords: [], power: 1, toughness: 2, oracle: "Whenever another nontoken creature you control enters, create a Food token.\nSacrifice three Foods: Return target historic card from your graveyard to your hand." };
const perm = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
const food = (id) => perm(id, { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", token: true });
const GY = [
  { id: "g-art", name: "Sol Ring", type: "Artifact", cmc: 1 },
  { id: "g-leg", name: "Frodo, Determined Hero", type: "Legendary Creature — Halfling", cmc: 2 },
  { id: "g-saga", name: "The Battle of Bywater", type: "Enchantment — Saga", cmc: 3 },
  { id: "g-bear", name: "Grizzly Bears", type: "Creature — Bear", cmc: 2 },
  { id: "g-bolt", name: "Lightning Bolt", type: "Instant", cmc: 1 },
];
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, battlefield: [perm("sam", SAMWISE), food("f1"), food("f2"), food("f3")], graveyard: GY.map((c) => ({ ...c })) } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }

describe("the filter word", () => {
  it("'historic' parses as a whole token; it matches an artifact, a legendary, and a Saga in the graveyard and nothing else; Samwise classifies native-mixed", () => {
    const tok = parseGraveyardFilter("historic");
    const row = { tok, matches: GY.map((c) => [c.name, cardMatchesGraveyardFilter(c, tok)]), union: parseGraveyardFilter("historic or creature"), tier: classifyCard(SAMWISE) };
    console.log("  WITNESS samwiseFilter", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tok).toBe("historic");
    expect(row.matches).toEqual([["Sol Ring", true], ["Frodo, Determined Hero", true], ["The Battle of Bywater", true], ["Grizzly Bears", false], ["Lightning Bolt", false]]);
    expect(row.union).toBe("historic|creature".split("|").sort().join("|")); // a union with a basic type still sorts and joins — the matcher reads each member
    expect(row.tier).toBe("native-mixed");
  });
});

describe("the activation", () => {
  it("with three Foods, the ability is offered ONLY at the historic cards; activating at the Saga sacrifices the three Foods and returns it to hand", () => {
    const s0 = state();
    const acts = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "sam");
    const offered = acts.map((a) => a.targetName).sort();
    const atSaga = acts.find((a) => a.targetName === "The Battle of Bywater");
    expect(atSaga).toBeTruthy();
    const s1 = drain(dispatchAction(s0, atSaga));
    const row = { offered, hand: s1.players.user.hand.map((c) => c.name), foodsLeft: s1.players.user.battlefield.filter((p) => p.card?.name === "Food").length, gyLeft: s1.players.user.graveyard.length };
    console.log("  WITNESS samwiseActivate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["Frodo, Determined Hero", "Sol Ring", "The Battle of Bywater"]);
    expect(row.hand).toEqual(["The Battle of Bywater"]);
    expect(row.foodsLeft).toBe(0);
    expect(row.gyLeft).toBe(4); // the four remaining cards — sacrificed tokens cease to exist (CR 111.7), they never sit in the graveyard
  });
});
