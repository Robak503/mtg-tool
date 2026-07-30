/**
 * Mass effects (board wipes) — "destroy / exile all creatures" and "all creatures get -X/-X
 * until end of turn", modeled via the existing `eachCreature` scope on the destroy / exile /
 * pump atoms (no chosen target). Covers: the parser (anchored to UNFILTERED "all creatures";
 * the vacuous "can't be regenerated" rider stripped), simultaneous resolution across both
 * battlefields, the lethal SBA for a mass -X/-X, native-spell coverage, and the AI holding
 * symmetric wipes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectProgram, programConfidence, programContainsMassRemoval } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const WRATH = { id: "c-wrath", name: "Wrath of God", type: SORCERY, mana: "{4}", oracle: "Destroy all creatures. They can't be regenerated." };
const DAY = { id: "c-day", name: "Day of Judgment", type: SORCERY, mana: "{4}", oracle: "Destroy all creatures." };
const EXILE_ALL = { id: "c-exile", name: "Cleansing", type: SORCERY, mana: "{4}", oracle: "Exile all creatures." };
const INFEST = { id: "c-infest", name: "Infest", type: SORCERY, mana: "{2}", oracle: "All creatures get -2/-2 until end of turn." };
const creature = (name, p, t) => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle: "" });

function boardState({ user = [], ai = [], hand = [], pool = { C: 6 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

const castWipe = (s, cardId) => {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === cardId);
  expect(cast).toBeTruthy();
  expect(cast.needsTargets).toBeFalsy(); // a mass wipe takes no chosen target
  return resolveTopOfStack(dispatchAction(s, cast));
};

describe("parser — mass effects are HIGH, filtered wipes route to Arbiter", () => {
  it("UNFILTERED destroy/exile/-X-X parse high; the regen rider is stripped", () => {
    for (const c of [WRATH, DAY, EXILE_ALL, INFEST]) {
      expect(programConfidence(parseEffectProgram(c))).toBe("high");
    }
    expect(parseEffectProgram(DAY).atoms).toEqual([{ op: "destroy", targetType: "eachCreature" }]);
    expect(parseEffectProgram(EXILE_ALL).atoms).toEqual([{ op: "exile", targetType: "eachCreature" }]);
    expect(parseEffectProgram(INFEST).atoms).toEqual([{ op: "pump", targetType: "eachCreature", ptDelta: { p: -2, t: -2 } }]);
  });
  it("a CREATURE wipe with a MODELED filter now parses (2026-07-30); a NON-CREATURE filtered wipe still parks", () => {
    // ⭐ THIS PIN'S OWN PARENTHESIS WAS THE CRITERION: "the unfiltered eachX scope would hit the wrong set".
    // That was exactly right, and it is why the fix had to be a real one rather than a strip — the scope is
    // FILTERED now. massCreatureTargets reads the same 16-kind restriction grammar the damage side has always
    // used (the satisfier was extracted to a leaf so this path could reach it), so the resolved set is the
    // printed set. 19 cards graduated, incl. Plague Wind, Cleanse, Perish, Whirlwind, Sunblast Angel.
    const high = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle })), oracle).toBe("high");
    high("Destroy all creatures with flying.");
    high("Destroy all nonblack creatures.");
    high("Exile all creatures you don't control.");
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle })), oracle).toBe("low");
    // ⛔ THE BOUNDARY, RE-POINTED — the delegation is CREATURE-only. A filtered ARTIFACT/LAND wipe has no
    // equivalent grammar behind it (eachArtifact ≠ this subset), so those still park, exactly as the original
    // parenthesis demanded. That half of the pin is untouched.
    // MASS-NC: the UNFILTERED non-creature wipes ("Destroy all artifacts/enchantments/lands") are now
    // modeled (high) — but a FILTERED non-creature wipe still drops to low (eachArtifact ≠ this subset).
    low("Destroy all nonbasic lands.");
    low("Destroy all artifacts you control.");
    low("All creatures get -1/-1 until end of turn and can't block.");
  });
});

describe("coverage — clean wipes are native-spell", () => {
  it("unfiltered board wipes classify native-spell; filtered → arbiter-spell", () => {
    expect(classifyCard(WRATH)).toBe("native-spell");
    expect(classifyCard(EXILE_ALL)).toBe("native-spell");
    expect(classifyCard(INFEST)).toBe("native-spell");
    // ⭐ GRADUATED with its parser sibling above — a modeled creature filter now resolves the printed set.
    expect(classifyCard({ type: SORCERY, oracle: "Destroy all creatures with flying.", name: "X" })).toBe("native-spell");
    // ⛔ and the boundary that still holds: a filtered NON-creature wipe.
    expect(classifyCard({ type: SORCERY, oracle: "Destroy all artifacts you control.", name: "Y" })).toBe("arbiter-spell");
  });
});

describe("resolution — wipes hit every creature on every battlefield", () => {
  it("Destroy all creatures clears both battlefields and fills graveyards", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Ours", 2, 2), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs", 5, 5), controller: "ai", summoningSick: false }),
           createPermanent({ id: "a2", card: creature("Other", 1, 1), controller: "ai", summoningSick: false })],
      hand: [WRATH],
    });
    s = castWipe(s, "c-wrath");
    expect(s.players.user.battlefield.filter(p => /Creature/.test(p.card?.type || "")).length).toBe(0);
    expect(s.players.ai.battlefield.filter(p => /Creature/.test(p.card?.type || "")).length).toBe(0);
    expect(s.players.user.graveyard.some(c => c.name === "Ours")).toBe(true);
    expect(s.players.ai.graveyard.map(c => c.name).sort()).toEqual(["Other", "Theirs"]);
  });
  it("Exile all creatures sends every creature to exile, not the graveyard", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("A", 2, 2), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("B", 3, 3), controller: "ai", summoningSick: false })],
      hand: [EXILE_ALL],
    });
    s = castWipe(s, "c-exile");
    expect(s.players.user.battlefield.length + s.players.ai.battlefield.length).toBe(0);
    // Creatures exiled, none died — the only graveyard card is the resolved wipe itself (CR 608.2m).
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Cleansing"]);
    expect(s.players.ai.graveyard).toHaveLength(0);
    expect(s.players.user.exile.some(c => c.name === "A")).toBe(true);
    expect(s.players.ai.exile.some(c => c.name === "B")).toBe(true);
  });
  it("All creatures get -2/-2: lethal creatures die, survivors keep the debuff", () => {
    let s = boardState({
      user: [createPermanent({ id: "small", card: creature("Small", 2, 2), controller: "user", summoningSick: false }),
             createPermanent({ id: "big", card: creature("Big", 4, 4), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "mid", card: creature("Mid", 3, 2), controller: "ai", summoningSick: false })],
      hand: [INFEST],
    });
    s = castWipe(s, "c-infest");
    // 2/2 -> 0/0 dies; 3/2 -> 1/0 dies; 4/4 -> 2/2 survives.
    expect(findPermanent(s, "small")).toBeNull();
    expect(findPermanent(s, "mid")).toBeNull();
    expect(findPermanent(s, "big")).toBeTruthy();
    expect(permanentPower(s, "big")).toBe(2);
    expect(permanentToughness(s, "big")).toBe(2);
  });
  it("a wipe on an empty board is a clean no-op (no throw)", () => {
    let s = boardState({ hand: [DAY] });
    s = castWipe(s, "c-day");
    expect(s.players.user.battlefield.length + s.players.ai.battlefield.length).toBe(0);
  });
});

describe("AI — holds symmetric board wipes (deferred seam)", () => {
  it("programContainsMassRemoval flags destroy/exile/-X-X all; the AI passes on a wipe", () => {
    expect(programContainsMassRemoval(parseEffectProgram(WRATH))).toBe(true);
    expect(programContainsMassRemoval(parseEffectProgram(EXILE_ALL))).toBe(true);
    expect(programContainsMassRemoval(parseEffectProgram(INFEST))).toBe(true);
    expect(programContainsMassRemoval(parseEffectProgram({ type: SORCERY, oracle: "Draw a card." }))).toBe(false);
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...base.players, ai: { ...base.players.ai, hand: [WRATH], manaPool: { C: 6 } } },
    };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell").toBe(false);
  });
});
