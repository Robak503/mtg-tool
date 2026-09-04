/**
 * mobilizerMech.test.js — SHELF-85 runbook Phase 2 · S7 (2026-09-04): Mobilizer Mech (Shorikai).
 *
 *   "Flying
 *    Whenever this Vehicle becomes crewed, up to one other target Vehicle you control becomes an artifact creature
 *    until end of turn.
 *    Crew 3"
 *
 * A new self-scoped event: the crew dispatch fires checkBecomesCrewedTriggers on the Vehicle that just became a
 * creature (routed through triggersForEvent, the becomes-tapped discipline), and the S6 animate arm gains the
 * "up to one other" form (the subset path + the source exclusion, printed P/T kept).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MECH = { id: "c-mm", name: "Mobilizer Mech", type: "Artifact — Vehicle", mana: "{1}{U}", cmc: 2, power: 4, toughness: 3, keywords: ["Flying", "Crew 3"],
  oracle: "Flying\nWhenever this Vehicle becomes crewed, up to one other target Vehicle you control becomes an artifact creature until end of turn.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const SLED = { id: "card-sled", name: "Heavy Sled", type: "Artifact — Vehicle", mana: "{4}", cmc: 4, power: 6, toughness: 6, keywords: ["Crew 5"], oracle: "Crew 5" };
const knight = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Knight " + id, type: "Creature — Knight", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "MECH", card: MECH, controller: "user" }), createPermanent({ id: "SLED", card: SLED, controller: "user" }), knight("K1")] } } };
}

describe("parse", () => {
  it("the becomes-crewed self event with the up-to-one other Vehicle animate", () => {
    const d = detectTriggers(MECH);
    expect(d.map((x) => [x.event, x.scope])).toEqual([["becomesCrewed", "self"]]);
    const r = parseEffectClause(d[0].effectClause, "Artifact");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "animate", targetType: "vehicle", restrictions: [{ kind: "controller", who: "you" }], excludeSource: true, maxTargets: 1, minTargets: 0, keepPrintedPt: true, subtypes: [], cardTypes: ["Artifact"], grantKeywords: [], duration: "endOfTurn" }]);
  });
  it("seen-to-fail: a non-self subject is not detected", () => {
    expect(detectTriggers({ ...MECH, oracle: "Whenever a Vehicle you control becomes crewed, draw a card." })).toHaveLength(0);
  });
});

describe("runtime — crewing the Mech animates the Sled it could never crew", () => {
  it("the Knight crews the Mech; the trigger fires once, picks the Sled, and the Sled is a 6/6 creature", () => {
    let s = board();
    const crew = legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "MECH");
    expect(crew).toBeTruthy();
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "crew-vehicle" && a.permanentId === "SLED")).toBe(false); // Crew 5 is out of reach
    s = dispatchAction(s, crew);
    expect(permanentIsCreature(s, "MECH")).toBe(true);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    const trig = s.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.targets.map((t) => t.id)).toEqual(["SLED"]); // never the Mech itself
    s = resolveAll(s);
    expect(permanentIsCreature(s, "SLED")).toBe(true);
    expect(creaturePower(s.players.user.battlefield.find((p) => p.id === "SLED"), s)).toBe(6);
  });
  it("with no other Vehicle the trigger resolves with no target and nothing else changes", () => {
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "SLED") } } };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "MECH"));
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(permanentIsCreature(s, "MECH")).toBe(true);
    expect(s.players.user.battlefield.map((p) => p.id).sort()).toEqual(["K1", "MECH"]);
  });
});

describe("classifier", () => {
  it("Mobilizer Mech is native-trigger", () => {
    expect(classifyCard(MECH)).toBe("native-trigger");
  });
});
