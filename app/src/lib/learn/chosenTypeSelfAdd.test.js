/**
 * chosenTypeSelfAdd.test.js — "This creature is the chosen type in addition to its other types" (CR 205.1b),
 * the LAYER-AWARE chosen-type selector it required, and the residue bug that surfaced behind both.
 *
 * ⭐ THE ORDER OF WORK WAS THE WHOLE PROBLEM. The parser arm looks like the obvious first step, and it is the
 * WRONG first step: `permHasChosenTypeLayer` read the PRINTED type line, so a Metallic Mimic that had chosen
 * Elf still satisfied no chosen-type selector. Shipping the parser arm alone would have credited these cards
 * native while their own printed self-type-add did nothing for anything — the vacuous-filter class again.
 * The selector had to become layer-aware FIRST; the parser arm is only correct on top of it.
 *
 * The three pieces, each pinned below on a BOARD rather than through the tier:
 *   1. the marker → a real layer-4 subtype add, resolved against the permanent's stored chosenType;
 *   2. the selector reading layer-4 derived subtypes (with a re-entry guard, per _ptPredicateInProgress);
 *   3. "OTHER creatures … of the chosen type" — a MISSING CELL, not a missing mechanic: `excludeSelf` and
 *      `chosenTypeOfSource` were each already modeled and only their composition had no parse.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { permanentTypes, permanentPower } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MIMIC_CARD = {
  id: "mm", name: "Metallic Mimic", type: "Artifact Creature — Shapeshifter", power: 2, toughness: 1,
  oracle: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.",
};
const AUTOMATON = {
  id: "aa", name: "Adaptive Automaton", type: "Artifact Creature — Shapeshifter", mana: "{3}", power: 2, toughness: 2,
  oracle: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nOther creatures you control of the chosen type get +1/+1.",
};
const BANNER = {
  id: "vb", name: "Vanquisher's Banner", type: "Artifact",
  oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.",
};
const elfCard = { id: "el", name: "Elf Scout", type: "Creature — Elf Scout", power: 1, toughness: 1, oracle: "" };
const bearCard = { id: "br", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function board(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const withType = (id, card, chosenType) => ({ ...createPermanent({ id, card, controller: "user" }), ...(chosenType ? { chosenType } : {}) });

describe("1. the marker becomes a REAL layer-4 subtype add", () => {
  it("the parser emits a marker, not a finished effect (the subtype is per-PERMANENT state)", () => {
    expect(parseStaticAbilities(MIMIC_CARD).some((d) => d?.selfChosenTypeAdd)).toBe(true);
  });

  it("⭐ RUNTIME — a Mimic that chose Elf derives Elf among its subtypes", () => {
    const st = board([withType("mm", MIMIC_CARD, "Elf")]);
    expect(permanentTypes(st, "mm").subtypes).toContain("Elf");
  });

  it("⭐ CREED — with NO type chosen it adds nothing (never a guessed subtype)", () => {
    const st = board([withType("mm", MIMIC_CARD, null)]);
    expect(permanentTypes(st, "mm").subtypes).toEqual(["Shapeshifter"]);
  });
});

describe("2. the selector is LAYER-AWARE — the printed type line is not the whole answer", () => {
  it("⭐ a Banner naming Elf buffs a Mimic that CHOSE Elf, though its printed line says only Shapeshifter", () => {
    const st = board([withType("vb", BANNER, "Elf"), withType("mm", MIMIC_CARD, "Elf")]);
    expect(permanentPower(st, "mm")).toBe(3); // 2 + 1
  });

  it("⭐ CREED — a Mimic that chose GOBLIN is not buffed by an Elf Banner", () => {
    const st = board([withType("vb", BANNER, "Elf"), withType("mm", MIMIC_CARD, "Goblin")]);
    expect(permanentPower(st, "mm")).toBe(2);
  });

  it("⭐ CREED — a Mimic with NO chosen type is not buffed", () => {
    const st = board([withType("vb", BANNER, "Elf"), withType("mm", MIMIC_CARD, null)]);
    expect(permanentPower(st, "mm")).toBe(2);
  });

  it("printed members of the tribe are unaffected by the change (Elf Scout still buffed, Bear never)", () => {
    const st = board([withType("vb", BANNER, "Elf"), createPermanent({ id: "el", card: elfCard, controller: "user" }), createPermanent({ id: "br", card: bearCard, controller: "user" })]);
    expect(permanentPower(st, "el")).toBe(2);
    expect(permanentPower(st, "br")).toBe(2);
  });
});

describe("3. \"OTHER creatures of the chosen type\" — the missing CELL", () => {
  it("both selector predicates compose (they were each already modeled alone)", () => {
    const d = parseStaticAbilities(AUTOMATON).find((x) => x?.affects?.selector?.chosenTypeOfSource);
    expect(d.affects.selector).toMatchObject({ controllerScope: "you", chosenTypeOfSource: true, excludeSelf: true });
  });

  it("Adaptive Automaton #1755 classifies native", () => {
    expect(classifyCard(AUTOMATON)).toBe("native-static");
  });

  it("⭐ RUNTIME — it buffs the tribe but NOT itself", () => {
    const st = board([withType("aa", AUTOMATON, "Elf"), createPermanent({ id: "el", card: elfCard, controller: "user" })]);
    expect(permanentPower(st, "el")).toBe(2);  // 1 + 1
    expect(permanentPower(st, "aa")).toBe(2);  // excludeSelf — unchanged
  });
});

describe("⛔ THE RESIDUE BUG THIS SURFACED — a keyword line could swallow unmodeled text", () => {
  const MOROPHON = {
    id: "mo", name: "Morophon, the Boundless", type: "Legendary Creature — Shapeshifter", mana: "{7}", power: 6, toughness: 6,
    oracle: "Changeling\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1.",
  };

  // ⭐ RE-POINTED, NOT FLIPPED. This assertion guards the RESIDUE-SWALLOW bug (a leading keyword line
  // absorbing an unmodeled rider), and it used Morophon's colored cost reduction purely as the canary.
  // That reduction is modeled now (coloredPipCostReduction.test.js), so Morophon can no longer prove
  // anything here — but the guard still needs an end-to-end assertion, so it moves to a card whose rider
  // is genuinely still unmodeled. Vorthos, Steward of Myth's "with the chosen character in its name,
  // flavor text, or art" filter is not modellable and is not going to become so.
  const KEYWORD_PLUS_UNMODELED_RIDER = {
    id: "vo", name: "Vorthos, Steward of Myth", type: "Legendary Creature — Human Advisor", mana: "{4}{W}{U}", power: 3, toughness: 5,
    oracle: "Vigilance\nEach spell you cast with the chosen character in its name, flavor text, or art costs {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.",
  };

  it("⭐ THE LOAD-BEARING ONE — a keyword lead does NOT swallow an unmodeled rider", () => {
    expect(classifyCard(KEYWORD_PLUS_UNMODELED_RIDER)).toBe("body-only");
  });

  it("Morophon itself now flips (its colored reduction is modeled) — the graduation, recorded", () => {
    // Kept so the change of state is explicit rather than silently absent from this file.
    expect(classifyCard(MOROPHON)).toBe("native-static");
  });

  it("the mechanism: stripping periods makes isKeywordOnly swallow the whole rider", () => {
    // The residue builders used `.replace(/[\s.]+/g, " ")`, deleting the SENTENCE boundaries isKeywordOnly
    // splits on. With them gone a leading "Changeling" absorbed everything after it.
    const text = "Changeling Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.";
    expect(isKeywordOnly(text, "Morophon, the Boundless")).toBe(false);              // periods intact — correct
    expect(isKeywordOnly(text.replace(/[\s.]+/g, " "), "Morophon, the Boundless")).toBe(true); // stripped — the bug
  });

  it("⛔ the reduction line WITHOUT the chooser still parks — and this pin is why", () => {
    // This assertion outlived its original reason and then earned a new one. It was written to prove the
    // colored reduction wasn't quietly credited; when that reduction was modeled, this failed — and the
    // failure was correct. A card carrying the reducer but NO "choose a creature type" line has no stored
    // chosenType to resolve against, so the reduction can never fire: crediting it would be a
    // runtime-vacuous native. parseStaticAbilities now drops the chooser-less descriptor.
    expect(classifyCard({ ...MOROPHON, oracle: "Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay." })).toBe("body-only");
  });
});
