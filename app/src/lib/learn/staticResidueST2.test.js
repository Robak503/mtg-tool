/**
 * staticResidueST2.test.js — BLITZ ST-2: NON-ANTHEM STATIC residue (round 2). Three continuous-static
 * shapes whose enforcement ALREADY existed but the parser didn't route, now recognized in parseClause:
 *
 *   A. YOUR-TURN GATED KEYWORD GRANT — "During your turn, this creature has <keyword>." (Fresh-Faced
 *      Recruit / Leech Fanatic / Daggersail Aeronaut). The keyword twin of the DT-1 your-turn P/T buff:
 *      a layer-6 gated addKeyword with the SAME {kind:"yourTurn"} gate, honored live by
 *      permanentHasKeyword/keywordSet (layers.gateMet reads state.activePlayer === controller).
 *
 *   B. COMPOUND-COLOR COST-REDUCTION — "<color> spells and <color> spells you cast cost {N} less."
 *      (the Familiar cycle). ONE { costReduction: { colors:[both] } } marker — costReductionForSpell tests
 *      colors with OR, so a dual-color spell is reduced ONCE (never double). The single-descriptor shape IS
 *      the over-reduction guard.
 *
 *   C. COMPOUND CARD-TYPE COST-REDUCTION — "<A> and <B> spells you cast cost {N} less." (Goblin
 *      Electromancer, Mana Matrix). TWO { costReduction: { subtype } } markers, admitted ONLY when the pair
 *      is PROVABLY DISJOINT (one side is instant/sorcery — a spell can never carry both type-line tokens, so
 *      no spell is double-reduced). A compound SUBTYPE pair (Brighthearth Banneret — itself an Elemental
 *      Warrior!) or a dual-permanent pair (Starnheim Courser "Artifact and enchantment") stays body-only.
 *
 * CREED: false-neg safe, false-pos forbidden, whole-card-or-park. Every fixture's oracle is real (bundled
 * Scryfall, verified 2026-07-17); every expected value confirmed against the live parser + engine.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseStaticAbilities, collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (oracle verified against bundled Scryfall data) ──────────
const FRESH_FACED = () => ({ name: "Fresh-Faced Recruit", type: "Creature — Human Soldier", mana: "{1}{R/W}", oracle: "During your turn, this creature has first strike." });
const LEECH_FANATIC = () => ({ name: "Leech Fanatic", type: "Creature — Human Warlock", mana: "{1}{B}", oracle: "During your turn, this creature has lifelink." });
const DAGGERSAIL = () => ({ name: "Daggersail Aeronaut", type: "Creature — Goblin", mana: "{3}{R}", oracle: "During your turn, this creature has flying." });
const FEISTY = () => ({ name: "Feisty Spikeling", type: "Creature — Shapeshifter", mana: "{1}{R/W}", oracle: "Changeling (This card is every creature type.)\nDuring your turn, this creature has first strike." });
const COLOSSUS = () => ({ name: "Colossus, Steel Stalwart", type: "Legendary Creature — Mutant Hero", mana: "{4}{G}", oracle: "During your turn, Colossus has indestructible. (Damage and effects that say \"destroy\" don't destroy him.)\nOther Mutants you control get +1/+1." });

const ELECTROMANCER = () => ({ name: "Goblin Electromancer", type: "Creature — Goblin Wizard", mana: "{U}{R}", oracle: "Instant and sorcery spells you cast cost {1} less to cast." });
const MANA_MATRIX = () => ({ name: "Mana Matrix", type: "Artifact", mana: "{6}", oracle: "Instant and enchantment spells you cast cost {2} less to cast." });
const THORNSCAPE = () => ({ name: "Thornscape Familiar", type: "Creature — Insect", mana: "{1}{G}", oracle: "Red spells and white spells you cast cost {1} less to cast." });
const SUNSCAPE = () => ({ name: "Sunscape Familiar", type: "Creature — Wall", mana: "{1}{W}", oracle: "Defender (This creature can't attack.)\nGreen spells and blue spells you cast cost {1} less to cast." });
// FN anchors — must NOT flip:
const BRIGHTHEARTH = () => ({ name: "Brighthearth Banneret", type: "Creature — Elemental Warrior", mana: "{1}{R}", oracle: "Elemental spells and Warrior spells you cast cost {1} less to cast.\nReinforce 1—{1}{R} ({1}{R}, Discard this card: Put a +1/+1 counter on target creature.)" });
const STARNHEIM = () => ({ name: "Starnheim Courser", type: "Creature — Pegasus", mana: "{2}{W}", oracle: "Flying\nArtifact and enchantment spells you cast cost {1} less to cast." });

// ════════════════════════════════════════════════════════════════════════════════
// A. YOUR-TURN GATED KEYWORD GRANT
// ════════════════════════════════════════════════════════════════════════════════

describe("ST-2 A — your-turn keyword grant: parser marker", () => {
  it("Fresh-Faced Recruit → one layer-6 gated addKeyword(First strike, yourTurn) on self", () => {
    expect(parseStaticAbilities(FRESH_FACED())).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "First strike", gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
  });
  it("Leech Fanatic → lifelink; Daggersail Aeronaut → flying (each a self yourTurn grant)", () => {
    expect(parseStaticAbilities(LEECH_FANATIC())).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Lifelink", gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
    expect(parseStaticAbilities(DAGGERSAIL())).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Flying", gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
  });
});

describe("ST-2 A — your-turn keyword grant: coverage flips", () => {
  it("the pure grants flip native-static", () => {
    expect(classifyCard(FRESH_FACED())).toBe("native-static");
    expect(classifyCard(LEECH_FANATIC())).toBe("native-static");
    expect(classifyCard(DAGGERSAIL())).toBe("native-static");
  });
  it("Feisty Spikeling (Changeling keyword-only + the grant) flips native", () => {
    expect(classifyCard(FEISTY())).toMatch(/^native/);
  });
  it("Colossus (the grant + a modeled tribal anthem) flips native", () => {
    // 'During your turn, Colossus has indestructible' (self-name normalized to 'this creature') +
    // 'Other Mutants you control get +1/+1' (the already-modeled tribal lord anthem).
    expect(classifyCard(COLOSSUS())).toMatch(/^native/);
  });
});

describe("ST-2 A — your-turn keyword grant: the live gate (runtime pin)", () => {
  function board(card) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const self = createPermanent({ id: "self", card, controller: "user", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self] } } };
  }
  it("first strike is present on the controller's turn and lifts on an opponent's", () => {
    const s = board(FRESH_FACED());
    const myTurn = { ...s, activePlayer: "user" };
    const theirTurn = { ...s, activePlayer: "ai1" };
    expect(permanentHasKeyword(myTurn, "self", "first strike")).toBe(true);
    expect(permanentHasKeyword(theirTurn, "self", "first strike")).toBe(false);
  });
  it("lifelink (Leech Fanatic) gates identically", () => {
    const s = board(LEECH_FANATIC());
    expect(permanentHasKeyword({ ...s, activePlayer: "user" }, "self", "lifelink")).toBe(true);
    expect(permanentHasKeyword({ ...s, activePlayer: "ai1" }, "self", "lifelink")).toBe(false);
  });
});

describe("ST-2 A — your-turn keyword grant: FN guards (CREED)", () => {
  it("a non-grantable tail (toxic — granted toxic is unenforced) emits nothing → body-only", () => {
    const toxic = { name: "Fake", type: "Creature — Phyrexian", oracle: "During your turn, this creature has toxic 1." };
    expect(parseStaticAbilities(toxic)).toEqual([]);
    expect(classifyCard(toxic)).toBe("body-only");
  });
  it("a P/T-set rider (Snowmelt Stag frame) is not a keyword → emits nothing, stays non-native", () => {
    const stag = { name: "Fake Stag", type: "Creature — Elemental Elk", oracle: "During your turn, this creature has base power and toughness 5/2." };
    expect(parseStaticAbilities(stag).some((d) => d.op?.layerOp === "addKeyword")).toBe(false);
    expect(classifyCard(stag)).not.toMatch(/^native/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// B. COMPOUND-COLOR COST-REDUCTION
// ════════════════════════════════════════════════════════════════════════════════

describe("ST-2 B — compound-color reducer: parser + coverage", () => {
  it("Thornscape Familiar → ONE reducer carrying both colors (R,W)", () => {
    expect(parseStaticAbilities(THORNSCAPE())).toEqual([{ costReduction: { colors: ["R", "W"], amount: 1 } }]);
  });
  it("Thornscape flips native-static; Sunscape (Defender keyword-only + the reducer) flips native-static", () => {
    expect(classifyCard(THORNSCAPE())).toBe("native-static");
    expect(classifyCard(SUNSCAPE())).toBe("native-static");
  });
});

describe("ST-2 B — compound-color reducer: no double reduction (runtime pin)", () => {
  it("a dual-color (Boros R+W) spell is reduced ONCE, not twice", () => {
    const reducers = collectCostReducers([THORNSCAPE()]);
    expect(reducers).toEqual([{ colors: ["R", "W"], amount: 1 }]);
    expect(costReductionForSpell(reducers, { type: "Creature — Angel", colors: ["R", "W"] })).toBe(1);
    expect(costReductionForSpell(reducers, { type: "Instant", colors: ["R"] })).toBe(1);   // mono-red
    expect(costReductionForSpell(reducers, { type: "Instant", colors: ["U"] })).toBe(0);   // off-color
  });
  it("engine cast site: a red spell in hand is discounted {1} by Thornscape on the battlefield", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const red = { id: "r1", name: "Red Spell", type: "Instant", mana: "{3}{R}", colors: ["R"], oracle: "", keywords: [] };
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players, user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, R: 8, G: 2 }, hand: [red], battlefield: [createPermanent({ card: THORNSCAPE(), controller: "user" })] } },
    };
    const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((x) => x.cardId === "r1");
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(2); // {3}{R} → {2}{R}
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// C. COMPOUND CARD-TYPE COST-REDUCTION
// ════════════════════════════════════════════════════════════════════════════════

describe("ST-2 C — compound card-type reducer: parser + coverage", () => {
  it("Goblin Electromancer → TWO disjoint subtype reducers (Instant/1 + Sorcery/1)", () => {
    expect(parseStaticAbilities(ELECTROMANCER())).toEqual([
      { costReduction: { subtype: "Instant", amount: 1 } },
      { costReduction: { subtype: "Sorcery", amount: 1 } },
    ]);
  });
  it("Mana Matrix (Instant and enchantment — an instant is never an enchantment) → two disjoint reducers", () => {
    expect(parseStaticAbilities(MANA_MATRIX())).toEqual([
      { costReduction: { subtype: "Instant", amount: 2 } },
      { costReduction: { subtype: "Enchantment", amount: 2 } },
    ]);
  });
  it("Goblin Electromancer + Mana Matrix flip native-static", () => {
    expect(classifyCard(ELECTROMANCER())).toBe("native-static");
    expect(classifyCard(MANA_MATRIX())).toBe("native-static");
  });
});

describe("ST-2 C — compound card-type reducer: disjoint match (runtime pin)", () => {
  it("each spell matches exactly ONE of the two descriptors — never double-reduced", () => {
    const reducers = collectCostReducers([ELECTROMANCER()]);
    expect(costReductionForSpell(reducers, { type: "Instant" })).toBe(1);
    expect(costReductionForSpell(reducers, { type: "Sorcery" })).toBe(1);
    expect(costReductionForSpell(reducers, { type: "Creature — Goblin" })).toBe(0);
  });
  it("engine cast site: Goblin Electromancer discounts an instant {1}, leaves a creature alone", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const bolt = { id: "b1", name: "Test Bolt", type: "Instant", mana: "{2}{R}", oracle: "", keywords: [] };
    const bear = { id: "be1", name: "Test Bear", type: "Creature — Bear", mana: "{2}{G}", oracle: "", keywords: [] };
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players, user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, R: 8, G: 8 }, hand: [bolt, bear], battlefield: [createPermanent({ card: ELECTROMANCER(), controller: "user" })] } },
    };
    const acts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell");
    expect(acts.find((x) => x.cardId === "b1").cost.generic).toBe(1); // {2}{R} → {1}{R}
    expect(acts.find((x) => x.cardId === "be1").cost.generic).toBe(2); // creature untouched
  });
});

describe("ST-2 C — compound card-type reducer: FN guards (CREED — over-reduction forbidden)", () => {
  it("Brighthearth Banneret (compound SUBTYPE — itself an Elemental Warrior!) emits NO reducer → body-only", () => {
    // Two subtype descriptors would double-reduce a dual-subtype spell (a second Brighthearth is an Elemental
    // Warrior); the single-subtype enforcement can't OR two subtypes, so the compound stays unmodeled.
    expect(parseStaticAbilities(BRIGHTHEARTH()).some((d) => d.costReduction)).toBe(false);
    expect(classifyCard(BRIGHTHEARTH())).toBe("body-only");
  });
  it("Starnheim Courser (Artifact and enchantment — a dual-permanent pair) emits NO reducer → body-only", () => {
    expect(parseStaticAbilities(STARNHEIM()).some((d) => d.costReduction)).toBe(false);
    expect(classifyCard(STARNHEIM())).toBe("body-only");
  });
});
