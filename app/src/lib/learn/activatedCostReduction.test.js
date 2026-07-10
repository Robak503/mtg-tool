/**
 * activatedCostReduction.test.js — ACTIVATED-ABILITY COST-REDUCTION (Training Grounds; Biomancer's Familiar).
 *
 * "Activated abilities of creatures you control cost {N} less to activate. This effect can't reduce the mana
 * in that cost to less than one mana." A STATIC reducer that shaves the GENERIC portion of a creature-you-
 * control's ACTIVATED ability (CR 118.9 / 601.2f), with the printed one-mana floor. DISTINCT from the
 * "<subtype> spells you cast cost less" CAST reducers — this lever hits the activated-ability payment path.
 *
 * Pieces under test:
 *   1. Parser: the Training Grounds clause → an { activatedCostReduction: { amount } } marker; the floor rider
 *      → an { activatedCostReductionFloor } marker (a modeled no-op). Heartstone ("of creatures" — symmetric,
 *      all players) and Zirda ("Abilities you activate" — different subject) emit NO reducer marker (safe FN).
 *   2. activatedCostReductionForCost math: generic shaved, colored/hybrid/phyrexian never touched, floored so
 *      the total fixed mana stays ≥ 1 ({3}→{1}, {2}→{1} floor, {U} untouched, {1}{U}→{U}).
 *   3. Coverage flip: Training Grounds → "native-static"; Heartstone / Biomancer's Familiar / Zirda → NOT native.
 *   4. Engine: legalActionsForPlayer reduces a creature's activated-ability cost (affordable with less mana);
 *      the reduction is CREATURE-SCOPED (an artifact's ability is untouched) and floors at one mana.
 *
 * Every expected value was confirmed against the live parser + engine + classifier before being written.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  parseStaticAbilities,
  collectActivatedCostReducers,
  activatedCostReductionForCost,
} from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (oracle verified against bundled Scryfall data) ──────────
const TRAINING_GROUNDS = () => ({
  name: "Training Grounds",
  type: "Enchantment",
  mana: "{U}",
  oracle:
    "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.",
});
const BIOMANCERS_FAMILIAR = () => ({
  name: "Biomancer's Familiar",
  type: "Creature — Mutant",
  mana: "{G}{U}",
  oracle:
    "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.\n{T}: The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it.",
});
const HEARTSTONE = () => ({
  name: "Heartstone",
  type: "Artifact",
  mana: "{3}",
  oracle:
    "Activated abilities of creatures cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.",
});
const ZIRDA = () => ({
  name: "Zirda, the Dawnwaker",
  type: "Legendary Creature — Elemental Fox",
  mana: "{1}{R/W}{R/W}",
  oracle:
    "Abilities you activate that aren't mana abilities cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.\n{1}, {T}: Target creature can't block this turn.",
});

// ─── 1. Parser: the reducer marker + the floor no-op ─────────────────────────────

describe("ACTIVATED-COST-REDUCTION — parser marker", () => {
  it("Training Grounds → an activatedCostReduction/2 marker + the floor no-op", () => {
    expect(parseStaticAbilities(TRAINING_GROUNDS())).toEqual([
      { activatedCostReduction: { amount: 2 } },
      { activatedCostReductionFloor: true },
    ]);
  });

  it("Biomancer's Familiar emits the same reducer marker (its {T} adapt-modifier is a separate line)", () => {
    // The reducer clause is modeled; the {T} adapt-modifier is NOT (see the classify block — it stays body-only).
    expect(parseStaticAbilities(BIOMANCERS_FAMILIAR())).toEqual([
      { activatedCostReduction: { amount: 2 } },
      { activatedCostReductionFloor: true },
    ]);
  });

  it("Heartstone ('of creatures' — symmetric, all players) emits NO reducer marker (safe FN)", () => {
    // Only the floor rider matches; the symmetric reducer clause is NOT modeled (you-control-only reader).
    expect(parseStaticAbilities(HEARTSTONE())).toEqual([{ activatedCostReductionFloor: true }]);
  });

  it("Zirda ('Abilities you activate' — different subject) emits NO reducer marker (safe FN)", () => {
    expect(parseStaticAbilities(ZIRDA())).toEqual([{ activatedCostReductionFloor: true }]);
  });

  it("collectActivatedCostReducers gathers only the you-control reducers on a battlefield (Heartstone excluded)", () => {
    // A battlefield of bare cards (the command-zone/battlefield entry shapes collectActivatedCostReducers accepts).
    const bf = [{ card: TRAINING_GROUNDS() }, { card: HEARTSTONE() }, { card: BIOMANCERS_FAMILIAR() }];
    // Two you-control reducers (Training Grounds + Biomancer's Familiar), Heartstone's symmetric one dropped.
    expect(collectActivatedCostReducers(bf)).toEqual([{ amount: 2 }, { amount: 2 }]);
    expect(collectActivatedCostReducers([])).toEqual([]);
  });
});

// ─── 2. activatedCostReductionForCost — the floor math ───────────────────────────

describe("ACTIVATED-COST-REDUCTION — the one-mana floor", () => {
  const reducers = [{ amount: 2 }];
  it("{3} → {1} (2 generic shaved, well above the floor)", () => {
    expect(activatedCostReductionForCost(reducers, parseManaCost("{3}")).generic).toBe(1);
  });
  it("{2} → {1} (the floor bites: never {0} on an all-generic cost)", () => {
    expect(activatedCostReductionForCost(reducers, parseManaCost("{2}")).generic).toBe(1);
  });
  it("{1} → {1} (a lone {1} can't be reduced below one mana)", () => {
    expect(activatedCostReductionForCost(reducers, parseManaCost("{1}")).generic).toBe(1);
  });
  it("{U} → {U} (a fully-colored cost has no generic to shave, floor already satisfied)", () => {
    const out = activatedCostReductionForCost(reducers, parseManaCost("{U}"));
    expect(out.generic).toBe(0);
    expect(out.U).toBe(1);
  });
  it("{1}{U} → {U} (the {U} keeps total mana ≥ 1, so the whole {1} generic is removable)", () => {
    const out = activatedCostReductionForCost(reducers, parseManaCost("{1}{U}"));
    expect(out.generic).toBe(0);
    expect(out.U).toBe(1);
  });
  it("{4} under a stacked 2+1 reduction → {1} (still floored, not {1} vs {0})", () => {
    expect(activatedCostReductionForCost([{ amount: 2 }, { amount: 1 }], parseManaCost("{4}")).generic).toBe(1);
  });
  it("no reducers → the cost is returned unchanged (same object)", () => {
    const c = parseManaCost("{3}");
    expect(activatedCostReductionForCost([], c)).toBe(c);
  });
});

// ─── 3. Coverage flip (the four gates) ───────────────────────────────────────────

describe("ACTIVATED-COST-REDUCTION — classifyCard", () => {
  it("Training Grounds flips to native-static", () => {
    expect(classifyCard(TRAINING_GROUNDS())).toBe("native-static");
  });
  it("Biomancer's Familiar stays body-only (unmodeled {T} adapt-modifier — CREED safe FN)", () => {
    expect(classifyCard(BIOMANCERS_FAMILIAR())).not.toBe("native-static");
    expect(classifyCard(BIOMANCERS_FAMILIAR())).toBe("body-only");
  });
  it("Heartstone stays body-only (symmetric all-players reducer unmodeled — safe FN)", () => {
    expect(classifyCard(HEARTSTONE())).toBe("body-only");
  });
  it("Zirda stays body-only (different subject + Companion + a targeted ability — safe FN)", () => {
    expect(classifyCard(ZIRDA())).toBe("body-only");
  });
});

// ─── 4. Engine — the reduction is real at the activation site ────────────────────

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
function withPool(state, playerId, mana) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana }, library: [{ id: "lib-1", name: "Card" }] },
    },
  };
}
function activateActions(state, playerId = "user") {
  return legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");
}

describe("ACTIVATED-COST-REDUCTION — engine integration", () => {
  it("Training Grounds makes a creature's {3}: Draw a card cost {1} — affordable with a single mana", () => {
    const drawer = createPermanent({
      id: "perm-d",
      card: { id: "card-d", name: "Drawer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{3}: Draw a card." },
      controller: "user",
      summoningSick: false,
    });
    const tg = createPermanent({ id: "perm-tg", card: TRAINING_GROUNDS(), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [drawer, tg]);
    s = withPool(s, "user", { C: 1 }); // exactly {1} of mana available

    const acts = activateActions(s);
    const draw = acts.find((a) => a.permanentId === "perm-d");
    expect(draw).toBeTruthy();                     // offered — {3} reduced to {1}, payable with the one mana
    expect(draw.cost.generic).toBe(1);             // the reduced generic ({3} - 2 = 1)
  });

  it("WITHOUT Training Grounds the same {3} ability is NOT affordable on a single mana (control)", () => {
    const drawer = createPermanent({
      id: "perm-d",
      card: { id: "card-d", name: "Drawer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{3}: Draw a card." },
      controller: "user",
      summoningSick: false,
    });
    let s = withBattlefield(mainState(), "user", [drawer]);
    s = withPool(s, "user", { C: 1 });
    expect(activateActions(s).find((a) => a.permanentId === "perm-d")).toBeFalsy();
  });

  it("CREED near-miss: the reduction is CREATURE-scoped — an ARTIFACT's activated ability is NOT discounted", () => {
    // Training Grounds reduces only "activated abilities of creatures you control". A non-creature source's
    // ability must pay full price; discounting it would be a confident wrong play.
    const rock = createPermanent({
      id: "perm-r",
      card: { id: "card-r", name: "Mana Rock Sink", type: "Artifact", oracle: "{3}: Draw a card." },
      controller: "user",
      summoningSick: false,
    });
    const tg = createPermanent({ id: "perm-tg", card: TRAINING_GROUNDS(), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [rock, tg]);
    s = withPool(s, "user", { C: 1 });
    // Only {1} of mana; the artifact's {3} ability is NOT reduced → unaffordable → not offered.
    expect(activateActions(s).find((a) => a.permanentId === "perm-r")).toBeFalsy();

    // And with {3} available, its cost is the FULL {3} (no reduction applied to the artifact).
    let s3 = withPool(withBattlefield(mainState(), "user", [rock, tg]), "user", { C: 3 });
    const full = activateActions(s3).find((a) => a.permanentId === "perm-r");
    expect(full).toBeTruthy();
    expect(full.cost.generic).toBe(3);
  });

  it("the floor holds at the activation site: a {2}: Draw a card creature keeps a {1} cost, never {0}", () => {
    const drawer = createPermanent({
      id: "perm-d",
      card: { id: "card-d", name: "Cheap Drawer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{2}: Draw a card." },
      controller: "user",
      summoningSick: false,
    });
    const tg = createPermanent({ id: "perm-tg", card: TRAINING_GROUNDS(), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [drawer, tg]);
    s = withPool(s, "user", { C: 1 });
    const draw = activateActions(s).find((a) => a.permanentId === "perm-d");
    expect(draw).toBeTruthy();
    expect(draw.cost.generic).toBe(1); // floored at one mana (not {0})
  });
});

// ── EQUIP-ONLY variant (Bureau Headmaster — "Equip abilities you activate cost {1} less to activate.", SHELF S7) ──
describe("ACTIVATED-COST-REDUCTION — equipOnly (Bureau Headmaster)", () => {
  const BUREAU = () => ({ id: "card-bh", name: "Bureau Headmaster", type: "Creature — Vedalken Advisor", power: 1, toughness: 3,
    oracle: "Equipment spells you cast cost {1} less to cast.\nEquip abilities you activate cost {1} less to activate." });
  const SWORD = () => ({ id: "card-sw", name: "Shortsword", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0.\nEquip {2}" });

  it("classifies native-static (both halves modeled) and shaves the Equip cost {2} → {1}", () => {
    expect(classifyCard(BUREAU())).toBe("native-static");
    const bh = createPermanent({ id: "perm-bh", card: BUREAU(), controller: "user", summoningSick: false });
    const sword = createPermanent({ id: "perm-sw", card: SWORD(), controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "perm-bear", card: { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [bh, sword, bear]);
    s = withPool(s, "user", { C: 1 }); // exactly {1}
    const equip = activateActions(s).find((a) => a.permanentId === "perm-sw");
    expect(equip).toBeTruthy();          // {2} − 1 = {1}, payable
    expect(equip.cost.generic).toBe(1);
  });

  it("CREED near-miss: the equipOnly reducer does NOT discount a creature's normal activated ability", () => {
    const bh = createPermanent({ id: "perm-bh", card: BUREAU(), controller: "user", summoningSick: false });
    const drawer = createPermanent({ id: "perm-d", card: { id: "card-d", name: "Drawer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{3}: Draw a card." }, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [bh, drawer]);
    s = withPool(s, "user", { C: 2 }); // {2} < the unreduced {3}
    expect(activateActions(s).find((a) => a.permanentId === "perm-d")).toBeFalsy();
  });
});
