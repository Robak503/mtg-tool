/**
 * gameFeatures.test.js — the STATE FEATURIZER (Learn-to-Play Track-1a).
 *
 * Builds a KNOWN game state by hand (deterministic ids via _resetIdsForTests) and
 * asserts featurizeState reads the EXACT expected numbers off it — both seats'
 * perspectives, the layer-aware P/T path (a +1/+1 counter shows up), land/attacker
 * counting, the opponent aggregates, and the differentials. Pure: no engine run.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createGameState,
  createPermanent,
  addCounter,
  _resetIdsForTests,
} from "./gameState.js";
import { featurizeState, featureVector, FEATURE_KEYS } from "./gameFeatures.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, power, toughness, controller, extra = {}) =>
  createPermanent({
    card: { name, type: "Creature — Bear", power, toughness, oracle: "" },
    controller,
    ...extra,
  });
const land = (name, controller, extra = {}) =>
  createPermanent({ card: { name, type: "Land", oracle: "" }, controller, ...extra });

/**
 * A known Standard board:
 *   user: life 20, hand 3, library 30, mana pool {R:1}; battlefield = 2/2 (untapped,
 *         not sick) + 3/3 with a +1/+1 counter (→ 4/4, untapped, not sick) + 2 lands
 *         (one tapped) + 1 tapped land.
 *   ai:   life 17, hand 2, library 25; battlefield = a 5/5 (tapped) + 1 untapped land.
 * Turn 4, user is the active player.
 */
function knownState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const userBear = creature("Bear", 2, 2, "user", { summoningSick: false }); // perm-1
  let pumped = creature("Knight", 3, 3, "user", { summoningSick: false }); // perm-2
  const userLandA = land("Forest", "user", { tapped: false }); // perm-3
  const userLandB = land("Mountain", "user", { tapped: true }); // perm-4 (tapped)
  const aiBeast = creature("Beast", 5, 5, "ai", { tapped: true }); // perm-5 (tapped)
  const aiLand = land("Island", "ai", { tapped: false }); // perm-6

  let s = {
    ...base,
    turn: 4,
    activePlayer: "user",
    players: {
      ...base.players,
      user: {
        ...base.players.user,
        life: 20,
        hand: [{ id: "h1" }, { id: "h2" }, { id: "h3" }],
        library: Array.from({ length: 30 }, (_, i) => ({ id: `u-lib-${i}` })),
        manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 },
        battlefield: [userBear, pumped, userLandA, userLandB],
      },
      ai: {
        ...base.players.ai,
        life: 17,
        hand: [{ id: "a1" }, { id: "a2" }],
        library: Array.from({ length: 25 }, (_, i) => ({ id: `a-lib-${i}` })),
        battlefield: [aiBeast, aiLand],
      },
    },
  };
  // Put a +1/+1 counter on the Knight → it must read as a 4/4 (layer-aware).
  s = addCounter(s, { permanentId: pumped.id, type: "+1/+1", amount: 1 });
  return s;
}

describe("featurizeState — known board, user perspective", () => {
  it("reads vitals, board roll-ups, resources, and the layer-aware P/T", () => {
    const f = featurizeState(knownState(), "user");

    // vitals
    expect(f.own_life).toBe(20);
    expect(f.own_poison).toBe(0);

    // board: 2 creatures (Bear + Knight), power 2 + 4 (counter!) = 6, toughness 2 + 4 = 6
    expect(f.own_creatures).toBe(2);
    expect(f.own_board_power).toBe(6); // proves the +1/+1 counter is reflected (3→4)
    expect(f.own_board_toughness).toBe(6);
    expect(f.own_untapped_creatures).toBe(2);
    expect(f.own_attackers).toBe(2); // both untapped + not summoning-sick
    expect(f.own_permanents).toBe(4); // 2 creatures + 2 lands
    expect(f.own_lands).toBe(2);
    expect(f.own_untapped_lands).toBe(1); // Mountain is tapped

    // resources
    expect(f.own_hand_size).toBe(3);
    expect(f.own_library_size).toBe(30);
    expect(f.own_available_mana).toBe(1); // {R:1}

    // tempo
    expect(f.turn).toBe(4);
    expect(f.is_active_player).toBe(1);
  });

  it("aggregates the opponent and computes differentials from the user's seat", () => {
    const f = featurizeState(knownState(), "user");

    expect(f.opp_count).toBe(1);
    expect(f.opp_life_total).toBe(17);
    expect(f.opp_life_max).toBe(17);
    expect(f.opp_life_min).toBe(17);
    expect(f.opp_creatures).toBe(1);
    expect(f.opp_board_power).toBe(5);
    expect(f.opp_board_toughness).toBe(5);
    expect(f.opp_permanents).toBe(2); // beast + land
    expect(f.opp_hand_size).toBe(2);

    // differentials (own − best opponent)
    expect(f.life_diff).toBe(20 - 17); // +3
    expect(f.board_power_diff).toBe(6 - 5); // +1
    expect(f.creature_diff).toBe(2 - 1); // +1
    expect(f.card_advantage).toBe(3 - 2); // +1
  });
});

describe("featurizeState — opponent perspective (mirror)", () => {
  it("the ai seat sees the user as its opponent, with mirrored differentials", () => {
    const f = featurizeState(knownState(), "ai");
    expect(f.own_life).toBe(17);
    expect(f.own_creatures).toBe(1);
    expect(f.own_board_power).toBe(5);
    expect(f.own_untapped_creatures).toBe(0); // ai beast is tapped
    expect(f.own_attackers).toBe(0); // tapped → can't attack
    expect(f.opp_life_max).toBe(20); // the user
    expect(f.opp_board_power).toBe(6);
    expect(f.life_diff).toBe(17 - 20); // −3, the sign flips vs the user's seat
    expect(f.is_active_player).toBe(0); // it's the user's turn
  });
});

describe("featurizeState — robustness + the vector projection", () => {
  it("produces every FEATURE_KEY as a finite number", () => {
    const f = featurizeState(knownState(), "user");
    for (const k of FEATURE_KEYS) {
      expect(Number.isFinite(f[k])).toBe(true);
    }
  });

  it("an eliminated / missing seat features as an all-zero dead board (never throws)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const f = featurizeState(s, "ai3"); // not a seat in this Standard game
    expect(f.own_life).toBe(0);
    expect(f.own_creatures).toBe(0);
    expect(f.opp_count).toBe(0);
    expect(f.opp_life_min).toBe(0); // Infinity guard → 0
  });

  it("featureVector projects onto the canonical FEATURE_KEYS order", () => {
    const f = featurizeState(knownState(), "user");
    const v = featureVector(f);
    expect(v).toHaveLength(FEATURE_KEYS.length);
    expect(v[0]).toBe(f[FEATURE_KEYS[0]]); // own_life first
    expect(v[FEATURE_KEYS.indexOf("turn")]).toBe(4);
  });
});
