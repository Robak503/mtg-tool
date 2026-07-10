/**
 * ptPredicateEvasion.test.js — P/T-PREDICATE group evasion (Tetsuko Umezawa, Fugitive — SHELF S7).
 *
 * "Creatures you control with power or toughness 1 or less can't be blocked." The Herald-of-Secret-Streams
 * layer-6 unblockable grant with a LAYER-AWARE P/T predicate (selector.powerOrToughnessAtMost): the bound is
 * re-read at every keyword query off the candidate's LIVE layer-7 power/toughness, so counters/anthems move
 * a creature in or out of the evasion mid-game — exactly the printed static (CR 509.1b). CREED FP = a
 * wrongly-unblockable creature, so the predicate boundary is pinned in both directions (power OR toughness
 * qualifies; both above the bound doesn't; a +1/+1 counter pushing BOTH above 1 revokes the grant live).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, addCounter } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const TETSUKO_ORACLE = "Creatures you control with power or toughness 1 or less can't be blocked.";
const tetsukoCard = (id = "tu-card") => ({
  id, name: "Tetsuko Umezawa, Fugitive", type: "Legendary Creature — Human Rogue",
  power: "1", toughness: "3", mana: "{U}{B}", oracle: TETSUKO_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const creature = (id, controller, pt) =>
  createPermanent({ id, card: { name: id, type: "Creature — Rogue", power: String(pt[0]), toughness: String(pt[1]), oracle: "" }, controller });

describe("parse + classify", () => {
  it("parses to the layer-6 unblockable grant with the P/T predicate; Tetsuko → native-static", () => {
    const [d] = parseStaticAbilities(tetsukoCard());
    expect(d).toMatchObject({
      layer: 6,
      op: { layerOp: "addKeyword", keyword: "unblockable" },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], powerOrToughnessAtMost: 1 } },
    });
    expect(classifyCard(tetsukoCard())).toBe("native-static");
  });
  it("CREED — a trailing qualifier ('…except by Walls') stays unparsed", () => {
    const v = { ...tetsukoCard(), oracle: "Creatures you control with power or toughness 1 or less can't be blocked except by Walls." };
    expect(parseStaticAbilities(v)).toEqual([]);
  });
});

describe("live layer-aware predicate (CREED core)", () => {
  function board() {
    let s = baseState();
    const tetsuko = createPermanent({ id: "tu", card: tetsukoCard(), controller: "user" });
    s = withBattlefield(s, "user", [
      tetsuko,
      creature("weenie", "user", [1, 1]),   // power ≤ 1 → unblockable
      creature("wall", "user", [0, 4]),     // power 0 ≤ 1 → unblockable (power OR toughness)
      creature("glass", "user", [4, 1]),    // toughness 1 → unblockable
      creature("bear", "user", [2, 2]),     // both above 1 → NOT unblockable
    ]);
    return s;
  }

  it("grants exactly the qualifying set — power OR toughness ≤ 1; both above → excluded", () => {
    const s = board();
    expect(permanentHasKeyword(s, "weenie", "unblockable")).toBe(true);
    expect(permanentHasKeyword(s, "wall", "unblockable")).toBe(true);
    expect(permanentHasKeyword(s, "glass", "unblockable")).toBe(true);
    expect(permanentHasKeyword(s, "bear", "unblockable")).toBe(false);
  });

  it("an opponent's 1/1 is NOT granted ('you control')", () => {
    let s = board();
    s = withBattlefield(s, "ai1", [creature("opp1", "ai1", [1, 1])]);
    expect(permanentHasKeyword(s, "opp1", "unblockable")).toBe(false);
  });

  it("LIVE revocation: a +1/+1 counter pushing a 1/1 to 2/2 removes the evasion (layer-7 read per query)", () => {
    let s = board();
    expect(permanentHasKeyword(s, "weenie", "unblockable")).toBe(true);
    s = addCounter(s, { permanentId: "weenie", type: "+1/+1", amount: 1 });
    expect(permanentHasKeyword(s, "weenie", "unblockable")).toBe(false);
  });

  it("Tetsuko leaving the battlefield drops the grant (dynamic static — source-gated)", () => {
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "tu") } } };
    expect(permanentHasKeyword(s, "weenie", "unblockable")).toBe(false);
  });
});
