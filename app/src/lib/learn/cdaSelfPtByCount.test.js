/**
 * CDA-SELF-P/T-BY-COUNT — characteristic-defining abilities that SET a creature's power and toughness to a
 * LIVE board count: "[this creature]'s power and toughness are each equal to the number of <X> you control"
 * (CR 613.4a / 604.3 — a CDA applies in layer 7a, is never on the stack, and is re-evaluated continuously).
 *
 * The subsystem (this slice):
 *   • PARSER (staticAbilityParser.parseClause) — emits a layer-7a { layerOp:"ptSetDynamicCount", countSpec,
 *     setPower, setToughness } descriptor when the count source is one parseSelfCountSource models (lands /
 *     creatures / artifacts / enchantments / a basic-land subtype). An unmodeled count → NO descriptor → the
 *     card stays body-only (CREED — a miss is safe; a fabricated base is forbidden).
 *   • LAYER ENGINE (layers.applyLayer7) — a new 7a sublayer reads the count via the SAME countSelfSpecOnBoard
 *     the 7c count-buff uses (a plain type-line board scan — recursion-safe, never deriveCharacteristics) and
 *     SETS the base, so the P/T tracks the board BOTH directions and counters/anthems (7c) add ON TOP.
 *   • SELF-REF NORMALIZATION (selfNormalizeOracle) — extended to the legendary short-name (pre-comma) and
 *     first-word forms (CR 201.4), with a TRIBE-WORD GUARD so a tribe name that is the card's own subtype
 *     ("Sliver" for Sliver Legion) is never mistaken for a self-reference.
 *
 * Cross-deck motivation (Toph deck): Lumra / Ashaya / Toph the Blind Bandit all carry this CDA but PARK on
 * unmodeled riders (see the PARK pins below). Clean corpus creatures (Dakkon, Molimo, Scion of the Wild, …)
 * flip native-static. Verified against Scryfall oracle text (scryfall.oracle.local.json).
 */
import { describe, expect, it, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall — scryfall.oracle.local.json) ───
const DAKKON = {
  id: "c-dakkon",
  name: "Dakkon Blackblade",
  type: "Legendary Creature — Human Warrior",
  power: "*",
  toughness: "*",
  mana: "{U}{B}{W}",
  oracle: "Dakkon Blackblade's power and toughness are each equal to the number of lands you control.",
};
// Short-name self-ref ("Molimo" for "Molimo, Maro-Sorcerer") + a covered keyword line.
const MOLIMO = {
  id: "c-molimo",
  name: "Molimo, Maro-Sorcerer",
  type: "Legendary Creature — Elemental Sorcerer",
  power: "*",
  toughness: "*",
  mana: "{5}{G}{G}",
  oracle: "Trample\nMolimo's power and toughness are each equal to the number of lands you control.",
};
const SCION = {
  id: "c-scion",
  name: "Scion of the Wild",
  type: "Creature — Avatar",
  power: "*",
  toughness: "*",
  mana: "{2}{G}",
  oracle: "Scion of the Wild's power and toughness are each equal to the number of creatures you control.",
};
const SQUELCHING_LEECHES = {
  id: "c-leech",
  name: "Squelching Leeches",
  type: "Creature — Leech",
  power: "*",
  toughness: "*",
  mana: "{3}{B}",
  oracle: "Squelching Leeches's power and toughness are each equal to the number of Swamps you control.",
};

const LAND = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", oracle: "Creatures you control get +1/+1." };

