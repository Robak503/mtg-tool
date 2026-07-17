/**
 * afterlife.test.js — AFTERLIFE (BLITZ AF-2, CR 702.135): the keyword→trigger synthesis, end to end.
 * "Afterlife N (When this creature dies, create N 1/1 white and black Spirit creature tokens with flying.)"
 * — synthesized in detectTriggers off the printed keyword (the UNDYING/PERSIST reminder-parens precedent):
 * a self-dies descriptor whose effectClause is the reminder's own create-token wording (digit form for N>1
 * so ANY printed N parses HIGH and routes). Structural afterlifeKeywordValues so a GRANT never self-
 * synthesizes. Fired by the normal dies flush; the N tokens enter under the DEAD creature's controller
 * (CR 702.135a). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { detectTriggers, checkDiesTriggers, afterlifeKeywordValues } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall).
const MINISTRANT = { id: "min-card", name: "Ministrant of Obligation", type: "Creature — Human Cleric", power: "2", toughness: "1", mana: "{2}{W}",
  oracle: "Afterlife 2 (When this creature dies, create two 1/1 white and black Spirit creature tokens with flying.)" };
const ORZHOV_ENFORCER = { id: "oe-card", name: "Orzhov Enforcer", type: "Creature — Human Rogue", power: "1", toughness: "1", mana: "{1}{B}",
  oracle: "Deathtouch\nAfterlife 1 (When this creature dies, create a 1/1 white and black Spirit creature token with flying.)" };
const KNIGHT_LAST_BREATH = { id: "klb-card", name: "Knight of the Last Breath", type: "Creature — Giant Knight", power: "3", toughness: "3", mana: "{5}{W}{B}",
  oracle: "{3}, Sacrifice another nontoken creature: Create a 1/1 white and black Spirit creature token with flying.\nAfterlife 3 (When this creature dies, create three 1/1 white and black Spirit creature tokens with flying.)" };
// GRANT (must NOT self-synthesize): the afterlife lives on OTHER creatures / an aura line, not the keyword.
const AFTERLIFE_INSURANCE = { id: "ai-card", name: "Afterlife Insurance", type: "Instant", mana: "{2}{W}",
  oracle: "Creatures you control gain afterlife 1 until end of turn. Draw a card. (When a creature with afterlife 1 dies, create a 1/1 white and black Spirit creature token with flying.)" };
const INDEBTED_SPIRIT = { id: "is-card", name: "Indebted Spirit", type: "Enchantment Creature — Spirit", power: "2", toughness: "2", mana: "{2}{W}",
  oracle: "Bestow {2}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nAfterlife 1 (When this permanent is put into a graveyard from the battlefield, create a 1/1 white and black Spirit creature token with flying.)\nEnchanted creature gets +1/+1 and has afterlife 1." };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const withBattlefield = (state, pid, perms) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } });
const markLethal = (state, pid, permId) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid],
  battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } });
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
const spiritTokens = (state, pid) => state.players[pid].battlefield.filter((p) => p.card?.token && /Spirit/.test(p.card?.type || ""));

describe("AFTERLIFE — structural counter (grants never self-synthesize)", () => {
  it("the printed keyword counts per instance; a grant / mid-sentence use never does", () => {
    expect(afterlifeKeywordValues(MINISTRANT.oracle)).toEqual([2]);
    expect(afterlifeKeywordValues(ORZHOV_ENFORCER.oracle)).toEqual([1]);
    expect(afterlifeKeywordValues(KNIGHT_LAST_BREATH.oracle)).toEqual([3]);
    // GRANT — "gain afterlife 1 until end of turn" (whole segment ≠ "afterlife 1") never counts.
    expect(afterlifeKeywordValues(AFTERLIFE_INSURANCE.oracle)).toEqual([]);
    // GRANT on an aura line — "…and has afterlife 1" never counts; only the keyword line does (→ [1]).
    expect(afterlifeKeywordValues(INDEBTED_SPIRIT.oracle)).toEqual([1]);
    // Bare word without a value is not the keyword.
    expect(afterlifeKeywordValues("Afterlife is inevitable.")).toEqual([]);
  });
});

describe("AFTERLIFE — synthesis + routing + classify", () => {
  it("Afterlife N synthesizes ONE dies descriptor creating N tokens; the clause parses HIGH + routes", () => {
    const [d] = detectTriggers(MINISTRANT).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self", whose: "any", optional: false, sourceText: "Afterlife 2" });
    expect(d.effectClause).toBe("create 2 1/1 white and black Spirit creature tokens with flying");
    expect(triggerRoutesNatively(d)).toBe(true);
    const p = parseEffectClause(d.effectClause, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toMatchObject([{ op: "create-token", count: 2, power: 1, toughness: 1, keywords: ["Flying"] }]);
  });
  it("Afterlife 1 uses the 'a … token' singular form and routes", () => {
    const [d] = detectTriggers(ORZHOV_ENFORCER).filter((t) => t.event === "dies");
    expect(d.effectClause).toBe("create a 1/1 white and black Spirit creature token with flying");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("classify: pure/simple afterlife carriers flip native; a grant SPELL never flips", () => {
    expect(classifyCard(MINISTRANT).startsWith("native")).toBe(true);       // pure Afterlife 2
    expect(classifyCard(ORZHOV_ENFORCER).startsWith("native")).toBe(true);  // Deathtouch + Afterlife 1
    // FN guards — unmodeled sibling clauses keep the WHOLE card off native (all-or-nothing).
    expect(classifyCard(AFTERLIFE_INSURANCE)).not.toMatch(/^native/);       // grant + draw (a spell)
    expect(classifyCard(KNIGHT_LAST_BREATH)).not.toMatch(/^native/);        // sac-activated body unmodeled
    expect(classifyCard(INDEBTED_SPIRIT)).not.toMatch(/^native/);           // bestow + enchanted-creature buff line
  });
});

describe("AFTERLIFE — runtime (CREED core): the death mints exactly N tokens under the controller", () => {
  it("Afterlife 2 dies → exactly two 1/1 white-and-black Spirit tokens with flying enter under the controller", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "min", card: MINISTRANT, controller: "user", summoningSick: false })]);
    s = markLethal(s, "user", "min");
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    const toks = spiritTokens(s, "user");
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(permanentPower(s, t.id)).toBe(1);
      expect(permanentToughness(s, t.id)).toBe(1);
      expect(permanentHasKeyword(s, t.id, "Flying")).toBe(true);
    }
    // the dead creature is in the graveyard, not on the battlefield.
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Ministrant of Obligation")).toBe(false);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Ministrant of Obligation");
  });
  it("Afterlife 1 dies → exactly one Spirit token", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "oe", card: ORZHOV_ENFORCER, controller: "user", summoningSick: false })]);
    s = markLethal(s, "user", "oe");
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(spiritTokens(s, "user")).toHaveLength(1);
  });
  it("the tokens enter under the DYING creature's controller, not the active player (CR 702.135a)", () => {
    // Kill an OPPONENT's afterlife creature on the user's turn → the tokens are the OPPONENT's.
    let s = baseState();
    s = withBattlefield(s, "ai1", [createPermanent({ id: "min2", card: { ...MINISTRANT, id: "min2-card" }, controller: "ai1", summoningSick: false })]);
    s = markLethal(s, "ai1", "min2");
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(spiritTokens(s, "ai1")).toHaveLength(2);
    expect(spiritTokens(s, "user")).toHaveLength(0);
  });
});
