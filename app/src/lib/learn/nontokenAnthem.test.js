/**
 * nontokenAnthem.test.js — "Nontoken creatures you control get +1/+1 and have vigilance" (CR 111.1).
 * Always Watching + Thraben Watcher ("OTHER nontoken …").
 *
 * ⭐ THE MISSING HALF OF A PAIR. The TOKEN direction shipped with Teysa Karlov ("Creature tokens you control
 * have vigilance and lifelink" → a `token: true` selector honoured by layers.matchesSelector). `nontoken`
 * existed only as an EXCLUSION in NON_SUBTYPE_ANTHEM_WORDS — rightly barred from the tribal-lord path (a
 * "Nontoken"-SUBTYPE grant selects zero creatures, a CREED FP) but never given a path of its own.
 *
 * ⛔ THE POINT OF THIS FILE IS THE RUNTIME GATE, NOT THE PARSE. Crediting the card without excluding tokens
 * would pump creatures the card explicitly excludes — doing something the rules forbid, the one direction
 * THE CREED rules out. So the load-bearing test asserts a TOKEN does NOT get the buff while a nontoken
 * creature does, through the real layer pipeline.
 *
 * ⚠️ ORDERING WAS LOAD-BEARING AND COST A PROBE TO FIND. Placed beside its token twin, only the bare
 * spelling worked: the determiner arm ("(all|other|each) <word> [creatures] you control …") matches
 * "OTHER nontoken creatures …" with word="nontoken", hits the exclusion set, and returns null — pre-empting
 * everything later. Both spellings are asserted as a PAIR so a future re-order can't silently re-break one.
 */
import { describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { deriveCharacteristics } from "./layers.js";

const ENCH = { name: "Watcher", type: "Enchantment", mana: "{2}{W}" };
const ALWAYS = "Nontoken creatures you control get +1/+1 and have vigilance.";
const OTHER = "Other nontoken creatures you control get +1/+1 and have vigilance.";

const kwOf = (d) => {
  const k = d.keywords;
  if (!k) return [];
  if (Array.isArray(k)) return k.map((x) => String(x).toLowerCase());
  if (k instanceof Set) return [...k].map((x) => String(x).toLowerCase());
  return Object.keys(k).filter((x) => k[x]).map((x) => x.toLowerCase());
};

describe("⭐ both printed spellings classify native", () => {
  it("⭐ the bare form AND the 'other' form — asserted as a pair (the ordering guard)", () => {
    // Either alone would pass on a build that got the other wrong; only the pair catches a re-order.
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: ALWAYS }))).toBe(true);
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: OTHER }))).toBe(true);
  });

  it("a keyword-only grant works too", () => {
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: "Nontoken creatures you control have flying." }))).toBe(true);
  });

  it("⛔ the TOKEN twin and the bare anthem are untouched (regression pins)", () => {
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: "Creature tokens you control have vigilance and lifelink." }))).toBe(true);
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: "Creatures you control get +1/+1." }))).toBe(true);
  });

  it("⛔ CREED — the adjective order stays refused (no corpus card prints it)", () => {
    // "Token creatures you control …" is deliberately NOT modeled: nothing in the corpus prints it, so
    // admitting it would be a shape invented rather than observed.
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: "Token creatures you control have flying." }))).toBe(false);
  });
});

describe("⛔⭐ RUNTIME — the gate must EXCLUDE tokens, or the credit is a false positive", () => {
  const anthem = { id: "src", controller: "me", card: { name: "Always Watching", type: "Enchantment", oracle: ALWAYS } };
  const bear = { id: "bear", controller: "me", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 } };
  const token = { id: "tok", controller: "me", card: { name: "Soldier", type: "Creature — Soldier", power: 1, toughness: 1, token: true } };
  const state = { players: { me: { battlefield: [anthem, bear, token], life: 40, hand: [], graveyard: [] } } };

  it("a NONTOKEN creature gets the P/T and the keyword", () => {
    const d = deriveCharacteristics(state, "bear");
    expect(d.power).toBe(3);
    expect(d.toughness).toBe(3);
    expect(kwOf(d)).toContain("vigilance");
  });

  it("⛔⭐ a TOKEN gets NEITHER — the whole reason the card says 'nontoken'", () => {
    // THE test. Remove the layers.js `nontoken` gate and this is what fails: the token would be pumped to
    // 2/2 with vigilance, which the printed card forbids.
    const d = deriveCharacteristics(state, "tok");
    expect(d.power).toBe(1);
    expect(d.toughness).toBe(1);
    expect(kwOf(d)).not.toContain("vigilance");
  });

  it("an opponent's nontoken creature is NOT buffed (controllerScope holds)", () => {
    const theirs = { id: "opp1", controller: "opp", card: { name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3 } };
    const two = { players: {
      me: { battlefield: [anthem, bear], life: 40, hand: [], graveyard: [] },
      opp: { battlefield: [theirs], life: 40, hand: [], graveyard: [] },
    } };
    const d = deriveCharacteristics(two, "opp1");
    expect(d.power).toBe(3);
    expect(kwOf(d)).not.toContain("vigilance");
  });
});

describe("⛔ the 'other' spelling excludes the source (CR 113.7)", () => {
  it("a creature source with the OTHER wording does not buff itself, but does buff its neighbour", () => {
    const src = { id: "src", controller: "me", card: { name: "Thraben Watcher", type: "Creature — Human Soldier", power: 2, toughness: 3, oracle: OTHER } };
    const mate = { id: "mate", controller: "me", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 } };
    const st = { players: { me: { battlefield: [src, mate], life: 40, hand: [], graveyard: [] } } };
    const self = deriveCharacteristics(st, "src");
    expect(self.power).toBe(2);
    expect(kwOf(self)).not.toContain("vigilance");
    const other = deriveCharacteristics(st, "mate");
    expect(other.power).toBe(3);
    expect(kwOf(other)).toContain("vigilance");
  });
});
