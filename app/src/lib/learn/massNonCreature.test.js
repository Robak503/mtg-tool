/**
 * MASS-NC — mass non-creature destruction ("destroy all artifacts / enchantments / lands / artifacts and
 * enchantments") + the central non-chosen-targetType refactor (targetTypes.isNonChosenTargetType) that
 * unified the 5 duplicated exclusion lists. That refactor also FIXED a latent bug: SYMBURN's
 * eachCreatureAndPlayer burn spells classified native but were UNCASTABLE — 3 of the 5 lists were missing
 * eachCreatureAndPlayer, so the cast flow treated the mass effect as targeted, found no target, dropped it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programContainsMassRemoval } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { isNonChosenTargetType } from "./targetTypes.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const I = (oracle, type = "Sorcery") => ({ type, oracle, name: "X" });

describe("MASS-NC — classification", () => {
  it("unfiltered non-creature wipes flip native with the right atom", () => {
    const cases = [
      ["Destroy all artifacts.", "eachArtifact"],
      ["Destroy all enchantments.", "eachEnchantment"],
      ["Destroy all lands.", "eachLand"],
      ["Destroy all artifacts and enchantments.", "eachArtifactOrEnchantment"],
    ];
    for (const [oracle, tt] of cases) {
      expect(classifyCard(I(oracle))).toBe("native-spell");
      expect(parseEffectProgram(I(oracle)).atoms).toEqual([{ op: "destroy", targetType: tt }]);
    }
  });
  it("MUST stay arbiter — any FILTER fails the anchor (eachX would wrongly hit the unfiltered set)", () => {
    for (const oracle of [
      "Destroy all nonbasic lands.",
      "Destroy all artifacts you control.",
      "Destroy all enchantments with mana value 3 or less.",
      "Destroy all artifact creatures.", // a typed subset, not the whole class
    ]) expect(classifyCard(I(oracle))).toBe("arbiter-spell");
  });
});

describe("MASS-NC — engine-first: destroys every permanent of that type on EVERY battlefield, spares others", () => {
  it("'destroy all artifacts' removes artifacts on both sides (incl. an artifact creature) but not other permanents", () => {
    const art = (id, ctrl) => createPermanent({ id, card: { id: "c" + id, name: "Rock " + id, type: "Artifact", oracle: "" }, controller: ctrl });
    const myr = createPermanent({ id: "ac", card: { id: "cac", name: "Myr", type: "Artifact Creature — Myr", power: 1, toughness: 1, oracle: "" }, controller: "user" });
    const bear = createPermanent({ id: "be", card: { id: "cbe", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [art("ua", "user"), myr, bear] }, ai: { ...s.players.ai, battlefield: [art("aa", "ai")] } } };

    s = ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "eachArtifact" }, { controller: "user", targets: [] });

    expect(s.players.user.battlefield.map((p) => p.card.name)).toEqual(["Bear"]); // artifact + artifact-creature gone, bear stays
    expect(s.players.ai.battlefield).toHaveLength(0);                              // ai's artifact gone too
    expect(s.players.user.graveyard.some((c) => c.name === "Myr")).toBe(true);    // the artifact CREATURE died to the graveyard
  });

  it("word-anchored types (4b P1): 'destroy all lands' spares an 'Artifact — Lander' token, but 'all artifacts' destroys it", () => {
    const lander = createPermanent({ id: "ld", card: { id: "cld", name: "Lander", type: "Token Artifact — Lander", oracle: "" }, controller: "user" });
    const forest = createPermanent({ id: "fo", card: { id: "cfo", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    let base = createGameState({ userDeck: [], aiDeck: [] });
    base = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [lander, forest] } } };

    const lands = ATOM_RESOLVERS["destroy"](base, { op: "destroy", targetType: "eachLand" }, { controller: "user", targets: [] });
    expect(lands.players.user.battlefield.map((p) => p.card.name)).toEqual(["Lander"]); // Forest gone; "Lander" is an artifact, not a Land

    const artifacts = ATOM_RESOLVERS["destroy"](base, { op: "destroy", targetType: "eachArtifact" }, { controller: "user", targets: [] });
    expect(artifacts.players.user.battlefield.map((p) => p.card.name)).toEqual(["Forest"]); // Lander gone; Forest stays
  });
});

describe("MASS-NC — the AI holds a symmetric non-creature wipe (can't weigh nuking its own board)", () => {
  it("programContainsMassRemoval is true for every new mass scope", () => {
    for (const tt of ["eachArtifact", "eachEnchantment", "eachLand", "eachArtifactOrEnchantment"]) {
      expect(programContainsMassRemoval({ atoms: [{ op: "destroy", targetType: tt }] })).toBe(true);
    }
  });
});

describe("non-chosen-targetType helper (drift-trap fix)", () => {
  it("isNonChosenTargetType is the one source of truth for every mass scope", () => {
    for (const tt of ["eachOpponent", "eachCreature", "eachCreatureAndPlayer", "eachArtifact", "eachEnchantment", "eachLand", "eachArtifactOrEnchantment"]) {
      expect(isNonChosenTargetType(tt)).toBe(true);
    }
    expect(isNonChosenTargetType("creature")).toBe(false);
    expect(isNonChosenTargetType(null)).toBe(false);
  });
  it("REGRESSION: 'deals N to each creature and each player' is now CASTABLE (3 of 5 lists used to miss it)", () => {
    const inferno = { id: "inf", name: "Inferno", type: "Sorcery", mana: "{5}{R}{R}", oracle: "Inferno deals 6 damage to each creature and each player." };
    const bear = createPermanent({ id: "b", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [inferno], manaPool: { ...s.players.user.manaPool, R: 9 }, life: 20 }, ai: { ...s.players.ai, battlefield: [bear], life: 20 } } };

    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "inf");
    expect(cast).toBeTruthy();           // was undefined before the fix → uncastable
    expect(cast.needsTargets).toBe(false); // mass = no chosen target

    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.players.user.life).toBe(14);  // the caster took 6 too
    expect(s.players.ai.life).toBe(14);
    expect(s.players.ai.battlefield.some((p) => p.id === "b")).toBe(false); // bear took 6, died
  });
});
