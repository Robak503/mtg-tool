/**
 * sarkhanFireblood.test.js — ⭐ the FIXED-amount restricted add (Sarkhan, Fireblood's +1).
 *
 * Dragons residue slice (2026-08-15), the sub-pool's SECOND minter (after Klauth's X-form):
 * "+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells."
 *
 *   - splitClauses keeps the two sentences FOLDED (the laundering-FP guard: the add alone would
 *     mint UNRESTRICTED mana — the exact failure the Klauth fold documents).
 *   - the arm reuses manaModel.parseSpendRestriction ITSELF, so the vocabulary / conjunctive /
 *     anti-lossy-tail guards are the payment planner's own — an unknown type word ("Elephant")
 *     keeps the clause LOW → Arbiter, pinned below.
 *   - CR 605.1a: a loyalty ability is NEVER a mana ability, so this atom riding the stack (the
 *     loyalty dispatcher's activated-ability object) is the printed fidelity, not a shortcut.
 *   - with all three abilities modeled, Sarkhan, Fireblood classifies native-planeswalker.
 *
 * Mutation-checked (2026-08-15): the splitClauses fold arm disabled → the +1 parses unmodeled and
 * the native-planeswalker pin dies; the applier's fixed-amount read dropped (always countForSpec) →
 * the resolution witness minted a 0-mana entry and died. Both restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseLoyaltyAbilities, planeswalkerNativelyCovered } from "./effects/loyaltyAbilities.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const SARKHAN = {
  id: "sfb", name: "Sarkhan, Fireblood", type: "Legendary Planeswalker — Sarkhan", mana: "{1}{R}{R}",
  colors: ["R"], color_identity: ["R"], loyalty: "3",
  oracle: "+1: You may discard a card. If you do, draw a card.\n+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.\n−7: Create four 5/5 red Dragon creature tokens with flying.",
};

describe("SARKHAN FIREBLOOD — parse: the fixed-amount restricted add, guarded by the planner's own vocabulary", () => {
  it("⭐ all three loyalty abilities modeled → native-planeswalker", () => {
    const abils = parseLoyaltyAbilities(SARKHAN);
    const row = {
      modeled: abils.map((a) => a.modeled),
      ops: abils.map((a) => a.program?.atoms?.map((x) => x.op).join("+")),
      covered: planeswalkerNativelyCovered(SARKHAN),
      tier: classifyCard(SARKHAN),
    };
    console.log("  WITNESS sarkhanFireblood", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.modeled).toEqual([true, true, true]);
    expect(row.ops).toEqual(["optional-discard-payment", "add-restricted-mana", "create-token"]);
    expect(row.covered).toBe(true);
    expect(row.tier).toBe("native-planeswalker");
  });

  it("the +1's atom carries the FULL restriction — amount 2, castTypes ['dragon'], NO hold (empties as steps end, CR 500.4)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Add two mana in any combination of colors. Spend this mana only to cast Dragon spells." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-restricted-mana", anyCombination: true, amount: 2, restriction: { castTypes: ["dragon"] }, targetType: null }]);
  });

  it("seen-to-fail: an out-of-vocabulary type word keeps the clause LOW (the planner's own word-set guard)", () => {
    // "Elephant" is not in SPEND_CAST_TYPE_WORDS — parseSpendRestriction refuses it, so the arm must not
    // fire and the clause stays low → Arbiter. A vocabulary bypass here would mint mana the spender
    // then refuses to spend — dead mana forever, or worse if the guard drifted looser.
    const p = parseEffectProgram({ type: "Instant", oracle: "Add two mana in any combination of colors. Spend this mana only to cast Elephant spells." });
    expect(programConfidence(p)).toBe("low");
  });

  it("the laundering control: the bare add WITHOUT its restriction sentence does not parse (nothing mints unrestricted)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Add two mana in any combination of colors." });
    expect(programConfidence(p)).toBe("low");
  });
});

describe("⭐⭐ SARKHAN FIREBLOOD — resolution: the +1 mints a tagged UN-held sub-pool entry off the walker", () => {
  it("⭐⭐ resolving the +1's program (sourceId = the walker) adds a 2-mana dragon-restricted entry, R-spread (mono-R identity)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const walker = { id: "PW1", card: SARKHAN, controller: "user", tapped: false, summoningSick: false, counters: { loyalty: 3 }, attachments: [], attachedTo: null };
    const s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [walker] } } };
    const program = parseEffectProgram({ type: "Instant", oracle: "Add two mana in any combination of colors. Spend this mana only to cast Dragon spells." });
    // The exact payload the loyalty dispatcher builds for a MODELED ability (kind activated-ability —
    // CR 605.1a: a loyalty add is not a mana ability, so it correctly rides the stack machinery).
    const out = runEffectProgram(s, {
      id: "stk-loy", kind: "activated-ability", controller: "user", source: SARKHAN,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [], sourceId: "PW1" } },
    });
    const rm = out.players.user.restrictedMana || [];
    const row = { entries: rm.length, pool: rm[0]?.pool, restriction: rm[0]?.restriction, held: rm[0]?.holdUntilEndOfTurn ?? null };
    console.log("  WITNESS sarkhanMint", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.entries).toBe(1);
    expect(row.pool).toEqual({ W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 }); // round-robin over the mono-R identity (the documented house spread)
    expect(row.restriction).toEqual({ castTypes: ["dragon"] });
    expect(row.held).toBe(null); // UN-held: emptyManaPools drops it as the step ends (CR 500.4) — the Klauth hold is the exception, not this
  });

  it("the RIDER (Desolation of Smaug, a SORCERY — no source permanent): the spread falls back WUBRG, never {C}", () => {
    // "Any combination of COLORS" can't produce colorless (the printed text names colors); with no
    // source permanent to read an identity from, the mint round-robins the five colors — any spread
    // is a legal player choice, and W/U/B/R here beats a {C} floor that pays only generic pips.
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const program = parseEffectProgram({ type: "Sorcery", oracle: "Add four mana in any combination of colors. Spend this mana only to cast Dragon spells." });
    const out = runEffectProgram(base, {
      id: "stk-sor", kind: "spell", controller: "user", source: { name: "Desolation of Smaug", type: "Sorcery" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [] } },
    });
    const rm = out.players.user.restrictedMana || [];
    expect(rm.length).toBe(1);
    expect(rm[0].pool).toEqual({ W: 1, U: 1, B: 1, R: 1, G: 0, C: 0 });
  });
});
