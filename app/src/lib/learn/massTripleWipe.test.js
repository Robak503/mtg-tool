/**
 * massTripleWipe.test.js — "Destroy all artifacts, creatures, and enchantments." (Nevinyrral's Disk, Magus of the Disk, Akroma's
 * Vengeance — census rank 49 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * The mass-destroy family had the pair "artifacts and enchantments" (eachArtifactOrEnchantment) but not the triple, so the
 * clause parsed low. New scope `eachArtifactCreatureOrEnchantment`, wired through every site a wipe scope needs: the removal
 * parse, the clause splitter's keep-whole guard (the comma and " and " would shatter it), atomTargets (+ its load-time handled
 * set), MASS_WIPE_SCOPES (the AI holds wipes) and the creature-wipe query (it answers a creature board). The creature half is
 * the layer-aware creature set the Wrath path uses; the artifact and enchantment halves read the type line like the pair.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); the Disk is activated and the Vengeance cast for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programContainsMassRemoval, programContainsCreatureMassRemoval } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DISK = { name: "Nevinyrral's Disk", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "This artifact enters tapped.\n{1}, {T}: Destroy all artifacts, creatures, and enchantments." };
const MAGUS = { name: "Magus of the Disk", type: "Creature — Human Wizard", mana: "{2}{W}{W}", power: "2", toughness: "4", keywords: [],
  oracle: "This creature enters tapped.\n{1}, {T}: Destroy all artifacts, creatures, and enchantments." };
const VENGEANCE = { id: "c-vengeance", name: "Akroma's Vengeance", type: "Sorcery", mana: "{4}{W}{W}", keywords: ["Cycling"],
  oracle: "Destroy all artifacts, creatures, and enchantments.\nCycling {3} ({3}, Discard this card: Draw a card.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}", oracle: "Creatures you control get +1/+1." };
const ARBOR = { name: "Dryad Arbor", type: "Land Creature — Forest Dryad", mana: "", power: "1", toughness: "1", oracle: "(This land is green.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const JACE = { name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };
const INGOT = { name: "Darksteel Ingot", type: "Artifact", mana: "{3}", keywords: ["Indestructible"], oracle: "Indestructible\n{T}: Add one mana of any color." };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (card, id, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
// The same mixed board every run: each kind the wipe must hit, and each it must miss.
function board(userExtra = [], { hand = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const user = [...userExtra, perm(BEARS, "bears", "user"), perm(FOREST, "forest", "user")];
  const ai = [perm(MIND_STONE, "stone", "ai"), perm(ANTHEM, "anthem", "ai"), perm(ARBOR, "arbor", "ai"), perm(JACE, "jace", "ai", { counters: { loyalty: 3 } }), perm(INGOT, "ingot", "ai")];
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...EMPTY, ...pool } }, ai: { ...s.players.ai, battlefield: ai } } };
}
const names = (s) => [...s.players.user.battlefield, ...s.players.ai.battlefield].map((p) => p.card.name).sort();
const resolve = (s0) => { let s = s0; for (let i = 0; i < 6 && (s.stack || []).length; i++) s = resolveTopOfStack(s); return s; };
const SURVIVORS = ["Darksteel Ingot", "Forest", "Jace Beleren"]; // a land, a planeswalker, an indestructible artifact

describe("parse, AI queries, classification", () => {
  it("the triple parses HIGH to one wipe scope, which the AI holds and counts as a creature wipe", () => {
    const p = parseEffectClause("destroy all artifacts, creatures, and enchantments");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "eachArtifactCreatureOrEnchantment" }]);
    expect([programContainsMassRemoval(p), programContainsCreatureMassRemoval(p)]).toEqual([true, true]);
  });
  it("Nevinyrral's Disk, Magus of the Disk and Akroma's Vengeance classify native", () => {
    for (const card of [DISK, MAGUS, VENGEANCE]) expect(classifyCard(card), card.name).toMatch(/^native-/);
  });
});

describe("RUNTIME — artifacts, creatures and enchantments go; lands, planeswalkers and indestructible stay", () => {
  it("VACUITY CONTROL — the board as dealt, before anything resolves", () => {
    expect(names(board([perm(DISK, "disk", "user")]))).toEqual(["Darksteel Ingot", "Dryad Arbor", "Forest", "Glorious Anthem", "Grizzly Bears", "Jace Beleren", "Mind Stone", "Nevinyrral's Disk"]);
  });

  it("⭐ Nevinyrral's Disk, activated for {1}: everything but the land, the planeswalker and the indestructible Ingot is destroyed — the Disk too", () => {
    const s0 = board([perm(DISK, "disk", "user")], { pool: { C: 1 } });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "disk");
    expect(act).toBeDefined();
    const left = names(resolve(dispatchAction(s0, act)));
    expect(left).toEqual(SURVIVORS);
    console.log(`WITNESS diskWipe ${JSON.stringify(left)}`);
  });

  it("⭐ Akroma's Vengeance, cast from hand, leaves the same three", () => {
    const s0 = board([], { hand: [VENGEANCE], pool: { W: 2, C: 4 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.name === "Akroma's Vengeance");
    expect(cast).toBeDefined();
    expect(names(resolve(dispatchAction(s0, cast)))).toEqual(SURVIVORS);
  });
});
