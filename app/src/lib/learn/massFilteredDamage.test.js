/**
 * massFilteredDamage.test.js — MASS-FILTERED-DAMAGE: "<source> deals N damage to each creature with|without
 * flying" (Gale Force / Needle Storm / Squall = with; Seismic Shudder / Tremor = without; Corrosive Gale /
 * Windstorm = X). Reuses the eachCreature deal-damage path + a {kind:"hasKeyword", keyword:"flying"}
 * restriction; applyDamageEffect filters the wiped set via creatureSatisfiesRestrictions (layer-aware).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const dmg = (s, side, id) => (s.players[side].battlefield.find(p => p.id === id)?.damageMarked || 0);

describe("mass-filtered-damage — parser", () => {
  it("'deals N damage to each creature with flying' → eachCreature + hasKeyword flying", () => {
    const p = parseEffectClause("Gale Force deals 5 damage to each creature with flying.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 5, targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }]);
  });
  it("'without flying' → negated", () => {
    const p = parseEffectClause("Tremor deals 1 damage to each creature without flying.", "Sorcery");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }]);
  });
});

describe("mass-filtered-damage — resolver filters the wiped set (layer-aware)", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, ctrl, kws) => createPermanent({ id, card: { id, name: id, type: "Creature — Test", power: 2, toughness: 5, keywords: kws }, controller: ctrl }); // toughness 5 survives 2 dmg → damageMarked readable
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [mk("u-fly", "user", ["flying"]), mk("u-ground", "user", [])] },
      ai: { ...s.players.ai, battlefield: [mk("a-fly", "ai", ["flying"]), mk("a-ground", "ai", [])] } } };
  }
  it("'with flying' marks every flyer (both sides), spares non-flyers", () => {
    const after = resolveAtom(board(), { op: "deal-damage", amount: 2, targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }, { controller: "user" });
    expect(dmg(after, "user", "u-fly")).toBe(2);
    expect(dmg(after, "ai", "a-fly")).toBe(2);
    expect(dmg(after, "user", "u-ground")).toBe(0);
    expect(dmg(after, "ai", "a-ground")).toBe(0);
  });
  it("'without flying' marks every non-flyer, spares flyers (the source-self case: a flying source is spared)", () => {
    const after = resolveAtom(board(), { op: "deal-damage", amount: 2, targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }, { controller: "user" });
    expect(dmg(after, "user", "u-ground")).toBe(2);
    expect(dmg(after, "ai", "a-ground")).toBe(2);
    expect(dmg(after, "user", "u-fly")).toBe(0);   // a flyer (e.g. Thunder Dragon itself) is spared
    expect(dmg(after, "ai", "a-fly")).toBe(0);
  });
});

describe("mass-filtered-damage — controller filter (Blazing Volley / Scouring Sands)", () => {
  it("'each creature your opponents control' → eachCreature + controller:opponent", () => {
    const p = parseEffectClause("Blazing Volley deals 1 damage to each creature your opponents control.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
  it("resolver hits only the opponent's creatures", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, ctrl) => createPermanent({ id, card: { id, name: id, type: "Creature — Test", power: 2, toughness: 5 }, controller: ctrl });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("mine", "user")] }, ai: { ...s.players.ai, battlefield: [mk("theirs", "ai")] } } };
    const after = resolveAtom(s, { op: "deal-damage", amount: 2, targetType: "eachCreature", restrictions: [{ kind: "controller", who: "opponent" }] }, { controller: "user" });
    expect(dmg(after, "ai", "theirs")).toBe(2);  // opponent's creature hit
    expect(dmg(after, "user", "mine")).toBe(0);  // your own creature spared
  });
});

describe("mass-filtered-damage — coverage flips", () => {
  const C = (name, oracle, type = "Instant", mana = "{1}{R}") => ({ name, oracle, type, keywords: [], mana });
  it("bare + X + trigger forms flip native", () => {
    expect(classifyCard(C("Gale Force", "Gale Force deals 5 damage to each creature with flying."))).toBe("native-spell");
    expect(classifyCard(C("Tremor", "Tremor deals 1 damage to each creature without flying.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(C("Corrosive Gale", "Corrosive Gale deals X damage to each creature with flying.", "Sorcery", "{X}{G}"))).toBe("native-spell");
    expect(classifyCard(C("Thunder Dragon", "Flying\nWhen this creature enters, it deals 3 damage to each creature without flying.", "Creature — Dragon", "{3}{R}{R}"))).toBe("native-trigger");
  });
});
