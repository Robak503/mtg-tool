/**
 * outlastKeyword.test.js — OUTLAST (CR 702.107a) expanded into the ability it IS.
 *
 * "Outlast [cost]" means "[cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."
 * Every part of that expansion was ALREADY modeled — the counter atom, the {T}, the sorcery-timing gate — and
 * writing the sentence out by hand classified native-activated before this slice existed. The keyword needed
 * no new machinery, only to be said in words the parser already knew. Same shape as the aftermath slice.
 *
 * ⛔ AND THIS FILE EXISTS BECAUSE A PIN DEMANDED IT. optionalModeKeywords.test.js refused outlast with the
 * warning that "crediting it would claim a card plays natively while the engine never offers the ability at
 * all" — a metric-only flip, the exact false positive this project forbids. So the offer is asserted
 * END-TO-END through legalActionsForPlayer, not inferred from the parse.
 *
 * ⚠️ MY FIRST ATTEMPT AT THAT ASSERTION REPORTED "NOT OFFERED" AND WAS WRONG. The state I built had
 * phase "beginning" and priorityHolder null, so legalActionsForPlayer returned ZERO actions of any kind and
 * every card looked broken. The positive control below — a written-out ability that has always worked —
 * is what exposed the harness rather than the engine, and it stays in the file for the next reader.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseActivatedAbilities, expandOutlastLines } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OUTLAST = "Outlast {W} ({W}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.)";
const WRITTEN_OUT = "{W}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.";
const creature = (oracle, name = "Test") => ({ id: "c", name, type: "Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 3, oracle });

// A real priority window — active player, priority held, precombat main. Without these the action generator
// returns nothing at all, which is what fooled the first version of this file.
const boardWith = (card) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const pr = Object.assign(createPermanent({ id: "p", controller: "user", card }), { summoningSick: false });
  const lands = [1, 2, 3].map((i) => createPermanent({ id: `pl${i}`, controller: "user", card: { id: `pl${i}`, name: "Plains", type: "Basic Land — Plains" } }));
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: [pr, ...lands] } },
  };
};
const activatedFor = (oracle) =>
  (legalActionsForPlayer(boardWith(creature(oracle)), "user") || [])
    .filter((a) => a.kind === "activate-ability" && a.permanentId === "p");

describe("the expansion", () => {
  it("⭐ the keyword line becomes the CR-defined ability, verbatim", () => {
    expect(expandOutlastLines("Outlast {W}").trim())
      .toBe("{W}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.");
  });

  it("⛔ a non-outlast line is untouched, byte-identical", () => {
    expect(expandOutlastLines("Flying")).toBe("Flying");
    expect(expandOutlastLines("{T}: Draw a card.")).toBe("{T}: Draw a card.");
  });

  it("⛔ 'Outlast' with no mana cost is not expanded (no such printing; never invent one)", () => {
    expect(expandOutlastLines("Outlast")).toBe("Outlast");
  });

  it("⭐ the ability parses and is modeled", () => {
    const abs = parseActivatedAbilities(creature(OUTLAST));
    expect(abs).toHaveLength(1);
    expect(abs[0].modeled).toBe(true);
  });

  it("⭐ and the card classifies native", () => {
    expect(classifyCard(creature(OUTLAST))).toMatch(/^native/);
  });
});

describe("⛔⭐ RUNTIME — the engine genuinely OFFERS it, which is what the pin demanded", () => {
  it("⭐⭐ POSITIVE CONTROL — the written-out ability is offered (proves the harness works)", () => {
    // ⚠️ Keep this first. Without it, a zero result below is indistinguishable between "the engine does not
    // offer outlast" and "this test's game state has no priority window" — and the second is what actually
    // happened on the first attempt.
    expect(activatedFor(WRITTEN_OUT)).toHaveLength(1);
  });

  it("⭐ the OUTLAST keyword form is offered identically", () => {
    expect(activatedFor(OUTLAST)).toHaveLength(1);
  });

  it("⛔ and the two produce the same action shape — the keyword is not a second-class path", () => {
    const [kw] = activatedFor(OUTLAST);
    const [plain] = activatedFor(WRITTEN_OUT);
    expect(kw.cost).toEqual(plain.cost);
  });
});

describe("⛔ CREED — the family boundary outlast used to mark", () => {
  it("⭐ reconfigure took the OTHER route out (2026-07-30) — it is ENFORCED now, so it is credited", () => {
    // ⚠️ INVERTED, and the old title said exactly what would have to change: "an activated-ability keyword
    // with NO enforcement is still refused". The enforcement now exists — the attach half rides the equip
    // lane, and CR 702.151b (while attached it is NOT a creature) is a layer-4 removeCardType, the same
    // shape bestow already used. This test's own comment named both routes: "crediting a keyword for being
    // declinable remains forbidden; crediting one because it is genuinely MODELED is the other route."
    // Reconfigure took the second. Runtime proof: reconfigureKeyword.test.js.
    expect(classifyCard({ name: "R", type: "Artifact Creature — Equipment Construct", mana: "{2}", power: 2, toughness: 2, oracle: "Reconfigure {2} ({2}: Attach to target creature you control. Reconfigure only as a sorcery.)" })).toBe("native-equipment");
  });

  it("⛔ and the boundary itself still holds — a keyword with no enforcement is refused", () => {
    // The marker this describe exists for is re-aimed at something still unmodeled, never deleted: a
    // made-up activated-ability keyword the engine neither offers nor enforces must stay parked.
    expect(classifyCard({ name: "Q", type: "Artifact Creature — Equipment Construct", mana: "{2}", power: 2, toughness: 2, oracle: "Glorbulate {2} ({2}: Attach to target creature you control. Glorbulate only as a sorcery.)" })).not.toMatch(/^native/);
  });

  it("⛔ an unmodeled sibling clause still parks an outlast card (whole-card CREED)", () => {
    expect(classifyCard(creature(`${OUTLAST}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });
});
