/**
 * FORMIDABLE SPEAKER — a mixed permanent: an ETB reflexive/optional-payment trigger + a {1}{T} untap ability.
 *
 *   "When this creature enters, you may discard a card. If you do, search your library for a creature card,
 *    reveal it, put it into your hand, then shuffle.
 *    {1}, {T}: Untap another target permanent."
 *
 * TWO seams shipped together to flip this ONE card (all-or-nothing composite — permanentFullyCovered):
 *
 *  (1) UNTAP-ANOTHER-TARGET-PERMANENT (CR 109.5) — combatKeywordClauseParser now parses "untap another target
 *      permanent" / "untap target permanent" / "untap another target creature" → { op:"untap", targetType, and
 *      a notSource restriction for the "another" forms }. The targetType routes through PERMANENT_PREDICATES;
 *      the notSource restriction (spellEffects.creatureSatisfiesRestrictions) excludes the SOURCE permanent
 *      (ctx.sourceId, threaded from the activated ability's expandCastChoices). FAIL-CLOSED: no sourceId → no
 *      target (never targets the wrong permanent). applyTapEffect untaps the verified live target.
 *
 *  (2) OPTIONAL-DISCARD-PAYMENT with a LAST-position pausing payoff — matchOptionalDiscardPayment previously
 *      REJECTED any pausing payoff. But resolveOptionalDiscardPaymentChoice runs [cost-discard, ...payoff] as
 *      ONE program through runEffectProgram, whose resume cursor chains SEQUENTIAL pauses. So a trailing tutor-
 *      to-hand payoff ("search your library for a creature card, … put it into your hand, then shuffle") is
 *      SAFE: discard pauses (which-card) → settles → tutor pauses (which-creature) → settles → done, strictly
 *      sequential, never interleaved, never a dropped atom. The guard is relaxed to inner.slice(0,-1) — only a
 *      NON-last pausing payoff still stays LOW (mirrors matchOptionalDrawDiscard).
 *
 * CREED: false-negatives are safe, a fabricated/partial play is forbidden. The near-misses below prove the
 * discipline — a qualified untap ("untap target permanent you control"), a mid-payoff pause, a DECLINED discard
 * (no fabricated fetch), and a fail-closed "another" without a source all stay non-native / no-op.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard, permanentFullyCovered } from "./coverage.js";
import { expandCastChoices } from "./effects/targeting.js";
import { runEffectProgram, resolveOptionalDiscardPaymentChoice, resolveDiscardChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const FORMIDABLE_SPEAKER = {
  id: "c-fs", name: "Formidable Speaker", type: "Creature — Elf Druid", power: 2, toughness: 4, mana: "{2}{G}",
  oracle: "When this creature enters, you may discard a card. If you do, search your library for a creature card, reveal it, put it into your hand, then shuffle.\n{1}, {T}: Untap another target permanent.",
};
// Real siblings (each fully-modeled → native):
const KIORAS_FOLLOWER = { id: "c-kf", name: "Kiora's Follower", type: "Creature — Merfolk", power: 2, toughness: 2, mana: "{G}{U}", oracle: "{T}: Untap another target permanent." };
const BURST_OF_ENERGY = { id: "c-boe", name: "Burst of Energy", type: "Instant", mana: "{W}", oracle: "Untap target permanent." };

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms, manaPool: { ...EMPTY_POOL } } } };
}

// ─── (1) Parser — untap-another / untap-permanent ─────────────────────────────────
describe("FORMIDABLE SPEAKER — untap-another-target-permanent parser", () => {
  it("'untap another target permanent' → high, notSource restriction", () => {
    const r = parseEffectClause("untap another target permanent.", "Creature");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "permanent", restrictions: [{ kind: "notSource" }] }] });
  });
  it("'untap target permanent' (no 'another') → high, no restriction", () => {
    const r = parseEffectClause("untap target permanent.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "permanent", restrictions: [] }] });
  });
  it("'untap another target creature' → high, notSource restriction", () => {
    const r = parseEffectClause("untap another target creature.", "Creature");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "creature", restrictions: [{ kind: "notSource" }] }] });
  });
  it("the plain 'untap target creature' form is untouched (no restriction)", () => {
    const r = parseEffectClause("untap target creature.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "creature" }] });
    expect(r.atoms[0].restrictions).toBeUndefined();
  });
  it("CREED near-miss: qualified / X / tap-or-untap forms stay LOW (Arbiter)", () => {
    expect(parseEffectClause("untap target permanent you control.", "Creature").confidence).toBe("low");
    expect(parseEffectClause("untap another target permanent you control.", "Creature").confidence).toBe("low");
    expect(parseEffectClause("untap two other target legendary creatures.", "Creature").confidence).toBe("low");
    expect(parseEffectClause("you may tap or untap another target permanent.", "Creature").confidence).toBe("low");
  });
});

// ─── (2) Parser — optional-discard-payment with a tutor-to-hand (last-position pausing) payoff ───
describe("FORMIDABLE SPEAKER — optional-discard-payment with a trailing tutor payoff", () => {
  const ETB = "You may discard a card. If you do, search your library for a creature card, reveal it, put it into your hand, then shuffle.";
  it("folds to ONE optional-discard-payment atom whose payoff is the tutor (HIGH)", () => {
    const p = parseEffectClause(ETB, "Creature", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["optional-discard-payment"]);
    expect(p.atoms[0].effectAtoms.map((a) => a.op)).toEqual(["tutor"]);
    expect(p.atoms[0].effectAtoms[0]).toMatchObject({ destination: "hand" });
  });
  it("CREED near-miss: a MID-payoff pause (tutor NOT last) stays LOW", () => {
    // tutor-to-hand THEN draw — the tutor pauses but is no longer last → not folded (only last may pause).
    const p = parseEffectClause("You may discard a card. If you do, search your library for a creature card, put it into your hand, then draw a card.", "Creature", { hasX: false });
    expect(p.atoms.map((a) => a.op)).not.toContain("optional-discard-payment");
  });
  it("CREED near-miss: the plain draw payoff still folds (no regression to the shipped family)", () => {
    const p = parseEffectClause("You may discard a card. If you do, draw a card.", "Creature", { hasX: false });
    expect(p.atoms.map((a) => a.op)).toEqual(["optional-discard-payment"]);
    expect(p.atoms[0].effectAtoms.map((a) => a.op)).toEqual(["draw"]);
  });
});

// ─── Coverage — the whole card flips native-mixed ─────────────────────────────────
describe("FORMIDABLE SPEAKER — classifyCard", () => {
  it("Formidable Speaker classifies native-mixed (BOTH halves modeled)", () => {
    expect(classifyCard(FORMIDABLE_SPEAKER)).toBe("native-mixed");
    expect(permanentFullyCovered(FORMIDABLE_SPEAKER)).toBe(true);
  });
  it("real siblings flip too — Kiora's Follower (activated) + Burst of Energy (spell)", () => {
    expect(classifyCard(KIORAS_FOLLOWER)).toBe("native-activated");
    expect(classifyCard(BURST_OF_ENERGY)).toBe("native-spell");
  });
  it("CREED: replacing EITHER half with unmodeled text drops it back to body-only", () => {
    // An unmodeled activated cost/effect residue (a bespoke non-standard cost) → not fully covered.
    const brokenActivated = { ...FORMIDABLE_SPEAKER, oracle: FORMIDABLE_SPEAKER.oracle.replace("{1}, {T}: Untap another target permanent.", "{1}, {T}: Untap another target permanent for each Elf you control.") };
    expect(classifyCard(brokenActivated)).toBe("body-only");
    // An unmodeled ETB payoff (a chained second reflexive) → not fully covered.
    const brokenEtb = { ...FORMIDABLE_SPEAKER, oracle: FORMIDABLE_SPEAKER.oracle.replace("then shuffle.", "then shuffle. If you do, gain the game.") };
    expect(classifyCard(brokenEtb)).toBe("body-only");
  });
});

// ─── Targeting — "another" excludes the source, fail-closed without a source ──────
describe("FORMIDABLE SPEAKER — untap-another targeting (CR 109.5)", () => {
  const UNTAP_ANOTHER = { atoms: [{ op: "untap", targetType: "permanent", restrictions: [{ kind: "notSource" }] }] };
  function board() {
    const fs = createPermanent({ id: "FS", card: FORMIDABLE_SPEAKER, controller: "user", summoningSick: false });
    const myOther = createPermanent({ id: "OTHER", card: { name: "Llanowar Elves", type: "Creature — Elf Druid" }, controller: "user", tapped: true });
    const oppPerm = createPermanent({ id: "AIPERM", card: { name: "Grizzly Bears", type: "Creature — Bear" }, controller: "ai", tapped: true });
    let s = withBattlefield(mainState(), "user", [fs, myOther]);
    return withBattlefield(s, "ai", [oppPerm]);
  }
  it("excludes the SOURCE, offers every other permanent on any battlefield", () => {
    const combos = expandCastChoices(board(), "user", UNTAP_ANOTHER, [], { sourceId: "FS" });
    const ids = combos.map((c) => c.targets[0].id).sort();
    expect(ids).toEqual(["AIPERM", "OTHER"]);
    expect(ids).not.toContain("FS");
  });
  it("FAIL-CLOSED: no sourceId → no legal 'another' target (never targets the wrong permanent)", () => {
    const combos = expandCastChoices(board(), "user", UNTAP_ANOTHER, [], null);
    expect(combos.every((c) => c.targets.length === 0)).toBe(true);
  });
});

// ─── Runtime — the {1}{T} untap ability untaps a target end-to-end ───────────────
describe("FORMIDABLE SPEAKER — runtime: {1}{T} untap-another ability", () => {
  function setup() {
    const fs = createPermanent({ id: "FS", card: FORMIDABLE_SPEAKER, controller: "user", summoningSick: false });
    const tappedElf = createPermanent({ id: "ELF", card: { name: "Llanowar Elves", type: "Creature — Elf Druid" }, controller: "user", tapped: true });
    // A Forest so the player can pay the {1} generic cost.
    const forest = createPermanent({ id: "F1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" });
    return withBattlefield(mainState(), "user", [fs, tappedElf, forest]);
  }
  it("surfaces the {1}{T} untap ability targeting ANOTHER permanent — never the Speaker itself", () => {
    const s = setup();
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "FS");
    expect(acts.length).toBeGreaterThan(0);
    // Every target offered is the OTHER permanent, NEVER the source FS.
    for (const a of acts) expect(a.targets?.[0]?.id).not.toBe("FS");
    expect(acts.some((a) => a.targets?.[0]?.id === "ELF")).toBe(true);
  });
  it("taps the Speaker, resolves, and UNTAPS the chosen other permanent (Speaker stays tapped)", () => {
    let s = setup();
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "FS").find((a) => a.targets?.[0]?.id === "ELF");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    // Speaker paid {T}; the ability is on the stack; the Elf is still tapped (not resolved).
    expect(s.players.user.battlefield.find((p) => p.id === "FS").tapped).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "ELF").tapped).toBe(true);
    s = resolveTopOfStack(s);
    // The Elf is now UNTAPPED; the Speaker stays tapped (paid its own {T}).
    expect(s.players.user.battlefield.find((p) => p.id === "ELF").tapped).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "FS").tapped).toBe(true);
  });
});

// ─── Runtime — the ETB discard→tutor two-pause chain (the whole point of relaxing the guard) ───
describe("FORMIDABLE SPEAKER — runtime: ETB discard→tutor-to-hand chain", () => {
  const ETB_ATOM = { atoms: [{ op: "optional-discard-payment", effectAtoms: [{ op: "tutor", filter: { groups: [["creature"]] }, filterLabel: "creature card", destination: "hand", targetType: null }], targetType: null }] };
  function withHandLibrary(hand, library) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, hand, library } } };
  }
  const obj = (program) => ({ source: { name: "Formidable Speaker" }, payload: { params: { program, controller: "user", targets: [] } } });

  it("PAY: discard pauses → then the tutor pauses → fetch the creature to hand, shuffle the rest", () => {
    let s = withHandLibrary(
      [{ id: "h1", name: "Pitch", type: "Land" }, { id: "h2", name: "Keep", type: "Land" }],
      [{ id: "lib1", name: "Grizzly Bears", type: "Creature — Bear" }, { id: "lib2", name: "Plains", type: "Land" }],
    );
    s = runEffectProgram(s, obj(ETB_ATOM));
    expect(s.pendingChoice?.kind).toBe("optional-discard-payment");
    s = resolveOptionalDiscardPaymentChoice(s, true);
    expect(s.pendingChoice?.kind).toBe("discard");            // which-card cost pause
    s = resolveDiscardChoice(s, "h1");
    expect(s.pendingChoice?.kind).toBe("tutor-search");        // SECOND pause — the payoff tutor
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["lib1"]); // only the creature is a legal fetch
    s = resolveTutorChoice(s, "lib1");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["h1"]);       // cost paid
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["h2", "lib1"]); // fetched to hand
    expect(s.players.user.library.map((c) => c.id)).toEqual(["lib2"]);        // rest shuffled back
  });

  it("DECLINE: hand, library, graveyard ALL untouched — no fabricated fetch (cardinal CREED)", () => {
    let s = withHandLibrary(
      [{ id: "h1", name: "Keep", type: "Land" }],
      [{ id: "lib1", name: "Grizzly Bears", type: "Creature — Bear" }],
    );
    s = runEffectProgram(s, obj(ETB_ATOM));
    s = resolveOptionalDiscardPaymentChoice(s, false);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["h1"]);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["lib1"]);
    expect(s.players.user.graveyard || []).toHaveLength(0);
  });
});
