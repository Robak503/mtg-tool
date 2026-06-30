/**
 * DESTROY-DAMAGE-RIDER (v0.76 — destroy+damage-to-controller composition) — "Destroy target X. [If that land
 * was nonbasic, ]<SELF> deals N damage to that X's controller." (Smash to Smithereens, Destructive Revelry,
 * Melt Terrain, Poison the Well, Molten Rain). The damage-dealing twin of RIDER-REMOVAL's "Its controller …"
 * fold: the lead reuses the SHARED removal grammar (so every modeled targetType rides along), and the damage
 * rides on the atom as `damageRider`, applied at resolution to the captured target-controller through the SAME
 * applyDamageEffect every burn spell uses. This pins the parser flips, the runtime (the permanent leaves AND
 * the controller loses life), Molten Rain's nonbasic-only condition (nonbasic land → damage; basic → none),
 * the indestructible case (destroy fails but the damage still resolves, CR), and the CREED FP-guards (an
 * unmodeled condition — snow / "if you control an artifact" — and an unmodeled lead stay LOW → Arbiter).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectProgram, programConfidence } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { resolveAtom } from "../effectAtoms.js";
import { createGameState, _resetIdsForTests, createPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle, type = "Instant") => parseEffectProgram({ type, oracle });
const isHigh = (oracle, type = "Instant") => programConfidence(S(oracle, type)) === "high";
const atomOf = (oracle, type = "Instant") => (S(oracle, type).atoms || [])[0];

const SMASH = "Destroy target artifact. Smash to Smithereens deals 3 damage to that artifact's controller.";
const REVELRY = "Destroy target artifact or enchantment. Destructive Revelry deals 2 damage to that permanent's controller.";
const MELT = "Destroy target land. Melt Terrain deals 2 damage to that land's controller.";
const POISON = "Destroy target land. Poison the Well deals 2 damage to that land's controller.";
const MOLTEN = "Destroy target land. If that land was nonbasic, Molten Rain deals 2 damage to the land's controller.";

describe("DESTROY-DAMAGE-RIDER — parser", () => {
  it("Smash to Smithereens — ONE destroy atom (artifact) carrying { damageRider:{amount:3} }", () => {
    expect(atomOf(SMASH)).toEqual({ op: "destroy", targetType: "artifact", restrictions: [], damageRider: { amount: 3 } });
    expect(isHigh(SMASH)).toBe(true);
  });
  it("Destructive Revelry — artifact-or-enchantment lead + a 2-damage rider", () => {
    expect(atomOf(REVELRY)).toEqual({ op: "destroy", targetType: "artifactOrEnchantment", restrictions: [], damageRider: { amount: 2 } });
    expect(isHigh(REVELRY)).toBe(true);
  });
  it("Melt Terrain / Poison the Well — land lead + a 2-damage rider (both 'that land's controller')", () => {
    expect(atomOf(MELT, "Sorcery")).toEqual({ op: "destroy", targetType: "land", restrictions: [], damageRider: { amount: 2 } });
    expect(atomOf(POISON)).toEqual({ op: "destroy", targetType: "land", restrictions: [], damageRider: { amount: 2 } });
    expect(isHigh(MELT, "Sorcery")).toBe(true);
    expect(isHigh(POISON)).toBe(true);
  });
  it("Molten Rain — the 'If that land was nonbasic,' condition rides as onlyIfNonbasic", () => {
    expect(atomOf(MOLTEN, "Sorcery")).toEqual({ op: "destroy", targetType: "land", restrictions: [], damageRider: { amount: 2, onlyIfNonbasic: true } });
    expect(isHigh(MOLTEN, "Sorcery")).toBe(true);
  });

  it("CREED — an UNMODELED condition on the same shape stays LOW (never fires damage gated on a condition we don't track)", () => {
    // snow-ness is not tracked at resolution → the whole card must stay LOW → Arbiter.
    expect(isHigh("Destroy target land. If that land was a snow land, Icequake deals 1 damage to that land's controller.", "Sorcery")).toBe(false);
    // a board-state condition ("if you control an artifact") is a different, unmodeled gate → LOW.
    expect(isHigh("Destroy target creature. If you control an artifact, Unlicensed Disintegration deals 3 damage to that creature's controller.")).toBe(false);
  });
  it("CREED — an UNMODELED lead (typed-land union / basic-land-type single) stays LOW", () => {
    expect(isHigh("Destroy target Plains or Island. Cryoclasm deals 3 damage to that land's controller.", "Sorcery")).toBe(false);
    expect(isHigh("Destroy target Mountain. Peak Eruption deals 3 damage to that land's controller.", "Sorcery")).toBe(false);
  });
  it("CREED — a creature lead the shared grammar doesn't serve (Consign to the Pit) stays LOW", () => {
    // "destroy target creature" is NOT resolved by the shared rider grammar (it lives in the legacy spell path),
    // so the whole card must stay LOW → Arbiter rather than fire a partial.
    expect(isHigh("Destroy target creature. Consign to the Pit deals 2 damage to that creature's controller.", "Sorcery")).toBe(false);
  });
});

describe("DESTROY-DAMAGE-RIDER — runtime (the permanent leaves AND its controller loses life)", () => {
  function pod(permFactory) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const perm = permFactory();
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [perm], life: 40 }, user: { ...s.players.user, life: 40 } } };
  }
  const artifact = () => createPermanent({ id: "p-art", card: { id: "ai-art", name: "Mox", type: "Artifact", oracle: "" }, controller: "ai" });
  const nonbasic = () => createPermanent({ id: "p-land", card: { id: "ai-land", name: "Volcanic Island", type: "Land — Island Mountain", oracle: "" }, controller: "ai" });
  const basic = () => createPermanent({ id: "p-land", card: { id: "ai-bas", name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "ai" });

  // NOTE: the engine binds EVERY non-creature destroy target as { type:"permanent" } (spellEffects.enumerateTargets
  // → addPermanents), regardless of the targetType filter — so a land/artifact target is type:"permanent" at
  // resolution. The tests pass that real shape (a type:"land"/"artifact" target would be SKIPPED by applyDestroyEffect).
  const permTarget = (id) => ({ type: "permanent", id, controller: "ai" });

  it("Smash to Smithereens — the artifact is destroyed AND its controller takes 3", () => {
    const st = resolveAtom(pod(artifact), atomOf(SMASH), { controller: "user", targets: [permTarget("p-art")], cardName: "Smash to Smithereens" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-art")).toBe(false); // destroyed
    expect(st.players.ai.life).toBe(37);                                          // 40 − 3 to the target's controller
    expect(st.players.user.life).toBe(40);                                        // the caster is untouched
  });

  it("Melt Terrain — the land is destroyed AND its controller takes 2 (unconditional)", () => {
    const st = resolveAtom(pod(nonbasic), atomOf(MELT, "Sorcery"), { controller: "user", targets: [permTarget("p-land")], cardName: "Melt Terrain" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-land")).toBe(false);
    expect(st.players.ai.life).toBe(38);
  });

  it("Molten Rain — a NONBASIC land destroyed → the controller takes 2", () => {
    const st = resolveAtom(pod(nonbasic), atomOf(MOLTEN, "Sorcery"), { controller: "user", targets: [permTarget("p-land")], cardName: "Molten Rain" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-land")).toBe(false);
    expect(st.players.ai.life).toBe(38);
  });

  it("Molten Rain — a BASIC land destroyed → NO damage (the nonbasic condition is false)", () => {
    const st = resolveAtom(pod(basic), atomOf(MOLTEN, "Sorcery"), { controller: "user", targets: [permTarget("p-land")], cardName: "Molten Rain" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-land")).toBe(false); // still destroyed
    expect(st.players.ai.life).toBe(40);                                          // …but NO damage (basic land)
  });

  it("the damage is STILL dealt when the target is INDESTRUCTIBLE (CR — the second sentence resolves even if the destroy fails)", () => {
    const indestructibleArt = () => createPermanent({ id: "p-art", card: { id: "ds", name: "Darksteel Relic", type: "Artifact", oracle: "Indestructible", keywords: ["indestructible"] }, controller: "ai" });
    const st = resolveAtom(pod(indestructibleArt), atomOf(SMASH), { controller: "user", targets: [permTarget("p-art")], cardName: "Smash to Smithereens" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-art")).toBe(true);   // indestructible survived
    expect(st.players.ai.life).toBe(37);                                          // …but the 3 damage still landed
  });
});

describe("DESTROY-DAMAGE-RIDER — coverage", () => {
  const C = (oracle, name, type = "Instant") => ({ type, oracle, mana: "{R}", name });
  it("the five clean cards flip to native-spell", () => {
    expect(classifyCard(C(SMASH, "Smash to Smithereens"))).toBe("native-spell");
    expect(classifyCard(C(REVELRY, "Destructive Revelry"))).toBe("native-spell");
    expect(classifyCard(C(MELT, "Melt Terrain", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(C(POISON, "Poison the Well"))).toBe("native-spell");
    expect(classifyCard(C(MOLTEN, "Molten Rain", "Sorcery"))).toBe("native-spell");
  });
  it("CREED — an unmodeled condition stays Arbiter", () => {
    expect(classifyCard(C("Destroy target land. If that land was a snow land, Icequake deals 1 damage to that land's controller.", "Icequake", "Sorcery"))).toBe("arbiter-spell");
    expect(classifyCard(C("Destroy target creature. If you control an artifact, Unlicensed Disintegration deals 3 damage to that creature's controller.", "Unlicensed Disintegration"))).toBe("arbiter-spell");
  });
});
