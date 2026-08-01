/**
 * partnerWith.test.js — KW-PARTNER-WITH (CR 702.124j), the named-card tutor searched by a TARGETED player.
 *
 * CR 702.124j: "'Partner with [name]' represents two abilities. It means 'You may designate two legendary
 * cards as your commander rather than one if each has a "partner with [name]" ability with the other's name'
 * and 'When this permanent enters, target player may search their library for a card named [name], reveal it,
 * put it into their hand, then shuffle.'"
 *
 * ⛔ ONLY THE SECOND ABILITY IS MODELED, and that is a deliberate, declared boundary rather than an omission.
 * The first is deck construction — CR 702.124a says partner abilities "function before the game begins" — and
 * this engine models battlefield play. Nothing here credits a card for two-commander legality.
 *
 * The classification cases assert the CARD flips; the runtime cases assert THE MONEY MOVES. Both are needed:
 * a tier says a program was built, never that it moves the right card out of the right library into the right
 * hand — and this ability's whole risk surface is "which player does what".
 *
 * Oracle text is pulled from the bundled index and hardcoded per this codebase's convention (CI has no
 * Scryfall bulk data), never typed from memory — CLAUDE.md §1.2.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveOptionalChoice, resolveTutorChoice, runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, partnerWithName } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const C = (name, type, oracle, mana = "") => ({ name, type, oracle, mana });

// Real carriers, oracle text verbatim from the bundled index.
const LORE_WEAVER = C("Lore Weaver", "Creature — Human Wizard",
  "Partner with Ley Weaver (When this creature enters, target player may put Ley Weaver into their hand from their library, then shuffle.)\n{5}{U}{U}: Target player draws two cards.", "{3}{U}");
const SILVAR = C("Silvar, Devourer of the Free", "Legendary Creature — Cat Nightmare",
  "Partner with Trynn, Champion of Freedom (When this creature enters, target player may put Trynn into their hand from their library, then shuffle.)\nMenace\nSacrifice a Human: Put a +1/+1 counter on Silvar. It gains indestructible until end of turn.", "{3}{B}{R}");
const TRYNN = C("Trynn, Champion of Freedom", "Legendary Creature — Human Soldier",
  "Partner with Silvar, Devourer of the Free (When this creature enters, target player may put Silvar into their hand from their library, then shuffle.)\nAt the beginning of your end step, if you attacked this turn, create a 1/1 white Human Soldier creature token.", "{3}{W}");
const JENNY_FLINT = C("Jenny Flint", "Legendary Creature — Human Detective",
  "Partner with Madame Vastra\nFirst strike\nTraining (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever you sacrifice a Clue or Food, put a +1/+1 counter on another target creature you control.", "{1}{U}{R}");
const PIR = C("Pir, Imaginative Rascal", "Legendary Creature — Human",
  "Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.", "{2}{G}");
const MOTHERS_YAMAZAKI = C("Mothers Yamazaki", "Legendary Creature — Human Samurai",
  "Partner with itself (When this enters, target player may put Mothers Yamazaki into their hand from their library, then shuffle. A Commander deck can include two of this card, and they can be your commanders.)\nAs long as you control exactly two permanents named Mothers Yamazaki, the \"legend rule\" doesn't apply to them, and Samurai you control get +2/+2 and have vigilance and haste.", "{2}{R}{W}");

const NATIVE = ["native-trigger", "native-mixed", "native-spell", "native-activated", "native-static"];

// ───────────────────────── the recognizer ─────────────────────────

describe("partnerWithName — the name comes off the KEYWORD LINE, not the reminder", () => {
  it("reads the FULL printed name even when the reminder text abbreviates it", () => {
    // Silvar's line says "Trynn, Champion of Freedom"; its reminder says only "Trynn". The library holds the
    // full name, so reading the reminder would search for a card that does not exist and find nothing forever.
    expect(partnerWithName(SILVAR.oracle)).toBe("Trynn, Champion of Freedom");
  });

  it("reads a line printed with NO reminder text at all", () => {
    expect(partnerWithName(JENNY_FLINT.oracle)).toBe("Madame Vastra");
  });

  it("REFUSES 'Partner with itself' — it names no other card (Mothers Yamazaki)", () => {
    // Returning "itself" would hand the tutor a search for a card literally named "itself": zero candidates,
    // forever, with every test green and the tier reading native. A refusal parks the card instead.
    expect(partnerWithName(MOTHERS_YAMAZAKI.oracle)).toBeNull();
  });

  it("does NOT self-synthesize from a QUOTED grant (the line anchor is load-bearing)", () => {
    const granter = C("Granter", "Enchantment", 'Creatures you control have "Partner with Ley Weaver".');
    expect(partnerWithName(granter.oracle)).toBeNull();
  });
});

// ───────────────────────── the name filter ─────────────────────────

describe("cardMatchesTutorFilter — the positive name gate", () => {
  const filter = { name: "Ley Weaver" };

  it("matches the named card, case-insensitively", () => {
    expect(cardMatchesTutorFilter({ name: "Ley Weaver", type: "Creature — Human Druid" }, filter)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "ley weaver", type: "Creature — Human Druid" }, filter)).toBe(true);
  });

  it("rejects every other card", () => {
    expect(cardMatchesTutorFilter({ name: "Lore Weaver", type: "Creature — Human Wizard" }, filter)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Sol Ring", type: "Artifact" }, filter)).toBe(false);
  });

  it("does NOT fall through to 'unfiltered' — a name filter carries no type groups", () => {
    // The gate runs BEFORE the `groups.length === 0` early-return that treats a type-less filter as
    // "matches everything". Reaching that return with a name attached would turn "search for a card named X"
    // into "search for ANY card" — the worst failure this atom could produce, and the reason this pin exists.
    expect(cardMatchesTutorFilter({ name: "Anything At All", type: "Instant" }, filter)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Anything At All", type: "Instant" }, { groups: [] })).toBe(true);
  });
});

// ───────────────────────── the parse ─────────────────────────

/** The real synthesized ETB program for a carrier — built the way the engine builds it, not by hand. */
function partnerProgram(card) {
  const trig = detectTriggers(card).find((t) => /^Partner with /.test(t.sourceText || ""));
  expect(trig, `${card.name} synthesizes a partner-with trigger`).toBeTruthy();
  expect(trig.event).toBe("etb");
  return parseEffectClause(trig.effectClause, "Instant");
}

