/**
 * extraManaLines.test.js — STAGE ④-3 (2026-09-03): the multi-line-mana correction's RUNTIME half. The mana model
 * offered one product per card; a land's second "{T}: Add …" line never fired (114 lands, 55 credited "land"
 * — the 04:50 correction). Now a second line is offered as its own source record when it is complete and
 * rider-free (optionally gated), the planner never taps a permanent twice through two lines, and the
 * "this land entered this turn" condition is readable so the Gathering Place cycle's gate works.
 * A Law-6 slice: it moves the corpus number by nothing and changes what the engine can PLAY.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaSources, planPayment, extraManaLineProducts, manaProduction } from "./manaModel.js";
import { evaluateInterveningIf, activationConditionParseable } from "./interveningIf.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", mana: "", keywords: [], oracle });
const TAINTED_ISLE = L("Tainted Isle", "{T}: Add {C}.\n{T}: Add {U} or {B}. Activate only if you control a Swamp.");
const GATHERING_PLACE = L("Gathering Place", "{T}: Add {C}.\n{T}: Add {G} or {W}. Activate only if this land entered this turn or if you control a basic land.");
const GRAND_COLISEUM = L("Grand Coliseum", "{T}: Add {C}.\n{T}: Add one mana of any color. This land deals 1 damage to you.");
const SHIVAN_REEF = L("Shivan Reef", "{T}: Add {C}.\n{T}: Add {U} or {R}. This land deals 1 damage to you.");
const ANCIENT_SPRING = L("Ancient Spring", "{T}: Add {U}.\n{T}, Sacrifice this land: Add {W}{B}.");
const SWAMP = { id: "c-swamp", name: "Swamp", type: "Basic Land — Swamp", mana: "", oracle: "({T}: Add {B}.)" };
const FOREST = { id: "c-forest", name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };

function board(perms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user: { ...s0.players.user, battlefield: perms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card, controller: "user", summoningSick: false }), enteredOnTurn: 2, ...extra });
const recordsOf = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id).map((r) => ({ colors: [...r.colors].sort(), sacrifices: !!r.sacrifices, extra: !!r.extraLine }));
const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

describe("which second lines are admitted", () => {
  it("a gated colour line (Tainted Isle) and a free colourless line beside a painful any-colour line (Grand Coliseum)", () => {
    expect(extraManaLineProducts(TAINTED_ISLE, manaProduction(TAINTED_ISLE)).map((p) => p.colors)).toEqual([["U", "B"]]);
    expect(extraManaLineProducts(TAINTED_ISLE, manaProduction(TAINTED_ISLE))[0].activationCondition).toBe("you control a Swamp");
    // Grand Coliseum: the whole-card merge used to hand out a PAINLESS any-colour tap; the honest main is the plain
    // {C} line, and the painful any-colour line stays unmodelled (its rider has no single-line reader) — FN-safe.
    expect(manaProduction(GRAND_COLISEUM).colors).toEqual(["C"]);
    expect(extraManaLineProducts(GRAND_COLISEUM, manaProduction(GRAND_COLISEUM))).toEqual([]);
  });

  it("⛔ the honest main: Ancient Spring's plain tap is NOT a sacrifice; Shivan Reef's merged pain product is untouched", () => {
    const spring = manaProduction(ANCIENT_SPRING);
    expect(spring.colors).toEqual(["U"]);
    expect(!!spring.sacrifices).toBe(false);
    const reef = manaProduction(SHIVAN_REEF);
    expect([...reef.colors].sort()).toEqual(["C", "R", "U"]);
    expect(reef.painColors).toEqual(["U", "R"]);
  });

  it("⛔ a rider-bearing line is never admitted (a painland's coloured line, a pay-life line, a mana-COSTED counter-removal line)", () => {
    expect(extraManaLineProducts(SHIVAN_REEF, manaProduction(SHIVAN_REEF))).toEqual([]);
    const payLife = L("Caves of Koilos-ish", "{T}: Add {C}.\n{T}, Pay 1 life: Add {W} or {B}.");
    expect(extraManaLineProducts(payLife, manaProduction(payLife))).toEqual([]);
    // The tap-only "Remove any number of storage counters" line IS admitted since STAGE ④-4 (counterRemovalMana.test.js);
    // the {1}-costed Steppe form stays refused — the planner has no mana-costed source.
    const steppe = L("Saltcrusted Steppe", "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{1}, Remove X storage counters from this land: Add X mana in any combination of {G} and/or {W}.");
    expect(extraManaLineProducts(steppe, manaProduction(steppe))).toEqual([]);
  });

  it("a plain line printed FIRST is still an extra when the merged main chose the other line's colours (the free {C} tap)", () => {
    const anyPlain = L("City of Brass-ish", "{T}: Add {C}.\n{T}: Add one mana of any color.");
    expect([...manaProduction(anyPlain).colors].sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(extraManaLineProducts(anyPlain, manaProduction(anyPlain)).map((p) => p.colors)).toEqual([["C"]]);
    // …and a plain line the main already covers is never duplicated (Shivan Reef's colourless line).
    expect(recordsOf(board([perm("reef2", SHIVAN_REEF)]), "reef2")).toHaveLength(1);
  });

  it("⛔ a double-faced land's BACK face line is never an extra on the front (Clearwater // Murkwater Pathway)", () => {
    const pathway = { id: "c-pathway", name: "Clearwater Pathway // Murkwater Pathway", type: "Land // Land", mana: "", keywords: [], oracle: "Clearwater Pathway - Land \n{T}: Add {U}.\n//\nMurkwater Pathway - Land \n{T}: Add {B}." };
    expect(manaProduction(pathway).colors).toEqual(["U"]);
    expect(extraManaLineProducts(pathway, manaProduction(pathway))).toEqual([]);
  });

  it("⛔ a mana-COSTED any-colour line never becomes a free main (Hall of Oracles keeps its plain {C})", () => {
    const hall = L("Hall of Oracles", "{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn.");
    expect(manaProduction(hall).colors).toEqual(["C"]);
    expect(extraManaLineProducts(hall, manaProduction(hall))).toEqual([]);
  });

  it("a 'Sacrifice this land' ritual line is admitted with its sacrifice cost", () => {
    const ex = extraManaLineProducts(ANCIENT_SPRING, manaProduction(ANCIENT_SPRING));
    expect(ex).toHaveLength(1);
    expect(ex[0].sacrifices).toBe(true);
    expect(ex[0].fixed).toEqual({ W: 1, B: 1 });
  });
});

describe("runtime — the sources offered", () => {
  it("⭐ Tainted Isle: {C} always; {U}/{B} only with a Swamp", () => {
    expect(recordsOf(board([perm("isle", TAINTED_ISLE)]), "isle")).toEqual([{ colors: ["C"], sacrifices: false, extra: false }]);
    expect(recordsOf(board([perm("isle", TAINTED_ISLE), perm("sw", SWAMP)]), "isle")).toEqual([{ colors: ["C"], sacrifices: false, extra: false }, { colors: ["B", "U"], sacrifices: false, extra: true }]);
  });

  it("⭐ the planner never taps the Isle twice: {U} is payable, {C}{U} from the Isle alone is not", () => {
    const s = board([perm("isle", TAINTED_ISLE), perm("sw", SWAMP)]);
    const isleOnly = manaSources(s, "user").filter((r) => r.permanentId === "isle");
    const one = planPayment(pool, isleOnly, { generic: 0, W: 0, U: 1, B: 0, R: 0, G: 0 });
    expect(one?.taps).toHaveLength(1);
    expect(one.taps[0].permanentId).toBe("isle");
    expect(one.taps[0].color).toBe("U");
    expect(planPayment(pool, isleOnly, { generic: 1, W: 0, U: 1, B: 0, R: 0, G: 0 })).toBeNull();
  });

  it("Gathering Place: the coloured line is offered when it entered this turn, or with a basic land; not otherwise; never unstamped", () => {
    const gp = (extra) => perm("gp", GATHERING_PLACE, extra);
    const coloured = (s) => recordsOf(s, "gp").some((r) => r.extra);
    expect(coloured(board([gp({ enteredOnTurn: 6 })]))).toBe(true);
    expect(coloured(board([gp({ enteredOnTurn: 3 })]))).toBe(false);
    expect(coloured(board([gp({ enteredOnTurn: 3 }), perm("f", FOREST)]))).toBe(true);
    expect(coloured(board([gp({ enteredOnTurn: null })]))).toBe(false);
    expect(activationConditionParseable("this land entered this turn or if you control a basic land")).toBe(true);
    expect(evaluateInterveningIf(board([gp({ enteredOnTurn: null })]), "this land entered this turn", "user", { sourcePermanentId: "gp" })).toBeNull();
  });

  it("byte-identical where the main product already covers the second line: Shivan Reef has ONE record", () => {
    expect(recordsOf(board([perm("reef", SHIVAN_REEF)], "reef"), "reef")).toHaveLength(1);
  });

  it("a card whose ONLY mana line is gated (Tablet of Compleation) is offered ONCE — gated on its own counters, never duplicated", () => {
    const TABLET = { id: "c-tablet", name: "Tablet of Compleation", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}: Put an oil counter on this artifact.\n{T}: Add {C}. Activate only if this artifact has two or more oil counters on it.\n{1}, {T}: Draw a card. Activate only if this artifact has five or more oil counters on it." };
    const withOil = (n) => board([{ ...perm("tab", TABLET), counters: { oil: n } }]);
    expect(recordsOf(withOil(2), "tab")).toEqual([{ colors: ["C"], sacrifices: false, extra: false }]);
    expect(recordsOf(withOil(1), "tab")).toEqual([]);
  });

  it("⛔ Spawning Bed: a sacrifice merged from a NON-mana line (its quoted token text) never rides the plain tap — one plain record, no sacrifice", () => {
    const BED = L("Spawning Bed", "{T}: Add {C}.\n{6}, {T}, Sacrifice this land: Create three 1/1 colorless Eldrazi Scion creature tokens. They have \"Sacrifice this token: Add {C}.\"");
    expect(!!manaProduction(BED).sacrifices).toBe(false);
    expect(recordsOf(board([perm("bed", BED)]), "bed")).toEqual([{ colors: ["C"], sacrifices: false, extra: false }]);
  });

  it("Ancient Spring: the plain {U} tap and the sacrifice ritual are two records; the plain tap never sacrifices", () => {
    const recs = recordsOf(board([perm("spring", ANCIENT_SPRING)]), "spring");
    expect(recs).toEqual([{ colors: ["U"], sacrifices: false, extra: false }, { colors: ["B", "W"], sacrifices: true, extra: true }]);
  });
});
