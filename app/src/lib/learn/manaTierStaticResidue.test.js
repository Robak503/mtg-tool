/**
 * manaTierStaticResidue.test.js — the native-mana gate reads STATIC and REPLACEMENT text (2026-10-16).
 *
 * manaCardResidueModeled read a mana source's trigger sentences and its activated abilities and nothing else,
 * so a static or replacement sentence was never looked at and the card claimed native-mana whatever it said.
 * THE WITNESS is synthetic and exact: Everflowing Chalice with its enters-with sentence ending "… and you lose
 * the game." The per-kick enters-with strip refuses the rider (entersWithCountersPerKick is whole-sentence
 * anchored), so the sentence reached the gate as residue, and the gate returned true without reading it.
 *
 * The gate now ends with the composite tier's own residue walk (stripModeledTriggerText → remainingClausesModeled).
 * On the bundled corpus that moved 39 cards off native-mana, each audited by name against the runtime reader of
 * its leftover sentence (RUN-LEDGER 2026-10-16); one pin per residue SHAPE below. Sentences the runtime DOES
 * honour were credited first, each on the reader the runtime itself uses, and each credit sits beside its
 * runtime proof so the claim and the behaviour cannot drift apart.
 *
 * Fixtures: real oracle text copied verbatim from the bundled index (read 2026-10-16) unless marked SYNTHETIC.
 * Index-free, per coverage.test.js's convention (CI has no Scryfall bulk data).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, addCounter, _resetIdsForTests } from "./gameState.js";
import { manaSources } from "./manaModel.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type, mana, mana_cost: mana, oracle, ...extra });

const CHALICE = card("Everflowing Chalice", "Artifact", "{0}", "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact.");

describe("the witness — a rider on an enters-with sentence the strip refuses", () => {
  it("⛔ SYNTHETIC: the Chalice whose enters-with sentence ends in '… and you lose the game.' is refused; the real Chalice keeps native-mana", () => {
    const rider = card("Everflowing Chalice", "Artifact", "{0}", "Multikicker {2}\nThis artifact enters with a charge counter on it for each time it was kicked and you lose the game.\n{T}: Add {C} for each charge counter on this artifact.", { keywords: ["Multikicker"] });
    // The control is printed beside the result (the hollow-gate law's clause D): a refusal only means something
    // while the identical card without the rider is still credited.
    expect(classifyCard(CHALICE)).toBe("native-mana");
    expect(classifyCard(rider)).toBe("body-only");
  });
});

describe("genuine static / replacement residue parks the card — one pin per shape", () => {
  // Every card here taps for mana the runtime really produces, so only the residue read keeps it honest. Each
  // `why` names the runtime reader that does NOT read the leftover sentence.
  // (2026-10-17: Mox Diamond's enter replacement and Bender's Waterskin's self untap left this list when their readers landed —
  // discardLandToEnter.js and typeFilteredUntap.js's self member; their runtime witnesses are moxDiamond.test.js and
  // bendersWaterskin.test.js, each with the refused variants beside them.)
  const CASES = [
    ["Phial of Galadriel", "Legendary Artifact", "{3}", "If you would draw a card while you have no cards in hand, draw two cards instead.\nIf you would gain life while you have 5 or less life, you gain twice that much life instead.\n{T}: Add one mana of any color.",
      "two CONDITIONAL replacements; the draw and life-gain doublers read only the unconditional templates"],
    ["Giada, Font of Hope", "Legendary Creature — Angel", "{1}{W}", "Flying, vigilance\nEach other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.\n{T}: Add {W}. Spend this mana only to cast an Angel spell.",
      "an others-enter-with shape othersEnterWithCounters refuses (no 'creature', a per-Angel count)"],
    ["Heraldic Banner", "Artifact", "{3}", "As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+0.\n{T}: Add one mana of the chosen color.",
      "the chooser is credited; the chosen-color anthem has no static descriptor"],
    ["Dalakos, Crafter of Wonders", "Legendary Creature — Merfolk Artificer", "{1}{U}{R}", "{T}: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.\nEquipped creatures you control have flying and haste.",
      "an equipped-creatures grant with no static descriptor"],
    ["Serum Powder", "Artifact", "{3}", "{T}: Add {C}.\nAny time you could mulligan and this card is in your hand, you may exile all the cards from your hand, then draw that many cards. (You can do this in addition to taking mulligans.)",
      "a mulligan action the engine never offers"],
    // Relic of Legends was this row until 2026-10-17, when its tap-a-legend line became a record the runtime pays
    // (relicOfLegends.test.js). The shape stays pinned on its synthetic twin: a payer noun the reader doesn't read.
    ["Relic of Legends (a blue-creature payer)", "Artifact", "{3}", "{T}: Add one mana of any color.\nTap an untapped blue creature you control: Add one mana of any color.",
      "a SECOND mana ability the runtime's mana parser cannot read (a tap-a-blue-creature cost)"],
    ["Devoted Druid", "Creature — Elf Druid", "{1}{G}", "{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature.",
      "an activated ability the parser never detects (a -1/-1 counter cost), so the untap is never offered"],
    ["Phyrexian Atlas", "Artifact", "{3}", "{T}: Add one mana of any color.\nCorrupted — Whenever this artifact becomes tapped, each opponent who has three or more poison counters loses 1 life.",
      "a labeled trigger the trigger count never saw ('Corrupted —' hides the 'Whenever'); detectTriggers finds none"],
    ["Invasion of Zendikar // Awakened Skyclave", "Battle — Siege // Creature — Elemental", "{3}{G}", "Invasion of Zendikar - Battle — Siege {3}{G}\n(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.\n//\nAwakened Skyclave - Creature — Elemental \nVigilance, haste\nAs long as this creature is on the battlefield, it's a land in addition to its other types.\n{T}: Add one mana of any color.",
      "the mana ability is on the BACK face of a battle, and no lane defeats a battle or casts it transformed"],
  ];
  for (const [name, type, mana, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      expect(classifyCard(card(name, type, mana, oracle))).toBe("body-only");
    });
  }
});

// ── Sentences the runtime honours, credited on the runtime's own reader ─────────────────────────────────────────
const ELF_DRUID = (id, sick = true) => createPermanent({ id, card: card("Llanowar Elves", "Creature — Elf Druid", "{G}", "{T}: Add {G}.", { power: 1, toughness: 1 }), controller: "user", summoningSick: sick });
const BEAR = () => createPermanent({ id: "bear", card: card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { power: 2, toughness: 2 }), controller: "user", summoningSick: false });
const ROCK = () => createPermanent({ id: "rock", card: card("Probe Rock", "Artifact", "{1}", "{T}: Add {C}."), controller: "user", summoningSick: false });
function board(battlefield, hand = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, hand, library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}

describe("a mana line with a WORD cost is read by the runtime's own mana parser, line by line", () => {
  const HERITAGE = card("Heritage Druid", "Creature — Elf Druid", "{G}", "Tap three untapped Elves you control: Add {G}{G}{G}.", { power: 1, toughness: 1 });

  it("Heritage Druid, Elvish Spirit Guide, Wall of Roots, Seton and Birchlore Rangers keep native-mana", () => {
    expect(classifyCard(HERITAGE)).toBe("native-mana");
    expect(classifyCard(card("Elvish Spirit Guide", "Creature — Elf Spirit", "{2}{G}", "Exile this card from your hand: Add {G}."))).toBe("native-mana");
    // Wall of Roots' "Put a -0/-1 counter on this creature" is a cost its mana record pays (2026-10-17 — the counter is put on at
    // commit, no tap, once each turn), so the runtime's per-line parse reads the line and the metric credits it.
    expect(classifyCard(card("Wall of Roots", "Creature — Plant Wall", "{1}{G}", "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn."))).toBe("native-mana");
    expect(classifyCard(card("Seton, Krosan Protector", "Legendary Creature — Centaur Druid", "{G}{G}{G}", "Tap an untapped Druid you control: Add {G}."))).toBe("native-mana");
    expect(classifyCard(card("Birchlore Rangers", "Creature — Elf Druid Ranger", "{G}", "Tap two untapped Elves you control: Add one mana of any color.\nMorph {G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"))).toBe("native-mana");
  });

  it("⭐ runtime: Heritage Druid makes {G}{G}{G} off three untapped Elves (summoning-sick payers allowed, CR 302.6), nothing off two", () => {
    const druid = createPermanent({ id: "hd", card: HERITAGE, controller: "user", summoningSick: true });
    const src = (n) => manaSources(board([druid, ...Array.from({ length: n }, (_, i) => ELF_DRUID("e" + i))]), "user").find((x) => x.permanentId === "hd");
    expect(src(2)).toMatchObject({ colors: ["G"], amount: 3 });
    expect(src(1)).toBeUndefined();
  });

  it("⛔ a second word-cost mana line the parser cannot read is residue — an unread payer noun parks the card, the same card without it does not", () => {
    // 2026-10-17: Relic of Legends' own "legendary creature" payer reads (its record taps the legend — relicOfLegends.test.js),
    // so the real card is native-mana; a payer noun the reader has no filter for ("blue creature") still parks it.
    expect(classifyCard(card("Relic of Legends", "Artifact", "{3}", "{T}: Add one mana of any color.\nTap an untapped blue creature you control: Add one mana of any color."))).toBe("body-only");
    expect(classifyCard(card("Relic of Legends", "Artifact", "{3}", "{T}: Add one mana of any color.\nTap an untapped legendary creature you control: Add one mana of any color."))).toBe("native-mana");
    expect(classifyCard(card("Relic of Legends", "Artifact", "{3}", "{T}: Add one mana of any color."))).toBe("native-mana");
  });

  it("⛔ a sentence that only QUOTES a mana ability is not a mana line — the copy clause and the land grant stay residue", () => {
    // The parser reads the quoted "{T}: Add …" in each, so a per-line read alone credited both whole sentences
    // (caught in this slice's own audit, before it shipped). Neither the copy nor the grant to lands is modeled.
    expect(classifyCard(card("Machine God's Effigy", "Artifact", "{4}", "You may have this artifact enter as a copy of any creature on the battlefield, except it's an artifact and it has \"{T}: Add {U}.\" (It's not a creature.)\n{T}: Add {U}."))).toBe("body-only");
    expect(classifyCard(card("Great Divide Guide", "Creature — Human Scout Ally", "{1}{G}", "Each land and Ally you control has \"{T}: Add one mana of any color.\""))).toBe("body-only");
  });
});

describe("'As this <permanent> enters, choose a color.' — credited on choosesColorOnEnter (CR 614.12 / 614.12a)", () => {
  const SOL_GRAIL = card("Sol Grail", "Artifact", "{3}", "As this artifact enters, choose a color.\n{T}: Add one mana of the chosen color.");

  it("Coldsteel Heart, Sol Grail, Silhana Starfletcher and Quirion Elves keep native-mana", () => {
    expect(classifyCard(card("Coldsteel Heart", "Snow Artifact", "{2}", "This artifact enters tapped.\nAs this artifact enters, choose a color.\n{T}: Add one mana of the chosen color."))).toBe("native-mana");
    expect(classifyCard(SOL_GRAIL)).toBe("native-mana");
    expect(classifyCard(card("Silhana Starfletcher", "Creature — Elf Druid Archer", "{2}{G}", "Reach (This creature can block creatures with flying.)\nAs this creature enters, choose a color.\n{T}: Add one mana of the chosen color."))).toBe("native-mana");
    expect(classifyCard(card("Quirion Elves", "Creature — Elf Druid", "{1}{G}", "As this creature enters, choose a color.\n{T}: Add {G}.\n{T}: Add one mana of the chosen color."))).toBe("native-mana");
  });

  it("⭐ runtime: Sol Grail entering through the general enter site is stamped, and taps for exactly that color", () => {
    const s = board([], [{ id: "h0", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}" }]);
    const out = enterPermanent(s, SOL_GRAIL, "user");
    const grail = out.players.user.battlefield.find((p) => p.card.name === "Sol Grail");
    expect(grail.chosenColor).toBe("G");
    expect(manaSources(out, "user").find((x) => x.permanentId === grail.id)?.colors).toEqual(["G"]);
  });

  it("⛔ SYNTHETIC twins: a chooser the reader refuses stays residue", () => {
    expect(classifyCard(card("Probe Chooser", "Artifact", "{2}", "As this artifact enters, choose a color.\n{T}: Add {C}."))).toBe("native-mana");
    expect(classifyCard(card("Probe Chooser", "Artifact", "{2}", "As this artifact enters, choose a color and an opponent.\n{T}: Add {C}."))).toBe("body-only");
  });
});

describe("a counter-doubler sentence — credited on isModeledDoublerSentence (a replacement effect, CR 614.1a)", () => {
  const DOC = card("Doc Samson, Super Psychiatrist", "Legendary Creature — Gamma Doctor Hero", "{4}{G}", "If you would put one or more counters on a permanent you control, put that many plus one of each of those kinds of counters on that permanent instead.\n{T}: Add X mana of any one color, where X is Doc Samson's power.", { power: 5, toughness: 5 });
  const KAMI = card("Kami of Whispered Hopes", "Creature — Spirit", "{2}{G}", "If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.\n{T}: Add X mana of any one color, where X is this creature's power.", { power: 0, toughness: 0 });

  it("Doc Samson and Kami of Whispered Hopes keep native-mana", () => {
    expect(classifyCard(DOC)).toBe("native-mana");
    expect(classifyCard(KAMI)).toBe("native-mana");
  });

  it("⭐ runtime: one counter becomes two — of every kind under Doc Samson, of +1/+1 only under Kami", () => {
    const counters = (src, id, type) => {
      const s = board([BEAR(), ROCK(), createPermanent({ id: "src", card: src, controller: "user", summoningSick: false })]);
      return addCounter(s, { permanentId: id, type, amount: 1 }).players.user.battlefield.find((p) => p.id === id).counters?.[type] ?? 0;
    };
    expect(counters(DOC, "bear", "+1/+1")).toBe(2);
    expect(counters(DOC, "rock", "charge")).toBe(2);
    expect(counters(KAMI, "bear", "+1/+1")).toBe(2);
    expect(counters(KAMI, "rock", "charge")).toBe(1);
  });

  it("⛔ SYNTHETIC twin: a doubler with a SUBTYPE recipient (Mauhúr's shape, never applied) stays residue", () => {
    expect(classifyCard(card("Probe Doubler", "Creature — Elf", "{2}{G}", "If one or more +1/+1 counters would be put on an Elf you control, that many plus one +1/+1 counters are put on it instead.\n{T}: Add {G}."))).toBe("body-only");
  });
});

describe("the Glimmer directive 'It's an enchantment.' — mirrored into the composite walk, anchored", () => {
  // The runtime return-as-an-enchantment is driven end to end in enduringGlimmer.test.js.
  it("Enduring Vitality keeps native-mana (Vigilance, a creature mana grant, the dies-return)", () => {
    expect(classifyCard(card("Enduring Vitality", "Enchantment Creature — Elk Glimmer", "{1}{G}{G}", "Vigilance\nCreatures you control have \"{T}: Add one mana of any color.\"\nWhen Enduring Vitality dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)"))).toBe("native-mana");
  });

  it("⛔ SYNTHETIC twin: the same words NOT following the self-return clause stay residue", () => {
    expect(classifyCard(card("Probe Glimmer", "Creature — Elk", "{1}{G}", "{T}: Add {G}.\nIt's an enchantment."))).toBe("body-only");
  });
});

describe("the Borderposts' alternative cost — vacuous for a card cast at its printed cost (CR 118.9)", () => {
  const BORDERPOST = card("Mistvein Borderpost", "Artifact", "{1}{U}{B}", "You may pay {1} and return a basic land you control to its owner's hand rather than pay this spell's mana cost.\nThis artifact enters tapped.\n{T}: Add {U} or {B}.");

  it("Mistvein Borderpost keeps native-mana", () => {
    expect(classifyCard(BORDERPOST)).toBe("native-mana");
  });

  it("⭐ runtime: the cast is offered for the printed {1}{U}{B} and never for the alternative cost", () => {
    const land = (id, name, sub, color) => createPermanent({ id, card: card(name, `Basic Land — ${sub}`, "", `({T}: Add {${color}}.)`), controller: "user", summoningSick: false });
    const casts = (lands) => legalActionsForPlayer(board(lands, [{ ...BORDERPOST, id: "bp" }]), "user").filter((a) => a.kind === "cast-spell" && a.cardId === "bp");
    // Three lands pay {1}{U}{B}; two would pay the alternative ({1} plus returning a basic land) if it were offered.
    expect(casts([land("i", "Island", "Island", "U"), land("s", "Swamp", "Swamp", "B"), land("p", "Plains", "Plains", "W")]).length).toBeGreaterThan(0);
    expect(casts([land("i", "Island", "Island", "U"), land("p", "Plains", "Plains", "W")])).toHaveLength(0);
  });

  it("⛔ the credit needs a printed mana cost, and covers that one sentence only", () => {
    expect(classifyCard({ ...BORDERPOST, mana: "", mana_cost: "" })).toBe("body-only");
    expect(classifyCard(card("Probe Rock", "Artifact", "{3}", "You may exile two green cards from your hand rather than pay this spell's mana cost.\n{T}: Add {C}."))).toBe("body-only");
  });
});

describe("statics the composite walk already credited keep the tier", () => {
  it("Basalt Monolith (the self no-untap static) and Elvish Archdruid (an Elf anthem)", () => {
    expect(classifyCard(card("Basalt Monolith", "Artifact", "{3}", "This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact."))).toBe("native-mana");
    expect(classifyCard(card("Elvish Archdruid", "Creature — Elf Druid", "{1}{G}{G}", "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control."))).toBe("native-mana");
  });
});
