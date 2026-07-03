/**
 * FINALE-OF-REVELATION — the {X}{U}{U} threshold-replacement X-spell:
 *   "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards,
 *    untap up to five lands, and you have no maximum hand size for the rest of the game. Exile ~."
 *
 * Modeled as a whole-oracle collapse (matchFinaleOfRevelation) → a fixed atom list:
 *   [ shuffle-graveyard-into-library (condX 10), draw (amountX), untap-lands (condX 10, uptoN 5) ] + selfExile.
 * Net draw = X either way; at X ≥ 10 you ALSO shuffle GY→library (before the draw) and untap up to five lands.
 * The vacuous "no maximum hand size" static is stripped (cleanup discard is unimplemented). "Exile ~" is the
 * spell exiling ITSELF on resolution (program.selfExile → runEffectProgram's GY-1 exiles instead of GY).
 *
 * CREED: below 10 the two condX atoms no-op (exactly as printed); at/above 10 all three fire in printed order.
 * A different threshold / effect list / rider leaves residue → no match → low → Arbiter (a SAFE false-negative),
 * proven by the near-miss below.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { parseEffectProgram, programConfidence } from "./parser.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const FINALE = {
  name: "Finale of Revelation",
  type: "Sorcery",
  mana: "{X}{U}{U}",
  oracle:
    "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards, untap up to five lands, and you have no maximum hand size for the rest of the game.\nExile Finale of Revelation.",
};

function land(id, controller, { tapped = false } = {}) {
  return { id, card: { name: "Island", type: "Basic Land — Island", oracle: "" }, controller, tapped, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
// The card object (payload.spellToGraveyard) so GY-1 can dispose it (to GY, or — with selfExile — to exile).
const CARD = { id: "finale-card", name: "Finale of Revelation", type: "Sorcery" };
function stackObj(program, { controller = "user", xValue = 0 } = {}) {
  return {
    id: "stk-1", kind: "spell", source: { name: "Finale of Revelation", oracle: FINALE.oracle }, controller, targets: [], cost: null,
    payload: {
      resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
      params: { program, controller, targets: [], xValue, spellToGraveyard: { playerId: controller, card: CARD } },
    },
  };
}

describe("Finale of Revelation — parse + classify", () => {
  it("classifies native-spell and parses HIGH with the exact atom list + selfExile", () => {
    expect(classifyCard(FINALE)).toBe("native-spell");
    const p = parseEffectProgram(FINALE);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.selfExile).toBe(true);
    expect(p.atoms.map(a => a.op)).toEqual(["shuffle-graveyard-into-library", "draw", "untap-lands"]);
    expect(p.atoms[0].condX).toEqual({ min: 10 });
    expect(p.atoms[1].amountX).toBe(true);
    expect(p.atoms[2]).toMatchObject({ uptoN: 5, condX: { min: 10 } });
  });
});

describe("Finale of Revelation — runtime (X < 10: base draw only)", () => {
  it("draws X, leaves the graveyard intact, does NOT untap lands, and still self-exiles the spell", () => {
    const library = Array.from({ length: 12 }, (_, i) => ({ id: `lib${i}`, name: `Lib${i}` }));
    const graveyard = [{ id: "gy1", name: "Dead1" }, { id: "gy2", name: "Dead2" }];
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          library, graveyard, hand: [],
          battlefield: [land("t1", "user", { tapped: true }), land("t2", "user", { tapped: true })],
        },
      },
    };
    const program = parseEffectProgram(FINALE);
    const out = runEffectProgram(state, stackObj(program, { xValue: 3 }));

    expect(out.players.user.hand.length).toBe(3);            // drew X = 3
    // "Exile Finale of Revelation." is an UNCONDITIONAL sentence (NOT inside the ≥10 branch), so the spell
    // self-exiles at ANY X. The pre-existing graveyard is untouched (the ≥10 shuffle didn't fire below 10).
    expect(out.players.user.graveyard.map(c => c.id)).toEqual(["gy1", "gy2"]); // GY intact; spell NOT in GY
    expect((out.players.user.exile || []).map(c => c.id)).toEqual(["finale-card"]); // spell exiled itself
    expect(out.players.user.battlefield.every(p => p.tapped)).toBe(true); // lands stayed TAPPED (untap gated off)
    expect(out.pendingArbiter).toBeUndefined();
  });
});

describe("Finale of Revelation — runtime (X >= 10: instead branch)", () => {
  it("shuffles GY into library FIRST, draws X from the refilled pool, untaps up to five lands, and EXILES the spell", () => {
    // Empty library, 6 cards in the graveyard → after shuffle-GY-into-library the library has 6, so a 5-card
    // draw is possible only BECAUSE the shuffle ran first (proves ordering + shuffle-into-library).
    const graveyard = Array.from({ length: 6 }, (_, i) => ({ id: `gy${i}`, name: `Dead${i}` }));
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          library: [], graveyard, hand: [],
          // 6 tapped lands — only 5 should untap (uptoN cap); one stays tapped.
          battlefield: Array.from({ length: 6 }, (_, i) => land(`L${i}`, "user", { tapped: true })),
        },
      },
    };
    const program = parseEffectProgram(FINALE);
    const out = runEffectProgram(state, stackObj(program, { xValue: 10 }));

    // The GY was shuffled into the library, then X (=10) drawn from it. GY had 6 cards → after moving them to
    // library and drawing 6, the hand holds 6 (the library only had 6). The GY is now empty of its originals
    // (only the resolved spell would go there — but this is a self-exile, so GY stays empty).
    expect(out.players.user.hand.length).toBe(6);            // drew everything the refilled library held
    expect(out.players.user.library.length).toBe(0);         // all 6 shuffled-in cards were drawn
    expect(out.players.user.graveyard).toHaveLength(0);      // GY emptied by the shuffle; spell self-exiled (not here)
    expect((out.players.user.exile || []).map(c => c.id)).toEqual(["finale-card"]); // spell EXILED itself
    const untapped = out.players.user.battlefield.filter(p => !p.tapped).length;
    expect(untapped).toBe(5);                                // exactly five lands untapped (cap honored)
    expect(out.pendingArbiter).toBeUndefined();
  });

  it("untaps only min(5, tapped lands) — never over-untaps", () => {
    const graveyard = Array.from({ length: 3 }, (_, i) => ({ id: `gy${i}`, name: `Dead${i}` }));
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          library: Array.from({ length: 20 }, (_, i) => ({ id: `lib${i}`, name: `Lib${i}` })),
          graveyard, hand: [],
          battlefield: [land("a", "user", { tapped: true }), land("b", "user", { tapped: false }), land("c", "user", { tapped: true })],
        },
      },
    };
    const program = parseEffectProgram(FINALE);
    const out = runEffectProgram(state, stackObj(program, { xValue: 11 }));
    // Only 2 lands were tapped → both untap; the already-untapped one is unchanged. No error, no over-reach.
    expect(out.players.user.battlefield.every(p => !p.tapped)).toBe(true);
  });
});

describe("Finale of Revelation — CREED near-miss (stays Arbiter)", () => {
  it("a DIFFERENT threshold value does not match the anchor → low → Arbiter", () => {
    const nearMiss = {
      ...FINALE,
      // threshold 8 instead of 10 — the exact anchor must reject it (a fabricated 10-gate would be a wrong model)
      oracle: FINALE.oracle.replace("If X is 10 or more", "If X is 8 or more"),
    };
    expect(classifyCard(nearMiss)).toBe("arbiter-spell");
    expect(programConfidence(parseEffectProgram(nearMiss))).toBe("low");
  });

  it("an EXTRA unmodeled effect in the instead-branch leaves residue → low → Arbiter", () => {
    const nearMiss = {
      ...FINALE,
      // add "and you gain 5 life" to the instead-list — the anchor must reject (never a partial model)
      oracle: FINALE.oracle.replace("untap up to five lands,", "untap up to five lands, gain 5 life,"),
    };
    expect(programConfidence(parseEffectProgram(nearMiss))).toBe("low");
  });

  it("a base draw with a NON-self-exile tail (goes to graveyard) is not this shape", () => {
    // Drop the "Exile ~" self-exile — a plain "Draw X. If X>=10, instead ..." with no exile is a different card;
    // the anchor requires the exile tail, so this must not falsely claim the selfExile model.
    const noExile = { ...FINALE, oracle: FINALE.oracle.replace(/\s*\nExile Finale of Revelation\.$/, "") };
    const p = parseEffectProgram(noExile);
    // Without the exile tail the whole-oracle anchor fails → low (the multi-effect instead-branch is unmodeled
    // by the generic splitter), so it stays on the Arbiter — never a partial.
    expect(programConfidence(p)).toBe("low");
  });
});
