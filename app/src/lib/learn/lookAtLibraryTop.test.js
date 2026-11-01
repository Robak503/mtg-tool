/**
 * MISHRA'S BAUBLE (EDHREC #1104) — "{T}, Sacrifice this artifact: Look at the top card of target player's library. Draw a card at
 * the beginning of the next turn's upkeep."
 *
 * Two atoms: the look (CR 701.20e — looking is revealing to one player only; the information IS the effect, so the game log carries
 * the card truly, the look-at-hand discipline) at the top card of the TARGET player's library (CR 401.2: no one may look at a library
 * without an instruction), and the delayed draw (CR 603.7 — fired at the very next upkeep step of the game, whoever's turn it is;
 * its controller is the ability's controller, CR 603.7e). The cost is the tap and the sacrifice (CR 602.2b); the Bauble is gone
 * before the ability resolves.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { checkEnterTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const BAUBLE = {"name":"Mishra's Bauble","type":"Artifact","mana":"{0}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this artifact: Look at the top card of target player's library. Draw a card at the beginning of the next turn's upkeep."};
const URZAS_BAUBLE = {"name":"Urza's Bauble","type":"Artifact","mana":"{0}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this artifact: Look at a card at random in target player's hand. You draw a card at the beginning of the next turn's upkeep."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1.\nDraw a card."};

const lib = (pid, top) => [{ ...top, id: `L-${pid}-top` }, ...Array.from({ length: 5 }, (_, i) => ({ ...BEARS, id: `L-${pid}-${i}` }))];
function table({ aiLibrary = lib("ai", OPT) } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players,
    user: { ...s0.players.user, battlefield: [createPermanent({ id: "bauble", card: { ...BAUBLE, id: "c-bauble" }, controller: "user", summoningSick: true })], hand: [], library: lib("user", BEARS) },
    ai: { ...s0.players.ai, battlefield: [], hand: [], library: aiLibrary } };
  return { ...s0, players, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], consecutivePasses: 0 };
}
const baubleActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "bauble");
function activateAt(s, playerId) {
  const a = baubleActs(s).find((x) => (x.targets || []).some((t) => t.type === "player" && t.id === playerId));
  expect(a, `the Bauble aimed at ${playerId}`).toBeTruthy();
  s = flushTriggers(dispatchAction(s, a));
  return resolveTopOfStack(s);
}
const looks = (s) => (s.log || []).filter((e) => e.effect === "look-at-library-top");
/** The next upkeep (the AI's turn 7 — "the next turn's upkeep" is whoever's turn it is), its delayed draw resolved. */
function nextUpkeep(s) {
  let t = nextStep({ ...s, turn: 7, phase: "beginning", step: "untap", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0 });
  if (!t.stack.length) t = flushTriggers(t);
  for (let g = 0; g < 6 && t.stack.length; g++) t = flushTriggers(resolveTopOfStack(t));
  return t;
}

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(BAUBLE))).toBe(true);
  });
  it("CONTROL — Urza's Bauble stays parked (a card at random in a hand is not this look)", () => {
    expect(isNativeTier(classifyCard(URZAS_BAUBLE))).toBe(false);
  });
});

describe("the game", () => {
  it("⭐ offered at either player, with summoning sickness (an artifact's {T} ability, CR 302.6 is a creature rule)", () => {
    expect(baubleActs(table()).flatMap((a) => (a.targets || []).map((t) => t.id)).sort()).toEqual(["ai", "user"]);
  });
  it("⭐ aimed at the opponent: the Bauble is sacrificed, the look names the opponent's top card to its controller, and nothing is drawn yet", () => {
    const s = activateAt(table(), "ai");
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Mishra's Bauble"]);
    expect(looks(s).map((e) => ({ looker: e.looker, player: e.player, card: e.card }))).toEqual([{ looker: "user", player: "ai", card: "Opt" }]);
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.ai.library[0].name).toBe("Opt"); // looking moves nothing
  });
  it("⭐ the draw comes at the next turn's upkeep — the opponent's — and goes to the Bauble's controller", () => {
    const t = nextUpkeep(activateAt(table(), "ai"));
    expect({ user: t.players.user.hand.length, ai: t.players.ai.hand.length }).toEqual({ user: 1, ai: 0 });
  });
  it("⭐ aimed at its controller: the look names its own top card", () => {
    expect(looks(activateAt(table(), "user")).map((e) => e.card)).toEqual(["Grizzly Bears"]);
  });
  it("⭐ an empty library: the look sees nothing, the draw still comes", () => {
    const s = activateAt(table({ aiLibrary: [] }), "ai");
    expect(looks(s).map((e) => e.card)).toEqual([null]);
    expect(nextUpkeep(s).players.user.hand).toHaveLength(1);
  });
});

describe("twins — the same look", () => {
  const OBSERVER = {"name":"Merfolk Observer","type":"Creature — Merfolk Rogue","mana":"{1}{U}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["U"],"oracle":"When this creature enters, look at the top card of target player's library."};
  const MOONRING = {"name":"Moonring Island","type":"Land — Island","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)\nThis land enters tapped.\n{U}, {T}: Look at the top card of target player's library. Activate only if you control two or more blue permanents."};
  const DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying"};
  it("⭐ Merfolk Observer and Moonring Island play their whole text", () => {
    expect({ observer: isNativeTier(classifyCard(OBSERVER)), moonring: classifyCard(MOONRING) }).toEqual({ observer: true, moonring: "land" });
  });
  it("⭐ Merfolk Observer's enters trigger looks at the top card of its controller's own library", () => {
    const s0 = table();
    const obs = createPermanent({ id: "obs", card: { ...OBSERVER, id: "c-obs" }, controller: "user", summoningSick: true });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, obs] } },
      pendingTriggers: [] };
    s = flushTriggers(checkEnterTriggers(s, obs));
    for (let g = 0; g < 4 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s));
    expect(looks(s).map((e) => ({ player: e.player, card: e.card }))).toEqual([{ player: "user", card: "Grizzly Bears" }]);
  });
  it("⭐ Moonring Island's look: offered only while its controller controls two or more blue permanents", () => {
    const offered = (blue) => {
      const s0 = table();
      const bf = [createPermanent({ id: "moon", card: { ...MOONRING, id: "c-moon" }, controller: "user", summoningSick: false }),
        ...Array.from({ length: blue }, (_, i) => createPermanent({ id: `d${i}`, card: { ...DRAKE, id: `c-d${i}` }, controller: "user", summoningSick: false }))];
      const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } } } };
      return legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "moon").length;
    };
    expect({ one: offered(1), two: offered(2) }).toEqual({ one: 0, two: 2 });
  });
});
