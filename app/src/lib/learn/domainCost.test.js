/**
 * DOMAIN COST REDUCTION — "Domain — This spell costs {1} less to cast for each basic land type among lands you control."
 * (Stratadon · Draco's first line · …). Residue census 2026-09-06: a 3-sole-blocker row on the self cost-reduction lane.
 *
 * The "for each" arm existed; its count parser lacked the domain count. parseSelfCountSource gains {kind:"domain"}; countForSpec
 * counts the DISTINCT basic land types among the controller's lands off the front-face type lines; the Domain label is
 * stripped like Morbid's. Granted basic types (Urborg) are not counted — a documented under-read.
 *
 * Mutation-checked: see the run ledger (docs-rg9).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STRATADON = { id: "c-strat", name: "Stratadon", type: "Artifact Creature — Beast", mana: "{10}", cmc: 10, power: 5, toughness: 5, keywords: ["Trample"],
  oracle: "Domain — This spell costs {1} less to cast for each basic land type among lands you control.\nTrample" };
const basic = (name, id) => createPermanent({ id, card: { id: "c-" + id, name, type: `Basic Land — ${name}`, mana: "", keywords: [], oracle: "" }, controller: "user" });

function board(lands) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 7,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: lands.map((n, i) => basic(n, `l${i}`)), hand: [STRATADON], library: [] } } };
}
const cast = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-strat");

describe("the classifier", () => {
  it("Stratadon reads native", () => {
    const row = { tier: classifyCard(STRATADON) };
    console.log("  WITNESS domainCost", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — the reduction counts DISTINCT basic types", () => {
  it("five basics of five types: {10} becomes {5} and the five lands cast it; five basics of FOUR types: {6} — not castable", () => {
    const five = cast(board(["Plains", "Island", "Swamp", "Mountain", "Forest"]));
    const four = cast(board(["Forest", "Island", "Swamp", "Mountain", "Forest"]));
    const row = { fiveOffered: !!five, fiveGeneric: five?.cost?.generic ?? null, fourOffered: !!four };
    console.log("  WITNESS domainCostRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fiveOffered: true, fiveGeneric: 5, fourOffered: false });
  });
  it("the LAYER side reads the same count: Strength of Unity on a Bear with two basic types among three lands is a 4/4 (the first snapshot's hollow — the Aura classified native while the layer engine read no bonus)", () => {
    const SOU = { id: "c-sou", name: "Strength of Unity", type: "Enchantment — Aura", mana: "{3}{W}", keywords: [], oracle: "Enchant creature\nDomain — Enchanted creature gets +1/+1 for each basic land type among lands you control." };
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const host = { ...createPermanent({ id: "host", card: { id: "c-host", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user" }), attachments: ["aura"] };
    const aura = { ...createPermanent({ id: "aura", card: SOU, controller: "user" }), attachedTo: "host" };
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, aura, basic("Plains", "l1"), basic("Island", "l2"), basic("Plains", "l3")] } } };
    const row = { tier: classifyCard(SOU), power: permanentPower(s, "host"), toughness: permanentToughness(s, "host") };
    console.log("  WITNESS domainAura", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ tier: "native-aura", power: 4, toughness: 4 });
  });
});
