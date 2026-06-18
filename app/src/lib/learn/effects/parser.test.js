/**
 * Tests for effects/parser.js — the EffectProgram shape + the confidence boundary.
 *
 * This is the highest-value test file in P2.2: the MUST_DROP_TO_LOW corpus pins
 * the fail-safe so a future parser change can't silently widen "high" and start
 * resolving the WRONG behavior (the #1 Phase-2 risk). Widening "high" must edit
 * this corpus deliberately.
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence, programContainsCounter, programContainsTeamPump, programNeedsChosenTarget, KNOWN_ATOM_OPS } from "./parser.js";

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
    expect(programConfidence(parseEffectProgram(I("Return target creature card from your graveyard to the battlefield.")))).toBe("low"); // reanimation deferred
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

// THE FAIL-SAFE GATE. Every near-miss / unmodeled instant-or-sorcery MUST drop to
// a low-confidence, ZERO-atom program (→ Arbiter seam). Crucially this includes
// oracles the LOOSE legacy regexes over-match (e.g. "destroy target creature
// unless …", which legacy parses as a plain destroy) — the clean-clause gate
// catches the rider so the interpreter never resolves the wrong thing.
const MUST_DROP_TO_LOW = [
  // ── P3.1 counter target spell — the riders that must STAY low (the modeled shapes
  // are pinned HIGH in MUST_STAY_HIGH + the dedicated describe block below). The
  // anchored allowlist drops anything that isn't EXACTLY a bare "Counter target
  // [noncreature|creature]? spell". ──
  "Counter target spell unless its controller pays {3}.",       // Mana Leak tax — "unless" unmodeled
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
  "Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.\n• Draw a card.", // Cryptic Command — "choose two"
  "Counter target spell you don't control.",                           // Counterflux — "you don't control" unmodeled
  // ── P3.2 tutor — shapes that must STAY low (unmodeled filter / destination / count) ──
  "Search your library for a Dragon card, reveal it, put it into your hand, then shuffle.",        // creature subtype (deferred)
  "Search your library for a creature card with mana value 3 or less, put it into your hand, then shuffle.", // mana-value rider
  "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",  // battlefield destination (deferred)
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
  "Destroy all artifacts and enchantments.",                    // not creatures (noncreature wipe)
  "All creatures get -1/-1 until end of turn and can't block.", // pump rider (can't block) — keyword effect dropped
  // Combat-trick keyword grants must drop when the granted keyword isn't enforced (a fake
  // grant is forbidden) — the grantable set is the layer-aware combat keywords, NOT these.
  "Target creature gains hexproof until end of turn.",          // hexproof not enforced/grantable
  "Target creature gains indestructible until end of turn.",    // indestructible not grantable
  "Target creature gets +1/+1 and gains menace until end of turn.", // menace not grantable (unenforced)
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
  "Creatures you control get +2/+2 and gain menace until end of turn.",   // menace not grantable (unenforced)
  "Creatures you control gain trample until end of turn.",             // pure team keyword grant (no P/T) — deferred
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
  // ── GRAVEYARD RECURSION (return-from-graveyard) — only the bare single-target "return target
  // [creature] card from YOUR graveyard to your HAND" is modeled. A different filter, another
  // graveyard, multi-card cardinality, or a battlefield (reanimation) destination must stay LOW →
  // Arbiter, so we never mis-target the graveyard or silently drop a rider. ──
  "Return up to two target creature cards from your graveyard to your hand.",       // "up to two" cardinality
  "Return target instant or sorcery card from your graveyard to your hand.",        // unmodeled filter
  "Return target artifact card from your graveyard to your hand.",                  // unmodeled filter
  "Return target permanent card from your graveyard to your hand.",                 // unmodeled filter
  "Return target creature card from a graveyard to your hand.",                     // ANY graveyard, not "your"
  "Return target creature card from your graveyard to the battlefield.",            // reanimation (battlefield dest)
  "Return target creature or land card from your graveyard to your hand.",          // multi-type filter
  "Each player draws a card.",
  "Target player discards a card at random.",
  "Deal damage to target creature equal to the number of Mountains you control.",
  // Modal that should stay low: "choose two" (multi-mode pick deferred), and a
  // modal with an unmodeled mode (counter-spell not an atom yet).
  "Choose two —\n• Draw a card.\n• Destroy target creature.",
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
  "Strangle deals 3 damage to target creature or planeswalker.",                // "or planeswalker" must NOT become "any" (illegal player target)
  "Wither (This deals damage to creatures in the form of -1/-1 counters.)\nGut Punch deals 3 damage to any target.", // wither changes the damage TYPE
  // ── P2.8b (flush-time target chooser) review catch: "at random" is a selection the
  // engine doesn't model. Picking first-legal would be DETERMINISTIC, not random — so a
  // damage-at-random clause must route to the Arbiter, never a fabricated (fixed) pick.
  // (Surfaced by a corpus scan of the newly-routing targeted triggers: Knight Rampager.)
  "Goblin Sniper deals 1 damage to target opponent chosen at random.",
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
  // ── Scry / surveil (CR 701.18 / 701.43) — numeric standalone + ". "-separated multi-clause. ──
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
];

describe("parseEffectProgram — review-confirmed HIGH (must NOT over-correct)", () => {
  it.each(MUST_STAY_HIGH)("stays high: %s", (oracle) => {
    expect(programConfidence(parseEffectProgram(I(oracle)))).toBe("high");
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

describe("programConfidence — pure shape function", () => {
  it("is low for an absent/empty program; high only when every atom is a known op", () => {
    expect(programConfidence(null)).toBe("low");
    expect(programConfidence({ atoms: [] })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "draw" }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }, { op: "counter-spell" }] })).toBe("low"); // one unknown → low
    KNOWN_ATOM_OPS.forEach((op) => expect(programConfidence({ atoms: [{ op }] })).toBe("high"));
  });
});
