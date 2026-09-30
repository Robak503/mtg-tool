/**
 * lifeGainedThisTurn.test.js — the LIFE-GAINED-THIS-TURN ledger + its intervening-if consumers (BLITZ LG-1).
 *
 * The GAIN mirror of the lifeLostThisTurn ledger (Bloodchief Ascension — SHELF S7). gameState.gainLife is the
 * SINGLE life-gain chokepoint (CR 119.3 — "if an effect causes a player to gain life … that player's life
 * total is adjusted accordingly"): a "you gain N life" spell/trigger, a drain's gain half, lifelink combat, and
 * the radiation life-gain replacement all funnel through it, so a single += there counts every gain exactly
 * once (no double-count, no missed path). The per-seat tally sums the turn's TOTAL gained, resets for all seats
 * at untap (resetCreatureDeathsAllPlayers), and — being plain state — survives a serialize/deserialize round
 * trip. The CONTROLLER-SCOPED intervening-if "if you('ve) gained [N or more] life this turn" (CR 603.4) reads
 * it at BOTH the flush check and the resolution re-check.
 *
 * CREED FP = a native flip whose gain-count could over-fire (a double-count, or a mis-scoped read of a team /
 * opponent / compound "gained-and-lost" condition). All pinned here; a card with an unmodeled sibling clause
 * (Lathiel's distribute-that-many) stays body-only (whole-card law).
 */

import { beforeEach, describe, it, expect } from "vitest";
import {
  _resetIdsForTests, createGameState, gainLife, resetCreatureDeathsAllPlayers,
} from "./gameState.js";
import { serializeState, deserializeState } from "./serialization.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature") => ({ name, oracle, type, keywords: [], mana: "" });

function base() {
  return createGameState({ userDeck: [], aiDeck: [] });
}
// combat fixtures (mirrors combatKeywords.test.js — the real resolveCombatDamage path)
function cperm(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function combatState({ userBf = [], aiBf = [], userLife = 40, aiLife = 40, attackers = [], blockers = [] } = {}) {
  const s = base();
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: userLife }, ai: { ...s.players.ai, battlefield: aiBf, life: aiLife } },
  };
}

