/**
 * thrunTargetShield.test.js — ④-V (2026-09-03 night): THRUN, BREAKER OF SILENCE — Colton's Thrun Voltron commander,
 * the deck's last slot to the 90 bar. "Thrun can't be the target of nongreen spells your opponents control or
 * abilities from nongreen sources your opponents control." — hexproof-from-quality in all but name (CR 702.11c),
 * scoped to opponents; Gaea's Revenge prints the everyone-form. An inert layer-6 `targetShield` op (the playerHexproof
 * family) read by the single targetability seam, which already threads the source spell's colours for protection. A
 * colourless source is nongreen and refused; a path that threads no colours is refused too (an under-offer, never an
 * illegal targeting). Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { canBeTargetedBy, enumerateTargets } from "./spellEffects.js";
import { permanentTargetShields } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THRUN = { id: "c-thrun", name: "Thrun, Breaker of Silence", type: "Legendary Creature — Troll Shaman", mana: "{3}{G}{G}", mana_cost: "{3}{G}{G}", cmc: 5, power: 5, toughness: 5, keywords: ["Trample"], colors: ["G"],
  oracle: "This spell can't be countered.\nTrample\nThrun can't be the target of nongreen spells your opponents control or abilities from nongreen sources your opponents control.\nDuring your turn, Thrun has indestructible." };
const GAEAS_REVENGE = { id: "c-gr", name: "Gaea's Revenge", type: "Creature — Elemental", mana: "{5}{G}{G}", cmc: 7, power: 8, toughness: 5, keywords: ["Haste"], colors: ["G"],
  oracle: "This spell can't be countered.\nHaste\nThis creature can't be the target of nongreen spells or abilities from nongreen sources." };
const MURDER = { id: "h-murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", mana_cost: "{1}{B}{B}", cmc: 3, keywords: [], colors: ["B"], oracle: "Destroy target creature." };
const BEAST_WITHIN = { id: "h-bw", name: "Beast Within", type: "Instant", mana: "{2}{G}", mana_cost: "{2}{G}", cmc: 3, keywords: [], colors: ["G"], oracle: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token." };

function board({ aiHand = [], userHand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: userHand, battlefield: [createPermanent({ id: "thrun", card: THRUN, controller: "user", summoningSick: false }), createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], colors: ["G"], oracle: "" }, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 3, R: 0, G: 3, C: 0 } },
      ai: { ...s0.players.ai, hand: aiHand, battlefield: [], manaPool: { W: 0, U: 0, B: 3, R: 0, G: 3, C: 0 } } } };
}
const castTargets = (s, who, cardId) => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId).map((a) => a.targets?.[0]?.id).sort();

describe("the parse + the tiers", () => {
  it("⭐ Thrun and Gaea's Revenge are native; the shield op reads off the board with its scope", () => {
    expect(classifyCard(THRUN)).toMatch(/^native/);
    expect(classifyCard(GAEAS_REVENGE)).toMatch(/^native/);
    const s = board();
    expect(permanentTargetShields(s, "thrun")).toEqual([{ notColor: "G", opponentsOnly: true }]);
    expect(permanentTargetShields(s, "bear")).toEqual([]);
  });
  it("⛔ a one-sided or mismatched print is a different card and parks", () => {
    expect(classifyCard({ ...THRUN, oracle: "Trample\nThrun can't be the target of nongreen spells your opponents control." })).not.toMatch(/^native/);
    expect(classifyCard({ ...THRUN, oracle: "Trample\nThrun can't be the target of nongreen spells your opponents control or abilities from nonblack sources your opponents control." })).not.toMatch(/^native/);
    // the SCOPE must agree on both halves too — opponents-only spells but everyone's abilities is not a print we model
    expect(classifyCard({ ...THRUN, oracle: "Trample\nThrun can't be the target of nongreen spells your opponents control or abilities from nongreen sources." })).not.toMatch(/^native/);
  });
});

describe("the seam — who may target Thrun", () => {
  it("⭐ the opponent's black Murder is offered on the Bear but NOT on Thrun; their green Beast Within reaches him", () => {
    const s = board({ aiHand: [MURDER, BEAST_WITHIN] });
    expect(castTargets(s, "ai", "h-murder")).toEqual(["bear"]);
    expect(castTargets(s, "ai", "h-bw")).toContain("thrun");
  });
  it("⭐ Thrun's OWN controller may target him with a black spell (opponents-only); Gaea's Revenge refuses even its controller", () => {
    const s = { ...board({ userHand: [MURDER] }), activePlayer: "user", priorityHolder: "user" };
    expect(castTargets(s, "user", "h-murder")).toEqual(["bear", "thrun"]);
    const perm = createPermanent({ id: "gr", card: GAEAS_REVENGE, controller: "user" });
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, perm] } } };
    expect(canBeTargetedBy(s2, perm, "user", "user", ["B"])).toBe(false);
    expect(canBeTargetedBy(s2, perm, "user", "user", ["G"])).toBe(true);
  });
  it("a colourless source and an untracked path are both refused for an opponent; green passes", () => {
    const s = board();
    const thrun = s.players.user.battlefield[0];
    expect(canBeTargetedBy(s, thrun, "user", "ai", [])).toBe(false);
    expect(canBeTargetedBy(s, thrun, "user", "ai", ["G", "B"])).toBe(true);
    expect(canBeTargetedBy(s, thrun, "user", "user", [])).toBe(true);
    expect(enumerateTargets(s, "ai", { targetType: "creature" }, ["B"]).map((t) => t.id)).toEqual(["bear"]);
  });
});
