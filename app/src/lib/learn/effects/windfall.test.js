/**
 * ===== WINDFALL (max-discarded wheel) ===== the symmetric hand-refill native.
 *
 * "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded
 * this way." (Windfall; the base body of Whispering Madness). The NOVEL part is the draw magnitude: a value
 * generated MID-RESOLUTION — the GREATEST number of cards any player discarded during the discard step this
 * spell just ran (CR 608.2c "this way"). It's threaded from the discard atom (which stamps
 * state.maxDiscardedThisWay, mirroring Yuriko's reveal-top-to-hand → state.revealedCardMV) into a
 * draw who:eachPlayer atom that reads it via amountCount:{kind:"maxDiscardedThisWay"} (countForSpec).
 *
 * The discard step is the EXISTING whole-hand DISCARD-HAND atom (who:eachPlayer, all:true — no choice, forced
 * inline, never pauses); this slice adds (a) the recordMaxDiscarded stamp on that discard, (b) the
 * maxDiscardedThisWay count source, and (c) the collapsed two-atom matcher so the whole card flips native.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "./parser.js";
import { classifyCard, isNativeTier } from "../coverage.js";
import { applyDiscard } from "./atoms/hand.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { createGameState, _resetIdsForTests } from "../gameState.js";

beforeEach(() => _resetIdsForTests());

const WINDFALL = {
  name: "Windfall",
  type: "Sorcery",
  type_line: "Sorcery",
  mana: "{2}{U}",
  mana_cost: "{2}{U}",
  oracle: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.",
  oracle_text: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.",
};

const cards = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` }));

function stackObj(program, { controller = "user", targets = [] } = {}) {
  return {
    id: "stk-wf", kind: "spell", source: { name: "Windfall", oracle: WINDFALL.oracle }, controller, targets, cost: null,
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets } },
  };
}
// A 1v1 state with explicit per-player hand + library.
function twoPlayer({ userHand = [], userLib = [], aiHand = [], aiLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, library: userLib, graveyard: [] },
      ai: { ...s.players.ai, hand: aiHand, library: aiLib, graveyard: [] },
    },
  };
}

describe("WINDFALL — classification + parse", () => {
  it("Windfall classifies NATIVE (was arbiter-spell — the greatest-discarded draw count was unmodeled)", () => {
    expect(isNativeTier(classifyCard(WINDFALL))).toBe(true);
    expect(classifyCard(WINDFALL)).toBe("native-spell");
  });

  it("parses HIGH to the collapsed two-atom sequence (discard-hand-record-max, then eachPlayer draw-max)", () => {
    const p = parseEffectProgram(WINDFALL);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "discard", who: "eachPlayer", all: true, recordMaxDiscarded: true, targetType: null },
      { op: "draw", who: "eachPlayer", amountCount: { kind: "maxDiscardedThisWay", per: 1 }, targetType: null },
    ]);
    // Non-targeted (each-player discard + each-player draw) → routes natively (no chosen target).
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
});

describe("WINDFALL — runtime (1v1)", () => {
  it("asymmetric hands: each player discards their whole hand, then EACH draws the GREATEST discarded (3)", () => {
    // user holds 3, ai holds 1 → greatest discarded = 3 → BOTH draw 3.
    const s = twoPlayer({
      userHand: cards("uh", 3), userLib: cards("ul", 10),
      aiHand: cards("ah", 1), aiLib: cards("al", 10),
    });
    const out = runEffectProgram(s, stackObj(parseEffectProgram(WINDFALL)));

    expect(out.maxDiscardedThisWay).toBe(3);                       // greatest number a player discarded
    // Hands: the 3 old user cards + 1 old ai card are in graveyards; each drew 3 fresh from its own library.
    expect(out.players.user.graveyard.map((c) => c.id).sort()).toEqual(["uh0", "uh1", "uh2"]);
    expect(out.players.ai.graveyard.map((c) => c.id)).toEqual(["ah0"]);
    expect(out.players.user.hand).toHaveLength(3);                 // drew exactly the max (3)
    expect(out.players.ai.hand).toHaveLength(3);                   // drew the max too (3), NOT its own 1 discarded
    expect(out.players.user.hand.every((c) => c.id.startsWith("ul"))).toBe(true);
    expect(out.players.ai.hand.every((c) => c.id.startsWith("al"))).toBe(true);
    expect(out.pendingArbiter).toBeUndefined();                    // fully native, no Arbiter route
  });

  it("all empty hands → greatest discarded = 0 → nobody draws (a clean no-op, never a fabricated draw)", () => {
    const s = twoPlayer({ userHand: [], userLib: cards("ul", 5), aiHand: [], aiLib: cards("al", 5) });
    const out = runEffectProgram(s, stackObj(parseEffectProgram(WINDFALL)));
    expect(out.maxDiscardedThisWay).toBe(0);
    expect(out.players.user.hand).toHaveLength(0);
    expect(out.players.ai.hand).toHaveLength(0);
    expect(out.players.user.library).toHaveLength(5);             // no cards drawn
    expect(out.players.ai.library).toHaveLength(5);
  });

  it("the draw is capped by library size (deck-out) — user draws the max minus what it lacks", () => {
    // greatest discarded = 4 (user), but ai has only 2 cards left in library → ai draws 2, user draws 4.
    const s = twoPlayer({
      userHand: cards("uh", 4), userLib: cards("ul", 6),
      aiHand: cards("ah", 2), aiLib: cards("al", 2),
    });
    const out = runEffectProgram(s, stackObj(parseEffectProgram(WINDFALL)));
    expect(out.maxDiscardedThisWay).toBe(4);
    expect(out.players.user.hand).toHaveLength(4);                // drew all 4
    expect(out.players.ai.hand).toHaveLength(2);                  // wanted 4, library only had 2
    expect(out.players.ai.library).toHaveLength(0);
  });
});

describe("WINDFALL — discard atom records the max", () => {
  it("applyDiscard (recordMaxDiscarded) stamps state.maxDiscardedThisWay = the greatest non-token hand size", () => {
    const s = twoPlayer({ userHand: cards("uh", 2), aiHand: cards("ah", 5) });
    const out = applyDiscard(s, { op: "discard", who: "eachPlayer", all: true, recordMaxDiscarded: true }, { controller: "user" });
    expect(out.maxDiscardedThisWay).toBe(5);                      // ai discarded the most (5)
    expect(out.players.user.hand).toHaveLength(0);                // both hands emptied
    expect(out.players.ai.hand).toHaveLength(0);
  });

  it("a plain each-player discard-hand (NO recordMaxDiscarded) does NOT stamp the channel (byte-identical to before)", () => {
    const s = twoPlayer({ userHand: cards("uh", 3), aiHand: cards("ah", 1) });
    const out = applyDiscard(s, { op: "discard", who: "eachPlayer", all: true }, { controller: "user" });
    expect(out.maxDiscardedThisWay).toBeUndefined();              // no stamp on the non-Windfall form
    expect(out.players.user.hand).toHaveLength(0);
    expect(out.players.ai.hand).toHaveLength(0);
  });
});

describe("WINDFALL — CREED guards", () => {
  // ⭐ INVERTED IN PLACE 2026-08-05, guard job preserved. This asserted the Cipher rider kept Whispering
  // Madness low. Cipher is now credited on the untaken-option rationale — the same basis buyback has always
  // been stripped on (an optional disposition change the engine declines; a normal cast resolves the printed
  // body byte-identically). The card's WINDFALL body is what this file is really about, and it is unchanged:
  // the pin below now asserts the body carries the program, with an unmodeled-rider guard kept beside it so
  // the CREED check this describe-block exists for still runs.
  it("Whispering Madness (Windfall body + a Cipher rider) is now HIGH — the body carries it", () => {
    const wm = {
      name: "Whispering Madness", type: "Sorcery", type_line: "Sorcery", mana: "{2}{U}{B}", mana_cost: "{2}{U}{B}",
      oracle: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)",
      oracle_text: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)",
    };
    expect(programConfidence(parseEffectProgram(wm))).toBe("high"); // the Cipher rider is declined; the Windfall body carries the card
    expect(classifyCard(wm)).toMatch(/^native/);
    // …and the CREED guard this pin carried is intact, on a rider that IS still unmodeled:
    const odd = { ...wm, name: "Odd Madness",
      oracle: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.\nSpecialize {3}",
      oracle_text: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.\nSpecialize {3}" };
    expect(classifyCard(odd)).not.toMatch(/^native/);
  });

  it("a near-miss draw magnitude (fixed 'draws seven cards' = Wheel) is NOT this matcher — it's the plain WHEEL native", () => {
    // Proves the collapsed matcher is anchored to the greatest-discarded form, not a blanket discard+draw. The
    // fixed-N wheel resolves to a plain each-player draw N (no maxDiscardedThisWay channel).
    const wheel = { type: "Sorcery", mana: "{2}{R}", name: "Wheel of Fortune",
      oracle: "Each player discards their hand, then draws seven cards." };
    const p = parseEffectProgram(wheel);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "discard", who: "eachPlayer", targetType: null, all: true },
      { op: "draw", amount: 7, who: "eachPlayer", targetType: null },
    ]);
    // Crucially it does NOT carry recordMaxDiscarded / maxDiscardedThisWay (a different, unrelated mechanic).
    expect(p.atoms[0].recordMaxDiscarded).toBeUndefined();
  });

  it("a rider on the greatest-discarded form (a trailing sentence) leaves residue → low → Arbiter", () => {
    const rider = { type: "Sorcery", mana: "{2}{U}", name: "Fake Windfall",
      oracle: "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way. You gain 2 life." };
    expect(programConfidence(parseEffectProgram(rider))).toBe("low");
  });
});
