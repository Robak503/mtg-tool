/**
 * shorikaiS6S16.test.js — SHELF-85 runbook Phase 2 · S6 + S16 (2026-09-04): Peacewalker Colossus + Dispatch (Shorikai).
 *
 *   S6 Peacewalker Colossus — "{1}{W}: Another target Vehicle you control becomes an artifact creature until end of
 *      turn." Crew's twin on a CHOSEN Vehicle: the animate lane gains a `vehicle` target pool (an uncrewed Vehicle is
 *      not a creature, CR 301.7), the "another" source exclusion, and keepPrintedPt — the Vehicle keeps its printed
 *      P/T (a 7b set would read 0/0 and the lethal SBA would bin it).
 *   S16 Dispatch — "Tap target creature. Metalcraft — If you control three or more artifacts, exile that creature."
 *      The ADDITIVE targeted conditional (no "instead"): the tap always happens, the exile too when metalcraft holds
 *      (CR 608.2c). Narrow by design — a single chosen-creature base, an alternative naming "that creature" (the
 *      sentinel the new exile arm binds), the base riding inside both branches so ONE creature is chosen.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COLOSSUS = { id: "c-pc", name: "Peacewalker Colossus", type: "Artifact — Vehicle", mana: "{3}", cmc: 3, power: 6, toughness: 6, keywords: ["Crew 4"],
  oracle: "{1}{W}: Another target Vehicle you control becomes an artifact creature until end of turn.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const COPTER = { id: "card-copter", name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, power: 3, toughness: 3, keywords: ["Flying", "Crew 1"], oracle: "Flying\nCrew 1" };
const DISPATCH = { id: "c-dsp", name: "Dispatch", type: "Instant", mana: "{W}", cmc: 1, keywords: [], oracle: "Tap target creature.\nMetalcraft — If you control three or more artifacts, exile that creature." };

const plains = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user" });
const rock = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Rock " + id, type: "Artifact", oracle: "" }, controller: "user" });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("S6 — Peacewalker Colossus", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [createPermanent({ id: "PC", card: COLOSSUS, controller: "user" }), createPermanent({ id: "COPTER", card: COPTER, controller: "user" }), rock("R1"), plains("P1"), plains("P2")] },
        ai: { ...s.players.ai, battlefield: [createPermanent({ id: "AICOPTER", card: { ...COPTER, id: "card-aicopter" }, controller: "ai" })] } } };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "PC" && a.targets?.length);
  it("offers only ANOTHER Vehicle you control — never itself, a plain artifact, or the opponent's Vehicle", () => {
    expect(offers(board()).map((a) => a.targets[0].id)).toEqual(["COPTER"]);
  });
  it("the Copter becomes an artifact creature with its PRINTED 3/3 and survives", () => {
    let s = board();
    expect(permanentIsCreature(s, "COPTER")).toBe(false);
    s = dispatchAction(s, offers(s)[0]);
    s = resolveAll(s);
    expect(permanentIsCreature(s, "COPTER")).toBe(true);
    const copter = s.players.user.battlefield.find((p) => p.id === "COPTER");
    expect(copter).toBeTruthy();
    expect(creaturePower(copter, s)).toBe(3);
    expect(permanentIsCreature(s, "PC")).toBe(false); // the Colossus itself stays a plain Vehicle
  });
});

describe("S16 — Dispatch", () => {
  function board(artifacts) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [plains("P1"), ...Array.from({ length: artifacts }, (_, i) => rock("R" + i)), createPermanent({ id: "MINE", card: { id: "card-mine", name: "Mine", type: "Creature — Soldier", power: 2, toughness: 2, oracle: "" }, controller: "user" })], hand: [{ ...DISPATCH, id: "dsp-hand" }] },
        ai: { ...s.players.ai, battlefield: [createPermanent({ id: "BEAR", card: { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" })] } } };
  }
  const castAt = (s, id) => { const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "dsp-hand" && x.targets?.[0]?.id === id); expect(a).toBeTruthy(); return resolveAll(dispatchAction(s, a)); };
  it("parses (through the program entry, label stripped) to ONE targeted conditional whose true branch taps then exiles", () => {
    const p = parseEffectProgram(DISPATCH);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "conditional", branchOn: "you control three or more artifacts", ifTrue: [{ op: "tap", targetType: "creature", restrictions: [] }, { op: "exile", targetType: "creature", restrictions: [], chosenByBranch: true }], ifFalse: [{ op: "tap", targetType: "creature", restrictions: [] }], targetType: "creature", additive: true }]);
  });
  it("the cast chooses exactly ONE creature target (both seats' creatures offered, each once)", () => {
    const acts = legalActionsForPlayer(board(2), "user").filter((x) => x.kind === "cast-spell" && x.cardId === "dsp-hand");
    expect(acts.map((a) => a.targets.map((t) => t.id).join()).sort()).toEqual(["BEAR", "MINE"]);
    expect(acts.every((a) => a.targets.length === 1)).toBe(true);
  });
  it("two artifacts: the Bear is tapped, not exiled", () => {
    const s = castAt(board(2), "BEAR");
    const bear = s.players.ai.battlefield.find((p) => p.id === "BEAR");
    expect(bear?.tapped).toBe(true);
    expect(s.players.ai.exile).toHaveLength(0);
  });
  it("three artifacts (metalcraft): the Bear is exiled", () => {
    const s = castAt(board(3), "BEAR");
    expect(s.players.ai.battlefield.some((p) => p.id === "BEAR")).toBe(false);
    expect(s.players.ai.exile.map((c) => c.id)).toEqual(["card-bear"]);
  });
  it("seen-to-fail: an alternative that names a NEW target, or a base that is not a single creature target, stays low", () => {
    expect(programConfidence(parseEffectProgram({ ...DISPATCH, oracle: "Tap target creature. If you control three or more artifacts, exile target artifact." }))).toBe("low");
    expect(programConfidence(parseEffectProgram({ ...DISPATCH, oracle: "Draw a card. If you control three or more artifacts, exile that creature." }))).toBe("low");
  });
});

describe("classifier", () => {
  it("Peacewalker Colossus is native-activated; Dispatch a native spell", () => {
    expect(classifyCard(COLOSSUS)).toBe("native-activated");
    expect(classifyCard(DISPATCH)).toBe("native-spell");
  });
});
