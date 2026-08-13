/**
 * halanaCounterGift.test.js — HALANA AND ALENA, PARTNERS (+1, pays TWO below-bar shelf decks: Shalai
 * and Hallar Test + Wolverine, claws out!). "At the beginning of combat on your turn, put X +1/+1
 * counters on another target creature you control, where X is Halana and Alena's power. That creature
 * gains haste until end of turn."
 *
 * ⭐ ONE ARM + ONE GRAMMAR: everything else existed — the combatBegin event detected, the "another
 * target creature you control" excludeSource atom (Benevolent Hydra's), the sourcePower countFor kind
 * (layer-aware ctx.sourceId power read), and the two-sentence "That creature gains haste" fold. The
 * build: the X-by-source-power scaled twin of the fixed-N counter arm, plus the grammar-anchored
 * possessive rewrite ("<Name>'s power" → "this creature's power" — the Tifa Lockhart discipline: the
 * rewrite lives ONLY inside this exact whole-clause shape, so no other possessive is ever consumed).
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the sourcePower counter arm removed -> Halana parks.
 *   · the possessive-grammar rewrite removed -> Halana parks (the name form never reaches the arm).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HALANA = { id: "c-ha", name: "Halana and Alena, Partners", type: "Legendary Creature — Human Ranger", mana: "{2}{R}{G}", power: "2", toughness: "3",
  oracle: "First strike (This creature deals combat damage before creatures without first strike.)\nReach (This creature can block creatures with flying.)\nAt the beginning of combat on your turn, put X +1/+1 counters on another target creature you control, where X is Halana and Alena's power. That creature gains haste until end of turn." };

describe("the carrier and the shape", () => {
  it("⭐ Halana flips native; the possessive rewrite is grammar-anchored", () => {
    expect(classifyCard(HALANA)).toMatch(/^native/);
    const d = detectTriggers(HALANA).find((t) => t.event === "combatBegin");
    expect(d.effectClause).toMatch(/this creature's power/i); // the possessive rewrote
    // A DIFFERENT possessive shape must NOT rewrite (the anchor is the whole Halana grammar):
    const other = detectTriggers({ ...HALANA, oracle: "At the beginning of combat on your turn, double Halana and Alena's toughness until end of turn." });
    for (const t of other) expect(t.effectClause || "").not.toMatch(/this creature's toughness/i);
  });

  it("⭐ the program: add-counter scaled by sourcePower + the haste pump, one shared target", () => {
    const p = parseEffectClause("put x +1/+1 counters on another target creature you control, where x is this creature's power. That creature gains haste until end of turn", "Creature");
    const row = { ops: p.atoms.map((a) => a.op), countFor: p.atoms[0].countFor, excludeSource: p.atoms[0].excludeSource, tt: p.atoms[0].targetType };
    console.log("  WITNESS halanaProgram", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ops).toEqual(["add-counter", "pump"]);
    expect(row.countFor).toEqual({ kind: "sourcePower" });
    expect(row.excludeSource).toBe(true);
    expect(row.tt).toBe("creatureYouControl");
  });
});

describe("⭐⭐ LAW 6 — the gift equals Halana's LIVE power, on the chosen target", () => {
  function board(halanaCounters) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const halana = createPermanent({ id: "HAL", controller: "user", summoningSick: false, card: HALANA });
    if (halanaCounters) halana.counters = { "+1/+1": halanaCounters };
    const bear = createPermanent({ id: "BEAR", controller: "user", summoningSick: false,
      card: { id: "c-br", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" } });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [halana, bear] } } };
  }
  const ATOM = { op: "add-counter", counterType: "+1/+1", countFor: { kind: "sourcePower" }, targetType: "creatureYouControl", excludeSource: true };

  it("⭐⭐ base power 2: the Bear gets exactly 2 counters — and NOT Halana", () => {
    const after = ATOM_RESOLVERS["add-counter"](board(0), ATOM, { controller: "user", sourceId: "HAL", targets: [{ type: "creature", id: "BEAR" }] });
    const row = {
      bear: after.players.user.battlefield.find((p) => p.id === "BEAR")?.counters?.["+1/+1"] || 0,
      halana: after.players.user.battlefield.find((p) => p.id === "HAL")?.counters?.["+1/+1"] || 0,
    };
    console.log("  WITNESS halanaGiftBase", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ bear: 2, halana: 0 });
  });

  it("⭐⭐ LAYER-AWARE: two counters on Halana (power 4) → the gift is 4 (grows with her)", () => {
    const after = ATOM_RESOLVERS["add-counter"](board(2), ATOM, { controller: "user", sourceId: "HAL", targets: [{ type: "creature", id: "BEAR" }] });
    const row = { bear: after.players.user.battlefield.find((p) => p.id === "BEAR")?.counters?.["+1/+1"] || 0 };
    console.log("  WITNESS halanaGiftGrown", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ bear: 4 });
  });
});
