/**
 * conditionNegationAndConjunction.test.js — NEGATED and CONJOINED filters in the condition grammar (4 cards).
 * Fathom Fleet Captain · Iron Man, Modern Marvel · Reclusive Wight · Wildwood Tracker.
 *
 * ⭐ THE SAME AXIS ONE MORE TIME, and worth naming because it is now a pattern rather than an incident. The
 * shared TARGET grammar (`parseCreatureTargetRestrictions`) has carried `typeNeg`, `colorNeg` and a negated
 * `subtype` for a while. This CONDITION grammar had none of them — so the identical printed filter was
 * readable when a spell TARGETED with it and unreadable when a trigger ASKED about it. Two grammars, one
 * vocabulary, drifted apart.
 *
 * ⛔⭐ NEGATION FAILS THE OPPOSITE WAY FROM EVERYTHING ELSE HERE, which is why it gets its own allowlist.
 * On the POSITIVE side an unrecognised word becomes a type-line scan that matches nothing — the filter reads
 * "no permanent qualifies", a safe false negative. On the NEGATED side an unrecognised word excludes nothing —
 * the filter silently widens to EVERYTHING. Same typo, opposite blast radius. Hence NEGATABLE_TYPE_WORDS.
 *
 * ⭐ AND "nonblue" INCLUDES COLOURLESS (CR 105.2): a colourless permanent is not blue, so it satisfies the
 * negation. Reading `colorNeg` as "is some other colour" would wrongly exclude every artifact.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function world(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user,
    battlefield: cards.map((card, i) => createPermanent({ id: `p${i}`, card: { id: `c${i}`, ...card }, controller: "user" })) } } };
}
const ev = (cards, cond) => evaluateInterveningIf(world(cards), cond, "user", {});

const HUMAN = { name: "Soldier", type: "Creature — Human Soldier", power: 1, toughness: 1 };
const ELF = { name: "Elf", type: "Creature — Elf Druid", power: 1, toughness: 1 };
const ART_CREA = { name: "Golem", type: "Artifact Creature — Golem", power: 2, toughness: 2 };
const PLAIN_CREA = { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
const LAND = { name: "Forest", type: "Basic Land — Forest" };
const ARTIFACT = { name: "Rock", type: "Artifact" };

describe("⛔⭐ NEGATION excludes — and the allowlist is what keeps a typo from widening the filter", () => {
  it("a negated SUBTYPE excludes exactly that subtype", () => {
    expect(ev([ELF], "you control a non-human creature")).toBe(true);
    expect(ev([HUMAN], "you control a non-human creature")).toBe(false);
    expect(ev([HUMAN, ELF], "you control a non-human creature")).toBe(true);   // the Elf still qualifies
  });

  it("a negated CARD TYPE excludes exactly that type", () => {
    expect(ev([ARTIFACT], "you control a nonland permanent")).toBe(true);
    expect(ev([LAND], "you control a nonland permanent")).toBe(false);
    expect(ev([PLAIN_CREA], "you control a nonartifact creature")).toBe(true);
    expect(ev([ART_CREA], "you control a nonartifact creature")).toBe(false);
  });

  it("⭐ 'nonblue' INCLUDES colourless (CR 105.2) — it means NOT blue, not 'some other colour'", () => {
    expect(ev([{ ...PLAIN_CREA, colors: [] }], "you control a nonblue creature")).toBe(true);
    expect(ev([{ ...PLAIN_CREA, colors: ["G"] }], "you control a nonblue creature")).toBe(true);
    expect(ev([{ ...PLAIN_CREA, colors: ["U"] }], "you control a nonblue creature")).toBe(false);
  });

  it("⛔ AN UNRECOGNISED NEGATED WORD IS REFUSED — this is the dangerous direction", () => {
    // On the positive side an unknown word matches nothing (a safe false negative). On the negated side it
    // would exclude nothing and quietly widen the filter to every permanent. Same typo, opposite blast radius.
    expect(interveningIfParseable("you control a nonsense creature")).toBe(false);
    expect(interveningIfParseable("you control a nonhistoric permanent")).toBe(false);
  });

  it("⛔ a DOUBLE negation is refused rather than folded", () => {
    expect(interveningIfParseable("you control a nonland nonartifact permanent")).toBe(false);
  });
});

describe("⛔⭐ TYPE CONJUNCTION needs BOTH words, not either", () => {
  it("'artifact creature' matches only a permanent carrying both types", () => {
    expect(ev([ART_CREA], "you control an artifact creature")).toBe(true);
    // ⭐ THE discriminating pair. Under a union either of these would satisfy it.
    expect(ev([PLAIN_CREA], "you control an artifact creature")).toBe(false);
    expect(ev([ARTIFACT], "you control an artifact creature")).toBe(false);
  });

  it("⛔ the ' or ' UNION arm is unchanged — it still means either", () => {
    expect(ev([ARTIFACT], "you control an artifact or enchantment")).toBe(true);
    expect(ev([{ name: "Glow", type: "Enchantment" }], "you control an artifact or enchantment")).toBe(true);
    expect(ev([PLAIN_CREA], "you control an artifact or enchantment")).toBe(false);
  });

  it("⛔ a repeated word is not a conjunction", () => {
    expect(interveningIfParseable("you control a creature creature")).toBe(false);
  });
});

describe("⛔ the incumbents are unchanged", () => {
  it("bare, subtype, snow and colour filters all still behave", () => {
    expect(ev([PLAIN_CREA], "you control a creature")).toBe(true);
    expect(ev([ELF], "you control an elf")).toBe(true);
    expect(ev([PLAIN_CREA], "you control an elf")).toBe(false);
    expect(ev([{ name: "SF", type: "Snow Land — Forest" }], "you control a snow land")).toBe(true);
    expect(ev([LAND], "you control a snow land")).toBe(false);
  });
});

describe("⭐ carriers classify native", () => {
  // ⚠️ Oracle text copied from the bundle, never written from memory — the rule this run has already been
  // burned by once.
  for (const card of [
    { name: "Wildwood Tracker", type: "Creature — Elf Warrior", mana: "{G}", power: 1, toughness: 1,
      oracle: "Whenever this creature attacks or blocks, if you control another non-Human creature, this creature gets +1/+1 until end of turn." },
  ]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
