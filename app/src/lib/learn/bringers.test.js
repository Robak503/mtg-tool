/**
 * THE BRINGERS — "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost." (Bringer of the Blue / Green / White /
 * Black / Red Dawn). Residue census 2026-09-05 (RG-8): a 3-sole-blocker family, one sentence.
 *
 * CR 118.9 — the card's OWN fixed-mana alternative cost. The hand-cast enumeration emits the same cost-variant action RG-5
 * built for Fist of Suns (cost = the pips, paid by the ordinary payment path; the printed-cost action survives beside it only
 * when it is itself payable), keyed on the card's own text. The classifier's permanent lane covers the sentence as modelled
 * residue; castModifiers strips it for a spell's program parse.
 *
 * Bringer of the Red Dawn stays parked: its upkeep is a gain-control effect (Colton's theft veto — never trained).
 *
 * Mutation-checked: see the run ledger (docs-rg8).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ALT = "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost.\nTrample\n";
const BLUE = { id: "c-bbd", name: "Bringer of the Blue Dawn", type: "Creature — Bringer", mana: "{7}{U}{U}", cmc: 9, power: 5, toughness: 5, keywords: ["Trample"], oracle: ALT + "At the beginning of your upkeep, you may draw two cards." };
const GREEN = { id: "c-bgd", name: "Bringer of the Green Dawn", type: "Creature — Bringer", mana: "{7}{G}{G}", cmc: 9, power: 5, toughness: 5, keywords: ["Trample"], oracle: ALT + "At the beginning of your upkeep, you may create a 3/3 green Beast creature token." };
const RED = { id: "c-brd", name: "Bringer of the Red Dawn", type: "Creature — Bringer", mana: "{7}{R}{R}", cmc: 9, power: 5, toughness: 5, keywords: ["Trample"], oracle: ALT + "At the beginning of your upkeep, you may untap target creature and gain control of it until end of turn. That creature gains haste until end of turn." };
// A SHAPE pin for the spell lane (no printed carrier in the census's top rows): the sentence is stripped for the program parse.
const SHAPE_SPELL = { id: "c-shape", name: "Triple Bolt", type: "Instant", mana: "{5}{R}", cmc: 6, keywords: [], oracle: "You may pay {R}{R}{R} rather than pay this spell's mana cost.\nTriple Bolt deals 3 damage to any target." };
const basic = (name, id) => createPermanent({ id, card: { id: "c-" + id, name, type: `Basic Land — ${name}`, mana: "", keywords: [], oracle: "" }, controller: "user" });

function board(lands) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: lands.map((n, i) => basic(n, `l${i}`)), hand: [BLUE], library: [] } } };
}
const castsFor = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c-bbd");

describe("the classifier", () => {
  it("Blue and Green read native; the spell-lane shape reads native; Red stays parked on its gain-control upkeep", () => {
    const row = { blue: classifyCard(BLUE), green: classifyCard(GREEN), shape: classifyCard(SHAPE_SPELL), red: classifyCard(RED) };
    console.log("  WITNESS bringers", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.blue).toMatch(/^native/);
    expect(row.green).toMatch(/^native/);
    expect(row.shape).toMatch(/^native/);
    expect(row.red).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the card's own five-pip variant", () => {
  it("five basics: the nine-drop is castable ONLY through its own WUBRG variant and dispatching it taps all five; four basics → nothing", () => {
    const s = board(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
    const offered = castsFor(s);
    const variant = offered.find((a) => a.altManaCost === "own");
    const after = variant ? dispatchAction(s, variant) : null;
    const row = { offered: offered.length, cost: variant ? { W: variant.cost.W, U: variant.cost.U, B: variant.cost.B, R: variant.cost.R, G: variant.cost.G, generic: variant.cost.generic } : null,
      stacked: after ? after.stack.length : null, tapped: after ? after.players.user.battlefield.filter((p) => p.tapped).length : null, four: castsFor(board(["Plains", "Island", "Swamp", "Mountain"])).length };
    console.log("  WITNESS bringersRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: 1, cost: { W: 1, U: 1, B: 1, R: 1, G: 1, generic: 0 }, stacked: 1, tapped: 5, four: 0 });
  });
});
