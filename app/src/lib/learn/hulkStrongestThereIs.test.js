/**
 * hulkStrongestThereIs.test.js — HULK, STRONGEST THERE IS (2026-08-14). "Trample / Hulk enters with a
 * +1/+1 counter on him. / At the beginning of your upkeep, double the number of +1/+1 counters on each
 * Gamma creature you control."
 *
 * ⭐ TWO SEAM WIDENINGS, no new machine:
 *   · the SUBTYPE slot on the board-wide counter double (DOUBLE_COUNTERS_EACH + COUNT_SUBTYPE curation —
 *     "gamma" corpus-verified: 22 type-line occurrences, ALL subtype-position). Rides the existing
 *     perTargetDouble + subtypeFilter fields end-to-end.
 *   · the "on him/her" self-referent on the enters-with-+1/+1 reader (Marvel legends' gendered
 *     templating) — the coverage STRIP widened in lockstep, because a reader/strip referent mismatch
 *     leaves the credited sentence as residue and the card parks anyway (found live: the reader fix
 *     alone flipped nothing).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the gamma curation dropped → Hulk parks (the un-curated word → null, the CREED zero-match guard).
 *   · the subtypeFilter dropped from the emitted atom → the NON-Gamma bystander doubles too (over-fire,
 *     killed by the bystander witness).
 *   · the reader's him/her reverted → Hulk parks (the enters-with line goes unreadable again).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { entersWithPlusCounters } from "./staticAbilityParser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HULK = { name: "Hulk, Strongest There Is", type: "Legendary Creature — Gamma Berserker Hero", mana: "{3}{G}{G}",
  keywords: [], power: "4", toughness: "4",
  oracle: "Trample\nHulk enters with a +1/+1 counter on him.\nAt the beginning of your upkeep, double the number of +1/+1 counters on each Gamma creature you control." };
const CLAUSE = "double the number of +1/+1 counters on each Gamma creature you control";

// createPermanent initializes counters:{} itself — spread the count in AFTER construction.
const gamma = (id, counters) => ({ ...createPermanent({ id, controller: "user", summoningSick: false,
  card: { id: "c-" + id, name: id, type: "Creature — Gamma Hero", power: "2", toughness: "2", oracle: "" } }), counters: { "+1/+1": counters } });

describe("the carrier and the two widened seams", () => {
  it("⭐ Hulk flips native-trigger; the clause carries perTargetDouble + subtypeFilter Gamma", () => {
    expect(classifyCard(HULK)).toBe("native-trigger");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", scope: "youControl", perTargetDouble: "+1/+1", subtypeFilter: "Gamma" }]);
  });

  it("⭐ the enters-with reader accepts the gendered referent (him) — count 1 off the REAL oracle", () => {
    expect(entersWithPlusCounters(HULK)).toBe(1);
  });

  it("⛔ CREED: an un-curated subtype word stays LOW (never a silent zero-match filter)", () => {
    expect(parseEffectClause("double the number of +1/+1 counters on each flying creature you control", "Instant").confidence).toBe("low");
  });
});

describe("⭐⭐ LAW 6 — each Gamma doubles ITS OWN counters; a non-Gamma bystander is untouched", () => {
  it("⭐⭐ 3→6 and 1→2 on the Gammas; the 5-counter non-Gamma stays 5", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const bystander = { ...createPermanent({ id: "BY", controller: "user", summoningSick: false,
      card: { id: "c-BY", name: "Bystander", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } }), counters: { "+1/+1": 5 } };
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [gamma("G3", 3), gamma("G1", 1), bystander] } } };
    const prog = parseEffectClause(CLAUSE, "Instant", { hasX: false });
    const s = runEffectProgram(s0, { source: { name: "Hulk, Strongest There Is" }, payload: { params: { program: prog, controller: "user", targets: [] } } });
    const c = (id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;
    const row = { G3: c("G3"), G1: c("G1"), BY: c("BY") };
    console.log("  WITNESS hulkGammaDouble", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ G3: 6, G1: 2, BY: 5 });
  });

  it("a 0-counter Gamma stays at 0 (a clean no-op, never a fabricated floor)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [gamma("G0", 0)] } } };
    const prog = parseEffectClause(CLAUSE, "Instant", { hasX: false });
    const s = runEffectProgram(s0, { source: { name: "Hulk" }, payload: { params: { program: prog, controller: "user", targets: [] } } });
    expect(s.players.user.battlefield.find((p) => p.id === "G0")?.counters?.["+1/+1"] ?? 0).toBe(0);
  });
});
