/**
 * TRIG-PUMP-1 — the trigger-effect compiler pilot.
 *
 * Real combat-buff cards template their SELF pump with the pronoun "it": "Whenever Brazen Wolves
 * attacks, IT gets +2/+0 until end of turn." The modeled self-pump atom keys off the literal subject
 * "this creature" (target:"self" → ctx.sourceId), so detectTriggers normalizes a leading "it" →
 * "this creature" for a SELF-scope trigger whose WHOLE effect is the self-pump shape. This file pins:
 *   1. the normalization (self-scope "it gets/gains … eot" → "this creature …"; other shapes untouched);
 *   2. end-to-end execution — an "it gets" attack trigger pumps its own source through the real flush;
 *   3. native coverage — the Brazen-Wolves shape classifies native-trigger;
 *   4. the CREED guards — a NON-self scope ("a creature you control attacks, it …") is NEVER rewritten
 *      (its "it" is the OTHER triggering creature), an unmodeled keyword grant stays LOW, and a non
 *      self-pump use of "it" ("exile it") is left alone. All four are SAFE false-negatives → Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { triggersForEvent, detectTriggers } from "./triggers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle });
const clauseOf = (card) => detectTriggers(card)[0]?.effectClause;
const clauseHigh = (clause) => {
  const p = parseEffectClause(clause, "Instant");
  return !!p && programConfidence(p) === "high";
};

function boardWith(perm) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } },
  };
}

describe("normalization — self-scope 'it gets/gains … eot' → 'this creature …'", () => {
  it("rewrites the leading 'it' of a SELF-scope self-pump trigger so the parser models it", () => {
    // Brazen Wolves / Charging Paladin / Steadfast Cathar — the bare attack self-pump.
    const wolves = creature("Brazen Wolves", 2, 2, "Whenever Brazen Wolves attacks, it gets +2/+0 until end of turn.");
    const detected = detectTriggers(wolves);
    expect(detected[0]).toMatchObject({ event: "attacks", scope: "self" });
    expect(detected[0].effectClause).toBe("this creature gets +2/+0 until end of turn");
    expect(clauseHigh(detected[0].effectClause)).toBe(true);
  });

  it("normalizes the pump-and-grant and grant-only self-pump shapes too", () => {
    expect(clauseOf(creature("Renegade Freighter", 4, 3, "Whenever Renegade Freighter attacks, it gets +1/+1 and gains trample until end of turn.")))
      .toBe("this creature gets +1/+1 and gains trample until end of turn");
    expect(clauseOf(creature("Scorch Rider", 3, 1, "When Scorch Rider enters, it gains haste until end of turn.")))
      .toBe("this creature gains haste until end of turn");
    // a block self-pump (Shu Defender) normalizes as well.
    expect(clauseOf(creature("Shu Defender", 1, 4, "Whenever Shu Defender blocks, it gets +0/+2 until end of turn.")))
      .toBe("this creature gets +0/+2 until end of turn");
  });

  it("TRIG-PRONOUN-IT: a NON-self 'it' rewrites to the SENTINEL 'the triggering creature', NOT to 'this creature'", () => {
    // Fervent Charge shape: the recipient is the TRIGGERING creature, not the source — so detectTriggers must
    // NOT rewrite "it" → "this creature" (the self path). TRIG-PRONOUN-IT instead rewrites it → the sentinel
    // "the triggering creature" (parser target:"thatCreature" → ctx.triggeringPermanentId), which routes native.
    const anthem = creature("Anthem", 4, 4, "Whenever a creature you control attacks, it gains lifelink until end of turn.");
    const d = detectTriggers(anthem)[0];
    expect(d).toMatchObject({ event: "attacks", scope: "creatureYouControl" });
    expect(d.effectClause).toBe("the triggering creature gains lifelink until end of turn"); // sentinel, NOT "this creature"
    expect(d.effectClause.startsWith("this creature")).toBe(false);
    expect(clauseHigh(d.effectClause)).toBe(true); // now modeled via TRIG-PRONOUN-IT
  });

  it("CREED: a self-scope trigger whose 'it' is NOT a self-pump ('exile it') is left alone", () => {
    // "it" here is a sacrificed/exiled token, not a P/T buff — the whole-clause anchor refuses to rewrite.
    const d = detectTriggers(creature("Token Maker", 1, 1, "Whenever Token Maker attacks, exile it at end of combat."))[0];
    // either undetected, or detected with the leading "it" preserved — never normalized to a self-pump.
    if (d) expect(d.effectClause.startsWith("this creature")).toBe(false);
  });
});

describe("execution — an 'it gets' attack trigger pumps its own source (the pilot proof)", () => {
  it("'Whenever Brazen Wolves attacks, it gets +2/+0 until end of turn' pumps the attacker through the real flush", () => {
    const card = creature("Brazen Wolves", 2, 2, "Whenever Brazen Wolves attacks, it gets +2/+0 until end of turn.");
    let s = boardWith(createPermanent({ id: "u1", card, controller: "user", summoningSick: false }));
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: s.players.user.battlefield[0], triggeringPermanent: s.players.user.battlefield[0] });
    expect(fired).toHaveLength(1);
    s = flushTriggers({ ...s, pendingTriggers: fired });
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect([permanentPower(s, "u1"), permanentToughness(s, "u1")]).toEqual([4, 2]); // +2/+0 on itself
  });
});

describe("coverage — the 'it'-templated self-pump classifies native-trigger", () => {
  it("a bare attack self-pump and a self keyword-grant are native-trigger", () => {
    expect(classifyCard(creature("Brazen Wolves", 2, 2, "Whenever Brazen Wolves attacks, it gets +2/+0 until end of turn."))).toBe("native-trigger");
    expect(classifyCard(creature("Charging Paladin", 2, 2, "Whenever Charging Paladin attacks, it gets +0/+3 until end of turn."))).toBe("native-trigger");
    expect(classifyCard(creature("Momentum Rumbler", 4, 2, "Whenever Momentum Rumbler attacks, it gains double strike until end of turn."))).toBe("native-trigger");
  });

  it("CREED: an unmodeled keyword grant ('it gains indestructible') stays NON-native (parser re-gate)", () => {
    // Weathered Sentinels — the normalization runs, but the parser still rejects an unmodeled keyword
    // set, so the card stays LOW → Arbiter (a SAFE false-negative, never a fabricated grant).
    expect(clauseHigh(clauseOf(creature("Weathered Sentinels", 3, 3, "Whenever Weathered Sentinels attacks, it gets +3/+3 and gains indestructible until end of turn.")))).toBe(false);
    expect(classifyCard(creature("Weathered Sentinels", 3, 3, "Whenever Weathered Sentinels attacks, it gets +3/+3 and gains indestructible until end of turn."))).not.toBe("native-trigger");
  });

  it("TRIG-PRONOUN-IT: the non-self 'a creature you control attacks, it …' card IS now native-trigger", () => {
    // "it" = the triggering creature → target:"thatCreature" (ctx.triggeringPermanentId). Fervent Charge shape.
    expect(classifyCard(creature("Fervent Charge", 4, 4, "Whenever a creature you control attacks, it gets +2/+2 until end of turn."))).toBe("native-trigger");
    expect(classifyCard(creature("Anthem", 4, 4, "Whenever a creature you control attacks, it gains lifelink until end of turn."))).toBe("native-trigger");
  });
});
