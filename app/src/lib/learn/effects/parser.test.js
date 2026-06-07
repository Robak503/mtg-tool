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
    // mode 2 ("counter target spell") has no atom yet → whole modal low, zero atoms.
    const p = parseEffectProgram(I("Choose one —\n• Draw a card.\n• Counter target spell."));
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
});

// P2-X — X SPELLS: an {X}-cost spell whose amount is the chosen X. The parser stamps
// `amountX` on the damage/draw/pump atom (dropping the numeric amount) and flags
// `program.xSpell`; the resolver substitutes ctx.xValue. Only triggers when the card's
// mana cost carries {X} — the literal "X" is otherwise unmodeled → low.
describe("parseEffectProgram — X spells (cost has {X})", () => {
  const IX = (oracle, mana = "{X}{R}") => ({ type: "Instant", oracle, mana });
  const SX = (oracle, mana = "{X}{U}") => ({ type: "Sorcery", oracle, mana });

  it("parses an X-burn (deals X damage to any target) → amountX atom + xSpell, no numeric amount", () => {
    const p = parseEffectProgram(IX("Blaze deals X damage to any target."));
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "deal-damage", targetType: "any", amountX: true }]);
    expect(p.atoms[0].amount).toBeUndefined();
  });
  it("parses draw X cards", () => {
    const p = parseEffectProgram(SX("Draw X cards."));
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "draw", targetType: null, amountX: true }]);
  });
  it("parses +X/+X pump (drops ptDelta; resolver reads X)", () => {
    const p = parseEffectProgram(IX("Target creature gets +X/+X until end of turn.", "{X}{G}"));
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "pump", targetType: "creature", duration: "endOfTurn", amountX: true }]);
    expect(p.atoms[0].ptDelta).toBeUndefined();
  });
  it("carries an X-damage restriction (deals X damage to target creature an opponent controls)", () => {
    const p = parseEffectProgram(IX("Comet deals X damage to target creature an opponent controls."));
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", targetType: "creature", amountX: true, restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
  it("mixes an X clause with a fixed clause (X-burn a creature, then draw a card)", () => {
    const p = parseEffectProgram(IX("Blaze deals X damage to target creature. Draw a card."));
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([
      { op: "deal-damage", targetType: "creature", amountX: true },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("does NOT treat X as an amount without an {X} cost (literal X → unmodeled → low)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Blaze deals X damage to any target.", mana: "{1}{R}" });
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });

  it("parses a modal X-spell (Invoke the Firemind: Choose one — Draw X / deal X)", () => {
    const p = parseEffectProgram(IX("Choose one —\n• Draw X cards.\n• Invoke the Firemind deals X damage to any target.", "{X}{U}{U}{R}"));
    expect(p.confidence).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.xSpell).toBe(true);
    expect(p.modal.modes.map(m => m.atoms)).toEqual([
      [{ op: "draw", targetType: null, amountX: true }],
      [{ op: "deal-damage", targetType: "any", amountX: true }],
    ]);
  });

  // Real Scryfall X-spells the adversarial corpus sweep confirmed are legitimately
  // HIGH — pinned so a future tightening can't over-correct and drop them to low.
  it.each([
    ["Blaze deals X damage to any target.", "{X}{R}"],
    ["Heat Ray deals X damage to target creature.", "{X}{R}"],
    ["Volcanic Geyser deals X damage to any target.", "{X}{R}{R}"],
    ["Savage Twister deals X damage to each creature.", "{X}{R}{G}"],          // bare "each creature" mass X
    ["Draw X cards.", "{X}{U}{U}"],                                            // Mind Spring
    ["Target creature gets +X/+X until end of turn.", "{X}{G}"],              // Untamed Might
    ["Buyback {3} (reminder text here)\nFanning the Flames deals X damage to any target.", "{X}{R}{R}"], // Buyback reminder stripped → default cast is the bare burn
  ])("review-confirmed HIGH (X corpus): %s", (oracle, mana) => {
    expect(programConfidence(parseEffectProgram(IX(oracle, mana)))).toBe("high");
  });

  // MUST DROP — near-misses that have an {X} cost but still aren't fully modeled.
  it.each([
    "Fireball deals X damage divided evenly, rounded down, among any number of targets.", // "divided" rider
    "Comet deals X damage to any target. You gain X life.",        // gain-life atom not modeled (P2.7)
    "Demonfire deals X damage to target creature with power X or less.", // residual non-amount X
    "Exile the top X cards of your library.",                       // exile/mill not modeled
    "Draw X cards. You lose X life.",                               // lose-life not modeled
    "Hydroid deals X damage to each creature your opponents control.", // qualified mass damage (not bare "each creature")
  ])("MUST drop to low (X near-miss): %s", (oracle) => {
    const p = parseEffectProgram(IX(oracle));
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

// P2.7 — LIFE atoms (gain-life / lose-life), non-targeted. Anchored ^…$ matchers,
// so the clause must reduce EXACTLY to the shape. These light up the multi-clause
// RIDERS that were stuck at low (Lightning Helix, Night's Whisper).
describe("parseEffectProgram — life atoms (P2.7)", () => {
  it("recognizes controller gain/lose life and each-opponent life loss", () => {
    expect(parseEffectProgram(I("You gain 3 life.")).atoms).toEqual([{ op: "gain-life", amount: 3, targetType: null }]);
    expect(parseEffectProgram(I("You lose 2 life.")).atoms).toEqual([{ op: "lose-life", amount: 2, who: "controller", targetType: null }]);
    expect(parseEffectProgram(I("Each opponent loses 2 life.")).atoms).toEqual([{ op: "lose-life", amount: 2, who: "eachOpponent", targetType: null }]);
  });
  it("FLIPS the multi-clause life riders to high", () => {
    expect(parseEffectProgram(I("Lightning Helix deals 3 damage to any target and you gain 3 life.")).atoms.map(a => a.op)).toEqual(["deal-damage", "gain-life"]);
    expect(parseEffectProgram(I("You draw two cards and lose 2 life.")).atoms.map(a => a.op)).toEqual(["draw", "lose-life"]);
  });
  it("keeps wrong-subject / dynamic life low (anchored allowlist holds)", () => {
    // a DIFFERENT player gains/loses, or a dynamic amount — not the bare controller form.
    expect(programConfidence(parseEffectProgram(I("Target player loses 2 life.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Target player draws two cards and loses 2 life.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("You gain life equal to the number of creatures you control.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("You gain 2 life for each creature you control.")))).toBe("low");
  });
});

// P2.7 — TARGETED atoms (tap / untap / bounce / exile / add-counter) on a bare
// "target creature". Anchored ^…$ matchers keep them EXACT — any restriction or a
// non-creature target fails the anchor → low → Arbiter.
describe("parseEffectProgram — targeted atoms (P2.7)", () => {
  it("recognizes tap/untap/bounce/exile/counter on target creature", () => {
    expect(parseEffectProgram(I("Tap target creature.")).atoms).toEqual([{ op: "tap", targetType: "creature" }]);
    expect(parseEffectProgram(I("Untap target creature.")).atoms).toEqual([{ op: "untap", targetType: "creature" }]);
    expect(parseEffectProgram(I("Exile target creature.")).atoms).toEqual([{ op: "exile", targetType: "creature" }]);
    expect(parseEffectProgram(I("Return target creature to its owner's hand.")).atoms).toEqual([{ op: "bounce", targetType: "creature" }]);
    expect(parseEffectProgram(I("Put a +1/+1 counter on target creature.")).atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature" }]);
    expect(parseEffectProgram(I("Put two -1/-1 counters on target creature.")).atoms).toEqual([{ op: "add-counter", counterType: "-1/-1", amount: 2, targetType: "creature" }]);
  });
  it("keeps RESTRICTED / non-creature variants low (anchor exact)", () => {
    expect(programConfidence(parseEffectProgram(I("Exile target creature you control.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Tap target artifact.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Exile target nonland permanent.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Return target nonland permanent to its owner's hand.")))).toBe("low");
  });
});

// P2.6 — CREATE-TOKEN. Single-color creature tokens; a keyword rider / non-creature
// token / multi-color "and" list (clause-splitter splits "and") stays low.
describe("parseEffectProgram — create-token (P2.6)", () => {
  it("recognizes single-color creature tokens (count, P/T)", () => {
    expect(parseEffectProgram(I("Create a 1/1 white Soldier creature token.")).atoms)
      .toEqual([{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier", targetType: null }]);
    expect(parseEffectProgram(I("Create two 2/2 green Bear creature tokens.")).atoms[0])
      .toMatchObject({ op: "create-token", count: 2, power: 2, toughness: 2 });
  });
  it("keeps keyword-rider / non-creature tokens low", () => {
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 white Soldier creature token with flying.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Create a Treasure token.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Create a 2/2 black Zombie creature token tapped.")))).toBe("low");
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
  "Each player draws a card.",
  "Target player discards a card at random.",
  "Scry 2, then draw a card.",
  "Deal damage to target creature equal to the number of Mountains you control.",
  // Modal that should stay low: "choose two" (multi-mode pick deferred), and a
  // modal with an unmodeled mode (counter-spell not an atom yet).
  "Choose two —\n• Draw a card.\n• Destroy target creature.",
  "Choose one —\n• Draw a card.\n• Counter target spell.",
  // P2.5 SPLITS on " and " — but a clause whose SECOND half is unmodeled (gain/lose
  // life, counter, discard, a verbless damage fragment, a comma-rider) still drops
  // the WHOLE program (all-or-nothing). These are the false-high vectors P2.2 guarded
  // with a denylist; P2.5 keeps them low because a split clause fails to parse.
  "Char deals 4 damage to any target and 2 damage to you.",              // "2 damage to you" has no verb → low
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
