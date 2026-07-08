/**
 * selfBounceOwn.test.js — SELF-BOUNCE (forced own-choice) (overnight grind, systems lever).
 *
 * "return a[nother] permanent|creature you control to its owner's hand" (Kor Skyfisher / Emancipation Angel /
 * Cache Raiders ETB · Roaring Primadox / Shrieking Drake upkeep/ETB · Invasive Species / Yarok's Wavecrasher
 * "another" · Time Wipe "return a creature you control, then destroy all creatures" · the "you may" optionals
 * Ambrosia Whiteheart / Aviary Mechanic / Loyal Gryff). NON-targeted: the controller MUST return one of their
 * OWN permanents, so it's modeled scope-side (scope:"oneYouControlWorst" → worstOwnBounceTarget picks the
 * LEAST-BAD at resolution: a land you replay, then a tapped permanent, then battlefield order) rather than as a
 * chosen target — programNeedsChosenTarget is false, so the ETB/upkeep TRIGGER routes natively. The parser's
 * "you may" wrapper stamps optional:true (runProgram.js suspends for a real yes/no), so the optionals keep their
 * decline. ENGINE-CORRECT: it always returns a VALID OWN permanent (never an opponent's, never a no-op when a
 * legal permanent exists), exactly as the card reads; the choice is a deterministic sensible default.
 *
 * Flip-diff GAINED = 19 (the family), LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyZoneMove } from "./effects/atoms/zones.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const C = (name, oracle, type = "Creature — Bird", mana = "{1}{W}") => ({ name, oracle, type, keywords: [], mana });

describe("self-bounce — parser (scope-side, non-targeted; optionality preserved)", () => {
  it("'return a permanent you control' → bounce {scope:oneYouControlWorst}, no targetType, mandatory", () => {
    expect(parseEffectClause("return a permanent you control to its owner's hand")).toMatchObject({
      confidence: "high", atoms: [{ op: "bounce", scope: "oneYouControlWorst" }],
    });
    expect(parseEffectClause("return a permanent you control to its owner's hand").atoms[0].targetType).toBeUndefined();
  });
  it("'a creature' adds creatureOnly; 'another' adds excludeSource; 'you may' adds optional", () => {
    expect(parseEffectClause("return a creature you control to its owner's hand").atoms[0]).toMatchObject({ op: "bounce", scope: "oneYouControlWorst", creatureOnly: true });
    expect(parseEffectClause("return another creature you control to its owner's hand").atoms[0]).toMatchObject({ scope: "oneYouControlWorst", creatureOnly: true, excludeSource: true });
    expect(parseEffectClause("you may return another permanent you control to its owner's hand").atoms[0]).toMatchObject({ scope: "oneYouControlWorst", excludeSource: true, optional: true });
  });
});

describe("self-bounce — classify (ETB / upkeep / compound / optional all native)", () => {
  it("Kor Skyfisher / Roaring Primadox / Invasive Species / Time Wipe / Ambrosia flip native", () => {
    expect(classifyCard(C("Kor Skyfisher", "Flying\nWhen this creature enters, return a permanent you control to its owner's hand."))).toBe("native-trigger");
    expect(classifyCard(C("Roaring Primadox", "At the beginning of your upkeep, return a creature you control to its owner's hand.", "Creature — Beast", "{4}{G}"))).toBe("native-trigger");
    expect(classifyCard(C("Invasive Species", "When this creature enters, return another permanent you control to its owner's hand.", "Creature — Insect", "{4}{G}"))).toBe("native-trigger");
    expect(classifyCard(C("Time Wipe", "Return a creature you control to its owner's hand, then destroy all creatures.", "Sorcery", "{2}{W}{W}{U}"))).toBe("native-spell");
    expect(classifyCard(C("Aviary Mechanic", "When this creature enters, you may return another permanent you control to its owner's hand.", "Creature — Human Artificer", "{1}{U}"))).toBe("native-trigger");
  });
});

describe("self-bounce — runtime heuristic (least-bad, own-only, excludeSource)", () => {
  const mk = (id, type, tapped = false, ctl = "user") => createPermanent({ id, card: { id: `c-${id}`, name: id, type }, controller: ctl, summoningSick: false, tapped });
  function board() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s0, players: { ...s0.players,
        user: { ...s0.players.user, hand: [], battlefield: [mk("tland", "Basic Land — Forest", true), mk("uland", "Basic Land — Island", false), mk("src", "Creature — Bird", false)] },
        ai: { ...s0.players.ai, battlefield: [mk("foe", "Basic Land — Swamp", true, "ai")] } },
    };
  }
  it("permanent bounce returns the TAPPED LAND (least-bad); the opponent's permanent is never touched", () => {
    const n = applyZoneMove(board(), { op: "bounce", scope: "oneYouControlWorst" }, { controller: "user", sourceId: "src" }, "hand");
    expect(n.players.user.hand.map((c) => c.name)).toEqual(["tland"]);      // the tapped land, not a creature or the untapped land
    expect(n.players.ai.battlefield).toHaveLength(1);                        // opponent untouched
  });
  it("creature bounce returns a CREATURE (the source), never a land", () => {
    const n = applyZoneMove(board(), { op: "bounce", scope: "oneYouControlWorst", creatureOnly: true }, { controller: "user", sourceId: "src" }, "hand");
    expect(n.players.user.hand.map((c) => c.name)).toEqual(["src"]);
    expect(n.players.user.battlefield.filter((p) => /Land/.test(p.card.type))).toHaveLength(2); // both lands kept
  });
  it("'another creature' with the source as the ONLY creature is a clean no-op (excludeSource)", () => {
    const n = applyZoneMove(board(), { op: "bounce", scope: "oneYouControlWorst", creatureOnly: true, excludeSource: true }, { controller: "user", sourceId: "src" }, "hand");
    expect(n.players.user.hand).toHaveLength(0);                             // nothing returned
    expect(n.players.user.battlefield.some((p) => p.id === "src")).toBe(true); // source kept
  });
  it("an empty board is a clean no-op (never a fabricated bounce, never a throw)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [], hand: [] } } };
    let n;
    expect(() => { n = applyZoneMove(s, { op: "bounce", scope: "oneYouControlWorst" }, { controller: "user", sourceId: "src" }, "hand"); }).not.toThrow();
    expect(n.players.user.hand).toHaveLength(0);
  });
});
