/**
 * flashbackCast.test.js — FLASHBACK (CR 702.34a): the runtime graveyard-recast + exile flow.
 *
 * Coverage already credits a flashback card native on its BODY (parser.stripCastKeywordLines drops the
 * "Flashback {cost}" line so the from-hand body flips native; the graveyard recast is a documented SAFE
 * false-negative). This lane makes the recast REAL — WITHOUT moving any tier: the offer is gated on the
 * classifier's OWN native verdict (isNativeTier(classifyCard)), so the runtime and the metric stay in lockstep.
 *
 * The full flow (CR 702.34a): while the card sits in your graveyard and its flashback MANA cost is payable,
 * legalActionsForPlayer offers a `flashbackCast` cast-spell action from fromZone "graveyard"; the dispatcher
 * pays the flashback cost, resolves the (already-modeled) body, then EXILES the card as it leaves the stack
 * (never the graveyard → the offer can't re-fire → the recast is truly once). An unpayable cost is never
 * offered; an unmodeled-body flashback card is never offered; a NON-MANA / X / reduction-rider flashback cost
 * is never offered (all SAFE false-negatives — the card stays native on its body, only the recast is withheld).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real-corpus fixtures (faithful bundled oracle shape) ──
// Think Twice — Instant, {1}{U}; flashback {2}{U}. Body "Draw a card" is a modeled atom → native.
const THINK_TWICE = {
  id: "tt1", name: "Think Twice", type: "Instant", mana: "{1}{U}", keywords: [],
  oracle: "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
};
// Faithless Looting — Sorcery, {R}; flashback {2}{R}. Body "Draw two, then discard two" → native.
const FAITHLESS = {
  id: "fl1", name: "Faithless Looting", type: "Sorcery", mana: "{R}", keywords: [],
  oracle: "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
};
// ── Anti-FP fixtures ──
// Cabal Therapy — UNMODELED body (choose a card name + reveal/discard) → arbiter, never offered.
const CABAL_THERAPY = {
  id: "ct1", name: "Cabal Therapy", type: "Sorcery", mana: "{B}", keywords: [],
  oracle: "Choose a nonland card name. Target player reveals their hand and discards all cards with that name.\nFlashback—Sacrifice a creature. (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
};
// Dread Return — MODELED body (reanimate) but a NON-MANA em-dash flashback cost → native on its body, but the
// graveyard recast is withheld (parseFlashbackManaCost returns null; a SAFE FN, exactly like the strip's posture).
const DREAD_RETURN = {
  id: "dr1", name: "Dread Return", type: "Sorcery", mana: "{2}{B}", keywords: [],
  oracle: "Return target creature card from your graveyard to the battlefield.\nFlashback—Sacrifice three creatures. (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
};
// Devil's Play — MODELED body (X damage) but an X flashback cost → withheld (minimal version parks X flashback).
const DEVILS_PLAY = {
  id: "dp1", name: "Devil's Play", type: "Sorcery", mana: "{X}{R}", keywords: [],
  oracle: "Devil's Play deals X damage to any target.\nFlashback {X}{R}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
};

const island = (id) => ({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", tapped: false, summoningSick: false });
const mountain = (id) => ({ id, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", tapped: false, summoningSick: false });

// A user at their precombat main; `graveyard` holds the flashback card(s), `battlefield` the mana, `library` the
// draw source. Stack empty + priority + active player → both instant and sorcery timing windows are open.
function gyState({ graveyard, battlefield, library = [{ id: "lib1", name: "Bear", type: "Creature — Bear", oracle: "" }, { id: "lib2", name: "Ox", type: "Creature — Ox", oracle: "" }, { id: "lib3", name: "Elk", type: "Creature — Elk", oracle: "" }] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, hand: [], battlefield, library, graveyard } },
  };
}
const flashbackActions = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.flashbackCast);

describe("flashback — recognition (metric ⇄ runtime lockstep)", () => {
  it("a modeled-body flashback card is native AND offered a graveyard flashback cast when payable", () => {
    expect(isNativeTier(classifyCard(THINK_TWICE))).toBe(true);
    const s = gyState({ graveyard: [THINK_TWICE], battlefield: [island("i1"), island("i2"), island("i3")] });
    const fb = flashbackActions(s);
    expect(fb).toHaveLength(1);
    expect(fb[0].cardId).toBe("tt1");
    expect(fb[0].fromZone).toBe("graveyard");
    expect(fb[0].cost).toMatchObject({ U: 1, generic: 2 }); // the FLASHBACK cost {2}{U}, not the {1}{U} mana cost
    expect(fb[0].cmc).toBe(2); // CR 202.3b — mana value stays the PRINTED {1}{U}
  });

  it("an unmodeled-body flashback card (Cabal Therapy) is NOT native and is NEVER offered", () => {
    expect(isNativeTier(classifyCard(CABAL_THERAPY))).toBe(false);
    const s = gyState({ graveyard: [CABAL_THERAPY], battlefield: [island("i1"), island("i2"), island("i3"), mountain("m1")] });
    expect(flashbackActions(s)).toHaveLength(0);
  });

  it("a modeled-body flashback card with a NON-MANA em-dash cost (Dread Return) stays native but is NOT offered", () => {
    expect(isNativeTier(classifyCard(DREAD_RETURN))).toBe(true); // native on its body (unchanged)
    const s = gyState({ graveyard: [DREAD_RETURN], battlefield: [island("i1"), island("i2"), mountain("m1")] });
    expect(flashbackActions(s)).toHaveLength(0); // the recast is a SAFE FN (non-mana cost)
  });

  it("an X flashback cost (Devil's Play) is native on its body but NOT offered (minimal version parks X)", () => {
    expect(isNativeTier(classifyCard(DEVILS_PLAY))).toBe(true);
    const s = gyState({ graveyard: [DEVILS_PLAY], battlefield: [mountain("m1"), mountain("m2"), mountain("m3"), mountain("m4")] });
    expect(flashbackActions(s)).toHaveLength(0);
  });
});

describe("flashback — full runtime flow (cast → resolve → EXILE)", () => {
  it("casting Think Twice from the graveyard draws a card, then EXILES it (never the graveyard)", () => {
    let s = gyState({ graveyard: [THINK_TWICE], battlefield: [island("i1"), island("i2"), island("i3")] });
    const handBefore = s.players.user.hand.length;
    const libBefore = s.players.user.library.length;

    const fb = flashbackActions(s)[0];
    s = dispatchAction(s, fb);
    // The card left the graveyard for the stack at cast (CR 601.2a).
    expect(s.players.user.graveyard.some(c => c.id === "tt1")).toBe(false);
    expect(s.stack.length).toBe(1);

    while (s.stack.length) s = resolveTopOfStack(s);

    // Effect resolved — drew exactly one card.
    expect(s.players.user.hand.length).toBe(handBefore + 1);
    expect(s.players.user.library.length).toBe(libBefore - 1);
    // CR 702.34a — the card is in EXILE, not the graveyard.
    expect(s.players.user.exile.some(c => c.id === "tt1")).toBe(true);
    expect(s.players.user.graveyard.some(c => c.id === "tt1")).toBe(false);
  });

  it("a SECOND flashback cast is impossible after the card is exiled", () => {
    let s = gyState({ graveyard: [THINK_TWICE], battlefield: [island("i1"), island("i2"), island("i3"), island("i4"), island("i5"), island("i6")] });
    s = dispatchAction(s, flashbackActions(s)[0]);
    while (s.stack.length) s = resolveTopOfStack(s);
    expect(s.players.user.exile.some(c => c.id === "tt1")).toBe(true);
    // Untap the lands so mana is NOT the reason there's no offer — the card is simply gone from the graveyard.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map(p => ({ ...p, tapped: false })) } } };
    expect(flashbackActions(s)).toHaveLength(0);
  });

  it("a sorcery-speed flashback body (Faithless Looting) resolves its multi-clause body then exiles", () => {
    let s = gyState({ graveyard: [FAITHLESS], battlefield: [mountain("m1"), mountain("m2"), mountain("m3")], library: [{ id: "d1", name: "A", type: "Creature — Bear", oracle: "" }, { id: "d2", name: "B", type: "Creature — Bear", oracle: "" }, { id: "d3", name: "C", type: "Creature — Bear", oracle: "" }] });
    const fb = flashbackActions(s)[0];
    expect(fb.cost).toMatchObject({ R: 1, generic: 2 });
    s = dispatchAction(s, fb);
    while (s.stack.length) s = resolveTopOfStack(s);
    // Drew two, discarded two — net hand 0; the two discarded cards + zero copies of Faithless are in the GY,
    // and Faithless itself is EXILED (not among the discards).
    expect(s.players.user.exile.some(c => c.id === "fl1")).toBe(true);
    expect(s.players.user.graveyard.some(c => c.id === "fl1")).toBe(false);
  });
});

describe("flashback — the flashback cost must be payable", () => {
  it("an unpayable flashback cost is NOT offered", () => {
    // Only one Island — cannot pay {2}{U}.
    const s = gyState({ graveyard: [THINK_TWICE], battlefield: [island("i1")] });
    expect(flashbackActions(s)).toHaveLength(0);
  });

  it("becomes offerable once enough mana is available", () => {
    const s = gyState({ graveyard: [THINK_TWICE], battlefield: [island("i1"), island("i2"), island("i3")] });
    expect(flashbackActions(s)).toHaveLength(1);
  });
});
