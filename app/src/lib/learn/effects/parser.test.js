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
    // clause 1 (damage) is modeled; clause 2 (mill) is not (no atom yet) → whole low.
    const p = parseEffectProgram(I("Deal 2 damage to target creature. Target player mills three cards."));
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
    // mode 2 ("mill three cards") has no atom yet → whole modal low, zero atoms.
    const p = parseEffectProgram(I("Choose one —\n• Draw a card.\n• Target player mills three cards."));
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
  it("keeps wrong-subject / unmodeled-dynamic life low (anchored allowlist holds)", () => {
    // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" is now MODELED (HIGH, enemy-side like
    // damage). A COMPOUND whose OTHER half is unmodeled (the bare "loses 2 life" sub-clause, no subject) still
    // drops the whole program to low (all-or-nothing).
    expect(programConfidence(parseEffectProgram(I("Target player loses 2 life.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Target player draws two cards and loses 2 life.")))).toBe("low");
    // NOTE: a CONTROLLER count-scaled life ("for each creature you control" / "equal to the number of …")
    // is now MODELED by FOR-EACH (WALT-FOR-EACH) → HIGH (pinned there). A count source we DON'T model still
    // stays low:
    expect(programConfidence(parseEffectProgram(I("You gain 2 life for each creature an opponent controls.")))).toBe("low"); // opponent-scoped
    expect(programConfidence(parseEffectProgram(I("You gain 2 life for each other creature you control.")))).toBe("low");     // "other" self-exclusion (subtypes are now modeled)
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
    low("Target player draws two cards and loses 2 life.");       // Painful Lesson — bare "loses 2 life" unmodeled
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
  it("keeps at-random / X / their-hand / half / opponent / riders low (anchored allowlist holds)", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram(I(o)))).toBe("low");
    low("Target player discards two cards at random.");                          // Hymn to Tourach — RNG, no choice
    low("Target player discards X cards at random.");                            // Mind Twist — variable + RNG
    low("Target player discards their hand.");                                   // Wit's End — different amount shape (deferred)
    low("Target opponent discards half the cards in their hand, rounded up.");   // Rush of Dread — dynamic count
    low("Target opponent discards two cards, mills a card, and loses 1 life.");  // Mind Drain — unmodeled riders
    low("Each player discards a card, then loses 1 life.");                      // Strongarm-ish — life rider
    low("Target opponent discards two cards.");                                  // opponent form deferred this slice
    low("Each player discards their hand, then draws seven cards.");             // Wheel of Fortune — "their hand" + variable draw
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
    expect(programConfidence(parseEffectProgram(I("Exile target creature you control.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Tap target artifact.")))).toBe("low");          // tap is creature-only
    expect(programConfidence(parseEffectProgram(I("Destroy target tapped artifact.")))).toBe("low"); // unmodeled restriction
    expect(programConfidence(parseEffectProgram(I("Destroy target artifact creature.")))).toBe("low"); // not a bare type
    expect(programConfidence(parseEffectProgram(I("Return target nonland permanent to its owner's hand.")))).toBe("high"); // β-3: bounce-permanent modeled
    expect(programConfidence(parseEffectProgram(I("Return target tapped artifact to its owner's hand.")))).toBe("low");   // an unmodeled restriction on bounce → Arbiter
    expect(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield.")).atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" }]); // β-3b reanimation
    expect(programConfidence(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield tapped.")))).toBe("low"); // reanimation rider → Arbiter
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
  });
  it("MUST_DROP_TO_LOW: opponent-scoped / subtype / 'don't control' / other-graveyard sources → Arbiter", () => {
    expect(conf("Draw a card for each creature target opponent controls.")).toBe("low");   // opponent-scoped
    expect(conf("Draw a card for each creature you don't control.")).toBe("low");           // negated control
    expect(conf("You gain 2 life for each other creature you control.")).toBe("low");        // "other" self-exclusion (subtypes ARE modeled now — WALT-COUNT-SUBTYPE)
    expect(conf("Draw a card for each creature card in their graveyard.")).toBe("low");     // not YOUR graveyard
    expect(conf("Draw a card for each Arcane card in your graveyard.")).toBe("low");         // spell subtype — deferred
    expect(conf("You gain 2 life for each other creature you control.")).toBe("low");        // "other" (self-exclusion) — deferred
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
    expect(conf("You gain 1 life for each other Elf you control.")).toBe("low");                                    // "other"
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
  it("FOREACH-TOK MUST_DROP_TO_LOW: unmodeled source / 0-toughness / land token → Arbiter", () => {
    const conf = (txt) => programConfidence(parseEffectProgram(I(txt)));
    expect(conf("Create a 1/1 green Saproling creature token for each other creature you control.")).toBe("low"); // "other" self-exclusion (subtypes ARE modeled now)
    expect(conf("Create a 1/1 green Saproling creature token for each creature an opponent controls.")).toBe("low"); // opponent-scoped
    expect(conf("Create a 0/0 green Plant creature token for each land you control.")).toBe("low");        // 0-toughness dies to SBA
    expect(conf("Create a 0/1 green Dryad land creature token for each Forest you control.")).toBe("low"); // LAND creature token (intrinsic mana dropped)
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

// ===== TOKENS ===== T2 — NAMED ARTIFACT TOKENS (TOK-2). Treasure/Clue/Food/Gold enter as real
// artifact permanents whose printed ability the engine drives (mana model for Treasure/Gold, the
// activated-ability stack path for Clue/Food). Blood/Map/Powerstone stay low (unmodeled cost/effect).
describe("parseEffectProgram — named artifact tokens (TOK-2)", () => {
  it("parses the four modeled named tokens to a create-named-token atom", () => {
    expect(parseEffectProgram(I("Create a Treasure token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "treasure", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Clue token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "clue", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Food token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "food", count: 1, targetType: null }]);
    expect(parseEffectProgram(I("Create a Gold token.")).atoms)
      .toEqual([{ op: "create-named-token", token: "gold", count: 1, targetType: null }]);
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
  it("MUST_DROP_TO_LOW: unmodeled named tokens (Blood/Map/Powerstone) + an unmodeled count source", () => {
    expect(programConfidence(parseEffectProgram(I("Create a Blood token.")))).toBe("low");      // discard cost unmodeled
    expect(programConfidence(parseEffectProgram(I("Create a Map token.")))).toBe("low");        // explore + sorcery-speed target unmodeled
    expect(programConfidence(parseEffectProgram(I("Create a Powerstone token.")))).toBe("low"); // restricted mana unmodeled
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
    // A LAND creature token (descriptor contains "land") drops its intrinsic mana ability if minted
    // vanilla → low → Arbiter (Awaken the Woods); applies to fixed counts too.
    expect(programConfidence(parseEffectProgram(X("Create X 1/1 green Forest Dryad land creature tokens.", "{X}{G}{G}")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Create two 1/1 green Saproling land creature tokens.")))).toBe("low");
    // (A plain 0/1 Plant token has toughness 1 — a legit vanilla token, stays HIGH; the land-ness of
    // Khalni Garden lives on the LAND, not the token, so the guard must NOT over-reach to non-land tokens.)
    expect(programConfidence(parseEffectProgram(I("Create a 0/1 green Plant creature token.")))).toBe("high");
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
  // ── KWSTRIP-1 — only the SIX vacuous cast-keyword lines are stripped. A NON-vacuous keyword
  // (rebound/cipher/conspire/learn/proliferate/amass) is NOT stripped → its line is an unparseable clause
  // → low; and a vacuous-keyword card whose BODY is unmodeled also stays low (all-or-nothing). ──
  "Target creature gets +1/+0 until end of turn.\nRebound",                     // rebound — NOT vacuous (recasts) → not stripped → low
  "Target player discards a card.\nCipher",                                     // cipher — NOT vacuous (encodes) → not stripped → low
  "Suspend 4—{1}{R}\nEach player discards their hand, then draws seven cards.", // Wheel of Fate — suspend stripped, but the body is unmodeled → low
  "Foretell {3}{B}{B}\nReturn all creature cards from your graveyard to the battlefield.", // foretell stripped, but the MASS-reanimation body is unmodeled → low
  // ── P3.1 counter target spell — the riders that must STAY low (the modeled shapes
  // are pinned HIGH in MUST_STAY_HIGH + the dedicated describe block below). The
  // anchored allowlist drops anything that isn't EXACTLY a bare "Counter target
  // [noncreature|creature]? spell". ──
  "Counter target spell unless its controller pays {X}.",       // Clash of Wills — variable {X} tax stays low (SOFT-CNT models fixed {N} only)
  "Counter target spell unless its controller pays {1} for each card in your hand.", // tax
  "Counter target spell or ability.",                            // "or ability" — not a bare spell target
  "Counter target activated or triggered ability.",              // an ability is not a spell
  "Counter up to two target spells.",                            // "up to two" cardinality unmodeled
  "Counter target spell with mana value 3 or less.",             // mana-value rider unmodeled
  "Counter target creature or planeswalker spell.",              // "or planeswalker" — not the modeled filter
  "Counter target spell. If that spell is countered this way, exile it instead.", // replacement rider
  // ── P3.1 corpus-confirmed riders (REAL Scryfall cards the sweep verified stay LOW) ──
  "Counter target artifact or enchantment spell.",                     // Annul — unmodeled filter
  "Counter target spell. Its controller mills four cards.",            // Countermand — unmodeled mill rider
  "Counter target noncreature spell. Its controller loses 2 life.",    // Countersquall — "its controller" subject unmodeled
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
  "Search your library for up to three creature cards, put them onto the battlefield tapped, then shuffle.", // WAVE-2b UP-TO-N keeps the LAND-guard: a non-land multi-fetch stays low
  "Search your library for a green creature card, put it onto the battlefield, then shuffle.",  // RAMP-1 restricts battlefield fetch to LANDS; a creature cheat-into-play (Natural Order) stays low
  "Search your library for a basic Forest or Island card, put it onto the battlefield, then shuffle.",  // RAMP-TYPED: AMBIGUOUS-basic union (Quandrix Cultivator) — "basic" must distribute but the split can't prove it → Arbiter
  // RAMP-MULTI models the bare "up to N <land> → battlefield"; RAMP-SPLIT models the Cultivate "one … the
  // other" split (intrinsically two) — an "up to THREE" SPLIT (one-and-the-other) stays low.
  "Search your library for up to three basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",  // RAMP-SPLIT is two-only; "up to three" split stays low
  // RIDER-REMOVAL — the UNMODELED controller-riders that must stay LOW (the lead removal is modeled, but an
  // all-or-nothing card never fires the removal while silently dropping the rider).
  "Destroy target creature. Its controller loses 2 life.",                                            // lose-life rider (Sip of Hemlock)
  "Destroy target creature. It can't be regenerated. Its controller creates a 1/1 white Spirit creature token with flying.", // Afterlife — the "can't be regenerated" clause keeps the lead from matching → Arbiter
  "Exile target nonland permanent. Its controller creates a 3/2 red and white Spirit creature token.", // MULTI-COLOR token (Reduce to Memory)
  // SOFT-COUNTER-RIDER — soft-counter NOT hijacked, and delayed/conditional counter-riders stay low.
  "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.", // Arcane Denial (delayed draw)
  "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying and you gain 2 life.", // a rider tail past the keyword → low
  "Search your library for a basic land card, put it on top of your library, then shuffle.",       // top-of-library
  "Search your library for up to two basic land cards, put them into your hand, then shuffle.",     // multi-card
  "Search your library for a nonland card, put it into your hand, then shuffle.",                   // "nonland" not in any type line
  "Search your library for a card named Lightning Bolt, put it into your hand, then shuffle.",      // by-name
  "Draw a card and search your library for a creature card and put it into your hand.",             // leading-effect leak (review catch) — must NOT parse HIGH as [draw]
  "Destroy target creature unless its controller pays {2}.",   // legacy over-matches → MUST drop
  "Destroy target artifact with mana value 3 or less.",         // unmodeled MV restriction on a permanent → MUST drop
  "Destroy target nonbasic land.",                              // unmodeled "nonbasic" qualifier → MUST drop
  "Destroy target white or blue creature.",                     // β-1 models a single non<color>, NOT a color UNION → MUST drop
  "Destroy target legendary creature.",                         // unmodeled "legendary" supertype → MUST drop
  // FILTERED board wipes — `eachCreature` would wrongly hit the UNFILTERED set, so the exact
  // "all creatures" anchor must reject any qualifier (color/type/keyword/controller).
  "Destroy all creatures with flying.",                         // keyword filter → not all creatures
  "Destroy all nonblack creatures.",                            // color filter
  "Exile all creatures you don't control.",                     // controller filter
  "Destroy all nonbasic lands.",                                // MASS-NC: unfiltered NC wipes are modeled now; a FILTERED one stays low
  "All creatures get -1/-1 until end of turn and can't block.", // pump rider (can't block) — keyword effect dropped
  // Combat-trick keyword grants must drop when the granted keyword isn't enforced (a fake
  // grant is forbidden) — the grantable set is the layer-aware combat keywords, NOT these.
  "Target creature gains hexproof until end of turn.",          // hexproof not enforced/grantable
  "Target creature gains indestructible until end of turn.",    // indestructible not grantable
  "Target creature gets +2/+2 and gains protection from red until end of turn.", // protection not grantable
  // Review catch (no-split + all-or-nothing): a grant chained to a non-keyword via " and "
  // must NOT parse high with a partial grant — the whole clause is unmodeled → Arbiter.
  "Target creature gains trample and draws a card until end of turn.", // "draws a card" is not a keyword
  "Target creature gains flying and gets +2/+2 until end of turn.",    // mixed ordering, one token non-keyword
  // ── TEAM pump (scope:youControl) — only the EXACT unfiltered "creatures you control get
  // +N/+N [and gain <enforced kw>] until end of turn" is modeled. A filtered/wrong-scope set,
  // an unenforced granted keyword, or a pure (no-P/T) team grant must stay LOW → Arbiter, so a
  // team buff is never applied to the wrong creatures or fabricated. ──
  "Attacking creatures get +2/+0 until end of turn.",                  // Trumpet Blast — "attacking" subset, not modeled
  "Other creatures you control get +1/+1 until end of turn.",          // "other" excludes the source — different set
  "Creatures you control with flying get +1/+1 until end of turn.",    // keyword-filtered subset
  "White creatures you control get +1/+1 until end of turn.",          // color-filtered subset
  "Creatures you control get +1/+1 and gain hexproof until end of turn.", // hexproof not grantable/enforced
  "Creatures you control gain trample until end of turn.",             // pure team keyword grant (no P/T) — deferred
  // OVERRUN-X — count-scaled team pump ("…gain trample and get +X/+X, where X is <count>"): a FILTERED team,
  // an unmodeled count source, or an un-grantable keyword stays LOW → Arbiter (never a half-scaled native).
  "Until end of turn, creatures you control with flying gain trample and get +X/+X, where X is the greatest power among creatures you control.",        // filtered subset
  "Until end of turn, creatures you control gain trample and get +X/+X, where X is the number of cards in target opponent's hand.",                     // unmodeled count source
  "Until end of turn, creatures you control gain indestructible and get +X/+X, where X is the greatest power among creatures you control.",             // indestructible not grantable on the combat-trick path
  // SELF-reference (trigger/activated vocabulary) — "this creature" is modeled (= the source);
  // the ambiguous "it" (could be a prior target, not the source) stays LOW → Arbiter.
  "It gets +2/+0 until end of turn.",                                   // "it" is ambiguous — deferred
  "It gains flying until end of turn.",                                 // "it" keyword grant — deferred
  // SCRY / SURVEIL — only the numeric standalone form is modeled; a variable amount or a ", then"
  // combo (a splitClauses follow-up) stays LOW → Arbiter. (A "you may scry 2" is now an OPTIONAL
  // scry — pinned HIGH in MUST_STAY_HIGH, α2.)
  "Scry X.",                                                            // variable amount — deferred
  // α2 — "you may" wraps an OPTIONAL effect, but a "you may PAY <cost>" (kicker) is a COST, not an
  // optional effect → stays LOW; likewise "you may <unmodeled effect>".
  "You may pay {2}. If you do, draw a card.",                          // optional COST (kicker) — deferred
  "You may sacrifice a creature.",                                      // optional UNMODELED effect — deferred
  "You may draw a card and gain 2 life.",                              // conjoined "you may X and Y" — optionality scope ambiguous → low (α2 forward guard)
  // ── GRAVEYARD RECURSION (return-from-graveyard) — single-target "return target <X> card from YOUR
  // graveyard to your HAND". REG-1 widened the modeled <X> to any basic type / " or " union / "permanent"
  // (see gyRecursion.test.js for those HIGH pins). A NON-type filter (subtype / color / negation /
  // intersection), another graveyard, multi-card cardinality, or a battlefield (reanimation) destination
  // must stay LOW → Arbiter, so we never mis-target the graveyard or silently drop a rider. ──
  "Return up to two target creature cards from your graveyard to your hand.",       // "up to two" cardinality
  "Return target goblin card from your graveyard to your hand.",                    // creature SUBTYPE — unmodeled (REG-1 models types, not subtypes)
  "Return target nonland permanent card from your graveyard to your hand.",         // negation — unmodeled
  "Return target artifact creature card from your graveyard to your hand.",         // INTERSECTION (both), not a union — unmodeled
  "Return target creature card from a graveyard to your hand.",                     // ANY graveyard, not "your"
  "Return target creature card from your graveyard to the battlefield under your control.", // β-3b: a reanimation RIDER stays low (bare form is HIGH)
  "Return target creature card from your graveyard to the battlefield with a +1/+1 counter on it.", // counter rider → low
  // NOTE: "Each player draws a card." / "Target player draws N cards." are now HIGH (EACH-PLAYER draw
  // slice) — see the dedicated describe block above. They are intentionally NOT in this stay-low corpus.
  "Target player discards a card at random.",
  "Deal damage to target creature equal to the number of Mountains you control.",
  // Modal that should stay low (MODAL-2 models "choose two"/"one or both" when EVERY mode is modeled;
  // these stay low because a mode is UNMODELED — all-or-nothing across modes).
  "Choose two —\n• Draw a card.\n• Each player reveals their hand, then you choose a noncreature card from it.",
  // P2.5 SPLITS on " and " — but a clause whose SECOND half is unmodeled (gain/lose
  // life, counter, discard, a verbless damage fragment, a comma-rider) still drops
  // the WHOLE program (all-or-nothing). These are the false-high vectors P2.2 guarded
  // with a denylist; P2.5 keeps them low because a split clause fails to parse.
  "Char deals 4 damage to any target and 2 damage to you.",              // "2 damage to you" has no verb → low
  "Deals 2 damage to target creature and 2 damage to target player.",    // 2nd clause verbless → low
  "Draw two cards, discard a card.",                                     // comma-rider (NOT split) → low
  // Unmodeled target restrictions — HIGH would permit an illegal target. P2.4 + β-1 model
  // controller/tapped/power/combat/non-color/non-type; positive-type/keyword/named stay unmodeled.
  "Destroy target enchantment creature.",                                 // positive type restriction (IS an enchantment) — not modeled
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
  "Look at the top three cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.", // multi-pick
  "Reveal the top three cards of your library. Put one of them into your hand and the rest into your graveyard.", // reveal, not look
  "Look at the top X cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.", // variable X count
  // ===== COUNTERS ===== TEAM distribution ("…on each creature you control") — only the EXACT unfiltered
  // form is modeled (scope:youControl buffs the WHOLE team, so a filtered subset / wrong scope must drop). ──
  "Put a +1/+1 counter on each creature you control with flying.",          // Wingspan Mentor — keyword-filtered subset
  "Put a +1/+1 counter on each creature you control other than this creature.", // Dawnstrike Vanguard — excludes the source
  "Put a +1/+1 counter on each creature you control with a +1/+1 counter on it.", // Patron of the Valiant — counter-filtered subset
  "Put a +1/+1 counter on each creature you control that entered this turn.", // Raucous Entertainer — entered-this-turn subset
  "Put X +1/+1 counters on each creature you control, where X is the number of Elves you control.", // Voja — variable X (+ "where X is" rider)
  "Put a -1/-1 counter on each creature you don't control.",                // Liliana's Influence — WRONG scope ("don't control")
  "Put a +1/+1 counter on each creature target player controls.",           // Practiced Offense — target player, not the controller
  "Put a -1/-1 counter on each creature.",                                  // Soul Snuffers — ALL creatures (not "you control"); not this slice
  "Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.", // Felidar Retreat mode — rider clause unmodeled → whole drops (no silent partial)
  // ===== COUNTERS ===== OPTIONAL single target ("…on up to one target creature") — only the EXACT bare
  // form is modeled; any creature filter OR the multi-target "each of up to two" / "distribute" forms
  // leave trailing text → must drop (deferred to a later CNT-2 sub-slice / the Arbiter). ──
  "Put a +1/+1 counter on up to one target creature you control.",          // Essence Capture rider — "you control" filter
  "Put a +1/+1 counter on up to one target Dinosaur you control.",          // Huatli — creature-subtype filter
  "Put a +1/+1 counter on up to one target creature an opponent controls.", // opponent-controlled filter
  "Put a +1/+1 counter on each of up to two target creatures.",             // Rishkar / Travel Preparations — multi-target subset (deferred CNT-2b)
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
  // ED-2 boundary — each-player / each-opponent sacrifice OUTSIDE the bare "a creature" form stays LOW (a
  // count / non-creature / type-union / "all" would sacrifice the wrong thing — a forbidden false positive).
  "Each player sacrifices two creatures of their choice.",                      // a count (Barter in Blood / Tergrid's Shadow)
  "Each player sacrifices a land of their choice.",                             // non-creature victim (Tremble)
  "Each player sacrifices all permanents they control that are one or more colors.", // "all" (All Is Dust)
  "Each opponent sacrifices a creature or planeswalker of their choice.",       // type UNION (Dark Intimations)
  "Each opponent sacrifices an artifact.",                                      // non-creature victim (Visions of Ruin)
  "You sacrifice a creature.",                                                  // controller "you sacrifice" — bare controller-sac deferred (α2-interaction risk)

  // ===== EACH-PLAYER ===== discard (EP-2) — only the bare numeric "target/each player discards N cards"
  // is modeled (the discarding player chooses). "at random" (RNG, no choice), X, "their hand", "half",
  // the "target opponent" form (deferred — 0 clean cards this slice), or any unmodeled rider drops to low.
  "Target player discards two cards at random.",                                // Hymn to Tourach — RNG, no choice
  "Target player discards X cards at random.",                                  // Mind Twist — variable + RNG
  "Target player discards their hand.",                                         // Wit's End — different amount shape (deferred)
  "Target player discards their hand unless they pay 7 life.",                  // Tyrannize — conditional
  "Target opponent discards two cards, mills a card, and loses 1 life.",        // Mind Drain — unmodeled riders
  "Each player discards a card, then loses 1 life.",                            // Strongarm Tactics-ish — life rider
  "Target opponent discards two cards.",                                        // opponent form deferred this slice
  "Each player discards their hand, then draws seven cards.",                   // Wheel of Fortune — "their hand" + variable draw
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
  "Strangle deals 3 damage to target creature or planeswalker.",                // PW-6: planeswalkers are now damageable targets (loyalty removal)
  // ── β-1 — creature-target restrictions the engine now ENFORCES at enumeration: combat state +
  // non-color + non-type (Doom Blade / Go for the Throat / Divine Verdict). A color UNION / positive
  // type / "legendary" / keyword filter still drops to low (pinned in MUST_DROP_TO_LOW). ──
  "Destroy target nonblack creature.",                                          // color negation (Doom Blade)
  "Destroy target nonartifact creature.",                                       // type negation (Go for the Throat)
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
    expect(programConfidence(parseEffectProgram(I("Suspend 4—{1}{R}\nEach player discards their hand, then draws seven cards.")))).toBe("low");
  });
  it("does NOT strip a non-vacuous keyword (rebound / cipher) — the card stays low → Arbiter", () => {
    expect(programConfidence(parseEffectProgram(I("Target creature gets +1/+0 until end of turn.\nRebound")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Target player discards a card.\nCipher")))).toBe("low");
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
    expect(programConfidence(parseEffectProgram(I("Creatures you control get +1/+1 and gain hexproof until end of turn.")))).toBe("low");
    expect(parseEffectProgram(I("Creatures you control get +1/+1 and gain hexproof until end of turn.")).atoms).toHaveLength(0);
  });
  it("is not flagged as mass removal (a team pump is not a wipe)", () => {
    const p = parseEffectProgram(I("Creatures you control get +2/+2 until end of turn."));
    expect(programContainsTeamPump(p)).toBe(true);
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
    KNOWN_ATOM_OPS.forEach((op) => expect(programConfidence({ atoms: [{ op }] })).toBe("high"));
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
  it("MUST DROP TO LOW: an effect that REFERENCES the sacrificed object (Fling / Reckoner's Bargain)", () => {
    // Fling — damage equal to the sacrificed creature's power. The engine can't feed the victim's stats in.
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nThis spell deals damage equal to the sacrificed creature's power to any target.")))).toBe("low");
    // Reckoner's Bargain — gain life equal to the sacrificed creature's toughness.
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards, then you gain life equal to the sacrificed creature's toughness.")))).toBe("low");
  });
  it("MUST DROP TO LOW: an unmodeled cost shape (count / compound type / 'another') is NOT stripped", () => {
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice two creatures.\nDraw two cards.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw a card.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice another creature.\nDraw a card.")))).toBe("low");
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
  it("ADDCOST-2 MUST DROP TO LOW: multi-card discard / X-life / self-ref-discard are deferred", () => {
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, discard two cards.\nDraw three cards.")))).toBe("low");   // N>1 discard deferred (Cathartic Reunion)
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, pay X life.\nDraw X cards.")))).toBe("low");               // X-life deferred (+ X-cost compound)
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, discard a card.\nDraw cards equal to the discarded card's mana value.")))).toBe("low"); // self-ref / cost-scaled effect
  });
  it("MUST DROP TO LOW: a sac cost whose REMAINING effect is itself unmodeled (all-or-nothing)", () => {
    // The sac cost is clean, but a SCALED drain ("loses life equal to …") is not a modeled atom → LOW.
    // (The numeric "Target player loses N life" is now modeled by DEATH-DRAIN-TARGETED; the scaled form isn't.)
    expect(programConfidence(parseEffectProgram(I("As an additional cost to cast this spell, sacrifice a creature.\nTarget player loses life equal to the number of creatures you control.")))).toBe("low");
  });
});

// ===== ACT-KW-GRANT — self keyword-grant (activated/trigger effect, via parseEffectClause) =====
// "This creature [gets +N/+N and ]gains <KW> until end of turn" grants the SOURCE (CR 109.2) the
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
  it("MUST stay LOW: granting a keyword NOT in GRANTABLE_COMBAT_KEYWORDS → Arbiter (the allowlist IS the FP guard)", () => {
    expect(conf("This creature gains indestructible until end of turn.")).toBe("low");  // combat-trick set excludes it
    expect(conf("This creature gains hexproof until end of turn.")).toBe("low");
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
    low("Each player investigates.");            // wrong owner — the Clue isn't the controller's
    low("Target opponent investigates.");        // wrong owner
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
  it("MUST stay LOW: un-grantable keywords (hexproof, indestructible) still drop the clause", () => {
    lo("target creature you control gains hexproof until end of turn");
    lo("target creature you control gets +1/+0 and gains indestructible until end of turn");
    lo("target creature an opponent controls gains hexproof until end of turn");
  });
  it("unqualified 'target creature gets...' is unchanged (no restriction)", () => {
    const a = atomOf("target creature gets +2/+2 until end of turn");
    expect(a?.restrictions).toBeUndefined();
  });
});
