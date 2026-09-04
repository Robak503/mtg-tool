/**
 * prodigysPrototype.test.js — SHELF-85 runbook Phase 2 · S5 (2026-09-04): Prodigy's Prototype (Shorikai).
 *
 *   "Whenever one or more Vehicles you control attack, create a 1/1 colorless Pilot creature token with 'This token
 *    crews Vehicles as though its power were 2 greater.'
 *    Crew 2"
 *
 * The once-per-combat batch ("one or more creatures you control attack" → the youAttack event) gains a SUBTYPE gate:
 * the descriptor carries `attackerSubtype`, threaded through the assembly beside requireSelfAttacking (an unlisted
 * field is dropped — and a dropped gate fires on ANY attack), and checkAttackTriggers fires only when at least one
 * declared attacker carries the subtype on its type line (a crewed Vehicle keeps it). The Pilot half is S8's gate.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PROTOTYPE = { id: "c-pp", name: "Prodigy's Prototype", type: "Artifact — Vehicle", mana: "{1}{W}{U}", cmc: 3, power: 3, toughness: 4, keywords: ["Crew 2"],
  oracle: "Whenever one or more Vehicles you control attack, create a 1/1 colorless Pilot creature token with \"This token crews Vehicles as though its power were 2 greater.\"\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const COPTER = { id: "card-copter", name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, power: 3, toughness: 3, keywords: ["Flying", "Crew 1"], oracle: "Flying\nCrew 1" };
const creature = (id, ctrl = "user") => createPermanent({ id, card: { id: "card-" + id, name: "Knight " + id, type: "Creature — Knight", power: 2, toughness: 2, oracle: "" }, controller: ctrl });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

function board(attackerIds) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "PP", card: PROTOTYPE, controller: "user" }), createPermanent({ id: "COPTER", card: COPTER, controller: "user" }), creature("K1"), creature("K2")] },
      ai: { ...s.players.ai, battlefield: [creature("WALL", "ai")] } },
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } };
}
const pilots = (s) => s.players.user.battlefield.filter((p) => /pilot/i.test(p.card?.name || ""));
const swing = (s) => resolveAll(flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets }));

describe("parse", () => {
  it("the batch attack event carries the Vehicle gate; the Pilot half parses", () => {
    const d = detectTriggers(PROTOTYPE);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "youAttack", attackerSubtype: "Vehicle" });
    expect(programConfidence(parseEffectClause(d[0].effectClause, "Artifact"))).toBe("high");
  });
  it("the plain batch is unchanged (no gate); a creature-type batch is not this arm", () => {
    expect(detectTriggers({ ...PROTOTYPE, oracle: "Whenever one or more creatures you control attack, draw a card." })[0]).toMatchObject({ event: "youAttack" });
    expect(detectTriggers({ ...PROTOTYPE, oracle: "Whenever one or more creatures you control attack, draw a card." })[0].attackerSubtype).toBeUndefined();
    expect(detectTriggers({ ...PROTOTYPE, oracle: "Whenever one or more Dinosaurs you control attack, draw a card." })).toHaveLength(0);
  });
});

describe("runtime — the batch fires once, only when a Vehicle is among the attackers", () => {
  it("a crewed Copter and a Knight attack: ONE Pilot", () => {
    let s = board(["COPTER", "K1"]);
    s = swing(s);
    expect(pilots(s)).toHaveLength(1);
    expect(pilots(s)[0].card.oracle).toBe("This creature crews Vehicles as though its power were 2 greater.");
  });
  it("two Vehicles attack: still ONE Pilot (once per combat, CR 508.1)", () => {
    let s = board(["COPTER", "PP", "K1"]);
    s = swing(s);
    expect(pilots(s)).toHaveLength(1);
  });
  it("only Knights attack: no Pilot", () => {
    let s = board(["K1", "K2"]);
    s = swing(s);
    expect(pilots(s)).toHaveLength(0);
  });
});

describe("classifier", () => {
  it("Prodigy's Prototype is native-trigger", () => {
    expect(classifyCard(PROTOTYPE)).toBe("native-trigger");
  });
});
