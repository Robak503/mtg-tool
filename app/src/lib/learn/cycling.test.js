/**
 * cycling.test.js — KW-CYCLING (CR 702.29): cycling is an activated ability usable from HAND,
 * "[Cost], Discard this card: Draw a card." The from-hand activation: legalChoices offers a `cycle`
 * action for a hand card whose plain cycling cost the player can afford; the dispatcher pays the mana,
 * discards the card (hand → graveyard), and puts a draw-1 on the stack that resolves to one card.
 *
 * THE CREED: a card with a "when you cycle"/"cycles or discards" TRIGGER is NOT offered cycle (the
 * trigger is unmodeled — the trigger-compiler lane — so offering would silently drop it).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });

// A user at their main with a cycling card in hand, 2 untapped Forests, and a library to draw from.
function cyclingState({ hand, lands = [forest("L1"), forest("L2")] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const library = [{ id: "lib1", name: "Bear", type: "Creature — Bear" }, { id: "lib2", name: "Bear", type: "Creature — Bear" }];
  return {
    ...s, activePlayer: "user", priorityHolder: "user", step: "main",
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: lands, library } },
  };
}
const LAY_WASTE = { id: "cy1", name: "Lay Waste", type: "Sorcery", oracle: "Destroy target land.\nCycling {2}", mana: "{1}{R}" };

describe("KW-CYCLING — from-hand activation", () => {
  it("offers a cycle action for a hand card with an affordable cycling cost", () => {
    const cycles = filterActions(legalActionsForPlayer(cyclingState({ hand: [LAY_WASTE] }), "user"), "cycle");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ kind: "cycle", cardId: "cy1", name: "Lay Waste" });
  });

  it("cycling pays the mana, discards the card, and draws exactly one", () => {
    let state = cyclingState({ hand: [LAY_WASTE] });
    const cycle = filterActions(legalActionsForPlayer(state, "user"), "cycle")[0];
    state = dispatchAction(state, cycle);

    // discarded (cost) — out of hand, into graveyard
    expect(state.players.user.hand.some(c => c.id === "cy1")).toBe(false);
    expect(state.players.user.graveyard.some(c => c.id === "cy1")).toBe(true);
    // {2} paid — both Forests tapped
    expect(state.players.user.battlefield.every(p => p.tapped)).toBe(true);
    // the draw is on the stack; resolving it draws one
    expect(state.stack).toHaveLength(1);
    const libBefore = state.players.user.library.length;
    state = resolveTopOfStack(state);
    expect(state.players.user.library.length).toBe(libBefore - 1);
    expect(state.players.user.hand).toHaveLength(1); // discarded cy1, drew lib1
  });

  it("is NOT offered when the cycling cost is unaffordable (no mana)", () => {
    const broke = cyclingState({ hand: [LAY_WASTE], lands: [] });
    expect(filterActions(legalActionsForPlayer(broke, "user"), "cycle")).toHaveLength(0);
  });

  it("is NOT offered for a card with a 'when you cycle' trigger (unmodeled → Arbiter, no dropped trigger)", () => {
    const tusker = { id: "ct1", name: "Krosan Tusker", type: "Creature — Beast", oracle: "Cycling {2}{G}\nWhen you cycle this card, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle." };
    expect(filterActions(legalActionsForPlayer(cyclingState({ hand: [tusker] }), "user"), "cycle")).toHaveLength(0);
  });

  it("is NOT offered for the SPLIT 'when you cast OR cycle' trigger form (Warped Tusker — adversarial-review catch)", () => {
    const warped = { id: "ct2", name: "Warped Tusker", type: "Artifact Creature — Phyrexian Beast", oracle: "When you cast or cycle this card, create a 0/1 colorless Eldrazi Spawn creature token. It has \"Sacrifice this token: Add {C}.\"\nCycling {2}{G}" };
    expect(filterActions(legalActionsForPlayer(cyclingState({ hand: [warped] }), "user"), "cycle")).toHaveLength(0);
  });

  it("plain cycling is offered even beside a typecycling line; pure typecycling is not (search deferred)", () => {
    // Sheltered Thicket has BOTH plain "Cycling {2}" and Mountaincycling — the plain cycle IS offered.
    const both = { id: "tc1", name: "Sheltered Thicket", type: "Land", oracle: "Cycling {2}\nMountaincycling {2}" };
    expect(filterActions(legalActionsForPlayer(cyclingState({ hand: [both] }), "user"), "cycle")).toHaveLength(1);
    // A PURE typecycling card (no plain "Cycling {N}") is NOT offered — its library search needs the tutor atom.
    const pure = { id: "tc2", name: "Pure Typecycler", type: "Creature — Beast", oracle: "Plainscycling {2}" };
    expect(filterActions(legalActionsForPlayer(cyclingState({ hand: [pure] }), "user"), "cycle")).toHaveLength(0);
  });
});
