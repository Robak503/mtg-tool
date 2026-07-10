/**
 * tatoFarmer.test.js — Tato Farmer (SHELF S7): the milled-this-turn ledger + the milled-land reanimate.
 *
 *   1. gameState.millCards now stamps EVERY milled card id → the turn it was milled (the single mill
 *      primitive — the mill-effect path AND the radiation mill both flow through it). Readers key on
 *      `=== state.turn`, so stale entries are inert.
 *   2. "Put target land card in a graveyard that was milled this turn onto the battlefield under your
 *      control tapped." → the cross-graveyard reanimate atom + the milledThisTurnOnly enumeration gate +
 *      entersTapped riding enterCardFromZone.
 *   3. The landfall "you may get two rad counters" — the α2 peel produces the subjectless "get two rad
 *      counters", now accepted by radClauseParser (controller-scoped; the idiom only arrives post-peel).
 * CREED FP = offering a land milled LAST turn / never milled, or an untapped entry.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, millCards } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { applyReanimate } from "./effects/atoms/zones.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const TATO_ORACLE =
  "Landfall — Whenever a land you control enters, you may get two rad counters.\n{T}: Put target land card in a graveyard that was milled this turn onto the battlefield under your control tapped.";
const tatoCard = (id = "tf-card") => ({
  id, name: "Tato Farmer", type: "Creature — Zombie Mutant Peasant", power: "1", toughness: "4", mana: "{1}{G}", oracle: TATO_ORACLE,
});

const REANIMATE_CLAUSE = "put target land card in a graveyard that was milled this turn onto the battlefield under your control tapped";
const GY_SPEC = { kind: "return-gy", targetType: "graveyardCard", cardFilter: "land", anyGraveyard: true, milledThisTurnOnly: true };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const LAND = (id) => ({ id, name: `Land ${id}`, type: "Basic Land — Forest", oracle: "" });
const SPELL = (id) => ({ id, name: `Spell ${id}`, type: "Instant", oracle: "" });

describe("parse + routing + classify", () => {
  it("the landfall optional rad routes; the milled-land reanimate parses HIGH; Tato → native-mixed", () => {
    const [d] = detectTriggers(tatoCard()).filter((t) => t.event === "landfall");
    expect(triggerRoutesNatively(d)).toBe(true);
    const p = parseEffectClause(REANIMATE_CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "land", anyGraveyard: true, milledThisTurnOnly: true, entersTapped: true }]);
    expect(classifyCard(tatoCard())).toBe("native-mixed");
  });
});

describe("the milled-this-turn ledger (CREED core)", () => {
  it("millCards stamps ids with the CURRENT turn; enumeration offers ONLY this-turn milled lands (any graveyard)", () => {
    let s = baseState();
    s = { ...s, turn: 3, players: { ...s.players, ai1: { ...s.players.ai1, library: [LAND("l1"), SPELL("s1"), LAND("l2")] } } };
    s = millCards(s, { playerId: "ai1", count: 2 }); // mills l1 + s1 on turn 3
    expect(s.milledThisTurn).toMatchObject({ l1: 3, s1: 3 });

    // a land that reached the graveyard WITHOUT being milled is never offered
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [LAND("l9")] } } };
    const targets = enumerateTargets(s, "user", GY_SPEC);
    expect(targets.map((t) => t.id)).toEqual(["l1"]); // the milled land only — not the spell, not l9

    // NEXT turn the ledger entry is stale → nothing offered
    const t4 = { ...s, turn: 4 };
    expect(enumerateTargets(t4, "user", GY_SPEC)).toEqual([]);
  });

  it("the reanimate enters the milled land TAPPED under the CASTER's control (cross-graveyard)", () => {
    let s = baseState();
    s = { ...s, turn: 3, players: { ...s.players, ai1: { ...s.players.ai1, library: [LAND("l1")] } } };
    s = millCards(s, { playerId: "ai1", count: 1 });
    const atom = { op: "reanimate", cardFilter: "land", anyGraveyard: true, milledThisTurnOnly: true, entersTapped: true };
    const after = applyReanimate(s, atom, { controller: "user", targets: [{ type: "graveyardCard", id: "l1", controller: "ai1" }] });
    const entered = after.players.user.battlefield.find((p) => p.card?.id === "l1");
    expect(entered).toBeTruthy();
    expect(entered.tapped).toBe(true);
    expect(after.players.ai1.graveyard.some((c) => c.id === "l1")).toBe(false);
  });
});
