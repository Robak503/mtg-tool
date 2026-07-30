/**
 * CDA-COUNT-VOCABULARY (BLITZ CDP-1) — the characteristic-defining self-P/T lane, BROADENED past the original
 * symmetric "…power and toughness are each equal to the number of <X> you control" (cdaSelfPtByCount.test.js)
 * on TWO axes:
 *
 *   1. PRINTED P/T SHAPE (staticAbilityParser.parseClause) — three forms now emit the layer-7a
 *      { layerOp:"ptSetDynamicCount", … } CDA descriptor:
 *        • BOTH   "…power and toughness are each equal to the [total ]number of <X>"  → set power = N, toughness = N
 *        • POWER  "…power is equal to the [total ]number of <X>"                       → set power = N (printed toughness stands)
 *        • GOYF   "…power is equal to the number of <X> and its toughness is equal to that number plus 1"
 *                                                                                       → set power = N, toughness = N + 1 (printed star / 1+star)
 *   2. COUNT VOCABULARY (staticAbilityParser.parseCdaCountSource → layers.countForSpec) — beyond you-control
 *      board counts: cards in your / all players' HANDS (Maro, Multani); typed / distinct-card-types counts in
 *      your GRAVEYARD (Revenant, Haughty Djinn, Nethergoyf) and in ALL GRAVEYARDS (Lhurgoyf, Tarmogoyf,
 *      Cognivore, Slag Fiend, Terravore). Every count maps to an EXACT evaluator (a plain zone-length read or a
 *      printed type-line scan — recursion-safe, never deriveCharacteristics); metric⇄runtime lockstep.
 *
 * CR grounding (cr_current.json): a CDA is defined in 604.3 and applied in layer 7a (613.4a), never on the
 * stack; layer-7 sublayers 613.4 (7a set-by-CDA → 7c counters/modifications → …). The set value is the BASE, so
 * a +1/+1 counter and an anthem/pump (7c) stack ON TOP in the correct order.
 *
 * CREED anti-FP: an unmodeled count ("+1/+1 counters on lands", a plural "<tribe>s on the battlefield" whose
 * evaluator would count 0, a qualified/opponent count) emits NO descriptor → the card parks (Arbiter); an
 * added rider (escape, regenerate) de-natives the whole card (all-or-nothing). Oracle text verified against
 * Scryfall (scryfall.oracle.local.json).
 */
import { describe, expect, it, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { permanentPower, permanentToughness, addContinuousEffect } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall) ───
const MARO = { name: "Maro", type: "Creature — Elemental", power: "*", toughness: "*",
  oracle: "Maro's power and toughness are each equal to the number of cards in your hand." };
const MULTANI = { name: "Multani, Maro-Sorcerer", type: "Legendary Creature — Elemental Sorcerer", power: "*", toughness: "*",
  oracle: "Shroud (This creature can't be the target of spells or abilities.)\nMultani's power and toughness are each equal to the total number of cards in all players' hands." };
const REVENANT = { name: "Revenant", type: "Creature — Spirit", power: "*", toughness: "*",
  oracle: "Flying\nRevenant's power and toughness are each equal to the number of creature cards in your graveyard." };
const HAUGHTY_DJINN = { name: "Haughty Djinn", type: "Creature — Djinn", power: "*", toughness: "4",
  oracle: "Flying\nHaughty Djinn's power is equal to the number of instant and sorcery cards in your graveyard.\nInstant and sorcery spells you cast cost {1} less to cast." };
const SNOW_VILLIERS = { name: "Snow Villiers", type: "Creature — Human Soldier", power: "*", toughness: "3",
  oracle: "Vigilance\nSnow Villiers's power is equal to the number of creatures you control." };
const LHURGOYF = { name: "Lhurgoyf", type: "Creature — Lhurgoyf", power: "*", toughness: "1+*",
  oracle: "Lhurgoyf's power is equal to the number of creature cards in all graveyards and its toughness is equal to that number plus 1." };
