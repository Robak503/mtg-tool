/**
 * goadAtom.test.js — ④-AI (2026-09-03 night): GOAD AS AN EFFECT ATOM (CR 701.38) — Jeering Homunculus "When this creature
 * enters, you may goad target creature", Taunting Kobold "Whenever this creature attacks, goad target creature an opponent
 * controls", Goblin Racketeer / Coveted Peacock ("… defending player controls"), Taunting Sliver, Glóin. The goad-AURA slice
 * (goad.test.js) already grants the two pseudo-keywords the attack planner reads layer-aware — `mustAttack` and `goaded`,
 * the goader resolved by layers.goaderControllersOf — so the atom grants the same two until the GOADER's next turn (the
 * SAVAGE ORDER `untilOwnersNextTurn` kind) and records the goader on the effect's source, which a spell (no source
 * permanent) needs for the "not at me" half. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAttackPlan } from "./opponentAI.js";
import { goaderControllersOf, permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KOBOLD = { id: "c-tk", name: "Taunting Kobold", type: "Creature — Kobold", mana: "{1}{R}", cmc: 2, power: 2, toughness: 1, keywords: ["Haste"],
  oracle: "Haste\nWhenever this creature attacks, goad target creature an opponent controls. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const HOMUNCULUS = { id: "c-jh", name: "Jeering Homunculus", type: "Creature — Homunculus", mana: "{2}{U}", cmc: 3, power: 1, toughness: 4, keywords: [],
  oracle: "When this creature enters, you may goad target creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const RACKETEER = { id: "c-gr", name: "Goblin Racketeer", type: "Creature — Goblin Rogue", mana: "{3}{R}", cmc: 4, power: 3, toughness: 3, keywords: [],
  oracle: "Whenever this creature attacks, you may goad target creature defending player controls. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
// synthetic, named as such: the bare atom as an instant, so the SPELL source path (no source permanent) is exercised
const TAUNT = { id: "h-tt", name: "Synthetic Taunt", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Goad target creature." };

describe("the parse", () => {
  it("⭐ the single-target goad forms parse; the mass form stays LOW", () => {
    expect(parseEffectClause("Goad target creature.", "Instant").atoms).toEqual([{ op: "goad", targetType: "creature", restrictions: [] }]);
    expect(parseEffectClause("Goad target creature an opponent controls.", "Instant").atoms[0].restrictions).toEqual([{ kind: "controller", who: "opponent" }]);
    expect(parseEffectClause("Goad target creature defending player controls.", "Instant").atoms[0].restrictions).toEqual([{ kind: "controller", who: "defendingPlayer" }]);
    expect(parseEffectClause("You may goad target creature.", "Instant").atoms[0]).toMatchObject({ op: "goad", optional: true });
    expect(parseEffectClause("Goad each creature target player controls.", "Instant")?.atoms || []).toEqual([]);
  });

  it("the tiers", () => {
    expect(classifyCard(KOBOLD)).toBe("native-trigger");
    expect(classifyCard(HOMUNCULUS)).toBe("native-trigger");
    expect(classifyCard(RACKETEER)).toBe("native-trigger");
  });
});

describe("runtime — a four-seat board, where goad's two halves are visible", () => {
  function board() {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "gd", card: { id: "b", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "ai1", summoningSick: false });
    const players = { ...g.players };
    for (const seat of ["user", "ai1", "ai2", "ai3"]) players[seat] = { ...g.players[seat], battlefield: seat === "ai1" ? [bear] : [], life: 20 };
    players.user = { ...players.user, hand: [TAUNT], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } };
    return { ...g, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 5, consecutivePasses: 0, players };
  }
  const goaded = () => {
    const s = board();
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-tt" && a.targets?.[0]?.id === "gd");
    expect(cast).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, cast));
  };

  it("⭐ resolving the goad grants BOTH halves and names the caster as the goader — off the source's controller, since a spell has no permanent", () => {
    const s = goaded();
    expect(permanentHasKeyword(s, "gd", "mustAttack")).toBe(true);
    expect(permanentHasKeyword(s, "gd", "goaded")).toBe(true);
    expect([...goaderControllersOf(s, "gd")]).toEqual(["user"]);
  });

  it("⭐ on its controller's turn the goaded Bear is planned to attack, and never at the goader", () => {
    const s0 = goaded();
    const s = { ...s0, activePlayer: "ai1", priorityHolder: "ai1", phase: "combat", step: "declare-attackers", turn: 6 };
    const plan = pickAttackPlan(s, "ai1", legalActionsForPlayer(s, "ai1").filter((a) => a.kind === "declare-attacker"));
    expect(plan.map((a) => a.permanentId)).toEqual(["gd"]);
    expect(["ai2", "ai3"]).toContain(plan[0].defenderId);
  });

  it("⭐ 'until your next turn': survives the goader's own cleanup and the Bear's controller's turn; expires at the cleanup of the goader's NEXT turn", () => {
    const s = goaded();
    const has = (st) => permanentHasKeyword(st, "gd", "goaded");
    expect(has(expireContinuousEffects({ ...s, activePlayer: "user" }, { atCleanupOfTurn: 5 }))).toBe(true);   // the casting turn's cleanup
    expect(has(expireContinuousEffects({ ...s, activePlayer: "ai1" }, { atCleanupOfTurn: 6 }))).toBe(true);    // the Bear's controller's turn
    expect(has(expireContinuousEffects({ ...s, activePlayer: "user" }, { atCleanupOfTurn: 9 }))).toBe(false);  // the goader's next turn
  });
});
