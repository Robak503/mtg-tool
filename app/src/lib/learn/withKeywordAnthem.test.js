/**
 * withKeywordAnthem.test.js — BLITZ WD-1: the KEYWORD-PROPERTY-FILTERED anthem ("Other creatures you
 * control WITH FLYING get +N/+M" — Windstorm Drake / Empyrean Eagle / Spirit of the Spires). The
 * selector's withKeyword gate is LAYER-AWARE (permanentHasKeyword: printed ∪ keyword counter ∪ layer-6
 * grants), so an aura-granted flyer is buffed exactly like a printed one — and a ground creature, the
 * "other"-excluded source, and an OPPONENT's flyer are all untouched. Curated to flying + "you control"
 * (the corpus evidence); any other property word stays unmodeled (FN-safe).
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness, addContinuousEffect } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DRAKE = { id: "wd", name: "Windstorm Drake", type: "Creature — Drake", power: "2", toughness: "3",
  oracle: "Flying\nOther creatures you control with flying get +1/+1." };
const SPRITE = { id: "cs", name: "Cloud Sprite", type: "Creature — Faerie", power: "1", toughness: "1", oracle: "Flying" };
const BEAR = { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };

function board() {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const drake = createPermanent({ id: "d1", card: { ...DRAKE }, controller: "user", summoningSick: false });
  const flyer = createPermanent({ id: "f1", card: { ...SPRITE }, controller: "user", summoningSick: false });
  const ground = createPermanent({ id: "g1", card: { ...BEAR }, controller: "user", summoningSick: false });
  const theirFlyer = createPermanent({ id: "of1", card: { ...SPRITE, id: "cs2" }, controller: "ai1", summoningSick: false });
  return { ...s, players: { ...s.players,
    user: { ...s.players.user, battlefield: [drake, flyer, ground] },
    ai1: { ...s.players.ai1, battlefield: [theirFlyer] } } };
}

describe("classify + the printed-keyword buff", () => {
  it("the family flips native-static; flyers buff, ground/self/opponents don't", () => {
    expect(classifyCard(DRAKE)).toBe("native-static");
    expect(classifyCard({ ...DRAKE, id: "ss2", name: "Spirit of the Spires",
      oracle: "Flying\nOther creatures you control with flying get +0/+1." })).toBe("native-static");
    // An un-curated property word stays unmodeled (FN-safe — no fabricated selector).
    expect(classifyCard({ ...DRAKE, id: "x", name: "Hypothetical Lord",
      oracle: "Other creatures you control with deathtouch get +1/+1." })).not.toBe("native-static");
    const s = board();
    expect([permanentPower(s, "f1"), permanentToughness(s, "f1")]).toEqual([2, 2]);   // printed flyer +1/+1
    expect([permanentPower(s, "g1"), permanentToughness(s, "g1")]).toEqual([2, 2]);   // ground — untouched
    expect([permanentPower(s, "d1"), permanentToughness(s, "d1")]).toEqual([2, 3]);   // "other" — self excluded
    expect([permanentPower(s, "of1"), permanentToughness(s, "of1")]).toEqual([1, 1]); // opponent's flyer — untouched
  });
  it("LAYER-AWARE: a GRANTED flyer buffs while the grant lives, drops when it expires", () => {
    let s = board();
    // Grant the bear flying via a fixed layer-6 addKeyword (an aura/pump grant's stored shape).
    const { state: s2 } = addContinuousEffect(s, {
      layer: 6, op: { layerOp: "addKeyword", keyword: "flying" },
      affects: { mode: "fixed", permanentIds: ["g1"] }, duration: { kind: "endOfTurn", turn: s.turn },
      source: { kind: "resolution", permanentId: null, cardName: "Jump" },
    });
    expect([permanentPower(s2, "g1"), permanentToughness(s2, "g1")]).toEqual([3, 3]); // granted flyer → buffed
    // Remove the grant (expiry) → the buff falls off with it.
    const s3 = { ...s2, continuousEffects: [] };
    expect([permanentPower(s3, "g1"), permanentToughness(s3, "g1")]).toEqual([2, 2]);
  });
});
