/**
 * unleashKeyword.test.js — unleash (CR 702.86a, census slice 50).
 *
 * "Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a
 * +1/+1 counter on it.)"
 *
 * THE HISTORY MATTERS HERE, so it is written down. One slice earlier, unleash was REFUSED admission to the
 * optional-mode keyword family (delve / myriad / replicate / fuse / squad / enlist / extort). Those are
 * credited because the keyword offers an option the engine never takes, and declining it leaves a real,
 * complete, legal play. Unleash only half-fits: the entry counter IS such an option, but the second sentence
 * is a conditional STATIC. Crediting the keyword for free would have let the creature block whenever a +1/+1
 * counter arrived from somewhere else — an anthem, a counter effect, another card's trigger — which is a
 * creature blocking when the printed card forbids it. The false-positive direction.
 *
 * So it is credited here for the opposite reason: because the restriction is now ENFORCED.
 * canBlockAttacker reads the permanent's counters LIVE at block declaration, which binds regardless of where
 * the counter came from. That "regardless of source" property is the whole point, and it is the case tested
 * most carefully below — a flag set at entry time would have passed the easy tests and still been wrong.
 */
import { describe, expect, it } from "vitest";

import { canBlockAttacker, hasUnleash } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const REMINDER = "Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it.)";
const DRAKE = { name: "Rakdos Drake", type: "Creature — Drake", mana: "{2}{B}", power: 1, toughness: 2, keywords: [], oracle: `Flying\n${REMINDER}` };
const PLAIN = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

/** Can `blockerCard` (with the given counters) block a plain attacker? */
function canBlock(blockerCard, counters = null) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const atk = createPermanent({ id: "atk", card: PLAIN, controller: "user", summoningSick: false });
  const blk = createPermanent({ id: "blk", card: blockerCard, controller: "ai1", summoningSick: false });
  if (counters) blk.counters = { ...blk.counters, ...counters };
  const st = {
    ...s, phase: "combat", step: "declare-blockers", activePlayer: "user", turn: 5,
    combat: { ...s.combat, attackers: [{ permanentId: "atk", defender: "ai1" }] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [atk] },
      ai1: { ...s.players.ai1, battlefield: [blk] },
    },
  };
  return canBlockAttacker(st, "blk", "atk", "ai1");
}

describe("the keyword is read off the printed line", () => {
  it("reads unleash", () => {
    expect(hasUnleash(DRAKE)).toBe(true);
  });

  it("a card without it reads false", () => {
    expect(hasUnleash(PLAIN)).toBe(false);
  });
});

describe("ENFORCEMENT — the block restriction is a LIVE counter read", () => {
  it("with NO counter, an unleash creature blocks normally — the declined entry choice is a legal mode", () => {
    expect(canBlock(DRAKE)).toBe(true);
  });

  it("with a +1/+1 counter, it cannot block", () => {
    expect(canBlock(DRAKE, { "+1/+1": 1 })).toBe(false);
  });

  it("THE POINT — the counter's SOURCE is irrelevant, which is why the free credit was unsafe", () => {
    // The engine never takes unleash's own entry option, so every counter an unleash creature carries in
    // this engine arrives from somewhere ELSE. A flag stamped at entry would report "no counter chosen" and
    // happily let this creature block. The live read is what makes the credit honest.
    expect(canBlock(DRAKE, { "+1/+1": 3 })).toBe(false);
  });

  it("a -1/-1 counter does NOT trigger the restriction — the card names +1/+1 specifically", () => {
    expect(canBlock(DRAKE, { "-1/-1": 2 })).toBe(true);
  });

  it("and it restricts only the unleash creature, not every creature with a counter", () => {
    expect(canBlock(PLAIN, { "+1/+1": 2 })).toBe(true);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(DRAKE)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...DRAKE, oracle: `${DRAKE.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
