/**
 * entersOrAttacks.test.js — EVENT-DISJUNCTION SPLIT (SHELF C1, CR 603.2b).
 *
 * "When[ever] <subject> enters[ the battlefield] or attacks, <effect…>" splits into TWO sentences
 * (one per event), each carrying the WHOLE same-line effect (riders included — a first half cut at
 * the first period would fire rider-less, the cardinal FP). The 139-card self-subject class (Grave
 * Titan, The Wise Mothman, Inferno Titan) binds generically; the mothmanRad targeted hook is GONE
 * (kept, it would double-fire — its own coordination note).
 *
 * Guards: the "of the chosen type" form (Kindred Discovery) is EXCLUDED (it has a dedicated compound
 * event exact-matched on the unsplit sentence); compoundTriggerCount counts each disjunction so an
 * unmodeled half keeps the card off the native tier via the shaped-count reconciliation.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, compoundTriggerCount, checkEnterTriggers, checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MOTHMAN = {
  name: "The Wise Mothman", type: "Legendary Creature — Insect Mutant", power: 3, toughness: 3,
  oracle: "Flying\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.\nWhenever one or more nonland cards are milled, put a +1/+1 counter on each of up to X target creatures, where X is the number of nonland cards milled this way.",
};
const GRAVE_TITAN = {
  name: "Grave Titan", type: "Creature — Giant", power: 6, toughness: 6,
  oracle: "Deathtouch\nWhenever this creature enters or attacks, create two 2/2 black Zombie creature tokens.",
};
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("detection — the disjunction splits into two independently-classified halves", () => {
  it("Grave Titan: etb + attacks halves, both with the full token payoff", () => {
    const ds = detectTriggers(GRAVE_TITAN);
    const etb = ds.find((d) => d.event === "etb");
    const atk = ds.find((d) => d.event === "attacks");
    expect(etb?.effectClause).toMatch(/create two 2\/2 black zombie/i);
    expect(atk?.effectClause).toMatch(/create two 2\/2 black zombie/i);
    expect(compoundTriggerCount(GRAVE_TITAN.oracle)).toBe(1);
  });

  it("RIDER SAFETY: follow-up sentences ride BOTH halves (never a rider-less first half)", () => {
    const c = { name: "Scavenger", type: "Creature — Dinosaur", oracle: "Whenever this creature enters or attacks, you may exile target card from a graveyard. If a creature card is exiled this way, you gain 2 life." };
    for (const d of detectTriggers(c)) {
      expect(d.effectClause).toMatch(/if a creature card is exiled this way/i);
    }
  });

  it("Kindred Discovery's chosen-type form is EXCLUDED (its dedicated compound event survives)", () => {
    const c = { name: "Kindred Discovery", type: "Enchantment", oracle: "As Kindred Discovery enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card." };
    const ds = detectTriggers(c);
    expect(ds.some((d) => d.event === "chosenTypeEntersOrAttacks")).toBe(true);
    expect(ds.some((d) => d.event === "attacks")).toBe(false); // not split
    expect(compoundTriggerCount(c.oracle)).toBe(0);
  });

  it("tier flips: Mothman + Grave Titan classify native-trigger (all clauses route)", () => {
    expect(classifyCard(MOTHMAN)).toBe("native-trigger");
    expect(classifyCard(GRAVE_TITAN)).toBe("native-trigger");
  });
});

describe("runtime — Mothman's rad fires ONCE per event through the generic paths (hook removed)", () => {
  function board() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const moth = createPermanent({ id: "moth", card: MOTHMAN, controller: "user" });
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [moth] } } };
  }

  it("ETB: each player gets exactly ONE rad counter (no hook double-fire)", () => {
    let s = board();
    const moth = s.players.user.battlefield[0];
    s = resolveAll(flushTriggers(checkEnterTriggers(s, moth)));
    for (const pid of Object.keys(s.players)) {
      expect(s.players[pid].radCounters || 0).toBe(1);
    }
  });

  it("ATTACK: the attack half fires through checkAttackTriggers — one rad each, once", () => {
    let s = board();
    const moth = s.players.user.battlefield[0];
    s = { ...s, combat: { attackers: [{ permanentId: moth.id, defender: "ai1" }], blockers: [] } };
    s = resolveAll(flushTriggers(checkAttackTriggers(s)));
    for (const pid of Object.keys(s.players)) {
      expect(s.players[pid].radCounters || 0).toBe(1);
    }
  });
});
