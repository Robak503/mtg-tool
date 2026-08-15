/**
 * Tests for effects/parser.js — the EffectProgram shape + the confidence boundary.
 *
 * This is the highest-value test file in P2.2: the MUST_DROP_TO_LOW corpus pins
 * the fail-safe so a future parser change can't silently widen "high" and start
 * resolving the WRONG behavior (the #1 Phase-2 risk). Widening "high" must edit
 * this corpus deliberately.
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, parseEffectClause, programConfidence, programContainsCounter, programContainsTeamPump, programNeedsChosenTarget, KNOWN_ATOM_OPS } from "./parser.js";

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
    // clause 1 (damage) is modeled; clause 2 (bare half-library mill, NO stated rounding — deliberately
    // unmatched, see millClauseParser) is not → whole low. (The fixed-amount targeted mill that held this
    // slot went native in BLITZ TM-1.)
    const p = parseEffectProgram(I("Deal 2 damage to target creature. Target player mills half their library."));
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
    // mode 2 (bare half-library mill, no rounding — deliberately unmatched) → whole modal low, zero atoms.
    const p = parseEffectProgram(I("Choose one —\n• Draw a card.\n• Target player mills half their library."));
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
  it("keeps wrong-subject / unmodeled-dynamic life low (anchored allowlist holds)", () => {
    // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" is now MODELED (HIGH, enemy-side like
    // damage). A COMPOUND whose OTHER half is unmodeled (the bare "loses 2 life" sub-clause, no subject) still
    // drops the whole program to low (all-or-nothing).
    expect(programConfidence(parseEffectProgram(I("Target player loses 2 life.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Target player draws three cards, loses 3 life, and gets three poison counters.")))).toBe("low"); // poison + comma-chain (bare "draws N and loses M life" is now native: DRAW-LOSE-SUBJECT)
    // NOTE: a CONTROLLER count-scaled life ("for each creature you control" / "equal to the number of …")
    // is now MODELED by FOR-EACH (WALT-FOR-EACH) → HIGH (pinned there). A count source we DON'T model still
    // stays low:
    expect(programConfidence(parseEffectProgram(I("You gain 2 life for each creature an opponent controls.")))).toBe("low"); // opponent-scoped
  });
});

// ===== EACH-PLAYER ===== draw — the actor extends beyond the controller to every player /
// a chosen player. Anchored allowlist: a rider / variable count / trailing text stays low.
describe("parseEffectProgram — each-player / target-player draw", () => {
  it("recognizes each-player and target-player draw with the right who/targetType", () => {
    expect(parseEffectProgram(I("Each player draws two cards.")).atoms).toEqual([{ op: "draw", amount: 2, who: "eachPlayer", targetType: null }]);
    expect(parseEffectProgram(I("Target player draws four cards.")).atoms).toEqual([{ op: "draw", amount: 4, who: "target", targetType: "player" }]);
    expect(parseEffectProgram(I("Target player draws a card.")).atoms).toEqual([{ op: "draw", amount: 1, who: "target", targetType: "player" }]);
    // the controller-only legacy form is unchanged (no `who`, non-targeted).
    expect(parseEffectProgram(I("Draw two cards.")).atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
  });
  it("only a target-player draw needs a chosen target; each-player does not", () => {
    expect(programNeedsChosenTarget(parseEffectProgram(I("Target player draws four cards.")))).toBe(true);
    expect(programNeedsChosenTarget(parseEffectProgram(I("Each player draws two cards.")))).toBe(false);
  });
  it("keeps riders / variable / dynamic counts low (anchored allowlist holds)", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram(I(o)))).toBe("low");
    low("Target player draws three cards, loses 3 life, and gets three poison counters."); // Caress — poison + comma-chain (bare "draws N and loses M life" now native: DRAW-LOSE-SUBJECT)
    low("Target player draws X cards.");                          // Stroke of Genius — variable count
    low("Each player draws X cards.");                            // Prosperity — variable count
    low("Each player draws a card for each creature card in their graveyard."); // dynamic count
    low("Target player draws three cards, then discards three cards."); // bare "discards N" rider doesn't carry the subject → Arbiter
  });
});

// ===== EACH-PLAYER ===== discard (EP-2) — "target/each player discards N cards" (the DISCARDING player
// chooses which cards, CR 701.8). Anchored allowlist: a bare numeric count only. "at random" (RNG, no
// choice), X, "their hand", "half", the "target opponent" form (deferred — 0 clean cards this slice, all
// have riders), or any unmodeled rider fails → low → Arbiter. Composes HIGH when every clause is modeled.
describe("parseEffectProgram — each-player / target-player discard (EP-2)", () => {
  it("recognizes target-player and each-player discard with the right who/targetType", () => {
    expect(parseEffectProgram(I("Target player discards two cards.")).atoms).toEqual([{ op: "discard", amount: 2, who: "target", targetType: "player" }]);
    expect(parseEffectProgram(I("Target player discards a card.")).atoms).toEqual([{ op: "discard", amount: 1, who: "target", targetType: "player" }]);
    expect(parseEffectProgram(I("Each player discards three cards.")).atoms).toEqual([{ op: "discard", amount: 3, who: "eachPlayer", targetType: null }]);
  });
  it("only a target-player discard needs a chosen target; each-player does not", () => {
    expect(programNeedsChosenTarget(parseEffectProgram(I("Target player discards two cards.")))).toBe(true);
    expect(programNeedsChosenTarget(parseEffectProgram(I("Each player discards three cards.")))).toBe(false);
  });
  it("composes with other modeled atoms (Fill with Fright = discard + scry; Unhinge = discard + draw)", () => {
    expect(programConfidence(parseEffectProgram(I("Target player discards two cards. Scry 2.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Target player discards a card. Draw a card.")))).toBe("high");
  });
  it("keeps X-at-random / their-hand / half / riders low (anchored allowlist holds)", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram(I(o)))).toBe("low");
    // NOTE: fixed-N "at random" ("Target player discards two cards at random." — Hymn to Tourach) is now
    // MODELED (RD-1 — the seeded random discard); its positive pins live in randomDiscard.test.js.
    low("Target player discards X cards at random.");                            // Mind Twist — variable X (still unmodeled) + RNG
    low("Target player discards their hand unless they pay 7 life.");            // Tyrannize — unless-pay (bare "discards their hand" now native: DISCARD-HAND)
    low("Target opponent discards half the cards in their hand, rounded up.");   // Rush of Dread — dynamic count
    low("Target opponent discards two cards, mills a card, and loses 1 life.");  // Mind Drain — unmodeled riders
    low("Each player discards a card, then loses 1 life.");                      // Strongarm-ish — life rider
    // NOTE: bare "Target opponent discards N cards." now parses HIGH (TARGET-OPPONENT discard slice) — its
    // positive pin lives in discardOpponentCantBlock.test.js; the rider forms (294/295 above) still drop.
    // NOTE: Windfall ("… draws cards equal to the greatest number of cards a player discarded this way") now parses
    // HIGH via the WINDFALL max-discard matcher — its positive pin lives in wheelDiscardHand.test.js / windfall.test.js.
  });
});

// P2.7 — TARGETED atoms (tap / untap / bounce / exile / add-counter) on a bare
// "target creature". Anchored ^…$ matchers keep them EXACT — any restriction or a
// non-creature target fails the anchor → low → Arbiter.
describe("parseEffectProgram — targeted atoms (P2.7)", () => {
  it("recognizes tap/untap/bounce/exile/counter on target creature", () => {
    expect(parseEffectProgram(I("Tap target creature.")).atoms).toEqual([{ op: "tap", targetType: "creature", restrictions: [] }]);
    expect(parseEffectProgram(I("Untap target creature.")).atoms).toEqual([{ op: "untap", targetType: "creature" }]);
    expect(parseEffectProgram(I("Exile target creature.")).atoms).toEqual([{ op: "exile", targetType: "creature" }]);
    expect(parseEffectProgram(I("Return target creature to its owner's hand.")).atoms).toEqual([{ op: "bounce", targetType: "creature" }]);
    expect(parseEffectProgram(I("Put a +1/+1 counter on target creature.")).atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature" }]);
    expect(parseEffectProgram(I("Put two -1/-1 counters on target creature.")).atoms).toEqual([{ op: "add-counter", counterType: "-1/-1", amount: 2, targetType: "creature" }]);
  });
  it("TAP-FREEZE (TP-1): the two-sentence up-to-two tap + no-untap rider folds onto ONE atom; a tail sentence still splits", () => {
    // Frost Breath / Decision Paralysis — both printed possessives normalize to the same folded form.
    expect(parseEffectProgram(I("Tap up to two target creatures. Those creatures don't untap during their controller's next untap step.")).atoms)
      .toEqual([{ op: "tap", targetType: "creature", restrictions: [], maxTargets: 2, minTargets: 0, noUntapNext: true }]);
    // Sudden Storm — the plural-possessive variant + a trailing "Scry 1." keeps its own clause (the fold's
    // lookahead leaves the sentence boundary in place).
    const storm = parseEffectProgram(I("Tap up to two target creatures. Those creatures don't untap during their controllers' next untap steps. Scry 1."));
    expect(storm.confidence).toBe("high");
    expect(storm.atoms).toEqual([
      { op: "tap", targetType: "creature", restrictions: [], maxTargets: 2, minTargets: 0, noUntapNext: true },
      { op: "scry", amount: 1, targetType: null },
    ]);
    // CREED — an unfolded count ("up to three") has no printed pairing in the corpus; the rider sentence
    // strands unbound → the whole clause stays LOW (never a tap that silently drops its lockdown).
    expect(parseEffectProgram(I("Tap up to three target creatures. Those creatures don't untap during their controller's next untap step.")).confidence).toBe("low");
  });
  it("recognizes targeted NON-CREATURE permanent removal (Disenchant/Stone Rain class)", () => {
    expect(parseEffectProgram(I("Destroy target artifact.")).atoms).toEqual([{ op: "destroy", targetType: "artifact", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target enchantment.")).atoms).toEqual([{ op: "destroy", targetType: "enchantment", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target land.")).atoms).toEqual([{ op: "destroy", targetType: "land", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target permanent.")).atoms).toEqual([{ op: "destroy", targetType: "permanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target artifact or enchantment.")).atoms).toEqual([{ op: "destroy", targetType: "artifactOrEnchantment", restrictions: [] }]);
    expect(parseEffectProgram(I("Exile target nonland permanent.")).atoms).toEqual([{ op: "exile", targetType: "nonlandPermanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target artifact an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "artifact", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
  it("keeps RESTRICTED / non-creature variants low (anchor exact)", () => {
    expect(programConfidence(parseEffectProgram(I("Tap target artifact.")))).toBe("low");          // tap is creature-only
    expect(programConfidence(parseEffectProgram(I("Destroy target tapped artifact.")))).toBe("low"); // unmodeled restriction
    // ⚠️ GRADUATED 2026-08-06 (CT-1) — "Destroy target artifact creature." is HIGH now. The `cardType`
    // restriction kind and its front-face, fail-closed evaluator already existed; only the shared target
    // grammar never emitted it. Asserted positively below rather than deleted, so the pin protects the flip.
    expect(parseEffectProgram(I("Destroy target artifact creature.")).atoms)
      .toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "cardType", type: "artifact" }] }]);
    expect(programConfidence(parseEffectProgram(I("Return target nonland permanent to its owner's hand.")))).toBe("high"); // β-3: bounce-permanent modeled
    expect(programConfidence(parseEffectProgram(I("Return target tapped artifact to its owner's hand.")))).toBe("low");   // an unmodeled restriction on bounce → Arbiter
    expect(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield.")).atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" }]); // β-3b reanimation
    // ⚠️ GRADUATED 2026-08-06 (RT-1) — the tapped rider is modeled and honoured at runtime (applyReanimate
    // already threaded entersTapped; only this matcher was anchored with nowhere for the rider to go).
    // Asserted positively so the pin protects the FLIP; a still-unmodeled rider keeps the original intent:
    expect(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield tapped.")).atoms)
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", entersTapped: true }]);
    expect(programConfidence(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield with a +1/+1 counter on it.")))).toBe("low");
  });
});

// ===== FOR-EACH ===== (WALT-FOR-EACH) count-scaled NON-TARGETED controller effects — "draw a card / gain
// N life / lose N life for each <source>" (and "<effect> equal to the number of <source>"). amount = a
// board count × per. Reuses parseCountSource (now singular-aware + graveyard). Unmodeled source → low.
describe("parseEffectProgram — count-scaled draw / life (FOR-EACH)", () => {
  const atom0 = (txt) => parseEffectProgram(I(txt)).atoms[0];
  const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
  it("MUST_STAY_HIGH: draw / gain-life / lose-life × source × per", () => {
    expect(atom0("Draw a card for each creature you control."))
      .toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } });
    expect(atom0("You gain 2 life for each card in your hand."))
      .toMatchObject({ op: "gain-life", amountCount: { kind: "cardsInHand", per: 2 } });
    expect(atom0("Draw a card for each creature card in your graveyard."))
      .toMatchObject({ op: "draw", amountCount: { kind: "cardsInGraveyard", cardType: "creature", per: 1 } });
    expect(atom0("You gain 1 life for each Swamp you control."))
      .toMatchObject({ op: "gain-life", amountCount: { kind: "permanentsYouControl", subtype: "Swamp", per: 1 } });
    expect(atom0("Each opponent loses 2 life for each creature you control."))
      .toMatchObject({ op: "lose-life", who: "eachOpponent", amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 2 } });
    // the "equal to the number of" phrasing too:
    expect(atom0("Draw cards equal to the number of artifacts you control."))
      .toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", cardType: "artifact", per: 1 } });
    expect(atom0("You gain life equal to the number of creatures you control."))
      .toMatchObject({ op: "gain-life", amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } });
    // COUNTER-QUALIFIED creature count (Armorcraft Judge / Inspiring Call): only creatures with a +1/+1 counter.
    expect(atom0("Draw a card for each creature you control with a +1/+1 counter on it."))
      .toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", cardType: "creature", requiresCounter: "+1/+1", per: 1 } });
  });
  it("MUST_DROP_TO_LOW: opponent-scoped / subtype / 'don't control' / other-graveyard sources → Arbiter", () => {
    expect(conf("Draw a card for each creature target opponent controls.")).toBe("low");   // opponent-scoped
    expect(conf("Draw a card for each creature you don't control.")).toBe("low");           // negated control
    expect(conf("Draw a card for each creature card in their graveyard.")).toBe("low");     // not YOUR graveyard
    expect(conf("Draw a card for each Arcane card in your graveyard.")).toBe("low");         // spell subtype — deferred
    // COUNTER-QUALIFIED near-misses: only the exact "a +1/+1 counter on it/them" form is admitted (CREED anchor).
    expect(conf("Draw a card for each creature you control with a counter on it.")).toBe("low");          // generic counter — unmodeled
    expect(conf("Draw a card for each creature you control with two +1/+1 counters on it.")).toBe("low"); // qualified count — unmodeled
  });
});

// ===== COUNT SUBTYPES ===== (WALT-COUNT-SUBTYPE) a curated permanent SUBTYPE count source ("for each
// Goblin you control" / "number of Elves you control" / "for each Treasure you control") works across all
// three count classes (damage / draw / token); a qualified / "other" / opponent-scoped / unknown-word
// source stays low. countMatches matches `\b<Subtype>\b` on the type line (like the basic-land subtypes).
describe("parseEffectProgram — count subtypes (WALT-COUNT-SUBTYPE)", () => {
  const atom0 = (txt) => parseEffectProgram(I(txt)).atoms[0];
  const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
  it("MUST_STAY_HIGH: a subtype source across damage / draw / token (singular + plural)", () => {
    expect(atom0("Goblin War Strike deals damage to target player equal to the number of Goblins you control."))
      .toMatchObject({ op: "deal-damage", amountCount: { kind: "permanentsYouControl", subtype: "Goblin" } });
    expect(atom0("Draw a card for each Elf you control."))
      .toMatchObject({ op: "draw", amountCount: { kind: "permanentsYouControl", subtype: "Elf" } }); // singular
    expect(atom0("Create a 1/1 green Elf Warrior creature token for each Elf you control."))
      .toMatchObject({ op: "create-token", countFor: { kind: "permanentsYouControl", subtype: "Elf" } });
    expect(atom0("You gain 1 life for each Treasure you control."))
      .toMatchObject({ op: "gain-life", amountCount: { kind: "permanentsYouControl", subtype: "Treasure" } }); // artifact subtype
  });
  it("MUST_DROP_TO_LOW: qualified / 'other' / opponent / unknown-word subtype source → Arbiter", () => {
    expect(conf("Boom deals damage to any target equal to the number of tapped Goblins you control.")).toBe("low"); // qualifier
    expect(conf("Boom deals damage to any target equal to the number of Goblins an opponent controls.")).toBe("low"); // opponent-scoped
    expect(conf("You gain 1 life for each Xyzzy you control.")).toBe("low");                                        // not a real subtype → not in the allowlist
  });
});

// ===== DMG-SCALE ===== (WALT-DMG-SCALE) "deals damage to <target> equal to the number of <count source>"
// — the amount is a board count (amountCount) resolved at resolution. Tight target + source allowlists.
describe("parseEffectProgram — board-count damage (DMG-SCALE)", () => {
  const atom0 = (txt) => parseEffectProgram(I(txt)).atoms[0];
  const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
  it("MUST_STAY_HIGH: each modeled target × each modeled count source", () => {
    expect(atom0("Massive Raid deals damage to any target equal to the number of creatures you control."))
      .toMatchObject({ op: "deal-damage", targetType: "any", amountCount: { kind: "permanentsYouControl", cardType: "creature" } });
    expect(atom0("Rumbling Rockslide deals damage to target creature equal to the number of lands you control."))
      .toMatchObject({ op: "deal-damage", targetType: "creature", amountCount: { kind: "permanentsYouControl", cardType: "land" } });
    expect(atom0("Feedback Bolt deals damage to target player or planeswalker equal to the number of artifacts you control."))
      .toMatchObject({ op: "deal-damage", targetType: "playerOrPlaneswalker", amountCount: { kind: "permanentsYouControl", cardType: "artifact" } });
    expect(atom0("Spitting Earth deals damage to target creature equal to the number of Mountains you control."))
      .toMatchObject({ op: "deal-damage", targetType: "creature", amountCount: { kind: "permanentsYouControl", subtype: "Mountain" } });
    expect(atom0("Spiraling Embers deals damage to any target equal to the number of cards in your hand."))
      .toMatchObject({ op: "deal-damage", targetType: "any", amountCount: { kind: "cardsInHand" } });
    // OPPONENT-SCOPED: "cards in that player's hand" → the TARGET player's hand (who:"target"), Sudden Impact.
    expect(atom0("Sudden Impact deals damage to target player equal to the number of cards in that player's hand."))
      .toMatchObject({ op: "deal-damage", targetType: "player", amountCount: { kind: "cardsInHand", who: "target" } });
  });
  it("MUST_DROP_TO_LOW: restricted target / unmodeled source / multiplier → Arbiter", () => {
    // restricted target (would mis-resolve to the unrestricted set):
    expect(conf("Outflank deals damage to target attacking creature equal to the number of creatures you control.")).toBe("low");
    expect(conf("Acidic Soil deals damage to each player equal to the number of lands you control.")).toBe("low"); // each-player damage not modeled
    // opponent-scoped PERMANENTS still low (only the target player's HAND is modeled — "that player's
    // hand", WALT-COUNT-OPP). Opponent permanents + other hand phrasings stay low:
    expect(conf("Incite deals damage to target creature equal to the number of creatures they control.")).toBe("low");      // opponent's creatures
    expect(conf("Jeska deals damage to target player equal to the number of cards in target opponent's hand.")).toBe("low"); // "target opponent's hand" phrasing not modeled
    // who:"target" requires a SINGLE-PLAYER target — "that player's hand" with an each-opponent / creature
    // target is incoherent → Arbiter (airtight; a count that would silently resolve to 0 must not be native):
    expect(conf("Boom deals damage to each opponent equal to the number of cards in that player's hand.")).toBe("low"); // each-opponent: no single "that player"
    expect(conf("Boom deals damage to target creature equal to the number of cards in that player's hand.")).toBe("low"); // creature target: no "that player"
    expect(conf("Draw a card for each card in that player's hand.")).toBe("low"); // FOR-EACH is controller-scoped; "that player" has no referent
    // exotic sources (deferred). NOTE: graveyard counts (FOR-EACH) and permanent SUBTYPES (WALT-COUNT-SUBTYPE)
    // are now MODELED, so "artifact cards in your graveyard" (Scrapyard Salvo) and "Goblins you control"
    // (Goblin War Strike) flip DMG-SCALE high. Still-unmodeled: opponent-scoped + exotic sources.
    expect(conf("Boom deals damage to any target equal to the number of creatures an opponent controls.")).toBe("low"); // opponent-scoped
    expect(conf("Skred deals damage to target creature equal to the number of snow permanents you control.")).toBe("low");
    // a multiplier ("twice the number of") is not a half-scalable native:
    expect(conf("Boom deals damage to any target equal to twice the number of Mountains you control.")).toBe("low");
  });
});

// ===== DMG-SCALE-2 ===== the MODERN word order "deals damage equal to the number of <count> TO <target>"
// (count BEFORE target) — Cabaretti Charm, Coordinated Maneuver, Ultimate Alliance, Eivor, Cat-Gator. Emits
// the SAME amountCount deal-damage atom as the old "to <target> equal to …" order (resolver shared).
describe("parseEffectProgram — board-count damage MODERN word order (DMG-SCALE-2)", () => {
  const atom0 = (txt) => parseEffectProgram(I(txt)).atoms[0];
  const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
  it("MUST_STAY_HIGH: count-before-target across modeled targets + count sources", () => {
    expect(atom0("Ultimate Alliance deals damage equal to the number of creatures you control to target creature."))
      .toMatchObject({ op: "deal-damage", targetType: "creature", amountCount: { kind: "permanentsYouControl", cardType: "creature" } });
    expect(atom0("X deals damage equal to the number of creatures you control to target creature or planeswalker."))
      .toMatchObject({ op: "deal-damage", targetType: "creatureOrPlaneswalker", amountCount: { kind: "permanentsYouControl", cardType: "creature" } });
    expect(atom0("Eivor deals damage equal to the number of Equipment you control to each opponent."))
      .toMatchObject({ op: "deal-damage", targetType: "eachOpponent", amountCount: { kind: "permanentsYouControl", subtype: "Equipment" } });
    expect(atom0("Cat-Gator deals damage equal to the number of Swamps you control to any target."))
      .toMatchObject({ op: "deal-damage", targetType: "any", amountCount: { kind: "permanentsYouControl", subtype: "Swamp" } });
  });
  it("a modal card flips when EVERY mode models (Cabaretti Charm / Coordinated Maneuver)", () => {
    expect(conf("Choose one —\n• X deals damage equal to the number of creatures you control to target creature or planeswalker.\n• Destroy target enchantment.")).toBe("high");
  });
  it("MUST_DROP_TO_LOW: a multi-count 'plus' / a multiplier / an unmodeled-mode modal stays Arbiter", () => {
    expect(conf("Slash of Light deals damage equal to the number of creatures you control plus the number of Equipment you control to target creature.")).toBe("low"); // double count
    expect(conf("X deals damage equal to twice the number of creatures you control to target creature.")).toBe("low"); // multiplier
    // a modal where one mode is an unmodeled target ("land creature or nonbasic land") stays low (all-or-nothing)
    expect(conf("Choose one —\n• X deals damage equal to the number of lands you control to target creature.\n• Destroy target land creature or nonbasic land.")).toBe("low");
  });
});

// P2.6 — CREATE-TOKEN. Single-color creature tokens; a non-creature token / inline-ability
// rider / "tapped" rider stays low. ===== TOKENS ===== T1 adds keyword tokens (with flying …).
describe("parseEffectProgram — create-token (P2.6)", () => {
  it("recognizes single-color creature tokens (count, P/T)", () => {
    expect(parseEffectProgram(I("Create a 1/1 white Soldier creature token.")).atoms)
      .toEqual([{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier", targetType: null }]);
    expect(parseEffectProgram(I("Create two 2/2 green Bear creature tokens.")).atoms[0])
      .toMatchObject({ op: "create-token", count: 2, power: 2, toughness: 2 });
  });
  // ===== FOR-EACH ===== (WALT-FOREACH-TOK) "create a <P/T> <descriptor> creature token for each <source>"
  // — ONE token per source-unit; the count is a board count (countFor), resolved at resolution.
  it("FOREACH-TOK MUST_STAY_HIGH: a token per source-unit (creatures / Forests / cards in hand / graveyard)", () => {
    expect(parseEffectProgram(I("Create a 1/1 green Saproling creature token for each creature you control.")).atoms[0])
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "green saproling", countFor: { kind: "permanentsYouControl", cardType: "creature" } });
    expect(parseEffectProgram(I("Create a 2/2 green Wolf creature token for each Forest you control.")).atoms[0])
      .toMatchObject({ op: "create-token", countFor: { kind: "permanentsYouControl", subtype: "Forest" } });
    expect(parseEffectProgram(I("Create a 1/1 green Snake creature token for each card in your hand.")).atoms[0])
      .toMatchObject({ op: "create-token", countFor: { kind: "cardsInHand" } });
    expect(parseEffectProgram(I("Create a 1/1 green Insect creature token for each creature card in your graveyard.")).atoms[0])
      .toMatchObject({ op: "create-token", countFor: { kind: "cardsInGraveyard", cardType: "creature" } });
    // multi-color descriptor keeps its internal " and " (clause-keeper) → still parses:
    expect(parseEffectProgram(I("Create a 1/1 black and green Worm creature token for each land card in your graveyard.")).atoms[0])
      .toMatchObject({ op: "create-token", countFor: { kind: "cardsInGraveyard", cardType: "land" } });
  });
  it("FOREACH-TOK MUST_DROP_TO_LOW: unmodeled source / 0-toughness / NON-BASIC land token → Arbiter", () => {
    const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
    expect(conf("Create a 1/1 green Saproling creature token for each creature an opponent controls.")).toBe("low"); // opponent-scoped
    expect(conf("Create a 0/0 green Plant creature token for each land you control.")).toBe("low");        // 0-toughness dies to SBA
    // A "land" token with NO basic-land subtype ("Dryad land") has no defined intrinsic mana color → still parked.
    expect(conf("Create a 0/1 green Dryad land creature token for each Forest you control.")).toBe("low"); // LAND creature token, no basic subtype → Arbiter
  });
  // ===== LAND-CREATURE-TOKEN (CR 305.6) ===== a BASIC-land-subtype land token flips HIGH: the intrinsic
  // "{T}: Add <color>" ability is minted onto the token (tokenOracle), so it functions as a real Forest.
  it("FOREACH-TOK: a basic-land-subtype land creature token flips HIGH with its intrinsic mana ability", () => {
    expect(parseEffectProgram(I("Create a 1/1 green Forest Dryad land creature token for each Forest you control.")).atoms[0])
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "green forest dryad land", tokenOracle: "({T}: Add {G}.)", countFor: { kind: "permanentsYouControl", subtype: "Forest" } });
  });
  // ===== TOKENS ===== T1: keyword tokens parse HIGH, with keywords minted onto the token.
  it("recognizes a single-keyword token (flying)", () => {
    expect(parseEffectProgram(I("Create a 1/1 white Bird creature token with flying.")).atoms)
      .toEqual([{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white bird", targetType: null, keywords: ["Flying"] }]);
  });
  it("recognizes a multi-keyword token (flying and vigilance) — the internal 'and' is not severed", () => {
    expect(parseEffectProgram(I("Create a 4/4 white Angel creature token with flying and vigilance.")).atoms[0])
      .toMatchObject({ op: "create-token", power: 4, toughness: 4, keywords: ["Flying", "Vigilance"] });
  });
  it("recognizes a Thopter (artifact creature token with flying)", () => {
    expect(parseEffectProgram(I("Create a 1/1 colorless Thopter artifact creature token with flying.")).atoms[0])
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "colorless thopter artifact", keywords: ["Flying"] });
  });
  it("keeps non-creature / non-mana-inline-ability / tapped / 0-toughness / unenforced-keyword tokens low", () => {
    expect(programConfidence(parseEffectProgram(I("Create a 2/2 black Zombie creature token tapped.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Create three 0/0 white Spirit creature tokens with flying.")))).toBe("low"); // 0-toughness → dies to SBA → incomplete capture → Arbiter
    // T4 admits ONLY a clean MANA ability inline; a non-mana activated/triggered inline ability stays low → Arbiter.
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 green Saproling creature token with \"{T}: Draw a card.\"")))).toBe("low"); // non-mana activated inline ability → Arbiter
    expect(programConfidence(parseEffectProgram(I("Create a 2/2 Bear creature token with \"When this creature dies, draw a card.\"")))).toBe("low"); // triggered inline ability → Arbiter
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 white Spirit creature token with flying and you gain 2 life.")))).toBe("low"); // 'and you gain' isn't a keyword
  });
});

// ===== TOKENS ===== T4 — ABILITY-CARRYING TOKENS, slice 1: MANA abilities (WALT-TOKEN-ABIL). A token
// minted "with \"<ability>\"" or "…token[ named N]. It has \"<ability>\"" whose ability is a CLEAN mana
// ability is stamped with `tokenOracle` so the mana model drives it like Treasure/Gold. Riders /
// restrictions / non-mana inline abilities drop the whole token to low → Arbiter (CREED all-or-nothing).
describe("parseEffectProgram — ability-carrying tokens: mana (T4)", () => {
  const atom = (txt) => parseEffectProgram(I(txt)).atoms[0];
  it("MUST_STAY_HIGH: a creature dork token ({T}: Add {G}) — both the 'with' and 'It has' shapes", () => {
    expect(atom("Create a 1/1 green Human Monk creature token with \"{T}: Add {G}.\""))
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "green human monk", tokenOracle: "{T}: Add {G}" });
    // "named N. It has \"…\"" two-sentence shape, normalized to "with" (Llanowar Mentor) — name ignored.
    expect(atom("Create a 1/1 green Elf Druid creature token named Llanowar Elves. It has \"{T}: Add {G}.\""))
      .toMatchObject({ op: "create-token", descriptor: "green elf druid", tokenOracle: "{T}: Add {G}" });
  });
  it("MUST_STAY_HIGH: Eldrazi Scion/Spawn sac-for-{C} — 'with', 'It has', and the 'this creature' variant", () => {
    expect(atom("Create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\""))
      .toMatchObject({ op: "create-token", power: 0, toughness: 1, tokenOracle: "Sacrifice this token: Add {C}" });
    expect(atom("Create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\""))
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, tokenOracle: "Sacrifice this token: Add {C}" });
    expect(atom("Create a 1/1 colorless Eldrazi Sliver creature token. It has \"Sacrifice this creature: Add {C}.\""))
      .toMatchObject({ op: "create-token", tokenOracle: "Sacrifice this creature: Add {C}" });
    expect(atom("Create a 1/1 colorless Eldrazi creature token with \"Sacrifice this token: Add one mana of any color.\""))
      .toMatchObject({ op: "create-token", tokenOracle: "Sacrifice this token: Add one mana of any color" });
    // same-color two-pip concat is fine (parseAddClause → amount 2 of one color):
    expect(atom("Create a 0/1 colorless Eldrazi creature token with \"{T}: Add {C}{C}.\""))
      .toMatchObject({ op: "create-token", tokenOracle: "{T}: Add {C}{C}" });
  });
  it("MUST_DROP_TO_LOW: any rider / restriction / non-mana inline ability → Arbiter", () => {
    const low = (txt) => programConfidence(parseEffectProgram(I(txt)));
    // Powerstone spend-restriction (the dropped sentence the mana model would silently ignore):
    expect(low("Create a 0/1 colorless Eldrazi creature token with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\"")).toBe("low");
    // life-gain rider (Kibo / Peel Out):
    expect(low("Create a 1/1 green Ape creature token with \"{T}, Sacrifice this token: Add {R} or {G}. You gain 2 life.\"")).toBe("low");
    // spend-only restriction (Commodore Guff):
    expect(low("Create a 1/1 red Pirate creature token with \"{T}: Add {R}. Spend this mana only to cast a planeswalker spell.\"")).toBe("low");
    // a non-mana inline ability is NOT in scope for slice 1:
    expect(low("Create a 2/2 Bear creature token with \"{T}: Draw a card.\"")).toBe("low");
    // a DIFFERENT-color two-pip concat would be mis-resolved as 2-of-one-color → route to Arbiter:
    expect(low("Create a 1/1 gold creature token with \"{T}: Add {W}{U}.\"")).toBe("low");
  });
});

// ===== TOKENS ===== T2 — NAMED ARTIFACT TOKENS (TOK-2 + BLITZ TOK-1 + BLITZ EX-1). Treasure/Clue/Food/Gold/
// Blood/Map enter as real artifact permanents whose printed ability the engine drives (mana model for
// Treasure/Gold, the activated-ability stack path for Clue/Food/Blood — Blood's discard-a-card additional cost
// via the γ1h discard-cost path; Map's {1}+{T}+sac-self sorcery-speed chosen-target explore via EX-1).
// Powerstone/Incubator stay low (restricted mana / transform).
describe("parseEffectProgram — named artifact tokens (TOK-2)", () => {
  it("parses the five modeled named tokens to a create-named-token atom", () => {
    expect(parseEffectProgram(I("Create a Treasure token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "treasure", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Clue token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "clue", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Food token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "food", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Gold token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "gold", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Blood token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "blood", count: 1, targetType: null }]);
    // BLITZ EX-1 — Map joins the modeled allowlist (its chosen-target explore ability is now wired).
    expect(parseEffectProgram(I("Create a Map token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "map", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create two Map tokens.")).atoms)
      .toEqual([{ op: "create-named-token", token: "map", count: 2, targetType: null }]);
  });
  it("parses counts (spelled + numeric, singular/plural)", () => {
    expect(parseEffectProgram(I("Create three Treasure tokens.")).atoms[0]).toMatchObject({ token: "treasure", count: 3 });
    expect(parseEffectProgram(I("Create two Clue tokens.")).atoms[0]).toMatchObject({ token: "clue", count: 2 });
  });
  it("composes with other modeled atoms in a sequence", () => {
    const p = parseEffectProgram(I("Draw a card. Create a Treasure token."));
    expect(p.confidence).toBe("high");
    expect(p.atoms.map(a => a.op)).toEqual(["draw", "create-named-token"]);
  });
  it("MUST_DROP_TO_LOW: unmodeled named tokens (Powerstone/Incubator) + an unmodeled count source", () => {
    expect(programConfidence(parseEffectProgram(I("Create a Powerstone token.")))).toBe("low"); // restricted mana unmodeled
    expect(programConfidence(parseEffectProgram(I("Create an Incubator token.")))).toBe("low"); // transform unmodeled
    // ===== TREASURE-MAKER ===== "for each <unmodeled source>" matches the shape but the source ("opponent")
    // isn't a count source → null → low (never a fabricated count); same for a bare "where X is …" gibberish.
    expect(programConfidence(parseEffectProgram(I("Create a Treasure token for each opponent.")))).toBe("low");
  });
  // ===== TREASURE-MAKER ===== tapped + dynamic-count named tokens are now NATIVE (see tokenFactoryDynamic.test.js).
  it("tapped Treasure token is native (enters tapped)", () => {
    const p = parseEffectProgram(I("Create a tapped Treasure token."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-named-token", token: "treasure", count: 1, tapped: true });
  });
});

// ===== TOKENS ===== T3 — X-COUNT creature tokens (count = the spell's {X}: Secure the Wastes, Goblin
// Offensive). The board-derived "where X is …" count + an "If X is N …" rider correctly stay low.
describe("parseEffectProgram — X-count create-token (TOK-3)", () => {
  const X = (oracle, mana = "{X}{W}") => ({ type: "Instant", mana, oracle });
  it("stamps countX (not a fixed count) and flags the program xSpell", () => {
    const p = parseEffectProgram(X("Create X 1/1 white Warrior creature tokens."));
    expect(p.atoms).toEqual([{ op: "create-token", power: 1, toughness: 1, descriptor: "white warrior", targetType: null, countX: true }]);
    expect(p.xSpell).toBe(true);
  });
  it("preserves P/T, multi-word descriptor, and keywords on an X-count token", () => {
    expect(parseEffectProgram(X("Create X 1/1 white Bird creature tokens with flying.")).atoms[0])
      .toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "white bird", keywords: ["Flying"], countX: true });
  });
  it("MUST_DROP_TO_LOW: a BOARD-derived X count or an 'If X is N' rider stays low → Arbiter", () => {
    expect(programConfidence(parseEffectProgram(X("Create X 1/1 green Saproling creature tokens, where X is the number of creatures you control.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(X("Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all other creatures.")))).toBe("low");
    // Without an {X} cost, a literal "Create X …" isn't a cost-X count → low (no mana → hasX false).
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Create X 1/1 white Soldier creature tokens." }))).toBe("low");
    // A "land" token with NO basic-land subtype ("Saproling land") has no defined intrinsic mana color →
    // its mana would be dropped → stays low → Arbiter (CREED near-miss for the LAND-CREATURE-TOKEN slice).
    expect(programConfidence(parseEffectProgram(I("Create two 1/1 green Saproling land creature tokens.")))).toBe("low");
    // (A plain 0/1 Plant token has toughness 1 — a legit vanilla token, stays HIGH; the land-ness of
    // Khalni Garden lives on the LAND, not the token, so the guard must NOT over-reach to non-land tokens.)
    expect(programConfidence(parseEffectProgram(I("Create a 0/1 green Plant creature token.")))).toBe("high");
  });
  // ===== LAND-CREATURE-TOKEN (CR 305.6) ===== Awaken the Woods flips HIGH: an X-count BASIC-land-subtype
  // (Forest) land creature token that taps for {G} via its minted intrinsic mana ability (tokenOracle).
  it("LAND-CREATURE-TOKEN: Awaken the Woods flips HIGH with the Forest token's intrinsic {G} ability", () => {
    const atom = parseEffectProgram(X("Create X 1/1 green Forest Dryad land creature tokens.", "{X}{G}{G}")).atoms[0];
    expect(atom).toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "green forest dryad land", tokenOracle: "({T}: Add {G}.)", countX: true });
    // CREED near-miss: a MULTI-basic ("Forest Island") land token can't be modeled by a single-color line → parked.
    expect(programConfidence(parseEffectProgram(X("Create X 1/1 green Forest Island Dryad land creature tokens.", "{X}{G}{G}")))).toBe("low");
    // CREED near-miss: a basic-land token carrying a "with <keyword>" rider collides with the mana line → parked.
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 green Forest Dryad land creature token with flying.")))).toBe("low");
  });
});

// P3.1 — COUNTER TARGET SPELL. The atom shape (any/noncreature/creature filter) +
// the multi-clause/modal composition. Riders stay low (pinned in MUST_DROP_TO_LOW).
describe("parseEffectProgram — counter target spell (P3.1)", () => {
  it("recognizes the three modeled filters with the right spellFilter", () => {
    expect(parseEffectProgram(I("Counter target spell.")).atoms)
      .toEqual([{ op: "counter", spellFilter: "any", targetType: "spell" }]);
    expect(parseEffectProgram(I("Counter target noncreature spell.")).atoms)
      .toEqual([{ op: "counter", spellFilter: "noncreature", targetType: "spell" }]);
    expect(parseEffectProgram(I("Counter target creature spell.")).atoms)
      .toEqual([{ op: "counter", spellFilter: "creature", targetType: "spell" }]);
  });
  it("composes in a multi-clause sequence (counter + draw)", () => {
    const p = parseEffectProgram(I("Counter target spell. Draw a card."));
    expect(p.confidence).toBe("high");
    expect(p.atoms.map(a => a.op)).toEqual(["counter", "draw"]);
  });
  it("composes in a 'Choose one —' modal (draw OR counter)", () => {
    const p = parseEffectProgram(I("Choose one —\n• Draw a card.\n• Counter target spell."));
    expect(p.confidence).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal.modes.map(m => m.atoms[0].op)).toEqual(["draw", "counter"]);
  });
  it("programContainsCounter flags counter-bearing programs (the trigger-flush guard)", () => {
    expect(programContainsCounter(parseEffectProgram(I("Counter target spell.")))).toBe(true);
    expect(programContainsCounter(parseEffectProgram(I("Counter target spell. Draw a card.")))).toBe(true);
    expect(programContainsCounter(parseEffectProgram(I("Choose one —\n• Draw a card.\n• Counter target spell.")))).toBe(true);
    expect(programContainsCounter(parseEffectProgram(I("Deal 3 damage to any target.")))).toBe(false);
    expect(programContainsCounter(null)).toBe(false);
  });
});

// P3.2 — TUTOR. "Search your library for a/an <type-filter> card, [reveal it,] put it
// into your hand[, then shuffle]." HIGH only for an ALLOWLISTED type/supertype filter;
// unfiltered / creature-subtype / battlefield / multi-card / rider → low (MUST_DROP).
describe("parseEffectProgram — tutor (P3.2)", () => {
  const S = (oracle) => parseEffectProgram({ type: "Sorcery", oracle });
  it("recognizes the modeled type/supertype filters with grouped words", () => {
    expect(S("Search your library for a creature card, put it into your hand, then shuffle.").atoms)
      .toEqual([{ op: "tutor", filter: { groups: [["creature"]] }, filterLabel: "creature card", destination: "hand", targetType: null }]);
    expect(S("Search your library for a basic land card, reveal it, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["basic", "land"]] });
    expect(S("Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["instant"], ["sorcery"]] });
    expect(S("Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["legendary", "creature"]] });
  });
  it("accepts an UNFILTERED tutor (Demonic Tutor) — filter null, the picker shows the whole library", () => {
    expect(S("Search your library for a card, put that card into your hand, then shuffle.").atoms)
      .toEqual([{ op: "tutor", filter: null, filterLabel: "card", destination: "hand", targetType: null }]);
  });
  it("handles the 'reveal it, and put' (Oxford-and) phrasing without severing the search sentence", () => {
    const p = S("Search your library for an artifact card, reveal it, and put it into your hand. Then shuffle.");
    expect(p.confidence).toBe("high");
    // The redundant trailing shuffle is deduped (the tutor already shuffles) → just [tutor].
    expect(p.atoms.map(a => a.op)).toEqual(["tutor"]);
  });
  it("composes with a modeled rider (tutor + gain-life: Environmental Sciences)", () => {
    const p = S("Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You gain 2 life.");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map(a => a.op)).toEqual(["tutor", "gain-life"]);
  });
  it("dedupes the redundant separate-sentence 'Then shuffle' (the tutor already shuffles)", () => {
    expect(S("Search your library for a creature card, put it into your hand. Then shuffle your library.").atoms.map(a => a.op))
      .toEqual(["tutor"]);
  });
  it("REVIEW CATCH: a leading effect before 'and search …' does NOT parse HIGH dropping the tutor", () => {
    // "Draw a card and search your library …" must NOT rate HIGH as [draw] (silently
    // dropping the tutor) — splitClauses only keeps a sentence whole when it STARTS with
    // "search your library". This whole shape routes to the Arbiter.
    const p = S("Draw a card and search your library for a creature card and put it into your hand.");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
});

// WAVE-2b TUTOR — FETCH-TO-TOP + MV/subtype filters. New HIGH shapes; the unmodeled neighbors are pinned
// LOW in MUST_DROP_TO_LOW (or-greater MV, "any number"/multi to top, on-the-bottom destination).
describe("parseEffectProgram — WAVE-2b tutor (FETCH-TO-TOP + filters)", () => {
  const S = (oracle, type = "Sorcery") => parseEffectProgram({ type, oracle });
  it("FETCH-TO-TOP: 'then shuffle and put that card on top' → destination 'top' (Vampiric/Mystical/Worldly)", () => {
    expect(S("Search your library for a card, then shuffle and put that card on top. You lose 2 life.", "Instant").atoms)
      .toEqual([
        { op: "tutor", filter: null, filterLabel: "card", destination: "top", targetType: null },
        { op: "lose-life", amount: 2, who: "controller", targetType: null },
      ]);
    expect(S("Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.", "Instant").atoms[0])
      .toMatchObject({ op: "tutor", destination: "top", filter: { groups: [["instant"], ["sorcery"]] } });
    // 'put THE card on top' (Worldly/Sylvan/Personal Tutor) is also matched.
    expect(S("Search your library for a creature card, reveal it, then shuffle and put the card on top.", "Instant").atoms[0])
      .toMatchObject({ op: "tutor", destination: "top", filter: { groups: [["creature"]] } });
  });
  it("MV FILTER: 'with mana value N or less' → {max:N}; 'with mana value N' → {exact:N}", () => {
    expect(S("Search your library for an instant or sorcery card with mana value 2 or less, reveal it, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["instant"], ["sorcery"]], mv: { max: 2 } }); // Spellseeker
    expect(S("Search your library for an artifact card with mana value 3, reveal it, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["artifact"]], mv: { exact: 3 } }); // Trophy Mage
  });
  it("SUBTYPE FILTER: a curated creature subtype tutor flips HIGH (Goblin Matron / Elvish Harbinger to top)", () => {
    expect(S("Search your library for a Dragon card, reveal it, put it into your hand, then shuffle.").atoms[0])
      .toMatchObject({ op: "tutor", destination: "hand", filter: { groups: [["dragon"]] } });
    expect(S("Search your library for a goblin card, reveal that card, put it into your hand, then shuffle.").atoms[0].filter)
      .toEqual({ groups: [["goblin"]] });
    expect(S("Search your library for an elf card, reveal it, then shuffle and put that card on top.").atoms[0])
      .toMatchObject({ op: "tutor", destination: "top", filter: { groups: [["elf"]] } });
  });
  it("UP-TO-N: the bare both-to-battlefield land fetch widens to up-to-(two|three|four|five)", () => {
    expect(S("Search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle. You gain 7 life.").atoms)
      .toEqual([
        { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 3, targetType: null },
        { op: "gain-life", amount: 7, targetType: null },
      ]); // Nissa's Renewal
    expect(S("Search your library for up to five Forest cards, put them onto the battlefield tapped, then shuffle.").atoms[0])
      .toMatchObject({ op: "tutor", remaining: 5, destination: "battlefield" });
  });
});

// RAMP-SPLIT (Cultivate / Kodama's Reach) — "up to two basic land cards … put one onto the battlefield
// tapped and the other into your hand". Models the SPLIT destination the bare RAMP-MULTI can't: an ordered
// destinations sequence (battlefield-tapped, then hand). Whole-card (the oracle IS only this effect → native).
describe("parseEffectProgram — RAMP-SPLIT (Cultivate / Kodama's Reach)", () => {
  const S = (oracle) => parseEffectProgram({ type: "Sorcery", oracle });
  const CULTIVATE = "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.";
  it("parses Cultivate to a 2-fetch tutor with a battlefield-tapped then hand destination split", () => {
    expect(S(CULTIVATE).atoms).toEqual([{
      op: "tutor",
      filter: { groups: [["basic", "land"]] },
      filterLabel: "basic land card",
      remaining: 2,
      destinations: [{ zone: "battlefield", tapped: true }, { zone: "hand" }],
      targetType: null,
    }]);
    expect(programConfidence(S(CULTIVATE))).toBe("high");
  });
  it("Kodama's Reach (Arcane sorcery, identical oracle) parses the same", () => {
    const p = S("Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "tutor", remaining: 2, destinations: [{ zone: "battlefield", tapped: true }, { zone: "hand" }] });
  });
  it("the destinations length matches remaining (the resolver advances them in lockstep)", () => {
    const a = S(CULTIVATE).atoms[0];
    expect(a.destinations).toHaveLength(a.remaining);
  });
  // FP guards — near-misses that must STAY low → Arbiter (CREED: a wrong split is worse than deferral).
  it("a NON-LAND split fetch stays low (no creature cheat-into-play)", () => {
    const p = S("Search your library for up to two creature cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
  it("an up-to-THREE split stays low (cardinality unmodeled)", () => {
    const p = S("Search your library for up to three basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
  it("an AMBIGUOUS-basic union split stays low (the basic distribution is unproven)", () => {
    const p = S("Search your library for up to two basic Forest or Island cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.");
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);
  });
});

// THE FAIL-SAFE GATE. Every near-miss / unmodeled instant-or-sorcery MUST drop to
// a low-confidence, ZERO-atom program (→ Arbiter seam). Crucially this includes
// oracles the LOOSE legacy regexes over-match (e.g. "destroy target creature
// unless …", which legacy parses as a plain destroy) — the clean-clause gate
// catches the rider so the interpreter never resolves the wrong thing.
const MUST_DROP_TO_LOW = [
  // ── KWSTRIP-1 — only the SIX vacuous cast-keyword lines are stripped. A NON-vacuous keyword whose effect
  // the engine can't model (cipher/conspire/learn/proliferate/amass) is NOT stripped → its line is an
  // unparseable clause → low; and a vacuous-keyword card whose BODY is unmodeled also stays low (all-or-
  // nothing). (Rebound is now modeled FAITHFULLY — exile-on-resolution via selfExile, recast declined — so a
  // rebound spell with a MODELED body is HIGH; pinned in effects/rebound.test.js + the KWSTRIP describe below.) ──
  // ⭐ FIXTURE SWAPPED 2026-08-05. Cipher sat here as "NOT vacuous (encodes)". That reason was TRUE — and
  // equally true of BUYBACK ("return this to your hand instead of the graveyard"), which has been in the
  // strip list all along on the stated basis that the engine never PAYS it, so a normal cast resolves the
  // printed body byte-identically and the spell graveyards normally. Cipher is the same shape: an OPTIONAL
  // disposition change the engine declines. Re-aimed at specialize, which is still genuinely unmodeled.
  "Target player discards a card.\nSpecialize {3}",                             // specialize — not modeled → not stripped → low
  // ⚠️ BODY SWAPPED 2026-08-01. These two used the FILTERED "return all creature cards…" as their
  // stand-in for an unmodeled body; mass reanimate is now BUILT (see atoms/massReanimate.test.js), so that
  // body reads high and the fixtures stopped testing what they were written to test. The property is
  // unchanged — a vacuous cast-keyword line is stripped, and an unmodeled BODY still keeps the card low —
  // so the body is replaced rather than the pin deleted. The UNFILTERED form is the durable choice: the
  // mass-reanimate arm refuses it permanently as a CREED guard (nothing would gate a sorcery out of an
  // unfiltered "all cards" onto the battlefield), so it cannot drift back to high the way a filtered body did.
  "Suspend 4—{1}{R}\nReturn all cards from your graveyard to the battlefield.", // Living-End-ish — suspend stripped, the unfiltered mass body is unmodeled → low
  "Foretell {3}{B}{B}\nReturn all cards from your graveyard to the battlefield.", // foretell stripped, but the unfiltered mass body is unmodeled → low
  // ── P3.1 counter target spell — the riders that must STAY low (the modeled shapes
  // are pinned HIGH in MUST_STAY_HIGH + the dedicated describe block below). The
  // anchored allowlist drops anything that isn't EXACTLY a bare "Counter target
  // [noncreature|creature]? spell". ──
  // (Clash of Wills "unless its controller pays {X}" is now HIGH — WAVE 2b SOFT-CNT-X, pinned in counterGrammar.test.js)
  // (a count-tax over a SUPPORTED count — GY/hand/artifacts — is now HIGH: SOFT-CNT-COUNT, pinned in softCounter.test.js)
  "Counter target spell unless its controller pays {1} for each blue permanent you control.", // tax over an UNSUPPORTED (color-filtered) count → low
  "Counter target spell or ability.",                            // a SPELL-or-ability union spans two target
  //                                                                classes in one atom — still LOW
  // (NOTE: "Counter target activated or triggered ability." moved OUT of this drop-to-low gate — the
  //  STIFLE-CLASS slice gave abilities their own op (counter-ability) + stackAbility target class, since the
  //  counter applier is spell-shaped throughout (o.kind==="spell", a spellFilter over a CARD, a graveyard
  //  move) and an ability is none of those. Its annotation here was "an ability is not a spell", which was a
  //  SCOPE marker for the counter-SPELL slice rather than a safety refusal. Positive pin:
  //  counterStackAbility.test.js. The union form ABOVE and Tale's End's three-way union stay LOW.)
  "Counter up to two target spells.",                            // "up to two" cardinality unmodeled
  // (the mana-value INEQUALITY "with mana value N or less/greater" is now HIGH — CNT-MV-CMP, pinned in counterSpellFilters.test.js)
  "Counter target creature or planeswalker spell.",              // "or planeswalker" — not a modeled filter (only artifact,creature,or planeswalker is)
  "Counter target spell. If that spell is countered this way, exile it instead.", // replacement rider — the SHORT form (no "of putting it into its owner's graveyard") stays low
  // ── P3.1 corpus-confirmed riders (REAL Scryfall cards the sweep verified stay LOW) ──
  // (Annul "artifact or enchantment" is now HIGH — CNT-TYPE, pinned in counterSpellFilters.test.js)
  // (Countermand's "Its controller mills four cards." is now HIGH — CNT-MILL-RIDER, BLITZ CS-1, pinned in counterSoftRiders.test.js)
  "Choose up to two —\n• Draw a card.\n• You gain 3 life.",            // MODAL-2 models "choose two"/"one or both"; "up to N" count stays low
  "Choose two —\n• Draw a card.\n• Untap all lands you control, then add {G} for each.", // a choose-two with an UNMODELED mode → whole card low (all-or-nothing across modes)
  "Counter target spell you don't control.",                           // Counterflux — "you don't control" unmodeled
  // ── P3.2 tutor — shapes that must STAY low (unmodeled filter / destination / count) ──
  // (WAVE-2b modeled the Dragon-subtype, the "mana value N [or less]" cap, and the bare up-to-three
  //  land-to-battlefield fetch — those are now pinned HIGH in the WAVE-2b describe block; the near-miss
  //  neighbors below remain LOW.)
  "Search your library for an artifact card with mana value 3 or greater, reveal it, put it into your hand, then shuffle.", // WAVE-2b: an UNMODELED MV comparator ("or greater") stays low (CREED — never a wrong cap)
  "Search your library for a creature card with mana value x or less, put it into your hand, then shuffle.", // WAVE-2b: a non-numeric MV ("X") stays low
  "Search your library for any number of Goblin cards, reveal them, then shuffle and put those cards on top in any order.", // WAVE-2b FETCH-TO-TOP is single-card; "any number" (Goblin Recruiter) stays low
  "Search your library for a card, then shuffle and put that card on the bottom.", // WAVE-2b: an unmodeled "on the bottom" destination stays low
  // (Defense of the Heart opened the up-to-N multi-fetch to a PLAIN "creature" filter — "up to two/three
  //  creature cards … put them/those cards onto the battlefield" is now HIGH, pinned in the MULTI-FETCH-CREATURES
  //  block below. A SUBTYPED / typed / unioned multi-fetch still stays LOW here.)
  "Search your library for up to three Dragon cards, put them onto the battlefield tapped, then shuffle.", // subtyped creature multi-fetch keeps the guard → low (no wrong-cheat)
  "Search your library for up to two artifact cards, put them onto the battlefield, then shuffle.", // a non-creature typed multi-fetch to battlefield stays low → Arbiter
  "Search your library for a basic Forest or Island card, put it onto the battlefield, then shuffle.",  // RAMP-TYPED: AMBIGUOUS-basic union (Quandrix Cultivator) — "basic" must distribute but the split can't prove it → Arbiter
  // RAMP-MULTI models the bare "up to N <land> → battlefield"; RAMP-SPLIT models the Cultivate "one … the
  // other" split (intrinsically two) — an "up to THREE" SPLIT (one-and-the-other) stays low.
  "Search your library for up to three basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",  // RAMP-SPLIT is two-only; "up to three" split stays low
  // RIDER-REMOVAL — the UNMODELED controller-riders that must stay LOW (the lead removal is modeled, but an
  // all-or-nothing card never fires the removal while silently dropping the rider).
  "Exile target nonland permanent. Its controller creates a 3/2 red, white, and blue Spirit creature token.", // RE-POINTED 2026-07-29: TWO-colour tokens are modeled now (the token builder always understood them — "and" is in TOKEN_COLOR_WORDS). Moved to a THREE-colour token, still unmodeled. The pin is the unmodeled-rider refusal, not the colour count.
  // SOFT-COUNTER-RIDER — soft-counter NOT hijacked, and delayed/conditional counter-riders stay low.
  "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.", // Arcane Denial (delayed draw)
  "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying and you gain 2 life.", // a rider tail past the keyword → low
  "Search your library for a basic land card, put it on top of your library, then shuffle.",       // top-of-library
  // NOTE (2026-07-24): "Search your library for up to N <type> cards[, reveal them,] put them into
  // your hand[, then shuffle]" moved OUT of this drop-to-low gate — it now parses HIGH via the
  // mfh RAMP-MULTI-TO-HAND matcher (16 real corpus cards, incl. Land Tax; 9 flip to a native tier
  // once their other clauses are also modeled). Its positive pin: rampMultiToHand.test.js.
  "Search your library for a nonland card, put it into your hand, then shuffle.",                   // "nonland" not in any type line
  // NOTE (2026-08-01): "Search your library for a card named <X>[, reveal it], put it into your hand[, then
  // shuffle]" moved OUT of this drop-to-low gate, on the same terms as the RAMP-MULTI-TO-HAND note above.
  // Its old reason here was the bare word "by-name" — the matcher had no way to express a NAME filter. It
  // does now: `filter.name` was built for the partner-with tutor and is enforced in the SAME shared matcher
  // the candidate pool and the auto-pick both read, so a named search offers exactly the named card and
  // nothing else. 8 real corpus cards flip (Screaming Seahawk, Avarax, Daru Cavalier, Embermage Goblin,
  // Welkin Hawk, Growth-Chamber Guardian, Wretched Throng, Trustworthy Scout).
  // Its positive pin: namedCardTutor.test.js — including the decoy-library case, which is what proves the
  // pool is the named card rather than the whole library.
  // A DISJUNCTIVE name ("a card named Halvar, God of Battle or an Equipment card") is still refused and
  // still drops to low — pinned below.
  "Search your library for a card named Halvar, God of Battle or an Equipment card, reveal it, put it into your hand, then shuffle.", // by-name DISJUNCTION — admitting it would drop half the choice
  "Draw a card and search your library for a creature card and put it into your hand.",             // leading-effect leak (review catch) — must NOT parse HIGH as [draw]
  "Destroy target creature unless its controller pays {2}.",   // legacy over-matches → MUST drop
  // NOTE: the BARE MV-filtered removal "Destroy/Exile target <type> with mana value N or greater/less" is NOW native
  // (MV-FILTERED removal — Despark / Fragmentize / Eliminate; pinned in mvFilteredRemoval.test.js + MUST_STAY_HIGH
  // below). Only an MV restriction CONJOINED with another unmodeled clause (a controller phrase, see line ~928) stays
  // low — the `$`-anchored MV matcher rejects the conjunction, all-or-nothing.
  // NOTE: "Destroy target nonbasic land. It deals 2 damage to that land's controller." (a Molten Rain shape) is NOW
  // native — the DESTROY-DAMAGE-RIDER fold models the destroy + the damage-to-the-target's-controller rider (pinned
  // in atoms/destroyDamageRider.test.js). Only the Pillage UNION below stays low ("artifact or nonbasic land" is unmodeled).
  "Destroy target artifact or nonbasic land.",                  // Pillage union — "artifact or nonbasic land" is an unmodeled union (the bare "nonbasic land" IS modeled, see MUST_STAY_HIGH)
  // ⚠️ "Destroy target white or blue creature." LIVED HERE until CD-1 taught the restriction vocabulary
  // OR (colorAny). It now parses to a real atom and is pinned positively in colorDisjunction.test.js.
  // Replaced with a qualifier that is still genuinely unmodelled, rather than dropping the row.
  // FILTERED board wipes — `eachCreature` would wrongly hit the UNFILTERED set, so the exact
  // "all creatures" anchor must reject any qualifier (color/type/keyword/controller).
  // ⚠️ RE-POINTED 2026-07-30. These three held the CREATURE-filter forms, annotated "keyword filter → not all
  // creatures" / "color filter" / "controller filter". Every one of those annotations is a description of a
  // MISSING CAPABILITY, and the capability landed: massCreatureTargets now reads the same 16-kind restriction
  // grammar the damage side has always used, so the resolved set IS the printed set (19 cards, incl. Plague
  // Wind, Cleanse, Perish, Whirlwind). Their positive pins live in massRemovalFilterDelegation.test.js.
  // The slot is re-pointed to filters that are genuinely still unreachable, so this gate keeps its teeth:
  "Destroy all creatures that dealt damage to you this turn.",  // an EVENT-history filter — no such reader
  "Destroy all creatures with power greater than 4.",           // STRICT "greater than" ≠ "4 or greater"
  "Destroy all artifacts you control.",                         // a filtered NON-creature wipe (eachArtifact ≠ this subset)
  "Destroy all nonbasic lands.",                                // MASS-NC: unfiltered NC wipes are modeled now; a FILTERED one stays low
  "All creatures get -1/-1 until end of turn and can't block.", // pump rider (can't block) — keyword effect dropped
  // Combat-trick keyword grants must drop when the granted keyword isn't enforced (a fake
  // grant is forbidden) — the grantable set is the layer-aware combat keywords, NOT these.
  "Target creature gains banding until end of turn.",           // banding not grantable (horsemanship/infect/intimidate/skulk graduated — BLITZ EQ-1)
  "Target creature gets +2/+2 and gains protection from red until end of turn.", // protection not grantable
  // Review catch (no-split + all-or-nothing): a grant chained to a non-keyword via " and "
  // must NOT parse high with a partial grant — the whole clause is unmodeled → Arbiter.
  "Target creature gains trample and draws a card until end of turn.", // "draws a card" is not a keyword
  "Target creature gains flying and gets +2/+2 until end of turn.",    // mixed ordering, one token non-keyword
  // ── TEAM pump (scope:youControl) — the unfiltered "creatures you control get +N/+N …", the
  // "OTHER creatures you control …" (excludeSource), and the "<curated-Subtype>s you control …"
  // (subtypeFilter) forms are modeled (TEAM-PUMP-SCOPE). A keyword/color/attacking-filtered set, a
  // NON-curated subtype, an unenforced granted keyword, or a pure (no-P/T) team grant must stay LOW
  // → Arbiter, so a team buff is never applied to the wrong creatures or fabricated. ──
  "Attacking creatures you control get +2/+0 until end of turn.",      // the you-control-filtered attacking subset isn't modeled (bare "attacking creatures" IS — COMBAT-TEAM-PUMP)
  "Creatures you control with flying get +1/+1 until end of turn.",    // keyword-filtered subset
  "White creatures you control get +1/+1 until end of turn.",          // color-filtered subset (a color is not a curated subtype)
  "Vehicles you control get +1/+1 until end of turn.",                 // a NON-curated subtype word → low (only COUNT_SUBTYPE entries are admitted)
  "Other creatures you control get +1/+1 and gain protection from red until end of turn.", // un-grantable keyword on the OTHER-scope pump → low
  "Creatures you control get +1/+1 and gain banding until end of turn.", // pump-path grant: banding un-grantable → low (shadow now grantable — SLIVER INTERIORS SP-1)
  "Creatures you control gain banding until end of turn.",             // GROUP-KEYWORD-GRANT: an un-grantable keyword → still low (the bare "gain trample/hexproof/indestructible/forestwalk" form is now native — forestwalk graduated in EQ-1)
  // OVERRUN-X — count-scaled team pump ("…gain trample and get +X/+X, where X is <count>"): a FILTERED team,
  // an unmodeled count source, or an un-grantable keyword stays LOW → Arbiter (never a half-scaled native).
  "Until end of turn, creatures you control with flying gain trample and get +X/+X, where X is the greatest power among creatures you control.",        // filtered subset
  "Until end of turn, creatures you control gain trample and get +X/+X, where X is the number of cards in target opponent's hand.",                     // unmodeled count source
  "Until end of turn, creatures you control gain banding and get +X/+X, where X is the greatest power among creatures you control.",             // banding un-grantable (shadow now grantable — SLIVER INTERIORS SP-1)
  // SELF-reference (trigger/activated vocabulary) — "this creature" is modeled (= the source);
  // the ambiguous "it" (could be a prior target, not the source) stays LOW → Arbiter.
  "It gets +2/+0 until end of turn.",                                   // "it" is ambiguous — deferred
  "It gains flying until end of turn.",                                 // "it" keyword grant — deferred
  // SCRY / SURVEIL — only the numeric standalone form is modeled; a variable amount or a ", then"
  // combo (a splitClauses follow-up) stays LOW → Arbiter. (A "you may scry 2" is now an OPTIONAL
  // scry — pinned HIGH in MUST_STAY_HIGH, α2.)
  "Scry X.",                                                            // variable amount — deferred
  // α2 — "you may" wraps an OPTIONAL effect, but a "you may <unmodeled effect>" stays LOW. (A bare "you may
  // pay {cost}. If you do, <modeled-effect>" is now HIGH — OPTIONAL-MANA-PAYMENT, CR 603.7c — see MUST_STAY_HIGH.)
  // ("You may sacrifice a creature." sat here until EC-1c modeled the bare controller edict — it now parses
  // to an optional who:"controller" sacrifice, pinned in controllerSacrificeUpkeep.test.js; the boundary
  // holds with a FILTERED victim, which the exact-anchor edict never admits.)
  "You may sacrifice a creature with flying.",                          // optional UNMODELED effect (filtered victim) — deferred
  "You may draw a card and gain 2 life.",                              // conjoined "you may X and Y" — optionality scope ambiguous → low (α2 forward guard)
  // ── GRAVEYARD RECURSION (return-from-graveyard) — single-target "return target <X> card from YOUR
  // graveyard to your HAND". REG-1 widened the modeled <X> to any basic type / " or " union / "permanent"
  // (see gyRecursion.test.js for those HIGH pins). A NON-type filter (subtype / color / negation /
  // intersection), another graveyard, multi-card cardinality, or a battlefield (reanimation) destination
  // must stay LOW → Arbiter, so we never mis-target the graveyard or silently drop a rider. ──
  // NOTE: "Return up to two target creature cards …" is now NATIVE (MULTI-COUNT slice A — real runtime via
  // targeting.expandAtoms subset enumeration + the multi-target-ready resolver). Pinned HIGH in multiCountTarget.test.js.
  // GRADUATED 2026-08-15 (atzocanSeer.test.js): "Return target goblin card from your graveyard to your
  // hand" parses HIGH now (the CR-vocabulary-gated {subtype} filter). The COLOR form keeps this gate:
  "Return target green card from your graveyard to your hand.",                     // COLOR filter — unmodeled
  "Return target nonland permanent card from your graveyard to your hand.",         // negation — unmodeled
  "Return target artifact creature card from your graveyard to your hand.",         // INTERSECTION (both), not a union — unmodeled
  "Return target creature card from a graveyard to your hand.",                     // ANY graveyard, not "your"
  "Return target creature card from your graveyard to the battlefield under your control.", // β-3b: a reanimation RIDER stays low (bare form is HIGH)
  "Return target creature card from your graveyard to the battlefield with a +1/+1 counter on it.", // counter rider → low
  // NOTE: "Each player draws a card." / "Target player draws N cards." are now HIGH (EACH-PLAYER draw
  // slice) — see the dedicated describe block above. They are intentionally NOT in this stay-low corpus.
  // NOTE: fixed-N "Target player discards a card at random." is now HIGH (RD-1 seeded random discard) —
  // intentionally NOT in this stay-low corpus; positive pin in randomDiscard.test.js.
  "Deal damage to target creature equal to the number of Mountains you control.",
  // Modal that should stay low (MODAL-2 models "choose two"/"one or both" when EVERY mode is modeled;
  // these stay low because a mode is UNMODELED — all-or-nothing across modes).
  "Choose two —\n• Draw a card.\n• Each player reveals their hand, then you choose a noncreature card from it.",
  // P2.5 SPLITS on " and " — but a clause whose SECOND half is unmodeled (gain/lose
  // life, counter, discard, a verbless damage fragment, a comma-rider) still drops
  // the WHOLE program (all-or-nothing). These are the false-high vectors P2.2 guarded
  // with a denylist; P2.5 keeps them low because a split clause fails to parse.
  // (Char's "and 2 damage to you" is now HIGH — SELF-HIT DAMAGE, BLITZ OA-1, pinned in selfHitAndPerBlockerPump.test.js)
  "Deals 2 damage to target creature and 2 damage to target player.",    // 2nd clause verbless → low
  "Draw two cards, discard a card.",                                     // comma-rider (NOT split) → low
  // Unmodeled target restrictions — HIGH would permit an illegal target. P2.4 + β-1 model
  // controller/tapped/power/combat/non-color/non-type; positive-type/keyword/named stay unmodeled.
  // MIXED — a MODELED restriction next to an UNMODELED one must still drop to low
  // (the residue allowlist rejects the leftover qualifier). The tapped+controller+attacking example that
  // used to sit here GRADUATED 2026-08-06 to MUST_STAY_HIGH; see the note there for why it was never
  // testing what its comment claimed.
  "Destroy target creature an opponent controls with mana value 3 or less.", // controller modeled, "mana value" not
  "Destroy target creature with the greatest power.",                       // non-numeric power phrase → not modeled
  // Pump with a keyword-grant rider — the "+X/+Y" matches but the granted keyword
  // would be silently dropped, so it must NOT rate HIGH.
  "Target creature gets +2/+2 until end of turn with trample.",
  // ── P2.5 adversarial-review catches (REAL Scryfall false-highs the multi-clause
  // pass surfaced; pinned so a future parser change can't re-leak them) ──
  "Simoon deals 1 damage to each creature target opponent controls.",           // qualified — must NOT mis-route to "target player"
  // ⚠️ RE-POINTED 2026-07-30. This slot held "…deals 3 damage to each creature an opponent controls." with the
  // note "qualified — only bare 'each creature' is modeled" — CAPABILITY language, and the capability landed
  // (the mass arm now delegates to the shared restriction grammar). Before graduating it I checked the phrase
  // against the corpus rather than reasoning about it: its only three printed carriers are acorn cards
  // (Ol' Buzzbark, Slaying Mantis, Unhinged Beast Hunt), each with a further physical qualifier ("that die is
  // touching"), all still body-only. And the reading is already settled elsewhere in the engine — the 35-card
  // "each creature your opponents control" family maps to the SAME {controller:"opponent"} restriction, i.e.
  // every creature the caster doesn't control. So HIGH is not wrong there. The slot is re-pointed to the form
  // that IS still dangerous and still refused, so this gate keeps its teeth:
  "Simoon deals 2 damage to each creature target opponent controls.",           // TARGET-scoped mass sweep — must hit ONE opponent's creatures, and {controller:"opponent"} would hit ALL of them (a multiplayer FP)
  // NOTE: "Target creature gets +X/+Y. Another target creature gets -A/-B." now parses HIGH (TWO-TARGET PUMP/
  // DEBUFF → one pump-pair atom); positive pin in twoTargetPump.test.js. A MASS "each other creature" 2nd clause still drops.
  "Target creature gets +2/+2 until end of turn. Up to one other target creature gets +1/+1 until end of turn.", // "up to" + "other"
  // NOTE: "… deals N damage to each of up to two target creatures" is now NATIVE (MULTI-COUNT damage slice — real
  // runtime: N to EACH chosen creature via applyDamageEffect's per-target loop + targeting.expandAtoms subsets).
  // Pinned HIGH in multiCountTarget.test.js. A trailing rider ("Those creatures can't block") still stays LOW.
  "Tiered (Choose one additional cost.)\n• Thunder — {0} — Thunder Magic deals 2 damage to target creature.\n• Thundara — {3} — Thunder Magic deals 4 damage to target creature.", // bulleted NON-modal (tiers) → not a 2-damage sequence
  "Two target players each draw a card.",                                       // draw, but a DIFFERENT subject draws — not the controller
  // NOTE (2026-07-25): "Target creature gets +2/+0 until end of turn. Draw a card at the beginning of the
  // next turn's upkeep." MOVED OUT of this gate — the DELAYED-TRIGGER subsystem (CR 603.7,
  // atoms/delayedTrigger.js) now models it as [pump NOW, schedule-delayed{draw}]. This entry earned its
  // keep on the way out: the first draft of that matcher greedily swallowed the pump INTO the delayed
  // clause (deferring an immediate effect — a resolution-order FP), and THIS pin is what caught it.
  // Positive pin + the immediate/delayed split: delayedTrigger.test.js.
  "Wither (This deals damage to creatures in the form of -1/-1 counters.)\nGut Punch deals 3 damage to any target.", // wither changes the damage TYPE
  // ── P2.8b (flush-time target chooser) review catch: "at random" is a selection the
  // engine doesn't model. Picking first-legal would be DETERMINISTIC, not random — so a
  // damage-at-random clause must route to the Arbiter, never a fabricated (fixed) pick.
  // (Surfaced by a corpus scan of the newly-routing targeted triggers: Knight Rampager.)
  "Goblin Sniper deals 1 damage to target opponent chosen at random.",
  // ── δ-1 hand disruption — variants OUTSIDE the exact template / filter allowlist route to Arbiter. ──
  "Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life.", // Agonizing Remorse — exile + graveyard option
  "Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card.", // Reckoner Shakedown — optional "you may" + else-branch
  // (Mind Rot — "Target player discards two cards." — is now MODELED by EP-2 and pinned in MUST_STAY_HIGH.)
  "Target opponent reveals their hand. You choose a nonblack card from it. That player discards that card.", // an unmodeled card filter
  "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. Create a 2/2 zombie.", // an unmodeled rider after a modeled template (no silent partial)
  // ── δ-2 impulse-dig — shapes OUTSIDE the exact "keep one, rest → bottom/graveyard" template ──
  "Look at the top three cards of your library. Put one of them into your hand, one on top of your library, and one on the bottom of your library.", // Telling Time — 3-way split
  // ⛔ PIN INVERTED 2026-08-01 — "Put TWO of them into your hand" MOVED to MUST_STAY_HIGH. The multi-keep
  // slice widened the allowlist from a literal "put one of them" to a keep COUNT, so this line is now a
  // modeled shape (Stock Up, Dig Through Time, Ancestral Memories, +6). The shapes around it below still
  // park, and that is what keeps the "exact template" property pinned — the allowlist grew by one axis,
  // it did not dissolve.
  "Reveal the top three cards of your library. Put one of them into your hand and the rest into your graveyard.", // reveal, not look
  "Look at the top X cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.", // variable X count
  // ===== COUNTERS ===== TEAM distribution ("…on each creature you control") — only the EXACT unfiltered
  // form is modeled (scope:youControl buffs the WHOLE team, so a filtered subset / wrong scope must drop). ──
  "Put a +1/+1 counter on each creature you control with flying.",          // Wingspan Mentor — keyword-filtered subset
  "Put a +1/+1 counter on each creature you control other than this creature.", // Dawnstrike Vanguard — excludes the source
  "Put a +1/+1 counter on each creature you control with a +1/+1 counter on it.", // Patron of the Valiant — counter-filtered subset
  "Put a +1/+1 counter on each creature you control that entered this turn.", // Raucous Entertainer — entered-this-turn subset
  // (Voja's "…on each creature you control, where X is the number of Elves you control" is now MODELED by the
  // DYNAMIC-COUNT keystone — a board-count countFor via the shared countForSpec; see dynamicCount.test.js.)
  "Put a +1/+1 counter on each creature you control with toughness 3 or greater.", // toughness-filtered subset (still LOW)
  "Put a -1/-1 counter on each creature you don't control.",                // Liliana's Influence — WRONG scope ("don't control")
  // (Practiced Offense's "…on each creature target player controls" is now MODELED — the chosen-player
  // mass expansion, eachCreatureOfTargetPlayer; see eachCreatureTargetPlayer.test.js. The neighboring
  // "target OPPONENT controls" wording and a subtype-filtered variant must still drop.)
  "Put a +1/+1 counter on each creature target opponent controls.",         // target-OPPONENT wording — not the modeled "target player" anchor
  "Put a -1/-1 counter on each Zombie creature target player controls.",    // subtype-filtered subset of the modeled shape
  "Put a -1/-1 counter on each creature.",                                  // Soul Snuffers — ALL creatures (not "you control"); not this slice
  // ===== COUNTERS ===== OPTIONAL single target ("…on up to one target creature") — the bare form AND the
  // "you control" own-side form are now modeled (addCounterClauseParser); a creature-SUBTYPE filter OR the
  // OPPONENT-controlled form OR the multi-target "each of up to two" / "distribute" forms leave trailing text
  // the resolver can't enforce → must still drop (deferred to a later CNT-2 sub-slice / the Arbiter). ──
  "Put a +1/+1 counter on up to one target Dinosaur you control.",          // Huatli — creature-subtype filter
  "Put a +1/+1 counter on up to one target creature an opponent controls.", // opponent-controlled filter
  // NOTE: "Put a +1/+1 counter on each of up to two target creatures" is now NATIVE (MULTI-COUNT slice C — real
  // runtime via targeting.expandAtoms subset enumeration + applyAddCounter's per-target loop). Pinned in multiCountTarget.test.js.
  "Distribute three +1/+1 counters among one, two, or three target creatures.", // Biogenic Upgrade — distribute (deferred)
  "Distribute four +1/+1 counters among any number of target creatures.",   // Blessings of Nature — distribute (deferred)
  // ===== EDICTS ===== — sacrifice-as-effect variants OUTSIDE the exact "target player/opponent
  // sacrifices a creature [of their choice]" template route to the Arbiter (a count, a filtered victim,
  // a non-creature, a target-loses-life rider, or a different actor would be confidently mis-resolved).
  "Target player sacrifices two creatures of their choice.",                    // Dead Drop / Barter — a count
  "Target player sacrifices a creature of their choice with the greatest power among creatures that player controls.", // filtered victim
  "Target player sacrifices a creature you don't control.",                     // controller filter on the victim
  "Target player sacrifices a nonblack creature.",                              // color filter
  "Target opponent sacrifices a nonland permanent.",                            // non-creature victim
  "Target player sacrifices a creature of their choice and loses 1 life.",      // Geth's Verdict — the TARGET loses life (deferred)
  // ED-2 boundary — each-player / each-opponent sacrifice OUTSIDE the modeled victim pools (creature / permanent
  // / the TYPED pools land·artifact·enchantment·artifact-or-enchantment) stays LOW (a count / "nontoken" / a
  // type-union with an unmodeled type / "all" would sacrifice the wrong thing — a forbidden false positive).
  // The bare TYPED pools ARE native now (see edicts.test.js TYPED-EDICT — Tremble / Simplify / Tribute to the Wild).
  "Each player sacrifices two creatures of their choice.",                      // a count (Barter in Blood / Tergrid's Shadow)
  "Each player sacrifices two lands of their choice.",                          // a count on the TYPED land edict (still LOW)
  "Each opponent sacrifices a nontoken artifact of their choice.",              // "nontoken" qualifier — token-status not honored (LOW)
  "Each player sacrifices all permanents they control that are one or more colors.", // "all" (All Is Dust)
  "Each opponent sacrifices a creature or planeswalker of their choice.",       // type UNION incl. planeswalker (Dark Intimations) — unmodeled
  "You sacrifice a creature.",                                                  // controller "you sacrifice" — bare controller-sac deferred (α2-interaction risk)

  // ===== EACH-PLAYER ===== discard (EP-2) — only the bare numeric "target/each player discards N cards"
  // is modeled (the discarding player chooses). "their hand", "half", or any unmodeled rider drops to low.
  // NOTE: fixed-N "at random" (Hymn to Tourach) is now MODELED (RD-1 seeded random discard); ONLY the X-count
  // at-random form (Mind Twist — variable X still unmodeled) still drops.
  "Target player discards X cards at random.",                                  // Mind Twist — variable X + RNG
  "Discard your hand, then draw four cards. For each card discarded this way, creatures you control get +1/+0 until end of turn.", // Pyretic Charge — event-count pump rider (bare "discard your hand" now native: DISCARD-HAND)
  "Target player discards their hand unless they pay 7 life.",                  // Tyrannize — conditional
  "Target opponent discards two cards, mills a card, and loses 1 life.",        // Mind Drain — unmodeled riders
  "Each player discards a card, then loses 1 life.",                            // Strongarm Tactics-ish — life rider
  // NOTE: bare "Target opponent discards N cards." now parses HIGH (TARGET-OPPONENT discard slice); only the
  // rider forms (Mind Drain at 1048, dynamic/half counts) still drop. Its positive pin: discardOpponentCantBlock.test.js.
  // NOTE: Windfall ("… draws cards equal to the greatest number of cards a player discarded this way") moved OUT
  // of this drop-to-low gate — it now parses HIGH via the WINDFALL max-discard matcher (see windfall.test.js).
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
  // GRADUATED 2026-07-30 out of MUST_DROP_TO_LOW — "its controller <payload>" is modeled now (the
  // player-referent slice: the recipient is the target's CONTROLLER, projected at the bind site). Moved
  // here rather than deleted so the pin protects the FLIP instead of the refusal.
  "Destroy target creature. Its controller discards a card.",
  "Counter target noncreature spell. Its controller discards a card.",
  // GRADUATED 2026-07-30 out of MUST_DROP_TO_LOW — the Felidar Retreat mode. Its rider was pinned as
  // "unmodeled → whole drops (no silent partial)"; referent binding (CR 608.2) models it, with "those
  // creatures" resolving to the same unfiltered you-control set the counters went on. Moved here rather
  // than deleted so the pin now protects the FLIP instead of the refusal.
  "Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.",
  "Pyroclasm deals 2 damage to each creature.",                                 // BARE "each creature" IS modeled
  "Strangle deals 3 damage to target creature or planeswalker.",                // PW-6: planeswalkers are now damageable targets (loyalty removal)
  // ── β-1 — creature-target restrictions the engine now ENFORCES at enumeration: combat state +
  // non-color + non-type (Doom Blade / Go for the Throat / Divine Verdict). A color UNION / positive
  // type / "legendary" / keyword filter still drops to low (pinned in MUST_DROP_TO_LOW). ──
  "Destroy target nonblack creature.",                                          // color negation (Doom Blade)
  "Destroy target nonartifact creature.",                                       // type negation (Go for the Throat)
  // ⭐ GRADUATED 2026-08-06 (ST-1) — the `supertype` kind and its front-face, fail-closed evaluator predate
  // this slice; only the shared grammar never emitted it. The MASS forms were checked BEFORE shipping: the
  // creature wipe carries the restriction (the resolver honours it), and "all legendary PERMANENTS" still
  // parks, because the non-creature mass lane has no restriction-honouring resolver. See supertypeTarget.test.js.
  "Destroy target legendary creature.",
  // ⭐ GRADUATED 2026-08-06 (KW-1) — the with/without-KEYWORD rows that sat in the drop-to-low gate are HIGH
  // now. The evaluator was never flying-specific; only the parser allowlist was. A curated set of printed
  // keywords is modeled, and the mass lane honours it end-to-end (keywordRestriction.test.js resolves
  // Shadowstorm and shows the non-shadow creature surviving). A keyword OUTSIDE the set still parks.
  "Pyrotechnics deals 1 damage to each creature with first strike.",
  // ⭐ GRADUATED 2026-08-06 (CT-1) out of MUST_DROP_TO_LOW, where it was labelled "positive type
  // restriction (IS an enchantment) — not modeled". It is modeled now, by the same `cardType` kind whose
  // evaluator predates this slice. Enforcement measured: a cardType:"artifact" pool offers ONLY the
  // artifact creature, and typeNeg is its exact mirror (see spellEffects.test.js and cardTypeTarget.test.js).
  "Destroy target enchantment creature.",
  // ⭐⭐ GRADUATED 2026-08-06 (UP-1) out of MUST_DROP_TO_LOW, where it sat labelled
  // `tapped+controller modeled, "attacking" not`. THAT COMMENT WAS STALE AND CONTRADICTED BY ITS OWN FILE:
  // the β-1 header eight lines above already lists combat state among the restrictions the engine enforces.
  // The clause was still dropping for an entirely unrelated reason — the filler strip matched bare `that`
  // inside `that's`, leaving an orphan "s" as residue. So a pin whose stated purpose was "a MODELED
  // restriction next to an UNMODELED one must still drop" was in fact resting on a stray letter, and would
  // have gone on reading green while proving nothing. The mixed-restriction rule it meant to protect is
  // still covered by the entries around its old home ("Destroy target enchantment creature.").
  // Enforcement measured, not assumed — all three restrictions narrow the pool independently:
  //   {tapped, controller:opponent, combat:attacking} -> [OPPtapATK]   (only the creature meeting all three)
  //   drop the combat entry                           -> [OPPtapATK, OPPtapNOatk]  (combat was doing work)
  //   combat alone                                    -> all three attackers, either side
  "Destroy target tapped creature an opponent controls that's attacking.",
  // ── DESTROY-TARGET nonbasic land + noncreature permanent — the land-destruction staple (Sinkhole /
  // Goblin Ruinblaster body / Stone Rain family) + the broad noncreature-permanent removal (Mold Shambler).
  // Reuse the destroy machinery; the predicate (nonbasicLand / noncreaturePermanent) is in PERMANENT_PREDICATES. ──
  "Destroy target nonbasic land.",                                              // nonbasicLand — excludes basics (CR 205.4a)
  "Destroy target noncreature permanent.",                                      // noncreaturePermanent — any non-creature permanent
  "Destroy target nonbasic land. It can't be regenerated.",                     // the "can't be regenerated" rider is re-stamped (still HIGH)
  // ── MV-FILTERED removal — "(Exile|Destroy) target <type> with mana value N or greater/less" (CR 202.3). The MV
  // rides as a `manaValue` target restriction, ENFORCED at enumeration for creature/permanent/planeswalker targets
  // (creatureSatisfiesRestrictions + the addPermanents/addPlaneswalkers honoring). Despark / Eliminate / Fragmentize
  // family; pinned in mvFilteredRemoval.test.js. An MV-X / converge / controller-conjoined form stays LOW. ──
  "Exile target permanent with mana value 4 or greater.",                       // Despark
  "Destroy target creature or planeswalker with mana value 3 or less.",         // Eliminate (MV on both halves)
  "Destroy target artifact or enchantment with mana value 4 or less.",          // Fragmentize
  "Exile target creature with mana value 3 or less.",                           // Death in the Family (bare creature + MV)
  "Destroy target attacking creature.",                                         // combat: attacking (Immolating Glare)
  "Deals 4 damage to target attacking or blocking creature.",                   // combat: either, on the damage path
  "Lightning Bolt deals 3 damage to any target.",
  "Stoke the Flames deals 4 damage to any target.",                             // a Convoke COST reminder doesn't change the effect
  "Convoke (Your creatures can help cast this.) Destroy target creature.",       // keyword-cost reminder stripped → bare destroy
  "Target creature gets -3/-0 until end of turn. Target creature gets -0/-3 until end of turn.", // Agony Warp: two "target creature" (no "another") = legal
  "Ember Shot deals 3 damage to any target. Draw a card.",                      // damage + draw multi-clause
  "Target creature gets +1/+0 until end of turn. Draw a card.",                 // pump + draw (Defiant Strike)
  // ── α2 — "you may <effect>" is an OPTIONAL atom (optional:true), HIGH when the inner effect is
  // modeled (the resolver offers a yes/no, never resolves it as mandatory). FLIPPED from low. ──
  "You may draw a card.",                                                       // optional draw
  "You may scry 2.",                                                            // optional scry (chains to the reorder)
  // ── OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. If you do, <modeled-effect>" is ONE atom
  // whose resolver SUSPENDS on a real pay/decline (pay → deduct mana + run the payoff; decline → nothing).
  // FLIPPED from low (the cost-only "you may pay {cost}" gate is unchanged; only the full conditional flips).
  // An {X} cost / an unmodeled payoff / a "When you do" reflexive / a chosen-target payoff stay LOW (pinned
  // in MUST_DROP_TO_LOW + optionalManaPayment.test.js). ──
  "You may pay {2}. If you do, draw a card.",                                    // Lifecrafter/Mind's Eye family (generic)
  "You may pay {G}. If you do, draw a card.",                                    // colored cost
  "You may pay {1}. If you do, you gain 1 life.",                                // gain-life payoff (Soul Net)
  "You may pay {1}. If you do, scry 2.",                                         // scry payoff (Eyes of the Watcher; chains to reorder)
  // ── "This spell can't be countered" is a VACUOUS rider (uncounterability is enforced at the
  // counter-target enumerator, not the effect program) — stripped so the modeled effect parses. ──
  "This spell can't be countered. Destroy all creatures.",                      // Supreme Verdict
  "This spell can't be countered. Counter target noncreature spell.",           // Dovin's Veto
  // ── KWSTRIP-1 — a VACUOUS cast/alternate-cost keyword LINE (foretell / suspend / splice onto arcane /
  // recover / harmonize / basic landcycling) is stripped (line-anchored) so the spell's BODY parses; the
  // normal-cast resolution is identical. Non-vacuous keywords (rebound/cipher/…) are NOT stripped (low). ──
  "Destroy all creatures.\nForetell {1}{W}{W}",                                 // Doomskar (foretell)
  "Rift Bolt deals 3 damage to any target.\nSuspend 1—{R}",                     // Rift Bolt (suspend)
  "Splice onto Arcane {1}{U}\nDraw a card.",                                    // Evermind (splice onto arcane)
  "Return target creature card from your graveyard to your hand.\nRecover {2}{B}", // Grim Harvest (recover)
  "Suspend 4—{G}\nCreate two 4/4 green Rhino creature tokens with trample.",    // Crashing Footfalls (suspend + token)
  "Suspend 3—{B}\nTarget player discards three cards.",                         // Mindstab (suspend + discard)
  // ── P3.1 counter target spell — the modeled shapes (any/noncreature/creature) +
  // counter-bearing multi-clause/modal programs. FLIPPED from low→high this slice. ──
  "Counter target spell.",                                                      // Counterspell
  "Counter target noncreature spell.",                                          // Negate
  "Counter target creature spell.",                                             // Essence Scatter
  "Counter target spell and draw a card.",                                      // counter + draw (split on " and ")
  "Deal 2 damage to target creature. Counter target spell.",                    // multi-clause, both modeled
  // P3.1 corpus-confirmed HIGH (REAL Scryfall cards the sweep verified — every clause modeled):
  "Counter target spell. Draw a card.",                                         // Dismiss / Contradict
  "Counter target noncreature spell. Draw a card.",                             // Scatter Arc
  "Counter target spell. You gain 3 life.",                                     // Absorb (counter + gain-life)
  "Counter target creature spell. Create a 2/2 blue Illusion creature token.",  // Summoner's Bane (counter + token)
  "Counter target spell and Suffocating Blast deals 3 damage to target creature.", // Suffocating Blast (dual-target)
  "Choose one —\n• You gain 5 life.\n• Counter target spell.\n• Target creature gets -2/-2 until end of turn.", // Dromar's Charm
  // WAVE 2b counter-grammar extensions (resolution/coverage pinned in counterGrammar.test.js):
  "Counter target spell with mana value 1.",                                    // Mental Misstep — CNT-MV-EXACT
  "Counter target spell with mana value 2.",                                    // Spell Snare — CNT-MV-EXACT
  "Counter target artifact, creature, or planeswalker spell.",                  // CNT-ACP 3-way union (Strix Serenade's lead)
  "Counter target artifact, creature, or planeswalker spell. Its controller creates a 2/2 blue Bird creature token with flying.", // Strix Serenade (union + rider)
  "Counter target spell unless its controller pays {X}.",                       // Clash of Wills — SOFT-CNT-X
  "Counter target creature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.", // Deny Existence — CNT-EXILE-INSTEAD
  // P3.2 corpus-confirmed tutors (REAL Scryfall cards the sweep verified — modeled filters):
  "Search your library for a creature card, reveal that card, put it into your hand, then shuffle.",        // Eladamri's Call
  "Search your library for an artifact card, reveal it, put it into your hand, then shuffle.",              // Fabricate
  "Search your library for an enchantment card, reveal it, put it into your hand, then shuffle.",           // Idyllic Tutor
  "Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.",    // Solve the Equation
  "Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle.",     // Time of Need
  "Search your library for an Aura or Equipment card, reveal it, put it into your hand, then shuffle.",     // Open the Armory
  "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You gain 2 life.", // Environmental Sciences
  // ── RAMP-TYPED — typed-basic land ramp to the battlefield (Dex). A basic land TYPE only appears on a LAND,
  // so the land-guard safely admits it; the comma-union is honored by the Oxford-comma split. ──
  "Search your library for a Forest card, put that card onto the battlefield, then shuffle.",                  // Nature's Lore (typed basic, untapped)
  "Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.", // Farseek (comma-union, tapped)
  "Destroy target land. Search your library for a Forest card, put that card onto the battlefield tapped, then shuffle.", // Mwonvuli Acid-Moss (removal + typed ramp, both modeled)
  // ── RAMP-MULTI — "up to two <land> → battlefield" multi-fetch (Explosive Vegetation / Skyshroud Claim). ──
  "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", // Explosive Vegetation
  "Search your library for up to two Forest cards, put them onto the battlefield, then shuffle.",            // Skyshroud Claim (typed, untapped)
  // ── LAND-FROM-HAND — "[you may] put a land from your HAND onto the battlefield[ tapped]" (Dex; tutor seam,
  // sourceZone:hand). The single-clause optional + the Growth Spiral multi-atom suffix-optional both HIGH. ──
  "You may put a land card from your hand onto the battlefield.",                                             // Sakura-Tribe Scout / Walking Atlas activated body
  "Put a land card from your hand onto the battlefield tapped.",                                              // mandatory + tapped variant
  "Draw a card. You may put a land card from your hand onto the battlefield.",                                // Growth Spiral (mandatory draw + suffix-optional put)
  // ── RIDER-REMOVAL — removal whose 2nd sentence acts on the TARGET's controller (Dex). The rider rides on
  // the removal atom + applies to the captured target-controller; an unmodeled rider keeps the card LOW. ──
  "Exile target creature. Its controller gains life equal to its power.",                                      // Swords to Plowshares
  "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",                        // Beast Within (vanilla token)
  "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.", // Path to Exile (ramp rider)
  // ── SOFT-COUNTER-RIDER — counter whose 2nd sentence makes the COUNTERED spell's controller create tokens
  // (named Treasure / keyword Bird); + the token-rider widening lighting up keyword/named REMOVAL riders. ──
  'Counter target noncreature spell. Its controller creates two Treasure tokens. (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")', // An Offer You Can't Refuse
  "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.", // Swan Song (3-way filter + keyword token)
  "Exile target creature or planeswalker. Its controller creates a 4/4 white Angel creature token with flying.", // Angelic Ascension (keyword-token removal rider)
  // ── Mass effects (board wipes) — UNFILTERED "all creatures", modeled this slice. ──
  "Destroy all creatures.",                                                     // Day of Judgment
  "Destroy all creatures. They can't be regenerated.",                          // Wrath of God / Damnation (regen rider stripped)
  "Destroy target creature. A creature destroyed this way can't be regenerated.", // Damn (non-Overload half) — "a creature destroyed this way" regen rider stripped + re-stamped (single form)
  "Destroy all creatures. Creatures destroyed this way can't be regenerated.",   // mass "creatures destroyed this way" regen rider stripped + re-stamped
  "Exile all creatures.",                                                        // mass exile
  "All creatures get -2/-2 until end of turn.",                                  // Infest
  "Each creature gets -1/-1 until end of turn.",                                 // singular phrasing
  "Destroy all creatures. Draw a card.",                                         // mass destroy + a modeled rider
  // ── Combat-trick keyword grants — pump + layer-6 grant (enforced keywords only). ──
  "Target creature gets +2/+2 and gains trample until end of turn.",             // Tread Upon
  "Target creature gains flying until end of turn.",                            // pure grant (Mighty Leap-style)
  "Target creature gets +1/+1 and gains first strike and lifelink until end of turn.", // multi-keyword (Sure Strike-ish)
  "Target creature gains haste until end of turn. Draw a card.",                 // Expedite (pure grant + draw)
  "Target creature gets +2/+1 and gains lifelink until end of turn. Draw a card.", // Moment of Defiance (pump+grant+draw)
  // ── TEAM pump (scope:youControl) — controller-scoped mass pump + Overrun-style grant combo. ──
  "Creatures you control get +2/+2 until end of turn.",                          // Inspired Charge
  "Creatures you control get +1/+1 until end of turn.",                          // generic team pump
  "Creatures you control get +3/+3 and gain trample until end of turn.",         // Overrun (no-split guard holds the combo)
  "Creatures you control get +1/+1 and gain vigilance until end of turn.",       // single-keyword combo
  // ── OVERRUN-X — count-scaled team pump: "+X/+X where X is <count source>" (Dex). ──
  "Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.", // Overwhelming Stampede
  "Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",             // Craterhoof Behemoth's ETB clause
  // ── Scry / surveil (CR 701.22 / 701.25) — numeric standalone + ". "-separated multi-clause. ──
  "Scry 2.",                                                                      // standalone scry
  "Surveil 1.",                                                                   // standalone surveil
  "Surveil 1. Draw a card.",                                                      // multi-clause (sentence-split)
  // ── ", then" sequence split (#10) — "X, then Y" composes (Preordain / Foresee / Read the Bones). ──
  "Scry 2, then draw a card.",                                                    // Preordain
  "Scry 4, then draw two cards.",                                                 // Foresee
  "Surveil 2, then draw two cards. You lose 2 life.",                             // Read the Bones-style
  // ── Self-reference (trigger/activated vocabulary) — "this creature" = the ability's source. ──
  "This creature gets +2/+0 until end of turn.",                                  // firebreathing / attack-trigger self-pump
  "Put a +1/+1 counter on this creature.",                                        // self +1/+1 counter
  "Put two +1/+1 counters on this creature.",                                     // multi-count self counter
  // ── Graveyard recursion (return-from-graveyard) — single-target, your graveyard, to hand. ──
  "Return target creature card from your graveyard to your hand.",                // Raise Dead (creature filter)
  "Return target card from your graveyard to your hand.",                         // Regrowth (any-card filter)
  "Return target creature card from your graveyard to your hand. Draw a card.",   // Recover (recursion + draw)
  "Return target artifact card from your graveyard to your hand.",                // REG-1: artifact filter
  "Return target instant or sorcery card from your graveyard to your hand.",      // REG-1: instant|sorcery union
  "Return target permanent card from your graveyard to your hand.",               // REG-1: permanent (any permanent-type card)
  // ── Targeted NON-CREATURE permanent removal (Disenchant / Stone Rain class) — corpus-confirmed. ──
  "Destroy target artifact.",                                                     // Shatter / Smelt
  "Destroy target artifact or enchantment.",                                      // Disenchant / Naturalize
  "Destroy target enchantment.",                                                  // Demystify
  "Destroy target land.",                                                          // Stone Rain
  "Destroy target permanent.",                                                     // Vindicate / Desert Twister
  "Exile target nonland permanent.",                                              // Utter End
  "Destroy target artifact or enchantment. You gain 3 life.",                     // Natural End (removal + gain-life)
  "Destroy target artifact. Draw a card.",                                        // Smash (removal + draw)
  "Destroy target land. Scry 2.",                                                  // Rubble Reading (removal + scry)
  "Exile target nonland permanent. You lose 3 life.",                            // Anguished Unmaking
  // ── δ-1 targeted hand disruption (Duress family) — the discard-from-revealed-hand atom + riders. ──
  "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.", // Duress
  "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.", // Thoughtseize (+ lose-life rider)
  "Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.", // Inquisition of Kozilek (mv filter)
  "Target opponent reveals their hand. You choose a card from it. That player discards that card.", // Coercion (any card)
  "Target opponent reveals their hand. You choose a creature or planeswalker card from it. That player discards that card.", // Despise
  "Target opponent reveals their hand. You choose a creature card from it. That player discards that card. Scry 1.", // Harsh Scrutiny (+ scry rider)
  // ── δ-2 impulse-dig (look at top N, keep one, rest → bottom / graveyard) ──
  "Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.", // Anticipate
  "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.", // Strategic Planning
  "Look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard. Draw a card.", // dig + draw rider
  // ⭐ MULTI-KEEP (2026-08-01) — arrived here from MUST_DROP_TO_LOW when the keep count was modeled.
  "Look at the top three cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.", // keep-two — Stock Up's template
  "Look at the top seven cards of your library. Put two of them into your hand and the rest into your graveyard.", // Ancestral Memories — keep-two, rest → graveyard
  // ===== COUNTERS ===== the EXACT team-distribution forms — counters on the controller's whole team.
  "Put a +1/+1 counter on each creature you control.",                          // Titania's Boon / Basri's Solidarity
  "Put two +1/+1 counters on each creature you control.",                       // Strength of the Pack (N=2)
  // ===== COUNTERS ===== OPTIONAL single target ("…on up to one target creature") — bare unfiltered,
  // any N, +1/+1 or -1/-1; the target is optional (castable with none). Filtered/multi forms drop (above).
  "Put a +1/+1 counter on up to one target creature.",                          // The Wandering Emperor / Basri
  "Put two +1/+1 counters on up to one target creature.",                       // Ajani, Inspiring Leader (N=2)
  "Put a -1/-1 counter on up to one target creature.",                          // -1/-1 optional (enemy intent)
  // ── EDICTS — "target player/opponent sacrifices a creature of their choice" (the victim is chosen at
  // resolution by the sacrificer) + a modeled compose (Grave Exchange = gy-return + edict). Full behavior
  // pinned in edicts.test.js. ──
  "Target player sacrifices a creature of their choice.",                       // Diabolic Edict (any player)
  "Target opponent sacrifices a creature of their choice.",                     // Cruel Edict (opponents only)
  "Return target creature card from your graveyard to your hand. Target player sacrifices a creature of their choice.", // Grave Exchange (gy-return + edict)
  // ED-2 — each-player / each-opponent sacrifice (bare "a creature"; every sacrificer chooses their own at
  // resolution via the same chain). Non-targeted ⇒ routes on the trigger path too. Full behavior in edicts.test.js. ──
  "Each player sacrifices a creature of their choice.",                         // Innocent Blood (every player)
  "Each opponent sacrifices a creature of their choice.",                       // Liliana's Triumph (opponents only)
  "Each player sacrifices a creature.",                                         // bare form without "of their choice" (Tergrid's Shadow-adjacent)

  // ── EACH-PLAYER discard (EP-2) — "target/each player discards N cards" (the DISCARDING player chooses
  // at resolution, CR 701.8) + a modeled compose (Fill with Fright = discard + scry; Unhinge = discard +
  // draw; Consult the Necrosages = modal draw|discard). Full behavior modeled via the pending-choice chain. ──
  "Target player discards two cards.",                                          // Mind Rot
  "Target player discards three cards.",                                        // Fugue / Three Tragedies
  "Each player discards three cards.",                                          // Delirium Skeins
  "Target player discards two cards. Scry 2.",                                  // Fill with Fright (discard + scry)
  "Target player discards a card. Draw a card.",                               // Unhinge (discard + draw)
  // ── WINDFALL — "Each player discards their hand, then draws cards equal to the greatest number of cards a
  // player discarded this way." → [discard eachPlayer all recordMaxDiscarded, draw eachPlayer amountCount
  // maxDiscardedThisWay] (the whole-hand discard stamps state.maxDiscardedThisWay; the draw reads it). ──
  "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.",
];

describe("parseEffectProgram — review-confirmed HIGH (must NOT over-correct)", () => {
  it.each(MUST_STAY_HIGH)("stays high: %s", (oracle) => {
    expect(programConfidence(parseEffectProgram(I(oracle)))).toBe("high");
  });
});

// KWSTRIP-1 — a VACUOUS cast/alternate-cost keyword LINE (foretell / suspend / splice onto arcane /
// recover / harmonize / basic landcycling) is stripped (line-anchored) so the spell's BODY parses; the
// normal-cast resolution is identical. Non-vacuous keywords (rebound/cipher/…) are NOT stripped.
describe("parseEffectProgram — KWSTRIP-1 (vacuous cast-keyword line strip)", () => {
  it("strips the keyword line (before OR after the body) and models the body atom", () => {
    expect(parseEffectProgram(I("Destroy all creatures.\nForetell {1}{W}{W}")).atoms)
      .toEqual([{ op: "destroy", targetType: "eachCreature" }]);                       // Doomskar — keyword AFTER the body
    expect(parseEffectProgram(I("Suspend 1—{R}\nRift Bolt deals 3 damage to any target.")).atoms[0])
      .toMatchObject({ op: "deal-damage" });                                           // Rift Bolt — keyword BEFORE the body
    expect(parseEffectProgram(I("Splice onto Arcane {1}{U}\nDraw a card.")).atoms)
      .toEqual([{ op: "draw", amount: 1, targetType: null }]);                         // Evermind
  });
  it("strips ONLY the keyword line — a suspend body's own unmodeled text keeps the card low", () => {
    // Body swapped 2026-08-01 for the same reason as the two entries in the drop-to-low list above: the
    // FILTERED mass reanimation is now modeled, so it no longer demonstrates "unmodeled body". The UNFILTERED
    // form is refused permanently by that arm's CREED guard, which makes it a stable stand-in.
    expect(programConfidence(parseEffectProgram(I("Suspend 4—{1}{R}\nReturn all cards from your graveyard to the battlefield.")))).toBe("low"); // suspend stripped, unfiltered mass body unmodeled → low
  });
  it("does NOT text-strip a keyword the engine cannot simply decline — the card stays low → Arbiter", () => {
    // ⭐ INVERTED IN PLACE 2026-08-05, guard job preserved. This pin refused CIPHER because it "changes the
    // card's disposition". True — and equally true of BUYBACK ("return this to your hand instead of the
    // graveyard"), which has been in the strip list all along on the stated basis that the engine never PAYS
    // it, so a normal cast resolves the printed body byte-identically and the spell graveyards normally.
    // Cipher is that same shape — an OPTIONAL disposition change the engine declines — so refusing one while
    // stripping the other was inconsistent. The guard is re-aimed at a keyword that is genuinely unmodeled;
    // cipher is re-pinned at its new answer beside it. See cipher.test.js for the full rationale.
    expect(programConfidence(parseEffectProgram(I("Target player discards a card.\nSpecialize {3}")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Target player discards a card.\nCipher")))).toBe("high");
  });
  it("REBOUND is now modeled faithfully (CR 702.88) — the body parses HIGH and the program is stamped selfExile", () => {
    // Rebound is NOT a text-strip: the body parses on its own merits AND the program is stamped `selfExile`
    // so the spell exiles itself on resolution (not the graveyard — the real state divergence; the optional
    // upkeep recast is faithfully DECLINED, CR 702.88e). See effects/rebound.test.js for the runtime proof.
    const reb = parseEffectProgram(I("Target creature gets +1/+0 until end of turn.\nRebound"));
    expect(programConfidence(reb)).toBe("high");
    expect(reb.selfExile).toBe(true);
    // An UNMODELED rebound body still stays low → Arbiter (no fabricated flip); selfExile never on a low program.
    // FIXTURE SWAPPED: this used the FLICKER body, which the blink slice now models — so it stopped testing
    // anything. Replaced with a body that is genuinely unmodeled (a counted edict, on the MUST_DROP_TO_LOW
    // list above), which keeps the assertion's real intent: rebound-stripping must never fabricate a flip.
    const unmodeled = parseEffectProgram(I("Each player sacrifices two creatures of their choice.\nRebound"));
    expect(programConfidence(unmodeled)).toBe("low");
    expect(unmodeled.selfExile).toBeUndefined();
  });
});

// TEAM pump (scope:youControl) — the controller-scoped mass pump atom shape: scope marker
// (NOT a targetType, so it stays non-targeted), ptDelta, optional Overrun-style grantKeywords,
// the AI-hold classifier, and the no-split-guard interplay with a trailing modeled clause.
describe("parseEffectProgram — team pump (scope:youControl)", () => {
  it("models a plain team pump as a single non-targeted pump atom", () => {
    const p = parseEffectProgram(I("Creatures you control get +2/+2 until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", ptDelta: { p: 2, t: 2 } }] });
    expect(p.atoms[0].targetType).toBeUndefined();          // scope, NOT a targetType
    expect(programNeedsChosenTarget(p)).toBe(false);         // non-targeted → no chosen target
    expect(programContainsTeamPump(p)).toBe(true);
  });
  it("models the Overrun combo (pump + granted keyword) as one bound atom", () => {
    const p = parseEffectProgram(I("Creatures you control get +3/+3 and gain trample until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", ptDelta: { p: 3, t: 3 }, grantKeywords: ["Trample"] }] });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
  it("splits a trailing modeled clause while keeping the combo's internal 'and' intact", () => {
    const p = parseEffectProgram(I("Creatures you control get +1/+1 and gain vigilance until end of turn. Draw a card."));
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "pump", scope: "youControl", ptDelta: { p: 1, t: 1 }, grantKeywords: ["Vigilance"] },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("drops an unenforced granted keyword to low (all-or-nothing, no fake grant)", () => {
    expect(programConfidence(parseEffectProgram(I("Creatures you control get +1/+1 and gain banding until end of turn.")))).toBe("low");
    expect(parseEffectProgram(I("Creatures you control get +1/+1 and gain banding until end of turn.")).atoms).toHaveLength(0);
  });
  it("is not flagged as mass removal (a team pump is not a wipe)", () => {
    const p = parseEffectProgram(I("Creatures you control get +2/+2 until end of turn."));
    expect(programContainsTeamPump(p)).toBe(true);
  });
  // ── TEAM-PUMP-SCOPE — the "other creatures" (excludeSource, CR 113.7) and "<Subtype>s you control
  // [other than this creature]" (curated subtypeFilter) variants, both still scope:youControl. ──
  it("models 'OTHER creatures you control get +N/+N until end of turn' with excludeSource", () => {
    const p = parseEffectProgram(I("Other creatures you control get +1/+1 until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 1, t: 1 } }] });
    expect(programContainsTeamPump(p)).toBe(true);            // still an AI-held team pump
  });
  it("binds the 'OTHER creatures … and gain <kw>' combo (excludeSource + grant)", () => {
    const p = parseEffectProgram(I("Other creatures you control get +2/+2 and gain vigilance and trample until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 2, t: 2 }, grantKeywords: ["Vigilance", "Trample"] }] });
  });
  it("models a curated-SUBTYPE team pump ('Dinosaurs you control get +N/+N …') with subtypeFilter", () => {
    const p = parseEffectProgram(I("Dinosaurs you control get +4/+4 until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", ptDelta: { p: 4, t: 4 } }] });
    expect(p.atoms[0].excludeSource).toBeUndefined();        // no "other than" → includes the source
  });
  it("models the SUBTYPE + 'other than this creature' + grant combo (Triceraton's attack pump)", () => {
    const p = parseEffectProgram(I("Dinosaurs you control other than this creature get +1/+1 and gain flying until end of turn."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", excludeSource: true, ptDelta: { p: 1, t: 1 }, grantKeywords: ["Flying"] }] });
  });
  it("a NON-curated subtype word stays low → Arbiter (only COUNT_SUBTYPE entries admitted)", () => {
    expect(programConfidence(parseEffectProgram(I("Vehicles you control get +1/+1 until end of turn.")))).toBe("low");
  });
});

// ===== COUNTERS ===== TEAM counter distribution (scope:youControl) — "Put N +1/+1 counter(s) on
// each creature you control". The same non-targeted controller-scoped marker the team pump uses,
// reusing applyAddCounter's existing scope routing; no chosen target. Filtered subsets / wrong
// scopes are pinned LOW in MUST_DROP_TO_LOW above.
describe("parseEffectProgram — team counter distribution (scope:youControl)", () => {
  it("models 'on each creature you control' as a single non-targeted add-counter atom", () => {
    const p = parseEffectProgram(I("Put a +1/+1 counter on each creature you control."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 1, scope: "youControl" }] });
    expect(p.atoms[0].targetType).toBeUndefined();          // scope, NOT a targetType
    expect(programNeedsChosenTarget(p)).toBe(false);         // non-targeted → no chosen target
  });
  it("carries the spelled count (N=2) through to the amount", () => {
    const p = parseEffectProgram(I("Put two +1/+1 counters on each creature you control."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 2, scope: "youControl" }] });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
});

// ===== COUNTERS ===== OPTIONAL single-target counter (CNT-2) — "Put N +1/+1 (or -1/-1) counter(s)
// on up to one target creature". A normal chosen-target add-counter atom flagged `optional:true` so
// the cast/trigger stays castable with no target (targeting.expandAtoms offers a decline). Filtered
// + multi-target ("each of up to two") + distribute forms are pinned LOW in MUST_DROP_TO_LOW above.
describe("parseEffectProgram — optional single-target counter (up to one)", () => {
  it("models 'on up to one target creature' as a chosen-target add-counter atom with optionalTarget:true", () => {
    const p = parseEffectProgram(I("Put a +1/+1 counter on up to one target creature."));
    expect(p).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature", optionalTarget: true }] });
    expect(programNeedsChosenTarget(p)).toBe(true);          // it CAN take a target (chooser / UI picks)
    expect(p.atoms[0].optional).toBeUndefined();             // NOT the α2 "you may" resolution-yes/no flag
  });
  it("carries the spelled count (N=2) and the -1/-1 sign through", () => {
    expect(parseEffectProgram(I("Put two +1/+1 counters on up to one target creature.")).atoms)
      .toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 2, targetType: "creature", optionalTarget: true }]);
    expect(parseEffectProgram(I("Put a -1/-1 counter on up to one target creature.")).atoms)
      .toEqual([{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "creature", optionalTarget: true }]);
  });
});

describe("programConfidence — pure shape function", () => {
  it("is low for an absent/empty program; high only when every atom is a known op", () => {
    expect(programConfidence(null)).toBe("low");
    expect(programConfidence({ atoms: [] })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "draw" }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }, { op: "counter-spell" }] })).toBe("low"); // one unknown → low
    // Every known op alone is HIGH — EXCEPT roll-d20, whose sequence gate (now enforced inside
    // programConfidence, overhaul hardening) demands a diceResult payoff follow it: a trailing roll
    // with an unmodeled outcome is exactly the dropped-clause FP the gate exists to stop.
    KNOWN_ATOM_OPS.filter((op) => op !== "roll-d20").forEach((op) => expect(programConfidence({ atoms: [{ op }] })).toBe("high"));
  });

  it("enforces the dice-roll and reveal-top SEQUENCE invariants (collapsed()-bypass hardening)", () => {
    // A lone/trailing roll with no payoff, and a payoff with no preceding setup, are LOW even when
    // the program object arrives stamped confidence:"high" (the collapsed()-shaped bypass).
    expect(programConfidence({ atoms: [{ op: "roll-d20" }], confidence: "high" })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "draw", amountCount: { kind: "diceResult" } }], confidence: "high" })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "lose-life", countFor: { kind: "revealedCardMV" } }], confidence: "high" })).toBe("low");
    // The properly-sequenced forms stay HIGH (positive controls).
    expect(programConfidence({ atoms: [{ op: "roll-d20" }, { op: "draw", amountCount: { kind: "diceResult" } }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "reveal-top-to-hand" }, { op: "lose-life", countFor: { kind: "revealedCardMV" } }] })).toBe("high");
    // Modal: a mode violating a sequence forces the whole program LOW (all-or-nothing across modes).
    expect(programConfidence({ structure: "modal", modal: { modes: [
      { atoms: [{ op: "draw" }] },
      { atoms: [{ op: "draw", amountCount: { kind: "diceResult" } }] },
    ] } })).toBe("low");
  });
  // ADDCOST — a program may carry parser-attached `additionalCosts`. HIGH requires every cost be a kind the
  // cast path can actually pay (sacrifice / payLife / discard); an unsupported kind forces LOW even with
  // known atoms (so a future cost-type can't flip a card HIGH before its cast-path enforcement ships).
  it("gates an unsupported additional-cost kind to low (CREED — never claim a cost we can't pay)", () => {
    expect(programConfidence({ atoms: [{ op: "draw" }], additionalCosts: [{ kind: "sacrifice", sacType: "creature" }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }], additionalCosts: [{ kind: "payLife", amount: 2 }] })).toBe("high");   // ADDCOST-2
    expect(programConfidence({ atoms: [{ op: "draw" }], additionalCosts: [{ kind: "discard", count: 1 }] })).toBe("high");    // ADDCOST-2
    expect(programConfidence({ atoms: [{ op: "draw" }], additionalCosts: [{ kind: "exile" }] })).toBe("low");                 // not yet a supported cost kind
    expect(programConfidence({ atoms: [{ op: "draw" }], additionalCosts: [{ kind: "sacrifice" }, { kind: "exile" }] })).toBe("low");
  });
});

// ===== ADDITIONAL COSTS (cast-path, CR 601.2f) =====
// A spell's "As an additional cost to cast this spell, <cost>." sentence is a cost paid at cast, not an
// effect atom. ADDCOST-1 modeled the chosen-victim sacrifice; ADDCOST-2 adds pay-N-life (no choice) and
// discard-a-card (N=1). The cost sentence is stripped + the remaining effect parsed normally; everything
// else (an unmodeled cost shape — a count, a compound, "another", X-life, multi-card discard — or an
// effect that references the paid-cost object) leaves the sentence in place → LOW → Arbiter. These pins
// are the merge gate for the false-positive class these slices risk.
describe("parseEffectProgram — additional cast costs (ADDCOST-1 sacrifice + ADDCOST-2 pay-life/discard)", () => {
  it("MUST STAY HIGH: a clean sac-a-creature cost + an independently-modeled effect", () => {
    // Bone Splinters — sac a creature, destroy target creature.
    const bone = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature."));
    expect(programConfidence(bone)).toBe("high");
    expect(bone.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
    expect(bone.atoms.map((a) => a.op)).toEqual(["destroy"]);
    // Altar's Reap — sac a creature, draw two cards (no target).
    const reap = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards."));
    expect(programConfidence(reap)).toBe("high");
    expect(reap.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
    expect(reap.atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
  });
  it("MUST STAY HIGH: the other modeled sac TYPES generalize (artifact / permanent / enchantment / land)", () => {
    for (const t of ["artifact", "permanent", "enchantment", "land"]) {
      const p = parseEffectProgram(I(`As an additional cost to cast this spell, sacrifice a${t === "artifact" || t === "enchantment" ? "n" : ""} ${t}.\nDraw a card.`));
      expect(programConfidence(p)).toBe("high");
      expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: t }]);
    }
  });
  it("FLING GRADUATED: the sacrificed creature's stats CAN be fed in now (damage arm)", () => {
    // This assertion's original reason — "the engine can't feed the victim's stats in" — was accurate and is
    // now obsolete for the DAMAGE arm: actionDispatcher captures the victim's layer-aware power/toughness and
    // mana value at COST-PAYMENT time (CR 608.2h LKI) and countForSpec reads them back. Asserted positively
    // rather than deleted. Full pins in sacrificedReferent.test.js.
    const fling = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nThis spell deals damage equal to the sacrificed creature's power to any target."));
    expect(programConfidence(fling)).toBe("high");
    expect(fling.atoms[0].amountCount).toEqual({ kind: "sacrificedPower", per: 1 });
  });
  it("RECKONER'S BARGAIN GRADUATED: the GAIN-LIFE arm reads the same capture now", () => {
    // Split out of the Fling pin one slice ago as "the arm that was NOT wired" — accurate then, and the split
    // is exactly what made it obvious what to build next. The gain-life reader landed, so it is asserted
    // positively. The capture was general from the start; only the per-atom-family READERS were missing.
    const p = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards, then you gain life equal to the sacrificed creature's toughness."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.some((a) => a.op === "gain-life" && a.amountCount?.kind === "sacrificedToughness")).toBe(true);
  });
  it("AC-1 MUST STAY HIGH: a count-of-N sacrifice ('sacrifice two creatures') is now modeled (Bankrupt in Blood / Phyrexian Tribute)", () => {
    const p = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice two creatures.\nDraw two cards."));
    expect(programConfidence(p)).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature", count: 2 }]);
    // 'sacrifice five lands' — plural type maps to the singular sacType key, count preserved (Gaea's Balance cost shape).
    const lands = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice five lands.\nDraw a card."));
    expect(lands.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "land", count: 5 }]);
  });
  it("MUST DROP TO LOW: an unmodeled cost shape ('another', or a count outside two–five) is NOT stripped", () => {
    // "another" — a spell has no source permanent to exclude, so it's not a modeled form.
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice another creature.\nDraw a card.")))).toBe("low");
    // A count beyond the SUPPORTED two–five word range is left unstripped → LOW (no such corpus card today).
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice ten creatures.\nDraw a card.")))).toBe("low");
  });
  it("ADDCOST-1 union MUST STAY HIGH: 'sacrifice an artifact or creature' is modeled (Deadly Dispute / Costly Plunder)", () => {
    // The "artifact or creature" union sac cost is enforced as one sacType ("artifactOrCreature"); a victim
    // matching EITHER type pays it (legalChoices.sacTypeMatches). The effect (Draw a card) is modeled → HIGH.
    const p = parseEffectProgram(I("As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw a card."));
    expect(programConfidence(p)).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "artifactOrCreature" }]);
  });
  it("ADDCOST-2 MUST STAY HIGH: discard-a-card + pay-N-life costs parse HIGH with the right cost descriptor", () => {
    // Thrill of Possibility — discard a card, draw two.
    const disc = parseEffectProgram(I("As an additional cost to cast this spell, discard a card.\nDraw two cards."));
    expect(programConfidence(disc)).toBe("high");
    expect(disc.additionalCosts).toEqual([{ kind: "discard", count: 1 }]);
    // Withering Boon — pay 3 life, counter target creature spell.
    const life = parseEffectProgram(I("As an additional cost to cast this spell, pay 3 life.\nCounter target creature spell."));
    expect(programConfidence(life)).toBe("high");
    expect(life.additionalCosts).toEqual([{ kind: "payLife", amount: 3 }]);
  });
  it("AC-1 MUST STAY HIGH: a count-of-N discard ('discard two cards') is now modeled (Cathartic Reunion)", () => {
    const p = parseEffectProgram(I("As an additional cost to cast this spell, discard two cards.\nDraw three cards."));
    expect(programConfidence(p)).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "discard", count: 2 }]);
  });
  it("ADDCOST-2 MUST DROP TO LOW: X-life / self-ref-discard remain deferred", () => {
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, pay X life.\nDraw X cards.")))).toBe("low");               // X-life deferred (+ X-cost compound)
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, discard a card.\nDraw cards equal to the discarded card's mana value.")))).toBe("low"); // self-ref / cost-scaled effect
  });
  it("MUST DROP TO LOW: a sac cost whose REMAINING effect is itself unmodeled (all-or-nothing)", () => {
    // The sac cost is clean, but a SCALED drain ("loses life equal to …") is not a modeled atom → LOW.
    // (The numeric "Target player loses N life" is now modeled by DEATH-DRAIN-TARGETED; the scaled form isn't.)
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nTarget player loses life equal to the number of creatures you control.")))).toBe("low");
  });
});

// ===== ALT-COST (CR 601.2b / 118.9) — a printed ALTERNATIVE casting cost, wave 3a (FREE / controlCommander) =====
// "[If <cond>, ]you may cast this spell without paying its mana cost." is stripped like the flashback /
// jump-start / overload keyword lines: the body parses through the all-or-nothing pipeline and the card is
// native because its EFFECT is modeled + it's castable at its PRINTED mana cost (Cyclonic Rift / Firebolt are
// native today by exactly this logic). The alt-cost is recorded as `program.altCost` metadata (forward-
// compatible) but not yet OFFERED — a safe FN on an optional discount. The gate (SUPPORTED_ALT_COST_KINDS)
// keeps un-vetted kinds LOW; the all-or-nothing body parse keeps a card LOW when its remaining effect is
// unmodeled (Deflecting Swat's redirect). These pins are the merge gate for this slice's false-positive class.
describe("parseEffectProgram — printed alt-cost strip (free / pitch / exile / sac / payLife / return)", () => {
  it("gates an un-vetted alt-cost kind to low (CREED — a kind flips only once its strip is corpus-swept clean)", () => {
    expect(programConfidence({ atoms: [{ op: "draw" }], altCost: { kind: "free", condition: "controlCommander" } })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }], altCost: { kind: "convokePitch", condition: "always" } })).toBe("low"); // a hypothetical un-vetted kind
  });
  it("MUST STAY HIGH: each modeled alt-cost shape strips + attaches its descriptor + the body parses", () => {
    const fg = parseEffectProgram(I("If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell."));
    expect(programConfidence(fg)).toBe("high");
    expect(fg.altCost).toEqual({ kind: "free", condition: "controlCommander" });
    expect(fg.atoms.map((a) => a.op)).toEqual(["counter"]);
    const fow = parseEffectProgram(I("You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell."));
    expect(programConfidence(fow)).toBe("high");
    expect(fow.altCost).toEqual({ kind: "payLifeExilePitch", amount: 1, color: "blue", condition: "always" });
    const fon = parseEffectProgram(I("If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target noncreature spell."));
    expect(programConfidence(fon)).toBe("high");
    expect(fon.altCost).toEqual({ kind: "exileColorCard", color: "blue", condition: "notYourTurn" });
    const flare = parseEffectProgram(I("You may sacrifice a nontoken blue creature rather than pay this spell's mana cost.\nCounter target spell."));
    expect(programConfidence(flare)).toBe("high");
    expect(flare.altCost).toEqual({ kind: "sacrificeCreature", nontoken: true, color: "blue", condition: "always" });
    const snuff = parseEffectProgram(I("If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated."));
    expect(programConfidence(snuff)).toBe("high");
    expect(snuff.altCost).toEqual({ kind: "payLife", amount: 4, condition: "controlLand:Swamp" });
    const gush = parseEffectProgram(I("You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards."));
    expect(programConfidence(gush)).toBe("high");
    expect(gush.altCost).toEqual({ kind: "returnLandsToHand", count: 2, subtype: "Island", condition: "always" });
  });
  it("MUST DROP TO LOW: the alt-cost strips but the REMAINING effect is unmodeled (all-or-nothing)", () => {
    // GRADUATED 2026-08-15 (deflectingSwat.test.js): Deflecting Swat's 'choose new targets for target
    // spell or ability' is the RETARGET atom now (CR 115.7) — free-if-commander + a HIGH body.
    const swat = parseEffectProgram(I("If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability."));
    expect(programConfidence(swat)).toBe("high");
    expect(swat.atoms).toEqual([{ op: "retarget", targetType: "spellOrStackAbility", optional: true }]);
    // Misdirection — exile-pitch, but 'change the target' (a DIFFERENT wording + a single-target filter —
    // NOT the retarget arm, which is anchored on 'choose new targets for target spell or ability') stays low.
    expect(programConfidence(parseEffectProgram(I("You may exile a blue card from your hand rather than pay this spell's mana cost.\nChange the target of target spell with a single target.")))).toBe("low");
  });
  it("MUST DROP TO LOW: an un-modeled alt-cost SHAPE / CONDITION is NOT stripped (the sentence keeps the card LOW)", () => {
    // Foil — a COMPOUND discard cost (discard an Island AND another card), not a modeled shape → not stripped.
    expect(programConfidence(parseEffectProgram(I("You may discard an Island card and another card rather than pay this spell's mana cost.\nCounter target spell.")))).toBe("low");
    // Commandeer — exile TWO blue cards (plural), not the singular shape → not stripped.
    expect(programConfidence(parseEffectProgram(I("You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target spell.")))).toBe("low");
    // An unrecognized free-cast CONDITION → rejected → not stripped.
    expect(programConfidence(parseEffectProgram(I("If you control three or more artifacts, you may cast this spell without paying its mana cost.\nCounter target spell.")))).toBe("low");
  });
});

// ===== INSPIRING CALL — draw-for-each-counter-creature + "those creatures gain <kw>" (cross-clause template) =====
// The "those creatures" anaphora binds a group grant to the SAME +1/+1-counter-filtered set the preceding draw
// counted (both resolve atomically, so the set is stable). Matched up front as [draw(requiresCounter),
// grant-keywords-group(requiresCounter)]; an un-grantable keyword / a rider / a bare "those creatures" → LOW.
describe("parseEffectProgram — Inspiring Call (counter-draw then grant to those creatures)", () => {
  it("MUST STAY HIGH: emits [draw(requiresCounter), grant-keywords-group(requiresCounter=+1/+1)]", () => {
    const p = parseEffectProgram(I("Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["draw", "grant-keywords-group"]);
    expect(p.atoms[0].amountCount).toMatchObject({ kind: "permanentsYouControl", cardType: "creature", requiresCounter: "+1/+1" });
    expect(p.atoms[1]).toMatchObject({ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Indestructible"], requiresCounter: "+1/+1" });
  });
  it("MUST DROP TO LOW: an un-grantable keyword / a trailing rider / a bare 'those creatures' → Arbiter", () => {
    // 'banding' is not in the group-grant allowlist → the grant clause returns null → the whole card stays LOW.
    expect(programConfidence(parseEffectProgram(I("Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain banding until end of turn.")))).toBe("low");
    // A trailing rider breaks the anchored two-sentence match → the split fragments don't recombine → LOW.
    expect(programConfidence(parseEffectProgram(I("Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn. Draw a card.")))).toBe("low");
    // 'those creatures' with no counter-draw lead has no referent → LOW (a bare group grant can't say 'those').
    expect(programConfidence(parseEffectProgram(I("Those creatures gain indestructible until end of turn.")))).toBe("low");
  });
});

// ===== ACT-KW-GRANT — self keyword-grant (activated/trigger effect, via parseEffectClause) =====
// "This creature [gets +N/+N and ]gains <KW> until end of turn" grants the SOURCE (CR 113.7) the
// keyword(s) for the turn, reusing the combat-trick GRANTABLE_COMBAT_KEYWORDS allowlist (the enforced,
// layer-aware set IS the false-positive guard). A keyword the engine doesn't enforce (indestructible /
// hexproof / protection / ward) → null → low → Arbiter (never a grant the engine can't honor).
describe("parseEffectClause — self keyword-grant (ACT-KW-GRANT)", () => {
  const atomsOf = (o) => (parseEffectClause(o, "Creature") || {}).atoms;
  const conf = (o) => programConfidence(parseEffectClause(o, "Creature"));
  it("parses a self keyword-grant (+ optional self pump) to a target:self pump atom with grantKeywords", () => {
    expect(atomsOf("This creature gains flying until end of turn.")).toEqual([{ op: "pump", target: "self", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying"] }]);
    expect(atomsOf("This creature gains first strike and deathtouch until end of turn.")).toEqual([{ op: "pump", target: "self", ptDelta: { p: 0, t: 0 }, grantKeywords: ["First strike", "Deathtouch"] }]);
    expect(atomsOf("This creature gets +1/+0 and gains trample until end of turn.")).toEqual([{ op: "pump", target: "self", ptDelta: { p: 1, t: 0 }, grantKeywords: ["Trample"] }]);
    // negative pump composes (Hopping Automaton: {0}: gets -1/-1 and gains flying)
    expect(atomsOf("This creature gets -1/-1 and gains flying until end of turn.")).toEqual([{ op: "pump", target: "self", ptDelta: { p: -1, t: -1 }, grantKeywords: ["Flying"] }]);
  });
  it("MUST stay LOW: granting a keyword NOT in GRANTABLE_STATIC_KEYWORDS → Arbiter (the allowlist IS the FP guard)", () => {
    expect(conf("This creature gains banding until end of turn.")).toBe("low");  // banding un-grantable (horsemanship graduated — BLITZ EQ-1)
  });
  it("menace IS now grantable (GATED-GY-EXT) — self-grant menace parses high", () => {
    expect(conf("This creature gains menace until end of turn.")).toBe("high");
    expect(conf("This creature gets +1/+0 and gains menace until end of turn.")).toBe("high");
  });
});

// ===== KWACT-INVEST — "Investigate" keyword action → create-named-token(clue) =====
// "Investigate" = create a Clue token (CR 701.x); "Investigate N times" = N Clues. Aliased to the shipped
// TOK-2 create-named-token(clue) atom. FIRST-PERSON ONLY — a 3rd-person "<subject> investigates" or a
// variable "Investigate X times" is NOT modeled → LOW (never a Clue minted for the wrong player / unknown count).
describe("parseEffectProgram — Investigate keyword action (KWACT-INVEST)", () => {
  const atomsOf = (o) => parseEffectProgram(I(o)).atoms;
  it("aliases Investigate to a Clue token (count 1 / N), composing with other modeled clauses", () => {
    expect(atomsOf("Investigate.")).toEqual([{ op: "create-named-token", token: "clue", count: 1, targetType: null }]);
    expect(atomsOf("Investigate three times.")).toEqual([{ op: "create-named-token", token: "clue", count: 3, targetType: null }]);
    expect(atomsOf("Investigate four times.")).toEqual([{ op: "create-named-token", token: "clue", count: 4, targetType: null }]);
    // Deduce — draw a card, then investigate (the create-Clue composes after the draw).
    expect(atomsOf("Draw a card. Investigate.")).toEqual([
      { op: "draw", amount: 1, targetType: null },
      { op: "create-named-token", token: "clue", count: 1, targetType: null },
    ]);
  });
  it("MUST stay LOW: a variable count or a 3rd-person (wrong-owner) investigate → Arbiter", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram(I(o)))).toBe("low");
    low("Investigate X times.");                 // variable count — deferred
    low("Each player investigates.");            // STILL wrong owner: whoCreates has no "each player" form
    // GRADUATED 2026-07-30 — "target opponent investigates" was refused because the mint could not express
    // an owner other than the controller. It CAN (whoCreates:"target"), and a runtime test now asserts the
    // Clue reaches the target and NOT the caster. The single-target form is the only one that graduated.
    expect(programConfidence(parseEffectProgram(I("Target opponent investigates.")))).toBe("high");
  });
});

// ===== PUMP-TGT-CTRL — "target creature you control / an opponent controls gets/gains" =====
// Controller-qualified pump + grant — encodes the existing P2.4 restriction-array format so
// enumerateTargets enforces the controller filter (only own or opponent creatures, respectively).
// All-or-nothing: an un-grantable keyword (hexproof/menace/indestructible) still drops → LOW.
describe("parseEffectProgram — PUMP-TGT-CTRL controller-qualified pump/grant", () => {
  const hi = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).toBe("high");
  const lo = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).not.toBe("high");
  const atomOf = (o) => (parseEffectClause(o, "Instant") || {}).atoms?.[0];

  it("'target creature you control gets +N/+N until end of turn' → HIGH, restriction you", () => {
    hi("target creature you control gets +1/+1 until end of turn");
    const a = atomOf("target creature you control gets +2/+0 until end of turn");
    expect(a).toMatchObject({ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 0 }, restrictions: [{ kind: "controller", who: "you" }] });
  });
  it("'target creature an opponent controls gets -N/-N until end of turn' → HIGH, restriction opponent", () => {
    hi("target creature an opponent controls gets -1/-1 until end of turn");
    hi("target creature an opponent controls gets -2/-0 until end of turn");
    const a = atomOf("target creature an opponent controls gets -2/-2 until end of turn");
    expect(a).toMatchObject({ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] });
  });
  it("'target creature you control gains KW until end of turn' → HIGH for grantable keywords", () => {
    hi("target creature you control gains flying until end of turn");
    hi("target creature you control gains trample until end of turn");
    const a = atomOf("target creature you control gains flying until end of turn");
    expect(a).toMatchObject({ op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying"], restrictions: [{ kind: "controller", who: "you" }] });
  });
  it("'target creature you control gets +N/+N and gains KW until end of turn' → HIGH (combo)", () => {
    hi("target creature you control gets +1/+1 and gains trample until end of turn");
    const a = atomOf("target creature you control gets +1/+1 and gains vigilance until end of turn");
    expect(a).toMatchObject({ ptDelta: { p: 1, t: 1 }, grantKeywords: ["Vigilance"], restrictions: [{ kind: "controller", who: "you" }] });
  });
  it("menace is now GRANTABLE (GATED-GY-EXT #343 — enforced at combat resolution, CR 509.1c) → HIGH", () => {
    hi("target creature you control gains menace until end of turn");
  });
  it("MUST stay LOW: un-grantable keyword (banding) still drops the clause", () => {
    // (horsemanship graduated to grantable in BLITZ EQ-1; banding remains un-grantable — the CREED guard holds.)
    lo("target creature you control gains banding until end of turn");
    lo("target creature you control gets +1/+0 and gains banding until end of turn");
    lo("target creature an opponent controls gains banding until end of turn");
  });
  it("unqualified 'target creature gets...' is unchanged (no restriction)", () => {
    const a = atomOf("target creature gets +2/+2 until end of turn");
    expect(a?.restrictions).toBeUndefined();
  });
});

// ===== SELF-BOUNCE — "return this creature to its owner's hand" =====
describe("parseEffectProgram — SELF-BOUNCE self-referential bounce atom", () => {
  const hi = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).toBe("high");
  const lo = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).not.toBe("high");
  const atomOf = (o) => (parseEffectClause(o, "Instant") || {}).atoms?.[0];

  it("'return this creature to its owner's hand' → HIGH, non-targeted self atom", () => {
    hi("return this creature to its owner's hand");
    const a = atomOf("return this creature to its owner's hand");
    expect(a).toMatchObject({ op: "bounce", target: "self" });
    expect(a?.targetType).toBeUndefined();
  });
  it("trigger path routes natively (no chosen target → programNeedsChosenTarget false)", () => {
    const p = parseEffectClause("return this creature to its owner's hand", "Instant");
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
  it("MUST STAY LOW: forms with extra text after the exact anchor (FP-GUARD)", () => {
    lo("return this creature and all tokens to their owners' hands"); // multi-permanent, doesn't match $ anchor
    lo("return this creature to its owner's hand unless its controller pays {2}"); // conditional rider — fails $ anchor
  });
});

// ===== SELF-SACRIFICE — "sacrifice this creature" =====
describe("parseEffectProgram — SELF-SACRIFICE self-referential sacrifice atom", () => {
  const hi = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).toBe("high");
  const lo = (o) => expect(programConfidence(parseEffectClause(o, "Instant"))).not.toBe("high");
  const atomOf = (o) => (parseEffectClause(o, "Instant") || {}).atoms?.[0];

  it("'sacrifice this creature' → HIGH, non-targeted self atom", () => {
    hi("sacrifice this creature");
    const a = atomOf("sacrifice this creature");
    expect(a).toMatchObject({ op: "sacrifice", target: "self" });
    expect(a?.targetType).toBeUndefined();
  });
  it("'sacrifice this creature unless you pay {N}' → HIGH (UPKEEP-SAC-UNLESS-PAY fold)", () => {
    // Deliberate, reviewed widening: the upkeep-tax body (Whipstitched Zombie / Drifting Djinn, and the
    // Kataki/Pendrell-Mists granted self-sac) folds to ONE pausing sac-unless-pay atom — pay keeps it,
    // decline/can't-afford sacrifices the source. Pinned HIGH here so a future refactor can't silently drop it.
    hi("sacrifice this creature unless you pay {2}");
    expect(atomOf("sacrifice this creature unless you pay {2}")).toMatchObject({ op: "sac-unless-pay" });
  });
  it("MUST STAY LOW: forms with riders or conditions (FP-GUARD)", () => {
    lo("sacrifice this creature unless you pay {X}"); // {X} cost — parseFixedManaPips → null → unmodeled
    // NOTE (2026-07-25): "sacrifice this creature at the beginning of the next end step" moved OUT of
    // this guard — the deferred sacrifice it names is now genuinely MODELED (CR 603.7 scheduler,
    // atoms/delayedTrigger.js): it parses to schedule-delayed{sacrifice this creature} on the end step,
    // which is exactly what the card says. Pyric Salamander and Transluminant flip on this shape.
    // The guard's REAL subject — an unmodeled rider/condition — is still pinned by the {X} case above.
  });
});
