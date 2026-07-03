/**
 * HUNGERING HYDRA — the last PARKED Zaxara hydra flips to native-trigger. Two blockers were built:
 *   1. BLOCK-COUNT CAP (CR 509.1c — the menace-INVERSE): "This creature can't be blocked by more than one
 *      creature." A SET-level restriction on how MANY creatures may block it (at most one). Enforced at block
 *      DECLARATION (legalChoices.legalBlockerActions): once one blocker is on this attacker, no 2nd is offered.
 *      isBlockedByAtMostOne (combatEvasion.js) is the self-only, unconditional matcher; isEnforcedEvasionClause
 *      credits the clause so a body carrying it reads native.
 *   2. ENRAGE self-scaled counter payoff (CR 603.2): "Whenever this creature is dealt damage, put that many
 *      +1/+1 counters on it." The dealtDamage trigger (already modeled) threads ctx.combatDamageAmount (the alias
 *      of dealtDamageAmount, set by checkDealtDamageTriggers); the add-counter atom now parses "put that many
 *      +1/+1 counters on it/this creature" → { countContext:"combatDamageAmount", target:"self" } and places
 *      exactly that many on the source (applyAddCounter resolveScaledAmount).
 * The enters-with-X line is the shipped X→counters subsystem. Real oracle (verified vs the bundled local index).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// Real Hungering Hydra oracle, verbatim (reminder text is stripped by the classifier; kept here for fidelity).
const HUNGERING = {
  name: "Hungering Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0,
  oracle:
    "This creature enters with X +1/+1 counters on it.\n" +
    "This creature can't be blocked by more than one creature.\n" +
    "Whenever this creature is dealt damage, put that many +1/+1 counters on it. (It must survive the damage to get the counters.)",
};

const flush = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }), g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };
const find = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
// A freshly-cast permanent enters under an engine-assigned id (perm-N); look it up by CARD id instead.
const findByCard = (s, pid, cardId) => s.players[pid].battlefield.find((p) => p.card.id === cardId);

describe("HUNGERING HYDRA — classification", () => {
  it("flips body-only → native-trigger (block-count-cap static + enters-with-X + enrage self-scaled counters)", () => {
    expect(classifyCard(HUNGERING)).toBe("native-trigger");
  });
});

describe("HUNGERING HYDRA — enters at X/X via the real cast→resolve flow (enters-with-X)", () => {
  const castForX = (X) => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = { ...HUNGERING, id: "hyd" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [hydra], manaPool: { ...s.players.user.manaPool, G: 5, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hyd" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s);
    return { s, perm: findByCard(s, "user", "hyd") };
  };
  it("cast for X=4 enters as a real 4/4", () => {
    const { s, perm } = castForX(4);
    expect(perm.counters["+1/+1"]).toBe(4);
    expect(permanentPower(s, perm.id)).toBe(4);
    expect(permanentToughness(s, perm.id)).toBe(4);
  });
});

// A combat where `attackerId` (Hungering, user) is blocked by `blockers` (ai). Returns the pre-damage state.
function combat(userBf, aiBf, attackers, blockers) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}

describe("HUNGERING HYDRA — ENRAGE self-scaled counters (engine-first)", () => {
  it("dealt 3 damage and surviving gains exactly 3 +1/+1 counters ('that many' = the damage taken)", () => {
    // A 5/5 Hungering (5 counters) blocked by a 3/3 → takes 3, survives → +3 counters (net an 8/8).
    const hyd = createPermanent({ id: "hyd", card: { ...HUNGERING, id: "hyd" }, controller: "user", summoningSick: false });
    hyd.counters = { "+1/+1": 5 };
    const bear = createPermanent({ id: "bear", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 3, toughness: 3, oracle: "" }, controller: "ai" });
    let s = combat([hyd], [bear],
      [{ permanentId: "hyd", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "hyd" }]);
    s = resolveCombatDamage(s);
    const pend = (s.pendingTriggers || []).filter((t) => t.event === "dealtDamage");
    expect(pend).toHaveLength(1);
    expect(pend[0].context.dealtDamageAmount).toBe(3);
    s = flush(s);
    expect(find(s, "user", "hyd").counters["+1/+1"]).toBe(8); // 5 + 3 (the damage it survived)
  });

  it("CREED near-miss — dealt LETHAL damage that kills it gets NO counter (SBA before the trigger resolves)", () => {
    // A 2/2 Hungering (2 counters) blocked by a 3/3 → takes 3 (lethal) → dies before the enrage counter resolves.
    const hyd = createPermanent({ id: "hyd", card: { ...HUNGERING, id: "hyd" }, controller: "user", summoningSick: false });
    hyd.counters = { "+1/+1": 2 };
    const bear = createPermanent({ id: "bear", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 3, toughness: 3, oracle: "" }, controller: "ai" });
    let s = combat([hyd], [bear],
      [{ permanentId: "hyd", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "hyd" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    expect(find(s, "user", "hyd")).toBeFalsy(); // died to lethal; the "must survive" reality holds (no fabricated counter)
  });

  it("dealt 0 damage (a 0-power blocker) fires no enrage event (CR 120.8)", () => {
    const hyd = createPermanent({ id: "hyd", card: { ...HUNGERING, id: "hyd" }, controller: "user", summoningSick: false });
    hyd.counters = { "+1/+1": 3 };
    const wall = createPermanent({ id: "w", card: { id: "w", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai" });
    let s = combat([hyd], [wall],
      [{ permanentId: "hyd", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "w", blockingPlayer: "ai", attackerId: "hyd" }]);
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(0);
  });
});

describe("HUNGERING HYDRA — BLOCK-COUNT CAP (CR 509.1c, menace-inverse) enforced at block declaration", () => {
  // Set up an attacking Hungering (ai) and TWO would-be blockers (user). The defender may declare the FIRST
  // blocker, but once one block is on the attacker, no SECOND blocker action is offered.
  function blockScenario(existingBlockers) {
    const hyd = createPermanent({ id: "hyd", card: { ...HUNGERING, id: "hyd" }, controller: "ai", summoningSick: false });
    hyd.counters = { "+1/+1": 5 };
    const b1 = createPermanent({ id: "b1", card: { id: "b1", name: "Blocker1", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const b2 = createPermanent({ id: "b2", card: { id: "b2", name: "Blocker2", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, step: "declare-blockers", phase: "combat", activePlayer: "ai",
      combat: { attackers: [{ permanentId: "hyd", attackingPlayer: "ai", defender: "user" }], blockers: existingBlockers },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [b1, b2], life: 40 },
        ai: { ...s.players.ai, battlefield: [hyd], life: 40 },
      },
    };
  }
  const blockActionsOnHyd = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-blocker" && a.attackerId === "hyd");

  it("with NO blocks yet, BOTH blockers are offered (a single legal blocker is fine)", () => {
    const s = blockScenario([]);
    const acts = blockActionsOnHyd(s);
    expect(acts.map((a) => a.permanentId).sort()).toEqual(["b1", "b2"]);
  });

  it("once ONE blocker is declared, the SECOND blocker is NOT offered (can't be blocked by more than one)", () => {
    const s = blockScenario([{ blockerId: "b1", blockingPlayer: "user", attackerId: "hyd" }]);
    const acts = blockActionsOnHyd(s);
    // b1 is already assigned (never re-offered); b2 would be a 2nd blocker → suppressed by the cap.
    expect(acts).toHaveLength(0);
  });

  it("CREED near-miss — a NON-capped attacker DOES allow a 2nd blocker (the cap is self-only, not global)", () => {
    // Same board but the attacker is a vanilla creature (no cap): after one block, the 2nd blocker IS offered.
    const s = blockScenario([{ blockerId: "b1", blockingPlayer: "user", attackerId: "hyd" }]);
    const vanilla = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [{ ...s.players.ai.battlefield[0], card: { ...s.players.ai.battlefield[0].card, oracle: "" } }] } } };
    const acts = legalActionsForPlayer(vanilla, "user").filter((a) => a.kind === "declare-blocker" && a.attackerId === "hyd");
    expect(acts.map((a) => a.permanentId)).toEqual(["b2"]); // the 2nd blocker is legal on a non-capped attacker
  });
});
