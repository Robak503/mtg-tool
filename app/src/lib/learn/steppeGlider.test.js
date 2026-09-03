/**
 * steppeGlider.test.js — ④-AD (2026-09-03 night): the TWO-KEYWORD grant with the counter-bearing qualifier — Steppe
 * Glider "{1}{W}: Target creature with a +1/+1 counter on it gains flying and vigilance until end of turn", Ollenbock
 * Escort "Sacrifice this creature: Target creature you control with a +1/+1 counter on it gains lifelink and
 * indestructible until end of turn". ④-AC's peel lives in parseClauseToAtom, but splitClauses shattered these
 * sentences on " and " before any clause parser saw them: its keep-whole guard for "target creature … gains … until end
 * of turn" did not admit the qualifier. Now it does, with the peel's exact vocabulary. Real oracle fixtures (bundled
 * Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GLIDER = { id: "c-sg", name: "Steppe Glider", type: "Creature — Elemental", mana: "{4}{W}", cmc: 5, power: 2, toughness: 2, keywords: ["Flying", "Vigilance"],
  oracle: "Flying, vigilance\n{1}{W}: Target creature with a +1/+1 counter on it gains flying and vigilance until end of turn." };
const ESCORT = { id: "c-oe", name: "Ollenbock Escort", type: "Creature — Human Cleric", mana: "{1}{W}", cmc: 2, power: 1, toughness: 1, keywords: ["Vigilance"],
  oracle: "Vigilance\nSacrifice this creature: Target creature you control with a +1/+1 counter on it gains lifelink and indestructible until end of turn." };

const bear = (id, name, controller, counters = {}) => ({
  ...createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false }),
  counters,
});

describe("the split and the parse", () => {
  it("⭐ the sentence stays WHOLE through splitClauses and parses to one pump carrying both keywords and the restriction", () => {
    const line = "Target creature with a +1/+1 counter on it gains flying and vigilance until end of turn.";
    expect(splitClauses(line)).toHaveLength(1);
    const prog = parseEffectClause(line, "Instant");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0]).toMatchObject({ op: "pump", targetType: "creature", grantKeywords: ["Flying", "Vigilance"], restrictions: [{ kind: "hasCounter", counterType: "+1/+1" }] });
    // ⛔ a counter type the runtime never places shatters as before (the peel would refuse it anyway) → parked.
    expect(splitClauses("Target creature with a time counter on it gains flying and vigilance until end of turn.").length).toBeGreaterThan(1);
    expect(classifyCard({ ...GLIDER, id: "c-x", name: "Time Glider", oracle: GLIDER.oracle.replace("+1/+1", "time") })).not.toMatch(/^native/);
  });

  it("the tiers", () => {
    expect(classifyCard(GLIDER)).toBe("native-activated");
    expect(classifyCard(ESCORT)).toBe("native-activated");
  });
});

describe("runtime — Steppe Glider", () => {
  it("⭐ only the countered bear is offered; resolving grants BOTH keywords to it", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const glider = createPermanent({ id: "glider", card: GLIDER, controller: "user", summoningSick: false });
    const s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [glider, bear("b-yes", "Marked Bear", "user", { "+1/+1": 1 }), bear("b-no", "Bare Bear", "user")], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } },
        ai: { ...s0.players.ai, battlefield: [bear("b-ai", "Their Bare Bear", "ai")] } } };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "glider");
    expect(acts.map((a) => a.targets?.[0]?.id)).toEqual(["b-yes"]);
    expect(permanentHasKeyword(s, "b-yes", "flying")).toBe(false);
    const resolved = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(permanentHasKeyword(resolved, "b-yes", "flying")).toBe(true);
    expect(permanentHasKeyword(resolved, "b-yes", "vigilance")).toBe(true);
    expect(permanentHasKeyword(resolved, "b-no", "flying")).toBe(false);
  });
});
