/**
 * SAM, LOYAL ATTENDANT — SHELF-85 · Bumble Flower F6 (2026-09-05). "Partner with Frodo, Adventurous Hobbit / At the beginning
 * of combat on your turn, create a Food token. / Activated abilities of Foods you control cost {1} less to activate." The
 * first two lines were native; the third is the Training Grounds family's marker with a SUBTYPE subject — the parser arm
 * grew three subject classes (lands, artifact tokens, a validated subtype plural) and the runtime gate reads each so a
 * reducer never discounts the wrong ability (a wrong PRICE is the hazard the family's comment names).
 *
 * Mutation-checked: see the run ledger (docs-sk75).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SAM = { name: "Sam, Loyal Attendant", type: "Legendary Creature — Halfling Peasant", mana: "{1}{G}{W}", keywords: [], power: 2, toughness: 2, oracle: "Partner with Frodo, Adventurous Hobbit\nAt the beginning of combat on your turn, create a Food token.\nActivated abilities of Foods you control cost {1} less to activate." };
const perm = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
const food = (id) => perm(id, { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", token: true });
const relic = (id) => perm(id, { name: "Fountain of Youth", type: "Artifact", oracle: "{2}, {T}: You gain 1 life." });
function state(board) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, battlefield: board, manaPool: { ...b.players.user.manaPool, C: 2 } } } };
}
const costOf = (s, id) => { const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === id); return a ? (a.cost?.generic ?? a.cost) : null; };
const red = (oracle) => parseStaticAbilities({ name: "Probe", type: "Creature — Human", oracle }).map((d) => d.activatedCostReduction).filter(Boolean);

describe("parse + classify", () => {
  it("the three new subjects parse to their own descriptors; a non-subtype word stays unmodelled; Sam classifies native-mixed", () => {
    const row = {
      foods: red("Activated abilities of Foods you control cost {1} less to activate."),
      lands: red("Activated abilities of lands you control cost {1} less to activate."),
      tokens: red("Activated abilities of artifact tokens you control cost {1} less to activate."),
      nonsense: red("Activated abilities of widgets you control cost {1} less to activate."),
      tier: classifyCard(SAM),
    };
    console.log("  WITNESS samParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.foods).toEqual([{ amount: 1, subject: "subtype", subtype: "Food" }]);
    expect(row.lands).toEqual([{ amount: 1, subject: "land" }]);
    expect(row.tokens).toEqual([{ amount: 1, subject: "artifactToken" }]);
    expect(row.nonsense).toEqual([]);
    expect(row.tier).toBe("native-mixed");
  });
});

describe("the price at activation", () => {
  it("with Sam out, a Food's own ability costs {1}; a non-Food artifact's ability still costs {2}; without Sam the Food costs {2}", () => {
    const withSam = state([perm("sam", SAM), food("f1"), relic("r1")]);
    const without = state([food("f1"), relic("r1")]);
    const row = { foodWithSam: costOf(withSam, "f1"), relicWithSam: costOf(withSam, "r1"), foodWithout: costOf(without, "f1") };
    console.log("  WITNESS samPrice", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.foodWithSam).toBe(1);
    expect(row.relicWithSam).toBe(2);
    expect(row.foodWithout).toBe(2);
  });
});
