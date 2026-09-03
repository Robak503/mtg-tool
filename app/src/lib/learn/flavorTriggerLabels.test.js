/**
 * flavorTriggerLabels.test.js — ④-AL (2026-09-03 night): thirty-four Universes-Beyond FLAVOR words join the measured
 * trigger-label list (triggers.js FLAVOR_TRIGGER_LABELS). CR 207.2d: a flavor word "provide[s] a flavorful description"
 * and has "no special rules meaning" — but the CR lists none, so the detector keeps a MEASURED list (its comment records
 * why a blanket strip is forbidden: "Max speed", "Solved" and Saga chapters look the same and carry rules meaning). The
 * census found 264 flavor-labelled trigger lines on parked cards, 263 distinct words; stripping each in turn flipped
 * exactly 34, each verified as a flavor word before a fully written trigger: the Warhammer 40k Necron / Astartes names,
 * the D&D monster abilities, Alicia Masters' Sense the Good, Amarant Coral's No Mercy. The strip stays trigger-anchored.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RED_DRAGON = { name: "Red Dragon", type: "Creature — Dragon", mana: "{4}{R}{R}", cmc: 6, power: 4, toughness: 4, keywords: ["Flying"],
  oracle: "Flying\nFire Breath — When this creature enters, it deals 4 damage to each opponent." };
const CHAPLAIN = { name: "Primaris Chaplain", type: "Creature — Astartes Warrior", mana: "{2}{W}", cmc: 3, power: 2, toughness: 3, keywords: [],
  oracle: "Rosarius — Whenever this creature attacks, it gains indestructible until end of turn." };
const OWLBEAR = { name: "Owlbear", type: "Creature — Bird Bear", mana: "{3}{G}{G}", cmc: 5, power: 4, toughness: 4, keywords: ["Trample"],
  oracle: "Trample\nKeen Senses — When this creature enters, draw a card." };
const WARDEN = { name: "Royal Warden", type: "Artifact Creature — Necron", mana: "{2}{B}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "Phalanx Commander — When this creature enters, create two tapped 2/2 black Necron Warrior artifact creature tokens." };

describe("the label no longer hides the trigger", () => {
  it("⭐ each of the four is detected and classifies native", () => {
    for (const c of [RED_DRAGON, CHAPLAIN, OWLBEAR, WARDEN]) {
      expect(detectTriggers({ id: "x", ...c }).length, c.name).toBeGreaterThan(0);
      expect(classifyCard({ id: "x", ...c }), c.name).toBe("native-trigger");
    }
  });

  it("⛔ a label OUTSIDE both lists is still left alone — the list grows only by measured entries, never by shape", () => {
    // "corrupted" is neither a CR 207.2c word in the bundled rules nor a measured flavor word: its ability stays hidden
    // (the same pin abilityWordLabels.test.js keeps). Opening the flavor strip to any label would flip this.
    expect(detectTriggers({ id: "x", name: "X", type: "Creature — Phyrexian", oracle: "Corrupted — Whenever this creature attacks, draw a card." })).toHaveLength(0);
    // a flavor word before something that is NOT a trigger keyword is untouched (the strip is trigger-anchored)
    expect(detectTriggers({ id: "x", name: "Y", type: "Creature — Dragon", oracle: "Fire Breath — {R}: This creature gets +1/+0 until end of turn." })).toHaveLength(0);
  });
});

describe("runtime — the trigger behind the label fires", () => {
  it("⭐ Primaris Chaplain's Rosarius: attacking grants indestructible until end of turn", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const me = createPermanent({ id: "me", card: { id: "cme", ...CHAPLAIN }, controller: "user" });
    me.summoningSick = false;
    const s = { ...s0, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "me", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [me] } } };
    expect(permanentHasKeyword(s, "me", "indestructible")).toBe(false);
    let st = flushTriggers(checkAttackTriggers(s));
    for (let i = 0; i < 10 && st.stack?.length; i++) st = resolveTopOfStack(st);
    expect(permanentHasKeyword(st, "me", "indestructible")).toBe(true);
  });
});
