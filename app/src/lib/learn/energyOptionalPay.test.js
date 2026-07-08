/**
 * energyOptionalPay.test.js — ENERGY subsystem, Slice C (optional-pay triggers).
 *
 * CR 122.1e / 603.7c: "you may pay {E}{E}. If you do, <effect>" is the ENERGY variant of the existing
 * optional-mana-payment atom — same suspend/decline machinery, only the cost shape differs ({ kind:"energy",
 * amount } instead of { kind:"mana", mana }). The matcher accepts all-{E} pips; autoPickOptionalManaPayment
 * pays-if-able on energy; resolveOptionalManaPaymentChoice spends the energy (hasEnergy/spendEnergy) and runs
 * the payoff ONLY on a real, affordable pay. Flips the Aether …/Servo attack-trigger family (+5, LOST=0).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { resolveOptionalManaPaymentChoice, autoPickOptionalManaPayment } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OPTIONAL_PAY = "you may pay {E}{E}. If you do, create a 1/1 colorless Servo artifact creature token";
const atomOf = () => parseEffectClause(OPTIONAL_PAY).atoms[0];
function pcState(energy, atom) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, energy, battlefield: [] } },
    pendingChoice: { kind: "optional-mana-payment", controller: "user", cost: atom.cost, effectAtoms: atom.effectAtoms, sourceName: "T", resume: {} } };
}

describe("ENERGY optional-pay — parse + settle", () => {
  it('parses "you may pay {E}{E}. If you do, <effect>" to an optional-mana-payment atom with an ENERGY cost', () => {
    expect(atomOf()).toMatchObject({ op: "optional-mana-payment", cost: { kind: "energy", amount: 2 } });
    expect(atomOf().effectAtoms[0].op).toBe("create-token");
  });
  it("PAY (with energy) spends the energy AND runs the payoff", () => {
    const s = pcState(3, atomOf());
    const next = resolveOptionalManaPaymentChoice(s, true);
    expect(next.players.user.energy).toBe(1);                        // 3 - 2
    expect(next.players.user.battlefield.length).toBe(1);            // the Servo token
  });
  it("DECLINE keeps the energy and runs nothing", () => {
    const next = resolveOptionalManaPaymentChoice(pcState(3, atomOf()), false);
    expect(next.players.user.energy).toBe(3);
    expect(next.players.user.battlefield.length).toBe(0);
  });
  it("autoPick pays iff affordable (energy >= cost), and an unaffordable PAY runs NO payoff (CR 119 no-fabrication)", () => {
    expect(autoPickOptionalManaPayment(pcState(3, atomOf()), pcState(3, atomOf()).pendingChoice)).toBe(true);
    expect(autoPickOptionalManaPayment(pcState(1, atomOf()), pcState(1, atomOf()).pendingChoice)).toBe(false);
    const under = resolveOptionalManaPaymentChoice(pcState(1, atomOf()), true); // pay with only 1 energy, cost 2
    expect(under.players.user.energy).toBe(1);                       // not spent
    expect(under.players.user.battlefield.length).toBe(0);          // payoff did NOT run
  });
  it("Aether Poisoner / Aether Swooper classify native-trigger", () => {
    expect(classifyCard({ name: "Aether Poisoner", type: "Creature — Human Rogue", mana: "{1}{B}", oracle: "Deathtouch\nWhen this creature enters, you get {E}{E} (two energy counters).\nWhenever this creature attacks, you may pay {E}{E}. If you do, create a 1/1 colorless Servo artifact creature token." })).toBe("native-trigger");
  });
});
