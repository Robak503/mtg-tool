/**
 * quirionRanger.test.js — "Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn."
 * (Quirion Ranger, Scryb Ranger — census rank 51 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * The return-a-land cost (Oboro's "Return a land you control to its owner's hand") refused a subtyped land, so both Rangers parked.
 * The cost now carries a basic land type, and legalChoices' victim filter reads it word-bounded on the type line — a dual printed
 * with the type qualifies, a land without it never does. The untap and the once-each-turn limit were already modeled.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each activation offered by legalActionsForPlayer and paid for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const QUIRION = { name: "Quirion Ranger", type: "Creature — Elf Ranger", mana: "{G}", power: "1", toughness: "1", keywords: [],
  oracle: "Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn." };
const SCRYB = { name: "Scryb Ranger", type: "Creature — Faerie Ranger", mana: "{1}{G}", power: "1", toughness: "1", keywords: ["Flash", "Flying", "Protection"],
  oracle: "Flash\nFlying, protection from blue\nReturn a Forest you control to its owner's hand: Untap target creature. Activate only once each turn." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" };
const POOL = { name: "Breeding Pool", type: "Land — Forest Island",
  oracle: "({T}: Add {G} or {U}.)\nAs Breeding Pool enters, you may pay 2 life. If you don't, it enters tapped." };

const perm = (card, id, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
function board(battlefield) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield, hand: [] } } };
}
const offersFor = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === id);
const returned = (offers) => [...new Set(offers.map((a) => a.returnLandId))].sort();

describe("parse + classification", () => {
  it("the cost carries the Forest subtype; both Rangers classify native", () => {
    expect(parseActivatedAbilities(QUIRION)[0].returnLand).toEqual({ another: false, subtype: "Forest" });
    expect([classifyCard(QUIRION), classifyCard(SCRYB)]).toEqual(["native-activated", "native-activated"]);
  });
});

describe("RUNTIME — only a Forest pays, the untap lands, once a turn", () => {
  it("VACUITY CONTROL — beside only an Island, Quirion Ranger offers nothing", () => {
    expect(offersFor(board([perm(QUIRION, "qr"), perm(ISLAND, "is")]), "qr")).toEqual([]);
  });

  it("⭐ the Forest and the Forest-Island dual pay; the Island never does", () => {
    const victims = returned(offersFor(board([perm(QUIRION, "qr"), perm(FOREST, "fo"), perm(ISLAND, "is"), perm(POOL, "bp")]), "qr"));
    expect(victims).toEqual(["bp", "fo"]);
    console.log(`WITNESS quirionVictims ${JSON.stringify(victims)}`);
  });

  it("⭐ returning the Forest untaps the tapped Llanowar Elves, and the Forest is in hand", () => {
    const s0 = board([perm(QUIRION, "qr"), perm(FOREST, "fo"), perm(ELVES, "el", { tapped: true })]);
    const act = offersFor(s0, "qr").find((a) => a.returnLandId === "fo" && (a.targets || []).some((t) => t.id === "el"));
    expect(act).toBeDefined();
    const s = resolveTopOfStack(dispatchAction(s0, act));
    expect({ elvesTapped: s.players.user.battlefield.find((p) => p.id === "el")?.tapped, forestInHand: s.players.user.hand.some((c) => c.name === "Forest") })
      .toEqual({ elvesTapped: false, forestInHand: true });
  });

  it("⭐ once each turn: with a second Forest still out, the ability is not offered again", () => {
    const s0 = board([perm(QUIRION, "qr"), perm(FOREST, "f1"), perm({ ...FOREST }, "f2"), perm(ELVES, "el", { tapped: true })]);
    const act = offersFor(s0, "qr").find((a) => a.returnLandId === "f1" && (a.targets || []).some((t) => t.id === "el"));
    const s = resolveTopOfStack(dispatchAction(s0, act));
    expect(s.players.user.battlefield.some((p) => p.id === "f2")).toBe(true);
    expect(offersFor(s, "qr")).toEqual([]);
  });

  it("⭐ Scryb Ranger pays the same way: the Forest, never the Island", () => {
    expect(returned(offersFor(board([perm(SCRYB, "sr"), perm(FOREST, "fo"), perm(ISLAND, "is")]), "sr"))).toEqual(["fo"]);
  });
});
