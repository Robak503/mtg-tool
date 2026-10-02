/**
 * selfPowerBlockGate.test.js — "Creatures with power less than this creature's power can't block it."
 * (CR 509.1b, census slice 43.)
 *
 * This is skulk's printed cousin. Skulk (CR 702.118b) is "can't be blocked by a creature with GREATER
 * power"; this static is the same dynamic comparison pointed the other way, and one card (Silumgar Assassin)
 * prints the greater-than direction longhand. Because it is a comparison against the attacker's own power
 * rather than a fixed number, it could not go through parseExceptBlockerFilters — that grammar deliberately
 * fails closed on "power" arms — so it is enforced next to skulk, where the live comparison already lives.
 *
 * BOTH SIDES ARE LAYER-AWARE, which is the part worth testing. A +1/+1 counter on the blocker, an Aura on
 * the attacker, any layer-7 effect on either — all of it must count at the moment blockers are declared,
 * because a static that read PRINTED power would let a pumped blocker through (or wrongly stop one).
 *
 * CREED — three printed siblings must NOT be credited BY THIS GATE, and each is checked below:
 *   - "…can't block CREATURES YOU CONTROL" (Champion of Lambholt) — team-wide, not self-scoped; it has its own
 *     enforced team reader (teamPowerBlockGateOf, championOfLambholt.test.js), so it is credited there, never here
 *   - "power less than the NUMBER OF ISLANDS you control" (Kraken of the Straits) — a different quantity
 *   - "power less than OR EQUAL TO" — a different comparison; ≤ is not <
 * The last two stay body-only → Arbiter. Uncredited and unenforced together, which is the safe direction.
 */
import { describe, expect, it } from "vitest";

import { canBlockAttacker, selfPowerBlockGateOf, teamPowerBlockGateOf } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const WOLF = {
  name: "Wandering Wolf", type: "Creature — Wolf", mana: "{2}{G}", power: 3, toughness: 3, keywords: [],
  oracle: "Creatures with power less than Wandering Wolf's power can't block it.",
};
const ASSASSIN = {
  name: "Silumgar Assassin", type: "Creature — Naga Assassin", mana: "{2}{B}", power: 2, toughness: 1, keywords: [],
  oracle: "Creatures with power greater than Silumgar Assassin's power can't block it.",
};

/** attacker + one blocker; returns whether the block is legal. */
function canBlock({ attacker = WOLF, blockerPower = 2, blockerCounters = null, attackerCounters = null } = {}) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const atk = createPermanent({ id: "atk", card: attacker, controller: "user", summoningSick: false });
  const blk = createPermanent({
    id: "blk",
    card: { name: "Blocker", type: "Creature — Bear", power: blockerPower, toughness: 4 },
    controller: "ai1", summoningSick: false,
  });
  if (blockerCounters) blk.counters = { ...blk.counters, ...blockerCounters };
  if (attackerCounters) atk.counters = { ...atk.counters, ...attackerCounters };
  const st = {
    ...s,
    phase: "combat", step: "declare-blockers", activePlayer: "user", turn: 6,
    combat: { ...s.combat, attackers: [{ permanentId: "atk", defender: "ai1" }] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [atk] },
      ai1: { ...s.players.ai1, battlefield: [blk] },
    },
  };
  return canBlockAttacker(st, "blk", "atk", "ai1");
}

describe("the gate is read off the printed line", () => {
  it("reads the LESS direction", () => {
    expect(selfPowerBlockGateOf(WOLF)).toBe("less");
  });

  it("reads the GREATER direction (the printed longhand of skulk)", () => {
    expect(selfPowerBlockGateOf(ASSASSIN)).toBe("greater");
  });

  it("returns null for a creature with no such line", () => {
    expect(selfPowerBlockGateOf({ name: "Bear", oracle: "Vigilance" })).toBeNull();
  });
});

describe("ENFORCEMENT — a weaker creature genuinely cannot block", () => {
  it("power 2 cannot block the 3-power Wolf", () => {
    expect(canBlock({ blockerPower: 2 })).toBe(false);
  });

  it("equal power CAN block — the comparison is strictly LESS THAN, not ≤", () => {
    expect(canBlock({ blockerPower: 3 })).toBe(true);
  });

  it("greater power can block", () => {
    expect(canBlock({ blockerPower: 5 })).toBe(true);
  });

  it("the GREATER direction is enforced too, and inverted", () => {
    // Silumgar Assassin is 2/1: a 3-power blocker is shut out, a 1-power blocker is fine.
    expect(canBlock({ attacker: ASSASSIN, blockerPower: 3 })).toBe(false);
    expect(canBlock({ attacker: ASSASSIN, blockerPower: 1 })).toBe(true);
  });
});

describe("LAYER-AWARENESS — printed power is not the question, CURRENT power is", () => {
  it("a +1/+1 counter can lift a blocker OVER the bar", () => {
    // Printed 2 power would be shut out; two counters make it a 4 and the block becomes legal.
    expect(canBlock({ blockerPower: 2 })).toBe(false);
    expect(canBlock({ blockerPower: 2, blockerCounters: { "+1/+1": 2 } })).toBe(true);
  });

  it("and counters on the ATTACKER can push the bar back up out of reach", () => {
    // The 4-power blocker above was legal; pumping the 3-power Wolf to 5 shuts it out again.
    expect(canBlock({ blockerPower: 4 })).toBe(true);
    expect(canBlock({ blockerPower: 4, attackerCounters: { "+1/+1": 2 } })).toBe(false);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(WOLF)).toMatch(/^native/);
    expect(classifyCard(ASSASSIN)).toMatch(/^native/);
  });

  it("CREED — the TEAM-WIDE variant (Champion of Lambholt) is never read by the SELF gate; it is credited only through its own team reader", () => {
    // Re-pointed when the team form got its own enforced reader (teamPowerBlockGateOf — championOfLambholt.test.js pins its
    // runtime). Before that it was uncredited AND unenforced; now it is credited AND enforced, and the self gate still
    // refuses it — the self gate would protect only the Champion, not every creature its controller controls.
    const champ = { ...WOLF, name: "Champion of Lambholt", oracle: "Creatures with power less than Champion of Lambholt's power can't block creatures you control." };
    expect(selfPowerBlockGateOf(champ)).toBeNull();
    expect(teamPowerBlockGateOf(champ)).toBe(true);
    expect(classifyCard(champ)).toMatch(/^native/);
  });

  it("CREED — a different dynamic QUANTITY is not credited (Kraken of the Straits)", () => {
    const kraken = { ...WOLF, name: "Kraken of the Straits", oracle: "Creatures with power less than the number of Islands you control can't block this creature." };
    expect(classifyCard(kraken)).not.toMatch(/^native/);
    expect(selfPowerBlockGateOf(kraken)).toBeNull();
  });

  it("CREED — 'less than or equal to' is a DIFFERENT comparison and is not credited", () => {
    const le = { ...WOLF, oracle: "Creatures with power less than or equal to Wandering Wolf's power can't block it." };
    expect(classifyCard(le)).not.toMatch(/^native/);
    expect(selfPowerBlockGateOf(le)).toBeNull();
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...WOLF, oracle: `${WOLF.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
