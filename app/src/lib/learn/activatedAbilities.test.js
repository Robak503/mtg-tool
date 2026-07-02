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

describe("activated abilities — γ1b sacrifice-a-creature (chosen victim)", () => {
  const withLibrary = (state, playerId, library) =>
    ({ ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library } } });

  it("expands one action per legal victim and the dispatch sacrifices the CHOSEN one (source stays)", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Altar", "{1}, Sacrifice a creature: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const tokenA = createPermanent({ id: "perm-a", card: creature("Soldier A", ""), controller: "user", summoningSick: false });
    const tokenB = createPermanent({ id: "perm-b", card: creature("Soldier B", ""), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, tokenA, tokenB]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 }, library: [{ id: "lib-1", name: "Card" }] } } };
    const sacActs = activateActions(s).filter((a) => a.permanentId === "perm-o");
    // One action per legal victim — the two soldiers (the artifact outlet itself is not a creature).
    expect(sacActs.map((a) => a.sacCreatureId).sort()).toEqual(["perm-a", "perm-b"]);

    const killB = sacActs.find((a) => a.sacCreatureId === "perm-b");
    const afterDispatch = dispatchAction(s, killB);
    expect(afterDispatch.players.user.battlefield.find((p) => p.id === "perm-b")).toBeUndefined(); // chosen victim gone
    expect(afterDispatch.players.user.battlefield.find((p) => p.id === "perm-a")).toBeTruthy();    // the OTHER stays
    expect(afterDispatch.players.user.battlefield.find((p) => p.id === "perm-o")).toBeTruthy();    // the SOURCE stays
    expect(afterDispatch.players.user.graveyard.some((c) => c.name === "Soldier B")).toBe(true);
    const resolved = resolveTopOfStack(afterDispatch);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });

  it("'Sacrifice another creature' excludes the source from the victim list", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Cannibal", "Sacrifice another creature: Draw a card."), controller: "user", summoningSick: false });
    const food = createPermanent({ id: "perm-f", card: creature("Food", ""), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, food]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const sacActs = activateActions(s).filter((a) => a.permanentId === "perm-o");
    expect(sacActs.map((a) => a.sacCreatureId)).toEqual(["perm-f"]); // never the source itself
  });

  it("excludes a victim that would silently drop its own trigger on leaving (the fail-safe, on the victim)", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Altar", "Sacrifice a creature: Draw a card."), controller: "user", summoningSick: false });
    const safe = createPermanent({ id: "perm-safe", card: creature("Bear", ""), controller: "user", summoningSick: false });
    const risky = createPermanent({ id: "perm-risky", card: creature("Loot", "When this creature leaves the battlefield, create a Treasure token."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, safe, risky]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const victims = activateActions(s).filter((a) => a.permanentId === "perm-o").map((a) => a.sacCreatureId);
    expect(victims).toContain("perm-safe");
    expect(victims).toContain("perm-o");      // the outlet can sac itself ("a creature", not "another")
    expect(victims).not.toContain("perm-risky"); // LTB trigger would be dropped → not a legal victim
  });

  it("excludes a victim with a 'put into a graveyard from the battlefield' trigger (the dies path misses it — P0)", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Feeder", "Sacrifice a creature: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const safe = createPermanent({ id: "perm-safe", card: creature("Bear", ""), controller: "user", summoningSick: false });
    const brood = createPermanent({ id: "perm-brood", card: creature("Brood", "When this creature is put into your graveyard from the battlefield, return this card to its owner's hand."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, safe, brood]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const victims = activateActions(s).filter((a) => a.permanentId === "perm-o").map((a) => a.sacCreatureId);
    expect(victims).toContain("perm-safe");
    expect(victims).not.toContain("perm-brood"); // its recursion trigger would be silently dropped
  });

  it("never offers an action that sacrifices the very creature the effect targets (would fizzle — P2)", () => {
    const cannon = createPermanent({ id: "perm-c", card: creature("Cannon", "Sacrifice a creature: This creature deals 2 damage to target creature.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "perm-bear", card: creature("Bear", ""), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-e", card: creature("Goblin", ""), controller: "ai", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [cannon, bear]);
    s = withBattlefield(s, "ai", [enemy]);
    const acts = activateActions(s).filter((a) => a.permanentId === "perm-c");
    expect(acts.length).toBeGreaterThan(0);                                   // valid lines still exist
    for (const a of acts) expect(a.targets.some((t) => t.id === a.sacCreatureId)).toBe(false);
  });

  it("sacrificing the victim fires a Blood-Artist watcher (aristocrats payoff)", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Altar", "Sacrifice a creature: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const victim = createPermanent({ id: "perm-v", card: creature("Token", ""), controller: "user", summoningSick: false });
    const artist = createPermanent({ id: "perm-ba", card: creature("Blood Artist", "Whenever a creature dies, each opponent loses 1 life."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, victim, artist]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const act = activateActions(s).find((a) => a.sacCreatureId === "perm-v");
    const afterDispatch = dispatchAction(s, act);
    const aiLifeBefore = afterDispatch.players.ai.life;
    const resolved = resolveTopOfStack(afterDispatch); // resolve the drain on top
    expect(resolved.players.ai.life).toBe(aiLifeBefore - 1);
  });
});

describe("activated abilities — γ1c exile-self + remove-counter costs", () => {
  const withLibrary = (state, playerId, library) =>
    ({ ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library } } });

  it("an Exile-this ability exiles the source (NOT to the graveyard — exile isn't 'dies') and resolves", () => {
    const relic = createPermanent({ id: "perm-r", card: creature("Relic", "{1}, Exile this artifact: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [relic]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 }, library: [{ id: "lib-1", name: "Card" }] } } };
    const act = activateActions(s).find((a) => a.exileSelf);
    expect(act).toBeTruthy();
    const after = dispatchAction(s, act);
    expect(after.players.user.battlefield.find((p) => p.id === "perm-r")).toBeUndefined();
    expect(after.players.user.exile.some((c) => c.name === "Relic")).toBe(true);       // exiled
    expect(after.players.user.graveyard.some((c) => c.name === "Relic")).toBe(false);  // NOT a death
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });

  it("does NOT offer an exile-self ability whose source has an LTB trigger (leave-trigger fail-safe reused)", () => {
    const relic = createPermanent({ id: "perm-r", card: creature("Loot", "When this artifact leaves the battlefield, create a Treasure token.\nExile this artifact: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const s = withLibrary(withBattlefield(mainState(), "user", [relic]), "user", [{ id: "lib-1", name: "Card" }]);
    expect(activateActions(s).filter((a) => a.exileSelf)).toHaveLength(0);
  });

  it("a Remove-a-counter ability is offered only when the source HAS the counter, and removes exactly one", () => {
    const card = creature("Engine", "Remove a +1/+1 counter from this creature: Draw a card.");
    const withCounters = { ...createPermanent({ id: "perm-c", card, controller: "user", summoningSick: false }), counters: { "+1/+1": 2 } };
    let s = withBattlefield(mainState(), "user", [withCounters]);
    s = withLibrary(s, "user", [{ id: "lib-1", name: "Card" }]);
    const act = activateActions(s).find((a) => a.removeCounter);
    expect(act).toMatchObject({ removeCounter: { type: "+1/+1" } });
    const after = dispatchAction(s, act);
    expect(after.players.user.battlefield.find((p) => p.id === "perm-c").counters["+1/+1"]).toBe(1);
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-1");
  });

  it("does NOT offer a Remove-a-counter ability when the source has none of that counter (unpayable)", () => {
    const card = creature("Engine", "Remove a +1/+1 counter from this creature: Draw a card.");
    const noCounters = createPermanent({ id: "perm-c", card, controller: "user", summoningSick: false }); // counters {}
    const s = withBattlefield(mainState(), "user", [noCounters]);
    expect(activateActions(s).filter((a) => a.removeCounter)).toHaveLength(0);
  });
});

// ═══ W3 (overhaul pass) — γ1b one-shot mana victim exclusion ═══════════════════════════════
// "{1}, Sacrifice a creature: …" where the chosen victim is an Eldrazi-Spawn-style ONE-SHOT
// mana source and ALSO the only way to pay the {1}: the action must not be offered (planPayment
// would crack the victim, then the sacrifice re-find would throw on an offered action).
describe("γ1b — one-shot mana victim exclusion (W3)", () => {
  it("does NOT offer the ability when the only mana route is cracking the chosen victim", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Altar", "{1}, Sacrifice a creature: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const spawn = createPermanent({
      id: "perm-s",
      card: { id: "card-s", name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", power: 0, toughness: 1, oracle: "Sacrifice this token: Add {C}." },
      controller: "user", summoningSick: false,
    });
    const s = withBattlefield(mainState(), "user", [outlet, spawn]);
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "perm-o" && a.sacCreatureId === "perm-s");
    expect(offers).toHaveLength(0);
  });

  it("offers it when a land can pay the {1}; the spawn is sacrificed for the COST", () => {
    const outlet = createPermanent({ id: "perm-o", card: creature("Altar", "{1}, Sacrifice a creature: Draw a card.", { type: "Artifact" }), controller: "user", summoningSick: false });
    const spawn = createPermanent({
      id: "perm-s",
      card: { id: "card-s", name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", power: 0, toughness: 1, oracle: "Sacrifice this token: Add {C}." },
      controller: "user", summoningSick: false,
    });
    const land = createPermanent({ id: "perm-l", card: { id: "card-l", name: "Wastes", type: "Basic Land", oracle: "{T}: Add {C}." }, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [outlet, spawn, land]);
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "perm-o" && a.sacCreatureId === "perm-s");
    expect(offers.length).toBeGreaterThan(0);
    s = dispatchAction(s, offers[0]);
    expect(s.players.user.battlefield.some((p) => p.id === "perm-s")).toBe(false); // sacrificed for the cost
    expect(s.players.user.battlefield.find((p) => p.id === "perm-l").tapped).toBe(true); // the land paid the {1}
  });
});