describe("the synthesized ETB parses to a targeted, optional, named tutor", () => {
  it("Lore Weaver — one tutor atom carrying the name, the targeted searcher and the target-facing may", () => {
    const prog = partnerProgram(LORE_WEAVER);
    expect(prog.confidence).toBe("high");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0]).toMatchObject({
      op: "tutor",
      filter: { name: "ley weaver" },
      destination: "hand",
      searcherIsTarget: true,
      optional: true,
      optionalDeciderIsTarget: true,
      targetType: "player",
    });
  });

  it("a comma-carrying partner name survives the clause splitter intact", () => {
    // "Trynn, Champion of Freedom" contains a comma, and the sentence's trailing ", then shuffle" is exactly
    // what splitClauses severs on. Both hazards live in this one fixture.
    expect(partnerProgram(SILVAR).atoms[0].filter.name).toBe("trynn, champion of freedom");
  });
});

// ───────────────────────── the runtime: the money moves ─────────────────────────

const lib = (id, name) => ({ id, name, type: "Creature — Human Druid", mana: "{3}{G}" });

function stateWith({ userLibrary = [], aiLibrary = [] } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    priorityHolder: null,
    players: {
      ...base.players,
      user: { ...base.players.user, library: userLibrary, hand: [] },
      ai: { ...base.players.ai, library: aiLibrary, hand: [] },
    },
  };
}

/** Fire the ETB with `target` as the targeted player, `controller` as the source's controller. */
function fireEtb(state, program, { controller = "user", target = "user" } = {}) {
  return runEffectProgram(state, {
    source: { name: "Lore Weaver" },
    payload: { params: { program, controller, targets: [{ type: "player", id: target }], sourceId: "src-1" } },
  });
}

