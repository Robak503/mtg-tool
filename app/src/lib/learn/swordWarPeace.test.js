/**
 * swordWarPeace.test.js — the DAMAGED-PLAYER anaphoric damage target ("that player") + the "their hand"
 * count anaphor (Sword of War and Peace).
 *
 * "Whenever equipped creature deals combat damage to a player, this Equipment deals damage to that player
 * equal to the number of cards in their hand and you gain 1 life for each card in your hand." Four seams,
 * each mirroring a shipped twin:
 *   - TT "that player" → targetType "damagedPlayer" (twin: "defending player"), NOT a chosen target
 *     (NON_CHOSEN_TARGET_TYPES) — the resolver synthesizes the player from ctx.damagedPlayerId;
 *   - the who:"damagedPlayer" pin keeps the atom off non-combat-damage events via the pre-existing
 *     combatDamageReferentSatisfied gate (DAMAGED_PLAYER_EVENTS);
 *   - "cards in THEIR hand" rides the same {kind:"cardsInHand", who:"target"} spec as "that player's hand"
 *     — countForSpec's who:"target" already falls back to ctx.damagedPlayerId (the Cavern-Hoard path);
 *   - the second conjunct ("you gain 1 life for each card in your hand") was already modeled.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WP_ORACLE = "Equipped creature gets +2/+2 and has protection from red and from white.\nWhenever equipped creature deals combat damage to a player, this Equipment deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your hand.\nEquip {2}";

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}

describe("SWORD OF WAR AND PEACE — recognition", () => {
  it("classifies native-equipment; the trigger routes; no chosen target", () => {
    const card = { name: "Sword of War and Peace", type: "Artifact — Equipment", oracle: WP_ORACLE, mana: "{3}" };
    expect(classifyCard(card)).toBe("native-equipment");
    const p = parseEffectClause("this equipment deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your hand", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", targetType: "damagedPlayer", who: "damagedPlayer" });
    expect(programNeedsChosenTarget(p)).toBe(false); // "that player" is the damaged player, never a chosen target
  });

  it("CREED: the who-pin keeps the clause off NON-combat-damage events (referent gate)", () => {
    // the same payload on an ETB trigger must NOT route (ctx.damagedPlayerId would be unset — silent drop)
    const card = { name: "Synth", type: "Creature — Human", oracle: "When this creature enters, this creature deals damage to that player equal to the number of cards in their hand." };
    expect(classifyCard(card)).toBe("body-only");
  });
});

describe("SWORD OF WAR AND PEACE — runtime", () => {
  it("connect with 3 cards in the defender's hand → 3 damage to THEM + gain = MY hand count", () => {
    const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage" };
    const knight = permObj({ name: "Knight", type: "Creature — Human Knight", power: 2, toughness: 2, oracle: "" }, "user", "knight", { attachments: ["swp"] });
    const sword = permObj({ name: "Sword of War and Peace", type: "Artifact — Equipment", oracle: WP_ORACLE, mana: "{3}" }, "user", "swp", { attachedTo: "knight" });
    let s = {
      ...base,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [knight, sword], hand: [{ id: "u1", name: "A", type: "Instant" }, { id: "u2", name: "B", type: "Instant" }], life: 30 },
        ai: { ...base.players.ai, hand: [{ id: "a1", name: "X", type: "Instant" }, { id: "a2", name: "Y", type: "Instant" }, { id: "a3", name: "Z", type: "Instant" }], life: 40 },
      },
    };
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "knight", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    const r = resolveTopOfStack(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(r.players.ai.life).toBe(37);   // 3 cards in THEIR hand → 3 damage to the damaged player
    expect(r.players.user.life).toBe(32); // 2 cards in MY hand → gain 2
  });
});
