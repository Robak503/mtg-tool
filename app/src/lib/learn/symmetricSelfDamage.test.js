/**
 * symmetricSelfDamage.test.js — "Each creature deals N damage to its controller" (Rakdos Charm, #330).
 *
 * Structurally unlike every other damage shape the engine models. There is no single source and no creature
 * target: EACH CREATURE is its own source, and the target is THAT creature's own controller. So a player
 * takes N for each creature THEY control, and the totals are ASYMMETRIC across the table — a board of
 * 3 vs 1 creatures is 3 damage vs 1, not a flat sweep.
 *
 * That asymmetry is the whole card, and it is exactly what a lazy implementation gets wrong: modelling this
 * as "each player loses N" or as a board-wide burn would pass a symmetric one-creature-each test while
 * playing a completely different card. The uneven-board test below is the one that matters.
 *
 * SOURCE ATTRIBUTION MATTERS (CR 119.3): each packet is threaded with that creature's id as its source, not
 * the spell's, so lifelink/infect on those creatures behave correctly rather than every packet being
 * attributed to Rakdos Charm.
 *
 * Rakdos Charm's other two modes were already modelled — "destroy target artifact" always was, and
 * "exile target player's graveyard" landed with the whole-graveyard-exile atom earlier in this run. This
 * was the last mode standing, which is why one small atom flips a top-350 staple.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { stackResolvers } from "./effects/atoms/stack.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const bear = (id, controller) => ({
  id, controller,
  card: { id: `c-${id}`, name: `Bear-${id}`, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
});

/** user controls THREE creatures, ai1 ONE, ai2 none — a deliberately uneven board. */
function unevenBoard() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("u1", "user"), bear("u2", "user"), bear("u3", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
      ai2: { ...s0.players.ai2, battlefield: [] },
    },
  };
}

const run = (state, amount = 1) =>
  stackResolvers["each-creature-damages-controller"](state, { op: "each-creature-damages-controller", amount }, { controller: "user" });

describe("parse", () => {
  it("becomes its own atom, not a deal-damage variant", () => {
    const p = parseEffectClause("each creature deals 1 damage to its controller");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "each-creature-damages-controller", amount: 1, targetType: null }]);
  });
});

describe("RUNTIME — each player takes N per creature THEY control", () => {
  it("THE LOAD-BEARING ONE — an uneven board deals uneven damage (3 vs 1 vs 0)", () => {
    // A flat "each player loses N" or a board-wide burn would pass a symmetric test and fail here.
    const before = unevenBoard();
    const after = run(before);
    expect(before.players.user.life - after.players.user.life).toBe(3);
    expect(before.players.ai1.life - after.players.ai1.life).toBe(1);
    expect(before.players.ai2.life - after.players.ai2.life).toBe(0);
  });

  it("a player with NO creatures takes nothing, even though the spell resolved", () => {
    const after = run(unevenBoard());
    expect(after.players.ai2.life).toBe(unevenBoard().players.ai2.life);
  });

  it("the amount scales per creature (2 damage each => 6 for three creatures)", () => {
    const before = unevenBoard();
    const after = run(before, 2);
    expect(before.players.user.life - after.players.user.life).toBe(6);
    expect(before.players.ai1.life - after.players.ai1.life).toBe(2);
  });

  it("the CASTER is not spared — this is symmetric, and it hits its own controller hardest here", () => {
    const before = unevenBoard();
    const after = run(before);
    expect(after.players.user.life).toBeLessThan(before.players.user.life);
  });

  it("an empty board is a clean no-op (nobody loses life)", () => {
    const base = unevenBoard();
    const empty = {
      ...base,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [] },
        ai1: { ...base.players.ai1, battlefield: [] },
      },
    };
    const after = run(empty);
    for (const pid of ["user", "ai1", "ai2"]) expect(after.players[pid].life).toBe(empty.players[pid].life);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Rakdos Charm's shape flips (its graveyard mode landed earlier this run)", () => {
    expect(classifyCard({
      name: "Rakdos Charm", type: "Instant", mana: "{B}{R}", keywords: [],
      oracle: "Choose one —\n• Exile target player's graveyard.\n• Destroy target artifact.\n• Each creature deals 1 damage to its controller.",
    })).toMatch(/^native/);
  });
});
