/**
 * veyranCompoundGrants.test.js — two one-clause/two-grant compounds from the Veyran Cantrips shelf
 * push (2026-08-02):
 *
 *   - Crimson Wisps  — "Target creature becomes red and gains haste until end of turn." (+ draw)
 *   - Pym Particles  — "Target creature gains vigilance until end of turn and can't be blocked
 *                       this turn." (+ draw)
 *
 * Both halves of each were modeled alone; the top-level " and " split shattered them (losing the
 * shared duration). splitClauses now FOLDS each to an and-free spelling ("also-gains" /
 * "also-can't") that ONLY the matching compound arm reads — the held-mana fold discipline — and
 * the atom carries `grantKeywords`, applied as a second layer-6 effect on the same target.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence, parseEffectClause } from "./effects/parser.js";
import { permanentHasKeyword, permanentColors } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall, pulled 2026-08-02).
const WISPS = { name: "Crimson Wisps", type: "Instant", mana: "{R}",
  oracle: "Target creature becomes red and gains haste until end of turn. (It can attack and {T} this turn.)\nDraw a card." };
const PYM = { name: "Pym Particles", type: "Sorcery", mana: "{2}{U}",
  oracle: "Target creature gains vigilance until end of turn and can't be blocked this turn.\nDraw a card." };

const bear = (id, controller) => createPermanent({ id, card: { name: "Grizzly Bears", id: "gb" + id, type: "Creature — Bear", power: 2, toughness: 2, colors: ["G"], oracle: "" }, controller });

function setup({ hand, mana, lib = [{ id: "L1", name: "Island", type: "Land", oracle: "" }] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players,
      user: { ...s.players.user, hand, library: lib, battlefield: [], manaPool: { ...s.players.user.manaPool, ...mana } },
      ai: { ...s.players.ai, battlefield: [bear("b1", "ai")] } } };
}
function drain(s) { let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); return s; }

describe("COMPOUND GRANTS — parser + classification", () => {
  it("Crimson Wisps parses HIGH: become-color carrying the haste grant, then the draw", () => {
    const p = parseEffectProgram(WISPS);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "become-color", targetType: "creature", colors: ["R"], grantKeywords: ["Haste"] });
    expect(p.atoms[1]).toMatchObject({ op: "draw", amount: 1 });
    expect(classifyCard(WISPS)).toBe("native-spell");
  });
  it("Pym Particles parses HIGH: cant-be-blocked carrying the vigilance grant, then the draw", () => {
    const p = parseEffectProgram(PYM);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "cant-be-blocked", targetType: "creature", grantKeywords: ["Vigilance"] });
    expect(classifyCard(PYM)).toBe("native-spell");
  });
  it("CREED — the bare forms are unchanged, and an unmodeled keyword in the compound stays LOW", () => {
    expect(parseEffectClause("target creature becomes red until end of turn", "Instant").atoms)
      .toEqual([{ op: "become-color", targetType: "creature", colors: ["R"] }]);
    expect(programConfidence(parseEffectClause("target creature becomes red and gains banding until end of turn", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("target creature becomes red and gains haste", "Instant"))).toBe("low"); // no duration
  });
});

describe("COMPOUND GRANTS — runtime (both grants land on the same target)", () => {
  it("Crimson Wisps: the bear IS red AND has haste after resolution; the caster drew", () => {
    let s = setup({ hand: [{ ...WISPS, id: "w1" }], mana: { R: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "w1");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(permanentColors(s, "b1")).toEqual(["R"]);                  // layer-5 setColor REPLACES green
    expect(permanentHasKeyword(s, "b1", "Haste")).toBe(true);         // the layer-6 grant landed too
    expect(s.players.user.hand.map((c) => c.id)).toContain("L1");     // the rider draw
  });
  it("Pym Particles: the bear has vigilance AND is unblockable; the caster drew", () => {
    let s = setup({ hand: [{ ...PYM, id: "p1" }], mana: { U: 1, C: 2 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "p1");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "b1", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(s, "b1", "unblockable")).toBe(true);
    expect(s.players.user.hand.map((c) => c.id)).toContain("L1");
  });
});
