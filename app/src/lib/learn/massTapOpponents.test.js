/**
 * massTapOpponents.test.js — "Tap all creatures your opponents control" (Cryptic Command, EDHREC #1617).
 *
 * The scope already existed: eachOpponentCreature is the shipped Scourge-of-Fleets bounce set — non-chosen,
 * layer-aware, opponents-only. What was missing was that applyTapEffect never consulted it.
 *
 * THE BUG THIS WOULD HAVE BEEN. applyTapEffect resolved its target list as:
 *
 *     const list = atom?.target ? atomTargets(...) : (ctx.targets || []);
 *
 * A non-chosen mass scope has no CHOSEN targets, so it would have read an empty ctx.targets and tapped
 * NOTHING — while the classifier happily credited Cryptic Command as native. That is the precise
 * "classifies native but silently does nothing" failure the codebase's ATOM_TARGETS_MASS_HANDLED load-time
 * guard exists to catch, reappearing one layer further out at the APPLIER rather than the enumerator. The
 * fix is gated on NON_CHOSEN_TARGET_TYPES rather than a hand-listed scope, so the next mass tap can't miss
 * the same seam. The runtime tests below are what prove it taps at all — a parse test would not have.
 *
 * ONLY THE OPPONENT FORM IS ADMITTED. A symmetric "tap all creatures" would also tap the caster's own board,
 * which is a different card, so it stays low → Arbiter. Pinned below.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const bear = (id, controller) => ({
  id, controller, tapped: false,
  card: { id: `c-${id}`, name: `Bear-${id}`, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
});

function board() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("u1", "user"), bear("u2", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [bear("b1", "ai2")] },
    },
  };
}

const tapped = (s, pid, id) => !!(s.players[pid].battlefield.find((p) => p.id === id) || {}).tapped;
const run = (s) => applyTapEffect(s, { op: "tap", targetType: "eachOpponentCreature" }, { controller: "user" }, true);

describe("parse", () => {
  it("reuses the shipped eachOpponentCreature mass scope", () => {
    const p = parseEffectClause("tap all creatures your opponents control");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "tap", targetType: "eachOpponentCreature" }]);
  });

  it("CREED — the SYMMETRIC form is a different card and stays refused", () => {
    expect(parseEffectClause("tap all creatures")?.atoms?.[0]?.op).not.toBe("tap");
  });

  it("REGRESSION PIN — the chosen single-target form is untouched", () => {
    expect(parseEffectClause("tap target permanent").atoms)
      .toEqual([{ op: "tap", targetType: "permanent", restrictions: [] }]);
  });
});

describe("RUNTIME — it actually taps (the assertion a parse test cannot make)", () => {
  it("every OPPONENT's creature ends up tapped, across multiple opponents", () => {
    const s = run(board());
    expect(tapped(s, "ai1", "a1")).toBe(true);
    expect(tapped(s, "ai2", "b1")).toBe(true);
  });

  it("THE LOAD-BEARING ONE — the caster's own creatures stay UNTAPPED", () => {
    const s = run(board());
    expect(tapped(s, "user", "u1")).toBe(false);
    expect(tapped(s, "user", "u2")).toBe(false);
  });

  it("a board where opponents have no creatures is a clean no-op", () => {
    const base = board();
    const s = run({
      ...base,
      players: {
        ...base.players,
        ai1: { ...base.players.ai1, battlefield: [] },
        ai2: { ...base.players.ai2, battlefield: [] },
      },
    });
    expect(tapped(s, "user", "u1")).toBe(false);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Cryptic Command's shape flips", () => {
    expect(classifyCard({
      name: "Cryptic Command", type: "Instant", mana: "{1}{U}{U}{U}", keywords: [],
      oracle: "Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.\n• Tap all creatures your opponents control.\n• Draw a card.",
    })).toMatch(/^native/);
  });
});