describe("runtime — the search happens in the TARGET's library and the card lands in the TARGET's hand", () => {
  it("pauses the 'may' on the TARGETED player, not on the controller", () => {
    const prog = partnerProgram(LORE_WEAVER);
    const s = fireEtb(stateWith({ aiLibrary: [lib("L1", "Ley Weaver")] }), prog, { controller: "user", target: "ai" });
    expect(s.pendingChoice.kind).toBe("optional-effect");
    expect(s.pendingChoice.controller).toBe("ai"); // CR 702.124j — "TARGET PLAYER may search"
  });

  it("accepting offers ONLY the named card, out of the TARGET's library", () => {
    const prog = partnerProgram(LORE_WEAVER);
    const lib0 = [lib("L1", "Ley Weaver"), lib("L2", "Llanowar Elves"), lib("L3", "Lore Weaver")];
    let s = fireEtb(stateWith({ aiLibrary: lib0 }), prog, { controller: "user", target: "ai" });
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice.kind).toBe("tutor-search");
    expect(s.pendingChoice.controller).toBe("ai");
    expect(s.pendingChoice.candidates.map((c) => c.name)).toEqual(["Ley Weaver"]);
  });

  it("resolving moves the named card from the TARGET's library into the TARGET's hand", () => {
    const prog = partnerProgram(LORE_WEAVER);
    let s = fireEtb(stateWith({ aiLibrary: [lib("L1", "Ley Weaver"), lib("L2", "Llanowar Elves")] }), prog,
      { controller: "user", target: "ai" });
    s = resolveTutorChoice(resolveOptionalChoice(s, true), "L1");
    expect(s.players.ai.hand.map((c) => c.name)).toEqual(["Ley Weaver"]);
    expect(s.players.ai.library.map((c) => c.name)).toEqual(["Llanowar Elves"]);
    expect(s.players.user.hand).toHaveLength(0); // the CONTROLLER gains nothing
  });

  it("⭐ searches the TARGET's library, never the controller's — even when both hold the named card", () => {
    // The load-bearing assertion of the whole slice. If `searcherIsTarget` were dropped, or fell back to
    // ctx.controller, this test is the only thing that notices: the tier, the parse and every other runtime
    // case above would stay green while the wrong player's library got searched.
    const prog = partnerProgram(LORE_WEAVER);
    let s = fireEtb(stateWith({
      userLibrary: [lib("U1", "Ley Weaver")],
      aiLibrary: [lib("A1", "Ley Weaver")],
    }), prog, { controller: "user", target: "ai" });
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["A1"]); // the AI's copy, not the user's
    s = resolveTutorChoice(s, "A1");
    expect(s.players.ai.hand.map((c) => c.id)).toEqual(["A1"]);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["U1"]); // untouched
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("declining the 'may' moves nothing at all", () => {
    const prog = partnerProgram(LORE_WEAVER);
    let s = fireEtb(stateWith({ aiLibrary: [lib("L1", "Ley Weaver")] }), prog, { controller: "user", target: "ai" });
    s = resolveOptionalChoice(s, false);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.library.map((c) => c.id)).toEqual(["L1"]);
  });

  it("offers nothing when the named card isn't in that library — and fabricates no find", () => {
    const prog = partnerProgram(LORE_WEAVER);
    let s = fireEtb(stateWith({ aiLibrary: [lib("L2", "Llanowar Elves")] }), prog, { controller: "user", target: "ai" });
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice.candidates).toEqual([]);
    s = resolveTutorChoice(s, null);
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.library.map((c) => c.name)).toEqual(["Llanowar Elves"]);
  });

  it("targeting YOURSELF searches your own library (the ordinary line)", () => {
    const prog = partnerProgram(LORE_WEAVER);
    let s = fireEtb(stateWith({ userLibrary: [lib("U1", "Ley Weaver")] }), prog, { controller: "user", target: "user" });
    expect(s.pendingChoice.controller).toBe("user");
    s = resolveTutorChoice(resolveOptionalChoice(s, true), "U1");
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Ley Weaver"]);
  });
});

// ───────────────────────── classification ─────────────────────────

describe("real carriers flip to a native tier", () => {
  for (const card of [LORE_WEAVER, SILVAR, TRYNN, PIR]) {
    it(`${card.name}`, () => expect(NATIVE).toContain(classifyCard(card)));
  }

  // ⛔ JENNY FLINT WAS IN THIS LIST AND WAS RETRACTED THE SAME DAY — a false positive, not a regression.
  // It carries "Whenever you sacrifice a Clue or Food, …", which detectTriggers does not recognise at all
  // (verified alone on a bare creature: 0 detected, body-only, against a control that detects and flips).
  // It read native only because TWO counting errors cancelled: the unrecognised sentence was counted as a
  // SHAPED trigger while its Training keyword was DETECTED but not shaped. Fixing the keyword side of that
  // sum exposed the other, which is the honest outcome — the card has an unmodeled trigger and must park.
  //
  // ⚠️ THE GENERAL LESSON, worth more than the card: shaped === detected can BALANCE ON TWO ERRORS. A card
  // passing that gate is not evidence every one of its triggers is modeled; it is evidence the counts agree.
  it("⛔ Jenny Flint stays parked — its sacrifice trigger is genuinely unmodeled", () => {
    expect(NATIVE).not.toContain(classifyCard(JENNY_FLINT));
  });
});

describe("the boundary stays put", () => {
  it("Mothers Yamazaki stays parked — 'Partner with itself' is not modeled", () => {
    // Its OTHER text (the two-permanents legend-rule static) is unmodeled too, so this pins the boundary
    // rather than the sole blocker; the recognizer's refusal is asserted directly above.
    expect(NATIVE).not.toContain(classifyCard(MOTHERS_YAMAZAKI));
  });

  it("a partner-with carrier with unmodeled residue still parks (whole-card-or-nothing)", () => {
    const card = C("Fake Partner Carrier", "Legendary Creature — Human",
      "Partner with Ley Weaver\nWhenever this creature attacks, scry until you feel better about it.");
    expect(NATIVE).not.toContain(classifyCard(card));
  });
});
