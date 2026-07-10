/**
 * selfOrAnotherDies.test.js — the SELF-OR-ANOTHER dies scope (SHELF S7 — The Ghoul, Gunslinger; the
 * Zulaport-class shape) + the RAD-TARGET-OR-TREASURE branch effect.
 *
 * "Whenever The Ghoul or another nontoken Zombie or Mutant you control dies, target player gets two rad
 * counters. If that player is you, create a Treasure token."
 *   - selfOrAnotherYouControl scope: the SELF half fires unconditionally on the source's own death
 *     (CR 603.2); the ANOTHER half gates on same-controller + not-self + nontoken + the subtype UNION.
 *   - matchRadTargetOrTreasure collapses the two-sentence effect into ONE rad atom (who:"target",
 *     treasureIfSelf) — applyRad mints a Treasure only when the chosen player IS the controller.
 * CREED FP = firing on a non-member death (a token Zombie, a Human, an opponent's Zombie) or a Treasure
 * on an opponent target — all pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyRad } from "./effects/atoms/counters.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const GHOUL_ORACLE =
  "First strike\nWhenever The Ghoul or another nontoken Zombie or Mutant you control dies, target player gets two rad counters. If that player is you, create a Treasure token.";
const ghoulCard = (id = "gg-card") => ({
  id, name: "The Ghoul, Gunslinger", type: "Legendary Creature — Zombie Mutant Rogue",
  power: "2", toughness: "3", mana: "{1}{B}{B}", oracle: GHOUL_ORACLE,
});
const ZULAPORT_SHAPE = { // the class shape — a plain "another creature" lead with a modeled drain
  id: "ua", name: "Undead Augur", type: "Creature — Zombie Wizard", power: "2", toughness: "2", mana: "{B}{B}",
  oracle: "Whenever this creature or another Zombie you control dies, you draw a card and you lose 1 life.",
};

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function markLethal(state, pid, permId) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid],
    battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } };
}
const creature = (id, controller, type, token = false) =>
  createPermanent({ id, card: { name: id, type, power: "2", toughness: "2", oracle: "", ...(token && { token: true }) }, controller });

function diesPendingCount(state, pid, permId) {
  const lethal = destroyLethalCreatures(markLethal(state, pid, permId));
  const after = checkDiesTriggers(lethal.state, lethal.dead);
  return (after.pendingTriggers || []).filter((t) => t.event === "dies").length;
}

describe("detection + routing + classify", () => {
  it("The Ghoul's compound subject detects as selfOrAnotherYouControl (nontoken + Zombie/Mutant union) and routes", () => {
    const [d] = detectTriggers(ghoulCard()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "selfOrAnotherYouControl", nontokenFilter: true, subtypeFilter: ["Zombie", "Mutant"] });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(ghoulCard())).toBe("native-trigger");
  });
  it("the Zulaport-class 'this creature or another Zombie you control dies' shape detects too", () => {
    const [d] = detectTriggers(ZULAPORT_SHAPE).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ scope: "selfOrAnotherYouControl", subtypeFilter: "Zombie" });
    expect(d.nontokenFilter).toBeUndefined();
  });
});

describe("scope firing (CREED core — exact membership)", () => {
  function board() {
    let s = baseState();
    s = withBattlefield(s, "user", [
      createPermanent({ id: "gg", card: ghoulCard(), controller: "user" }),
      creature("z1", "user", "Creature — Zombie"),
      creature("m1", "user", "Creature — Mutant"),
      creature("h1", "user", "Creature — Human"),
      creature("zt", "user", "Creature — Zombie", true), // a TOKEN Zombie — excluded by nontoken
    ]);
    s = withBattlefield(s, "ai1", [creature("oz", "ai1", "Creature — Zombie")]);
    return s;
  }

  it("fires on: the source's own death, a nontoken Zombie, a nontoken Mutant", () => {
    expect(diesPendingCount(board(), "user", "gg")).toBe(1); // SELF half — unconditional
    expect(diesPendingCount(board(), "user", "z1")).toBe(1);
    expect(diesPendingCount(board(), "user", "m1")).toBe(1);
  });
  it("does NOT fire on: a Human, a TOKEN Zombie, an opponent's Zombie", () => {
    expect(diesPendingCount(board(), "user", "h1")).toBe(0);
    expect(diesPendingCount(board(), "user", "zt")).toBe(0);
    expect(diesPendingCount(board(), "ai1", "oz")).toBe(0);
  });
});

describe("effect (rad-target-or-treasure)", () => {
  it("the two-sentence branch collapses to ONE rad atom with the treasureIfSelf rider", () => {
    const p = parseEffectClause("target player gets two rad counters. If that player is you, create a Treasure token", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "rad", who: "target", targetType: "player", amount: 2, treasureIfSelf: true }]);
  });
  it("an OPPONENT target: 2 rad, NO Treasure; a SELF target: 2 rad + one Treasure", () => {
    const ATOM = { op: "rad", who: "target", targetType: "player", amount: 2, treasureIfSelf: true };
    let s = baseState();
    const opp = applyRad(s, ATOM, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(opp.players.ai1.radCounters).toBe(2);
    expect(opp.players.user.battlefield.filter((p) => p.card?.name === "Treasure")).toHaveLength(0);
    const self = applyRad(s, ATOM, { controller: "user", targets: [{ type: "player", id: "user" }] });
    expect(self.players.user.radCounters).toBe(2);
    expect(self.players.user.battlefield.filter((p) => p.card?.name === "Treasure")).toHaveLength(1);
  });
});