// ─── 1. THE LEDGER — fed once per gain at the single chokepoint, sums, resets, serializes ──────────
describe("lifeGainedThisTurn ledger — the single-chokepoint tally", () => {
  it("gainLife stamps the tally and SUMS across gains; a 0-amount gain is not an event", () => {
    let s = base();
    expect(s.players.user.lifeGainedThisTurn ?? 0).toBe(0); // absent tally reads as 0
    s = gainLife(s, { playerId: "user", amount: 2 });
    s = gainLife(s, { playerId: "user", amount: 3 });
    expect(s.players.user.lifeGainedThisTurn).toBe(5);      // cumulative, CR 119.3
    expect(s.players.ai.lifeGainedThisTurn ?? 0).toBe(0);   // per-seat — the gaining player only
    const s0 = gainLife(base(), { playerId: "user", amount: 0 });
    expect(s0.players.user.lifeGainedThisTurn ?? 0).toBe(0); // a 0 gain must not create/bump the tally
  });

  it("LIFELINK COMBAT funnels through gainLife → the dealer's controller tally = damage dealt", () => {
    const st = combatState({
      userBf: [cperm("Cleric", "c1", "user", { power: 3, toughness: 3, oracle: "Lifelink" })],
      attackers: [{ permanentId: "c1", attackingPlayer: "user", defender: "ai" }], // unblocked
    });
    const after = resolveCombatDamage(st);
    expect(after.players.user.life).toBe(43);              // +3 lifelink (combatKeywords.test.js pins this)
    expect(after.players.user.lifeGainedThisTurn).toBe(3); // …and the SAME event bumped the ledger exactly once
  });

  it("SPELL/TRIGGER gain (a 'you gain N life' effect program) bumps the tally through gainLife", () => {
    // drive a real EFFECT_PROGRAM: pending trigger whose effect is "you gain 3 life" → applyGainLife → gainLife
    const b = base();
    let st = { ...b, players: { ...b.players, user: { ...b.players.user, life: 20 } }, pendingTriggers: [{
      event: "upkeep", source: { name: "Probe", permanentId: "src" }, controller: "user",
      descriptor: { event: "upkeep", scope: "self", whose: "any", effectClause: "you gain 3 life" },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    expect(out.players.user.life).toBe(23);
    expect(out.players.user.lifeGainedThisTurn).toBe(3);
  });

  it("the all-seats untap reset clears every seat's tally (turn boundary)", () => {
    let s = gainLife(base(), { playerId: "user", amount: 7 });
    s = gainLife(s, { playerId: "ai", amount: 2 });
    expect(s.players.user.lifeGainedThisTurn).toBe(7);
    expect(s.players.ai.lifeGainedThisTurn).toBe(2);
    s = resetCreatureDeathsAllPlayers(s); // the shared per-turn ledger reset (draws/deaths/life-lost/life-gained)
    expect(s.players.user.lifeGainedThisTurn).toBe(0);
    expect(s.players.ai.lifeGainedThisTurn).toBe(0);
  });

  it("survives a serialize/deserialize round trip mid-turn (plain-state, no reviver)", () => {
    const s = gainLife(base(), { playerId: "user", amount: 4 });
    const round = deserializeState(serializeState(s));
    expect(round.players.user.lifeGainedThisTurn).toBe(4);
    // the restored tally still drives the condition live
    expect(evaluateInterveningIf(round, "you gained 3 or more life this turn", "user")).toBe(true);
  });
});

// ─── 2. THE CONDITION — controller-scoped, both forms; out-of-scope cousins → null (CREED) ─────────
describe("evaluateInterveningIf — you('ve) gained [N or more] life this turn (CR 119.3 + 603.4)", () => {
  const withGain = (patch) => { const s = base(); return { ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } }; };

  it("bare form is the ≥1 case; the 've/have spellings all read the same tally", () => {
    expect(evaluateInterveningIf(base(), "you gained life this turn", "user")).toBe(false); // absent = 0
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 1 }), "you gained life this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 1 }), "you've gained life this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 1 }), "you have gained life this turn", "user")).toBe(true);
  });

  it("cardinal form compares the running total to N (sums satisfy it)", () => {
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 3 }), "you gained 3 or more life this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 2 }), "you gained 3 or more life this turn", "user")).toBe(false);
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 5 }), "you've gained 4 or more life this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(withGain({ lifeGainedThisTurn: 4 }), "you gained 5 or more life this turn", "user")).toBe(false);
  });

  it("CONTROLLER-scoped — an opponent's gain never satisfies the controller's condition", () => {
    const s = { ...base(), players: { ...base().players, ai: { ...base().players.ai, lifeGainedThisTurn: 9 } } };
    expect(evaluateInterveningIf(s, "you gained life this turn", "user")).toBe(false);
    expect(evaluateInterveningIf(s, "you gained 3 or more life this turn", "user")).toBe(false);
  });

  it("OUT-OF-SCOPE cousins fall through to null (Arbiter, never fail-open)", () => {
    const s = withGain({ lifeGainedThisTurn: 9 });
    expect(evaluateInterveningIf(s, "your team gained life this turn", "user")).toBe(null);        // 2HG team scope
    // GRADUATED 2026-09-30 (shelf D17, traps.test.js — Needlebite Trap): the opponent existential is modeled now — it reads
    // the OPPONENTS' ledger, so your own gain here doesn't satisfy it, and an opponent's does.
    expect(evaluateInterveningIf(s, "an opponent gained life this turn", "user")).toBe(false);
    expect(evaluateInterveningIf({ ...s, players: { ...s.players, ai: { ...s.players.ai, lifeGainedThisTurn: 2 } } }, "an opponent gained life this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(s, "you gained and lost life this turn", "user")).toBe(null);     // compound (Lunar Convocation #2)
    expect(evaluateInterveningIf(s, "you gained 3 or fewer life this turn", "user")).toBe(null);   // wrong comparator direction
  });

  it("interveningIfParseable is TRUE for the modeled forms, FALSE for the cousins", () => {
    expect(interveningIfParseable("you gained life this turn")).toBe(true);
    expect(interveningIfParseable("you've gained life this turn")).toBe(true);
    expect(interveningIfParseable("you gained 3 or more life this turn")).toBe(true);
    expect(interveningIfParseable("you've gained 4 or more life this turn")).toBe(true);
    expect(interveningIfParseable("your team gained life this turn")).toBe(false);
    expect(interveningIfParseable("an opponent gained life this turn")).toBe(true); // GRADUATED (shelf D17) — the opponent existential
    expect(interveningIfParseable("you gained and lost life this turn")).toBe(false);
  });
});

