/**
 * massLandSubtype.test.js — MASS-LAND-SUBTYPE: "Destroy all Islands|Swamps|Mountains|Plains|Forests" (Boil,
 * Boiling Seas, Tsunami; Acid Rain = Forests; Flashfires = Plains). Reuses the eachLand destroy with a
 * basic-land-type filter (atomTargets honors atom.landSubtype, matching the type line) → hits every land of
 * that type on every battlefield (basic AND dual), spares other lands.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const alive = (s, side, id) => s.players[side].battlefield.some(p => p.id === id);

describe("mass-land-subtype — parser", () => {
  it("'destroy all islands' → eachLand + landSubtype Island", () => {
    const p = parseEffectClause("Destroy all Islands.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "eachLand", landSubtype: "Island" }]);
  });
  it("CREED: a rider ('For each land destroyed this way…') stays low → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Destroy all Plains. For each land destroyed this way, this deals 1 damage to that player.", "Sorcery"))).toBe("low");
  });
});

describe("mass-land-subtype — resolver hits only that land type (basic + dual), spares others", () => {
  it("'destroy all Islands' destroys a basic Island AND a dual with the Island type; a Mountain/Swamp survive", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type, ctrl) => createPermanent({ id, card: { id, name: id, type }, controller: ctrl });
    const mine = [mk("u-isl", "Basic Land — Island", "user"), mk("u-trop", "Land — Forest Island", "user"), mk("u-mtn", "Basic Land — Mountain", "user")];
    const theirs = [mk("a-isl", "Basic Land — Island", "ai"), mk("a-swamp", "Basic Land — Swamp", "ai")];
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: mine }, ai: { ...s.players.ai, battlefield: theirs } } };
    const after = resolveAtom(s, { op: "destroy", targetType: "eachLand", landSubtype: "Island" }, { controller: "user" });
    expect(alive(after, "user", "u-isl")).toBe(false);   // basic Island destroyed
    expect(alive(after, "user", "u-trop")).toBe(false);  // dual with Island type destroyed
    expect(alive(after, "ai", "a-isl")).toBe(false);     // opponent's Island destroyed (all battlefields)
    expect(alive(after, "user", "u-mtn")).toBe(true);    // Mountain spared
    expect(alive(after, "ai", "a-swamp")).toBe(true);    // Swamp spared
  });
});

describe("mass-land-subtype — coverage flips", () => {
  const C = (name, oracle, type = "Sorcery") => ({ name, oracle, type, keywords: [], mana: "{2}{R}" });
  it("the basic-land wipes flip native-spell", () => {
    expect(classifyCard(C("Boil", "Destroy all Islands."))).toBe("native-spell");
    expect(classifyCard(C("Acid Rain", "Destroy all Forests."))).toBe("native-spell");
    expect(classifyCard(C("Flashfires", "Destroy all Plains."))).toBe("native-spell");
  });
});
