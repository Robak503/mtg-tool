/**
 * mindHarness.test.js — CORPUS ④-A (2026-09-03 night): an Aura's OWN "Cumulative upkeep {cost}" line composes with the
 * control-aura tier. Off the census's TWO-FLIP report: Mind Harness ("Enchant red or green creature / Cumulative
 * upkeep {1} / You control enchanted creature.") classified native with EITHER half deleted and body-only with both —
 * a tier-composition defect, not a missing mechanic. The residue walk now admits the pure-pip cumulative-upkeep
 * keyword line; the runtime already fires the synthesized upkeep trigger on any permanent and the pay-or-sacrifice
 * atom sacrifices the Aura — which detaches it and hands the creature back. Both witnessed on a board.
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { controllerOfPermanent } from "./controlMove.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HARNESS = { id: "h-mh", name: "Mind Harness", type: "Enchantment — Aura", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [], oracle: "Enchant red or green creature\nCumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nYou control enchanted creature." };
const KROVIKAN = { id: "c-kw", name: "Krovikan Whispers", type: "Enchantment — Aura", mana: "{3}{U}", keywords: [], oracle: "Enchant creature\nCumulative upkeep {U} or {B} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nYou control enchanted creature.\nWhen this Aura is put into a graveyard from the battlefield, you lose 2 life for each age counter on it." };
const OGRE = { id: "c-ogre", name: "Synthetic Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, power: 3, toughness: 3, keywords: [], colors: ["R"], oracle: "" };
const DRAKE = { id: "c-drake", name: "Synthetic Drake", type: "Creature — Drake", mana: "{2}{U}", cmc: 3, power: 2, toughness: 2, keywords: [], colors: ["U"], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [HARNESS], graveyard: [], library: [], battlefield: [], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 1 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "ogre", card: OGRE, controller: "ai", summoningSick: false }), createPermanent({ id: "drake", card: DRAKE, controller: "ai", summoningSick: false })] },
    },
  };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-mh");
const harnessOn = (s) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.card?.name === "Mind Harness");

describe("the tier", () => {
  it("Mind Harness is a native control aura; the OR-cost form (Krovikan Whispers) stays residue", () => {
    expect(classifyCard(HARNESS)).toBe("native-aura");
    expect(classifyCard(KROVIKAN)).toBe("body-only");
  });
});

describe("runtime", () => {
  it("⭐ cast on the opponent's RED creature (never the blue one): control moves; at upkeep the age counter lands and paying {1} keeps it", () => {
    const s = board();
    const offers = casts(s);
    expect(offers.some((a) => (a.targets || []).some((t) => t.id === "ogre"))).toBe(true);
    expect(offers.some((a) => (a.targets || []).some((t) => t.id === "drake"))).toBe(false);
    const cast = resolveTopOfStack(dispatchAction(s, offers.find((a) => (a.targets || []).some((t) => t.id === "ogre"))));
    expect(controllerOfPermanent(cast, "ogre")).toBe("user");
    const upkeep = { ...cast, phase: "beginning", step: "upkeep", players: { ...cast.players, user: { ...cast.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } } };
    const fired = resolveTopOfStack(flushTriggers(checkStepTriggers(upkeep, "upkeep")));
    expect(harnessOn(fired).counters?.age).toBe(1);
    expect(fired.pendingChoice).toMatchObject({ kind: "sac-unless-pay", controller: "user" });
    const paid = resolveSacUnlessPayChoice(fired, true);
    expect(harnessOn(paid)).toBeTruthy();
    expect(controllerOfPermanent(paid, "ogre")).toBe("user");
    expect(paid.players.user.manaPool.C).toBe(0);
  });

  it("⭐ declining the upkeep sacrifices the Aura and the creature goes home", () => {
    const s = board();
    const cast = resolveTopOfStack(dispatchAction(s, casts(s).find((a) => (a.targets || []).some((t) => t.id === "ogre"))));
    const upkeep = { ...cast, phase: "beginning", step: "upkeep" };
    const fired = resolveTopOfStack(flushTriggers(checkStepTriggers(upkeep, "upkeep")));
    const declined = resolveSacUnlessPayChoice(fired, false);
    expect(harnessOn(declined)).toBeUndefined();
    expect(declined.players.user.graveyard.some((c) => c.name === "Mind Harness")).toBe(true);
    expect(controllerOfPermanent(declined, "ogre")).toBe("ai");
    expect(declined.players.ai.battlefield.some((p) => p.id === "ogre")).toBe(true);
  });
});
