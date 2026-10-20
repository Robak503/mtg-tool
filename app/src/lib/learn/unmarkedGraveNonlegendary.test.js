/**
 * UNMARKED GRAVE (EDHREC #1623) — "Search your library for a nonlegendary card, put that card into your graveyard, then shuffle."
 * The fetch-to-graveyard Entomb already reads, with the one quality its filter states: a card without the Legendary supertype (CR
 * 205.4a), of any card type, a land included. The search finds only cards with that quality, and may find nothing (CR 701.23a, 701.23b).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { resolveTutorChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const UNMARKED_GRAVE = {"name":"Unmarked Grave","type":"Sorcery","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Search your library for a nonlegendary card, put that card into your graveyard, then shuffle."}; // arbiter-spell on 0fbdec14
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""};
const JACE_BELEREN = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"power":null,"toughness":null,"keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

function table(library) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...UNMARKED_GRAVE, id: "h-spell" }], library, graveyard: [], battlefield: [], manaPool: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 1 } } } };
}
const castToChoice = (s) => resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-spell")));
const LIBRARY = [{ ...CRAW_WURM, id: "l-wurm" }, { ...ISAMARU, id: "l-isamaru" }, { ...JACE_BELEREN, id: "l-jace" }, { ...LIGHTNING_BOLT, id: "l-bolt" }, { ...FOREST, id: "l-forest" }];

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(UNMARKED_GRAVE)).toBe("native-spell");
  });
  it("⭐ the filter is the nonlegendary gate alone; the gated forms it already read are unchanged", () => {
    expect({
      bare: parseTutorFilter("nonlegendary"),
      bellower: parseTutorFilter("nonlegendary green creature"),
      atom: parseEffectProgram(UNMARKED_GRAVE)?.atoms?.[0] ?? null,
    }).toEqual({
      bare: { groups: [], excludeLegendary: true },
      bellower: { groups: [["creature"]], colors: ["green"], excludeLegendary: true },
      atom: { op: "tutor", filter: { groups: [], excludeLegendary: true }, filterLabel: "nonlegendary card", destination: "graveyard", targetType: null },
    });
  });
});

describe("the search", () => {
  it("⭐ the choice offers every nonlegendary card — the Wurm, the Bolt, the Forest — never Isamaru or Jace; the pick goes to the graveyard", () => {
    const paused = castToChoice(table(LIBRARY));
    const candidates = (paused.pendingChoice?.candidates || []).map((c) => c.id).sort();
    const s = resolveTutorChoice(paused, "l-bolt");
    expect({ kind: paused.pendingChoice?.kind ?? null, candidates, graveyard: s.players.user.graveyard.map((c) => c.id).sort(), library: s.players.user.library.length })
      .toEqual({ kind: "tutor-search", candidates: ["l-bolt", "l-forest", "l-wurm"], graveyard: ["h-spell", "l-bolt"], library: 4 });
  });
  it("⭐ only legendary cards left: nothing qualifies, nothing is found (CR 701.23b)", () => {
    const paused = castToChoice(table([{ ...ISAMARU, id: "l-isamaru" }, { ...JACE_BELEREN, id: "l-jace" }]));
    const s = paused.pendingChoice ? resolveTutorChoice(paused, null) : paused;
    expect({ candidates: (paused.pendingChoice?.candidates || []).length, graveyard: s.players.user.graveyard.map((c) => c.id), library: s.players.user.library.length })
      .toEqual({ candidates: 0, graveyard: ["h-spell"], library: 2 });
  });
});
