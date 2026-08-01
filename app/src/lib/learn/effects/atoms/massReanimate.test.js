/**
 * massReanimate.test.js — "Return ALL <type> cards from your graveyard to the battlefield[ tapped]" (CR 608).
 *
 * 25 corpus carriers and no mass-reanimate resolver existed at all — the targeted `reanimate` arm walked
 * ctx.targets chosen at cast time, and nothing walked the graveyard at resolution. This is that sibling.
 *
 * The parse cases assert the FILTER GATE; the runtime cases assert THE CARDS ACTUALLY MOVE. Both are needed:
 * a tier says a program was built, never that the right cards left the graveyard — and a mass return has no
 * cast-time enumeration to catch a bad filter, so the gate is the only thing standing between this atom and
 * putting a sorcery onto the battlefield.
 *
 * ⛔ AURAS ARE SKIPPED — CR 303.4f (the controller chooses what an unattached Aura enchants as it enters) and
 * CR 303.4g ("if there is no legal object … the Aura remains in its current zone"). There is no attach-choice
 * for a non-targeted mass return here, so entering one would put an Aura onto the battlefield attached to
 * nothing — a state CR 704.5m bins immediately, i.e. a fabricated permanent. Skipping is the FN direction.
 *
 * Oracle text is verbatim from the bundled index, hardcoded per this codebase's convention (CI has no
 * Scryfall bulk data) — CLAUDE.md §1.2.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "../../coverage.js";
import { createGameState, _resetIdsForTests } from "../../gameState.js";
import { parseEffectClause } from "../parser.js";
import { runEffectProgram } from "../runProgram.js";

beforeEach(() => _resetIdsForTests());

const C = (name, type, oracle, mana = "") => ({ name, type, oracle, mana });
const NATIVE = ["native-trigger", "native-mixed", "native-spell", "native-activated", "native-static"];

// ───────────────────────── the filter gate ─────────────────────────

const atomFor = (clause) => (parseEffectClause(clause, "Sorcery").atoms || [])[0];

describe("the filter gate — what this arm accepts and what it refuses", () => {
  it("a basic permanent type is accepted", () => {
    expect(atomFor("Return all land cards from your graveyard to the battlefield.")).toMatchObject({
      op: "mass-reanimate", cardFilter: "land", entersTapped: false, targetType: null,
    });
    expect(atomFor("Return all enchantment cards from your graveyard to the battlefield.")).toMatchObject({
      op: "mass-reanimate", cardFilter: "enchantment",
    });
  });

  it("the ' tapped' variant is carried, not dropped", () => {
    expect(atomFor("Return all land cards from your graveyard to the battlefield tapped.")).toMatchObject({
      op: "mass-reanimate", cardFilter: "land", entersTapped: true,
    });
  });

  it("⛔ refuses an UNFILTERED 'all cards' — nothing gates a sorcery out of it", () => {
    expect(atomFor("Return all cards from your graveyard to the battlefield.")).toBeUndefined();
  });

  it("⛔ refuses a NON-PERMANENT filter — a card entering the battlefield must be a permanent", () => {
    expect(atomFor("Return all instant cards from your graveyard to the battlefield.")).toBeUndefined();
    expect(atomFor("Return all instant or sorcery cards from your graveyard to the battlefield.")).toBeUndefined();
  });

  it("refuses a subtype / compound filter (a safe FN — these park)", () => {
    expect(atomFor("Return all Knight creature cards from your graveyard to the battlefield.")).toBeUndefined();
    expect(atomFor("Return all legendary permanent cards from your graveyard to the battlefield.")).toBeUndefined();
  });

  // ✅ INVERTED 2026-08-01 (same day it was written). This block's third case asserted that
  // "artifact and enchantment" PARKED, with a comment naming it as the known +2 follow-up. The follow-up
  // landed: the " and "-union is normalized locally in this arm.
  it("accepts an ' and '-UNION of permanent types (Brilliant Restoration / Redress Fate)", () => {
    // The printed "and" is a union over the CARD SET here — every artifact card and every enchantment card.
    expect(atomFor("Return all artifact and enchantment cards from your graveyard to the battlefield.")).toMatchObject({
      op: "mass-reanimate", cardFilter: "artifact|enchantment",
    });
  });

  it("⛔ the union normalization cannot smuggle a non-type past the gate", () => {
    // The whole safety argument for normalizing " and " → " or " locally: every member still has to survive
    // parseGraveyardFilter + isPermanentReanimateFilter, so a SUBTYPE pair is rejected exactly as before.
    expect(atomFor("Return all Mount and Vehicle cards from your graveyard to the battlefield.")).toBeUndefined();
    expect(atomFor("Return all instant and sorcery cards from your graveyard to the battlefield.")).toBeUndefined();
  });

  it("both union members actually come back at runtime, and nothing else does", () => {
    const s = cast(stateWithGraveyard([
      gy("g1", "Sol Ring", "Artifact"),
      gy("g2", "Ghostly Prison", "Enchantment"),
      gy("g3", "Grizzly Bears", "Creature — Bear"),
    ]), "Return all artifact and enchantment cards from your graveyard to the battlefield.");
    expect(bfNames(s)).toEqual(["Ghostly Prison", "Sol Ring"]);
    expect(gyNames(s)).toEqual(["Grizzly Bears"]);
  });
});

// ───────────────────────── the runtime: the cards move ─────────────────────────

const gy = (id, name, type) => ({ id, name, type, mana: "{1}" });

function stateWithGraveyard(cards) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    priorityHolder: null,
    players: { ...base.players, user: { ...base.players.user, graveyard: cards, battlefield: [] } },
  };
}

function cast(state, clause) {
  const program = parseEffectClause(clause, "Sorcery");
  expect(program.confidence).toBe("high");
  return runEffectProgram(state, {
    source: { name: "Splendid Reclamation" },
    payload: { params: { program, controller: "user", targets: [], sourceId: "src-1" } },
  });
}

const bfNames = (s) => (s.players.user.battlefield || []).map((p) => p.card?.name ?? p.name).sort();
const gyNames = (s) => (s.players.user.graveyard || []).map((c) => c.name).sort();

describe("runtime — every matching card leaves the graveyard and enters the battlefield", () => {
  it("returns ALL matching cards, and only those", () => {
    const s = cast(stateWithGraveyard([
      gy("g1", "Forest", "Basic Land — Forest"),
      gy("g2", "Island", "Basic Land — Island"),
      gy("g3", "Grizzly Bears", "Creature — Bear"),
      gy("g4", "Shock", "Instant"),
    ]), "Return all land cards from your graveyard to the battlefield.");
    expect(bfNames(s)).toEqual(["Forest", "Island"]);
    expect(gyNames(s)).toEqual(["Grizzly Bears", "Shock"]); // non-matching untouched
  });

  it("the tapped variant enters them tapped; the untapped variant does not", () => {
    const tapped = cast(stateWithGraveyard([gy("g1", "Forest", "Basic Land — Forest")]),
      "Return all land cards from your graveyard to the battlefield tapped.");
    expect(tapped.players.user.battlefield.every((p) => p.tapped === true)).toBe(true);

    const untapped = cast(stateWithGraveyard([gy("g1", "Forest", "Basic Land — Forest")]),
      "Return all land cards from your graveyard to the battlefield.");
    expect(untapped.players.user.battlefield.every((p) => !p.tapped)).toBe(true);
  });

  it("⛔ SKIPS AURA CARDS — CR 303.4f/g; entering one unattached would fabricate an illegal permanent", () => {
    // The load-bearing assertion of this atom. Replenish's own reminder says it: "(Auras with nothing to
    // enchant remain in your graveyard.)" Without the guard the Aura enters attached to nothing.
    const s = cast(stateWithGraveyard([
      gy("g1", "Ghostly Prison", "Enchantment"),
      gy("g2", "Pacifism", "Enchantment — Aura"),
    ]), "Return all enchantment cards from your graveyard to the battlefield.");
    expect(bfNames(s)).toEqual(["Ghostly Prison"]);
    expect(gyNames(s)).toEqual(["Pacifism"]); // stayed in its current zone, per CR 303.4g
  });

  it("an empty / all-non-matching graveyard is a clean no-op", () => {
    const s = cast(stateWithGraveyard([gy("g1", "Shock", "Instant")]),
      "Return all land cards from your graveyard to the battlefield.");
    expect(bfNames(s)).toEqual([]);
    expect(gyNames(s)).toEqual(["Shock"]);
  });

  it("only the CONTROLLER's graveyard is touched", () => {
    const base = stateWithGraveyard([gy("g1", "Forest", "Basic Land — Forest")]);
    const withAi = { ...base, players: { ...base.players, ai: { ...base.players.ai, graveyard: [gy("a1", "Mountain", "Basic Land — Mountain")], battlefield: [] } } };
    const s = cast(withAi, "Return all land cards from your graveyard to the battlefield.");
    expect(bfNames(s)).toEqual(["Forest"]);
    expect((s.players.ai.graveyard || []).map((c) => c.name)).toEqual(["Mountain"]); // untouched
    expect((s.players.ai.battlefield || []).length).toBe(0);
  });
});

// ───────────────────────── classification ─────────────────────────

describe("real carriers flip to a native tier", () => {
  const CASES = [
    ["Splendid Reclamation", "Sorcery", "Return all land cards from your graveyard to the battlefield tapped.", "{3}{G}"],
    ["Replenish", "Sorcery", "Return all enchantment cards from your graveyard to the battlefield. (Auras with nothing to enchant remain in your graveyard.)", "{3}{W}"],
    ["Lumra, Bellow of the Woods", "Legendary Creature — Elemental Bear",
      "Vigilance, reach\nLumra's power and toughness are each equal to the number of lands you control.\nWhen Lumra enters, mill four cards. Then return all land cards from your graveyard to the battlefield tapped.", "{4}{G}{G}"],
    ["Aftermath Analyst", "Creature — Elf Detective",
      "When this creature enters, mill three cards. (Put the top three cards of your library into your graveyard.)\n{3}{G}, Sacrifice this creature: Return all land cards from your graveyard to the battlefield tapped.", "{1}{G}"],
  ];
  for (const [name, type, oracle, mana] of CASES) {
    it(`${name}`, () => expect(NATIVE).toContain(classifyCard(C(name, type, oracle, mana))));
  }
});

describe("the narrower filters stay parked — a real, distinct reason, not this arm over-claiming", () => {
  it("Knights' Charge (subtype filter) stays parked", () => {
    expect(NATIVE).not.toContain(classifyCard(C("Knights' Charge", "Enchantment",
      "Whenever a Knight you control attacks, each opponent loses 1 life and you gain 1 life.\n{3}{W}{B}: Return all Knight creature cards from your graveyard to the battlefield. Activate only as a sorcery.", "{1}{W}{B}")));
  });
});
