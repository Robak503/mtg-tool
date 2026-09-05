/**
 * cloneNonCreature.test.js — NON-CREATURE artifact clones (CR 707).
 *
 * The clone runtime already copies artifacts (Phyrexian Metamorph's "any artifact or creature" scope); this
 * extends it to NON-creature clone CARDS with an artifact/Equipment scope: Sculpting Steel (Artifact, "any
 * artifact"), Copy Artifact (Enchantment, "any artifact, except it's an enchantment in addition"), Masterwork of
 * Ingenuity (Artifact — Equipment, "any Equipment"). isCloneCard now admits a non-creature clone card ONLY for
 * the anyArtifact / anyEquipment scopes (a creature-copy scope on a non-creature card, or an enchantment/nonland
 * scope, stays PARKED — Copy Enchantment / Clever Impersonator remain Arbiter, a safe false-negative).
 * Flip-diff GAINED = {Sculpting Steel, Copy Artifact, Masterwork of Ingenuity}, LOST = 0.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { isCloneCard, parseCloneSpec, cloneCandidates } from "./cloneCopy.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());
const SCULPTING = { name: "Sculpting Steel", type: "Artifact", mana: "{3}", oracle: "You may have this artifact enter as a copy of any artifact on the battlefield." };
const COPY_ARTIFACT = { name: "Copy Artifact", type: "Enchantment", mana: "{2}{U}", oracle: "You may have this enchantment enter as a copy of any artifact on the battlefield, except it's an enchantment in addition to its other types." };
const MASTERWORK = { name: "Masterwork of Ingenuity", type: "Artifact — Equipment", mana: "{1}", oracle: "You may have this Equipment enter as a copy of any Equipment on the battlefield." };
const COPY_ENCHANT = { name: "Copy Enchantment", type: "Enchantment", mana: "{2}{U}", oracle: "You may have this enchantment enter as a copy of any enchantment on the battlefield." };
const CLEVER = { name: "Clever Impersonator", type: "Creature — Shapeshifter", mana: "{2}{U}{U}", oracle: "You may have this creature enter as a copy of any nonland permanent on the battlefield." };

describe("non-creature artifact clones — classify + spec", () => {
  it("Sculpting Steel / Copy Artifact / Masterwork of Ingenuity are native-clone", () => {
    expect(classifyCard(SCULPTING)).toBe("native-clone");
    expect(classifyCard(COPY_ARTIFACT)).toBe("native-clone");
    expect(classifyCard(MASTERWORK)).toBe("native-clone");
  });
  it("isCloneCard admits non-creature ARTIFACT-scope clones; scopes read anyArtifact / anyEquipment; Copy Artifact carries the addCardType rider", () => {
    expect(isCloneCard(SCULPTING)).toBe(true);
    expect(parseCloneSpec(SCULPTING).scope).toBe("anyArtifact");
    expect(parseCloneSpec(MASTERWORK).scope).toBe("anyEquipment");
    expect(parseCloneSpec(COPY_ARTIFACT).riders.map((r) => r.kind)).toContain("addCardType");
  });
  it("GRADUATED (POD-SIM THREE · KN-2, 2026-09-05): enchantment / nonland-permanent scopes are modeled — Copy Enchantment + Clever Impersonator native-clone (runtime: cloneWidened.test.js)", () => {
    expect(isCloneCard(COPY_ENCHANT)).toBe(true);
    expect(parseCloneSpec(COPY_ENCHANT).scope).toBe("anyEnchantment");
    expect(classifyCard(COPY_ENCHANT)).toBe("native-clone");
    expect(isCloneCard(CLEVER)).toBe(true);
    expect(parseCloneSpec(CLEVER).scope).toBe("anyNonlandPermanent");
    expect(classifyCard(CLEVER)).toBe("native-clone");
  });
});

describe("non-creature artifact clone — candidate enumeration", () => {
  it("anyArtifact enumerates ARTIFACTS (not plain creatures); anyEquipment only Equipment", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const sol = createPermanent({ id: "sol", card: { id: "c-sol", name: "Sol Ring", type: "Artifact" }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const sword = createPermanent({ id: "sword", card: { id: "c-sw", name: "Sword", type: "Artifact — Equipment" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [sol, bear, sword] } } };
    expect(cloneCandidates(s, "user", "anyArtifact").map((c) => c.id).sort()).toEqual(["sol", "sword"]);      // artifacts only, no bear
    expect(cloneCandidates(s, "user", "anyEquipment").map((c) => c.id)).toEqual(["sword"]);                    // Equipment only
  });
});

describe("non-creature artifact clone — runtime (copies an artifact and functions)", () => {
  it("Sculpting Steel entering as a copy of a Sol Ring becomes a Sol Ring that taps for {C}{C}", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const sol = createPermanent({ id: "sol", card: { id: "card-sol", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, controller: "user", summoningSick: false });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [sol], hand: [{ ...SCULPTING, id: "card-sculpt" }], manaPool: { ...s.players.user.manaPool, C: 5 } } } };
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "card-sculpt");
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.pendingChoice).toMatchObject({ kind: "clone-search" });
    s = finalizeStackResolution(resolveCloneChoice(s, "sol"));
    const clone = s.players.user.battlefield.find((p) => p.printedCard);
    expect(clone.card.name).toBe("Sol Ring");                    // became the copy
    expect(clone.printedCard.name).toBe("Sculpting Steel");      // remembers the original
    expect(manaProduction(clone.card)).toMatchObject({ colors: ["C"], amount: 2 }); // functions as a Sol Ring
  });
});
