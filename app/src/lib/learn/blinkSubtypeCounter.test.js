/**
 * blinkSubtypeCounter.test.js — BLINK + SUBTYPE-COUNTER RIDER (SHELF-TAIL — Brago's flicker vein #4; Essence
 * Flux). "Exile target creature you control, then return that card to the battlefield under its owner's
 * control. If it's a Spirit, put a +1/+1 counter on it." The base self-blink already classifies (blinkFlicker
 * .test.js); the trailing conditional counter on the RETURNED card was a second sentence the splitter stranded,
 * so the whole spell parked. Collapsed by matchBlinkSubtypeCounter into the ONE blink atom the base form emits
 * plus an ifSubtypeCounter rider applyBlink honors — checking the RETURNED permanent's live type line (CR
 * 400.7: a NEW object). The subtype is validated against CR_CREATURE_TYPES (a bogus word → LOW → Arbiter).
 * Flip +1/0/0.
 *
 * Mutation-checked (via Edit): (1) neuter matchBlinkSubtypeCounter → Essence Flux arbiter-spell (parse +
 * classify die); (2) neuter the ifSubtypeCounter block in applyBlink → the Spirit returns WITHOUT the counter
 * (the runtime pin dies) — proving the rider load-bearing, not cosmetic.
 */
import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyBlink } from "./effects/atoms/zones.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const FLUX_ORACLE = "Exile target creature you control, then return that card to the battlefield under its owner's control. If it's a Spirit, put a +1/+1 counter on it.";
const FLUX_ATOM = { op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: "owner", ifSubtypeCounter: { subtype: "Spirit", counterType: "+1/+1", amount: 1 } };

function boardWith(card) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [{ id: "p1", controller: "user", owner: "user", card, counters: {}, summoningSick: false }] } } };
}
const blink = (state) => applyBlink(state, FLUX_ATOM, { controller: "user", targets: [{ type: "creature", id: "p1" }] });
const bf = (s) => s.players.user.battlefield;

describe("parse + classify", () => {
  it("the two-sentence blink + Spirit rider collapses to ONE blink atom with ifSubtypeCounter", () => {
    const p = parseEffectClause(FLUX_ORACLE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([FLUX_ATOM]);
    expect(classifyCard({ name: "Essence Flux", type: "Instant", mana: "{U}", oracle: FLUX_ORACLE })).toBe("native-spell");
  });
  it("the plain self-blink (no rider) is unchanged — still native, no ifSubtypeCounter", () => {
    const p = parseEffectClause("Exile target creature you control, then return that card to the battlefield under your control.", "Instant");
    expect(p.atoms[0].ifSubtypeCounter).toBeUndefined();
  });
  it("CREED gate — a bogus (non-CR) subtype nulls the whole match → LOW → Arbiter (never a fabricated counter)", () => {
    expect(programConfidence(parseEffectClause("Exile target creature you control, then return that card to the battlefield under its owner's control. If it's a Bogusthing, put a +1/+1 counter on it.", "Instant"))).toBe("low");
  });
});

describe("RUNTIME — the rider fires only for the matching subtype (CREED core)", () => {
  it("a blinked SPIRIT returns with a +1/+1 counter (on the NEW object)", () => {
    const s = blink(boardWith({ id: "cs", name: "SpModel", type: "Creature — Spirit", oracle: "", power: 1, toughness: 1 }));
    expect(bf(s)[0].id).not.toBe("p1");            // CR 400.7 — new object
    expect(bf(s)[0].counters?.["+1/+1"] || 0).toBe(1);
  });
  it("a blinked NON-Spirit returns with NO counter (the rider doesn't fire)", () => {
    const s = blink(boardWith({ id: "cb", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }));
    expect(bf(s)[0].counters?.["+1/+1"] || 0).toBe(0);
  });
  it("a multi-typed creature that INCLUDES Spirit still gets the counter (word-bound type-line read)", () => {
    const s = blink(boardWith({ id: "csw", name: "SpWarrior", type: "Creature — Spirit Warrior", oracle: "", power: 2, toughness: 2 }));
    expect(bf(s)[0].counters?.["+1/+1"] || 0).toBe(1);
  });
});
