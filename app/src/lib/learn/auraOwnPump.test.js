/**
 * auraOwnPump.test.js — BLITZ AF-1: the AURA-OWN ACTIVATED PUMP ("{M}: Enchanted creature gets +N/+M
 * until end of turn" — Armor of Faith / Stonehands / Holy Armor as compound carriers with a static
 * bonus; Firebreathing / Blessing as pure activated auras). The pump atom rides the fixed enchanted
 * referent (atomTargets → the Aura's host); the injected aura-own-activated validator lets the bonus
 * walk keep the static half and the strict touch gate admit the line. legalChoices enumerates the
 * printed ability on the AURA permanent (the Freed-from-the-Real machinery — untouched).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ARMOR_OF_FAITH = { id: "aof", name: "Armor of Faith", type: "Enchantment — Aura", mana: "{W}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1.\n{W}: Enchanted creature gets +0/+1 until end of turn." };
const FIREBREATHING = { id: "fb", name: "Firebreathing", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn." };
const DRAGON_BREATH = { id: "db", name: "Dragon Breath", type: "Enchantment — Aura", mana: "{1}{R}",
  oracle: "Enchant creature\nEnchanted creature has haste.\n{R}: Enchanted creature gets +1/+0 until end of turn.\nWhen a creature with mana value 6 or greater enters, you may return this card from your graveyard to the battlefield attached to that creature." };

describe("parse + classify", () => {
  it("the aura-own pump parses to the enchanted referent; carriers flip; Dragon Breath's gy trigger parks it", () => {
    expect(parseEffectClause("Enchanted creature gets +0/+1 until end of turn.", "Instant").atoms)
      .toEqual([{ op: "pump", target: "enchanted", ptDelta: { p: 0, t: 1 } }]);
    expect(classifyCard(ARMOR_OF_FAITH)).toBe("native-aura");
    expect(parseAuraBonus(ARMOR_OF_FAITH).length).toBeGreaterThan(0); // the +1/+1 static half survives the walk
    expect(classifyCard(FIREBREATHING)).toBe("native-activated");
    expect(classifyCard(DRAGON_BREATH)).toBe("body-only");
  });
});

describe("runtime — activate on the Aura, pump lands on the host until end of turn", () => {
  it("Armor of Faith's {W} gives the host +0/+1", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ARMOR_OF_FAITH, controller: "user", summoningSick: false });
    aura.attachedTo = "host"; host.attachments = ["aura"];
    s = { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [host, aura], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    expect(permanentToughness(s, "host")).toBe(3); // 2 base + the static +1/+1
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "aura");
    expect(offers).toHaveLength(1);
    let after = dispatchAction(s, offers[0]);
    after = resolveTopOfStack(after);
    expect(permanentToughness(after, "host")).toBe(4); // +0/+1 until EOT on top
  });
});
