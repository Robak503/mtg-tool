/**
 * thatPlayerControlsScope.test.js — DT-1: "each/target creature THAT PLAYER controls" (CR 510.2 referent).
 * Shockmaw Dragon. Plus the spell fence that REFUSED Flames of the Raze-Boar.
 *
 * ⭐ THE TWIN OF DP-TGT, ONE REFERENT OVER. creatureRestrictions.js already read
 * {kind:"controller",who:"damagedPlayer"} off ctx.damagedPlayerId, failing closed without it, and
 * removal.js's PERMANENT lane has parsed this printed phrase all along — only the CREATURE lane could not
 * emit it. Checked BEFORE the opponent arm because it is strictly narrower: the ONE seat just dealt combat
 * damage, not every opponent's board.
 *
 * ⛔⛔ THE SLICE FIRST MEASURED +2 AND ONE OF THEM WAS A WRONG CARD. Flames of the Raze-Boar is a SPELL:
 * "…deals 4 damage to target creature an opponent controls. Then …deals 2 damage to each other creature
 * THAT PLAYER controls…". Its "that player" is a CROSS-CLAUSE reference to the first clause's target, not
 * a combat referent — so tagging it damagedPlayer means ctx.damagedPlayerId is unset at spell resolution,
 * creatureSatisfiesRestrictions fails EVERY creature, and the second clause hits NOBODY while the card
 * reads native. Half the printed text, silently dropped. The honest number is +1.
 *
 * ⛔⛔ AND THE FENCE THAT SHOULD HAVE CAUGHT IT HAD THE SAME BLIND SPOT AS THE TRIGGER GATE: coverage's
 * spell-path referent loops inspected `atom.who` only, while this referent rides `restrictions[]` with
 * atom.who undefined. Fixed in all three loops from ONE helper (atomCarriesEventReferent) that checks both
 * positions, so they cannot drift — the same generalisation applied to triggerRouting a day earlier, where
 * hard-coding one referent and leaving its twin open is exactly how the hole reappeared here.
 *
 * Mutation-checked (2026-08-06, grep-verified as applied AND verified to reach the guarded case):
 *   · the scope arm removed -> Shockmaw Dragon parks (the parse emits no restriction).
 *   · the restriction half of atomCarriesEventReferent removed -> Flames of the Raze-Boar is ADMITTED
 *     native again, i.e. the wrong card comes straight back.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHOCKMAW = { id: "c-sd", name: "Shockmaw Dragon", type: "Creature — Dragon", mana: "{5}{R}", power: "4", toughness: "4",
  oracle: ["Flying", "Whenever this creature deals combat damage to a player, it deals 1 damage to each creature that player controls."].join("\n") };
const FLAMES = { id: "c-fr", name: "Flames of the Raze-Boar", type: "Instant", mana: "{3}{R}",
  oracle: "Flames of the Raze-Boar deals 4 damage to target creature an opponent controls. Then Flames of the Raze-Boar deals 2 damage to each other creature that player controls if you control a creature with power 4 or greater." };

describe("the carrier, and the card the fence refuses", () => {
  it("⭐ Shockmaw Dragon flips", () => {
    expect(classifyCard(SHOCKMAW)).toMatch(/^native/);
  });

  it("⛔⛔ Flames of the Raze-Boar STAYS PARKED — a spell cannot bind a combat referent", () => {
    // The measured +2 included this card. Its "that player" is cross-clause, not combat: on a spell the
    // referent is unset, so the second clause would hit nobody while the tier claimed the card plays.
    expect(classifyCard(FLAMES)).not.toMatch(/^native/);
  });

  it("⭐ the scope parses to the DAMAGED-player restriction, not the opponent one", () => {
    const atoms = parseEffectClause("it deals 2 damage to each creature that player controls", "Instant", { sourceScoped: true })?.atoms;
    console.log("  WITNESS thatPlayerControlsAtom", JSON.stringify(atoms)); // vitest 4 needs --disable-console-intercept
    expect(atoms?.[0]?.restrictions).toEqual([{ kind: "controller", who: "damagedPlayer" }]);
    // …and the opponent wording still resolves to the WIDER scope — additive, not a replacement.
    expect(parseEffectClause("it deals 2 damage to each creature an opponent controls", "Instant", { sourceScoped: true })?.atoms?.[0]?.restrictions)
      .toEqual([{ kind: "controller", who: "opponent" }]);
  });
});

describe("⭐⭐ LAW 6 — only the DAMAGED seat's creatures, and only on a combat event", () => {
  it("⭐⭐ three opponents hold creatures; only the damaged seat's are in the pool", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, summoningSick: false });
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("mine", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [bear("a2", "ai2")] },
      ai3: { ...s0.players.ai3, battlefield: [bear("a3", "ai3")] } } };
    const pool = (ctx) => enumerateTargets(s, "user", { targetType: "creature", restrictions: [{ kind: "controller", who: "damagedPlayer" }] }, [], ctx).map((t) => t.id).sort();
    const row = { damagedIsAi2: pool({ damagedPlayerId: "ai2" }), noReferent: pool({}) };
    console.log("  WITNESS thatPlayerControlsPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.damagedIsAi2).toEqual(["a2"]);   // ⛔ not a1, not a3, not mine
    expect(row.noReferent).toEqual([]);         // ⛔ fails closed, never "everyone"
  });

  it("⛔⛔ the routing gate catches this referent in its RESTRICTION position too", () => {
    // The gate's atom.who check cannot see it — atom.who is undefined here. Hard-coding defendingPlayer
    // and leaving damagedPlayer open is exactly how this hole reappeared, so both are driven off their
    // own event tables now.
    const program = { atoms: [{ op: "deal-damage", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "controller", who: "damagedPlayer" }] }] };
    const row = Object.fromEntries(["combatDamageToPlayer", "etb", "dies", "cast", "upkeep"]
      .map((e) => [e, combatDamageReferentSatisfied(program, e)]));
    console.log("  WITNESS thatPlayerControlsRouting", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ combatDamageToPlayer: true, etb: false, dies: false, cast: false, upkeep: false });
  });
});
