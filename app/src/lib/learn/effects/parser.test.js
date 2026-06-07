/**
 * Tests for effects/parser.js — the EffectProgram shape + the confidence boundary.
 *
 * This is the highest-value test file in P2.2: the MUST_DROP_TO_LOW corpus pins
 * the fail-safe so a future parser change can't silently widen "high" and start
 * resolving the WRONG behavior (the #1 Phase-2 risk). Widening "high" must edit
 * this corpus deliberately.
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence, KNOWN_ATOM_OPS } from "./parser.js";

const I = (oracle) => ({ type: "Instant", oracle });

describe("parseEffectProgram — high-confidence (the modeled patterns)", () => {
  it("parses burn to any target", () => {
    const p = parseEffectProgram(I("Lightning Bolt deals 3 damage to any target."));
    expect(p).toMatchObject({ structure: "sequence", confidence: "high", atoms: [{ op: "deal-damage", amount: 3, targetType: "any" }] });
    expect(programConfidence(p)).toBe("high");
  });
  it("parses damage to creature / player / each opponent", () => {
    expect(parseEffectProgram(I("Deals 2 damage to target creature.")).atoms).toEqual([{ op: "deal-damage", amount: 2, targetType: "creature" }]);
    expect(parseEffectProgram(I("Deals 4 damage to target player.")).atoms).toEqual([{ op: "deal-damage", amount: 4, targetType: "player" }]);
    expect(parseEffectProgram(I("Deals 1 damage to each opponent.")).atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "eachOpponent" }]);
  });
  it("parses destroy target creature and draw N", () => {
    expect(parseEffectProgram(I("Destroy target creature.")).atoms).toEqual([{ op: "destroy", targetType: "creature" }]);
    expect(parseEffectProgram({ type: "Sorcery", oracle: "Draw two cards." }).atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
    expect(parseEffectProgram({ type: "Sorcery", oracle: "Draw a card." }).atoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
  });
  it("parses pump (Giant Growth family), positive and negative, only with 'until end of turn'", () => {
    expect(parseEffectProgram(I("Target creature gets +3/+3 until end of turn.")).atoms)
      .toEqual([{ op: "pump", ptDelta: { p: 3, t: 3 }, targetType: "creature", duration: "endOfTurn" }]);
    expect(parseEffectProgram(I("Target creature gets -2/-2 until end of turn.")).atoms)
      .toEqual([{ op: "pump", ptDelta: { p: -2, t: -2 }, targetType: "creature", duration: "endOfTurn" }]);
    // No "until end of turn" → not the modeled pump shape → low (Arbiter).
    expect(programConfidence(parseEffectProgram(I("Target creature gets +1/+1.")))).toBe("low");
  });
  it("tolerates reminder text in parens (stripped before the clean-clause check)", () => {
    const p = parseEffectProgram(I("Draw two cards (this clause is reminder text)."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
  });
  it("rates a MODELED creature-target restriction HIGH (controller / tapped / power) — P2.4", () => {
    expect(programConfidence(parseEffectProgram(I("Destroy target creature an opponent controls.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Destroy target creature you control.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Destroy target tapped creature.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Destroy target untapped creature.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Destroy target creature with power 4 or greater.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Deals 3 damage to target creature an opponent controls.")))).toBe("high");
    // P2.5: the modeled restriction now rides ON the atom (so multi-clause targeting
    // can bind per-clause restrictions), not re-derived from the whole card.
    expect(parseEffectProgram(I("Destroy target tapped creature.")).atoms)
      .toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "tapped", value: true }] }]);
    expect(parseEffectProgram(I("Destroy target creature an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

// P2.5 — MULTI-CLAUSE: an oracle that splits into clauses each parsing to a known
// atom rates HIGH as an ordered multi-atom program (the ALLOWLIST: every clause
// fully accounted for). These FLIPPED from low→high vs P2.2's single-clause gate.
describe("parseEffectProgram — multi-clause sequences (P2.5)", () => {
  it("parses a two-clause sequence (damage a creature, then draw)", () => {
    const p = parseEffectProgram(I("Deal 2 damage to target creature. Draw a card."));
    expect(p.confidence).toBe("high");
    expect(p.structure).toBe("sequence");
    expect(p.atoms).toEqual([
      { op: "deal-damage", amount: 2, targetType: "creature" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("splits on a semicolon too", () => {
    const p = parseEffectProgram(I("Draw a card; draw a card."));
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "draw", amount: 1, targetType: null },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("splits a top-level 'and' joining two MODELED clauses", () => {
    const p = parseEffectProgram(I("Destroy target creature and draw two cards."));
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "destroy", targetType: "creature" },
      { op: "draw", amount: 2, targetType: null },
    ]);
  });
  it("ALL-OR-NOTHING: a multi-clause program with ANY unmodeled clause stays low + zero atoms", () => {
    // clause 1 (damage) is modeled; clause 2 (counter) is not (no atom yet) → whole low.
    const p = parseEffectProgram(I("Deal 2 damage to target creature. Counter target spell."));
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
});

// P2.5 — MODAL "Choose one —": each mode is a sub-program; HIGH iff every mode
// parses fully. Supports EXACTLY-ONE modal only (choose two / up-to / both → low).
describe("parseEffectProgram — modal 'Choose one —' (P2.5)", () => {
  it("parses a 'Choose one —' with two modeled modes (bullet form)", () => {
    const p = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    expect(p.confidence).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal.modes.map(m => m.atoms)).toEqual([
      [{ op: "destroy", targetType: "creature" }],
      [{ op: "draw", amount: 2, targetType: null }],
    ]);
  });
  it("parses the '; or ' / ' or ' separator form", () => {
    const p = parseEffectProgram(I("Choose one — Draw two cards; or destroy target creature."));
    expect(p.confidence).toBe("high");
    expect(p.modal.modes).toHaveLength(2);
    expect(p.modal.modes[0].atoms[0].op).toBe("draw");
    expect(p.modal.modes[1].atoms[0].op).toBe("destroy");
  });
  it("ALL-OR-NOTHING across modes: an unmodeled mode forces the whole modal low", () => {
    // mode 2 ("exile target creature") has no atom yet → whole modal low, zero atoms.
    const p = parseEffectProgram(I("Choose one —\n• Draw a card.\n• Exile target creature."));
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
});

describe("parseEffectProgram — null only for non-spells", () => {
  it("returns null for permanents and for cards with no oracle text", () => {
    expect(parseEffectProgram({ type: "Creature — Bear", oracle: "When this enters, draw a card." })).toBeNull();
    expect(parseEffectProgram({ type: "Artifact", oracle: "{T}: Add {C}." })).toBeNull();
    expect(parseEffectProgram(I(""))).toBeNull();
    expect(parseEffectProgram({ type: "Sorcery", oracle: "" })).toBeNull();
  });
});

// THE FAIL-SAFE GATE. Every near-miss / unmodeled instant-or-sorcery MUST drop to
// a low-confidence, ZERO-atom program (→ Arbiter seam). Crucially this includes
// oracles the LOOSE legacy regexes over-match (e.g. "destroy target creature
// unless …", which legacy parses as a plain destroy) — the clean-clause gate
// catches the rider so the interpreter never resolves the wrong thing.
const MUST_DROP_TO_LOW = [
  "Counter target spell.",
  "Destroy target creature unless its controller pays {2}.",   // legacy over-matches → MUST drop
  "Destroy target nonblack creature.",                          // unmodeled COLOR restriction → MUST drop
  "Destroy target artifact.",
  "Destroy all creatures.",
  "Return target creature to its owner's hand.",
  "Exile target creature.",
  "Create a 1/1 white Soldier creature token.",
  "Each player draws a card.",
  "Target player discards a card at random.",
  "Scry 2, then draw a card.",
  "Deal damage to target creature equal to the number of Mountains you control.",
  // Modal that should stay low: "choose two" (multi-mode pick deferred), and a
  // modal with an unmodeled mode (exile not an atom yet).
  "Choose two —\n• Draw a card.\n• Destroy target creature.",
  "Choose one —\n• Draw a card.\n• Exile target creature.",
  // P2.5 SPLITS on " and " — but a clause whose SECOND half is unmodeled (gain/lose
  // life, counter, discard, a verbless damage fragment, a comma-rider) still drops
  // the WHOLE program (all-or-nothing). These are the false-high vectors P2.2 guarded
  // with a denylist; P2.5 keeps them low because a split clause fails to parse.
  "Lightning Helix deals 3 damage to any target and you gain 3 life.",   // gain-life atom is P2.7 → low
  "Char deals 4 damage to any target and 2 damage to you.",              // "2 damage to you" has no verb → low
  "You draw two cards and lose 2 life.",                                 // lose-life atom is P2.7 → low
  "Counter target spell and draw a card.",                               // counter-spell atom is P2.6 → low
  "Destroy target artifact and draw a card.",                            // "destroy target artifact" not modeled → low
  "Deals 2 damage to target creature and 2 damage to target player.",    // 2nd clause verbless → low
  "Draw two cards, discard a card.",                                     // comma-rider (NOT split) → low
  "Deal 2 damage to target creature. Counter target spell.",             // multi-clause, 2nd unmodeled → low
  // Unmodeled target restrictions — HIGH would permit an illegal target. P2.4 models
  // controller/tapped/power; attacking/blocking/color/type stay unmodeled → Arbiter.
  "Destroy target attacking creature.",
  "Deals 4 damage to target attacking or blocking creature.",
  "Destroy target enchantment creature.",                                 // unmodeled type restriction
  // MIXED — a MODELED restriction next to an UNMODELED one must still drop to low
  // (the residue allowlist rejects the leftover qualifier).
  "Destroy target tapped creature an opponent controls that's attacking.", // tapped+controller modeled, "attacking" not
  "Destroy target creature you control with flying.",                      // controller modeled, "with flying" not
  "Destroy target creature an opponent controls with mana value 3 or less.", // controller modeled, "mana value" not
  "Destroy target creature with the greatest power.",                       // non-numeric power phrase → not modeled
  // Pump with a keyword-grant rider — the "+X/+Y" matches but the granted keyword
  // would be silently dropped, so it must NOT rate HIGH.
  "Target creature gets +2/+2 until end of turn with trample.",
  // ── P2.5 adversarial-review catches (REAL Scryfall false-highs the multi-clause
  // pass surfaced; pinned so a future parser change can't re-leak them) ──
  "Seismic Shudder deals 1 damage to each creature without flying.",            // qualified mass damage (not all creatures)
  "Blazing Volley deals 1 damage to each creature your opponents control.",     // qualified mass damage
  "Simoon deals 1 damage to each creature target opponent controls.",           // qualified — must NOT mis-route to "target player"
  "Shadowstorm deals 2 damage to each creature with shadow.",                   // qualified mass damage
  "Pyroclasm deals 3 damage to each creature an opponent controls.",            // qualified — only bare "each creature" is modeled
  "Target creature gets +1/+1 until end of turn. Another target creature gets -1/-1 until end of turn.", // "another" = distinct target, unmodeled
  "Target creature gets +2/+2 until end of turn. Up to one other target creature gets +1/+1 until end of turn.", // "up to" + "other"
  "Dual Shot deals 1 damage to each of up to two target creatures.",            // "each of up to two" cardinality
  "Tiered (Choose one additional cost.)\n• Thunder — {0} — Thunder Magic deals 2 damage to target creature.\n• Thundara — {3} — Thunder Magic deals 4 damage to target creature.", // bulleted NON-modal (tiers) → not a 2-damage sequence
  "Two target players each draw a card.",                                       // draw, but a DIFFERENT subject draws — not the controller
  "Target creature gets +2/+0 until end of turn. Draw a card at the beginning of the next turn's upkeep.", // DELAYED draw rider
  "Strangle deals 3 damage to target creature or planeswalker.",                // "or planeswalker" must NOT become "any" (illegal player target)
  "Wither (This deals damage to creatures in the form of -1/-1 counters.)\nGut Punch deals 3 damage to any target.", // wither changes the damage TYPE
];

describe("parseEffectProgram — MUST drop to low (the CI merge gate)", () => {
  it.each(MUST_DROP_TO_LOW)("low confidence + zero atoms: %s", (oracle) => {
    const p = parseEffectProgram(I(oracle));
    expect(p).not.toBeNull();             // it IS a program (an instant with text)
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);      // all-or-nothing: ZERO atoms run
  });
});

// The other side of the gate — oracles the P2.5 adversarial review CONFIRMED are
// legitimately HIGH. Pinned so a future tightening can't over-correct and drop them.
const MUST_STAY_HIGH = [
  "Pyroclasm deals 2 damage to each creature.",                                 // BARE "each creature" IS modeled
  "Lightning Bolt deals 3 damage to any target.",
  "Stoke the Flames deals 4 damage to any target.",                             // a Convoke COST reminder doesn't change the effect
  "Convoke (Your creatures can help cast this.) Destroy target creature.",       // keyword-cost reminder stripped → bare destroy
  "Target creature gets -3/-0 until end of turn. Target creature gets -0/-3 until end of turn.", // Agony Warp: two "target creature" (no "another") = legal
  "Ember Shot deals 3 damage to any target. Draw a card.",                      // damage + draw multi-clause
  "Target creature gets +1/+0 until end of turn. Draw a card.",                 // pump + draw (Defiant Strike)
];

describe("parseEffectProgram — review-confirmed HIGH (must NOT over-correct)", () => {
  it.each(MUST_STAY_HIGH)("stays high: %s", (oracle) => {
    expect(programConfidence(parseEffectProgram(I(oracle)))).toBe("high");
  });
});

describe("programConfidence — pure shape function", () => {
  it("is low for an absent/empty program; high only when every atom is a known op", () => {
    expect(programConfidence(null)).toBe("low");
    expect(programConfidence({ atoms: [] })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "draw" }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }, { op: "counter-spell" }] })).toBe("low"); // one unknown → low
    KNOWN_ATOM_OPS.forEach((op) => expect(programConfidence({ atoms: [{ op }] })).toBe("high"));
  });
});
