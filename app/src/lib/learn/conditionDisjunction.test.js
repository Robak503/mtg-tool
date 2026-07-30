/**
 * conditionDisjunction.test.js — top-level OR in the condition grammar, plus the singular graveyard reader.
 * 8 cards: Dawnhand Eulogist · Desert's Hold · Gilded Cerodon · Sand Strangler · Unquenchable Thirst ·
 * Wall of Forgotten Pharaohs · Walltop Sentries · Wretched Camel.
 *
 * ⭐ THE SEQUENCING IS THE STORY. A top-level `or` splitter was the obvious build two slices ago: the single
 * biggest phrase in the three-lane census was the Desert cycle's "you control a Desert OR there is a Desert
 * card in your graveyard" (6 cards), which reads as a plain disjunction. Probing the HALVES first (RULE 1b)
 * showed the graveyard half was ALSO unreadable — so the splitter would have gained exactly ZERO, and it was
 * not written. It is written now because the singular graveyard reader below made that half readable. The
 * probe did not just size the work; it ordered it.
 *
 * ⛔ THE WHOLE CONDITION IS ALWAYS TRIED FIRST, and that ordering is the entire safety argument. Many single
 * conditions legitimately contain " or ": "power 4 or greater", "N or more", "5 or less life", "gained or
 * lost life this turn". Splitting eagerly shatters a READABLE condition into two unreadable halves and
 * regresses every card carrying one. Gating the split behind the whole form's failure makes "no regressions"
 * structural instead of something to re-verify.
 *
 * ⛔ BOTH HALVES MUST BE INDEPENDENTLY READABLE. If either is null the disjunction is null — an unreadable
 * half must never be treated as FALSE, which would answer a definite "no" to a question the engine cannot
 * evaluate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, activationConditionParseable, interveningIfParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function world({ bf = [], gy = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user,
    battlefield: bf.map((card, i) => createPermanent({ id: `p${i}`, card: { id: `c${i}`, ...card }, controller: "user" })),
    graveyard: gy } } };
}
const ev = (w, cond) => evaluateInterveningIf(w, cond, "user", {});

const DESERT_LAND = { name: "Desert of the Fervent", type: "Land — Desert" };
const DESERT_CARD = { name: "Desert of the Mindful", type: "Land — Desert" };
const PLAIN_LAND = { name: "Plains", type: "Basic Land — Plains" };
const DESERT_COND = "you control a desert or there is a desert card in your graveyard";

describe("⭐ the singular graveyard reader — the ≥1 case the counters never exposed", () => {
  it("a typed card in the graveyard satisfies it; an empty graveyard does not", () => {
    expect(ev(world({ gy: [DESERT_CARD] }), "there is a desert card in your graveyard")).toBe(true);
    expect(ev(world({ gy: [] }), "there is a desert card in your graveyard")).toBe(false);
    expect(ev(world({ gy: [{ name: "Bear", type: "Creature — Bear" }] }), "there is a desert card in your graveyard")).toBe(false);
  });
  it("SUBTYPES come free — the scan is word-anchored against the whole type line", () => {
    expect(ev(world({ gy: [{ name: "Introduction to Prophecy", type: "Sorcery — Lesson" }] }), "there's a lesson card in your graveyard")).toBe(true);
    expect(ev(world({ gy: [{ name: "Shock", type: "Instant" }] }), "there's a lesson card in your graveyard")).toBe(false);
  });
  it("⛔ the incumbent COUNT readers are unchanged", () => {
    expect(ev(world({ gy: [DESERT_CARD, DESERT_CARD, DESERT_CARD] }), "there are three or more cards in your graveyard")).toBe(true);
    expect(ev(world({ gy: [DESERT_CARD] }), "there are three or more cards in your graveyard")).toBe(false);
  });
});

describe("⭐ the DISJUNCTION — either half is enough, and both must be readable", () => {
  it("board half true / graveyard half true / neither", () => {
    expect(ev(world({ bf: [DESERT_LAND] }), DESERT_COND)).toBe(true);            // left only
    expect(ev(world({ gy: [DESERT_CARD] }), DESERT_COND)).toBe(true);            // right only
    expect(ev(world({ bf: [DESERT_LAND], gy: [DESERT_CARD] }), DESERT_COND)).toBe(true);
    expect(ev(world({ bf: [PLAIN_LAND], gy: [{ name: "Shock", type: "Instant" }] }), DESERT_COND)).toBe(false);
  });

  it("⛔ an UNREADABLE half makes the whole thing unreadable — never silently false", () => {
    // ⚠️ STAND-IN MIGRATED (2026-07-30): this test used "you descended this turn" as its unreadable half
    // until descend was built (CR 700.11), at which point the test's own premise quietly became false.
    // Replaced with "you created a token this turn" — still unreadable, and it sits on the maintained
    // still-parks list in conditionTurnEventReaders.test.js, so the two files move together.
    // ⭐ A stand-in phrase is a DEPENDENCY on something staying unbuilt. When the stand-in graduates, the
    // test does not fail loudly about the thing it was actually guarding — it fails about the scaffolding.
    expect(activationConditionParseable("you control a desert or you created a token this turn")).toBe(false);
    expect(activationConditionParseable("you created a token this turn or you control a desert")).toBe(false);
  });

  it("⛔ only a TWO-way split is attempted; a three-way chain refuses", () => {
    expect(activationConditionParseable("you control a desert or you control a swamp or you control a plains")).toBe(false);
  });
});

describe("⛔⭐ THE ORDERING GUARD — a condition whose OWN wording contains ' or ' must not be split", () => {
  const INTERNAL_OR = [
    "you control a creature with power 4 or greater",
    "there are three or more cards in your graveyard",
    "you have 5 or less life",
    "you gained or lost life this turn",
    "you have seven or more cards in hand",
  ];
  for (const c of INTERNAL_OR) {
    it(`«${c}» still reads as ONE condition`, () => {
      expect(activationConditionParseable(c), c).toBe(true);
      expect(interveningIfParseable(c), c).toBe(true);
    });
  }
  it("⭐ and they still EVALUATE, not merely parse", () => {
    expect(ev(world({ bf: [{ name: "Big", type: "Creature — Giant", power: 5, toughness: 5 }] }), "you control a creature with power 4 or greater")).toBe(true);
    expect(ev(world({ bf: [{ name: "Small", type: "Creature — Bear", power: 1, toughness: 1 }] }), "you control a creature with power 4 or greater")).toBe(false);
  });
});

describe("⭐ the Desert cycle classifies native", () => {
  for (const card of [
    { name: "Sand Strangler", type: "Creature — Beast", mana: "{3}{R}", power: 3, toughness: 3,
      oracle: "When this creature enters, if you control a Desert or there is a Desert card in your graveyard, it deals 3 damage to target creature." },
    { name: "Wretched Camel", type: "Creature — Zombie Camel", mana: "{1}{B}", power: 2, toughness: 1,
      oracle: "When this creature dies, if you control a Desert or there is a Desert card in your graveyard, target creature gets -1/-1 until end of turn." },
  ]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