// ─── 3. RUNTIME — the condition gates the trigger at flush AND resolution (CR 603.4) ──────────────
describe("LG-1 runtime — the ledger gates a conditional trigger (both CR 603.4 checks)", () => {
  function runIf({ condition, effectClause = "draw a card", stateMut = (s) => s }) {
    let st = base();
    const lib = [{ id: "topcard", name: "Forest", type: "Basic Land — Forest" }];
    st = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [], library: lib, hand: [], life: 20 } } };
    st = stateMut(st);
    st = { ...st, pendingTriggers: [{
      event: "upkeep", source: { name: "Probe", permanentId: "src" }, controller: "user",
      descriptor: { event: "upkeep", scope: "self", whose: "any", effectClause, interveningIf: condition },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    return out;
  }
  const setUser = (patch) => (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } });

  it("MET (you gained ≥1) → the trigger fires (draws)", () => {
    expect(runIf({ condition: "you gained life this turn", stateMut: setUser({ lifeGainedThisTurn: 2 }) }).players.user.hand.length).toBe(1);
  });
  it("NOT met (no life gained) → never goes on the stack (no draw)", () => {
    expect(runIf({ condition: "you gained life this turn" }).players.user.hand.length).toBe(0);
  });
  it("cardinal MET (total ≥ 3) fires; the SAME tally under 3 does not", () => {
    expect(runIf({ condition: "you gained 3 or more life this turn", stateMut: setUser({ lifeGainedThisTurn: 3 }) }).players.user.hand.length).toBe(1);
    expect(runIf({ condition: "you gained 3 or more life this turn", stateMut: setUser({ lifeGainedThisTurn: 2 }) }).players.user.hand.length).toBe(0);
  });
});

// ─── 4. COVERAGE — real cards flip native (whole-card, LOST=0); an unmodeled sibling clause parks ──
describe("LG-1 coverage — real corpus cards flip native (verified via tier-fingerprint, LOST=0)", () => {
  it("bare 'if you gained life this turn' end-step/ETB payoffs → native", () => {
    expect(classifyCard(C("Regal Bloodlord", "Flying\nAt the beginning of each end step, if you gained life this turn, create a 1/1 black Bat creature token with flying.", "Creature — Vampire Soldier"))).toBe("native-trigger");
    expect(classifyCard(C("Courier Bat", "Flying\nWhen this creature enters, if you gained life this turn, return up to one target creature card from your graveyard to your hand.", "Creature — Bat"))).toBe("native-trigger");
    // a static keyword-anthem sibling clause is ALSO modeled → the whole card composes native-mixed
    expect(classifyCard(C("Crested Sunmare", "Other Horses you control have indestructible.\nAt the beginning of each end step, if you gained life this turn, create a 5/5 white Horse creature token.", "Creature — Horse"))).toBe("native-mixed");
  });
  it("cardinal 'if you gained N or more life this turn' payoffs → native", () => {
    expect(classifyCard(C("The Gaffer", "At the beginning of each end step, if you gained 3 or more life this turn, draw a card.", "Legendary Creature — Halfling Peasant"))).toBe("native-trigger");
    expect(classifyCard(C("Griffin Aerie", "At the beginning of your end step, if you gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying.", "Enchantment"))).toBe("native-trigger");
    expect(classifyCard(C("Angelic Accord", "At the beginning of each end step, if you gained 4 or more life this turn, create a 4/4 white Angel creature token with flying.", "Enchantment"))).toBe("native-trigger");
    expect(classifyCard(C("Indulging Patrician", "Flying\nLifelink\nAt the beginning of your end step, if you gained 3 or more life this turn, each opponent loses 3 life.", "Creature — Vampire Noble"))).toBe("native-trigger");
    expect(classifyCard(C("Valkyrie Harbinger", "Flying\nLifelink (Damage dealt by this creature also causes you to gain that much life.)\nAt the beginning of each end step, if you gained 4 or more life this turn, create a 4/4 white Angel creature token with flying and vigilance.", "Creature — Angel Cleric"))).toBe("native-trigger");
  });
});

describe("LG-1 CREED — whole-card law + scope guards keep near-misses body-only", () => {
  it("an unmodeled SIBLING clause parks the card (Lathiel's distribute-that-many is not modeled)", () => {
    // the condition IS modeled now, but "distribute up to that many +1/+1 counters …" is not → body-only (correct)
    expect(classifyCard(C("Lathiel, the Bounteous Dawn", "Lifelink\nAt the beginning of each end step, if you gained life this turn, distribute up to that many +1/+1 counters among any number of other target creatures.", "Legendary Creature — Unicorn"))).not.toMatch(/^native/);
  });
  it("a team-scoped gained-life condition is out of the controller-scoped vocabulary → parks (never fail-open)", () => {
    expect(classifyCard(C("Team Lifegain Draw", "When this creature enters, if your team gained life this turn, draw a card."))).not.toMatch(/^native/);
  });
});
