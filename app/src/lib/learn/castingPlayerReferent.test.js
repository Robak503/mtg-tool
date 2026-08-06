/**
 * castingPlayerReferent.test.js — TP-1: "that player" on a CAST trigger means THE PLAYER WHO CAST.
 * Eidolon of the Great Revel, Pyrostatic Pillar, Aether Sting, Spellshock, Ishi-Ishi, Ruric Thar,
 * Scalding Viper, Cindervines (damage) · Kambal, Soot Imp, Yawgmoth's Edict (life loss).
 *
 * ⛔⛔ THE BARE WORDS "THAT PLAYER" ARE CORPUS-AMBIGUOUS — they mean the upkeep player, the damaged player,
 * the milled player, the discarder or the CASTER depending entirely on the event overhead. That is why this
 * is an EVENT-GATED REWRITE in detectTriggers (the fifth arm, after gyOwner / upkeep-player /
 * discarding-player) and never a clause matcher, and why triggerRouting pins the resulting referent back to
 * the same event. A matcher reading the words alone would bind the wrong seat.
 *
 * ⛔⛔ AND A WRONG-SEAT BUG IS INVISIBLE, which is what every assertion here is shaped around. The ability
 * resolves, a player takes the damage, the log looks healthy — only the IDENTITY is wrong. A pin asserting
 * "2 damage was dealt to an opponent" passes while hitting the wrong player two times in three. So the
 * witness rows print the WHOLE TABLE of seat life totals and assert every seat, not just the victim.
 *
 * ⚠️⚠️ THE FIRST CUT MEASURED **+11 GAINED / 4 LOST** AND THE LOSSES ARE THE INSTRUCTIVE PART. Rhystic
 * Study, White Rhystic Study, Esper Sentinel and Mystic Remora all say "…unless that player pays {1}", and
 * their matcher keyed on those LITERAL words. The rewrite renamed the anaphor under them — same referent,
 * same ctx.castingPlayerId, different spelling — and four shipped cards silently fell out of native.
 * **A rewrite is a rename, and a rename breaks every reader that spelled the old name out.** Fixed by
 * teaching those matchers both spellings rather than special-casing the rewrite, so there stays one
 * vocabulary. Both are pinned below as regression rows.
 *
 * ⓘ `whose` does not affect the referent, and that is worth an assertion rather than a comment: Eidolon
 * watches "a player" (whose:"any") and Kambal watches "an opponent" (whose:"opponent"). The whose-filter
 * decides IF the trigger fires, never WHO it points at.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 *   · the cast arm removed from the detectTriggers rewrite -> all 11 carriers park again.
 *   · who:"castingPlayer" dropped from the triggerRouting pin -> the referent is no longer bound to the cast
 *     event (the gate that keeps these atoms off events that cannot supply a caster).
 *   · the resolver's castingPlayer branch removed -> the trigger resolves and NOBODY takes damage: the
 *     silent do-nothing this file exists to forbid.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EIDOLON = { id: "c-eid", name: "Eidolon of the Great Revel", type: "Creature — Spirit", mana: "{R}{R}", power: "2", toughness: "2",
  oracle: "Whenever a player casts a spell with mana value 3 or less, this creature deals 2 damage to that player." };
const SPELLSHOCK = { id: "c-ss", name: "Spellshock", type: "Enchantment", mana: "{2}{R}",
  oracle: "Whenever a player casts a spell, this enchantment deals 2 damage to that player." };
const KAMBAL = { id: "c-kam", name: "Kambal, Consul of Allocation", type: "Legendary Creature — Human Advisor", mana: "{2}{W}{B}", power: "2", toughness: "3",
  oracle: "Whenever an opponent casts a noncreature spell, that player loses 2 life and you gain 2 life." };
const SOOT_IMP = { id: "c-si", name: "Soot Imp", type: "Creature — Imp", mana: "{2}{B}", power: "1", toughness: "1",
  oracle: "Flying\nWhenever a player casts a nonblack spell, that player loses 1 life." };
const RHYSTIC_STUDY = { id: "c-rs", name: "Rhystic Study", type: "Enchantment", mana: "{2}{U}",
  oracle: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}." };
const ESPER_SENTINEL = { id: "c-es", name: "Esper Sentinel", type: "Artifact Creature — Human Soldier", mana: "{W}", power: "1", toughness: "1",
  oracle: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power." };

describe("the carriers", () => {
  it("⭐ the damage and life-loss families both flip", () => {
    for (const c of [EIDOLON, SPELLSHOCK, KAMBAL, SOOT_IMP]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⛔⛔ REGRESSION — the '…unless that player pays' family is STILL native (4 cards lost on the first cut)", () => {
    // The rewrite renamed the anaphor under matchers that spelled the old name out. These two rows are the
    // measurement that caught it; do not delete them when the rewrite is next touched.
    expect(classifyCard(RHYSTIC_STUDY)).toMatch(/^native/);
    expect(classifyCard(ESPER_SENTINEL)).toMatch(/^native/);
  });

  it("⭐ the sentinel rewrite is EVENT-GATED — it fires on a cast trigger and nowhere else", () => {
    const castClause = detectTriggers(EIDOLON).find((t) => t.event === "cast")?.effectClause;
    expect(castClause).toContain("the casting player");   // rewritten
    // …and an ETB trigger's "that player" is NOT touched by this arm (no caster exists on an ETB).
    const etb = detectTriggers({ name: "Probe", type: "Creature — Bear", mana: "{1}", power: "1", toughness: "1",
      oracle: "When this creature enters, target opponent loses 1 life. That player discards a card." });
    for (const d of etb) expect(String(d.effectClause || "")).not.toContain("the casting player");
  });
});

/** A 4-seat commander board with `perms` under the user's control and a known life total per seat. */
function fourSeatBoard(perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const built = perms.map((p) => createPermanent({ id: p.id, card: p.card, controller: "user", summoningSick: false }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: built } } };
}
const lifeTable = (s) => Object.fromEntries(Object.keys(s.players).map((pid) => [pid, s.players[pid].life]));

