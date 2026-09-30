/**
 * GY-1/GY-2 (CR 608.2n / 608.3b) — overhaul pass: a natively-resolved instant/sorcery reaches its
 * owner's GRAVEYARD as the final step of resolution (it used to vanish off the stack — every
 * GY-count consumer under-read, and Regrowth could never return a resolved spell). Storm copies
 * cease to exist instead (CR 707.10a — the anti-duplicate guard strips the disposition at clone);
 * a fizzled Aura spell also reaches the graveyard. Arbiter-routed spells still vanish (the Arbiter
 * owns their disposition — documented FN). Suspension coverage (the spell is NOT in the GY while a
 * pendingChoice is open, and lands exactly once after the settle) is pinned in scrySurveil /
 * impulseDig / gyRecursion / discard tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const BOLT = { id: "c-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const mountain = (id) => createPermanent({ id, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false });

function mainState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
}
function withUser(state, patch) {
  return { ...state, players: { ...state.players, user: { ...state.players.user, ...patch } } };
}
function resolveAll(s) {
  while (s.stack.length) s = resolveTopOfStack(s);
  return s;
}

describe("GY-1 — the resolved spell reaches its owner's graveyard (CR 608.2n)", () => {
  it("a plain burn instant resolves, then lands in the caster's graveyard exactly once", () => {
    let s = withUser(mainState(), { hand: [BOLT], battlefield: [mountain("m1")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-bolt" && a.targets?.some((t) => t.id === "ai"));
    expect(cast).toBeTruthy();
    s = resolveAll(dispatchAction(s, cast));
    expect(s.players.ai.life).toBe(37);                                              // the effect resolved
    expect(s.players.user.graveyard.filter((c) => c.id === "c-bolt")).toHaveLength(1); // exactly one copy
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.stack).toHaveLength(0);
    expect(s.log.some((e) => e.kind === "spell-to-graveyard" && e.cardName === "Lightning Bolt")).toBe(true);
  });

  it("STORM: copies cease to exist — only the ORIGINAL card is binned (CR 707.10a)", () => {
    const WARRENS = {
      id: "c-etw", name: "Empty the Warrens", type: "Sorcery", mana: "{3}{R}",
      oracle: "Create two 1/1 red Goblin creature tokens.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
    };
    let s = withUser(mainState(), {
      hand: [BOLT, WARRENS],
      battlefield: [mountain("m1"), mountain("m2"), mountain("m3"), mountain("m4"), mountain("m5")],
    });
    // Cast + resolve Bolt first (spellsCastThisTurn = 1) …
    const bolt = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-bolt" && a.targets?.some((t) => t.id === "ai"));
    s = resolveAll(dispatchAction(s, bolt));
    // … then the storm spell: 1 prior spell → 1 copy; both resolve (2 + 2 Goblins).
    const etw = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-etw");
    expect(etw).toBeTruthy();
    s = resolveAll(dispatchAction(s, etw));
    const goblins = s.players.user.battlefield.filter((p) => p.card?.name?.includes("Goblin"));
    expect(goblins).toHaveLength(4);                                                  // original + 1 storm copy
    expect(s.players.user.graveyard.filter((c) => c.id === "c-etw")).toHaveLength(1); // ONE card, no phantom duplicate
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["c-bolt", "c-etw"]);
  });
});

describe("GY-2 — a fizzled Aura spell reaches its owner's graveyard (CR 608.3b)", () => {
  it("an Aura whose target is gone at resolution is binned, not vanished", () => {
    const PACT = { id: "c-pact", name: "Warrior's Pact", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant creature\nEnchanted creature gets +2/+2." };
    const bear = createPermanent({ id: "perm-b", card: { id: "card-b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const forest = createPermanent({ id: "f1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    let s = withUser(mainState(), { hand: [PACT], battlefield: [bear, forest] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-pact");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    // The target dies in response (yank it off the battlefield before resolution).
    s = withUser(s, { battlefield: s.players.user.battlefield.filter((p) => p.id !== "perm-b") });
    s = resolveAll(s);
    expect(s.log.some((e) => e.kind === "spell-fizzle")).toBe(true);                  // it fizzled…
    expect(s.players.user.graveyard.some((c) => c.id === "c-pact")).toBe(true);       // …into the graveyard
    expect(s.players.user.battlefield.some((p) => p.card?.id === "c-pact")).toBe(false);
  });
});
