/**
 * INCUBATION DRUID — one mana of any TYPE a land you control could produce. SHELF-85 · Phase 3 (Shalai · Zaxara), 2026-09-05.
 * "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three
 * mana of that type instead. / {3}{G}{G}: Adapt 3."
 *
 * The Exotic Orchard / Reflecting Pool family read on the controller's side: manaProduction emits a board-derived colour set
 * (colorsAmongSpec "landsYouControlCouldProduce"), which manaSources resolves LIVE as the union of each controlled land's own
 * production (basics via CR 305.6) and its granted basic types (Urborg). No land that makes anything → the Druid is not
 * offered. The counter-gated "three … instead" is a documented under-read (base amount 1).
 *
 * Mutation-checked: see the run ledger (docs-sk121).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DRUID = { id: "c-id", name: "Incubation Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: 0, toughness: 2, keywords: [],
  oracle: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" };
const FOREST = { id: "c-for", name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "" };
const ISLAND = { id: "c-isl", name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "" };
const URBORG = { id: "c-urb", name: "Urborg, Tomb of Yawgmoth", type: "Legendary Land", mana: "", keywords: [], oracle: "Each land is a Swamp in addition to its other land types." };

function board(lands) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [createPermanent({ id: "druid", card: DRUID, controller: "user", summoningSick: false }),
    ...lands.map((c, i) => createPermanent({ id: `land${i}`, card: c, controller: "user" }))];
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
}
const druidColors = (s) => { const r = manaSources(s, "user").find((m) => m.permanentId === "druid"); return r ? [...r.colors].sort() : null; };

describe("the classifier", () => {
  it("Incubation Druid reads native-mana", () => {
    const row = { tier: classifyCard(DRUID) };
    console.log("  WITNESS incubationDruid", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("native-mana");
  });
});

describe("RUNTIME — the Druid's type set is the controller's lands', live", () => {
  it("Forest + Island → exactly {G, U}; no lands → not offered; an Urborg'd Forest adds the granted Swamp", () => {
    const row = { two: druidColors(board([FOREST, ISLAND])), none: druidColors(board([])), urborg: druidColors(board([URBORG, FOREST])) };
    console.log("  WITNESS incubationDruidRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.two).toEqual(["G", "U"]);
    expect(row.none).toBeNull();
    expect(row.urborg).toEqual(["B", "G"]);
  });
});
