/**
 * countersPutOnTrigger.test.js — "Whenever one or more +1/+1 counters are put on this creature" (CR 122.6).
 *
 * A new trigger EVENT. `detectTriggers` returned nothing for this wording, so all 31 corpus carriers parked
 * and the line masqueraded as residue in the coverage scan.
 *
 * TWO PATHS, BOTH REQUIRED, because CR 122.6 says so outright:
 *   "Some spells and abilities refer to counters being put on an object. This refers to putting counters on
 *    that object while it's on the battlefield AND ALSO to an object that's given counters as it enters the
 *    battlefield."
 * So a permanent ENTERING with counters fires this. That is the deliberate OPPOSITE of the becomes-tapped
 * sibling, which skips enters-tapped — the CR treats the two entry cases differently, and getting it
 * backwards would mis-play every carrier. Both paths are asserted below.
 *
 * ARCHITECTURE: `gameState.addCounter` cannot fire a trigger — triggers.js imports gameState, so the reverse
 * edge is a cycle. It appends a plain JSON row to `state.pendingCounterEvents`; `checkCounterTriggers` drains
 * it at the `flushTriggers` funnel, beside the existing tap and graveyard drains. Same shape as the proven
 * delayed-trigger scheduler.
 *
 * PLURAL FORM ONLY. "one or more … are put on" fires ONCE per placement however many counters land. The older
 * SINGULAR wording ("a +1/+1 counter is put on ~" — Fathom Mage) may fire once PER COUNTER and the bundled CR
 * does not settle it; rather than guess a firing count it stays undetected → Arbiter (CLAUDE.md §1.2).
 *
 * KNOWN INTERACTION, documented not hidden: two cascade-capable carriers (Generous Pup; Scurry Oak via
 * evolve) feed each other — a genuine paper-Magic infinite loop, which the rules resolve as a draw
 * (CR 104.4b). `learnSession` carries a per-turn tick budget (default 2000) as the backstop. I was NOT able
 * to construct a valid end-to-end demonstration that the budget bounds THIS cascade specifically, so that
 * remains unverified rather than claimed. The full suite and the 20-game playability sweep are green.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent, addCounter } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

const WATCH = "Whenever one or more +1/+1 counters are put on this creature, draw a card.";
const beast = (oracle) => ({ name: "Herd Baloth", type: "Creature — Beast", mana: "{3}{G}", power: "4", toughness: "4", keywords: [], oracle });

function board(perms = []) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: perms, hand: [], library: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, name: `C${i}`, type: "Sorcery" })) } },
  };
}
const drain = (s) => { let g = 0; let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); while ((st.stack || []).length && g++ < 20) st = resolveTopOfStack(st); return st; };
const watcher = () => createPermanent({ id: "w", card: { id: "cw", name: "W", type: "Creature — Beast", power: 4, toughness: 4, oracle: WATCH }, controller: "user", summoningSick: false });

describe("detection — plural self only, with the counter kind carried", () => {
  it("detects the event and carries counterType", () => {
    const d = detectTriggers(beast(WATCH))[0];
    expect(d).toMatchObject({ event: "countersPut", scope: "self", counterType: "+1/+1" });
  });

  it("the counter KIND is per-card, not assumed", () => {
    expect(detectTriggers(beast("Whenever one or more -1/-1 counters are put on this creature, draw a card."))[0].counterType).toBe("-1/-1");
  });

  it("CREED — the SINGULAR wording stays undetected (its firing COUNT is unsettled)", () => {
    // "a +1/+1 counter is put on" may fire once per counter; the bundled CR does not say. Guessing a count
    // would be inventing card behavior, so it routes to the Arbiter instead.
    expect(detectTriggers(beast("Whenever a +1/+1 counter is put on this creature, draw a card."))).toHaveLength(0);
  });

  it("CREED — a SCOPED subject is not claimed by this self-only slice", () => {
    expect(detectTriggers(beast("Whenever one or more +1/+1 counters are put on a creature you control, draw a card."))).toHaveLength(0);
  });
});

describe("RUNTIME — path 1: counters placed while on the battlefield", () => {
  it("fires ONCE for the whole placement, not once per counter", () => {
    const s = drain(addCounter(board([watcher()]), { permanentId: "w", type: "+1/+1", amount: 2 }));
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("THE TYPE GATE — a -1/-1 counter does NOT trip a +1/+1 watcher", () => {
    const s = drain(addCounter(board([watcher()]), { permanentId: "w", type: "-1/-1", amount: 1 }));
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("a placement that doubles to zero records nothing", () => {
    const s = drain(addCounter(board([watcher()]), { permanentId: "w", type: "+1/+1", amount: 0 }));
    expect(s.players.user.hand).toHaveLength(0);
  });
});

describe("RUNTIME — path 2: CR 122.6, counters given AS IT ENTERS", () => {
  it("a creature entering WITH counters fires its own watcher", () => {
    // The rule this slice hinges on. If this ever goes to 0, the ETB half has been lost and every carrier
    // that enters with counters silently under-fires.
    const s = drain(enterPermanent(board([]), {
      id: "ch", name: "Hydra", type: "Creature — Hydra", mana: "{2}{G}", power: "0", toughness: "0",
      oracle: `This creature enters with three +1/+1 counters on it.\n${WATCH}`,
    }, "user"));
    expect(s.players.user.hand).toHaveLength(1);
  });
});

describe("the drain is idempotent and safe", () => {
  it("a second flush does not re-fire", () => {
    let s = drain(addCounter(board([watcher()]), { permanentId: "w", type: "+1/+1", amount: 1 }));
    s = drain(s);
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("a recipient that left the battlefield no-ops", () => {
    let s = addCounter(board([watcher()]), { permanentId: "w", type: "+1/+1", amount: 1 });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(() => drain(s)).not.toThrow();
    expect(drain(s).players.user.hand).toHaveLength(0);
  });
});

describe("classification", () => {
  it("a real carrier flips", () => {
    expect(classifyCard(beast("Whenever one or more +1/+1 counters are put on this creature, create a 4/4 green Beast creature token."))).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(beast(`${WATCH}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });
});