/** Fire a cast trigger for `casterId`, flush it onto the stack and resolve everything waiting. */
function castAndResolve(state, spellCard, casterId) {
  let s = checkCastTriggers(state, { spellCard, casterId });
  s = flushTriggers(s);
  let guard = 0;
  while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
  return s;
}

describe("⭐⭐ LAW 6 — the WRONG-SEAT pin, on a four-seat board", () => {
  it("⭐⭐ Eidolon hits the seat that CAST, not an arbitrary opponent", () => {
    // ⛔ THE THIRD OPPONENT CASTS ON PURPOSE. With ai3 as the caster, every lazy implementation — "the
    // controller's first opponent", "the active player", "each opponent" — lands somewhere else, and the
    // whole life table below says so by seat rather than by a single victim assertion.
    const before = fourSeatBoard([{ id: "eid", card: EIDOLON }]);
    const after = castAndResolve(before, { id: "s1", name: "Bolt", type: "Instant", mana: "{R}", cmc: 1 }, "ai3");
    const row = { before: lifeTable(before), after: lifeTable(after) };
    console.log("  WITNESS castingPlayerDamage", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.ai3).toBe(row.before.ai3 - 2);   // the caster took it
    expect(row.after.ai1).toBe(row.before.ai1);       // …and nobody else did
    expect(row.after.ai2).toBe(row.before.ai2);
    expect(row.after.user).toBe(row.before.user);
  });

  it("⭐⭐ …and it hits the CONTROLLER when the controller is the one who cast (whose:'any')", () => {
    // Eidolon watches "a player", so its own controller is a legal victim. A build that quietly scoped the
    // referent to "an opponent" would pass every row above and fail exactly here.
    const before = fourSeatBoard([{ id: "eid", card: EIDOLON }]);
    const after = castAndResolve(before, { id: "s1", name: "Bolt", type: "Instant", mana: "{R}", cmc: 1 }, "user");
    const row = { before: lifeTable(before), after: lifeTable(after) };
    console.log("  WITNESS castingPlayerSelf", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.user).toBe(row.before.user - 2);
    expect(row.after.ai1).toBe(row.before.ai1);
    expect(row.after.ai2).toBe(row.before.ai2);
    expect(row.after.ai3).toBe(row.before.ai3);
  });

  it("⭐⭐ Kambal's LIFE-LOSS half drains the caster and gains the controller", () => {
    const before = fourSeatBoard([{ id: "kam", card: KAMBAL }]);
    const after = castAndResolve(before, { id: "s2", name: "Sign in Blood", type: "Sorcery", mana: "{B}{B}", cmc: 2 }, "ai2");
    const row = { before: lifeTable(before), after: lifeTable(after) };
    console.log("  WITNESS castingPlayerLifeLoss", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.ai2).toBe(row.before.ai2 - 2);    // the caster loses
    expect(row.after.user).toBe(row.before.user + 2);  // the controller gains
    expect(row.after.ai1).toBe(row.before.ai1);
    expect(row.after.ai3).toBe(row.before.ai3);
  });

  it("⛔ the SPELL FILTER still gates the fire — an MV-4 spell doesn't wake Eidolon", () => {
    // The positive control for every row above: if the trigger fired on everything, the seat assertions
    // would still pass and mean nothing about the filter.
    const before = fourSeatBoard([{ id: "eid", card: EIDOLON }]);
    const after = castAndResolve(before, { id: "s3", name: "Big", type: "Sorcery", mana: "{3}{R}", cmc: 4 }, "ai3");
    expect(lifeTable(after)).toEqual(lifeTable(before));
  });
});

describe("⛔⛔ THE ROUTING PIN — the belt on top of the event-gated rewrite", () => {
  it("⛔⛔ a castingPlayer atom routes natively ONLY on a cast event", () => {
    // ⚠️ WRITTEN AFTER A MUTANT SURVIVED. Every row above drives a CAST event, so none of them could tell
    // whether this pin exists — disabling it changed nothing and the file still went green. The pin's job is
    // the negative case: keep the atom OFF events that cannot supply a caster, where the referent would be
    // unset, the damage would be 0, and the clause would SILENTLY DROP while the card read native.
    // The sentinel rewrite is already cast-gated, so this is defence in depth — which is exactly the
    // relationship the gyOwner entry beside it describes for itself.
    const program = { atoms: [{ op: "deal-damage", amount: 2, target: "castingPlayer", who: "castingPlayer", targetType: null }] };
    const row = Object.fromEntries(["cast", "etb", "dies", "upkeep", "attacks", "discarded"]
      .map((e) => [e, combatDamageReferentSatisfied(program, e)]));
    console.log("  WITNESS castingPlayerRouting", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ cast: true, etb: false, dies: false, upkeep: false, attacks: false, discarded: false });
  });
});
