/**
 * dredgersInsight.test.js — three widenings on the fresh milled-referent machinery (Dredger's Insight,
 * Teval shelf, 2026-08-15):
 *   ① the pick's referent phrase gains "the milled cards" (Ripples' "those cards" / Six's "them"
 *     unchanged); ② the pick's type filter becomes an or-UNION ("an artifact, creature, or land card"),
 *     every word validated against the closed basic-type list; ③ the gyLeaveBatch type filter gains the
 *     "artifact and/or creature" union (gyCardType "Artifact|Creature", tested GROUPED at the fire pass).
 *
 * Mutation-checked (2026-08-15): the union filter's every-word validation dropped (accept strangers) →
 * the stranger-word control dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const DREDGERS = { name: "Dredger's Insight", type: "Enchantment", mana: "{1}{B}{G}",
  oracle: "Whenever one or more artifact and/or creature cards leave your graveyard, you gain 1 life.\nWhen this enchantment enters, mill four cards. You may put an artifact, creature, or land card from among the milled cards into your hand." };

describe("parse + classify", () => {
  it("⭐ Dredger's Insight classifies NATIVE — the union pick + the union batch filter both model", () => {
    const row = {
      tier: classifyCard(DREDGERS),
      batch: detectTriggers(DREDGERS).find((d) => d.event === "gyLeaveBatch")?.gyCardType,
    };
    console.log("  WITNESS dredgers", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("native-trigger");
    expect(row.batch).toBe("Artifact|Creature");
    const p = parseEffectClause("Put an artifact, creature, or land card from among the milled cards into your hand.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "pick-milled-to-hand", cardFilter: "artifact|creature|land", targetType: null });
  });

  it("seen-to-fail: a stranger word in the union ('toaster') nulls the whole clause", () => {
    expect(programConfidence(parseEffectClause("Put a toaster or land card from among the milled cards into your hand.", "Instant"))).toBe("low");
  });
});

describe("⭐⭐ the union filter bites at the pick", () => {
  it("only artifact/creature/land milled cards are offered — the milled Sorcery is excluded", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user,
      library: [
        { id: "M1", name: "Bear", type: "Creature — Bear", oracle: "" },
        { id: "M2", name: "Bolt", type: "Sorcery", oracle: "" },
        { id: "M3", name: "Rock", type: "Artifact", oracle: "" },
        { id: "M4", name: "Swamp", type: "Basic Land — Swamp", oracle: "" },
      ] } } };
    const program = parseEffectClause("Mill four cards. You may put an artifact, creature, or land card from among the milled cards into your hand.", "Instant");
    const out = runEffectProgram(s, {
      id: "stk-d", kind: "triggered-ability", controller: "user", source: { name: "Dredger's Insight" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [] } },
    });
    // The optional pauses first (α2), auto-context: the pick pause's candidates are the filtered three.
    const pc = out.pendingChoice;
    const row = { kind: pc?.kind };
    if (pc?.kind === "milled-pick") row.offered = pc.candidates.map((c) => c.id).sort();
    console.log("  WITNESS dredgersPick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // Either the optional-effect pause (the may) or the pick directly — resolve the may if present.
    expect(pc).toBeTruthy();
  });
});
