/**
 * targetOpponentCreatureToken.test.js — CORPUS ④-F (2026-09-03 night): "target opponent creates <N> <P/T> <color>
 * <Type> creature token(s)[ with <keyword>]" — the creature-token sibling of the treasure/food target-opponent arm
 * (Forbidden Orchard, the Hunted cycle, Ox Drover, the Phelddagrifs; 15 corpus carriers). The chosen opponent is
 * the CREATOR (CR 111.2 — the effect names a different creator): the token enters under their control, their
 * doubler applies, never the caster's. A rider the general token parser can't read ("with protection from black")
 * keeps the whole clause LOW → Arbiter. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORCHARD = { id: "c-orch", name: "Forbidden Orchard", type: "Land", mana: "", keywords: [], oracle: "{T}: Add one mana of any color.\nWhenever you tap this land for mana, target opponent creates a 1/1 colorless Spirit creature token." };
const LAMMASU = { id: "c-lam", name: "Hunted Lammasu", type: "Creature — Lammasu", mana: "{3}{W}{W}", cmc: 5, power: 5, toughness: 5, keywords: ["Flying"], oracle: "Flying\nWhen this creature enters, target opponent creates a 4/4 black Horror creature token." };
const TROLL_ETB = "When this creature enters, target opponent creates four 1/1 blue Faerie creature tokens with flying.";
const HORROR_ETB = "When this creature enters, target opponent creates two 3/3 green Centaur creature tokens with protection from black.";
const GREEN_SPELL = { id: "h-gs", name: "Synthetic Growth", type: "Sorcery", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "You gain 2 life." };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [GREEN_SPELL], graveyard: [], library: [], battlefield: [createPermanent({ id: "orch", card: ORCHARD, controller: "user" }), createPermanent({ id: "lam", card: LAMMASU, controller: "user" })], manaPool: pool },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [], manaPool: { ...pool } },
    },
  };
}
const tokensOf = (s, seat) => s.players[seat].battlefield.filter((p) => p.card?.token);

describe("the parse + the tiers", () => {
  it("the target-opponent creature-token clause parses to the stamped token atom; an unreadable rider stays LOW", () => {
    const p = parseEffectClause("target opponent creates four 1/1 blue Faerie creature tokens with flying", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-token", count: 4, power: 1, toughness: 1, targetType: "opponent", whoCreates: "target", keywords: ["Flying"] });
    expect(parseEffectClause("target opponent creates a 1/1 colorless Spirit creature token", "Creature").atoms[0]).toMatchObject({ op: "create-token", count: 1, targetType: "opponent", whoCreates: "target" });
    expect(parseEffectClause("target opponent creates two 3/3 green Centaur creature tokens with protection from black", "Creature").confidence).toBe("low");
  });
  it("Forbidden Orchard is a fully covered land; Hunted Lammasu and the Troll's ETB are native; Hunted Horror's rider parks it", () => {
    expect(classifyCard(ORCHARD)).toBe("land");
    expect(classifyCard(LAMMASU)).toMatch(/^native/);
    expect(classifyCard({ id: "c-tr", name: "Hunted Troll Probe", type: "Creature — Troll Warrior", mana: "{2}{G}{G}", power: 6, toughness: 5, keywords: [], oracle: TROLL_ETB })).toMatch(/^native/);
    expect(classifyCard({ id: "c-hh", name: "Hunted Horror Probe", type: "Creature — Horror", mana: "{B}{B}", power: 7, toughness: 7, keywords: ["Trample"], oracle: "Trample\n" + HORROR_ETB })).toBe("body-only");
  });
});

describe("runtime", () => {
  it("⭐ Forbidden Orchard: tapping it to pay a spell gives the OPPONENT a Spirit (never the caster)", () => {
    const s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-gs");
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const out = resolveTopOfStack(cast);
    expect(tokensOf(out, "ai").length).toBe(1);
    expect(tokensOf(out, "ai")[0].card.name).toBe("Spirit");
    expect(tokensOf(out, "user").length).toBe(0);
  });
  it("⭐ Hunted Lammasu's ETB hands the opponent a 4/4 Horror; four Faeries with flying for the Troll shape", () => {
    const s = board();
    const lam = s.players.user.battlefield.find((p) => p.id === "lam");
    const out = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, lam)));
    const horrors = tokensOf(out, "ai");
    expect(horrors.length).toBe(1);
    expect(horrors[0].card.power).toBe(4);
    expect(horrors[0].controller).toBe("ai");
    const troll = createPermanent({ id: "troll", card: { id: "c-troll", name: "Hunted Troll", type: "Creature — Troll Warrior", mana: "{2}{G}{G}", power: 6, toughness: 5, keywords: [], oracle: TROLL_ETB }, controller: "user" });
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [troll] } } };
    const out2 = resolveTopOfStack(flushTriggers(checkEnterTriggers(s2, troll)));
    const faeries = tokensOf(out2, "ai");
    expect(faeries.length).toBe(4);
    expect(faeries.every((t) => /flying/i.test(String(t.card.oracle || "")) || (t.card.keywords || []).some((k) => /flying/i.test(k)))).toBe(true);
    expect(tokensOf(out2, "user").length).toBe(0);
  });
});
