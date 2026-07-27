/**
 * renown.test.js — KW-RENOWN (CR 702.111), census slice 6 (12 sole-blockers).
 *
 * "Renown N (When this creature deals combat damage to a player, if it isn't renowned, put N +1/+1
 * counters on it and it becomes renowned.)" — the ability lives entirely in reminder parens, so it is
 * synthesized from the printed keyword exactly like evolve/undying (detectTriggers → a
 * combatDamageToPlayer descriptor carrying a kind-tagged sentinel only renownClauseParser models).
 *
 * THE LATCH is the load-bearing part (CR 702.111a): "if it isn't renowned" is a ONE-SHOT per-permanent
 * flag, not a board query, so it lives INSIDE the atom next to monstrosity's `monstrous` flag rather than
 * as an intervening-if — a fail-open board read would re-renown the creature every single combat, the
 * forbidden FP. These tests prove the latch holds across repeated damage.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, renownKeywordValue } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyRenown } from "./effects/atoms/counters.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REMINDER = "(When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)";
const card = (name, n, extra = "") => ({
  name, type: "Creature — Human Soldier", mana: "{1}{W}", power: 2, toughness: 2,
  oracle: `${extra}Renown ${n} ${REMINDER}`.trim(),
});

describe("detection — keyword→trigger synthesis (the evolve precedent)", () => {
  it("reads N off the printed keyword and synthesizes a combat-damage descriptor", () => {
    expect(renownKeywordValue(card("Topan Freeblade", 1).oracle)).toBe(1);
    expect(renownKeywordValue(card("Rhox Maulers", 2).oracle)).toBe(2);
    const d = detectTriggers(card("Rhox Maulers", 2));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "self", optional: false, interveningIf: null });
    expect(d[0].effectClause).toBe("[renown] put 2 +1/+1 counters on this creature");
    expect(triggerRoutesNatively(d[0])).toBe(true);
  });
  it("the sentinel parses to the renown atom (and no PRINTED clause can reach it)", () => {
    const p = parseEffectClause("[renown] put 2 +1/+1 counters on this creature", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "renown", amount: 2 });
    // A player can't write the sentinel — the bracket tag is synthesis-only.
    expect(programConfidence(parseEffectClause("put 2 +1/+1 counters on this creature", "Instant"))).toBe("high"); // ordinary clause still works
    expect(parseEffectClause("put 2 +1/+1 counters on this creature", "Instant").atoms[0].op).not.toBe("renown");
  });
  it("a GRANTED renown is a different shape and contributes 0 (keeps shaped===detected reconciled)", () => {
    expect(renownKeywordValue("Creatures you control have renown 1.")).toBe(0);
  });
  it("real carriers flip native (Topan Freeblade, Rhox Maulers, Stalwart Aven)", () => {
    expect(classifyCard(card("Topan Freeblade", 1, "Vigilance\n"))).toMatch(/^native/);
    expect(classifyCard(card("Rhox Maulers", 2, "Trample\n"))).toMatch(/^native/);
    expect(classifyCard(card("Stalwart Aven", 1, "Flying\n"))).toMatch(/^native/);
  });
  it("CREED: renown + an UNMODELED sibling ability still parks (whole-card law)", () => {
    expect(classifyCard(card("Synth", 1, "Whenever this creature glorbulates, frobnicate target nonsense.\n"))).toBe("body-only");
  });
});

describe("RUNTIME — the CR 702.111a latch (the FP this design exists to prevent)", () => {
  function boardWith(renowned = false) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({
      id: "rn", controller: "user", summoningSick: false,
      card: { id: "c-rn", name: "Topan Freeblade", type: "Creature — Human Soldier", power: 2, toughness: 2, oracle: card("Topan Freeblade", 1).oracle },
    });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...perm, renowned }] } } };
  }
  const countersOf = (s) => s.players.user.battlefield[0].counters?.["+1/+1"] || 0;
  const isRenowned = (s) => !!s.players.user.battlefield[0].renowned;

  it("first combat damage: places N counters AND sets the flag", () => {
    const out = applyRenown(boardWith(false), { op: "renown", amount: 1 }, { controller: "user", sourceId: "rn" });
    expect(countersOf(out)).toBe(1);
    expect(isRenowned(out)).toBe(true);
  });

  it("SECOND combat damage does NOTHING — the latch holds (a fail-open would re-renown every combat)", () => {
    let s = applyRenown(boardWith(false), { op: "renown", amount: 1 }, { controller: "user", sourceId: "rn" });
    const afterFirst = countersOf(s);
    s = applyRenown(s, { op: "renown", amount: 1 }, { controller: "user", sourceId: "rn" });
    expect(countersOf(s)).toBe(afterFirst);   // no second placement
    expect(isRenowned(s)).toBe(true);
  });

  it("an already-renowned creature entering the ability is a clean no-op", () => {
    const s = applyRenown(boardWith(true), { op: "renown", amount: 2 }, { controller: "user", sourceId: "rn" });
    expect(countersOf(s)).toBe(0);
  });

  it("a source that has LEFT the battlefield is a clean no-op — never a counter on a stale id", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(() => applyRenown(s, { op: "renown", amount: 1 }, { controller: "user", sourceId: "gone" })).not.toThrow();
  });

  it("renown 2 places TWO counters (N is read from the printed keyword, not hardcoded)", () => {
    expect(countersOf(applyRenown(boardWith(false), { op: "renown", amount: 2 }, { controller: "user", sourceId: "rn" }))).toBe(2);
  });
});
