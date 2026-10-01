/**
 * DRYAD OF THE ILYSIAN GROVE — the play-weighted program, P·21 (EDHREC #295); Prismatic Omen prints the same line.
 *   "Lands you control are every basic land type in addition to their other types."
 *
 * The controller-scoped, all-five cousin of Urborg's "each land is a Swamp" (eachLandBasicType.test.js): a layer-4 add of
 * Plains, Island, Swamp, Mountain and Forest on each land its controller controls (CR 305.6 + 205.1b). Each type carries its
 * intrinsic mana ability through the same manaModel delivery, so those lands tap for any colour — one tap, one mana. An
 * opponent's lands are untouched; the grant ends when the Dryad leaves. Real oracle fixtures (bundled Scryfall snapshot).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { manaSources, canAfford } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentTypes } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { canBlockAttacker, attackDefenderRequirementOf, defenderMeetsAttackRequirement } from "./combatEvasion.js";
import { checkStateTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const DRYAD = { id: "c-dr", name: "Dryad of the Ilysian Grove", type: "Enchantment Creature — Nymph Dryad", mana: "{2}{G}", cmc: 3, power: 2, toughness: 4, keywords: [], oracle: "You may play an additional land on each of your turns.\nLands you control are every basic land type in addition to their other types." };
const OMEN = { id: "c-po", name: "Prismatic Omen", type: "Enchantment", mana: "{1}{G}", cmc: 2, keywords: [], oracle: "Lands you control are every basic land type in addition to their other types." };
const FOREST = { id: "c-f", name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "" };
const MOUNTAIN = { id: "c-m", name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, keywords: [], oracle: "" };
const BLAST = { id: "c-bz", name: "Blast Zone", type: "Land", mana: "", cmc: 0, keywords: [], oracle: "Blast Zone enters with a charge counter on it.\n{T}: Add {C}.\n{1}, {T}: Put a charge counter on Blast Zone.\n{X}, {T}, Sacrifice Blast Zone: Destroy each nonland permanent with mana value X." };
const LEVIATHAN = { id: "c-sl", name: "Segovian Leviathan", type: "Creature — Leviathan", mana: "{4}{U}", cmc: 5, power: 3, toughness: 3, keywords: ["Landwalk", "Islandwalk"], oracle: "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)" };
const SERPENT = { id: "c-ss", name: "Sea Serpent", type: "Creature — Serpent", mana: "{5}{U}", cmc: 6, power: 5, toughness: 5, keywords: [], oracle: "This creature can't attack unless defending player controls an Island.\nWhen you control no Islands, sacrifice this creature." };
const BEAR = { id: "c-gb", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };

const BASICS = ["Forest", "Island", "Mountain", "Plains", "Swamp"];
const mk = (id, card, controller) => ({ ...createPermanent({ id, card, controller }), summoningSick: false, enteredOnTurn: 1 });
function board(userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, players: { ...s0.players, user: { ...s0.players.user, battlefield: userPerms }, ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const colorsFor = (s, pid, permId) => (manaSources(s, pid).find((x) => x.permanentId === permId)?.colors || []).slice().sort();
const amountFor = (s, pid, permId) => manaSources(s, pid).find((x) => x.permanentId === permId)?.amount;
const subtypesOf = (s, permId) => permanentTypes(s, permId).subtypes.slice().sort();

describe("the static and the classifier", () => {
  it("the line emits ONE layer-4 add of the five basic types over the lands its controller controls; Dryad and Prismatic Omen classify native-static", () => {
    const eff = parseStaticAbilities(OMEN).filter((e) => e.layer === 4);
    const row = { eff, dryad: classifyCard(DRYAD), omen: classifyCard(OMEN) };
    console.log("  WITNESS dryadStatic", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.eff).toEqual([{ layer: 4, op: { subtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] }, affects: { mode: "dynamic", selector: { cardTypes: ["Land"], controllerScope: "you" } }, duration: { kind: "permanent" } }]);
    expect(row.dryad).toBe("native-static");
    expect(row.omen).toBe("native-static");
  });
});

describe("runtime — CR 305.6, every basic type's intrinsic mana", () => {
  it("with the Dryad out each of its controller's lands is every basic type and taps for any colour (one tap, one mana); an opponent's land is untouched", () => {
    const s = board([mk("dryad", DRYAD, "user"), mk("forest", FOREST, "user"), mk("blast", BLAST, "user")], [mk("theirs", MOUNTAIN, "ai")]);
    const row = {
      forest: { subtypes: subtypesOf(s, "forest"), colors: colorsFor(s, "user", "forest"), amount: amountFor(s, "user", "forest") },
      blast: { subtypes: subtypesOf(s, "blast"), colors: colorsFor(s, "user", "blast") },
      theirs: { subtypes: subtypesOf(s, "theirs"), colors: colorsFor(s, "ai", "theirs") },
    };
    console.log("  WITNESS dryadMana", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.forest).toEqual({ subtypes: BASICS, colors: ["B", "G", "R", "U", "W"], amount: 1 });
    expect(row.blast).toEqual({ subtypes: BASICS, colors: ["B", "C", "G", "R", "U", "W"] });
    expect(row.theirs).toEqual({ subtypes: ["Mountain"], colors: ["R"] });
  });

  it("two Forests cast a {U}{U} spell only while the Dryad is out", () => {
    const cost = parseManaCost("{U}{U}");
    const lands = () => [mk("f1", FOREST, "user"), mk("f2", FOREST, "user")];
    const without = board(lands());
    const withDryad = board([mk("dryad", DRYAD, "user"), ...lands()]);
    const afford = (s) => canAfford(s.players.user.manaPool, manaSources(s, "user"), cost);
    expect(afford(without)).toBe(false);
    expect(afford(withDryad)).toBe(true);
  });

  it("the grant ends when the Dryad leaves", () => {
    const s = board([mk("dryad", DRYAD, "user"), mk("forest", FOREST, "user")]);
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "dryad") } } };
    expect(subtypesOf(gone, "forest")).toEqual(["Forest"]);
    expect(colorsFor(gone, "user", "forest")).toEqual(["G"]);
  });
});

describe("the land-type readers see the granted types (CR 702.14c, 603.8)", () => {
  const dryadIf = (on) => (on ? [mk("dryad", DRYAD, "user")] : []);
  it("islandwalk: an attacker can't be blocked by a Dryad player who controls only Forests", () => {
    const s = (on) => board([...dryadIf(on), mk("forest", FOREST, "user"), mk("bear", BEAR, "user")], [mk("lev", LEVIATHAN, "ai")]);
    expect(canBlockAttacker(s(false), "bear", "lev", "user")).toBe(true);
    expect(canBlockAttacker(s(true), "bear", "lev", "user")).toBe(false);
  });
  it("Sea Serpent may attack a Dryad player (they control an Island), and its 'no Islands' sacrifice doesn't trigger under its own controller's Dryad", () => {
    const req = attackDefenderRequirementOf(SERPENT);
    const defender = (on) => board([...dryadIf(on), mk("forest", FOREST, "user")], [mk("ss", SERPENT, "ai")]);
    const own = (on) => board([...dryadIf(on), mk("forest", FOREST, "user"), mk("ss", SERPENT, "user")]);
    const row = { attackWithout: defenderMeetsAttackRequirement(defender(false), "user", req), attackWith: defenderMeetsAttackRequirement(defender(true), "user", req),
      sacWithout: checkStateTriggers(own(false)).pendingTriggers.length, sacWith: checkStateTriggers(own(true)).pendingTriggers.length };
    console.log("  WITNESS dryadReaders", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ attackWithout: false, attackWith: true, sacWithout: 1, sacWith: 0 });
  });
});
