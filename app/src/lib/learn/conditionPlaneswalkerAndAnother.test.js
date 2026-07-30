/**
 * conditionPlaneswalkerAndAnother.test.js — planeswalker SUBTYPE filters + the general "another <filter>".
 * 11 cards: Adherent of Hope · Ajani's Comrade · Companion of the Trials · Desiccated Naga ·
 * Historian of Zhalfir · Jace's Triumph · Karplusan Hound · Nessian Hornbeetle · Sacred White Deer ·
 * Turret Ogre · Vraska's Conquistador.
 *
 * ⭐ 1 · "you control a Teferi planeswalker" (CR 205.3j) is a CONJUNCTION, structurally identical to the snow
 * filter: the type line must carry BOTH the name and "Planeswalker", so `allWords` is set and the quantifier
 * is `.every()`. A union would make "a Teferi planeswalker" true for ANY planeswalker — the Superfriends
 * payoffs would fire off the wrong walker.
 *
 * ⭐ THE NAME LIST WAS DERIVED FROM THE BUNDLE BY SCRIPT, NOT WRITTEN FROM MEMORY. Card characteristics never
 * come from recall in this codebase, and an invented name would be a filter that matches nothing and reads
 * FALSE forever while the shape gate says "readable". Because the filter is a conjunction with "Planeswalker",
 * an entry that is merely unusual can only fail to match — never create a false one.
 *
 * ⛔ 2 · "you control another <filter>" widens the FILTER only. The REFERENT rule is untouched:
 * activationCondition.test.js pins that an activated ability may not answer "another" — "a trigger can supply
 * the triggering permanent; an activated ability cannot. If this ever returns true, the activation probe is
 * claiming a context it does not have." A source-relative reading is arguable, but that is a JUDGEMENT pin
 * about referent semantics rather than a capability marker, and a vocabulary slice is not the place to
 * overturn it. Absent triggering referent → null → Arbiter, exactly as before.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, interveningIfParseable, activationConditionParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function world(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user,
    battlefield: cards.map((card, i) => createPermanent({ id: `p${i}`, card: { id: `c${i}`, ...card }, controller: "user" })) } } };
}
const ev = (cards, cond, ctx = {}) => evaluateInterveningIf(world(cards), cond, "user", ctx);

const TEFERI = { name: "Teferi, Hero of Dominaria", type: "Legendary Planeswalker — Teferi" };
const AJANI = { name: "Ajani Goldmane", type: "Legendary Planeswalker — Ajani" };
const BEAR = { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };

describe("⛔⭐ planeswalker SUBTYPE is a conjunction, not a union", () => {
  it("the named walker satisfies it; a DIFFERENT walker does not", () => {
    expect(ev([TEFERI], "you control a teferi planeswalker")).toBe(true);
    // ⭐ THE discriminating case. Under `.some()` any planeswalker would satisfy any name.
    expect(ev([AJANI], "you control a teferi planeswalker")).toBe(false);
    expect(ev([BEAR], "you control a teferi planeswalker")).toBe(false);
  });

  it("a creature that merely shares the WORD is not a planeswalker", () => {
    // The conjunction's other half: "Ajani, Caller of the Pride" as a legendary CREATURE would carry the word
    // but not the type. Both halves must hold.
    expect(ev([{ name: "Ajani's Pridemate", type: "Creature — Cat Soldier", power: 2, toughness: 2 }], "you control an ajani planeswalker")).toBe(false);
  });

  it("⛔ a name outside the bundle-derived list is REFUSED, not scanned for", () => {
    expect(activationConditionParseable("you control a gandalf planeswalker")).toBe(false);
    expect(interveningIfParseable("you control a frodo planeswalker")).toBe(false);
  });

  it("⛔ the bare 'a planeswalker' form is unchanged", () => {
    expect(ev([TEFERI], "you control a planeswalker")).toBe(true);
    expect(ev([BEAR], "you control a planeswalker")).toBe(false);
  });
});

describe("⭐ 'another <filter>' takes the whole widened vocabulary", () => {
  it("excludes the triggering permanent and applies the filter", () => {
    const w = world([{ ...BEAR, colors: [] }, { ...BEAR, colors: ["G"] }]);
    const trig = w.players.user.battlefield[0].id;
    // The colourless one IS the triggering permanent, so it is excluded; the green one fails the filter.
    expect(evaluateInterveningIf(w, "you control another colorless creature", "user", { triggeringPermanentId: trig })).toBe(false);
    const w2 = world([{ ...BEAR, colors: ["G"] }, { ...BEAR, colors: [] }]);
    expect(evaluateInterveningIf(w2, "you control another colorless creature", "user", { triggeringPermanentId: w2.players.user.battlefield[0].id })).toBe(true);
  });

  it("⛔ THE REFERENT RULE IS UNCHANGED — the activation lane still cannot answer 'another'", () => {
    expect(activationConditionParseable("you control another colorless creature")).toBe(false);
    expect(activationConditionParseable("you control another elf")).toBe(false);   // the incumbent, untouched
    expect(interveningIfParseable("you control another colorless creature")).toBe(true);
  });

  it("⛔ an unreadable filter after 'another' still parks", () => {
    expect(interveningIfParseable("you control another creature with art by the artist of your choice")).toBe(false);
  });
});

describe("⭐ carriers classify native", () => {
  // ⚠️ ORACLE TEXT COPIED FROM THE BUNDLE, NOT WRITTEN FROM MEMORY. The first draft of this block
  // paraphrased both cards from recall — wrong types, wrong P/T, and wrong abilities — and Vraska's
  // Conquistador failed even though the corpus flip-diff had just shown it flipping. The rule exists precisely
  // because a plausible-looking paraphrase tests nothing about the real card.
  for (const card of [
    { name: "Ajani's Comrade", type: "Creature — Elf Soldier", mana: "{1}{G}", power: 2, toughness: 2,
      oracle: "Trample\nAt the beginning of combat on your turn, if you control an Ajani planeswalker, put a +1/+1 counter on this creature." },
    { name: "Vraska's Conquistador", type: "Creature — Vampire Soldier", mana: "{1}{B}", power: 2, toughness: 1,
      oracle: "Whenever this creature attacks or blocks, if you control a Vraska planeswalker, target opponent loses 2 life and you gain 2 life." },
  ]) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
