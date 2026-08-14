/**
 * jeskasWill.test.js — JESKA'S WILL (2026-08-14), the Hulk Smash + Cap America cross-deck staple.
 * "Choose one. If you control a commander as you cast this spell, you may choose both instead. /
 * • Add {R} for each card in target opponent's hand. / • Exile the top three cards of your library.
 * You may play them this turn."
 *
 * ⭐ ONE NEW ARM on existing rails: the Akroma conditional-both modal (conditionalBothCommander) and
 * the impulse-exile-3 mode already existed — only the scaled targeted mana add was new. The amount is
 * the TARGETED opponent's LIVE hand size at resolution (CR 608.2h); a departed target adds 0.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the arm disabled -> Jeska's Will parks (mode 1 unmodeled → the all-or-nothing modal gate).
 *   · the resolver's live hand read replaced with a fixed 1 -> the 5-card witness dies.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const JESKA = { id: "c-jw", name: "Jeska's Will", type: "Sorcery", mana: "{2}{R}",
  oracle: "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Add {R} for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn." };

describe("the carrier and the mode", () => {
  it("⭐ Jeska's Will flips native-spell; mode 1 is the scaled targeted add", () => {
    expect(classifyCard(JESKA)).toBe("native-spell");
    const p = parseEffectClause("add {r} for each card in target opponent's hand", "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-mana", manaPerTargetHand: "R", targetType: "opponent" });
  });
});

describe("⭐⭐ LAW 6 — the mana equals the TARGET's live hand, red, into your pool", () => {
  it("⭐⭐ a 5-card opponent hand: exactly {R}{R}{R}{R}{R}", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s0 = { ...g, players: { ...g.players, ai1: { ...g.players.ai1, hand: Array.from({ length: 5 }, (_, i) => ({ id: "h" + i, name: "Card " + i, type: "Instant" })) } } };
    const atom = parseEffectClause("add {r} for each card in target opponent's hand", "Sorcery").atoms[0];
    const after = ATOM_RESOLVERS["add-mana"](s0, atom, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    const row = { R: after.players.user.manaPool.R, otherColors: after.players.user.manaPool.G + after.players.user.manaPool.U };
    console.log("  WITNESS jeskaMana", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ R: 5, otherColors: 0 });
  });

  it("⛔ an EMPTY opponent hand adds nothing (never a fabricated floor)", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const atom = parseEffectClause("add {r} for each card in target opponent's hand", "Sorcery").atoms[0];
    const after = ATOM_RESOLVERS["add-mana"](g, atom, { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(after.players.user.manaPool.R).toBe(0);
  });
});
