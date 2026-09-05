/**
 * FIST OF SUNS — "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." (Fist of Suns · Jodah,
 * Archmage Eternal). Residue census 2026-09-05 (RG-5): a 3-sole-blocker family, one sentence.
 *
 * CR 118.9 — a board-granted alternative cost. The hand-cast enumeration offers a second cast variant whose COST is the five
 * pips (the normal payment path pays it — never the altCost branch, which pays no mana); the printed-cost action survives
 * beside it only when it is itself payable. Hand casts only, never an X spell, never a free cast; the five pips must be payable
 * right now. Controller-scoped: only the carrier's controller gets the offer.
 *
 * Mutation-checked: see the run ledger (docs-rg5).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FIST = { id: "c-fist", name: "Fist of Suns", type: "Artifact", mana: "{3}", keywords: [], oracle: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." };
const JODAH = { id: "c-jodah", name: "Jodah, Archmage Eternal", type: "Legendary Creature — Human Wizard", mana: "{1}{U}{R}{W}", power: 4, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nYou may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." };
const FATTY = { id: "c-fat", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: 6, toughness: 4, keywords: [], oracle: "" };
const basic = (name, id) => createPermanent({ id, card: { id: "c-" + id, name, type: `Basic Land — ${name}`, mana: "", keywords: [], oracle: "" }, controller: "user" });

function board({ fist = true, lands = ["Plains", "Island", "Swamp", "Mountain", "Forest"] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [...(fist ? [createPermanent({ id: "fist", card: FIST, controller: "user" })] : []), ...lands.map((n, i) => basic(n, `l${i}`))];
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [FATTY], library: [] } } };
}
const castsFor = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c-fat");

describe("the classifier", () => {
  it("both carriers read native", () => {
    const row = { fist: classifyCard(FIST), jodah: classifyCard(JODAH) };
    console.log("  WITNESS fistOfSuns", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the five-pip variant at the cast site", () => {
  it("five basics + Fist: the six-drop is castable ONLY through the WUBRG variant, and dispatching it taps all five; no Fist → no cast; four basics → no cast", () => {
    const s = board();
    const offered = castsFor(s);
    const variant = offered.find((a) => a.altManaCost === "wubrg");
    const after = variant ? dispatchAction(s, variant) : null;
    const row = { offered: offered.length, plain: offered.filter((a) => !a.altManaCost).length, cost: variant ? { W: variant.cost.W, U: variant.cost.U, B: variant.cost.B, R: variant.cost.R, G: variant.cost.G, generic: variant.cost.generic } : null,
      stacked: after ? after.stack.length : null, tapped: after ? after.players.user.battlefield.filter((p) => p.tapped && /Land/.test(p.card.type)).length : null,
      noFist: castsFor(board({ fist: false })).length, fourLands: castsFor(board({ lands: ["Plains", "Island", "Swamp", "Mountain"] })).length };
    console.log("  WITNESS fistOfSunsRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: 1, plain: 0, cost: { W: 1, U: 1, B: 1, R: 1, G: 1, generic: 0 }, stacked: 1, tapped: 5, noFist: 0, fourLands: 0 });
  });
});
