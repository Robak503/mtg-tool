/**
 * Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "Destroy target
 * permanent"). New destroy/exile targetTypes (artifact / enchantment / land / permanent / nonland
 * permanent / artifact-or-enchantment) + the SAME 3 controller restrictions the creature path models.
 *
 * Two safety invariants under test:
 *  - The CAST path works (the player/AI choose the target → correct removal).
 *  - The TRIGGER flush does NOT route it (programContainsChosenPermanentRemoval): the first-legal
 *    chooser could destroy the controller's OWN permanent, so a removal trigger → Arbiter no-op.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets, applyDestroyEffect } from "./spellEffects.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence, programContainsChosenPermanentRemoval } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const perm = (id, name, type, controller) => createPermanent({ id, card: { id, name, type }, controller });
const board = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [perm("ua", "MyArt", "Artifact", "user"), perm("uc", "MyBear", "Creature — Bear", "user")] },
      ai: { ...s.players.ai, battlefield: [perm("aa", "FoeArt", "Artifact", "ai"), perm("ae", "FoeEnch", "Enchantment", "ai"), perm("al", "FoeLand", "Land — Forest", "ai")] },
    },
  };
};
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("parser — targeted non-creature permanent removal", () => {
  it("recognizes each type + the controller restriction; creature stays on its own path", () => {
    expect(parseEffectProgram(I("Destroy target artifact.")).atoms).toEqual([{ op: "destroy", targetType: "artifact", restrictions: [] }]);
    expect(parseEffectProgram(I("Exile target permanent.")).atoms).toEqual([{ op: "exile", targetType: "permanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target land an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "land", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    expect(parseEffectProgram(I("Destroy target enchantment you control.")).atoms)
      .toEqual([{ op: "destroy", targetType: "enchantment", restrictions: [{ kind: "controller", who: "you" }] }]);
    expect(parseEffectProgram(I("Destroy target creature.")).atoms).toEqual([{ op: "destroy", targetType: "creature" }]); // unchanged
  });
  it("a rider or a multi-type / qualified shape drops the whole program to low (no partial)", () => {
    expect(programConfidence(parseEffectProgram(I("Destroy target permanent. Its controller creates a 3/3 green Beast creature token.")))).toBe("low"); // Beast Within
    expect(programConfidence(parseEffectProgram(I("Destroy target artifact, creature, enchantment, or land.")))).toBe("low"); // Vindicate-style list
    expect(programConfidence(parseEffectProgram(I("Destroy target nonbasic land.")))).toBe("low"); // unmodeled qualifier
  });
});

describe("enumeration — type filter + controller restriction (front-face type, all battlefields)", () => {
  it("offers every permanent of the type across battlefields; restriction narrows to the right controller", () => {
    const s = board();
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifact", restrictions: [] }).map((t) => t.id).sort()).toEqual(["aa", "ua"]);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifact", restrictions: [{ kind: "controller", who: "opponent" }] }).map((t) => t.id)).toEqual(["aa"]);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "permanent", restrictions: [] })).toHaveLength(5);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "nonlandPermanent", restrictions: [] }).map((t) => t.id)).not.toContain("al");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifactOrEnchantment", restrictions: [] }).map((t) => t.id).sort()).toEqual(["aa", "ae", "ua"]);
  });
  it("a double-faced permanent is NOT offered (its current face isn't tracked → safe omission)", () => {
    // Akoum Warrior // Akoum Teeth on its land back face: combined type "Creature — … // Land". The
    // engine has no face state, so we must not guess — never offer it (rather than mis-target it).
    const s = { ...board() };
    s.players.ai = { ...s.players.ai, battlefield: [...s.players.ai.battlefield, perm("adfc", "Akoum Warrior", "Creature — Minotaur Warrior // Land", "ai")] };
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "nonlandPermanent", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "land", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "permanent", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
  });
});

describe("resolution — destroy / exile move the chosen permanent; only creatures 'die'", () => {
  it("destroying a non-creature permanent sends it to its owner's graveyard (no dies look-back needed)", () => {
    const s = applyDestroyEffect(board(), { controller: "user", targets: [{ type: "permanent", id: "aa" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["ae", "al"]);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["aa"]);
  });
  it("'destroy target permanent' on a CREATURE still routes the creature through the dies path", () => {
    const s = applyDestroyEffect(board(), { controller: "user", targets: [{ type: "permanent", id: "uc" }] });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["ua"]);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["uc"]);
  });
  it("exile moves the permanent to exile, not the graveyard", () => {
    const s = ATOM_RESOLVERS.exile(board(), { op: "exile", targetType: "enchantment" }, { controller: "user", targets: [{ type: "permanent", id: "ae" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["aa", "al"]);
    expect((s.players.ai.exile || []).map((c) => c.id)).toEqual(["ae"]);
  });
});

describe("trigger gate — a removal trigger routes to the Arbiter (never first-legal self-destruct)", () => {
  it("is flagged as a chosen-target permanent removal", () => {
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(I("Destroy target artifact.")))).toBe(true);
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(I("Destroy target creature.")))).toBe(false); // creature path unaffected
  });
  it("an ETB 'destroy target artifact' creature is body-only (gated), and fires nothing natively", () => {
    const C = (oracle) => ({ type: "Creature — Construct", name: "Disenchanter", oracle });
    expect(classifyCard(C("When this creature enters, destroy target artifact."))).toBe("body-only");
    // even restricted to an opponent — conservative until an enemy-aware flush chooser exists
    expect(classifyCard(C("When this creature enters, destroy target artifact an opponent controls."))).toBe("body-only");
    // a creature-destroy ETB is unchanged (still native)
    expect(classifyCard(C("When this creature enters, destroy target creature."))).toBe("native-trigger");

    let s = board();
    s = enterPermanent(s, { name: "Disenchanter", type: "Creature — Construct", power: 1, toughness: 1, oracle: "When this creature enters, destroy target artifact." }, "user");
    s = resolveAll(flushTriggers(s));
    expect(s.players.ai.battlefield.some((p) => p.id === "aa")).toBe(true); // FoeArt survives — trigger went to Arbiter
    expect(s.players.user.battlefield.some((p) => p.id === "ua")).toBe(true); // and did NOT destroy the controller's own
  });
});
