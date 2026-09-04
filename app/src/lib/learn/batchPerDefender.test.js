/**
 * batchPerDefender.test.js — ④-AN (2026-09-04 night): BATCH combat damage fires once per DAMAGED PLAYER (CR 603.2; the
 * Anowon, the Ruin Thief ruling — "if Rogues you control deal combat damage to more than one player at the same time, the
 * ability triggers once for each of those players"). The first cut fired the bare and subject-filtered batches once per
 * attacking player with no defender in the context — an under-fire on two-player swings, and the reason "that player"
 * payoffs on these batches could never route. checkBatchCombatDamageTriggers now fires once per (controller, damaged
 * player) pair with that pair's dealers gating the filter and damagedPlayerId + combatDamageAmount in the context; the
 * routing gate admits the batch event for both referents. Alela, Cunning Conqueror and Popular Entertainer flip. Real
 * oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkBatchCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GRIM = { id: "c-gh", name: "Grim Hireling", type: "Creature — Tiefling Rogue", mana: "{3}{B}", cmc: 4, power: 3, toughness: 2, keywords: [],
  oracle: "Whenever one or more creatures you control deal combat damage to a player, create a Treasure token." };
const OLIVIA = { id: "c-ov", name: "Olivia, Opulent Outlaw", type: "Legendary Creature — Vampire Assassin", mana: "{1}{R}{W}{B}", cmc: 4, power: 3, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nWhenever one or more outlaws you control deal combat damage to a player, create a Treasure token." };
const ALELA = { id: "c-al", name: "Alela, Cunning Conqueror", type: "Legendary Creature — Faerie Warlock", mana: "{2}{U}{B}", cmc: 4, power: 2, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nWhenever you cast your first spell during each opponent's turn, create a 1/1 black Faerie Rogue creature token with flying.\nWhenever one or more Faeries you control deal combat damage to a player, goad target creature that player controls." };

const perm = (id, card, controller) => createPermanent({ id, card: { id: `card-${id}`, ...card }, controller, summoningSick: false });
const dealer = (id, controller, type = "Creature — Beast") => perm(id, { name: id, type, mana: "{2}", cmc: 2, power: 3, toughness: 3, keywords: [], oracle: "" }, controller);

/** A four-seat pod in the combat-damage step; the user's watchers + dealers on the user's battlefield. */
function pod(userPerms, others = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of ["user", "ai1", "ai2", "ai3"]) players[seat] = { ...g.players[seat], battlefield: seat === "user" ? userPerms : (others[seat] || []), life: 20 };
  return { ...g, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", turn: 5, players };
}
const hit = (attackerId, defender, amount) => ({ kind: "combat-damage-player", attackerId, attackingPlayer: "user", defender, amount });
const pending = (s) => (s.pendingTriggers || []).map((t) => ({ name: t.source?.card?.name ?? t.source?.name ?? t.cardName ?? null, ctx: t.context || t.triggeringContext || {} }));

describe("once per DAMAGED PLAYER", () => {
  it("⭐ two players hit → TWO fires, each naming its own damaged player and that pair's total", () => {
    const s = pod([perm("gh", GRIM, "user"), dealer("a1", "user"), dealer("b1", "user"), dealer("c1", "user")]);
    const after = checkBatchCombatDamageTriggers(s, [hit("a1", "ai1", 3), hit("b1", "ai1", 3), hit("c1", "ai2", 3)]);
    const fired = pending(after);
    expect(fired).toHaveLength(2);
    expect(fired.map((f) => [f.ctx.damagedPlayerId, f.ctx.combatDamageAmount]).sort()).toEqual([["ai1", 6], ["ai2", 3]]);
  });

  it("one player hit by two attackers → ONE fire (the single-defender pins stand)", () => {
    const s = pod([perm("gh", GRIM, "user"), dealer("a1", "user"), dealer("b1", "user")]);
    const fired = pending(checkBatchCombatDamageTriggers(s, [hit("a1", "ai1", 2), hit("b1", "ai1", 3)]));
    expect(fired).toHaveLength(1);
    expect(fired[0].ctx).toMatchObject({ damagedPlayerId: "ai1", combatDamageAmount: 5 });
  });

  it("⛔ a FILTERED batch fires only for the player its matching dealer hit — the pair's dealers gate it, not the whole swing", () => {
    // an outlaw hits ai1; a plain Beast hits ai2 → Olivia fires once (ai1), never for ai2
    const s = pod([perm("ov", OLIVIA, "user"), dealer("rogue", "user", "Creature — Human Rogue"), dealer("beast", "user")]);
    const fired = pending(checkBatchCombatDamageTriggers(s, [hit("rogue", "ai1", 3), hit("beast", "ai2", 3)]));
    expect(fired).toHaveLength(1);
    expect(fired[0].ctx.damagedPlayerId).toBe("ai1");
  });
});

describe("the referent — 'that player controls' on a batch now routes and resolves to the damaged player's board", () => {
  it("⭐ Alela's goad routes natively; the pool with the batch context is exactly the damaged player's creatures", () => {
    const d = detectTriggers(ALELA).find((x) => x.event === "combatDamageBatch");
    expect(d).toBeTruthy();
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(ALELA)).toBe("native-trigger");
    const s = pod([perm("al", ALELA, "user")], { ai1: [dealer("x1", "ai1")], ai2: [dealer("y1", "ai2")] });
    const pool = (ctx) => enumerateTargets(s, "user", { targetType: "creature", restrictions: [{ kind: "controller", who: "damagedPlayer" }] }, [], ctx).map((t) => t.id);
    expect(pool({ damagedPlayerId: "ai1" })).toEqual(["x1"]);
    expect(pool({ damagedPlayerId: "ai2" })).toEqual(["y1"]);
    expect(pool({ batchController: "user" })).toEqual([]); // the old, referent-less context: nothing — fail closed
  });
});
