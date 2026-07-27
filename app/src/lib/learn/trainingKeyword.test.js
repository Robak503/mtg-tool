/**
 * trainingKeyword.test.js — training (CR 702.148a, census slice 52).
 *
 * "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter
 * on this creature.)"
 *
 * NOT a member of the optional-mode family it sits next to in the census. Training is a MANDATORY trigger,
 * so it is credited by being MODELED — synthesized descriptor plus a real condition — never by being
 * declined. Same shape as dethrone.
 *
 * THE CONDITION'S SCOPE IS THE THING TO GET RIGHT. "attacks WITH another creature with greater power" means
 * another creature IN THIS COMBAT. A bigger creature sitting at home trains nothing, and reading the whole
 * board instead of the attackers list would put counters on creatures that never earned them. Both
 * directions are pinned below.
 *
 * Timing, same honest note as dethrone: printed, the comparison belongs to the trigger EVENT; expressed as
 * an intervening-if it is re-checked on resolution (CR 603.4). It can only ever REMOVE a counter that should
 * have been placed, never add one that shouldn't — a false negative, which the creed permits.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers, hasTraining } from "./triggers.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const REMINDER = "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)";
const TRAINEE = { name: "Parish-Blade Trainee", type: "Creature — Human Soldier", mana: "{1}{W}", power: 2, toughness: 2, keywords: [], oracle: REMINDER };
const CONDITION = "another attacking creature has greater power";

/**
 * Board: the trainee (power 2) plus one other creature of `otherPower`.
 * `otherAttacks` decides whether that other creature is in the combat or sitting at home.
 */
function condition({ otherPower, otherAttacks, traineeCounters = null }) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const t = createPermanent({ id: "t", card: TRAINEE, controller: "user", summoningSick: false });
  if (traineeCounters) t.counters = { ...t.counters, ...traineeCounters };
  const o = createPermanent({ id: "o", card: { name: "Other", type: "Creature — Bear", power: otherPower, toughness: 2 }, controller: "user", summoningSick: false });
  const attackers = [{ permanentId: "t", defender: "ai1" }];
  if (otherAttacks) attackers.push({ permanentId: "o", defender: "ai1" });
  const st = {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", turn: 6,
    combat: { ...s.combat, attackers },
    players: { ...s.players, user: { ...s.players.user, battlefield: [t, o] } },
  };
  return evaluateInterveningIf(st, CONDITION, "user", { sourcePermanentId: "t" });
}

describe("the keyword is read off the printed line", () => {
  it("reads training", () => {
    expect(hasTraining(REMINDER)).toBe(true);
    expect(hasTraining("Flying")).toBe(false);
  });

  it("synthesizes the attacks descriptor with the condition attached", () => {
    expect(detectTriggers(TRAINEE)[0]).toMatchObject({
      event: "attacks", scope: "self", sourceText: "Training",
      effectClause: "put a +1/+1 counter on this creature",
      interveningIf: CONDITION,
    });
  });
});

describe("THE CONDITION — the other ATTACKERS, not the board", () => {
  it("a bigger creature attacking alongside it trains it", () => {
    expect(condition({ otherPower: 4, otherAttacks: true })).toBe(true);
  });

  it("THE POINT — a bigger creature STAYING HOME trains nothing", () => {
    // Reading the whole battlefield instead of the attackers list would put a counter on this creature
    // every combat, whether or not anything actually attacked with it.
    expect(condition({ otherPower: 4, otherAttacks: false })).toBe(false);
  });

  it("EQUAL power is not greater", () => {
    expect(condition({ otherPower: 2, otherAttacks: true })).toBe(false);
  });

  it("a smaller co-attacker trains nothing", () => {
    expect(condition({ otherPower: 1, otherAttacks: true })).toBe(false);
  });

  it("it never counts ITSELF — 'another' is load-bearing", () => {
    // Only the trainee attacks. If the source were included in its own comparison the answer could never
    // be anything but false anyway, but a sloppy scan that compared >= would fire here.
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const t = createPermanent({ id: "t", card: TRAINEE, controller: "user", summoningSick: false });
    const st = {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", turn: 6,
      combat: { ...s.combat, attackers: [{ permanentId: "t", defender: "ai1" }] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [t] } },
    };
    expect(evaluateInterveningIf(st, CONDITION, "user", { sourcePermanentId: "t" })).toBe(false);
  });

  it("LAYER-AWARE — counters on the TRAINEE can lift it out of qualifying", () => {
    // Trainee 2 vs a 4-power co-attacker qualifies; give the trainee three counters (5 power) and the
    // bigger creature is no longer bigger.
    expect(condition({ otherPower: 4, otherAttacks: true })).toBe(true);
    expect(condition({ otherPower: 4, otherAttacks: true, traineeCounters: { "+1/+1": 3 } })).toBe(false);
  });

  it("a missing source referent drops out (FN-safe) rather than firing blind", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(evaluateInterveningIf(s, CONDITION, "user", {})).toBeNull();
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(TRAINEE)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...TRAINEE, oracle: `${REMINDER}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
