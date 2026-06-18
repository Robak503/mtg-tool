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

describe("activated abilities — γ1 pay-life + self-sacrifice costs", () => {
  const withLife = (state, playerId, life) =>
    ({ ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], life } } });
  const withLibrary = (state, playerId, library) =>
    ({ ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library } } });

  it("surfaces a Pay-life ability and the dispatch deducts the life, then resolves", () => {
    const altar = createPermanent({ id: "perm-a", card: creature("Bond", "{T}, Pay 2 life: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [altar]);
    s = withLife(s, "user", 20);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const act = activateActions(s)[0];
    expect(act).toMatchObject({ payLife: 2, tapSelf: true, sacSelf: false });

    const afterDispatch = dispatchAction(s, act);
    expect(afterDispatch.players.user.life).toBe(18);                 // paid 2 life as a cost
    expect(afterDispatch.players.user.battlefield.find((p) => p.id === "perm-a").tapped).toBe(true);
    const resolved = resolveTopOfStack(afterDispatch);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });

  it("does NOT surface a Pay-life ability the player can't afford (CR 119.4)", () => {
    const altar = createPermanent({ id: "perm-a", card: creature("Bond", "{T}, Pay 5 life: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [altar]);
    s = withLife(s, "user", 3);                                       // 3 life < 5 → unpayable
    expect(activateActions(s)).toHaveLength(0);
  });

  it("a Sacrifice-this ability sends the source to the graveyard (cost) and resolves the effect", () => {
    const sac = createPermanent({ id: "perm-s", card: creature("Outlet", "{1}, Sacrifice this creature: Draw a card."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [sac]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 }, library: [{ id: "lib-1", name: "Card" }] } } };
    const act = activateActions(s)[0];
    expect(act).toMatchObject({ sacSelf: true });

    const afterDispatch = dispatchAction(s, act);
    expect(afterDispatch.players.user.battlefield.find((p) => p.id === "perm-s")).toBeUndefined(); // sacrificed
    expect(afterDispatch.players.user.graveyard.some((c) => c.name === "Outlet")).toBe(true);
    const resolved = resolveTopOfStack(afterDispatch);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });

  it("self-sacrifice fires a dies trigger (the aristocrats payoff) ABOVE the ability on the stack", () => {
    const sac = createPermanent({ id: "perm-s", card: creature("Outlet", "Sacrifice this creature: Draw a card."), controller: "user", summoningSick: false });
    const artist = createPermanent({ id: "perm-ba", card: creature("Blood Artist", "Whenever a creature dies, each opponent loses 1 life."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [sac, artist]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const act = activateActions(s).find((a) => a.permanentId === "perm-s");
    expect(act).toMatchObject({ sacSelf: true });

    const afterDispatch = dispatchAction(s, act);
    // The death from the cost put the dies trigger on the stack ABOVE the activated ability
    // (CR 603.3b) — so it resolves FIRST. Prove it by behavior, not payload internals.
    const top = afterDispatch.stack[afterDispatch.stack.length - 1];
    const bottom = afterDispatch.stack[afterDispatch.stack.length - 2];
    expect(top.kind).toBe("triggered-ability");
    expect(bottom.kind).toBe("activated-ability");
    const aiLifeBefore = afterDispatch.players.ai.life;
    const resolved = resolveTopOfStack(afterDispatch);                 // resolve the drain
    expect(resolved.players.ai.life).toBe(aiLifeBefore - 1);           // the aristocrats payoff fired
  });
});
