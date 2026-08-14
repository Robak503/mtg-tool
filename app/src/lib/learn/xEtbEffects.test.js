/**
 * xEtbEffects.test.js — X-SHAPED ETB EFFECTS (2026-08-12): the effectHasX stamp widened from selfCast to
 * ETB. "{X}{X}{W}{W} … When this creature enters, create X 2/2 white Dinosaur Soldier creature tokens."
 * Flip-diff +5/0/0 — Triceraton Commander (Jurassic Ramp), The Meathook Massacre, Rocco, Cabaretti
 * Caterer, Springleaf Parade, Spiteful Banditry.
 *
 * ⭐ THE WHOLE BUILD IS ONE GATE WIDENING: the X-token/X-amount grammar existed behind hasX (the spell
 * lane's Secure the Wastes), the entering permanent already CARRIES its cast X (enteredPerm.xValue →
 * the self-ETB context), and the parse sites already read d.effectHasX. Only the stamp was selfCast-only.
 *
 * ⛔ THE BLINK CORNER IS THE HONESTY GUARD: an uncast re-entry (blink/reanimate) has xValue 0 — the
 * effect does NOTHING (CR 601.2b: X is 0 when the object wasn't cast). Witnessed below.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the ETB arm of the effectHasX stamp removed -> all five carriers park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TRICERATON = { id: "c-tc", name: "Triceraton Commander", type: "Creature — Alien Dinosaur Soldier", mana: "{X}{X}{W}{W}", power: "4", toughness: "4",
  oracle: "Flying\nWhenever this creature attacks, Dinosaurs you control other than this creature get +1/+1 and gain flying until end of turn.\nWhen this creature enters, create X 2/2 white Dinosaur Soldier creature tokens." };

describe("the carriers", () => {
  it("⭐ Triceraton and the Meathook-class X-ETBs flip native", () => {
    expect(classifyCard(TRICERATON)).toMatch(/^native/);
    expect(classifyCard({ id: "c-mm", name: "The Meathook Massacre", type: "Legendary Enchantment", mana: "{X}{X}{B}{B}",
      oracle: "When this enchantment enters, each creature gets -X/-X until end of turn.\nWhenever a creature you control dies, each opponent loses 1 life.\nWhenever a creature an opponent controls dies, you gain 1 life." })).toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — X reads the CAST value; a blinked re-entry reads 0", () => {
  const ATOM = { op: "create-token", power: 2, toughness: 2, descriptor: "white dinosaur soldier", targetType: null, countX: true };

  it("⭐⭐ cast with X=3: three tokens", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const after = ATOM_RESOLVERS["create-token"](s, ATOM, { controller: "user", xValue: 3, targets: [] });
    const tokens = after.players.user.battlefield.filter((p) => p.card?.token);
    console.log("  WITNESS xTokensCast", JSON.stringify({ tokens: tokens.length })); // vitest 4 needs --disable-console-intercept
    expect(tokens.length).toBe(3);
  });

  it("⛔⛔ no xValue (a blinked/uncast entry): ZERO tokens — never a fabricated count", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const after = ATOM_RESOLVERS["create-token"](s, ATOM, { controller: "user", targets: [] });
    const tokens = after.players.user.battlefield.filter((p) => p.card?.token);
    console.log("  WITNESS xTokensBlinked", JSON.stringify({ tokens: tokens.length })); // vitest 4 needs --disable-console-intercept
    expect(tokens.length).toBe(0);
  });
});
