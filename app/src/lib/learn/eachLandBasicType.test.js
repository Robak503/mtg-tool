/**
 * eachLandBasicType.test.js — ④-BE (2026-09-04 night): "Each land is a <basic type> in addition to its other land types."
 * (Urborg, Tomb of Yawgmoth; Yavimaya, Cradle of Growth; Blanket of Night — CR 305.6 + 205.1b). A layer-4 subtype ADD on
 * EVERY land on the battlefield, both seats (the all-lands dynamic selector the Kormus-class line already used), plus the
 * delivery that makes it real: manaModel.manaSources gives a land that GAINED a basic type that type's intrinsic mana
 * ability, merged into its own one-mana tap (one tap, one mana, more colours) or synthesized when the land prints none.
 * Earth Bent and Zaxara run Yavimaya. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { manaSources } from "./manaModel.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentTypes } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const URBORG = { id: "c-ur", name: "Urborg, Tomb of Yawgmoth", type: "Legendary Land", mana: "", cmc: 0, keywords: [], oracle: "Each land is a Swamp in addition to its other land types." };
const YAVIMAYA = { id: "c-yv", name: "Yavimaya, Cradle of Growth", type: "Legendary Land", mana: "", cmc: 0, keywords: [], oracle: "Each land is a Forest in addition to its other land types." };
const BLANKET = { id: "c-bn", name: "Blanket of Night", type: "Enchantment", mana: "{2}{B}", cmc: 3, keywords: [], oracle: "Each land is a Swamp in addition to its other land types." };
const FOREST = { id: "c-f", name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "" };
const BLAST = { id: "c-bz", name: "Blast Zone", type: "Land", mana: "", cmc: 0, keywords: [], oracle: "Blast Zone enters with a charge counter on it.\n{T}: Add {C}.\n{1}, {T}: Put a charge counter on Blast Zone.\n{X}, {T}, Sacrifice Blast Zone: Destroy each nonland permanent with mana value X." };
const ANCIENT_TOMB = { id: "c-at", name: "Ancient Tomb", type: "Land", mana: "", cmc: 0, keywords: [], oracle: "{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you." };

const mk = (id, card, controller) => ({ ...createPermanent({ id, card, controller }), summoningSick: false, enteredOnTurn: 1 });
function board(userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, players: { ...s0.players, user: { ...s0.players.user, battlefield: userPerms }, ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const colorsFor = (s, pid, permId) => (manaSources(s, pid).find((x) => x.permanentId === permId)?.colors || []).slice().sort();
const amountFor = (s, pid, permId) => manaSources(s, pid).find((x) => x.permanentId === permId)?.amount;

describe("the static and the classifier", () => {
  it("⭐ the line emits ONE layer-4 subtype add over the all-lands selector (both seats — 'each land')", () => {
    const eff = parseStaticAbilities(URBORG).filter((e) => e.layer === 4);
    expect(eff).toHaveLength(1);
    expect(eff[0]).toMatchObject({ op: { subtypes: ["Swamp"] }, affects: { mode: "dynamic", selector: { cardTypes: ["Land"] } }, duration: { kind: "permanent" } });
    expect(eff[0].affects.selector.controllerScope).toBeUndefined();
    expect(parseStaticAbilities(YAVIMAYA).filter((e) => e.layer === 4)[0].op.subtypes).toEqual(["Forest"]);
    // the controller-scoped cousin stays unmodeled (safe FN)
    expect(parseStaticAbilities({ name: "X", type: "Creature — Test", oracle: "Lands you control are Swamps in addition to their other land types." }).filter((e) => e.layer === 4)).toHaveLength(0);
  });
  it("the tiers", () => {
    expect(classifyCard(URBORG)).toBe("land");
    expect(classifyCard(YAVIMAYA)).toBe("land");
    expect(classifyCard(BLANKET)).toBe("native-static");
  });
});

describe("runtime — CR 305.6, the granted type's intrinsic mana", () => {
  it("⭐ with Urborg out every land is also a Swamp and taps for B; without it nothing changes", () => {
    const bare = board([mk("forest", FOREST, "user"), mk("blast", BLAST, "user")]);
    expect(permanentTypes(bare, "blast").subtypes).toEqual([]);
    expect(colorsFor(bare, "user", "forest")).toEqual(["G"]);
    expect(colorsFor(bare, "user", "blast")).toEqual(["C"]);

    const withU = board([mk("forest", FOREST, "user"), mk("blast", BLAST, "user"), mk("urborg", URBORG, "user")]);
    expect(permanentTypes(withU, "blast").subtypes).toEqual(["Swamp"]);
    expect(colorsFor(withU, "user", "forest")).toEqual(["B", "G"]);
    expect(colorsFor(withU, "user", "blast")).toEqual(["B", "C"]);
    expect(amountFor(withU, "user", "forest")).toBe(1); // ONE tap, ONE mana — more colours, never more mana
    expect(colorsFor(withU, "user", "urborg")).toEqual(["B"]); // Urborg is itself a land (the printed card)
  });
  it("⭐ 'each land' reaches the OPPONENT's lands too", () => {
    const s = board([mk("urborg", URBORG, "user")], [mk("theirs", FOREST, "ai")]);
    expect(permanentTypes(s, "theirs").subtypes.slice().sort()).toEqual(["Forest", "Swamp"]);
    expect(colorsFor(s, "ai", "theirs")).toEqual(["B", "G"]);
  });
  it("CREED — a land whose printed source is not a plain one-mana tap is left alone (never an inflated pool)", () => {
    const s = board([mk("tomb", ANCIENT_TOMB, "user"), mk("urborg", URBORG, "user")]);
    expect(permanentTypes(s, "tomb").subtypes).toEqual(["Swamp"]);
    expect(colorsFor(s, "user", "tomb")).toEqual(["C"]); // {T}: Add {C}{C} keeps its own shape
    expect(amountFor(s, "user", "tomb")).toBe(2);
  });
  it("a printed basic gains nothing from its own type (Yavimaya over a Forest adds no second G)", () => {
    const s = board([mk("forest", FOREST, "user"), mk("yav", YAVIMAYA, "user")]);
    expect(colorsFor(s, "user", "forest")).toEqual(["G"]);
    expect(amountFor(s, "user", "forest")).toBe(1);
  });
});
