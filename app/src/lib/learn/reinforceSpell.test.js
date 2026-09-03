/**
 * reinforceSpell.test.js — CORPUS ④-O (2026-09-03 night): REINFORCE on a SPELL (CR 702.71a) — "Reinforce 2—{2}{G}
 * ({2}{G}, Discard this card: Put two +1/+1 counters on target creature.)" is a HAND-zone activated option the engine
 * never offers; declined, the spell is cast and resolves as printed (cycling's exact basis on the permanent side). The
 * line joins the spell-side cost-only keyword strip (transmute / flashback / convoke …). Break Ties / Fowl Strike /
 * Hunting Triad / Earthbrawn each parked on this line ALONE. Real oracle fixtures (bundled Scryfall snapshot, read
 * in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";

beforeEach(() => _resetIdsForTests());

const FOWL_STRIKE = { id: "h-fs", name: "Fowl Strike", type: "Instant", mana: "{3}{G}", mana_cost: "{3}{G}", cmc: 4, keywords: [],
  oracle: "Destroy target creature with flying.\nReinforce 2—{2}{G} ({2}{G}, Discard this card: Put two +1/+1 counters on target creature.)" };
const EARTHBRAWN = { id: "h-eb", name: "Earthbrawn", type: "Instant", mana: "{1}{G}", cmc: 2, keywords: [],
  oracle: "Target creature gets +3/+3 until end of turn.\nReinforce 1—{1}{G} ({1}{G}, Discard this card: Put a +1/+1 counter on target creature.)" };
const HUNTING_TRIAD = { id: "h-ht", name: "Hunting Triad", type: "Kindred Sorcery — Elf", mana: "{3}{G}", cmc: 4, keywords: [],
  oracle: "Create three 1/1 green Elf Warrior creature tokens.\nReinforce 3—{3}{G} ({3}{G}, Discard this card: Put three +1/+1 counters on target creature.)" };
const BREAK_TIES = { id: "h-bt", name: "Break Ties", type: "Instant", mana: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard.\nReinforce 1—{W} ({W}, Discard this card: Put a +1/+1 counter on target creature.)" };

describe("the strip + the tiers", () => {
  it("⭐ the Reinforce line is a cost-only keyword line; reinforce-referencing prose is not", () => {
    expect(stripCostOnlyKeywordLines(FOWL_STRIKE.oracle).trim()).toBe("Destroy target creature with flying.");
    expect(stripCostOnlyKeywordLines("Creatures you control with reinforce get +1/+1.").trim()).toBe("Creatures you control with reinforce get +1/+1.");
  });
  it("⭐ the four flip native-spell", () => {
    for (const c of [FOWL_STRIKE, EARTHBRAWN, HUNTING_TRIAD, BREAK_TIES]) expect(classifyCard(c)).toBe("native-spell");
  });
});

describe("runtime — the spell is cast and resolves as printed; the hand-zone option is never offered", () => {
  it("⭐ Fowl Strike destroys the opponent's flier; nothing but the cast references the card in hand", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [FOWL_STRIKE], battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 } },
        ai: { ...s0.players.ai, graveyard: [], battlefield: [createPermanent({ id: "bird", card: { id: "c-bird", name: "Cloud Bird", type: "Creature — Bird", power: 2, toughness: 2, keywords: ["Flying"], oracle: "Flying" }, controller: "ai", summoningSick: false })] } } };
    const all = legalActionsForPlayer(s, "user").filter((a) => a.cardId === "h-fs");
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.kind === "cast-spell")).toBe(true);
    const act = all.find((a) => a.targets?.[0]?.id === "bird");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "bird")).toBeFalsy();
    expect(out.players.ai.graveyard.some((c) => c.name === "Cloud Bird")).toBe(true);
  });
});
