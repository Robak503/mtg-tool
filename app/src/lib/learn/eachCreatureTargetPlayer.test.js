/**
 * eachCreatureTargetPlayer.test.js — EACH-CREATURE-TARGET-PLAYER-CONTROLS (Contagion Engine — SHELF S7).
 *
 * "When this artifact enters, put a -1/-1 counter on each creature target player controls." The CHOSEN
 * target is a PLAYER (CR 115.1 — any player, self included, is legal); the recipients are every creature
 * that player controls, expanded AT RESOLUTION inside the shared atomTargets (CR 611.2c) via the
 * eachCreatureOfTargetPlayer marker — NOT a new mass targetType, so the NON_CHOSEN_TARGET_TYPES drift
 * registry is untouched. The -1/-1 placement runs the lethal SBA at resolution (the P2.3 negative-pump
 * discipline), so a 1/1 dies to the counter. ("{4}, {T}: Proliferate twice." was already modeled —
 * proliferate times:2 — so this ETB closes the whole card.)
 * CREED FP = wrong side / wrong set, so the exact recipient set is pinned (only the chosen player's
 * creatures; the controller's own and a third player's are untouched).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyAddCounter } from "./effects/atoms/counters.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const CONTAGION_ORACLE =
  "When this artifact enters, put a -1/-1 counter on each creature target player controls.\n{4}, {T}: Proliferate twice. (Choose any number of permanents and/or players, then give each another counter of each kind already there. Then do it again.)";
const contagionCard = (id = "ce-card") => ({
  id, name: "Contagion Engine", type: "Artifact", mana: "{6}", oracle: CONTAGION_ORACLE,
});

const CLAUSE = "put a -1/-1 counter on each creature target player controls";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const creature = (id, controller, pt = [2, 2]) =>
  createPermanent({ id, card: { name: id, type: "Creature — Zombie", power: String(pt[0]), toughness: String(pt[1]), oracle: "" }, controller });

describe("parser", () => {
  it("the clause parses HIGH → ONE add-counter atom with a chosen PLAYER target + the expansion marker", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(true); // a chosen player target — not a mass scope
    expect(p.atoms).toEqual([{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "player", eachCreatureOfTargetPlayer: true }]);
  });
  it("CREED — a filtered variant ('each Zombie target player controls') stays LOW (Arbiter)", () => {
    const p = parseEffectClause("put a -1/-1 counter on each zombie creature target player controls", "Instant");
    expect(programConfidence(p)).not.toBe("high");
  });
});

describe("detection + routing + classify", () => {
  it("the ETB trigger routes natively (chosen player target, enemy-side intent for -1/-1)", () => {
    const [d] = detectTriggers(contagionCard()).filter((t) => t.event === "etb");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("Contagion Engine → native-mixed (ETB + the already-modeled proliferate-twice activated ability)", () => {
    expect(classifyCard(contagionCard())).toBe("native-mixed");
  });
});

describe("resolver (CREED core — exact recipient set)", () => {
  const ATOM = { op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "player", eachCreatureOfTargetPlayer: true };

  it("hits EVERY creature the chosen player controls — and ONLY theirs; a 1/1 dies to the SBA", () => {
    let s = baseState();
    s = withBattlefield(s, "ai1", [creature("v1", "ai1", [2, 2]), creature("v2", "ai1", [1, 1])]);
    s = withBattlefield(s, "ai2", [creature("w1", "ai2", [2, 2])]);
    s = withBattlefield(s, "user", [creature("m1", "user", [2, 2])]);

    const after = applyAddCounter(s, ATOM, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    const v1 = after.players.ai1.battlefield.find((p) => p.id === "v1");
    expect(v1.counters["-1/-1"]).toBe(1);
    // the 1/1 dropped to 0 toughness → died at resolution (P2.3 negative-pump discipline)
    expect(after.players.ai1.battlefield.find((p) => p.id === "v2")).toBeUndefined();
    expect(after.players.ai1.graveyard.map((c) => c.name)).toContain("v2");
    // a third player's and the controller's creatures are untouched
    expect(after.players.ai2.battlefield.find((p) => p.id === "w1").counters?.["-1/-1"]).toBeUndefined();
    expect(after.players.user.battlefield.find((p) => p.id === "m1").counters?.["-1/-1"]).toBeUndefined();
  });

  it("the chosen player has no creatures → a clean no-op (never a fabricated set)", () => {
    const s = baseState();
    const after = applyAddCounter(s, ATOM, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(after.players.ai1.battlefield).toEqual([]);
  });

  it("a vanished/absent player target → a clean no-op", () => {
    let s = baseState();
    s = withBattlefield(s, "ai1", [creature("v1", "ai1")]);
    const after = applyAddCounter(s, ATOM, { controller: "user", targets: [] });
    expect(after.players.ai1.battlefield.find((p) => p.id === "v1").counters?.["-1/-1"]).toBeUndefined();
  });
});
