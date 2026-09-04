/**
 * ellieAndAlan.test.js — SHELF-85 runbook Phase 2 · K8 (2026-09-04): Ellie and Alan, Paleontologists (Kellan).
 *
 *   "{T}, Exile a creature card from your graveyard: Discover X, where X is the mana value of the exiled card. Activate
 *    only as a sorcery."
 *
 * The typed graveyard-exile cost already existed (the offer freezes the victim on exileGyIds). The dispatcher now stamps
 * the victim's mana value on state (`exiledForCost` — the same inter-atom channel sacrificedForCost uses), a countForSpec
 * kind reads it, and the discover arm "discover X, where X is the mana value of the exiled card" rides discover's
 * existing amountCount. The found card lands behind the discover park (cast it free, or to hand). Sorcery speed only.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ELLIE = { id: "c-ea", name: "Ellie and Alan, Paleontologists", type: "Legendary Creature — Human Scientist", mana: "{2}{G}{W}{U}", keywords: [], power: 4, toughness: 4,
  oracle: "{T}, Exile a creature card from your graveyard: Discover X, where X is the mana value of the exiled card. Activate only as a sorcery. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" };
const GY_THREE = { id: "gy-3", name: "Three-drop", type: "Creature — Bear", mana: "{2}{G}", cmc: 3, oracle: "", power: 3, toughness: 3 };
const GY_ZERO = { id: "gy-0", name: "Memnite-ish", type: "Artifact Creature — Construct", mana: "{0}", cmc: 0, oracle: "", power: 1, toughness: 1 };
const SIX = { id: "t-6", name: "Six-drop", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, oracle: "", power: 6, toughness: 4 };
const TWO = { id: "t-2", name: "Two-drop", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, oracle: "", power: 2, toughness: 2 };
const ISLAND = { id: "t-isl", name: "Island", type: "Basic Land — Island", oracle: "" };
const filler = { id: "f", name: "Filler", type: "Creature — Bear", mana: "{3}", cmc: 3, oracle: "", power: 1, toughness: 1 };

const board = (gy, top, phase = "precombat-main") => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase, step: phase === "precombat-main" ? "main" : phase, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand: [], graveyard: gy, library: [...top, filler], battlefield: [createPermanent({ id: "EA", card: ELLIE, controller: "user", summoningSick: false })] } } };
};
const activation = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "EA");

describe("parse", () => {
  it("the activation is modeled: the typed graveyard-exile cost, sorcery speed, discover sized by the exiled card", () => {
    const [a] = parseActivatedAbilities(ELLIE);
    expect(a.modeled).toBe(true);
    expect(a.sorceryOnly).toBe(true);
    expect(a.program.atoms).toEqual([{ op: "discover", amountCount: { kind: "exiledForCostManaValue" }, targetType: null }]);
    expect(countForSpec({ exiledForCost: { manaValue: 3 } }, { controller: "user" }, { kind: "exiledForCostManaValue" })).toBe(3);
    expect(countForSpec({}, { controller: "user" }, { kind: "exiledForCostManaValue" })).toBe(0);
  });
});

describe("runtime", () => {
  it("exiling a 3-drop: the dig skips a 6-drop and a land, finds the 2-drop, and parks it; cast free or to hand", () => {
    let s = board([GY_THREE], [SIX, ISLAND, TWO]);
    const act = activation(s);
    expect(act).toBeTruthy();
    expect(act.exileGyIds).toEqual(["gy-3"]);
    s = dispatchAction(s, act);
    expect(s.exiledForCost).toEqual({ manaValue: 3, cardId: "gy-3" });
    expect(s.players.user.exile.some((c) => c.id === "gy-3")).toBe(true);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingDiscover?.cardId).toBe("t-2");
    expect(s.players.user.exile.some((c) => c.id === "t-2")).toBe(true);
    // the six-drop and the Island were exiled past and bottomed; the filler is now the top
    expect(s.players.user.library[0].id).toBe("f");
    expect(s.players.user.library.slice(1).map((c) => c.id).sort()).toEqual(["t-6", "t-isl"]);
    const acts = legalActionsForPlayer(s, "user");
    expect(acts.some((a) => a.kind === "cast-spell" && a.cardId === "t-2" && a.fromZone === "exile")).toBe(true);
    const toHand = acts.find((a) => a.kind === "discover-to-hand" && a.cardId === "t-2");
    expect(toHand).toBeTruthy();
    const h = dispatchAction(s, toHand);
    expect(h.players.user.hand.some((c) => c.id === "t-2")).toBe(true);
  });
  it("a zero-value victim discovers 0: only a 0-drop can be found; a 2-drop top is bottomed and nothing is parked", () => {
    let s = board([GY_ZERO], [TWO]);
    s = dispatchAction(s, activation(s));
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingDiscover).toBeUndefined();
    expect(s.players.user.library.at(-1).id).toBe("t-2");
  });
  it("sorcery speed and a creature in the yard are both required for the offer", () => {
    expect(activation(board([], [TWO]))).toBeUndefined();
    expect(activation(board([GY_THREE], [TWO], "combat-damage"))).toBeUndefined();
  });
});

describe("classifier", () => {
  it("Ellie and Alan is native-activated", () => {
    expect(classifyCard(ELLIE)).toBe("native-activated");
  });
});
