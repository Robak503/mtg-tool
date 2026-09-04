/**
 * mechHangar.test.js — SHELF-85 runbook Phase 2 · S17 (2026-09-04): Mech Hangar (Shorikai).
 *
 *   "{T}: Add {C}.
 *    {T}: Add one mana of any color. Spend this mana only to cast a Pilot or Vehicle spell.
 *    {3}, {T}: Target Vehicle becomes an artifact creature until end of turn."
 *
 * Two small gaps: "pilot" joined the restricted-spend type words (a real creature-subtype word on the type line), and
 * the S6 animate arm gained the UNSCOPED form ("target Vehicle", any controller — the same animate, printed P/T kept;
 * a scope-less "another" is unprinted and parks).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseSpendRestriction } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HANGAR = { id: "c-mh", name: "Mech Hangar", type: "Land", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Pilot or Vehicle spell.\n{3}, {T}: Target Vehicle becomes an artifact creature until end of turn." };
const COPTER = { id: "card-copter", name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, power: 3, toughness: 3, keywords: ["Flying", "Crew 1"], oracle: "Flying\nCrew 1" };
const PILOT = { id: "h-pilot", name: "Sram's Apprentice", type: "Creature — Dwarf Pilot", mana: "{W}", cmc: 1, power: 1, toughness: 1, oracle: "" };
const BEAR = { id: "h-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{G}", cmc: 1, power: 2, toughness: 2, oracle: "" };
const plains = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user" });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("the restricted mana reads Pilot or Vehicle; the unscoped animate parses; a scope-less 'another' parks", () => {
    expect(parseSpendRestriction(HANGAR.oracle)).toEqual({ castTypes: ["pilot", "vehicle"] });
    const r = parseEffectClause("Target Vehicle becomes an artifact creature until end of turn.", "Land");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "animate", targetType: "vehicle", restrictions: [], keepPrintedPt: true, subtypes: [], cardTypes: ["Artifact"], grantKeywords: [], duration: "endOfTurn" }]);
    expect(parseEffectClause("Another target Vehicle becomes an artifact creature until end of turn.", "Land").atoms).toEqual([]);
  });
});

describe("runtime", () => {
  it("the restricted mana casts the Pilot but not the Bear", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
      players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "MH", card: HANGAR, controller: "user" })], hand: [PILOT, BEAR], library: [] } } };
    const ids = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell").map((a) => a.cardId);
    expect(ids).toContain("h-pilot");
    expect(ids).not.toContain("h-bear");
  });
  it("{3},{T} animates ANY Vehicle — the opponent's too — at its printed P/T", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [createPermanent({ id: "MH", card: HANGAR, controller: "user" }), createPermanent({ id: "MINE", card: COPTER, controller: "user" }), plains("P1"), plains("P2"), plains("P3")] },
        ai: { ...s.players.ai, battlefield: [createPermanent({ id: "THEIRS", card: { ...COPTER, id: "card-theirs" }, controller: "ai" })] } } };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "MH" && a.targets?.length);
    expect(acts.map((a) => a.targets[0].id).sort()).toEqual(["MINE", "THEIRS"]);
    s = dispatchAction(s, acts.find((a) => a.targets[0].id === "THEIRS"));
    s = resolveAll(s);
    expect(permanentIsCreature(s, "THEIRS")).toBe(true);
    expect(s.players.ai.battlefield.some((p) => p.id === "THEIRS")).toBe(true); // 3/3 kept — it did not die to a 0/0 set
    expect(permanentIsCreature(s, "MINE")).toBe(false);
  });
});

describe("classifier", () => {
  it("Mech Hangar is a full land", () => {
    expect(classifyCard(HANGAR)).toBe("land");
  });
});
