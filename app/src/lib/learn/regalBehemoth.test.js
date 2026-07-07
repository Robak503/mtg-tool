/**
 * regalBehemoth.test.js — the monarch-gated / any-color tap-mana augment (Regal Behemoth) + the
 * augment-body composition classifier.
 *
 * "Whenever you tap a land for mana while you're the monarch, add an additional one mana of any color."
 * Reuses the shipped GLOBAL-TAP-AUGMENT infra (Groundchuck / Leyline of Abundance):
 *   - the parser accepts the optional " while you're the monarch" condition and "one mana of any color"
 *     (all five colors, amount 1 — the same shape the mana model already produces for a printed any-color);
 *   - globalTapManaAugment gates a condition:"monarch" augment on state.monarchId === playerId (no phantom
 *     mana off the crown), reading the live crown the become-monarch event keeps current;
 *   - the coverage tier COMPOSES the augment with a native-trigger remainder (Regal Behemoth = Trample +
 *     "When ~ enters, you become the monarch"), flipping the whole card native-mixed. The compose also
 *     picks up cards whose remainder became native since (Badgermole Cub's earthbend ETB, Leyline of
 *     Abundance's activated pump) — all genuinely modeled.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseGlobalTapManaAugment } from "./staticAbilityParser.js";
import { globalTapManaAugment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RB_ORACLE = "Trample\nWhen this creature enters, you become the monarch.\nWhenever you tap a land for mana while you're the monarch, add an additional one mana of any color.";
const RB = { name: "Regal Behemoth", type: "Legendary Creature — Dinosaur", power: 5, toughness: 5, oracle: RB_ORACLE };

describe("REGAL BEHEMOTH — parser + classification", () => {
  it("parses the monarch-gated any-color augment", () => {
    expect(parseGlobalTapManaAugment(RB)).toEqual({ subject: "land", colors: ["W", "U", "B", "R", "G"], amount: 1, condition: "monarch" });
  });
  it("classifies native-mixed (augment + the become-monarch ETB trigger body)", () => {
    expect(classifyCard(RB)).toBe("native-mixed");
  });
  it("the shipped fixed-pip augments still parse unchanged (no condition)", () => {
    expect(parseGlobalTapManaAugment({ name: "Groundchuck", type: "Creature — Beast", oracle: "Trample\nWhenever you tap a creature for mana, add an additional {R}." })).toEqual({ subject: "creature", colors: ["R"], amount: 1 });
  });
  it("CREED: an augment + an UNMODELED remainder trigger stays body-only", () => {
    expect(classifyCard({ name: "Synth", type: "Creature — Beast", oracle: "Whenever you tap a land for mana, add an additional {G}.\nWhen this creature enters, exchange control of two target permanents." })).toBe("body-only");
  });
});

describe("REGAL BEHEMOTH — runtime mana (the monarch gate; no phantom production)", () => {
  function board(monarch) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const behemoth = createPermanent({ id: "rb", card: RB, controller: "user" });
    const forest = createPermanent({ id: "forest", card: { name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    const s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [behemoth, forest] } }, ...(monarch ? { monarchId: "user" } : {}) };
    return { s, forest };
  }

  it("NOT the monarch → the augment adds nothing (zero phantom mana)", () => {
    const { s, forest } = board(false);
    expect(globalTapManaAugment(s, "user", forest)).toEqual([]);
  });
  it("the monarch → +1 mana of any color per land tap", () => {
    const { s, forest } = board(true);
    expect(globalTapManaAugment(s, "user", forest)).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 1 }]);
  });
  it("the monarch tapping a CREATURE (subject = land) → no augment (subject gate holds)", () => {
    const { s } = board(true);
    const elf = createPermanent({ id: "elf", card: { name: "Elf", type: "Creature — Elf", oracle: "{T}: Add {G}." }, controller: "user" });
    expect(globalTapManaAugment(s, "user", elf)).toEqual([]);
  });
  it("an OPPONENT-held crown does not fire MY augment (the gate is per-player)", () => {
    const { s, forest } = board(false);
    const opp = { ...s, monarchId: "ai" };  // ai is the monarch, not user
    expect(globalTapManaAugment(opp, "user", forest)).toEqual([]);
  });
});

describe("REGAL BEHEMOTH — the compose picks up genuinely-native remainders", () => {
  it("Badgermole Cub (augment + earthbend ETB) → native-mixed", () => {
    expect(classifyCard({ name: "Badgermole Cub", type: "Creature — Badger", oracle: "When this creature enters, earthbend 1.\nWhenever you tap a creature for mana, add an additional {G}." })).toBe("native-mixed");
  });
  it("Leyline of Abundance (augment + opening-hand + activated pump) → native-mixed", () => {
    expect(classifyCard({ name: "Leyline of Abundance", type: "Enchantment", oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nWhenever you tap a creature for mana, add an additional {G}.\n{6}{G}{G}: Put a +1/+1 counter on each creature you control." })).toBe("native-mixed");
  });
});
