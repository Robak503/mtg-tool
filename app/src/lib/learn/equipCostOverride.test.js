/**
 * equipCostOverride.test.js — SHELF CAP12: the equip-cost SET (Puresteel Paladin, Astor, Bearer of Blades).
 *
 *   "Equipment you control have equip {N}."  (+ optionally "as long as you control three or more artifacts")
 *
 * The SIBLING of the equip-cost REDUCTION already modeled (Bureau Headmaster's "Equip abilities you activate
 * cost {1} less to activate" → activatedCostReduction with equipOnly). They are kept as separate markers
 * because they compose differently: a reduction shaves generic mana with a one-mana floor, a SET replaces
 * the cost outright. CR-wise the set GRANTS each Equipment an additional equip ability at the stated cost
 * and leaves the printed one intact, so the offer site takes the CHEAPER of the two.
 *
 * ⛔ THE HOLLOW-CREDIT RISK THIS FILE GUARDS. Coverage credits any clause the static parser emits a
 * descriptor for, so admitting an arbitrary "as long as <anything>" gate would mark cards native whose gate
 * the runtime cannot evaluate — the offer site fails closed and the card is native-on-paper, dead in play.
 * The parse arm therefore admits only the ONE printed gate, measured against the runtime evaluator before
 * it was written. The tests below pin both halves: the gate really opens and closes on the board, and an
 * unrecognized gate produces no descriptor at all.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { parseStaticAbilities, collectEquipCostOverrides, clauseProducesStatic } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PURESTEEL = {
  id: "c-pp", name: "Puresteel Paladin", type: "Creature — Human Knight", mana: "{1}{W}", power: 2, toughness: 2,
  oracle: "Whenever an Equipment you control enters, you may draw a card.\nMetalcraft — Equipment you control have equip {0} as long as you control three or more artifacts.",
};
const ASTOR = {
  id: "c-as", name: "Astor, Bearer of Blades", type: "Legendary Creature — Human Warrior", mana: "{2}{W}{U}", power: 3, toughness: 3,
  oracle: "When Astor enters, look at the top seven cards of your library. You may reveal an Equipment or Vehicle card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nEquipment you control have equip {1}.\nVehicles you control have crew 1.",
};
// A pricey Equipment, so an override is unmistakable in the offered cost.
const HAMMER = {
  id: "c-ch", name: "Colossus Hammer", type: "Artifact — Equipment", mana: "{1}",
  oracle: "Equipped creature gets +10/+10 and loses flying.\nEquip {8}",
};
const PLAIN_ARTIFACT = { id: "c-pa", name: "Plain Rock", type: "Artifact", oracle: "" };

const perm = (id, card, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });
const bear = (id) => createPermanent({ id, card: { id: `${id}-c`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });

/** A main-phase board with a huge mana pool, so cost never hides an offer. */
function board(user) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, manaPool: { ...s.players.user.manaPool, C: 20 } } },
  };
}
const equipActions = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.isEquipAbility);

describe("parse — the SET marker, and the anchored gate", () => {
  it("Puresteel emits a conditional override; Astor an unconditional one", () => {
    expect(parseStaticAbilities(PURESTEEL).find((d) => d.equipCostOverride).equipCostOverride)
      .toEqual({ amount: 0, condition: "you control three or more artifacts" });
    expect(parseStaticAbilities(ASTOR).find((d) => d.equipCostOverride).equipCostOverride)
      .toEqual({ amount: 1, condition: null });
  });

  it("⛔ AN UNRECOGNIZED GATE PRODUCES NO DESCRIPTOR — no hollow credit", () => {
    // The runtime evaluator cannot decide this gate, so admitting it would credit a card the offer site
    // then refuses to act on. No descriptor → the clause is residue → the card parks.
    expect(clauseProducesStatic("Equipment you control have equip {0} as long as you control a Wizard")).toBe(false);
    expect(clauseProducesStatic("Equipment you control have equip {0} as long as it's your turn")).toBe(false);
    // …while the two real printed forms DO produce one.
    expect(clauseProducesStatic("Equipment you control have equip {0} as long as you control three or more artifacts")).toBe(true);
    expect(clauseProducesStatic("Equipment you control have equip {1}")).toBe(true);
  });

  it("the collector gathers overrides off the battlefield with their source", () => {
    const s = board([perm("pp", PURESTEEL), perm("hm", HAMMER)]);
    expect(collectEquipCostOverrides(s.players.user.battlefield))
      .toEqual([{ amount: 0, condition: "you control three or more artifacts", _sourceId: "pp" }]);
  });
});

