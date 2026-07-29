/**
 * selfPowerMana.test.js — "{T}: Add X mana of any one color, where X is THIS CREATURE'S power."
 *
 * Heronblade Elite and Kami of Whispered Hopes print it with "this creature"; Doc Samson and Mona Lisa print
 * the same ability with their own NAME. All four were body-only: `parseManaMetric` knew
 * permanentsYouControl / devotion / greatest-power-or-toughness-among-creatures-you-control and had no
 * SELF metric, so manaProduction returned null and the runtime tapped them for nothing. They are +1/+1
 * counter creatures whose entire plan is to grow and then produce — a mana dork that made no mana.
 *
 * All four move body-only → native-mana; the ability was the card's only unmodelled text.
 *
 * ⚠️ MEASURE ON THE CENSUS CARD SHAPE. Fed a RAW oracle-index record (`oracle_text`/`type_line`) instead of
 * the normalized `{type, oracle, mana}` that `publicCard` hands the census, `classifyCard` reads an empty
 * oracle and calls every one of these a vanilla `native-body` — Sol Ring included. That misread is what
 * first made this slice look corpus-neutral. The fixtures below use the normalized keys deliberately.
 *
 * ⛔ THE SELF-REFERENCE GATE IS THE SAFETY ARGUMENT. Every other "<x>'s power" in the corpus is a REFERENT
 * to a different object — "that creature's power" (Mercy Killing), "the sacrificed creature's power"
 * (Ghoulcaller Gisa), "the exiled card's power" (Lobelia). Reading the SOURCE's power for any of those
 * would fabricate an amount belonging to another permanent, so the name arm matches only against this
 * card's own printed name (full or pre-comma short form) and refuses everything else.
 *
 * ⛔ AND THE SPEND-RESTRICTED SIBLINGS STAY PARKED. Helga, Skittish Seer and Redshift, Rocketeer Chief
 * print the identical metric behind "Spend this mana only to …", which the per-ability restriction refusal
 * already rejects. They must not ride in on this change — pinned below.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

// Real bundled oracle text (scryfall-bulk/oracle-index.json), verbatim.
const HERONBLADE = {
  id: "he", name: "Heronblade Elite", type: "Creature — Human Warrior", mana: "{2}{G}", power: "1", toughness: "1",
  oracle: "Vigilance\nWhenever another Human you control enters, put a +1/+1 counter on this creature.\n{T}: Add X mana of any one color, where X is this creature's power.",
};
const DOC_SAMSON = {
  id: "ds", name: "Doc Samson, Super Psychiatrist", type: "Legendary Creature — Gamma Doctor Hero",
  mana: "{4}{G}", power: "3", toughness: "6",
  oracle: "If you would put one or more counters on a permanent you control, put that many plus one of each of those kinds of counters on that permanent instead.\n{T}: Add X mana of any one color, where X is Doc Samson's power.",
};
const MONA_LISA = {
  id: "ml", name: "Mona Lisa, Science Geek", type: "Legendary Creature — Lizard Mutant", mana: "{2}{G}",
  power: "1", toughness: "3",
  oracle: "Reach\n{T}: Add X mana of any one color, where X is Mona Lisa's power.",
};
const HELGA = {
  id: "hg", name: "Helga, Skittish Seer", type: "Legendary Creature — Elf Warlock", mana: "{2}{G}",
  power: "1", toughness: "3",
  oracle: "{T}: Add X mana of any one color, where X is Helga's power. Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.",
};

const spec = (card) => manaProduction(card)?.amountSpec;

describe("parsing — the metric", () => {
  it('⭐ "this creature\'s power" is a selfPower metric', () => {
    expect(manaProduction(HERONBLADE)).toEqual({
      colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "selfPower" }, requiresTap: true,
    });
  });

  it("⭐ the card's OWN NAME reads as the same self-reference (full and pre-comma short form)", () => {
    expect(spec(DOC_SAMSON)).toEqual({ kind: "selfPower" });
    // "Mona Lisa, Science Geek" prints "Mona Lisa's power" — the pre-comma short form.
    expect(spec(MONA_LISA)).toEqual({ kind: "selfPower" });
  });

  it("⛔ a REFERENT to another object is refused — never the source's power (CREED)", () => {
    for (const ref of ["that creature's", "the sacrificed creature's", "the exiled card's", "enchanted creature's"]) {
      expect(manaProduction({ name: "Fake Dork", type: "Creature — Ooze", power: 1, toughness: 1,
        oracle: `{T}: Add X mana of any one color, where X is ${ref} power.` })).toBeNull();
    }
  });

  it("⛔ ANOTHER CARD'S name is refused — the arm matches only this card's own name", () => {
    expect(manaProduction({ name: "Heronblade Elite", type: "Creature — Bird Soldier", power: 1, toughness: 1,
      oracle: "{T}: Add X mana of any one color, where X is Doc Samson's power." })).toBeNull();
  });

  it("⛔ the SPEND-RESTRICTED siblings stay parked (Helga / Redshift)", () => {
    expect(manaProduction(HELGA)).toBeNull();
    expect(manaProduction({ name: "Redshift, Rocketeer Chief", type: "Creature — Goblin", power: 4, toughness: 4,
      oracle: "{T}: Add X mana of any one color, where X is Redshift's power. Spend this mana only to activate abilities." })).toBeNull();
  });

  it("⭐ the CONNECTOR form carries the same metric (Marwyn and the mono-green dorks)", () => {
    // "Add an amount of {G} equal to <self>'s power" — the same metric behind a different connector, and
    // where five of this slice's nine cards live. Marwyn, the Nurturer is the staple of the group.
    expect(manaProduction({ name: "Marwyn, the Nurturer", type: "Legendary Creature — Elf Druid", mana: "{2}{G}",
      power: "0", toughness: "1",
      oracle: "Whenever another Elf enters the battlefield under your control, put a +1/+1 counter on Marwyn.\n{T}: Add an amount of {G} equal to Marwyn's power." }))
      .toEqual({ colors: ["G"], amount: 0, amountSpec: { kind: "selfPower" }, requiresTap: true });
    expect(spec({ name: "Viridian Joiner", type: "Creature — Elf Druid", power: "1", toughness: "2",
      oracle: "{T}: Add an amount of {G} equal to this creature's power." })).toEqual({ kind: "selfPower" });
  });

  it("CONTROL — the board-wide power metric is untouched and still DISTINCT from selfPower", () => {
    expect(spec({ name: "Selvala, Heart of the Wilds", type: "Legendary Creature — Elf Scout", power: 2, toughness: 3,
      oracle: "{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control." }))
      .toEqual({ kind: "greatestPowerYouControl" });
  });
});

describe("⭐ RUNTIME — the amount is the SOURCE's live power, not the board's best", () => {
  function board({ counters = 0, bystanderPower = null } = {}) {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const self = createPermanent({ id: "he", card: HERONBLADE, controller: "user" });
    self.summoningSick = false;
    if (counters) self.counters = { ...(self.counters || {}), "+1/+1": counters };
    const bf = [self];
    if (bystanderPower != null) {
      bf.push(createPermanent({
        id: "big", controller: "user",
        card: { id: "big", name: "Bystander", type: "Creature — Giant", power: bystanderPower, toughness: bystanderPower, oracle: "" },
      }));
    }
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const amountOf = (st) => (manaSources(st, "user").find((src) => src.permanentId === "he" || src.id === "he") || {}).amount;

  it("a printed 1/1 taps for exactly 1", () => {
    expect(amountOf(board())).toBe(1);
  });

  it("⭐ LAYER-AWARE — three +1/+1 counters make it tap for 4 (the whole point of the card)", () => {
    expect(amountOf(board({ counters: 3 }))).toBe(4);
  });

  it("⛔ a BIGGER creature elsewhere does NOT inflate it — this is not the greatest-power metric", () => {
    // Without this, a selfPower branch that fell through to greatestPowerYouControl would read 9 and pass
    // every other test in this file.
    expect(amountOf(board({ bystanderPower: 9 }))).toBe(1);
  });

  it("CONTROL — the source is genuinely offered (so the assertions above are not measuring an empty list)", () => {
    expect(manaSources(board(), "user").length).toBeGreaterThan(0);
  });
});

describe("tier", () => {
  it("⭐ the four flip body-only → native-mana", () => {
    for (const card of [HERONBLADE, DOC_SAMSON, MONA_LISA]) expect(classifyCard(card)).toBe("native-mana");
  });

  it("⛔ the spend-restricted sibling stays body-only — it must not ride in on this change", () => {
    expect(classifyCard(HELGA)).toBe("body-only");
  });

  it("CONTROL — swap the metric for an UNMODELLED one and the same card parks again", () => {
    // The before-state of this slice. Without it, a classifier that credited the mana line regardless of
    // whether the metric parsed would pass the assertions above.
    expect(classifyCard({ ...MONA_LISA,
      oracle: "Reach\n{T}: Add X mana of any one color, where X is the number of Zombies target opponent controls." }))
      .toBe("body-only");
  });
});
