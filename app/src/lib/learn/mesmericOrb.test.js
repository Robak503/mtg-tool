/**
 * mesmericOrb.test.js — the BECOMES-UNTAPPED event + Mesmeric Orb (SHELF S6).
 *
 * "Whenever a permanent becomes untapped, that permanent's controller mills a card." Seams:
 *   1. gameState.untapAll / untapPermanent record pendingUntapEvents for REAL tapped→untapped transitions
 *      only (a doesNotUntapNext skip and a stun-consume stay tapped — no event; an already-untapped
 *      permanent never "becomes" untapped); the Seedborn/Murkfiend hooks record too.
 *   2. triggers.checkUntapTriggers drains the queue and fires "untapped" watchers with the untapped
 *      permanent as triggeringPermanent + ctx.untappedControllerId (gameEngine fires it after the untap
 *      step — the triggers then wait for upkeep priority, CR 502.4).
 *   3. the mill payoff who:"untappedController" (referent-gated to the untapped event).
 * CREED FP = a mill for an untap that didn't happen (stun/no-untap/already-untapped) or the wrong player.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, untapAll, untapPermanent, addCounter } from "./gameState.js";
import { detectTriggers, checkUntapTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const ORB_ORACLE = "Whenever a permanent becomes untapped, that permanent's controller mills a card.";
const orbCard = (id = "mo-card") => ({ id, name: "Mesmeric Orb", type: "Artifact", mana: "{2}", oracle: ORB_ORACLE });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const cards = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, type: "Instant", oracle: "" }));
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("detection + classify", () => {
  it("the untapped watcher detects, routes natively; Mesmeric Orb → native-trigger", () => {
    const [d] = detectTriggers(orbCard()).filter((t) => t.event === "untapped");
    expect(d).toMatchObject({ event: "untapped", scope: "anyPermanent" });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(orbCard())).toBe("native-trigger");
  });
});

describe("event recording (CREED core — transitions only)", () => {
  it("untapAll records ONLY tapped permanents; stun-consumes and no-untap flags never record", () => {
    let s = baseState();
    const tapped = { ...createPermanent({ id: "t1", card: { name: "T1", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" }), tapped: true };
    const already = createPermanent({ id: "u1", card: { name: "U1", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const stunned = { ...createPermanent({ id: "s1", card: { name: "S1", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" }), tapped: true, counters: { stun: 1 } };
    const locked = { ...createPermanent({ id: "l1", card: { name: "L1", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" }), tapped: true, doesNotUntapNext: true };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [tapped, already, stunned, locked] } } };
    const after = untapAll(s, { playerId: "user" });
    expect((after.pendingUntapEvents || []).map((e) => e.id)).toEqual(["t1"]);
  });

  it("untapPermanent records a tapped→untapped transition; not an already-untapped or stun-consume one", () => {
    let s = baseState();
    const tapped = { ...createPermanent({ id: "t1", card: { name: "T1", type: "Artifact", oracle: "" }, controller: "user" }), tapped: true };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [tapped] } } };
    let after = untapPermanent(s, "t1");
    expect((after.pendingUntapEvents || []).map((e) => e.id)).toEqual(["t1"]);
    // already untapped → no event
    expect(untapPermanent(after, "t1").pendingUntapEvents?.filter((e) => e !== undefined) ?? []).toHaveLength(1); // unchanged queue (drained separately)
    // a stun-consume stays tapped → no event
    let s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...tapped, counters: { stun: 1 } }] } } };
    expect(untapPermanent(s2, "t1").pendingUntapEvents ?? []).toHaveLength(0);
  });
});

describe("engine (CREED core — the mill fires per transition for the right player)", () => {
  it("the untap-step transitions mill THAT controller once per permanent", () => {
    let s = baseState();
    const orb = createPermanent({ id: "orb", card: orbCard(), controller: "user" });
    const t1 = { ...createPermanent({ id: "t1", card: { name: "T1", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1" }), tapped: true };
    const t2 = { ...createPermanent({ id: "t2", card: { name: "T2", type: "Artifact", oracle: "" }, controller: "ai1" }), tapped: true };
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [orb] },
      ai1: { ...s.players.ai1, battlefield: [t1, t2], library: cards("al", 5) },
    } };
    let after = untapAll(s, { playerId: "ai1" });
    after = checkUntapTriggers(after);
    expect((after.pendingTriggers || []).filter((t) => t.event === "untapped")).toHaveLength(2);
    after = resolveAll(after);
    expect(after.players.ai1.graveyard).toHaveLength(2); // one mill per untapped permanent, ai1's library only
    expect(after.players.user.graveyard).toHaveLength(0);
  });
});
