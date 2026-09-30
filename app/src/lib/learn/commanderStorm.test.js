/**
 * commanderStorm.test.js — "When you cast this spell, copy it for each time you've cast your commander from the command zone
 * this game." (the 09-06 plan's stage ③ · 49, 2026-09-30 — Empyrial Storm, Hatut Zeraze Strike Force).
 *
 * The Commander 2018/2019 storm cycle's PRINTED self-cast trigger. It rides storm's machinery end to end: detectTriggers marks
 * the descriptor a storm copy with stormCountSource "commanderCasts"; the cast path snapshots the spell for the copy atom;
 * the copy atom counts the caster's command-zone casts (gameState.commanderCastsFromCommandZone — the per-commander tally the
 * cast chokepoint bumps, CR 903.8) LIVE as the trigger resolves, so a commander cast in response counts. The trigger line
 * is peeled from the spell's own body with storm's line (castModifiers.stripStormKeywordLine), and coverage's storm branch
 * credits the spell only when the trigger routes natively. A creature spell's copies become tokens (CR 707.10f).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EMPYRIAL_STORM = { id: "es", name: "Empyrial Storm", type: "Sorcery", mana: "{4}{W}{W}", mana_cost: "{4}{W}{W}", cmc: 6, colors: ["W"], keywords: [],
  oracle: "When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nCreate a 4/4 white Angel creature token with flying." };
const HATUT = { id: "hz", name: "Hatut Zeraze Strike Force", type: "Creature — Human Spy Warrior", mana: "{3}{W}", mana_cost: "{3}{W}", cmc: 4, colors: ["W"], power: "2", toughness: "2", keywords: [],
  oracle: "When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nWhen this creature enters, destroy up to one target artifact or enchantment." };
const SKULL_STORM = { name: "Skull Storm", type: "Sorcery", mana: "{7}{B}{B}", cmc: 9, colors: ["B"], keywords: [],
  oracle: "When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nEach opponent sacrifices a creature of their choice. Each opponent who can't loses half their life, rounded up." };

// The user in their main phase with `card` in hand, having cast their commander(s) from the command zone `casts` times.
function board(card, casts) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, hand: [card], commanderCastCount: casts, manaPool: { ...g.players.user.manaPool, W: 10, C: 10 } } } };
}
const cast = (s, cardId) => dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId));
const drain = (s0) => { let s = s0; for (let i = 0; i < 40 && s.stack.length > 0 && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const angels = (s) => s.players.user.battlefield.filter((p) => /Angel/.test(p.card?.name || p.card?.type || "")).length;

describe("the carriers", () => {
  it("⭐ Empyrial Storm and Hatut Zeraze Strike Force read native; the printed trigger is a storm copy counting command-zone casts", () => {
    expect([EMPYRIAL_STORM, HATUT].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
    const t = detectTriggers(EMPYRIAL_STORM).find((d) => d.event === "selfCast");
    expect({ storm: t?.stormCopy, source: t?.stormCountSource }).toEqual({ storm: true, source: "commanderCasts" });
  });
  it("Skull Storm still parks on its own body", () => {
    expect(isNativeTier(classifyCard(SKULL_STORM))).toBe(false);
  });
});

describe("⭐ the real cast: one copy per command-zone cast", () => {
  it("⭐ commander cast twice (one commander) → two copies → three Angels; never cast → just the one", () => {
    const row = { twice: angels(drain(cast(board(EMPYRIAL_STORM, { cmdr: 2 }), "es"))), never: angels(drain(cast(board(EMPYRIAL_STORM, {}), "es"))) };
    console.log(`WITNESS commanderStorm ${JSON.stringify(row)}`);
    expect(row).toEqual({ twice: 3, never: 1 });
  });
  it("partners count together — two commanders cast once each → two copies", () => {
    expect(angels(drain(cast(board(EMPYRIAL_STORM, { cmdrA: 1, cmdrB: 1 }), "es")))).toBe(3);
  });
  it("⭐ the count is read as the trigger RESOLVES — a commander cast in response adds a copy", () => {
    let s = cast(board(EMPYRIAL_STORM, { cmdr: 1 }), "es");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, commanderCastCount: { cmdr: 2 } } } }; // cast again in response
    expect(angels(drain(s))).toBe(3);
  });
  it("⭐ a creature spell's copies become tokens (CR 707.10f) — Hatut with one command-zone cast: the card and one token copy", () => {
    const out = drain(cast(board(HATUT, { cmdr: 1 }), "hz"));
    const hatuts = out.players.user.battlefield.filter((p) => p.card?.name === "Hatut Zeraze Strike Force");
    expect({ total: hatuts.length, tokens: hatuts.filter((p) => p.card?.token).length }).toEqual({ total: 2, tokens: 1 });
  });
});
