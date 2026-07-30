/**
 * castColorFilter.test.js — COLOUR and COLORLESS as cast-trigger spell filters (CR 105.2). 52 cards.
 *
 * The Talisman / Horn / Tooth / Sphere / Rod / Cup artifact cycles · Aragorn, the Uniter · Warmth ·
 * Kor Firewalker · Sol'kanar the Swamp King · Nettle Sentinel · Kozilek's Sentinel · Molten Nursery ·
 * Cinder Pyromancer · Iron Man, Tony Stark · Zuko, Avatar Hunter · Drowned Secrets · and the Duo cycle.
 *
 * ⭐ THE MISSING SIBLING OF A FILTER THAT WAS ALREADY THERE. `castSpellFilter` already carved out `historic`
 * and `multicolored` as whole-object QUALITIES — because a quality is not a type-line token, so the subtype
 * denylist rejects it and it must be handled explicitly. Single colours are the same shape, and the
 * multicolored comment had already written the CR justification: "the color of a spell is fixed by its mana
 * cost / color indicator at cast, so the printed colorsOf reading is CR-faithful for the cast event." Nothing
 * about a single colour differs.
 *
 * ⛔ COLORLESS IS THE ABSENCE OF COLOUR, NOT A SIXTH COLOUR (CR 105.2c) — its own filter with an empty-set
 * test. Folding it into the colour list would make every colourless spell match every colour filter. This is
 * the third place in the engine that distinction has had to be made explicitly (the condition grammar and the
 * mass-damage grammar are the others).
 *
 * ⭐ PREDICTED 13, MEASURED 52 — and the surplus was real, not a bug. The sizing probe only scanned the
 * "whenever YOU cast" wording, while `castSpellFilter` serves ALL FOUR cast subjects (you / an opponent /
 * a player / each player). The artifact cycles all read "whenever a PLAYER casts a <colour> spell", so they
 * were invisible to the probe and fixed by the same line. Audited by hand against bundled oracle text before
 * being believed.
 */
import { describe, it, expect } from "vitest";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

const card = (oracle, extra = {}) => ({ name: "X", type: "Creature — Test", mana: "{1}{R}", power: 1, toughness: 1, oracle, ...extra });
const castTriggers = (oracle) => detectTriggers(card(oracle)).filter((t) => t.event === "cast");

describe("⭐ each colour, and each cast SUBJECT, parses to a colour filter", () => {
  const COLORS = [["white", "W"], ["blue", "U"], ["black", "B"], ["red", "R"], ["green", "G"]];
  for (const [word, letter] of COLORS) {
    it(`«whenever you cast a ${word} spell» → color:${letter}`, () => {
      expect(castTriggers(`Whenever you cast a ${word} spell, draw a card.`)[0])
        .toMatchObject({ whose: "you", spellFilter: `color:${letter}` });
    });
  }

  it("⭐ ALL FOUR subjects carry it — this is why the fix reached 52 rather than 13", () => {
    expect(castTriggers("Whenever a player casts a green spell, you may gain 1 life.")[0])
      .toMatchObject({ whose: "any", spellFilter: "color:G" });
    expect(castTriggers("Whenever an opponent casts a red spell, you gain 2 life.")[0])
      .toMatchObject({ whose: "opponent", spellFilter: "color:R" });
  });

  it("colorless is its own filter, not a colour", () => {
    expect(castTriggers("Whenever you cast a colorless spell, draw a card.")[0])
      .toMatchObject({ spellFilter: "colorless" });
  });

  it("a multi-colour card emits one trigger PER colour (Aragorn)", () => {
    const t = castTriggers("Whenever you cast a white spell, draw a card.\nWhenever you cast a blue spell, draw a card.");
    expect(t.map((x) => x.spellFilter)).toEqual(["color:W", "color:U"]);
  });
});

describe("⛔⭐ RUNTIME — a colour watcher fires on ITS colour and no other", () => {
  // The matcher is module-private, so this drives the real fire site (checkCastTriggers) and counts what
  // enqueued. That is the load-bearing question: parsing the filter is worthless if the wrong spell fires it.
  const WATCHER = { name: "Red Watcher", type: "Enchantment", mana: "{1}{R}",
    oracle: "Whenever you cast a red spell, you gain 2 life." };
  const spell = (colors) => ({ id: "s1", name: "S", type: "Instant", mana: "{1}", colors });

  function fired(spellCard) {
    _resetIdsForTests();
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, players: { ...base.players,
      user: { ...base.players.user, battlefield: [createPermanent({ id: "w", card: WATCHER, controller: "user" })] } } };
    const after = checkCastTriggers(s, { spellCard, casterId: "user" });
    return (after.pendingTriggers || []).length - (s.pendingTriggers || []).length;
  }

  it("⭐ a RED spell fires it", () => expect(fired(spell(["R"]))).toBeGreaterThan(0));
  it("⛔ a GREEN spell does NOT", () => expect(fired(spell(["G"]))).toBe(0));
  it("⛔ a COLOURLESS spell does NOT — colourless is not every colour", () => expect(fired(spell([]))).toBe(0));
  it("⭐ a multicoloured spell containing red DOES (CR 105.2b — it is each of its colours)", () => {
    expect(fired(spell(["W", "R"]))).toBeGreaterThan(0);
  });
});

describe("⛔ the incumbent quality filters are unchanged", () => {
  it("multicolored, historic and the bare form still parse", () => {
    expect(castTriggers("Whenever you cast a multicolored spell, draw a card.")[0]).toMatchObject({ spellFilter: "multicolored" });
    expect(castTriggers("Whenever you cast a historic spell, draw a card.")[0]).toMatchObject({ spellFilter: "historic" });
    expect(castTriggers("Whenever you cast a spell, draw a card.")[0]).toMatchObject({ spellFilter: "any" });
    expect(castTriggers("Whenever you cast a creature spell, draw a card.")[0]).toMatchObject({ spellFilter: "creature" });
    expect(castTriggers("Whenever you cast a noncreature spell, draw a card.")[0]).toMatchObject({ spellFilter: "noncreature" });
  });

  it("a real SUBTYPE still routes to the subtype arm, not the colour arm", () => {
    expect(castTriggers("Whenever you cast a Dragon spell, draw a card.")[0]).toMatchObject({ spellFilter: "subtype:Dragon" });
  });
});

describe("⭐ carriers classify native", () => {
  // ⚠️ Oracle text copied from the bundle.
  for (const [name, type, oracle] of [
    ["Wurm's Tooth", "Artifact", "Whenever a player casts a green spell, you may gain 1 life."],
    ["Warmth", "Enchantment", "Whenever an opponent casts a red spell, you gain 2 life."],
    ["Aragorn, the Uniter", "Legendary Creature — Human Noble", "Whenever you cast a white spell, create a 1/1 white Human Soldier creature token."],
  ]) {
    it(`${name}`, () => {
      const c = { name, type, mana: "{2}", power: 3, toughness: 3, oracle };
      expect(isNativeTier(classifyCard(c)), classifyCard(c)).toBe(true);
    });
  }
});
