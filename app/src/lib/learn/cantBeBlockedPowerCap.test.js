/**
 * cantBeBlockedPowerCap.test.js — BLITZ GT-1: "Target creature with power N or less can't be
 * blocked this turn" (Goblin Tunneler / Dwarven Warriors / Tawnos's Wand class; Spider-Man,
 * Hometown Hero is the ETB-trigger carrier). The SAME layer-6 endOfTurn unblockable grant with the
 * printed power cap as a target restriction — creatureSatisfiesRestrictions' layer-aware power
 * branch gates the pool at enumeration, so a pumped creature moves out of range live.
 * CREED FP guarded: an over-power creature must never be a legal target; the "…except by" and
 * conditional forms stay LOW. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TUNNELER = { id: "gt", name: "Goblin Tunneler", type: "Creature — Goblin Rogue", mana: "{1}{R}",
  power: "1", toughness: "1", oracle: "{T}: Target creature with power 2 or less can't be blocked this turn." };
const SPIDER_MAN = { id: "sm", name: "Spider-Man, Hometown Hero", type: "Legendary Creature — Spider Human Hero", mana: "{1}{G}{W}",
  power: "2", toughness: "3", oracle: "Reach (This creature can block creatures with flying.)\nWhen Spider-Man enters, target creature with power 2 or less can't be blocked this turn." };

describe("parse + classify", () => {
  it("the power-capped clause → cant-be-blocked with the power restriction", () => {
    const p = parseEffectClause("target creature with power 2 or less can't be blocked this turn", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "cant-be-blocked", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 2 }] }]);
  });
  it("carriers flip: Tunneler → native-activated, Spider-Man (ETB trigger) → native-trigger", () => {
    expect(classifyCard(TUNNELER)).toBe("native-activated");
    expect(classifyCard(SPIDER_MAN)).toBe("native-trigger");
  });
  it("CREED — the 'except by' and conditional forms stay LOW", () => {
    expect(programConfidence(parseEffectClause("target creature with power 2 or less can't be blocked this turn except by artifact creatures", "Creature"))).not.toBe("high");
    expect(programConfidence(parseEffectClause("target creature with power 4 or greater can't be blocked this turn", "Creature"))).not.toBe("high");
  });
});