const TARMOGOYF = { name: "Tarmogoyf", type: "Creature — Lhurgoyf", power: "*", toughness: "1+*",
  oracle: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1." };
const COGNIVORE = { name: "Cognivore", type: "Creature — Lhurgoyf", power: "*", toughness: "*",
  oracle: "Flying\nCognivore's power and toughness are each equal to the number of instant cards in all graveyards." };
const TERRAVORE = { name: "Terravore", type: "Creature — Lhurgoyf", power: "*", toughness: "*",
  oracle: "Trample\nTerravore's power and toughness are each equal to the number of land cards in all graveyards." };

// ─── Fixture cards for the counted zones ───
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", oracle: "Creatures you control get +1/+1." };
const GY_CREATURE = { name: "Dead Bear", type: "Creature — Bear" };
const GY_INSTANT = { name: "Shock", type: "Instant" };
const GY_SORCERY = { name: "Divination", type: "Sorcery" };
const GY_LAND = { name: "Wastes", type: "Land" };

let _n = 0;
function mk(card, controller = "user") {
  return createPermanent({ id: `p-${(card.name || "x").replace(/\s+/g, "")}-${_n++}`, card: { ...card }, controller, summoningSick: false });
}
function stateWith({ userBf = [], aiBf = [], userHand = [], aiHand = [], userGy = [], aiGy = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, hand: userHand, graveyard: userGy },
      ai: { ...s.players.ai, battlefield: aiBf, hand: aiHand, graveyard: aiGy },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION — the broadened shapes + count vocabulary flip native-static (real oracle)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA-COUNT-VOCABULARY classification (recognition on real oracle)", () => {
  it("Maro (cards in your hand, symmetric) → native-static", () => {
    expect(classifyCard(MARO)).toBe("native-static");
    expect(isNativeTier(classifyCard(MARO))).toBe(true);
  });
  it("Multani (all players' hands, 'total number of') → native-static", () => {
    expect(classifyCard(MULTANI)).toBe("native-static");
  });
  it("Revenant (creature cards in your graveyard, symmetric + Flying) → native-static", () => {
    expect(classifyCard(REVENANT)).toBe("native-static");
  });
  it("Haughty Djinn (instant/sorcery in your gy, POWER-only + printed toughness + cost static) → native-static", () => {
    expect(classifyCard(HAUGHTY_DJINN)).toBe("native-static");
  });
  it("Snow Villiers (creatures you control, POWER-only + Vigilance) → native-static", () => {
    expect(classifyCard(SNOW_VILLIERS)).toBe("native-static");
  });
  it("Lhurgoyf (creature cards in all graveyards, GOYF */1+*) → native-static", () => {
    expect(classifyCard(LHURGOYF)).toBe("native-static");
  });
  it("Tarmogoyf (card types in all graveyards, GOYF */1+*) → native-static", () => {
    expect(classifyCard(TARMOGOYF)).toBe("native-static");
  });
  it("Cognivore / Terravore (typed cards in all graveyards, symmetric) → native-static", () => {
    expect(classifyCard(COGNIVORE)).toBe("native-static");
    expect(classifyCard(TERRAVORE)).toBe("native-static");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// RUNTIME — the P/T tracks the live count, BOTH directions, in the correct zone
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("HAND-count P/T tracks the controller's hand (Maro)", () => {
  it("is 0/0 with an empty hand and GROWS as the hand fills (0 → 3 → 4)", () => {
    const maro = mk(MARO);
    expect(permanentPower(stateWith({ userBf: [maro], userHand: [] }), maro.id)).toBe(0);
    const s3 = stateWith({ userBf: [maro], userHand: [{}, {}, {}] });
    expect(permanentPower(s3, maro.id)).toBe(3);
    expect(permanentToughness(s3, maro.id)).toBe(3);
    const s4 = stateWith({ userBf: [maro], userHand: [{}, {}, {}, {}] });
    expect(permanentPower(s4, maro.id)).toBe(4); // a drawn card → grows
  });
  it("only the CONTROLLER's hand counts (an opponent's hand does NOT)", () => {
    const maro = mk(MARO);
    const s = stateWith({ userBf: [maro], userHand: [{}, {}], aiHand: [{}, {}, {}, {}] });
    expect(permanentPower(s, maro.id)).toBe(2);
  });
});

describe("ALL-HANDS count (Multani — 'total number of cards in all players' hands')", () => {
  it("sums every player's hand (2 mine + 3 opponent = 5/5)", () => {
    const mu = mk(MULTANI);
    const s = stateWith({ userBf: [mu], userHand: [{}, {}], aiHand: [{}, {}, {}] });
    expect(permanentPower(s, mu.id)).toBe(5);
    expect(permanentToughness(s, mu.id)).toBe(5);
  });
});

describe("YOUR-GRAVEYARD typed count (Revenant — creature cards in your graveyard)", () => {
  it("counts only creature cards in YOUR graveyard (opponent's don't count; noncreature don't count)", () => {
    const rev = mk(REVENANT);
    const s = stateWith({
      userBf: [rev],
      userGy: [{ ...GY_CREATURE }, { ...GY_CREATURE }, { ...GY_LAND }, { ...GY_INSTANT }],
      aiGy: [{ ...GY_CREATURE }, { ...GY_CREATURE }],
    });
    expect(permanentPower(s, rev.id)).toBe(2); // the two creature cards in MY graveyard only
    expect(permanentToughness(s, rev.id)).toBe(2);
  });
});

describe("POWER-ONLY CDA leaves the printed toughness (Haughty Djinn */4)", () => {
  it("power = instant+sorcery cards in your gy; toughness stays the printed 4", () => {
    const dj = mk(HAUGHTY_DJINN);
    const s = stateWith({ userBf: [dj], userGy: [{ ...GY_INSTANT }, { ...GY_SORCERY }, { ...GY_CREATURE }] });
    expect(permanentPower(s, dj.id)).toBe(2); // 1 instant + 1 sorcery
    expect(permanentToughness(s, dj.id)).toBe(4);       // printed toughness, NOT the count
  });
});

describe("ALL-GRAVEYARDS typed count (Lhurgoyf — creature cards in all graveyards, GOYF)", () => {
  it("sums creature cards across EVERY graveyard; toughness is that number PLUS 1 (2+1 = 3 → 3/4)", () => {
    const l = mk(LHURGOYF);
    const s = stateWith({
      userBf: [l],
      userGy: [{ ...GY_CREATURE }, { ...GY_LAND }],
      aiGy: [{ ...GY_CREATURE }, { ...GY_INSTANT }],
    });
    expect(permanentPower(s, l.id)).toBe(2);     // 1 creature in each graveyard
    expect(permanentToughness(s, l.id)).toBe(3); // N + 1
  });
});

describe("ALL-GRAVEYARDS card-types count (Tarmogoyf — card types among cards in all graveyards, GOYF)", () => {
  it("counts DISTINCT card types across all graveyards and GROWS as a new type is added (2/3 → 3/4)", () => {
    const t = mk(TARMOGOYF);
    // two distinct types (creature, instant) across both graveyards → power 2, toughness 3
    const s2 = stateWith({ userBf: [t], userGy: [{ ...GY_CREATURE }], aiGy: [{ ...GY_INSTANT }] });
    expect(permanentPower(s2, t.id)).toBe(2);
    expect(permanentToughness(s2, t.id)).toBe(3);
    // add a LAND card (a third distinct type) → power 3, toughness 4
    const s3 = stateWith({ userBf: [t], userGy: [{ ...GY_CREATURE }, { ...GY_LAND }], aiGy: [{ ...GY_INSTANT }] });
    expect(permanentPower(s3, t.id)).toBe(3);
    expect(permanentToughness(s3, t.id)).toBe(4);
  });
  it("a duplicate card type does NOT double-count (two creature cards = one type)", () => {
    const t = mk(TARMOGOYF);
    const s = stateWith({ userBf: [t], userGy: [{ ...GY_CREATURE }, { ...GY_CREATURE }] });
    expect(permanentPower(s, t.id)).toBe(1);     // one distinct type (creature)
    expect(permanentToughness(s, t.id)).toBe(2); // N + 1
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// LAYER STACKING — the 7a CDA SET is the base; 7c counters + anthems + pumps add ON TOP (CR 613.4)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("the CDA set is the base; 7c effects stack ON TOP in the correct sublayer order", () => {
  it("Tarmogoyf base 3/4 + a +1/+1 counter = 4/5 (7a set → 7c counter)", () => {
    const t = mk(TARMOGOYF);
    t.counters = { "+1/+1": 1 };
    const s = stateWith({ userBf: [t], userGy: [{ ...GY_CREATURE }, { ...GY_INSTANT }, { ...GY_LAND }] });
    expect(permanentPower(s, t.id)).toBe(4);
    expect(permanentToughness(s, t.id)).toBe(5);
  });
  it("Tarmogoyf base 3/4 + an until-EOT pump (+2/+2) = 5/6 (7a set → 7c ptModify)", () => {
    const t = mk(TARMOGOYF);
    let s = stateWith({ userBf: [t], userGy: [{ ...GY_CREATURE }, { ...GY_INSTANT }, { ...GY_LAND }] });
    ({ state: s } = addContinuousEffect(s, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 },
      affects: { mode: "fixed", permanentIds: [t.id] }, duration: { kind: "endOfTurn", turn: s.turn },
    }));
    expect(permanentPower(s, t.id)).toBe(5);
    expect(permanentToughness(s, t.id)).toBe(6);
  });
  it("Maro base 3/3 + Glorious Anthem (+1/+1) = 4/4 (7a set → 7c anthem)", () => {
    const maro = mk(MARO);
    const s = stateWith({ userBf: [maro, mk(ANTHEM)], userHand: [{}, {}, {}] });
    expect(permanentPower(s, maro.id)).toBe(4);
    expect(permanentToughness(s, maro.id)).toBe(4);
  });
  it("a -1/-1 counter reduces below the goyf base (Lhurgoyf 2/3, -1/-1 → 1/2)", () => {
    const l = mk(LHURGOYF);
    l.counters = { "-1/-1": 1 };
    const s = stateWith({ userBf: [l], userGy: [{ ...GY_CREATURE }], aiGy: [{ ...GY_CREATURE }] });
    expect(permanentPower(s, l.id)).toBe(1);
    expect(permanentToughness(s, l.id)).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// DERIVE RE-ENTRY — a self-count CDA on a live board reads printed characteristics only (no recursion)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("DERIVE RE-ENTRY guard (self-count CDAs read printed state, never derived P/T)", () => {
  it("a board of creature-counting CDAs computes finitely (Snow Villiers counts itself + others; no stack overflow)", () => {
    // Snow Villiers' power = creatures you control (a board scan of PRINTED types — recursion-safe). Two of them
    // + a Bear = three creatures you control; each reads 3 without re-entering the other's P/T derive.
    const a = mk(SNOW_VILLIERS);
    const b = mk(SNOW_VILLIERS);
    const s = stateWith({ userBf: [a, b, mk(BEAR)] });
    expect(permanentPower(s, a.id)).toBe(3); // itself + the other Villiers + the Bear
    expect(permanentPower(s, b.id)).toBe(3);
    expect(Number.isFinite(permanentToughness(s, a.id))).toBe(true); // printed toughness stands (power-only CDA)
    expect(permanentToughness(s, a.id)).toBe(3);
  });
  it("Terravore/Lhurgoyf side by side each read their own count without recursing into the other", () => {
    const terra = mk(TERRAVORE);
    const lhur = mk(LHURGOYF);
    const s = stateWith({ userBf: [terra, lhur], userGy: [{ ...GY_LAND }, { ...GY_CREATURE }] });
    expect(permanentPower(s, terra.id)).toBe(1);  // 1 land card in all graveyards
    expect(permanentPower(s, lhur.id)).toBe(1);   // 1 creature card in all graveyards
    expect(permanentToughness(s, lhur.id)).toBe(2); // goyf +1
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// CREED anti-FP — an unmodeled count, an excluded vocabulary, or an added rider all PARK the card
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA-COUNT-VOCABULARY CREED anti-FP (parks stay body-only)", () => {
  it("⭐ '+1/+1 counters on lands you control' (Toph) is MODELED now — an exact evaluator exists", () => {
    // ⚠️ UPDATED 2026-07-28. This lived in the anti-FP list as "an unmodeled count", which was correct while
    // the allowlist's own rule — admit only what countForSpec computes EXACTLY — had nothing to point at.
    // countSelfSpecOnBoard now sums the named counter kind over a word-bounded group, written BEFORE the
    // phrase was admitted (a CDA sets the base P/T, so admitting first would have set a fabricated 0/0).
    // Its earthbend half was already modeled, so the whole card is native-mixed. The genuinely unmodeled
    // vocabularies below — the plural "<tribe>s on the battlefield", the opponent and mana-symbol counts —
    // are untouched and still park.
    const toph = {
      name: "Toph, the Blind Bandit", type: "Legendary Creature — Human Warrior Ally", power: "*", toughness: "3",
      oracle: "When Toph enters, earthbend 2.\nToph's power is equal to the number of +1/+1 counters on lands you control.",
    };
    expect(isNativeTier(classifyCard(toph))).toBe(true);
  });

  it("CREED — a counter kind with no exact evaluator still parks", () => {
    const t = {
      name: "Fake Toph", type: "Legendary Creature — Human Warrior Ally", power: "*", toughness: "3",
      oracle: "Fake Toph's power is equal to the number of loyalty counters on lands you control.",
    };
    expect(isNativeTier(classifyCard(t))).toBe(false);
  });
  it("a plural '<tribe>s on the battlefield' count (Soulless One — evaluator would count 0) stays body-only", () => {
    const soulless = {
      name: "Soulless One", type: "Creature — Zombie Avatar", power: "*", toughness: "*",
      oracle: "Soulless One's power and toughness are each equal to the number of Zombies on the battlefield.",
    };
    expect(classifyCard(soulless)).not.toBe("native-static");
  });
  it("✅ a GOYF-form CDA whose escape rider is now MODELED (Nethergoyf) is native-static", () => {
    // GRADUATED 2026-07-30. This pin recorded "escape is an unmodeled rider" — a BOUNDARY MARKER, not a
    // claim that the CDA half was wrong. Escape is now credited by whole-line removal (CR 702.138a: the
    // graveyard re-cast the runtime never offers, and Nethergoyf has a printed {B} cost so the from-hand
    // cast resolves the same body). The CDA half this file actually guards is unchanged — the surrounding
    // cases still park a CDA carrying a genuinely unmodeled rider.
    const nether = {
      name: "Nethergoyf", type: "Creature — Lhurgoyf", power: "*", toughness: "1+*",
      oracle: "Nethergoyf's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\nEscape—{2}{B}, Exile any number of other cards from your graveyard with four or more card types among them.",
    };
    expect(classifyCard(nether)).toBe("native-static");
  });
  it("a symmetric all-graveyards CDA with an unmodeled regenerate rider (Mortivore) stays body-only", () => {
    const morti = {
      name: "Mortivore", type: "Creature — Lhurgoyf", power: "*", toughness: "*",
      oracle: "Mortivore's power and toughness are each equal to the number of creature cards in all graveyards.\n{B}: Regenerate this creature.",
    };
    expect(classifyCard(morti)).not.toBe("native-static");
  });
  it("an added unmodeled rider de-natives an otherwise-clean hand CDA (all-or-nothing residue)", () => {
    const ridered = { ...MARO, oracle: MARO.oracle + "\nWhenever you draw a card, you gain a billion life and win the game." };
    expect(classifyCard(ridered)).not.toBe("native-static");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// REGRESSION — the original symmetric you-control lane is unchanged
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("REGRESSION — the original you-control board CDAs still flip + compute", () => {
  it("Dakkon-style lands count still native-static and reads N/N", () => {
    const dak = { name: "Dakkon Blackblade", type: "Legendary Creature — Human Warrior", power: "*", toughness: "*",
      oracle: "Dakkon Blackblade's power and toughness are each equal to the number of lands you control." };
    expect(classifyCard(dak)).toBe("native-static");
    const perm = mk(dak);
    const s = stateWith({ userBf: [perm, mk(FOREST), mk(SWAMP), mk(FOREST)] });
    expect(permanentPower(s, perm.id)).toBe(3);
    expect(permanentToughness(s, perm.id)).toBe(3);
  });
});
