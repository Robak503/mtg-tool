/**
 * defendingPlayerTarget.test.js — DP-TGT: "target/each creature DEFENDING PLAYER CONTROLS" (CR 509.1).
 * Mage-Ring Responder, Hellkite Whelp, Heart-Piercer Bow (target damage) · Gouged Zealot, Swathcutter
 * Giant, Ronin Cliffrider, Scalding Salamander (mass damage) · Colossal Whale (exile).
 *
 * ⭐ THE EVALUATOR ALREADY KNEW THIS RESTRICTION. creatureRestrictions.js has read
 * `{kind:"controller",who:"defendingPlayer"}` off ctx.defenderId, failing closed when it is unset, for as
 * long as the defending-player family has existed — and removal.js's permanent lane has parsed the same
 * printed phrase all along. Only parseCreatureTargetRestrictions could not emit it. One scope arm.
 *
 * ⛔⛔ IT IS STRICTLY NARROWER THAN "an opponent controls", AND IN MULTIPLAYER THAT IS A REAL DIFFERENCE.
 * "An opponent controls" is every opponent's board; this is the ONE seat being attacked. Matching it as
 * the opponent scope would offer targets the printed card cannot reach — the forbidden direction — which
 * is why the new arm is checked BEFORE the opponent arm and why the pool row below names seats, not counts.
 *
 * ⛔⛔ AND THE ROUTING GATE HAD A DOOR IT WAS NOT WATCHING. triggerRouting pinned the defending-player
 * referent by inspecting `atom.who`. This atom carries the referent as a RESTRICTION — its own `who` is
 * undefined — so the existing check sailed straight past it. Off a combat event ctx.defenderId is unset,
 * creatureSatisfiesRestrictions then fails EVERY creature, the pool comes back empty and the clause
 * SILENTLY DROPS: exactly the FP that gate exists to stop, arriving through the shape it did not inspect.
 * Fixed by checking the restriction list too, and pinned per-event below.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified to reach the guarded case):
 *   · the scope arm removed -> all eight park (the parse returns no restriction and the clause is unclean).
 *   · the restriction-aware routing check removed -> the atom routes on etb/dies/cast, where the referent
 *     is unset and the clause would drop silently.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RESPONDER = { id: "c-mr", name: "Mage-Ring Responder", type: "Artifact Creature — Golem", mana: "{7}", power: "7", toughness: "7",
  oracle: ["This creature doesn't untap during your untap step.", "{7}: Untap this creature.",
    "Whenever this creature attacks, it deals 7 damage to target creature defending player controls."].join("\n") };
const SWATHCUTTER = { id: "c-sg", name: "Swathcutter Giant", type: "Creature — Giant Soldier", mana: "{5}{R}{W}", power: "4", toughness: "4",
  oracle: ["Vigilance", "Whenever this creature attacks, it deals 1 damage to each creature defending player controls."].join("\n") };

describe("the carriers", () => {
  it("⭐ target damage, mass damage and exile all flip on one scope arm", () => {
    expect(classifyCard(RESPONDER)).toMatch(/^native/);
    expect(classifyCard(SWATHCUTTER)).toMatch(/^native/);
  });

  it("⭐ the parse emits the DEFENDING-player restriction, not the opponent one", () => {
    const atoms = parseEffectClause("it deals 3 damage to target creature defending player controls", "Instant", { sourceScoped: true })?.atoms;
    console.log("  WITNESS defendingPlayerTargetAtom", JSON.stringify(atoms)); // vitest 4 needs --disable-console-intercept
    expect(atoms).toEqual([{ op: "deal-damage", amount: 3, targetType: "creature", restrictions: [{ kind: "controller", who: "defendingPlayer" }] }]);
    // …and the opponent wording still resolves to the WIDER scope — this slice is additive.
    expect(parseEffectClause("it deals 3 damage to target creature an opponent controls", "Instant", { sourceScoped: true })?.atoms)
      .toEqual([{ op: "deal-damage", amount: 3, targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

describe("⭐⭐ LAW 6 — only the DEFENDED seat's creatures are legal", () => {
  it("⭐⭐ three opponents each hold a creature; only the defended one is offered", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, summoningSick: false });
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("mine", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [bear("a2", "ai2")] },
      ai3: { ...s0.players.ai3, battlefield: [bear("a3", "ai3")] } } };
    const pool = (restr, ctx) => enumerateTargets(s, "user", { targetType: "creature", restrictions: restr }, [], ctx).map((t) => t.id).sort();
    const row = {
      // ⛔ THE WHOLE POINT: ai2 is the defender, so ai1 and ai3 must NOT appear even though both are
      // opponents with legal-looking creatures. This is where "an opponent controls" would differ.
      defending: pool([{ kind: "controller", who: "defendingPlayer" }], { defenderId: "ai2" }),
      opponent: pool([{ kind: "controller", who: "opponent" }], { defenderId: "ai2" }),
      // ⛔ ABSENT REFERENT → EMPTY, never "everyone". Fails closed.
      noReferent: pool([{ kind: "controller", who: "defendingPlayer" }], {}),
    };
    console.log("  WITNESS defendingPlayerTargetPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.defending).toEqual(["a2"]);
    expect(row.opponent).toEqual(["a1", "a2", "a3"]);   // the control that proves the two scopes differ
    expect(row.noReferent).toEqual([]);
  });

  it("⛔⛔ THE ROUTING GATE catches a referent carried by a RESTRICTION, not just atom.who", () => {
    // The gate inspected atom.who only; this atom's who is undefined and the referent rides its
    // restriction list. Off a combat event the pool is empty and the clause drops silently.
    const program = { atoms: [{ op: "deal-damage", amount: 3, targetType: "creature", restrictions: [{ kind: "controller", who: "defendingPlayer" }] }] };
    const row = Object.fromEntries(["attacks", "becomesBlocked", "etb", "dies", "cast", "upkeep"]
      .map((e) => [e, combatDamageReferentSatisfied(program, e)]));
    console.log("  WITNESS defendingPlayerTargetRouting", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ attacks: true, becomesBlocked: true, etb: false, dies: false, cast: false, upkeep: false });
  });
});
