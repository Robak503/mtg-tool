/**
 * defendingPlayerDiscard.test.js — DP-DISC: "defending player discards a card[ at random]" (CR 508.1).
 * Abyssal Nightstalker, The Haunt of Hightower, Shrieking Specter (ATTACKS) · Alley Grifters,
 * Slate Street Ruffian (BECOMES-BLOCKED) · Corrupt Official (the at-random twin).
 *
 * ⭐ THE THIRD REFERENT ARM OF ONE MATCHER. hand.js already carried the damagedPlayer discard and the
 * upkeepPlayer discard, sharing a count grammar, an at-random flag and a referent-or-nobody resolver.
 * This is the same arm with ctx.defenderId — no new machinery, one regex and one resolver branch.
 *
 * ⛔ AND NO SENTINEL REWRITE, unlike the upkeep arm beside it. "Defending player" is PRINTED oracle text
 * (CR 508.1), not an anaphor, so there is nothing to disambiguate. The three arms shipped earlier today
 * (cast / draw / each-opponent's-upkeep) each needed an event-gated rewrite because their events bind no
 * such player and their "that player" was ambiguous; this one reads the words as printed. Which families
 * need a sentinel and which do not is the actual map of this vein.
 *
 * ⛔⛔ TWO EVENTS, AND BOTH ARE DRIVEN. ctx.defenderId is threaded by checkAttackTriggers (attacks /
 * attacksAlone) AND by checkBlockTriggers (becomesBlocked) — which is exactly the split these six cards
 * fall into. A pin driving only one event would leave half the family unproven while reading fully green.
 *
 * ⛔⛔ A WRONG-SEAT DISCARD IS INVISIBLE: a card leaves a hand, the log looks healthy, and only the OWNER
 * is wrong. Every seat below holds cards, so a mis-aimed discard would still find something to take.
 *
 * ⚠️ THE WITNESS READS THE `discard-pending` LOG, NOT A SHRUNKEN HAND, AND THAT IS THE CORRECT CONTRACT —
 * my first cut asserted the hand size and read all-zero on both events. The discard SUSPENDS on a choice
 * (the discarder picks their own card, CR 701.9b), so the hand does not shrink until that choice is made;
 * the atom, the resolver and the seat selection were all correct the whole time. Checking the harness
 * before the code is what kept this from reading as a broken build. The log entry names the seat that owes
 * the discard, which is exactly the wrong-seat question — the same convention
 * auraOwnActivatedPlusTrigger.test.js uses. The per-seat hand table rides along as the other half: nobody
 * ELSE may lose a card either.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the
 * resolver's defendingPlayer branch removed -> the trigger resolves and NOBODY discards, while
 * classification stays native. The fifth time this run a metric-only view could not see a do-nothing.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { checkAttackTriggers, checkBlockTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NIGHTSTALKER = { id: "c-an", name: "Abyssal Nightstalker", type: "Creature — Nightstalker", mana: "{4}{B}{B}", power: "2", toughness: "3",
  oracle: "Whenever this creature attacks, defending player discards a card." };
const ALLEY_GRIFTERS = { id: "c-ag", name: "Alley Grifters", type: "Creature — Human Rogue", mana: "{2}{B}", power: "2", toughness: "2",
  oracle: "Whenever this creature becomes blocked, defending player discards a card." };
const CORRUPT_OFFICIAL = { id: "c-co", name: "Corrupt Official", type: "Creature — Human Advisor", mana: "{4}{B}", power: "2", toughness: "3",
  oracle: "Whenever this creature becomes blocked, defending player discards a card at random." };

describe("the carriers", () => {
  it("⭐ both events and the at-random twin flip", () => {
    const HAUNT = { id: "c-hh", name: "The Haunt of Hightower", type: "Legendary Creature — Vampire", mana: "{2}{B}{B}", power: "1", toughness: "1",
      oracle: ["Flying", "Whenever this creature attacks, defending player discards a card."].join("\n") };
    for (const c of [NIGHTSTALKER, HAUNT, ALLEY_GRIFTERS, CORRUPT_OFFICIAL]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });
});

function board(watcherCard) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const w = createPermanent({ id: "w", card: watcherCard, controller: "user", summoningSick: false });
  const card = (n) => ({ id: `h-${n}`, name: n, type: "Instant", oracle: "" });
  // ⛔ EVERY SEAT HOLDS CARDS. A discard aimed at the wrong player would still take one, so an assertion
  // that "a card was discarded" proves nothing — only the per-seat table does.
  const hand = (n) => [card(`${n}1`), card(`${n}2`)];
  return { ...s, players: { ...s.players,
    user: { ...s.players.user, battlefield: [w], hand: hand("u") },
    ai1: { ...s.players.ai1, hand: hand("a") },
    ai2: { ...s.players.ai2, hand: hand("b") },
    ai3: { ...s.players.ai3, hand: hand("c") } } };
}
const hands = (st) => Object.fromEntries(Object.keys(st.players).map((p) => [p, st.players[p].hand.length]));
const drain = (st) => { let s = flushTriggers(st), g = 0; while ((s.stack || []).length && g++ < 10) s = resolveTopOfStack(s); return s; };

describe("⭐⭐ LAW 6 — the DEFENDER discards, on BOTH events", () => {
  it("⭐⭐ ATTACKS: the defended seat loses a card, nobody else does", () => {
    // ai2 is defended — deliberately not the first opponent, so "the controller's first opponent" fails.
    const before = { ...board(NIGHTSTALKER), combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai2" }], blockers: [] } };
    const after = drain(checkAttackTriggers(before));
    const owed = (after.log || []).filter((e) => e.kind === "discard-pending");
    const row = { owedBy: owed.map((e) => e.controller), owedCount: owed.length, hands: hands(after) };
    console.log("  WITNESS defendingPlayerDiscardAttacks", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.owedCount).toBe(1);
    expect(row.owedBy).toEqual(["ai2"]);            // ⛔ the DEFENDED seat, not ai1 and not the attacker
    expect(row.hands).toEqual(hands(before));       // …and nobody has lost a card yet — the choice is pending
  });

  it("⭐⭐ BECOMES-BLOCKED: the same referent on the other event", () => {
    // The block path threads ctx.defenderId through checkBlockTriggers — a different function than the
    // attacks path, which is why driving only one event would leave half this family unproven.
    const base = board(ALLEY_GRIFTERS);
    const blocker = createPermanent({ id: "blk", card: { id: "c-blk", name: "Blocker", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai3", summoningSick: false });
    const before = { ...base,
      players: { ...base.players, ai3: { ...base.players.ai3, battlefield: [blocker] } },
      combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai3" }], blockers: [{ blockerId: "blk", attackerId: "w" }] } };
    const after = drain(checkBlockTriggers(before));
    const owed = (after.log || []).filter((e) => e.kind === "discard-pending");
    const row = { owedBy: owed.map((e) => e.controller), owedCount: owed.length, hands: hands(after) };
    console.log("  WITNESS defendingPlayerDiscardBlocked", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.owedCount).toBe(1);
    expect(row.owedBy).toEqual(["ai3"]);
    expect(row.hands).toEqual(hands(before));
  });
});

// ─── DP-TAIL: the two arms that were NARROWER than their siblings ────────────────────────────────────
const FALKENRATH = { id: "c-fp", name: "Falkenrath Perforator", type: "Creature — Vampire", mana: "{2}{B}", power: "2", toughness: "1",
  oracle: "Whenever this creature attacks, it deals 1 damage to defending player." };
const THRESHER = { id: "c-tb", name: "Thresher Beast", type: "Creature — Beast", mana: "{4}{G}", power: "3", toughness: "4",
  oracle: "Whenever this creature becomes blocked, defending player sacrifices a land of their choice." };

describe("⭐⭐ DP-TAIL — two defendingPlayer arms were narrower than their own siblings", () => {
  it("⭐ both flip", () => {
    expect(classifyCard(FALKENRATH)).toMatch(/^native/);
    expect(classifyCard(THRESHER)).toMatch(/^native/);
  });

  it("⛔ the sacrifice arm widened its NOUN set only — filtered and counted victims still refuse", () => {
    // The comment this replaced said "BARE creature pool only — a typed/filtered/count variant fails the
    // exact anchor". The filtered and count halves of that are UNCHANGED: UP_POOL is a fixed allowlist of
    // printed pool nouns, not a wildcard, so a wrong-victim sacrifice stays unreachable from here.
    for (const bad of ["defending player sacrifices a non-Elf creature of their choice",
                       "defending player sacrifices two creatures of their choice"]) {
      expect(parseEffectClause(bad, "Instant", { sourceScoped: true })?.atoms ?? []).toEqual([]);
    }
    // …while the widened nouns parse, to the pool the resolver already honours.
    expect(parseEffectClause("defending player sacrifices a land of their choice", "Instant", { sourceScoped: true })?.atoms)
      .toEqual([{ op: "sacrifice", who: "defendingPlayer", what: "land" }]);
  });

  it("⭐⭐ LAW 6 — the DEFENDED seat takes the damage, and only that seat", () => {
    const base = board(FALKENRATH);
    const before = { ...base, combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai2" }], blockers: [] } };
    const after = drain(checkAttackTriggers(before));
    const life = (st) => Object.fromEntries(Object.keys(st.players).map((p) => [p, st.players[p].life]));
    const row = { before: life(before), after: life(after) };
    console.log("  WITNESS defendingPlayerDamage", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.ai2).toBe(row.before.ai2 - 1);
    expect(row.after.ai1).toBe(row.before.ai1);
    expect(row.after.ai3).toBe(row.before.ai3);
    expect(row.after.user).toBe(row.before.user);
  });

  it("⭐⭐ LAW 6 — the DEFENDED seat sacrifices the land, and only that seat", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const land = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl, summoningSick: false });
    const w = createPermanent({ id: "w", card: THRESHER, controller: "user", summoningSick: false });
    const blocker = createPermanent({ id: "blk", card: { id: "c-blk", name: "Blocker", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai3", summoningSick: false });
    // ⛔ EVERY SEAT HOLDS A LAND, so a mis-aimed edict would still find one to take.
    const before = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [w, land("lu", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [land("l1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [land("l2", "ai2")] },
      ai3: { ...s0.players.ai3, battlefield: [blocker, land("l3", "ai3")] } },
      combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai3" }], blockers: [{ blockerId: "blk", attackerId: "w" }] } };
    const after = drain(checkBlockTriggers(before));
    const lands = (st) => Object.fromEntries(Object.keys(st.players).map((p) => [p, st.players[p].battlefield.filter((x) => /Land/.test(String(x.card?.type || ""))).length]));
    const row = { before: lands(before), after: lands(after) };
    console.log("  WITNESS defendingPlayerLandSac", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.after.ai3).toBe(row.before.ai3 - 1);
    expect(row.after.ai1).toBe(row.before.ai1);
    expect(row.after.ai2).toBe(row.before.ai2);
    expect(row.after.user).toBe(row.before.user);
  });
});
