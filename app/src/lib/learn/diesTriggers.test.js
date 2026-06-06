/**
 * Tests for dies triggers (Phase-7 PR-7).
 *
 * Dies triggers source from the `dead` look-back snapshot (CR 603.10a) that
 * destroyLethalCreatures returns — NOT a post-resolution diff (eng-review F2):
 * by the time we check, the permanents are already in the graveyard, so their
 * last-known card travels with `dead`. Wired into combat, damage spells, and
 * destroy spells.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkDiesTriggers } from "./triggers.js";
import { resolveSpellEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) {
    players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  }
  return { ...state, players };
}

describe("checkDiesTriggers (unit)", () => {
  it("fires the dead creature's own 'when this dies' trigger from the look-back", () => {
    const card = creature("Doomed", "When Doomed dies, draw a card.", { id: "card-d" });
    const out = checkDiesTriggers(stateWith(), [{ id: "perm-dead", controller: "user", name: "Doomed", card }]);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });

  it("fires a surviving Blood-Artist-style watcher for another creature's death", () => {
    const artist = creature("Blood Artist", "Whenever a creature dies, each opponent loses 1 life.", { id: "card-ba" });
    const state = placePerms(stateWith(), [permObj(artist, "user", "perm-ba")]);
    const out = checkDiesTriggers(state, [{ id: "perm-x", controller: "ai1", name: "Bear", card: creature("Bear", "", { id: "card-bear" }) }]);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "loseLife", who: "eachOpponent", amount: 1 });
    expect(out.pendingTriggers[0].controller).toBe("user");
  });

  it("is a no-op for an empty dead set", () => {
    const s = stateWith();
    expect(checkDiesTriggers(s, [])).toBe(s);
  });
});

describe("dies triggers wired into resolution", () => {
  it("a damage spell that kills a creature fires its dies trigger", () => {
    const dying = creature("Doomed", "When Doomed dies, each opponent loses 2 life.", { id: "card-doomed", toughness: 1 });
    const state = placePerms(stateWith(), [permObj(dying, "ai1", "perm-doomed")]);
    const out = resolveSpellEffect(state, {
      effect: { kind: "damage", amount: 3, targetType: "creature" },
      controller: "user",
      targets: [{ type: "creature", id: "perm-doomed" }],
    });
    expect(out.players.ai1.battlefield).toHaveLength(0); // it died
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].controller).toBe("ai1"); // the dead creature's controller
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "loseLife", who: "eachOpponent", amount: 2 });
  });

  it("a destroy spell fires the destroyed creature's dies trigger", () => {
    const dying = creature("Doomed", "When Doomed dies, draw a card.", { id: "card-d2" });
    const state = placePerms(stateWith(), [permObj(dying, "user", "perm-d2")]);
    const out = resolveSpellEffect(state, {
      effect: { kind: "destroy", targetType: "creature" },
      controller: "user",
      targets: [{ type: "creature", id: "perm-d2" }],
    });
    expect(out.players.user.battlefield).toHaveLength(0);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });

  it("a creature dying in combat fires its dies trigger", () => {
    const attacker = permObj(creature("Hill Giant", "", { id: "card-hg", power: 3, toughness: 3 }), "user", "perm-att");
    const blocker = permObj(creature("Doomed Blocker", "When Doomed Blocker dies, each opponent loses 1 life.", { id: "card-db", power: 1, toughness: 1 }), "ai1", "perm-blk");
    let state = stateWith({
      combat: {
        attackers: [{ permanentId: "perm-att", attackingPlayer: "user", defender: "ai1" }],
        blockers: [{ blockerId: "perm-blk", blockingPlayer: "ai1", attackerId: "perm-att" }],
      },
    });
    state = placePerms(state, [attacker, blocker]);
    const out = resolveCombatDamage(state, { firstStrikeStep: false });
    expect(out.players.ai1.battlefield).toHaveLength(0); // blocker died to 3 damage
    const drain = (out.pendingTriggers || []).find(t => t.payload.params.effect?.kind === "loseLife");
    expect(drain).toBeTruthy();
    expect(drain.controller).toBe("ai1");
  });
});
