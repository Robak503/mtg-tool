/**
 * attackTriggerMultiplier.test.js — Isshin, Two Heavens as One #1456 (CR 603.x).
 *
 *   "If a creature attacking causes a triggered ability of a permanent you control to trigger, that
 *    ability triggers an additional time."
 *
 * Teysa Karlov's twin: the SAME rule-modifying static, one word apart on the card ("dying" →
 * "attacking") and one layerOp apart in the engine. The expansion body is shared (multiplyTriggers) so
 * the two can't drift on the part that actually matters — each extra instance must be a DISTINCT pending
 * trigger, not a re-resolve, so flushTriggers builds it into its own stack object with independently
 * chosen targets (CR 603.x).
 *
 * THE SUBJECT IS "A CREATURE ATTACKING", not "a creature you control attacking". An opponent's attack
 * that fires YOUR "whenever a creature attacks you" permanent is doubled too — a real Isshin line, and
 * it falls out correctly because the multiplier keys on the ABILITY's controller rather than the
 * attacker's. Pinned below so a future "fix" doesn't quietly narrow it to your own attacks.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { attackTriggerMultiplierCount, diesTriggerMultiplierCount } from "./layers.js";
import { checkAttackTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ISSHIN = { id: "c-iss", name: "Isshin, Two Heavens as One", type: "Legendary Creature — Human Samurai", mana: "{R}{W}", power: 3, toughness: 4, keywords: [],
  oracle: "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };
const TEYSA = { id: "c-tey", name: "Teysa Karlov", type: "Legendary Creature — Human Advisor", mana: "{2}{W}{B}", power: 2, toughness: 4, keywords: [],
  oracle: "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink." };
const WATCHER = { id: "c-w", name: "Battle Scribe", type: "Creature — Human", power: 1, toughness: 1, keywords: [],
  oracle: "Whenever you attack, draw a card." };
const ATTACKER = { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [] };

/** `mine` on the user's battlefield; one declared attacker for the user. */
function attacking(mine) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user",
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: [
          createPermanent({ id: "atk", card: ATTACKER, controller: "user", summoningSick: false, tapped: true }),
          ...mine.map((c, i) => createPermanent({ id: `m${i}`, card: c, controller: "user", summoningSick: false })),
        ],
      },
    },
  };
}
const fired = (s) => (checkAttackTriggers(s).pendingTriggers || []).length;

describe("recognition — the static, and its distinctness from Teysa's", () => {
  it("Isshin emits an attackTriggerMultiplier continuous effect", () => {
    const d = parseStaticAbilities(ISSHIN);
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "attackTriggerMultiplier" });
    expect(d[0].affects).toEqual({ mode: "self" });
  });

  it("Isshin #1456 classifies native-static", () => {
    expect(classifyCard(ISSHIN)).toBe("native-static");
  });

  it("THE CROSS-WIRING PIN — Isshin counts for ATTACK only, Teysa for DIES only", () => {
    // The two statics are one word apart on the card. Counting either under the other's layerOp would
    // double the wrong triggers on a board that plays both, which is a common Mardu shell.
    const s = attacking([ISSHIN, TEYSA]);
    expect(attackTriggerMultiplierCount(s, "user")).toBe(1);
    expect(diesTriggerMultiplierCount(s, "user")).toBe(1);
    expect(attackTriggerMultiplierCount(s, "ai")).toBe(0);
  });
});

describe("RUNTIME — the attack trigger fires an additional time", () => {
  it("without Isshin the watcher's attack trigger fires ONCE", () => {
    expect(fired(attacking([WATCHER]))).toBe(1);
  });

  it("THE LOAD-BEARING ONE — with Isshin it fires TWICE", () => {
    expect(fired(attacking([WATCHER, ISSHIN]))).toBe(2);
  });

  it("two Isshins → THREE times (the Teysa ruling, +1 each)", () => {
    expect(fired(attacking([WATCHER, ISSHIN, { ...ISSHIN, id: "c-iss2", name: "Isshin Two" }]))).toBe(3);
  });

  it("the extra instance is a DISTINCT object — not the same trigger twice", () => {
    // flushTriggers builds each into its own stack object with independently chosen targets (CR 603.x).
    // Sharing one reference would collapse them into a single resolution.
    const pending = checkAttackTriggers(attacking([WATCHER, ISSHIN])).pendingTriggers;
    expect(pending[0]).not.toBe(pending[1]);
  });

  it("an OPPONENT's Isshin does not multiply the user's triggers", () => {
    const s = attacking([WATCHER]);
    const oppIsshin = {
      ...s,
      players: { ...s.players, ai: { ...s.players.ai, battlefield: [createPermanent({ id: "oi", card: ISSHIN, controller: "ai" })] } },
    };
    expect(fired(oppIsshin)).toBe(1);
  });

  it("TEYSA does NOT multiply attack triggers (the mirror of the cross-wiring pin)", () => {
    expect(fired(attacking([WATCHER, TEYSA]))).toBe(1);
  });

  it("no attackers → no triggers, and no multiplication of nothing", () => {
    const s = attacking([WATCHER, ISSHIN]);
    expect(fired({ ...s, combat: { attackers: [], blockers: [] } })).toBe(0);
  });
});
