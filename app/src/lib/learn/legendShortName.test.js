/**
 * legendShortName.test.js — LEGENDARY SHORT-NAME self-reference normalization (Toski).
 *
 * A comma-carrying legend's oracle refers to itself by its PRE-COMMA short name ("Toski attacks each
 * combat if able" on "Toski, Bearer of Secrets"), but both the coverage residue check
 * (isKeywordOnly) and the must-attack enforcement (opponentAI.selfMustAttack) normalized only the FULL
 * name — so every such clause read as residue and the requirement never enforced. Both halves now also
 * normalize the short name (recognition and enforcement flip together, the subsystem's both-halves rule).
 *
 * FN-safe by construction: the normalization rewrites only the SUBJECT — the predicate must still match
 * an already-modeled form (must-attack, block-count-cap, power-threshold evasion, unblockable …). A
 * short-name clause with an unmodeled predicate stays residue → body-only (pinned).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { pickAttackPlan, selfMustAttack } from "./opponentAI.js";
import { isBlockedByAtMostOne, isSelfUnblockable } from "./combatEvasion.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("LEGEND SHORT NAME — classification flips (each predicate independently modeled)", () => {
  const TOSKI_ORACLE = "This spell can't be countered.\nIndestructible\nToski attacks each combat if able.\nWhenever a creature you control deals combat damage to a player, draw a card.";
  it("Toski, Bearer of Secrets → native-mixed (the short-name must-attack was the last blocker)", () => {
    expect(classifyCard({ name: "Toski, Bearer of Secrets", type: "Legendary Creature — Squirrel", oracle: TOSKI_ORACLE })).toBe("native-mixed");
  });
  it("corpus riders: short-name evasion / must-attack clauses now read as their modeled predicates", () => {
    expect(classifyCard({ name: "Huang Zhong, Shu General", type: "Legendary Creature — Human Soldier", oracle: "Huang Zhong can't be blocked by more than one creature." })).toBe("native-body");
    expect(classifyCard({ name: "Hulk, Always Angry", type: "Legendary Creature — Human Scientist", oracle: "Trample\nWhen Hulk enters, destroy all artifacts.\nHulk attacks each combat if able." })).toBe("native-trigger");
  });
  it("CREED: a short-name clause with an UNMODELED predicate stays residue (body-only)", () => {
    expect(classifyCard({ name: "Toski, Bearer of Secrets", type: "Legendary Creature — Squirrel", oracle: "Toski reads the defending player's mind.\nToski attacks each combat if able." })).toBe("body-only");
  });
});

describe("LEGEND SHORT NAME — the EVASION enforcement chokepoint reads the short name too", () => {
  // The skeptic pass caught the original slice normalizing coverage + selfMustAttack but NOT
  // combatEvasion.selfOracle — the single runtime chokepoint the block gates read — so short-name
  // evasion clauses classified as enforced while a second blocker / any blocker sailed through.
  it("Huang Zhong's block-count cap and Red Ghost's unblockable now ENFORCE", () => {
    expect(isBlockedByAtMostOne({ name: "Huang Zhong, Shu General", oracle: "Huang Zhong can't be blocked by more than one creature." })).toBe(true);
    expect(isSelfUnblockable({ name: "Red Ghost, Intangible Genius", oracle: "Ward {2}\nRed Ghost can't be blocked.\nWhenever you draw your second card each turn, create a 3/3 red Ape Villain creature token with haste." })).toBe(true);
  });
});

describe("LEGEND SHORT NAME — the trigger-flush source threading (Prowler's counter)", () => {
  // Pre-existing hole the flip exposed: the flush enumeration carried no ctx.sourceId, so the
  // excludeSource restriction ("another target creature you control") was inert and Prowler's
  // counter landed on Prowler himself. sourceId is now threaded at every flush enumeration site.
  const PROWLER = { name: "Prowler, Misguided Mentor", type: "Legendary Creature — Human Rogue", power: 3, toughness: 3, oracle: "Prowler can't be blocked by creatures with power 2 or less.\nWhenever Prowler deals combat damage to a player, put a +1/+1 counter on another target creature you control." };
  const mk = (extra) => {
    const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage" };
    const prowler = createPermanent({ id: "prowler", card: PROWLER, controller: "user", summoningSick: false });
    const bf = extra ? [prowler, extra] : [prowler];
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: bf } } };
    return checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "prowler", attackingPlayer: "user", defender: "ai", amount: 3 }]);
  };
  const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters || {};

  it("the counter lands on ANOTHER own creature, never Prowler himself", () => {
    const ally = createPermanent({ id: "ally", card: { name: "Ally", type: "Creature — Human", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    const r = resolveTopOfStack(flushTriggers(mk(ally), { chooseTargets: chooseTriggerTargets }));
    expect(counters(r, "ally")["+1/+1"]).toBe(1);
    expect(counters(r, "prowler")["+1/+1"]).toBeUndefined();
  });
  it("SOLO Prowler: no legal 'another' target → the trigger drops at flush (CR 603.3c), zero counters", () => {
    const r = flushTriggers(mk(null), { chooseTargets: chooseTriggerTargets });
    expect((r.stack || []).length).toBe(0);
    expect(counters(r, "prowler")).toEqual({});
  });
});

describe("LEGEND SHORT NAME — enforcement (both halves flip together)", () => {
  it("pickAttackPlan FORCE-declares Toski even when profitability would hold him back", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const toski = createPermanent({ id: "toski", card: { name: "Toski, Bearer of Secrets", type: "Legendary Creature — Squirrel", power: 1, toughness: 1, oracle: "This spell can't be countered.\nIndestructible\nToski attacks each combat if able.\nWhenever a creature you control deals combat damage to a player, draw a card." }, controller: "ai", summoningSick: false });
    // a big defender makes the 1/1 attack unprofitable — the requirement must override the filter
    const wall = createPermanent({ id: "wall", card: { name: "Wall", type: "Creature — Wall", power: 0, toughness: 8, oracle: "" }, controller: "user", summoningSick: false });
    const s = { ...base, activePlayer: "ai", players: { ...base.players, ai: { ...base.players.ai, battlefield: [toski] }, user: { ...base.players.user, battlefield: [wall] } } };
    const plan = pickAttackPlan(s, "ai", [{ type: "declare-attacker", creatureId: "toski" }]);
    expect(plan.some((a) => a.creatureId === "toski")).toBe(true);
  });

  it("RIDER GUARD (skeptic-flagged): a must-attacker carrying a 'can't attack …' restriction is NOT forced", () => {
    // Xantcha/Alexios — pickAttackPlan models no attack restrictions, so FORCING them could declare a
    // forbidden attack; they keep the pre-slice unforced status quo (they still attack whenever the
    // normal profitability filter says yes — only the FORCE override is withheld). Pinned at the unit
    // level (the aggressive racer declares most boards anyway, so a plan-level pin can't discriminate).
    expect(selfMustAttack({ name: "Xantcha, Sleeper Agent", oracle: "Xantcha attacks each combat if able and can't attack its owner or planeswalkers its owner controls." })).toBe(false);
    expect(selfMustAttack({ name: "Xantcha, Sleeper Agent", oracle: "Xantcha attacks each combat if able." })).toBe(true); // the rider-less twin IS forced
    expect(selfMustAttack({ name: "Toski, Bearer of Secrets", oracle: "Toski attacks each combat if able." })).toBe(true); // short-name form
    expect(selfMustAttack({ name: "Grand Melee", oracle: "All creatures attack each combat if able and block each combat if able." })).toBe(false); // group form never trips
  });
});
