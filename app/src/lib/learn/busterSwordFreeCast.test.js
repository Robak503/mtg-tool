/**
 * busterSwordFreeCast.test.js — SHELF CAP11 (CR 601.2b): the COMBAT-DAMAGE-capped free cast.
 *
 *   Buster Sword — "Whenever equipped creature deals combat damage to a player, draw a card, then you
 *   may cast a spell from your hand with mana value less than or equal to THAT DAMAGE without paying
 *   its mana cost."  (corpus-unique templating, censused against the bundled oracle)
 *
 * The free-cast machinery already existed (pendingFreeCast → the action-layer cast-or-decline decision),
 * and so did the RELATIONAL cap shape — Kellan, the Kid's `capFromCastMv` reads its cap off the trigger
 * context. This slice is that same pattern with a different referent: `capFromCombatDamage` reading
 * ctx.combatDamageAmount.
 *
 * ⛔ THE FAILURE MODE THIS FILE EXISTS TO PIN. If the cap referent is unset, the honest behaviour is
 * NO free cast. An UNCAPPED free cast would let a Buster Sword hit for 3 put a 9-drop onto the stack for
 * nothing — a fabricated effect, the forbidden direction. Every cap test below has a matching
 * missing-referent test for that reason.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyFreeCastAtom, freeCastEligible } from "./effects/atoms/freeCast.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const BUSTER_SWORD = {
  id: "c-bs", name: "Buster Sword", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature gets +3/+2.\nWhenever equipped creature deals combat damage to a player, draw a card, then you may cast a spell from your hand with mana value less than or equal to that damage without paying its mana cost.\nEquip {2}",
};

const CHEAP = { id: "h-cheap", name: "Cheap Spell", type: "Instant", mana_cost: "{1}", cmc: 1, oracle: "" };
const MID = { id: "h-mid", name: "Mid Spell", type: "Sorcery", mana_cost: "{4}", cmc: 4, oracle: "" };
const FATTY = { id: "h-fat", name: "Big Fatty", type: "Creature — Giant", mana_cost: "{9}", cmc: 9, power: 9, toughness: 9, oracle: "" };
const A_LAND = { id: "h-land", name: "Wastes", type: "Basic Land", cmc: 0, oracle: "" };

const FREE_CAST_CLAUSE = "draw a card, then you may cast a spell from your hand with mana value less than or equal to that damage without paying its mana cost";

describe("parse + classify", () => {
  it("the clause yields draw + a combat-damage-capped free cast, HIGH confidence", () => {
    // Parsed under a literal "Instant" — the same normalization the trigger-routing path uses, because
    // several atoms are type-gated and the card's own "Artifact — Equipment" would refuse them.
    const p = parseEffectClause(FREE_CAST_CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "draw", amount: 1, targetType: null },
      { op: "free-cast", capFromCombatDamage: true, countContext: "combatDamageAmount", maxMv: null, typeFilter: null, targetType: null },
    ]);
  });

  it("Buster Sword classifies native-equipment", () => {
    expect(classifyCard(BUSTER_SWORD)).toBe("native-equipment");
  });

  it("the trigger is the combat-damage-to-a-player event", () => {
    expect(detectTriggers(BUSTER_SWORD).map((d) => d.event)).toContain("combatDamageToPlayer");
  });

  it("⭐ the referent is policed by the SHARED gate — the atom cannot route off a non-combat event", () => {
    // The atom carries countContext:"combatDamageAmount" precisely so the existing gate sees it. Off an
    // event that doesn't supply the referent the clause would silently drop — the forbidden FP.
    const p = parseEffectClause(FREE_CAST_CLAUSE, "Instant");
    expect(combatDamageReferentSatisfied(p, "combatDamageToPlayer")).toBe(true);
    expect(combatDamageReferentSatisfied(p, "etb")).toBe(false);
    expect(combatDamageReferentSatisfied(p, "upkeep")).toBe(false);
    expect(combatDamageReferentSatisfied(p, "cast")).toBe(false);
  });
});

describe("the atom — the cap is the damage, and a missing referent casts NOTHING", () => {
  const handState = (hand) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, hand } } };
  };
  const ATOM = { op: "free-cast", capFromCombatDamage: true, countContext: "combatDamageAmount", maxMv: null, typeFilter: null, targetType: null };

  it("caps the candidate set at the damage dealt", () => {
    const out = applyFreeCastAtom(handState([CHEAP, MID, FATTY]), ATOM, { controller: "user", combatDamageAmount: 4 });
    expect(out.pendingFreeCast?.candidateIds.sort()).toEqual(["h-cheap", "h-mid"]); // 9-drop excluded
  });

  it("a smaller hit narrows it further", () => {
    const out = applyFreeCastAtom(handState([CHEAP, MID, FATTY]), ATOM, { controller: "user", combatDamageAmount: 1 });
    expect(out.pendingFreeCast?.candidateIds).toEqual(["h-cheap"]);
  });

  it("⛔ MISSING REFERENT → NO free cast at all (never an UNCAPPED one)", () => {
    // The whole point: an unsizeable cap must not become "no cap". A Buster Sword hit for 3 letting a
    // 9-drop out for free is a fabricated effect, and it is invisible to any confidence-shaped gate.
    const out = applyFreeCastAtom(handState([CHEAP, MID, FATTY]), ATOM, { controller: "user" });
    expect(out.pendingFreeCast).toBeFalsy();
  });

  it("a hit for 0 offers nothing (CR 601.2b is a 'may' with no eligible card)", () => {
    const out = applyFreeCastAtom(handState([CHEAP, MID, FATTY]), ATOM, { controller: "user", combatDamageAmount: 0 });
    expect(out.pendingFreeCast).toBeFalsy();
  });

  it("LANDS are never candidates (CR 601.2 — lands are played, not cast)", () => {
    expect(freeCastEligible(A_LAND, { maxMv: 7 })).toBe(false);
    const out = applyFreeCastAtom(handState([A_LAND, CHEAP]), ATOM, { controller: "user", combatDamageAmount: 7 });
    expect(out.pendingFreeCast?.candidateIds).toEqual(["h-cheap"]);
  });

  it("the fixed-cap sibling is untouched (no regression on the Expertise cycle)", () => {
    const fixed = { op: "free-cast", maxMv: 4, typeFilter: null, targetType: null };
    const out = applyFreeCastAtom(handState([CHEAP, MID, FATTY]), fixed, { controller: "user" });
    expect(out.pendingFreeCast?.candidateIds.sort()).toEqual(["h-cheap", "h-mid"]);
  });
});

describe("end to end — a real equipped attacker connects", () => {
  /** A user 2/2 wearing Buster Sword, attacking an undefended ai. */
  function board(hand, library) {
    const wielder = createPermanent({
      id: "w", card: { id: "c-w", name: "Wielder", type: "Creature — Human", power: 2, toughness: 2, oracle: "" },
      controller: "user", summoningSick: false,
    });
    const sword = createPermanent({ id: "sw", card: BUSTER_SWORD, controller: "user", summoningSick: false });
    // BOTH attachment links — the layer engine reads the host's list, and a one-way fixture is silently inert.
    wielder.attachments = ["sw"];
    sword.attachedTo = "w";
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [wielder, sword], hand, library, life: 40 },
        ai: { ...s.players.ai, battlefield: [], life: 40 },
      },
    };
  }
  const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; };

  it("the +3/+2 lands, the draw resolves, and the free cast is offered capped at the damage", () => {
    let s = board([CHEAP, MID, FATTY], [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }]);
    s = resolveCombatDamage(s);
    // 2/2 + Buster Sword's +3/+2 = a 5/4, so the defender takes 5.
    expect(s.players.ai.life).toBe(35);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true);       // "draw a card" resolved
    // …and the cap is the 5 that was actually dealt: the 9-drop is out, the 1 and the 4 are in.
    // ⭐ THE JUST-DRAWN CARD IS IN THE SET, AND THAT IS CORRECT — the card reads "draw a card, THEN you
    // may cast a spell from your hand", so the draw has already resolved and its card is legally in hand
    // and castable. This assertion doubles as the ordering proof: were the free-cast park computed before
    // the draw, "lib1" could not appear here. (It is an Instant with no printed cost → mana value 0.)
    expect(s.pendingFreeCast?.candidateIds.sort()).toEqual(["h-cheap", "h-mid", "lib1"]);
  });

  it("a BLOCKED attacker deals no player damage → no draw and no free cast", () => {
    let s = board([CHEAP], [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }]);
    const wall = createPermanent({ id: "wall", card: { id: "c-wall", name: "Wall", type: "Creature — Wall", power: 0, toughness: 9, oracle: "" }, controller: "ai", summoningSick: false });
    s = {
      ...s,
      combat: { attackers: s.combat.attackers, blockers: [{ blockerId: "wall", blockingPlayer: "ai", attackerId: "w" }] },
      players: { ...s.players, ai: { ...s.players.ai, battlefield: [wall] } },
    };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(40);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(false);
    expect(s.pendingFreeCast).toBeFalsy();
  });
});
