/**
 * keyToTheVault.test.js — SHELF-85 runbook Phase 2 · K8 (2026-09-04): The Key to the Vault (Kellan).
 *
 *   "Whenever equipped creature deals combat damage to a player, look at that many cards from the top of your library.
 *    You may exile a nonland card from among them. Put the rest on the bottom of your library in a random order. You may
 *    cast the exiled card without paying its mana cost.
 *    Equip {2}{U}"
 *
 * The impulse-dig pause sized by a trigger-context magnitude (countContext "combatDamageAmount" — the same magnitude the
 * rad/enrage counters read), a nonland pool, the rest bottomed at random, and the pick parked behind the DISCOVER decision
 * with a leave-exiled decline: the free cast is offered as the ability resolves (exactly what the discover park models),
 * and declining leaves the card in exile — never in hand, never a this-turn window.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KEY = { id: "c-key", name: "The Key to the Vault", type: "Legendary Artifact — Equipment", mana: "{1}{U}", keywords: [],
  oracle: "Whenever equipped creature deals combat damage to a player, look at that many cards from the top of your library. You may exile a nonland card from among them. Put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.\nEquip {2}{U}" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const ISLAND_CARD = { id: "c-isl", name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" };
const WURM = { id: "c-wurm", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", oracle: "", power: 6, toughness: 4 };
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 1, toughness: 1 });
const ATOM = { op: "impulse-dig", countContext: "combatDamageAmount", keep: 1, restTo: "bottom", restOrder: "random", chosenTo: "freeCastExile", filter: { nonland: true } };

const board = (top) => {
  let s = createGameState({ userDeck: [], aiDeck: [filler("a1")] });
  return { ...s, phase: "combat-damage", step: "combat-damage", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players, user: { ...s.players.user, hand: [], library: [...top, filler("x1"), filler("x2")], battlefield: [createPermanent({ id: "K", card: KEY, controller: "user" })] } } };
};

describe("parse", () => {
  it("the trigger's effect is a damage-sized dig with a free-cast park", () => {
    const t = detectTriggers(KEY);
    expect(t.map((x) => x.event)).toEqual(["combatDamageToPlayer"]);
    const r = parseEffectClause(t[0].effectClause, "Artifact");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([ATOM]);
  });
});

describe("runtime", () => {
  it("three damage: looks at three, offers the nonland ones; the pick parks behind the free-cast decision, the rest go to the bottom", () => {
    let s = board([BEAR, ISLAND_CARD, WURM]);
    s = ATOM_RESOLVERS["impulse-dig"](s, ATOM, { controller: "user", sourceId: "K", combatDamageAmount: 3 });
    expect(s.pendingChoice?.kind).toBe("impulse-dig");
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["c-bear", "c-wurm"]);
    s = resolveImpulseDigChoice(s, "c-wurm");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.exile.some((c) => c.id === "c-wurm")).toBe(true);
    expect(s.pendingDiscover).toEqual({ controller: "user", cardId: "c-wurm", mv: null, declineTo: "exile" });
    // the other two looked-at cards went to the bottom; the two fillers are now the top
    expect(s.players.user.library.slice(0, 2).map((c) => c.id)).toEqual(["x1", "x2"]);
    expect(s.players.user.library.slice(2).map((c) => c.id).sort()).toEqual(["c-bear", "c-isl"]);
    // the decision: a FREE cast of the six-drop from exile with no lands, or leave it exiled
    const acts = legalActionsForPlayer(s, "user");
    const free = acts.find((a) => a.kind === "cast-spell" && a.cardId === "c-wurm");
    expect(free).toBeTruthy();
    expect(free.fromZone).toBe("exile");
    const leave = acts.find((a) => a.kind === "discover-to-hand" && a.cardId === "c-wurm");
    expect(leave?.leaveExiled).toBe(true);
    // decline: the card STAYS in exile and the park clears
    const declined = dispatchAction(s, leave);
    expect(declined.pendingDiscover).toBeUndefined();
    expect(declined.players.user.exile.some((c) => c.id === "c-wurm")).toBe(true);
    expect(declined.players.user.hand.some((c) => c.id === "c-wurm")).toBe(false);
    // accept: the Wurm resolves onto the battlefield for free
    let cast = dispatchAction(s, free);
    while (cast.stack.length && !cast.pendingChoice) cast = resolveTopOfStack(cast);
    expect(cast.pendingDiscover).toBeUndefined();
    expect(cast.players.user.battlefield.some((p) => p.card?.id === "c-wurm")).toBe(true);
  });
  it("one damage: looks at one; an all-land look never pauses and bottoms the card; zero damage is a no-op", () => {
    let s = board([ISLAND_CARD, BEAR]);
    s = ATOM_RESOLVERS["impulse-dig"](s, ATOM, { controller: "user", sourceId: "K", combatDamageAmount: 1 });
    expect(s.pendingChoice).toBeFalsy();
    expect(s.pendingDiscover).toBeUndefined();
    expect(s.players.user.library[0].id).toBe("c-bear"); // the Island went to the bottom
    expect(s.players.user.library.at(-1).id).toBe("c-isl");
    const z = ATOM_RESOLVERS["impulse-dig"](board([BEAR]), ATOM, { controller: "user", sourceId: "K", combatDamageAmount: 0 });
    expect(z.pendingChoice).toBeFalsy();
    expect(z.players.user.library[0].id).toBe("c-bear");
  });
});

describe("classifier", () => {
  it("The Key to the Vault is native-mixed", () => {
    expect(classifyCard(KEY)).toBe("native-mixed");
  });
});
