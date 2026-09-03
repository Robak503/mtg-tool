/**
 * evolutionaryLeap.test.js — SG-9 (2026-09-03): Evolutionary Leap — "{G}, Sacrifice a creature: Reveal cards
 * from the top of your library until you reveal a creature card. Put that card into your hand and the rest on
 * the bottom of your library in a random order." (the Squirrel Girl deck). The reveal-until-creature frame
 * existed with an ATTACKING disposition (Raph & Mikey); this is the INTO-HAND sibling — a second exact
 * whole-string anchor and an applier that moves the found creature to hand and bottoms the revealed prefix.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LEAP = { id: "c-leap", name: "Evolutionary Leap", type: "Enchantment", mana: "{1}{G}", keywords: [], oracle: "{G}, Sacrifice a creature: Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order." };
const land = (id) => ({ id, name: "Forest", type: "Basic Land — Forest" });
const critter = (id, name) => ({ id, name, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });

describe("the parse", () => {
  it("collapses the two-sentence span to the into-hand atom", () => {
    const p = parseEffectClause("Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "reveal-until-creature-to-hand", targetType: null }]);
  });

  it("CREED — the onto-the-battlefield disposition is NOT this atom", () => {
    const p = parseEffectClause("Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.");
    expect(p.atoms.some((a) => a.op === "reveal-until-creature-to-hand")).toBe(false);
  });
});

function board(library) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, library, hand: [], graveyard: [], battlefield: [createPermanent({ id: "leap", card: LEAP, controller: "user", summoningSick: false }), createPermanent({ id: "fodder", card: critter("c-fodder", "Fodder"), controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } },
    },
  };
}
const leapAction = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "leap" && a.sacCreatureId === "fodder");

describe("runtime", () => {
  it("⭐ the first creature card goes to hand; the lands revealed before it bottom; the fodder is gone", () => {
    const s = board([land("L1"), land("L2"), critter("c-hit", "Hit"), land("L3"), critter("c-later", "Later")]);
    const act = leapAction(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.hand.map((c) => c.id)).toEqual(["c-hit"]);
    expect(out.players.user.battlefield.some((p) => p.id === "fodder")).toBe(false);
    const lib = out.players.user.library.map((c) => c.id);
    expect(lib.slice(0, 2)).toEqual(["L3", "c-later"]);
    expect(new Set(lib.slice(2))).toEqual(new Set(["L1", "L2"]));
  });

  it("no creature in the library → nothing to hand, everything revealed bottoms", () => {
    const s = board([land("L1"), land("L2")]);
    const out = resolveTopOfStack(dispatchAction(s, leapAction(s)));
    expect(out.players.user.hand).toEqual([]);
    expect(new Set(out.players.user.library.map((c) => c.id))).toEqual(new Set(["L1", "L2"]));
  });
});

describe("classification", () => {
  it("Evolutionary Leap is native", () => {
    expect(classifyCard(LEAP)).toMatch(/^native/);
  });
});
