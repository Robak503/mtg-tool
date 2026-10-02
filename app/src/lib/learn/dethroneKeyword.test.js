/**
 * dethroneKeyword.test.js — dethrone (CR 702.104a, census slice 46).
 *
 * "Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a
 * +1/+1 counter on it.)"
 *
 * Synthesized from the printed keyword like renown / firebending, with an ordinary modeled effectClause so
 * no new resolver was needed. The interesting part is the CONDITION.
 *
 * WHY IT COULD NOT REUSE THE LIFE-COMPARISON BRANCH THAT WAS ALREADY THERE. Sword Coast Sailor's
 * intervening-if asks whether no OPPONENT has more life than the attacked player. Dethrone asks whether
 * that player has the most life among ALL players — the attacking player included. Those two questions
 * disagree exactly when you are the life leader, which in a pod is common: at 40 attacking an opponent on
 * 30 with a third player on 20, SC-1 answers yes and dethrone answers NO. You are on the throne; there is
 * nobody above you to dethrone. Reusing that branch would have handed out counters on the wrong boards,
 * and that case is pinned below.
 *
 * TIMING, stated honestly. In the printed rule the comparison belongs to the trigger EVENT — checked once,
 * at declaration. As an intervening-if it is checked at declaration AND again on resolution (CR 603.4). The
 * divergence surfaces only if the attacked player's life changes in response to the trigger, and it can
 * only REMOVE a counter that should have been placed, never add one that shouldn't. That is a false
 * negative, which the creed permits. The opposite direction would not have been acceptable.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers, hasDethrone } from "./triggers.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";

const REMINDER = "Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)";
const MARCHESA = { name: "Marchesa's Emissary", type: "Creature — Human Rogue", mana: "{3}{B}", power: 2, toughness: 3, keywords: [], oracle: REMINDER };

const CONDITION = "that player has the most life or is tied for most life";

/** Evaluate the dethrone condition with explicit life totals. `lives` keyed by player id. */
function condition(lives, defenderId, controllerId = "user") {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const [pid, pl] of Object.entries(s.players)) players[pid] = { ...pl, life: lives[pid] ?? pl.life };
  return evaluateInterveningIf({ ...s, players }, CONDITION, controllerId, { defenderId });
}

describe("the keyword is read off the printed line", () => {
  it("the bare keyword reads", () => {
    expect(hasDethrone(REMINDER)).toBe(true);
  });

  it("CREED — a GRANTED dethrone is not read as this creature's own keyword (Dack's Duplicate)", () => {
    expect(hasDethrone("You may have this creature enter as a copy of any creature on the battlefield, except it has haste and dethrone. (Whenever it attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)")).toBe(false);
  });

  it("synthesizes the attacks descriptor with the condition attached", () => {
    const t = detectTriggers(MARCHESA);
    expect(t[0]).toMatchObject({
      event: "attacks", scope: "self", sourceText: "Dethrone",
      effectClause: "put a +1/+1 counter on this creature",
      interveningIf: CONDITION,
    });
  });
});

describe("THE CONDITION — compared across ALL players, not just opponents", () => {
  it("attacking the clear life leader is true", () => {
    expect(condition({ user: 20, ai1: 40, ai2: 20, ai3: 20 }, "ai1")).toBe(true);
  });

  it("TIED for most life is true — 'or tied for most life'", () => {
    expect(condition({ user: 40, ai1: 40, ai2: 20, ai3: 20 }, "ai1")).toBe(true);
  });

  it("THE CASE THE OTHER BRANCH GETS WRONG — you are ahead of the player you attack", () => {
    // 40 vs an opponent on 30 with a third on 20. "No OPPONENT has more life than ai1" is TRUE, so the
    // Sword Coast Sailor branch would fire. Dethrone must NOT: the attacker holds the throne.
    expect(condition({ user: 40, ai1: 30, ai2: 20, ai3: 20 }, "ai1")).toBe(false);
  });

  it("attacking someone while a THIRD player is higher is false", () => {
    expect(condition({ user: 10, ai1: 30, ai2: 40, ai3: 20 }, "ai1")).toBe(false);
  });

  it("a planeswalker attack drops out rather than mis-firing", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(evaluateInterveningIf(s, CONDITION, "user", { defenderId: "ai1", defenderPlaneswalkerId: "pw1" })).toBeNull();
  });

  it("a missing attacked-player referent drops out (FN-safe), never fires blind", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(evaluateInterveningIf(s, CONDITION, "user", {})).toBeNull();
  });
});

describe("RUNTIME — the counter is really placed", () => {
  function attack({ userLife, defLife, otherLife }) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const m = createPermanent({ id: "m", card: MARCHESA, controller: "user", summoningSick: false });
    let st = {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 7,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [m], life: userLife },
        ai1: { ...s.players.ai1, life: defLife },
        ai2: { ...s.players.ai2, life: otherLife },
        ai3: { ...s.players.ai3, life: otherLife },
      },
    };
    const atk = legalActionsForPlayer(st, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "m" && a.defenderId === "ai1");
    st = dispatchAction(st, atk);
    // RE-POINTED (the attack-trigger timing fix, CR 508.1m / 508.2): the engine's step advance closes the attacker declaration
    // and stacks the attack trigger inside the declare attackers step; a raw advanceStep walk no longer fires it.
    st = nextStep(st);
    let g = 0; while (st.stack.length && g++ < 10) st = resolveTopOfStack(st);
    const perm = st.players.user.battlefield.find((p) => p.id === "m");
    return perm?.counters?.["+1/+1"] || 0;
  }

  it("attacking the life leader places a +1/+1 counter", () => {
    expect(attack({ userLife: 20, defLife: 40, otherLife: 20 })).toBe(1);
  });

  it("attacking someone you are AHEAD of places nothing", () => {
    expect(attack({ userLife: 40, defLife: 30, otherLife: 20 })).toBe(0);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(MARCHESA)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...MARCHESA, oracle: `${REMINDER}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
