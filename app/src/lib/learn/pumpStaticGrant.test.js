/**
 * pumpStaticGrant.test.js — PUMP-STATIC-GRANT: the pump / activated / triggered keyword-grant path now
 * grants the STATIC keywords (indestructible / hexproof / shroud) too, not just combat keywords —
 * parseGrantedKeywords (parseHelpers.js) uses GRANTABLE_STATIC_KEYWORDS. The grant is the same layer-6
 * endOfTurn addKeyword applyPumpEffect already emits, so a granted instance is honored LAYER-AWARE by
 * isIndestructible / canBeTargetedBy exactly like a printed keyword. This flips single-target protection
 * instants (Blossoming Defense, Withstand Death, Adamant Will), activated grants (Sylvan Safekeeper), and
 * triggered grants (Angelheart Protector). An un-enforced keyword (banding) still drops → Arbiter.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, isIndestructible, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── 1. Parser ──────────────────────────────────────────────────────────────────
describe("pump-static-grant — parser", () => {
  it("'target creature gains indestructible until end of turn' → pump-grant atom HIGH", () => {
    const p = parseEffectClause("Target creature gains indestructible until end of turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    // canonicalCombatKeyword leaves a non-combat keyword lowercase (the established engine convention —
    // indestructible.test.js / staticAbilityParser store "indestructible"); enforcement lowercases either way.
    expect(p.atoms).toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["indestructible"] }]);
  });
  it("multi-keyword static+combat grant ('+1/+0 and gains lifelink and indestructible')", () => {
    const p = parseEffectClause("Target creature gets +1/+0 and gains lifelink and indestructible until end of turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].grantKeywords).toEqual(["Lifelink", "indestructible"]);
  });
  it("CREED: an un-enforced keyword (banding) still drops the clause → low", () => {
    expect(programConfidence(parseEffectClause("Target creature gains banding until end of turn.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("Target creature gets +2/+2 and gains protection from red until end of turn.", "Instant"))).toBe("low");
  });
});

// ─── 2. Resolver + layer-aware enforcement ────────────────────────────────────────
describe("pump-static-grant — a granted static keyword is honored layer-aware", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = createPermanent({ id: "mine", card: { id: "mine", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const theirs = createPermanent({ id: "theirs", card: { id: "theirs", name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3 }, controller: "ai" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mine] }, ai: { ...s.players.ai, battlefield: [theirs] } } };
  }
  it("granted indestructible → isIndestructible true (the destroy / lethal-damage SBA consults this)", () => {
    const s = board();
    const after = resolveAtom(s, { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Indestructible"] }, { controller: "user", targets: [{ type: "creature", id: "mine" }] });
    expect(permanentHasKeyword(after, "mine", "Indestructible")).toBe(true);
    expect(isIndestructible(after.players.user.battlefield.find(p => p.id === "mine"), after)).toBe(true);
  });
  it("granted hexproof → opponent can't target, controller can", () => {
    const s = board();
    const after = resolveAtom(s, { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Hexproof"] }, { controller: "user", targets: [{ type: "creature", id: "mine" }] });
    const cre = after.players.user.battlefield.find(p => p.id === "mine");
    expect(canBeTargetedBy(after, cre, "user", "ai")).toBe(false);
    expect(canBeTargetedBy(after, cre, "user", "user")).toBe(true);
  });
  it("granted shroud → untargetable by anyone", () => {
    const s = board();
    const after = resolveAtom(s, { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["Shroud"] }, { controller: "user", targets: [{ type: "creature", id: "mine" }] });
    const cre = after.players.user.battlefield.find(p => p.id === "mine");
    expect(canBeTargetedBy(after, cre, "user", "user")).toBe(false);
  });
});

// ─── 3. Coverage flips ────────────────────────────────────────────────────────────
describe("pump-static-grant — coverage flips", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{G}" });
  it("single-target protection instants flip native-spell", () => {
    expect(classifyCard(C("Withstand Death", "Target creature gains indestructible until end of turn."))).toBe("native-spell");
    expect(classifyCard(C("Blossoming Defense", "Target creature you control gets +2/+2 and gains hexproof until end of turn."))).toBe("native-spell");
    expect(classifyCard(C("Adamant Will", "Target creature gets +2/+2 and gains indestructible until end of turn."))).toBe("native-spell");
  });
  it("activated + triggered static-keyword grants flip native", () => {
    expect(classifyCard(C("Sylvan Safekeeper", "Sacrifice a land: Target creature you control gains shroud until end of turn.", "Creature — Human Wizard"))).toBe("native-activated");
    expect(classifyCard(C("Angelheart Protector", "When this creature enters, target creature you control gains indestructible until end of turn.", "Creature — Angel"))).toBe("native-trigger");
  });
});
