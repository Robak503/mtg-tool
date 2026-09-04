/**
 * cryogenRelic.test.js — SHELF-85 runbook Phase 2 · B12 (2026-09-04): Cryogen Relic (Brago).
 *
 *   "When this artifact enters or leaves the battlefield, draw a card.
 *    {1}{U}, Sacrifice this artifact: Put a stun counter on up to one target tapped creature."
 *
 * The stun tap-lock existed on the TAP atom (Gilded Scuttler's "tap … and put a stun counter on it") and at the untap
 * step (untapOrConsumeStun, CR 122.1c); what was missing was the bare placement without a tap. One arm on the counter
 * lane: "put N stun counter(s) on [up to one] target [tapped] creature" — the same "stun" kind, the tapped restriction
 * the enumerator already honors, "up to one" on the subset path; the intent query reads a stun counter as harm.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, untapAll } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RELIC = { id: "c-cr", name: "Cryogen Relic", type: "Artifact", mana: "{1}{U}", cmc: 2, keywords: [],
  oracle: "When this artifact enters or leaves the battlefield, draw a card.\n{1}{U}, Sacrifice this artifact: Put a stun counter on up to one target tapped creature." };
const island = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: ctrl });
const bear = (id, ctrl, tapped) => createPermanent({ id, card: { id: "card-" + id, name: "Bear " + id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, tapped });

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "RELIC", card: RELIC, controller: "user" }), island("I1", "user"), island("I2", "user")], library: [{ id: "u-lib", name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }], hand: [] },
      ai: { ...s.players.ai, battlefield: [bear("TAPPED", "ai", true), bear("READY", "ai", false)], library: [], hand: [] } } };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "RELIC");

describe("parse", () => {
  it("the bare stun placement: up-to-one, tapped-only; the mandatory untapped form too", () => {
    const r = parseEffectClause("Put a stun counter on up to one target tapped creature.", "Artifact");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "add-counter", counterType: "stun", amount: 1, targetType: "creature", restrictions: [{ kind: "tapped", value: true }], maxTargets: 1, minTargets: 0 }]);
    expect(parseEffectClause("Put two stun counters on target creature.", "Instant").atoms).toEqual([{ op: "add-counter", counterType: "stun", amount: 2, targetType: "creature", restrictions: [] }]);
  });
  it("a stun counter is harm — the intent is enemy-facing", () => {
    expect(atomTargetIntent({ op: "add-counter", counterType: "stun", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "add-counter", counterType: "+1/+1", targetType: "creature" })).toBe("own");
  });
  it("seen-to-fail: the controller-scoped forms are not this arm's (they park)", () => {
    expect(parseEffectClause("Put a stun counter on target tapped creature you control.", "Artifact").atoms).toEqual([]);
    expect(parseEffectClause("Put a stun counter on target creature an opponent controls.", "Artifact").atoms).toEqual([]);
    // "with flying" is a generic restriction the lane folds and the enumerator enforces — a real parse, not a miss.
    expect(parseEffectClause("Put a stun counter on target creature with flying.", "Artifact").atoms[0]).toMatchObject({ counterType: "stun", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] });
  });
});

describe("runtime — only a TAPPED creature is offered; the counter lands and the untap step consumes it", () => {
  it("the offer, the sacrifice cost, the leaves-draw, and the counter", () => {
    let s = board();
    const acts = offers(s);
    const targeted = acts.filter((a) => a.targets?.length);
    expect(targeted.map((a) => a.targets[0].id)).toEqual(["TAPPED"]); // never the untapped Bear
    s = dispatchAction(s, targeted[0]);
    expect(s.players.user.battlefield.some((p) => p.id === "RELIC")).toBe(false); // sacrificed as the cost
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); // the leaves-the-battlefield draw
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.user.hand).toHaveLength(1);
    const stunned = s.players.ai.battlefield.find((p) => p.id === "TAPPED");
    expect(stunned.counters?.stun).toBe(1);
    expect(s.players.ai.battlefield.find((p) => p.id === "READY").counters?.stun).toBeFalsy();
    // The AI's untap step: the stunned Bear stays tapped and loses the counter; the other Bear is untouched.
    const after = untapAll(s, { playerId: "ai" });
    const still = after.players.ai.battlefield.find((p) => p.id === "TAPPED");
    expect(still.tapped).toBe(true);
    expect(still.counters?.stun || 0).toBe(0);
    // …and the untap after that frees it.
    expect(untapAll(after, { playerId: "ai" }).players.ai.battlefield.find((p) => p.id === "TAPPED").tapped).toBe(false);
  });
  it("with no tapped creature on the board the up-to-one ability is still offered (an empty choice) and does nothing", () => {
    let s = board();
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [bear("READY", "ai", false)] } } };
    const acts = offers(s);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => !(a.targets || []).length)).toBe(true);
  });
});

describe("classifier", () => {
  it("Cryogen Relic is native-mixed", () => {
    expect(classifyCard(RELIC)).toBe("native-mixed");
  });
});