describe("coverage", () => {
  it("Puresteel Paladin flips native", () => {
    expect(classifyCard(PURESTEEL)).toBe("native-mixed");
  });

  it("FP GUARD — Astor stays body-only: the override is modeled, its other two clauses are not", () => {
    // Its ETB look-at-seven and its "Vehicles you control have crew 1" are both unmodeled, so the card
    // parks whole (CREED — never a partial flip). This is what stops the new marker from carrying a card
    // across on the strength of one recognized line.
    expect(classifyCard(ASTOR)).toBe("body-only");
  });
});

describe("runtime — the offered equip cost actually changes, and the gate really gates", () => {
  it("⭐ THE GATE OPENS at three artifacts: Equip {8} is offered at {0}", () => {
    // Puresteel + Hammer + 2 more artifacts = 3 artifacts (the Hammer itself counts), so metalcraft is on.
    const s = board([perm("pp", PURESTEEL), perm("hm", HAMMER), perm("a1", PLAIN_ARTIFACT), perm("a2", PLAIN_ARTIFACT), bear("bx")]);
    const acts = equipActions(s);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.cmc === 0)).toBe(true);
  });

  it("⭐ THE GATE CLOSES below three: the printed Equip {8} is what's offered", () => {
    // Puresteel + Hammer only = 1 artifact. Without the live gate read this would still offer {0} — which
    // is precisely the failure a classifier-only check cannot see.
    const s = board([perm("pp", PURESTEEL), perm("hm", HAMMER), bear("bx")]);
    const acts = equipActions(s);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.cmc === 8)).toBe(true);
  });

  it("negative control — no Puresteel on board, the printed cost stands", () => {
    const s = board([perm("hm", HAMMER), perm("a1", PLAIN_ARTIFACT), perm("a2", PLAIN_ARTIFACT), bear("bx")]);
    expect(equipActions(s).every((a) => a.cmc === 8)).toBe(true);
  });

  it("Astor's UNCONDITIONAL {1} applies with no artifact count at all", () => {
    const s = board([perm("as", ASTOR), perm("hm", HAMMER), bear("bx")]);
    expect(equipActions(s).every((a) => a.cmc === 1)).toBe(true);
  });

  it("⛔ THE OVERRIDE ONLY EVER MAKES EQUIP CHEAPER — a pricier set is ignored", () => {
    // Astor sets equip {1}; a Sword printed at Equip {0}-equivalent must not be raised to {1}. The
    // comparison is strict, so a tie or a worse override leaves the printed cost alone.
    const CHEAP_EQUIP = { id: "c-ce", name: "Cheap Blade", type: "Artifact — Equipment", mana: "{1}", oracle: "Equipped creature gets +1/+1.\nEquip {0}" };
    const s = board([perm("as", ASTOR), perm("ce", CHEAP_EQUIP), bear("bx")]);
    expect(equipActions(s).every((a) => a.cmc === 0)).toBe(true);
  });

  it("the CHEAPEST applicable override wins when two are out", () => {
    const s = board([perm("as", ASTOR), perm("pp", PURESTEEL), perm("hm", HAMMER), perm("a1", PLAIN_ARTIFACT), bear("bx")]);
    // Astor + Puresteel + Hammer + Plain Rock = 3 artifacts? Astor is not an artifact; Hammer + Rock = 2,
    // so metalcraft is OFF and only Astor's {1} applies.
    expect(equipActions(s).every((a) => a.cmc === 1)).toBe(true);
    // Add one more artifact → metalcraft turns on and Puresteel's {0} undercuts Astor's {1}.
    const s2 = board([perm("as", ASTOR), perm("pp", PURESTEEL), perm("hm", HAMMER), perm("a1", PLAIN_ARTIFACT), perm("a2", PLAIN_ARTIFACT), bear("bx")]);
    expect(equipActions(s2).every((a) => a.cmc === 0)).toBe(true);
  });
});
