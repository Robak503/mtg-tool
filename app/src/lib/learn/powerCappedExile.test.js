/**
 * powerCappedExile.test.js — BLITZ PX-1: POWER-FILTERED exile ("Exile target creature with power N or
 * (less|greater)" — ≤: Reaver Ambush / Grotesque Demise / Complete Disregard (all N=3); ≥: Abzan Charm's
 * mode / The Wanderer's −2. Corpus-probed 2026-07-16). The power rides as the SAME { kind:"power" } target
 * restriction the DESTROY twin already enforces natively (Defeat / Swat / Smite the Monstrous), evaluated
 * LAYER-AWARE at enumeration via creatureSatisfiesRestrictions → creaturePower — a creature pumped above
 * the cap is NOT a legal ≤N target even if printed lower (CR 601.2c cast-time legality). Incumbent
 * discipline: restrictions gate ENUMERATION; resolution re-checks target existence (CR 608.2b) but does not
 * re-validate the restriction (exactly like the destroy twin / MV-filtered removal).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REAVER_AMBUSH = { id: "c-ra", name: "Reaver Ambush", type: "Instant", mana: "{2}{B}", oracle: "Exile target creature with power 3 or less." };
const GROTESQUE_DEMISE = { id: "c-gd", name: "Grotesque Demise", type: "Instant", mana: "{2}{B}", oracle: "Exile target creature with power 3 or less." };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}
const bear = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });

describe("PX-1 parser — both power directions parse for exile; near-misses stay LOW", () => {
  it("'power 3 or less' / 'power 4 or greater' → exile atoms with the power restriction", () => {
    expect(parseEffectProgram(REAVER_AMBUSH).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 3 }] },
    ]);
    expect(parseEffectProgram({ type: "Instant", oracle: "Exile target creature with power 4 or greater." }).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "power", op: ">=", value: 4 }] },
    ]);
  });
  it("FN guards: an X-power form / controller scope / toughness variant stays LOW", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Instant", oracle }))).toBe("low");
    low("Exile target creature with power X or less.");                     // Killing Glare shape (X-power)
    low("Exile target creature with power 3 or less an opponent controls.");// unevidenced scope rider
    low("Exile target creature with toughness 3 or less.");                 // toughness variant (unevidenced for exile)
  });
  it("classify: Reaver Ambush + Grotesque Demise flip native-spell; the DESTROY twin stays native (regression)", () => {
    expect(classifyCard(REAVER_AMBUSH)).toBe("native-spell");
    expect(classifyCard(GROTESQUE_DEMISE)).toBe("native-spell");
    expect(classifyCard({ name: "Defeat", type: "Sorcery", mana: "{1}{B}", oracle: "Destroy target creature with power 2 or less." })).toBe("native-spell");
  });
  it("park LIFTED (BLITZ DV-1): Complete Disregard flips native-spell — parseEffectProgram now strips the Devoid keyword line", () => {
    // Previously pinned as arbiter-spell because the leading "Devoid (…)" line dragged this HIGH exile body to
    // LOW. DV-1 strips that resolution-invariant CDA keyword line (stripDevoidLine) so the power-filtered exile
    // body parses on its own — the metric + runtime agree on the devoid-free body. See devoidPolicy.test.js.
    expect(classifyCard({ name: "Complete Disregard", type: "Instant", mana: "{2}{B}",
      oracle: "Devoid (This card has no color.)\nExile target creature with power 3 or less." })).toBe("native-spell");
  });
});

describe("PX-1 enumeration — the power cap is LAYER-AWARE (CR 601.2c cast-time legality)", () => {
  it("a printed 2-power is legal for ≤3; the SAME creature pumped to 4 via +1/+1 counters is NOT", () => {
    let s = mainState();
    const plain = bear("p-plain", "Plain Bear");
    const pumped = { ...bear("p-pump", "Pumped Bear"), counters: { "+1/+1": 2 } }; // 2/2 + two counters → 4/4
    s = withPlayerBits(s, "ai", { battlefield: [plain, pumped] });
    const atom = parseEffectProgram(REAVER_AMBUSH).atoms[0];
    expect(enumerateTargets(s, "user", atom).map((t) => t.id)).toEqual(["p-plain"]); // the 4-power is never offered
  });
  it("the ≥ direction mirrors: only the counter-pumped 4-power qualifies for 'power 4 or greater'", () => {
    let s = mainState();
    const plain = bear("p-plain", "Plain Bear");
    const pumped = { ...bear("p-pump", "Pumped Bear"), counters: { "+1/+1": 2 } };
    s = withPlayerBits(s, "ai", { battlefield: [plain, pumped] });
    const atom = parseEffectProgram({ type: "Instant", oracle: "Exile target creature with power 4 or greater." }).atoms[0];
    expect(enumerateTargets(s, "user", atom).map((t) => t.id)).toEqual(["p-pump"]);
  });
});

describe("PX-1 runtime — the capped exile removes the creature to EXILE (not the graveyard)", () => {
  it("Reaver Ambush exiles the 2-power bear", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [REAVER_AMBUSH], manaPool: { ...s.players.user.manaPool, C: 2, B: 1 } });
    s = withPlayerBits(s, "ai", { battlefield: [bear("p-plain", "Plain Bear")] });
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-ra" && a.targets?.[0]?.id === "p-plain");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.battlefield.some((p) => p.id === "p-plain")).toBe(false);
    expect(s.players.ai.exile.some((c) => c.name === "Plain Bear")).toBe(true);     // exile, not dies
    expect(s.players.ai.graveyard.some((c) => c.name === "Plain Bear")).toBe(false);
  });
});
