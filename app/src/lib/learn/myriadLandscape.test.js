/**
 * myriadLandscape.test.js — Myriad Landscape (the play-weighted program's first card, 2026-10-01: EDHREC rank #28).
 *
 *   "This land enters tapped. / {T}: Add {C}. / {2}, {T}, Sacrifice this land: Search your library for up to two basic land
 *    cards that share a land type, put them onto the battlefield tapped, then shuffle."
 *
 * The up-to-two land fetch already chained its picks; the rider is what was missing: the second pick may only be a basic
 * land sharing a land type with the first (CR 205.3i — a land's subtypes are its land types). Snow-Covered Forest shares
 * Forest with Forest; Wastes has no land type, so nothing can follow it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MYRIAD = { name: "Myriad Landscape", type: "Land", mana: "", keywords: [],
  oracle: "This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const SNOW_FOREST = { name: "Snow-Covered Forest", type: "Basic Snow Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "({T}: Add {U}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], oracle: "{T}: Add {C}." };

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user,
      battlefield: [createPermanent({ id: "MYRIAD", card: { ...MYRIAD, id: "c-myriad" }, controller: "user", summoningSick: false })],
      library: [["f1", FOREST], ["isl", ISLAND], ["f2", FOREST], ["snow", SNOW_FOREST], ["wastes", WASTES]].map(([id, c]) => ({ ...c, id })),
      manaPool: { ...g.players.user.manaPool, C: 2 } } } };
}
/** Activate the fetch through the real offer and resolve it: the state waits on the first pick. */
function activate(s) {
  const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "MYRIAD");
  if (acts.length !== 1) throw new Error(`expected exactly the fetch on Myriad Landscape, got ${acts.length}`);
  const n = resolveTopOfStack(dispatchAction(s, acts[0]));
  if (n.pendingChoice?.kind !== "tutor-search") throw new Error("the fetch did not open a search");
  return n;
}
/** Pick `first`; then the second pick's offer, and the state after taking `second` (or declining with null). */
function fetch(first, second) {
  const s1 = resolveTutorChoice(activate(table()), first);
  const offered = s1.pendingChoice?.kind === "tutor-search" ? s1.pendingChoice.candidates.map((c) => c.id).sort() : [];
  const s2 = s1.pendingChoice?.kind === "tutor-search" ? resolveTutorChoice(s1, second) : s1;
  return { offered, s: s2 };
}
const fetched = (s) => s.players.user.battlefield.filter((p) => p.card?.name !== "Myriad Landscape").map((p) => ({ id: p.card.id, tapped: !!p.tapped })).sort((a, b) => a.id.localeCompare(b.id));

describe("the card", () => {
  it("reads as a covered land; the fetch carries the share-a-land-type rider", () => {
    expect({ tier: classifyCard(MYRIAD), atoms: parseEffectClause("Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.", "Instant").atoms })
      .toEqual({ tier: "land", atoms: [{ op: "tutor", filter: { groups: [["basic", "land"]], shareLandType: true }, filterLabel: "basic land card (sharing a land type)", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null }] });
  });

  it("fence (synthetic): the rider on a creature fetch stays unread", () => {
    expect(parseEffectClause("Search your library for up to two creature cards that share a land type, put them onto the battlefield, then shuffle.", "Sorcery")?.confidence ?? "low").toBe("low");
  });
});

describe("in play", () => {
  it("Forest first: the second pick offers only the cards sharing Forest, and both enter tapped (WITNESS)", () => {
    const { offered, s } = fetch("f1", "snow");
    const witness = { offered, fetched: fetched(s), graveyard: s.players.user.graveyard.map((c) => c.name), library: s.players.user.library.map((c) => c.id).sort() };
    console.log(`WITNESS myriadLandscape ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ offered: ["f2", "snow"], fetched: [{ id: "f1", tapped: true }, { id: "snow", tapped: true }], graveyard: ["Myriad Landscape"], library: ["f2", "isl", "wastes"] });
  });

  it("an Island has no partner here, and Wastes has no land type: either way the search ends at one land", () => {
    const island = fetch("isl", null);
    const wastes = fetch("wastes", null);
    expect({ islandOffered: island.offered, islandFetched: fetched(island.s).map((f) => f.id), wastesOffered: wastes.offered, wastesFetched: fetched(wastes.s).map((f) => f.id) })
      .toEqual({ islandOffered: [], islandFetched: ["isl"], wastesOffered: [], wastesFetched: ["wastes"] });
  });
});
