/**
 * Integration tests for activated abilities (P2.9) — legalChoices surfaces them,
 * actionDispatcher pays the cost + puts them on the stack, resolveTopOfStack runs the
 * effect-program. Mirrors the cast-spell path; mana abilities stay on the tap-for-mana path.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, over = {}) {
  return { id: `card-${name}`, name, type: "Creature — Wizard", power: 1, toughness: 1, oracle, ...over };
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
function activateActions(state, playerId = "user") {
  return legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");
}

describe("activated abilities — legal actions", () => {
  it("surfaces a {T} pinger's ability, targeting a legal creature", () => {
    const pinger = createPermanent({ id: "perm-p", card: creature("Pinger", "{T}: This creature deals 1 damage to target creature."), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin", ""), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [pinger]);
    s = withBattlefield(s, "ai", [enemy]);
    const acts = activateActions(s);
    // One action per legal target (pinger itself + the enemy).
    expect(acts.length).toBeGreaterThanOrEqual(1);
    const atEnemy = acts.find((a) => a.targets[0]?.id === "perm-e");
    expect(atEnemy).toMatchObject({ kind: "activate-ability", permanentId: "perm-p", tapSelf: true, needsTargets: true });
  });

  it("does NOT surface a {T} ability on a summoning-sick creature (CR 302.6)", () => {
    const pinger = createPermanent({ id: "perm-p", card: creature("Pinger", "{T}: This creature deals 1 damage to target creature."), controller: "user", summoningSick: true });
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin", ""), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [pinger]);
    s = withBattlefield(s, "ai", [enemy]);
    expect(activateActions(s)).toHaveLength(0);
  });

  it("does NOT surface an ability outside the player's main phase", () => {
    const drawer = createPermanent({ id: "perm-d", card: creature("Drawer", "{T}: Draw a card."), controller: "user", summoningSick: false });
    const s = withBattlefield(mainState({ step: "upkeep", phase: "beginning" }), "user", [drawer]);
    expect(activateActions(s)).toHaveLength(0);
  });

  it("does NOT surface a targeted ability with no legal target (drop)", () => {
    const pinger = createPermanent({ id: "perm-p", card: creature("Pinger", "{T}: This creature deals 1 damage to target creature an opponent controls."), controller: "user", summoningSick: false });
    const s = withBattlefield(mainState(), "user", [pinger]); // no opponent creatures
    expect(activateActions(s)).toHaveLength(0);
  });

  it("does NOT surface a mana ability as activate-ability (it's tap-for-mana)", () => {
    const dork = createPermanent({ id: "perm-m", card: creature("Dork", "{T}: Add {G}."), controller: "user", summoningSick: false });
    const s = withBattlefield(mainState(), "user", [dork]);
    expect(activateActions(s)).toHaveLength(0);
  });

  it("does NOT surface an unaffordable mana ability", () => {
    const tome = createPermanent({ id: "perm-t", card: creature("Tome", "{4}, {T}: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const s = withBattlefield(mainState(), "user", [tome]); // empty pool, no mana sources
    expect(activateActions(s)).toHaveLength(0);
  });
});

describe("activated abilities — dispatch + resolution", () => {
  it("a {T} pinger taps, goes on the stack, and resolves to kill the target", () => {
    const pinger = createPermanent({ id: "perm-p", card: creature("Pinger", "{T}: This creature deals 1 damage to target creature."), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin", ""), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [pinger]);
    s = withBattlefield(s, "ai", [enemy]);
    const atEnemy = activateActions(s).find((a) => a.targets[0]?.id === "perm-e");

    const afterDispatch = dispatchAction(s, atEnemy);
    const stk = afterDispatch.stack.find((o) => o.kind === "activated-ability");
    expect(stk).toBeTruthy();
    expect(stk.payload.resolver).toBe("effect-program");
    // Source tapped (paid {T}) but still on the battlefield.
    const src = afterDispatch.players.user.battlefield.find((p) => p.id === "perm-p");
    expect(src.tapped).toBe(true);

    const resolved = resolveTopOfStack(afterDispatch);
    expect(resolved.players.ai.battlefield.find((p) => p.id === "perm-e")).toBeUndefined(); // 1/1 took 1 → died
  });

  it("a mana-cost ability auto-taps/pays and resolves (draw)", () => {
    const tome = createPermanent({ id: "perm-t", card: creature("Tome", "{1}: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [tome]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 }, library: [{ id: "lib-1", name: "Card" }] } } };
    const act = activateActions(s)[0];
    expect(act).toBeTruthy();

    const afterDispatch = dispatchAction(s, act);
    // {1} paid from the floating G.
    expect(afterDispatch.players.user.manaPool.G).toBe(0);
    const resolved = resolveTopOfStack(afterDispatch);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });
});
