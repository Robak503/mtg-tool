/**
 * damagedPlayerEdict.test.js — DP-SAC: "Whenever <source> deals combat damage to a player, THAT PLAYER
 * sacrifices a[n] <pool> of their choice." Demon of Loathing, Cabal Executioner (creature),
 * Destructive Urge (land), Akki Underminer (permanent).
 *
 * ⭐ THE THIRD TWIN OF ONE ARM. removal.js already carried the upkeep-player edict and the
 * defending-player edict, sharing a pool, an all-or-nothing anchor and a referent-or-nobody resolver.
 * This is the same arm with ctx.damagedPlayerId — same pool map, same anchor, same no-op-on-absent rule.
 *
 * ⛔ THE ANAPHOR STAYS LITERAL HERE, and that is a deliberate difference from the sentinel arms shipped
 * this run (cast / draw / each-opponent's-upkeep). Those events do not bind a damaged player, so their
 * "that player" had to be REWRITTEN to an event-gated sentinel before an atom could own it. The
 * combat-damage family is the one whose bare "that player" the existing who:"damagedPlayer" atoms already
 * own, and triggerRouting's DAMAGED_PLAYER_EVENTS gate keeps it off every other event — so this arm reads
 * the printed words and adds no rewrite.
 *
 * ⛔⛔ A WRONG-SEAT EDICT IS INVISIBLE, exactly like the wrong-seat damage this run has now pinned three
 * times: a creature dies, the log looks healthy, and only the OWNER is wrong. So the witness prints every
 * seat's battlefield size and the row asserts all four — a pin that checked "a creature was sacrificed"
 * would pass while the wrong player lost one.
 *
 * ⛔ ALL-OR-NOTHING POOL, inherited from the arm it copies: a count or filtered victim ("a monocolored
 * creature", "a non-Elf creature") fails the exact anchor and stays on the Arbiter. An unenforced victim
 * filter is a wrong-victim sacrifice, which is a forbidden FP.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the
 * resolver's damagedPlayer branch removed -> the trigger resolves and NOBODY sacrifices, while the
 * classification stays native — the silent do-nothing this run keeps finding, caught only by the runtime row.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DEMON = { id: "c-dl", name: "Demon of Loathing", type: "Creature — Demon", mana: "{6}{B}{B}", power: "7", toughness: "7",
  oracle: ["Flying, trample", "Whenever this creature deals combat damage to a player, that player sacrifices a creature of their choice."].join("\n") };
const AKKI = { id: "c-au", name: "Akki Underminer", type: "Creature — Goblin Rogue Shaman", mana: "{3}{R}", power: "2", toughness: "2",
  oracle: "Whenever this creature deals combat damage to a player, that player sacrifices a permanent of their choice." };
const DESTRUCTIVE_URGE = { id: "c-du", name: "Destructive Urge", type: "Enchantment — Aura", mana: "{2}{R}",
  oracle: ["Enchant creature", "Whenever enchanted creature deals combat damage to a player, that player sacrifices a land of their choice."].join("\n") };

describe("the carriers", () => {
  it("⭐ all four flip, across the creature / land / permanent pools", () => {
    const CABAL = { id: "c-ce", name: "Cabal Executioner", type: "Creature — Human Cleric", mana: "{3}{B}", power: "2", toughness: "2",
      oracle: ["Whenever this creature deals combat damage to a player, that player sacrifices a creature of their choice.", "Morph {3}{B}{B}"].join("\n") };
    for (const c of [DEMON, CABAL, DESTRUCTIVE_URGE, AKKI]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⛔ a FILTERED victim still parks — the anchor is the guard, not decoration", () => {
    // An unenforced victim filter is a wrong-victim sacrifice, which is the forbidden direction.
    expect(classifyCard({ ...DEMON, id: "c-f",
      oracle: "Whenever this creature deals combat damage to a player, that player sacrifices a non-Elf creature of their choice." }))
      .not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the DAMAGED seat sacrifices, and only that seat", () => {
  it("⭐⭐ ai2 takes the damage; ai2 loses the permanent", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, summoningSick: false });
    const atk = createPermanent({ id: "atk", card: DEMON, controller: "user", summoningSick: false });
    // Every seat holds a creature, so every seat is a POSSIBLE victim — an edict that hit the wrong player
    // would still find something to kill, which is exactly why this board is built this way.
    const before = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [atk, bear("u1", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [bear("a2", "ai2")] },
      ai3: { ...s0.players.ai3, battlefield: [bear("a3", "ai3")] } } };
    const sizes = (st) => Object.fromEntries(Object.keys(st.players).map((p) => [p, st.players[p].battlefield.length]));

    let s = checkCombatDamageTriggers(before, [{ kind: "combat-damage-player", attackerId: "atk", attackingPlayer: "user", defender: "ai2", amount: 7 }]);
    s = flushTriggers(s);
    let guard = 0;
    while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);

    const row = { before: sizes(before), after: sizes(s) };
    console.log("  WITNESS damagedPlayerEdict", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.ai2).toBe(row.before.ai2 - 1);   // the damaged seat lost one
    expect(row.after.ai1).toBe(row.before.ai1);       // …and nobody else did
    expect(row.after.ai3).toBe(row.before.ai3);
    expect(row.after.user).toBe(row.before.user);     // ⛔ least of all the controller
  });
});