let _n = 0;
function mk(card, controller = "user") {
  return createPermanent({ id: `p-${card.name.replace(/\s+/g, "")}-${_n++}`, card: { ...card }, controller, summoningSick: false });
}
function stateWith({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION — clean CDA creatures flip native-static (auto, via staticAbilitiesCoverCard)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA-SELF-P/T-BY-COUNT classification", () => {
  it("Dakkon Blackblade (CDA only, lands) → native-static", () => {
    expect(classifyCard(DAKKON)).toBe("native-static");
    expect(isNativeTier(classifyCard(DAKKON))).toBe(true);
  });
  it("Molimo (short-name self-ref + Trample) → native-static", () => {
    expect(classifyCard(MOLIMO)).toBe("native-static");
  });
  it("Scion of the Wild (CDA only, creatures) → native-static", () => {
    expect(classifyCard(SCION)).toBe("native-static");
  });
  it("Squelching Leeches (CDA only, Swamps subtype) → native-static", () => {
    expect(classifyCard(SQUELCHING_LEECHES)).toBe("native-static");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// RUNTIME — the P/T genuinely TRACKS the live count, BOTH directions
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA lands-count P/T tracks the board (Dakkon)", () => {
  it("is 0/0 with no lands (printed * → base 0, count 0)", () => {
    const dak = mk(DAKKON);
    const s = stateWith({ userBf: [dak] });
    expect(permanentPower(s, dak.id)).toBe(0);
    expect(permanentToughness(s, dak.id)).toBe(0);
  });

  it("reads N/N for N lands and GROWS as a land enters (5 → 6)", () => {
    const dak = mk(DAKKON);
    const five = [dak, mk(LAND), mk(LAND), mk(LAND), mk(LAND), mk(LAND)];
    const s5 = stateWith({ userBf: five });
    expect(permanentPower(s5, dak.id)).toBe(5);
    expect(permanentToughness(s5, dak.id)).toBe(5);
    const s6 = stateWith({ userBf: [...five, mk(LAND)] });
    expect(permanentPower(s6, dak.id)).toBe(6); // a 6th land entered → grows
  });

  it("SHRINKS as a land leaves (5/5 → 3/3)", () => {
    const dak = mk(DAKKON);
    const s5 = stateWith({ userBf: [dak, mk(LAND), mk(LAND), mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s5, dak.id)).toBe(5);
    const s3 = stateWith({ userBf: [dak, mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s3, dak.id)).toBe(3); // two lands left → drops live
    expect(permanentToughness(s3, dak.id)).toBe(3);
  });

  it("only the CONTROLLER's lands count — an opponent's lands do NOT (0/0)", () => {
    const dak = mk(DAKKON);
    const s = stateWith({ userBf: [dak], aiBf: [mk(LAND, "ai"), mk(LAND, "ai"), mk(LAND, "ai")] });
    expect(permanentPower(s, dak.id)).toBe(0);
    expect(permanentToughness(s, dak.id)).toBe(0);
  });
});

describe("CDA creatures-count P/T tracks the board (Scion of the Wild)", () => {
  it("counts itself + other creatures (Scion alone = 1/1, +2 creatures = 3/3)", () => {
    const scion = mk(SCION);
    const alone = stateWith({ userBf: [scion] });
    expect(permanentPower(alone, scion.id)).toBe(1); // counts itself (a creature you control)
    const three = stateWith({ userBf: [scion, mk(BEAR), mk(BEAR)] });
    expect(permanentPower(three, scion.id)).toBe(3);
    expect(permanentToughness(three, scion.id)).toBe(3);
  });
});

describe("CDA basic-land-subtype P/T (Squelching Leeches counts only Swamps)", () => {
  it("counts Swamps, not other lands (2 Swamps + 3 Forests = 2/2)", () => {
    const leech = mk(SQUELCHING_LEECHES);
    const s = stateWith({ userBf: [leech, mk(SWAMP), mk(SWAMP), mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s, leech.id)).toBe(2); // only the two Swamps
    expect(permanentToughness(s, leech.id)).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// LAYER STACKING — the 7a CDA SET is the base; 7c counters + anthems add ON TOP (CR 613.4)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA stacks correctly with counters + anthems (layer 7a set → 7c modify)", () => {
  it("4 lands (set 4/4) + a +1/+1 counter = 5/5", () => {
    const dak = mk(DAKKON);
    dak.counters = { "+1/+1": 1 };
    const s = stateWith({ userBf: [dak, mk(LAND), mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s, dak.id)).toBe(5);
    expect(permanentToughness(s, dak.id)).toBe(5);
  });

  it("4 lands (set 4/4) + Glorious Anthem (+1/+1) = 5/5", () => {
    const dak = mk(DAKKON);
    const s = stateWith({ userBf: [dak, mk(ANTHEM), mk(LAND), mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s, dak.id)).toBe(5);
    expect(permanentToughness(s, dak.id)).toBe(5);
  });

  it("a -1/-1 counter reduces below the set value (3 lands set 3/3, -1/-1 → 2/2)", () => {
    const dak = mk(DAKKON);
    dak.counters = { "-1/-1": 1 };
    const s = stateWith({ userBf: [dak, mk(LAND), mk(LAND), mk(LAND)] });
    expect(permanentPower(s, dak.id)).toBe(2);
    expect(permanentToughness(s, dak.id)).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// CREED anti-FP — a ridered count-CDA card stays LOW; an unmodeled count source never flips
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("CDA-SELF-P/T-BY-COUNT CREED anti-FP", () => {
  // ✅ INVERTED 2026-08-01 — "Lumra (CDA + an unmodeled ETB mill/reanimate) stays body-only" lived here.
  // The pin was right when written and the reason has since expired: its ETB is "mill four cards. Then
  // return all land cards from your graveyard to the battlefield tapped", and the mass graveyard→battlefield
  // return is now BUILT (CR 608 — see effects/atoms/massReanimate.test.js). Lumra is native-mixed, and it is
  // the card that takes the Earth Bent deck across the 90% shelf bar.
  //
  // ⛔ WHAT THIS BLOCK IS REALLY GUARDING IS UNCHANGED and is still covered by the two cases below: a CDA
  // card with a genuinely unmodeled rider must not flip on the CDA alone. Ashaya (the "are Forest lands"
  // type static) and Toph (a different count metric + earthbend) both still park, so the anti-FP property
  // keeps a live witness — which is why no replacement fixture is invented for Lumra's slot.
  it("Lumra now flips — its CDA was never the blocker; the ETB mass reanimate was", () => {
    const lumra = {
      name: "Lumra, Bellow of the Woods",
      type: "Legendary Creature — Elemental Bear",
      power: "*", toughness: "*", mana: "{4}{G}{G}",
      oracle: "Vigilance, reach\nLumra's power and toughness are each equal to the number of lands you control.\nWhen Lumra enters, mill four cards. Then return all land cards from your graveyard to the battlefield tapped.",
    };
    expect(isNativeTier(classifyCard(lumra))).toBe(true);
  });

  it("Ashaya (CDA + an unmodeled 'are Forest lands' type static) stays body-only", () => {
    const ashaya = {
      name: "Ashaya, Soul of the Wild",
      type: "Legendary Creature — Elemental",
      power: "*", toughness: "*", mana: "{4}{G}",
      oracle: "Ashaya's power and toughness are each equal to the number of lands you control.\nNontoken creatures you control are Forest lands in addition to their other types.",
    };
    expect(classifyCard(ashaya)).not.toBe("native-static");
  });

  it("Toph (POWER-only CDA + a different metric '+1/+1 counters on lands' + earthbend ETB) stays body-only", () => {
    const toph = {
      name: "Toph, the Blind Bandit",
      type: "Legendary Creature — Human Warrior Ally",
      power: "*", toughness: "3", mana: "{1}{G}{W}",
      oracle: "When Toph enters, earthbend 2.\nToph's power is equal to the number of +1/+1 counters on lands you control.",
    };
    expect(classifyCard(toph)).not.toBe("native-static");
  });

  it("an ADDED unmodeled rider de-natives an otherwise-clean CDA (all-or-nothing residue)", () => {
    const ridered = {
      ...DAKKON,
      oracle: DAKKON.oracle + "\nWhenever you cast a spell, draw two cards and gain a billion life.",
    };
    expect(classifyCard(ridered)).not.toBe("native-static");
  });

  it("an UNMODELED count source ('Spirits you control') emits NO CDA → stays body-only", () => {
    const spirits = {
      name: "Faux Spirit Lord",
      type: "Creature — Spirit",
      power: "*", toughness: "*", mana: "{2}{W}",
      oracle: "Faux Spirit Lord's power and toughness are each equal to the number of Spirits you control.",
    };
    expect(classifyCard(spirits)).not.toBe("native-static");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// REGRESSION GUARD — the short/first-word self-ref must NOT shred a tribal lord's own subtype
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("TRIBE-WORD GUARD (Sliver lords keep their anthem)", () => {
  it("Sliver Legion ('All Sliver creatures get +1/+1 for each other Sliver …') stays native-static", () => {
    const legion = {
      name: "Sliver Legion",
      type: "Legendary Creature — Sliver",
      power: 7, toughness: 7, mana: "{W}{U}{B}{R}{G}",
      oracle: "All Sliver creatures get +1/+1 for each other Sliver on the battlefield.",
    };
    // First word "Sliver" is the card's own subtype → NOT rewritten to "this creature" (would shred the anthem).
    expect(classifyCard(legion)).toBe("native-static");
  });

  it("Sliver Hivelord ('Sliver creatures you control have indestructible') stays native-static", () => {
    const hive = {
      name: "Sliver Hivelord",
      type: "Legendary Creature — Sliver",
      power: 5, toughness: 5, mana: "{W}{U}{B}{R}{G}",
      oracle: "Sliver creatures you control have indestructible.",
    };
    expect(classifyCard(hive)).toBe("native-static");
  });
});
