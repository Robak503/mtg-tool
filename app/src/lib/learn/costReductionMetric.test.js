/**
 * costReductionMetric.test.js — CAST-COST-REDUCTION subsystem (self-metric + chosen-type + color).
 *
 * Extends the subtype STATIC-COST-REDUCTION (costReduction.test.js) with three new shapes, all generic-only,
 * floored at {0}, mana-value untouched (CR 601.2f reduces the cost to pay; CR 202.3 — MV is the printed cost):
 *
 *   A. SELF-METRIC — "This spell costs {X} less to cast, where X is <board metric>" (the spell discounts its OWN
 *      cast by a LIVE board count, read at cast announce):
 *        • Ghalta, Primal Hunger      — X = total power of creatures you control       (flips native-body)
 *        • The Great Henge            — X = greatest power among creatures you control (PARKED flip; runtime reduces)
 *        • Cavern-Hoard Dragon        — X = greatest # artifacts an opponent controls  (PARKED flip; runtime reduces)
 *        • Excalibur, Sword of Eden   — X = total MV of historic permanents you control (PARKED flip; runtime reduces)
 *   B. CHOSEN-TYPE — "Creature spells [you cast] of the chosen type cost {N} less" (Urza's Incubator flips
 *      native-static; Herald's Horn PARKED on its upkeep trigger but still reduces at runtime).
 *   C. COLOR — "Each spell you cast that's <color> or <color> costs {N} less" (Goblin Anarchomancer) and
 *      "<Color> spells you cast cost {N} less" (Ruby Medallion). Matches the spell's colors (CR 105.2 — a set).
 *
 * CREED (the cost-pipeline FP guards): only GENERIC mana is reduced — a colored pip is NEVER trimmed; the
 * generic floors at {0}; a spell is never castable for free while colored pips remain. An off-type / off-color /
 * inert-chosen-type spell is not reduced. Every expected value was confirmed against the live engine first.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseStaticAbilities, selfCostReductionMetric, collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (oracle verified against bundled Scryfall data) ──────────
const GHALTA = () => ({ name: "Ghalta, Primal Hunger", type: "Legendary Creature — Elder Dinosaur", mana: "{10}{G}{G}", keywords: ["Trample"], oracle: "This spell costs {X} less to cast, where X is the total power of creatures you control.\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)" });
const GREAT_HENGE = () => ({ name: "The Great Henge", type: "Legendary Artifact", mana: "{7}{G}{G}", keywords: [], oracle: "This spell costs {X} less to cast, where X is the greatest power among creatures you control.\n{T}: Add {G}{G}. You gain 2 life.\nWhenever a nontoken creature you control enters, put a +1/+1 counter on it and draw a card." });
const CAVERN_HOARD = () => ({ name: "Cavern-Hoard Dragon", type: "Creature — Dragon", mana: "{7}{R}{R}", keywords: ["Flying", "Trample", "Haste"], oracle: "This spell costs {X} less to cast, where X is the greatest number of artifacts an opponent controls.\nFlying, trample, haste\nWhenever this creature deals combat damage to a player, you create a Treasure token for each artifact that player controls." });
const EXCALIBUR = () => ({ name: "Excalibur, Sword of Eden", type: "Legendary Artifact — Equipment", mana: "{12}", keywords: [], oracle: "This spell costs {X} less to cast, where X is the total mana value of historic permanents you control. (Artifacts, legendaries, and Sagas are historic.)\nEquipped creature gets +10/+0 and has vigilance.\nEquip legendary creature {2}" });
const URZAS_INCUBATOR = () => ({ name: "Urza's Incubator", type: "Artifact", mana: "{3}", oracle: "As this artifact enters, choose a creature type.\nCreature spells of the chosen type cost {2} less to cast." });
const HERALDS_HORN = () => ({ name: "Herald's Horn", type: "Artifact", mana: "{3}", oracle: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand." });
const MOROPHON = () => ({ name: "Morophon, the Boundless", type: "Legendary Creature — Shapeshifter", mana: "{7}", keywords: ["Changeling"], oracle: "Changeling (This card is every creature type.)\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1." });
const ANARCHOMANCER = () => ({ name: "Goblin Anarchomancer", type: "Creature — Goblin Shaman", mana: "{R}{G}", oracle: "Each spell you cast that's red or green costs {1} less to cast." });
const RUBY_MEDALLION = () => ({ name: "Ruby Medallion", type: "Artifact", mana: "{2}", oracle: "Red spells you cast cost {1} less to cast." });

// ════════════════════════════════════════════════════════════════════════════════
// A. SELF-METRIC parser
// ════════════════════════════════════════════════════════════════════════════════
describe("SELF-METRIC — parser", () => {
  it("Ghalta → totalPowerYouControl", () => {
    expect(selfCostReductionMetric(GHALTA())).toEqual({ kind: "totalPowerYouControl" });
  });
  it("The Great Henge → greatestPowerYouControl", () => {
    expect(selfCostReductionMetric(GREAT_HENGE())).toEqual({ kind: "greatestPowerYouControl" });
  });
  it("Cavern-Hoard Dragon → greatestArtifactsAnOpponentControls", () => {
    expect(selfCostReductionMetric(CAVERN_HOARD())).toEqual({ kind: "greatestArtifactsAnOpponentControls" });
  });
  it("Excalibur → totalManaValueHistoricYouControl (reminder stripped before the anchor)", () => {
    expect(selfCostReductionMetric(EXCALIBUR())).toEqual({ kind: "totalManaValueHistoricYouControl" });
  });
  it("Shadow of Mortality → lifeBelowStart (SHELF S7 — the printed condition is the metric's own floor)", () => {
    expect(selfCostReductionMetric({ oracle: "If your life total is less than your starting life total, this spell costs {X} less to cast, where X is the difference." })).toEqual({ kind: "lifeBelowStart" });
  });
  it("an UNMODELED metric ('where X is the number of Mountains you control') → null (safe FN, body-only)", () => {
    expect(selfCostReductionMetric({ oracle: "This spell costs {X} less to cast, where X is the number of Mountains you control." })).toBe(null);
  });
  it("a non-self-cost card → null", () => {
    expect(selfCostReductionMetric({ oracle: "Flying\nWhenever this creature attacks, draw a card." })).toBe(null);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// B. CHOSEN-TYPE + C. COLOR parser markers
// ════════════════════════════════════════════════════════════════════════════════
describe("CHOSEN-TYPE — parser marker", () => {
  it("Urza's Incubator → a chosenType/2 reducer ('you cast' omitted)", () => {
    expect(parseStaticAbilities(URZAS_INCUBATOR())).toEqual([{ costReduction: { chosenType: true, amount: 2 } }]);
  });
  it("Herald's Horn → a chosenType/1 reducer ('you cast' present; the upkeep trigger adds no static descriptor)", () => {
    expect(parseStaticAbilities(HERALDS_HORN())).toEqual([{ costReduction: { chosenType: true, amount: 1 } }]);
  });
  it("Morophon ('cost {W}{U}{B}{R}{G} less' — colored) → NO chosen-type reducer (colored reduction is unmodeled — PARKED)", () => {
    // CREED: a colored-mana reduction is out of scope (we reduce only generic). Morophon's reducer clause
    // emits no marker, so it stays body-only (its anthem/chooser also don't flip it on their own here).
    expect(parseStaticAbilities(MOROPHON()).some((d) => d.costReduction)).toBe(false);
  });
  it("a CARD-type chooser reducer ('Spells you cast of the chosen type …' — Cloud Key) → NO marker (no 'Creature spells' lead)", () => {
    expect(parseStaticAbilities({ type: "Artifact", oracle: "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery.\nSpells you cast of the chosen type cost {1} less to cast." }).some((d) => d.costReduction)).toBe(false);
  });
});

describe("COLOR — parser marker", () => {
  it("Goblin Anarchomancer ('red or green') → a colors:[R,G]/1 reducer", () => {
    expect(parseStaticAbilities(ANARCHOMANCER())).toEqual([{ costReduction: { colors: ["R", "G"], amount: 1 } }]);
  });
  it("Ruby Medallion ('Red spells you cast …') → a colors:[R]/1 reducer", () => {
    expect(parseStaticAbilities(RUBY_MEDALLION())).toEqual([{ costReduction: { colors: ["R"], amount: 1 } }]);
  });
  it("a mixed quality ('that's red or an artifact') → NO marker (not a pure color reducer — safe FN)", () => {
    expect(parseStaticAbilities({ type: "Artifact", oracle: "Each spell you cast that's red or an artifact costs {1} less to cast." }).some((d) => d.costReduction)).toBe(false);
  });
});

// ─── color/chosen-type match helpers (costReductionForSpell) ─────────────────────
describe("COLOR — costReductionForSpell color matching", () => {
  const reducers = [{ colors: ["R", "G"], amount: 1 }];
  it("a mono-red spell is reduced", () => {
    expect(costReductionForSpell(reducers, { type: "Sorcery", mana: "{2}{R}", colors: ["R"] })).toBe(1);
  });
  it("a mono-green spell is reduced (the colors are a union)", () => {
    expect(costReductionForSpell(reducers, { type: "Creature — Beast", mana: "{3}{G}", colors: ["G"] })).toBe(1);
  });
  it("a red-green spell is reduced ONCE per reducer (not once per matching color)", () => {
    expect(costReductionForSpell(reducers, { type: "Creature", mana: "{1}{R}{G}", colors: ["R", "G"] })).toBe(1);
  });
  it("a blue spell is NOT reduced", () => {
    expect(costReductionForSpell(reducers, { type: "Instant", mana: "{1}{U}", colors: ["U"] })).toBe(0);
  });
  it("colors derive from the mana cost when no `colors` array is present", () => {
    expect(costReductionForSpell(reducers, { type: "Sorcery", mana: "{2}{R}" })).toBe(1);
  });
});

describe("CHOSEN-TYPE — costReductionForSpell + collect pairs the source's chosenType", () => {
  it("a chosen-type reducer paired with source chosenType Elf reduces an Elf spell, not a Goblin", () => {
    const reducers = collectCostReducers([{ card: URZAS_INCUBATOR(), chosenType: "Elf" }]);
    expect(reducers).toEqual([{ chosenType: true, amount: 2, sourceChosenType: "Elf" }]);
    expect(costReductionForSpell(reducers, { type: "Creature — Elf Warrior" })).toBe(2);
    expect(costReductionForSpell(reducers, { type: "Creature — Goblin" })).toBe(0);
  });
  it("a changeling spell matches ANY chosen type", () => {
    const reducers = collectCostReducers([{ card: URZAS_INCUBATOR(), chosenType: "Elf" }]);
    expect(costReductionForSpell(reducers, { type: "Creature — Shapeshifter", keywords: ["Changeling"] })).toBe(2);
  });
  it("INERT: a chosen-type reducer whose source has NO chosenType reduces nothing (never fabricates a type)", () => {
    const reducers = collectCostReducers([{ card: URZAS_INCUBATOR(), chosenType: null }]);
    expect(costReductionForSpell(reducers, { type: "Creature — Elf" })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// COVERAGE flips (intended) + PARKED (no flip)
// ════════════════════════════════════════════════════════════════════════════════
describe("coverage — intended flips", () => {
  it("Ghalta (self-metric + Trample only) → native-body", () => {
    expect(classifyCard(GHALTA())).toBe("native-body");
  });
  it("Urza's Incubator (chooser + chosen-type reducer only) → native-static", () => {
    expect(classifyCard(URZAS_INCUBATOR())).toBe("native-static");
  });
  it("Goblin Anarchomancer (color reducer, vanilla body) → native-static", () => {
    expect(classifyCard(ANARCHOMANCER())).toBe("native-static");
  });
  it("Ruby Medallion (single-color reducer, vanilla body) → native-static", () => {
    expect(classifyCard(RUBY_MEDALLION())).toBe("native-static");
  });
});

describe("coverage — PARKED carriers (no flip; the runtime still reduces their cast)", () => {
  it("The Great Henge (mana ability + ETB trigger) stays non-native", () => {
    expect(classifyCard(GREAT_HENGE())).not.toBe("native-body");
    expect(classifyCard(GREAT_HENGE())).not.toBe("native-static");
  });
  it("Cavern-Hoard Dragon (combat-damage Treasure trigger) stays non-native", () => {
    expect(classifyCard(CAVERN_HOARD())).not.toBe("native-body");
  });
  it("Excalibur (Equip + equipped bonus) stays non-native", () => {
    expect(classifyCard(EXCALIBUR())).not.toBe("native-body");
  });
  it("Herald's Horn (upkeep look-trigger) stays non-native", () => {
    expect(classifyCard(HERALDS_HORN())).not.toBe("native-static");
  });
  it("Morophon (colored reduction PARKED) stays non-native", () => {
    expect(classifyCard(MOROPHON())).not.toBe("native-static");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ENGINE — the cast-site reduction (exact reduced costs; CREED guards)
// ════════════════════════════════════════════════════════════════════════════════
describe("ENGINE — self-metric + color + chosen-type cast actions", () => {
  function mkState({ hand = [], battlefield = [], command = [], mana = {}, oppBattlefield = [] }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana }, hand, battlefield, command },
        ai: { ...base.players.ai, battlefield: oppBattlefield },
      },
    };
  }
  const castActions = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
  const bear = (n, p = 2) => createPermanent({ card: { name: "Bear" + n, type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: p, toughness: 2 }, controller: "user" });

  // ── Ghalta: {10}{G}{G}, X = total power ──
  it("Ghalta with 8 total power on board costs {2}{G}{G} (generic 2), MV unchanged at 12", () => {
    const ghalta = { ...GHALTA(), id: "g1" };
    const a = castActions(mkState({ hand: [ghalta], battlefield: [bear(1), bear(2), bear(3), bear(4)], mana: { G: 99 } }), "g1")[0];
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(2);   // {10} − 8 = {2}; the {G}{G} pips are untouched
    expect(a.cost.G).toBe(2);         // CREED: the two green pips REMAIN (never reduced)
    expect(a.cmc).toBe(12);           // CR 202.3 — MV stays the printed 12
  });
  it("Ghalta with 12 total power floors the generic at {0}; the {G}{G} pips still REMAIN (never free)", () => {
    const ghalta = { ...GHALTA(), id: "g1" };
    const a = castActions(mkState({ hand: [ghalta], battlefield: Array.from({ length: 6 }, (_, i) => bear(i + 1)), mana: { G: 99 } }), "g1")[0];
    expect(a.cost.generic).toBe(0);   // max(0, 10 − 12)
    expect(a.cost.G).toBe(2);         // CREED: the colored pips are NEVER reduced — it is NOT cast for free
  });
  it("Ghalta with no creatures pays its printed {10}{G}{G}", () => {
    const ghalta = { ...GHALTA(), id: "g1" };
    const a = castActions(mkState({ hand: [ghalta], battlefield: [], mana: { G: 99 } }), "g1")[0];
    expect(a.cost.generic).toBe(10);
    expect(a.cost.G).toBe(2);
  });
  it("CREED — Ghalta is UNCASTABLE when its colored pips can't be paid (8 power → {2}{G}{G}, but only {2} generic mana, no green)", () => {
    const ghalta = { ...GHALTA(), id: "g1" };
    // The reduction zeroes the generic, but the {G}{G} pips remain unpaid → no legal cast (never a free cast).
    const acts = castActions(mkState({ hand: [ghalta], battlefield: Array.from({ length: 6 }, (_, i) => bear(i + 1)), mana: { C: 5 } }), "g1");
    expect(acts.length).toBe(0);
  });
  it("Ghalta reads LIVE power — a +1/+1 counter on a creature raises the reduction", () => {
    const ghalta = { ...GHALTA(), id: "g1" };
    const buffed = bear(1); buffed.counters = { "+1/+1": 3 }; // printed 2 + 3 = 5 live power
    const a = castActions(mkState({ hand: [ghalta], battlefield: [buffed], mana: { G: 99 } }), "g1")[0];
    expect(a.cost.generic).toBe(5);   // {10} − 5
  });

  // ── The Great Henge: {7}{G}{G}, X = greatest power ──
  it("The Great Henge with a 5-power creature costs {2}{G}{G} (greatest = 5)", () => {
    const henge = { ...GREAT_HENGE(), id: "h1" };
    const big = createPermanent({ card: { name: "Big", type: "Creature — Beast", mana: "{4}{G}", oracle: "", power: 5, toughness: 5 }, controller: "user" });
    const a = castActions(mkState({ hand: [henge], battlefield: [bear(1), big], mana: { G: 99 } }), "h1")[0];
    expect(a.cost.generic).toBe(2);   // {7} − 5
    expect(a.cost.G).toBe(2);
  });

  // ── Cavern-Hoard Dragon: {7}{R}{R}, X = greatest # artifacts an opponent controls ──
  it("Cavern-Hoard Dragon with an opponent on 3 artifacts costs {4}{R}{R}", () => {
    const cavern = { ...CAVERN_HOARD(), id: "c1" };
    const oppArt = (n) => createPermanent({ card: { name: "Rock" + n, type: "Artifact", mana: "{2}", oracle: "" }, controller: "ai" });
    const a = castActions(mkState({ hand: [cavern], mana: { R: 99 }, oppBattlefield: [oppArt(1), oppArt(2), oppArt(3)] }), "c1")[0];
    expect(a.cost.generic).toBe(4);   // {7} − 3
    expect(a.cost.R).toBe(2);         // CREED: the {R}{R} pips remain
  });
  it("Cavern-Hoard Dragon with no opponent artifacts pays its printed {7}", () => {
    const cavern = { ...CAVERN_HOARD(), id: "c1" };
    const a = castActions(mkState({ hand: [cavern], mana: { R: 99 } }), "c1")[0];
    expect(a.cost.generic).toBe(7);
  });

  // ── Excalibur: {12}, X = total MV of historic permanents ──
  it("Excalibur with historic permanents (Sol Ring MV1 + a legendary creature MV4) costs {7}; a non-historic creature is excluded", () => {
    const excal = { ...EXCALIBUR(), id: "e1" };
    const bf = [
      createPermanent({ card: { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, oracle: "" }, controller: "user" }),
      createPermanent({ card: { name: "Legend", type: "Legendary Creature — Human", mana: "{3}{W}", cmc: 4, oracle: "", power: 2, toughness: 2 }, controller: "user" }),
      createPermanent({ card: { name: "Plain Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, oracle: "", power: 2, toughness: 2 }, controller: "user" }), // NOT historic
    ];
    const a = castActions(mkState({ hand: [excal], mana: { C: 99 }, battlefield: bf }), "e1")[0];
    expect(a.cost.generic).toBe(7);   // {12} − (1 + 4 historic MV) = 7; the non-historic Bear's MV 2 is NOT counted
  });

  // ── Goblin Anarchomancer: a red OR green spell ──
  it("Goblin Anarchomancer reduces a red spell {3}{R} → {2}{R}, leaves a blue spell {3}{U} untouched", () => {
    const anarch = createPermanent({ card: ANARCHOMANCER(), controller: "user" });
    const red = { id: "r1", name: "Red", type: "Sorcery", mana: "{3}{R}", oracle: "Deal 3 damage to any target.", colors: ["R"] };
    const blue = { id: "b1", name: "Blue", type: "Sorcery", mana: "{3}{U}", oracle: "Draw 2 cards.", colors: ["U"] };
    const s = mkState({ hand: [red, blue], battlefield: [anarch], mana: { R: 99, U: 99, G: 99 } });
    expect(castActions(s, "r1")[0].cost.generic).toBe(2); // red reduced
    expect(castActions(s, "b1")[0].cost.generic).toBe(3); // blue untouched
  });

  // ── Urza's Incubator: a chosen-type creature ──
  it("Urza's Incubator (chosenType Elf via ETB auto-pick) reduces an Elf creature {3}{G} → {1}{G}, leaves a Goblin untouched", () => {
    // Seed an Elf on the battlefield so the ETB auto-pick chooses Elf, then enter the Incubator.
    let s = mkState({ battlefield: [createPermanent({ card: { name: "Elf Tok", type: "Creature — Elf", mana: "{G}", oracle: "", power: 1, toughness: 1 }, controller: "user" })], mana: { G: 99 } });
    s = enterPermanent(s, { ...URZAS_INCUBATOR(), id: "inc1" }, "user");
    const inc = s.players.user.battlefield.find((p) => p.card.name === "Urza's Incubator");
    expect(inc.chosenType).toBe("Elf");
    const elf = { id: "elf1", name: "Elf Warrior", type: "Creature — Elf Warrior", mana: "{3}{G}", oracle: "", power: 2, toughness: 2 };
    const gob = { id: "gob1", name: "Goblin Guy", type: "Creature — Goblin", mana: "{3}{R}", oracle: "", power: 2, toughness: 2 };
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [elf, gob], manaPool: { ...s.players.user.manaPool, G: 99, R: 99 } } } };
    expect(castActions(s, "elf1")[0].cost.generic).toBe(1); // {3} − 2
    expect(castActions(s, "elf1")[0].cost.G).toBe(1);       // CREED: the {G} pip remains
    expect(castActions(s, "gob1")[0].cost.generic).toBe(3); // off-type — untouched
  });
});

// ── LIFE-BELOW-START cast-site evaluation (Shadow of Mortality, SHELF S7) ──
describe("LIFE-BELOW-START — cast-site reduction", () => {
  const SHADOW = { id: "sh1", name: "Shadow of Mortality", type: "Creature — Avatar", mana: "{13}{B}{B}", power: 7, toughness: 7,
    oracle: "If your life total is less than your starting life total, this spell costs {X} less to cast, where X is the difference." };
  it("at 25 life (started 40): {13} generic − 15 → floored at 0; at full life: untouched", async () => {
    const { createGameState } = await import("./gameState.js");
    const { legalActionsForPlayer } = await import("./legalChoices.js");
    const mk = (life) => {
      const s0 = createGameState({ userDeck: [], aiDeck: [] });
      return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
        players: { ...s0.players, user: { ...s0.players.user, life, hand: [SHADOW], manaPool: { ...s0.players.user.manaPool, B: 99, C: 99 } } } };
    };
    const cast = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sh1");
    expect(cast(mk(25)).cost.generic).toBe(0);  // 40−25=15 ≥ 13 → generic fully erased ({B}{B} pips remain)
    expect(cast(mk(25)).cost.B).toBe(2);
    expect(cast(mk(40)).cost.generic).toBe(13); // at starting life the condition is false → full price
  });
});
