/**
 * grantedManaAbility.test.js — a mana ability GRANTED to a permanent with none of its own is the quoted ability whole (2026-10-16).
 *
 * The recipient side of a mana grant (manaSources and legalChoices.actionsTapForMana) rebuilt the granted record from `colors` and
 * `amount` alone and forced `requiresTap: true`, so every cost flag the quote carried was dropped. Basal Sliver's
 * "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"" made a Metallic Sliver beside it a {B}{B} source that tapped every
 * turn and was never sacrificed — Mana Reflection doubled it, and it was barred while summoning sick although the ability has no
 * {T}. Ninja Pizza's "Foods you control have \"{T}, Sacrifice this artifact: Add one mana of any color.\"" made every Food a
 * permanent any-colour rock. Cheaper than printed, the forbidden direction. (Basal Sliver itself was right: its own production
 * reads its self-included quote and carries the sacrifice.)
 *
 * The census of every mana grant the parsers emit across the bundled corpus (37 specs on 35,748 cards): 3 carry `sacrifices`.
 * Basal Sliver's and Ninja Pizza's reach recipients with no production of their own — the two phantoms; Goldspan Dragon's reaches
 * only Treasures, which keep their own sacrifice through the supplement. Basal's is the only cost with no {T}. No spec carries a
 * mixed bundle, a spending restriction, a mana activation cost or a life cost — parseGrantedManaSpec refuses each.
 *
 * Now parseGrantedManaSpec records the cost's flags (`sacrifices`, `requiresTap: false` for a cost with no {T}), and both sites
 * read the production through ONE function (manaModel.withGrantedMana → grantedManaProduction), which carries the spec whole.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-10-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, grantedManaProduction, withGrantedMana } from "./manaModel.js";
import { parseGrantedManaSpec, parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const BASAL = {"name":"Basal Sliver","type":"Creature — Sliver","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"","power":"2","toughness":"2"};
const METALLIC = {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const GEMHIDE = {"name":"Gemhide Sliver","type":"Creature — Sliver","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"All Slivers have \"{T}: Add one mana of any color.\"","power":"1","toughness":"1"};
const REFLECTION = {"name":"Mana Reflection","type":"Enchantment","mana":"{4}{G}{G}","cmc":6,"keywords":[],"colors":["G"],"oracle":"If you tap a permanent for mana, it produces twice as much of that mana instead."};
const NINJA_PIZZA = {"name":"Ninja Pizza","type":"Enchantment","mana":"{2}{G}","cmc":3,"keywords":["Food"],"colors":["G"],"oracle":"Foods you control have \"{T}, Sacrifice this artifact: Add one mana of any color.\"\nAt the beginning of your second main phase, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")"};
const SWEETS = {"name":"Night of the Sweets' Revenge","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":["Food"],"colors":["G"],"oracle":"When this enchantment enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nFoods you control have \"{T}: Add {G}.\"\n{5}{G}{G}, Sacrifice this enchantment: Creatures you control get +X/+X until end of turn, where X is the number of Foods you control. Activate only as a sorcery."};
const FOOD = {"name":"Food","type":"Token Artifact — Food","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{2}, {T}, Sacrifice this token: You gain 3 life.","token":true};
const SIGN_IN_BLOOD = {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target player draws two cards and loses 2 life."};
const WUBRG = ["W", "U", "B", "R", "G"];

// perms: [id, card, { tapped, sick }]
function board(perms, hand = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user,
      battlefield: perms.map(([id, card, o = {}]) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", tapped: !!o.tapped, summoningSick: !!o.sick }), enteredOnTurn: o.sick ? 3 : 1 })),
      hand: hand.map((c, i) => ({ ...c, id: `h${i}` })),
      graveyard: [], library: Array.from({ length: 4 }, (_, i) => ({ id: `L${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" })),
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const recordOf = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id);
const tapActions = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const permOf = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const inGraveyard = (s, name) => s.players.user.graveyard.some((c) => c.name === name);

describe("the granted spec is the quoted ability — its cost flags included (parseGrantedManaSpec)", () => {
  it("Basal Sliver's bare self-sacrifice: sacrifices, and no {T} in the cost", () => {
    expect(parseGrantedManaSpec("Sacrifice this permanent: Add {B}{B}.")).toEqual({ colors: ["B"], amount: 2, sacrifices: true, requiresTap: false });
    const grants = parseStaticAbilities(BASAL).filter((d) => d.layer === 6 && d.op?.grant?.kind === "mana");
    expect(grants.map((d) => d.op.grant.spec)).toEqual([{ colors: ["B"], amount: 2, sacrifices: true, requiresTap: false }]);
  });

  it("a {T} cost adds no requiresTap key — Gemhide's shape is unchanged, Ninja Pizza's keeps its sacrifice", () => {
    expect(parseGrantedManaSpec("{T}: Add one mana of any color.")).toEqual({ colors: WUBRG, amount: 1 });
    expect(parseGrantedManaSpec("{T}, Sacrifice this artifact: Add one mana of any color.")).toEqual({ colors: WUBRG, amount: 1, sacrifices: true });
  });
});

describe("grantedManaProduction — the recipient's production is the spec whole", () => {
  it("a Sliver beside Basal: sacrifices, requiresTap false", () => {
    const s = board([["basal", BASAL], ["metal", METALLIC]]);
    expect(grantedManaProduction(s, permOf(s, "metal"))).toEqual({ colors: ["B"], amount: 2, sacrifices: true, requiresTap: false });
  });

  it("a Sliver beside Gemhide taps (requiresTap true, as before)", () => {
    const s = board([["gem", GEMHIDE], ["metal", METALLIC]]);
    expect(grantedManaProduction(s, permOf(s, "metal"))).toEqual({ colors: WUBRG, amount: 1, requiresTap: true });
  });

  it("a Food under Ninja Pizza keeps the sacrifice; the grant's routing marker (`upgrade`) stays behind", () => {
    const s = board([["pizza", NINJA_PIZZA], ["food", FOOD]]);
    expect(grantedManaProduction(s, permOf(s, "food"))).toEqual({ colors: WUBRG, amount: 1, sacrifices: true, requiresTap: true });
  });

  it("withGrantedMana: a permanent with its own production keeps it (Basal itself — never a second record off its own grant)", () => {
    const s = board([["basal", BASAL], ["metal", METALLIC]]);
    const own = manaProduction(BASAL);
    expect(own).toMatchObject({ colors: ["B"], amount: 2, sacrifices: true });
    expect(withGrantedMana(s, permOf(s, "basal"), own)).toBe(own);
    expect(withGrantedMana(s, permOf(s, "metal"), null)).toEqual(grantedManaProduction(s, permOf(s, "metal")));
  });
});

describe("on a board — Basal Sliver's grant sacrifices the Sliver that uses it", () => {
  it("⭐ the planner's record and the explicit tap both say sacrifice (they read one function)", () => {
    const s = board([["basal", BASAL], ["metal", METALLIC]]);
    expect(recordOf(s, "metal")).toEqual([{ permanentId: "metal", colors: ["B"], amount: 2, sacrifices: true }]);
    expect(tapActions(s, "metal").map((a) => [a.color, a.amount, a.sacrifices])).toEqual([["B", 2, true]]);
  });

  it("⭐ the explicit tap sacrifices the RECIPIENT and makes {B}{B} — Basal stays", () => {
    const s = board([["basal", BASAL], ["metal", METALLIC]]);
    const after = dispatchAction(s, tapActions(s, "metal")[0]);
    expect(permOf(after, "metal")).toBeUndefined();
    expect(inGraveyard(after, "Metallic Sliver")).toBe(true);
    expect(permOf(after, "basal")).toBeTruthy();
    expect(after.players.user.manaPool.B).toBe(2);
  });

  it("⭐ paying Sign in Blood with the granted ability sacrifices the Sliver; it is no source afterwards", () => {
    // Basal is tapped so it cannot pay with its own ability — Metallic is the only {B}{B} on the board.
    const s = board([["basal", BASAL, { tapped: true }], ["metal", METALLIC]], [SIGN_IN_BLOOD]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.stack.map((o) => o.source?.name)).toContain("Sign in Blood");
    expect(permOf(after, "metal")).toBeUndefined();
    expect(inGraveyard(after, "Metallic Sliver")).toBe(true);
    const untapped = { ...after, players: { ...after.players, user: { ...after.players.user, battlefield: after.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    expect(recordOf(untapped, "metal")).toEqual([]);
  });

  it("a summoning-sick Sliver may sacrifice for it — the cost has no {T} (CR 302.6); a sick Sliver under Gemhide may not tap", () => {
    const sac = board([["basal", BASAL, { tapped: true }], ["metal", METALLIC, { sick: true }]]);
    expect(recordOf(sac, "metal")).toEqual([{ permanentId: "metal", colors: ["B"], amount: 2, sacrifices: true }]);
    const tap = board([["gem", GEMHIDE, { tapped: true }], ["metal", METALLIC, { sick: true }]]);
    expect(recordOf(tap, "metal")).toEqual([]);
  });

  it("Mana Reflection doubles a granted {T} ability but not the sacrifice — it is not tapping for mana (CR 106.12)", () => {
    const sac = board([["basal", BASAL, { tapped: true }], ["metal", METALLIC], ["refl", REFLECTION]]);
    expect(recordOf(sac, "metal")).toEqual([{ permanentId: "metal", colors: ["B"], amount: 2, sacrifices: true }]);
    const tap = board([["gem", GEMHIDE, { tapped: true }], ["metal", METALLIC], ["refl", REFLECTION]]);
    expect(recordOf(tap, "metal")).toEqual([{ permanentId: "metal", colors: WUBRG, amount: 2, sacrifices: false }]);
  });
});

describe("Ninja Pizza — a Food is cracked, never a rock", () => {
  it("⭐ the Food's record sacrifices, and the explicit tap cracks it", () => {
    const s = board([["pizza", NINJA_PIZZA], ["food", FOOD]]);
    expect(recordOf(s, "food")).toEqual([{ permanentId: "food", colors: WUBRG, amount: 1, sacrifices: true }]);
    const acts = tapActions(s, "food");
    expect(acts.map((a) => a.color)).toEqual(WUBRG);
    expect(acts.every((a) => a.sacrifices === true)).toBe(true);
    const after = dispatchAction(s, acts[0]);
    expect(permOf(after, "food")).toBeUndefined();
  });

  it("Night of the Sweets' Revenge's plain {T} grant stays a repeatable tap — the Food is tapped, not sacrificed", () => {
    const s = board([["sweets", SWEETS], ["food", FOOD]]);
    expect(recordOf(s, "food")).toEqual([{ permanentId: "food", colors: ["G"], amount: 1, sacrifices: false }]);
    const after = dispatchAction(s, tapActions(s, "food")[0]);
    expect(permOf(after, "food")?.tapped).toBe(true);
    expect(after.players.user.manaPool.G).toBe(1);
  });
});
