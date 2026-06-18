/**
 * TOK-2 — named artifact tokens (Treasure / Clue / Food / Gold), end-to-end.
 *
 * The CREED-critical invariant this file pins: a minted Treasure/Gold is a ONE-SHOT mana source —
 * it is SACRIFICED when used (auto-pay or explicit tap-for-mana), never merely tapped, so it can
 * never ramp forever (the false positive this feature exists to avoid). Clue/Food resolve through
 * the activated-ability stack path (sac cost → draw / gain 3 life). Blood/Map/Powerstone are NOT
 * modeled (stay low → Arbiter), pinned in parser.test.js.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TOKEN_ORACLE = {
  Treasure: "{T}, Sacrifice this artifact: Add one mana of any color.",
  Clue: "{2}, Sacrifice this artifact: Draw a card.",
  Food: "{2}, {T}, Sacrifice this artifact: You gain 3 life.",
  Gold: "Sacrifice this artifact: Add one mana of any color.",
};
function tokenPerm(name, id) {
  const card = { id: `tok-${id}`, name, type: `Token Artifact — ${name}`, oracle: TOKEN_ORACLE[name], token: true };
  return createPermanent({ id, card, controller: "user", summoningSick: false });
}
function forest(id) {
  return createPermanent({ id, card: { id: `c-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withUser(state, patch) {
  return { ...state, players: { ...state.players, user: { ...state.players.user, ...patch } } };
}
const totalPool = (player) => Object.values(player.manaPool).reduce((a, b) => a + b, 0);

describe("TOK-2 — Treasure / Gold are one-shot mana (sacrificed, never reusable)", () => {
  it("auto-paying a spell SACRIFICES the Treasure (not just taps it)", () => {
    const spell = { id: "spell1", name: "Gainer", type: "Sorcery", mana: "{1}", oracle: "You gain 1 life." };
    let s = withUser(mainState(), { battlefield: [tokenPerm("Treasure", "treas")], hand: [spell] });
    // Affordable ONLY via the Treasure (empty pool, no lands).
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "spell1");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.players.user.battlefield.find((p) => p.id === "treas")).toBeUndefined(); // gone
    expect(after.players.user.graveyard.some((c) => c.name === "Treasure")).toBe(true);   // sacrificed, not tapped
    expect(after.stack.map((o) => o.source?.name)).toContain("Gainer");                   // spell cast
  });

  it("explicit tap-for-mana floats 1 mana and sacrifices the Treasure", () => {
    const s = withUser(mainState(), { battlefield: [tokenPerm("Treasure", "treas")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "treas");
    expect(tap).toMatchObject({ sacrifices: true });
    const after = dispatchAction(s, tap);
    expect(after.players.user.battlefield.find((p) => p.id === "treas")).toBeUndefined();
    expect(after.players.user.graveyard.some((c) => c.name === "Treasure")).toBe(true);
    expect(totalPool(after.players.user)).toBe(1); // one any-color mana floated
  });

  it("Gold (no {T}) is also a one-shot sacrifice-for-mana source", () => {
    const s = withUser(mainState(), { battlefield: [tokenPerm("Gold", "gold")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "gold");
    expect(tap).toMatchObject({ sacrifices: true });
    const after = dispatchAction(s, tap);
    expect(after.players.user.graveyard.some((c) => c.name === "Gold")).toBe(true);
  });

  it("prefers a land over cracking a Treasure when both can pay the generic", () => {
    const spell = { id: "spell1", name: "Gainer", type: "Sorcery", mana: "{1}", oracle: "You gain 1 life." };
    let s = withUser(mainState(), { battlefield: [tokenPerm("Treasure", "treas"), forest("f1")], hand: [spell] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "spell1");
    const after = dispatchAction(s, cast);
    expect(after.players.user.battlefield.find((p) => p.id === "treas")).toBeTruthy();   // Treasure preserved
    expect(after.players.user.battlefield.find((p) => p.id === "f1").tapped).toBe(true); // land paid instead
  });
});

describe("TOK-2 — Clue / Food activate via the stack path", () => {
  it("Clue: {2}, Sacrifice → draw a card (sacrificed as a cost, then resolves)", () => {
    let s = withUser(mainState(), { battlefield: [tokenPerm("Clue", "clue"), forest("f1"), forest("f2")], library: [{ id: "lib1", name: "Card" }] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "clue");
    expect(act).toMatchObject({ sacSelf: true });
    const dispatched = dispatchAction(s, act);
    expect(dispatched.players.user.battlefield.find((p) => p.id === "clue")).toBeUndefined(); // sac'd as cost
    const resolved = resolveTopOfStack(dispatched);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib1");
  });

  it("Food: {2}, {T}, Sacrifice → gain 3 life", () => {
    let s = withUser(mainState(), { battlefield: [tokenPerm("Food", "food"), forest("f1"), forest("f2")] });
    const lifeBefore = s.players.user.life;
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "food");
    expect(act).toMatchObject({ sacSelf: true, tapSelf: true });
    const dispatched = dispatchAction(s, act);
    const resolved = resolveTopOfStack(dispatched);
    expect(resolved.players.user.graveyard.some((c) => c.name === "Food")).toBe(true);
    expect(resolved.players.user.life).toBe(lifeBefore + 3);
  });
});

describe("TOK-2 — a 'Create a Treasure token.' spell mints a real Treasure", () => {
  it("casts and resolves to a Treasure permanent on the battlefield", () => {
    const spell = { id: "mk", name: "Make Treasure", type: "Sorcery", mana: "{1}", oracle: "Create a Treasure token." };
    let s = withUser(mainState(), { battlefield: [forest("f1")], hand: [spell] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "mk");
    expect(cast).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, cast));
    const treasure = resolved.players.user.battlefield.find((p) => p.card?.name === "Treasure");
    expect(treasure).toBeTruthy();
    expect(treasure.card.type).toContain("Artifact");
  });
});
