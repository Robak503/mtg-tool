/**
 * courtOfCunning.test.js — the monarch-conditional targeted mill (Court of Cunning, Teval shelf,
 * 2026-08-15): "any number of target players each mill two cards. If you're the monarch, each of those
 * players mills ten cards instead." Modeled as the ALWAYS-CHOOSE-ONE pick (one chosen player each
 * firing — a legal instance of "any number", CR 601.2c; never an over-fire) with amountIfMonarch as a
 * CR 614 resolution-time override off state.monarchId (the same live read the monarch-status
 * intervening-if and Regal Behemoth's mana gate use). The splitClauses fold keeps the pair whole —
 * split, the lead would mill 2 unconditionally, a wrong amount for the monarch.
 *
 * Mutation-checked (2026-08-15): the override read dropped (always `amount`) → the crowned-mills-ten
 * witness dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const COURT = { name: "Court of Cunning", type: "Enchantment", mana: "{1}{U}",
  oracle: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, any number of target players each mill two cards. If you're the monarch, each of those players mills ten cards instead." };
const EFFECT = "any number of target players each mill two cards. If you're the monarch, each of those players mills ten cards instead";

describe("COURT OF CUNNING — parse + the monarch override", () => {
  it("⭐ the folded pair parses to ONE targeted mill with amountIfMonarch; the card is NATIVE", () => {
    const p = parseEffectClause(EFFECT, "Instant");
    const row = { conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(COURT) };
    console.log("  WITNESS court", JSON.stringify({ conf: row.conf, tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "mill", who: "target", targetType: "player", amount: 2, amountIfMonarch: 10 });
    expect(row.tier).toBe("native-trigger");
  });

  it("⭐⭐ resolution: crownless mills TWO; crowned mills TEN (CR 614 'instead', read live at resolution)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const lib = Array.from({ length: 12 }, (_, i) => ({ id: `V${i}`, name: `C${i}`, type: "Sorcery", oracle: "" }));
    const base = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, library: lib } } };
    const run = (st) => runEffectProgram(st, {
      id: "stk-c", kind: "triggered-ability", controller: "user", source: { name: "Court of Cunning" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectClause(EFFECT, "Instant"), controller: "user", targets: [{ atomIndex: 0, type: "player", id: "ai" }] } },
    });
    const crownless = run(base);
    const crowned = run({ ...base, monarchId: "user" });
    const wrongCrown = run({ ...base, monarchId: "ai" }); // an OPPONENT's crown never upgrades MY mill
    const row = {
      crownless: crownless.players.ai.graveyard.length,
      crowned: crowned.players.ai.graveyard.length,
      wrongCrown: wrongCrown.players.ai.graveyard.length,
    };
    console.log("  WITNESS courtMill", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ crownless: 2, crowned: 10, wrongCrown: 2 });
  });
});
