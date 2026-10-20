/**
 * TWILIGHT PROPHET (EDHREC #1137; the play-weighted slice, 2026-10-18) — Yuriko's reveal-and-drain (templateMatchers.
 * matchRevealTopDrainByMv) with a drain of both halves:
 *   "At the beginning of your upkeep, if you have the city's blessing, reveal the top card of your library and put it into your hand.
 *    Each opponent loses X life and you gain X life, where X is that card's mana value."
 *
 * The X is the revealed card's mana value, captured as it is revealed (the reveal-top-to-hand stamp, state.revealedCardMV) and read by
 * BOTH halves — each opponent loses X, the controller gains X once (the Two-Headed Giant ruling: "the opposing team [loses] twice X
 * life and you gain X life"). Its rulings: an {X} in the revealed card's cost is 0, and a card with no mana cost (a land) is 0. The
 * city's blessing is an intervening "if" (CR 603.4; ascend.js, CR 702.131c): without it the ability never triggers.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const TWILIGHT_PROPHET = {"name":"Twilight Prophet","type":"Creature — Vampire Cleric","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"4","keywords":["Flying","Ascend"],"colors":["B"],"oracle":"Flying\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your upkeep, if you have the city's blessing, reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card's mana value."}; // body-only on f71c2a49
const DARK_CONFIDANT = {"name":"Dark Confidant","type":"Creature — Human Wizard","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value."}; // native-trigger on f71c2a49
const YURIKO = {"name":"Yuriko, the Tiger's Shadow","type":"Legendary Creature — Human Ninja","mana":"{1}{U}{B}","cmc":3,"power":"1","toughness":"3","keywords":["Commander ninjutsu"],"colors":["B","U"],"oracle":"Commander ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand or the command zone tapped and attacking.)\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card's mana value."}; // native-trigger on f71c2a49
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land on f71c2a49

const P = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
/** A four-seat pod at the beginning of the user's upkeep, every seat at 40; `top` is the user's top card. */
function pod({ blessing = true, top = CRAW_WURM } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [], consecutivePasses: 0, players: { ...g.players } };
  for (const id of ["user", "ai1", "ai2", "ai3"]) s.players[id] = { ...s.players[id], life: 40, battlefield: [], hand: [], library: [] };
  s.players.user = { ...s.players.user, battlefield: [P("prophet", TWILIGHT_PROPHET)], library: [{ ...top, id: "top" }, { ...SWAMP, id: "next" }], ...(blessing ? { citysBlessing: true } : {}) };
  return s;
}
function upkeep(s0) {
  let s = checkStepTriggers(s0, "upkeep");
  for (let i = 0; i < 10; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const lives = (s) => Object.fromEntries(Object.keys(s.players).map((id) => [id, s.players[id].life]));

describe("parse + classify", () => {
  it("⭐ Twilight Prophet classifies native-trigger; Dark Confidant and Yuriko unchanged", () => {
    expect({ prophet: classifyCard(TWILIGHT_PROPHET), bob: classifyCard(DARK_CONFIDANT), yuriko: classifyCard(YURIKO) }).toEqual({ prophet: "native-trigger", bob: "native-trigger", yuriko: "native-trigger" });
  });

  it("the program: reveal-and-take stamps the mana value; the loss and the gain both read it", () => {
    const p = parseEffectClause("reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card's mana value.", "Instant", { sourceScoped: true });
    expect(p.atoms).toEqual([
      { op: "reveal-top-to-hand", targetType: null },
      { op: "lose-life", who: "eachOpponent", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
      { op: "gain-life", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
    ]);
  });

  it("CONTROL — another X, another drain shape, or a rider stays unparsed", () => {
    const atoms = (clause) => parseEffectClause(clause, "Instant", { sourceScoped: true })?.atoms ?? [];
    expect({
      otherX: atoms("reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is the number of creatures you control."),
      gainTwice: atoms("reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain twice X life, where X is that card's mana value."),
      rider: atoms("reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card's mana value. Draw a card."),
    }).toEqual({ otherX: [], gainTwice: [], rider: [] });
  });
});

describe("⭐ the upkeep, in a four-seat pod", () => {
  it("⭐ with the city's blessing: the Craw Wurm (6) goes to hand, each opponent loses 6, the controller gains 6 once", () => {
    const s = upkeep(pod());
    expect({ lives: lives(s), hand: s.players.user.hand.map((c) => c.id) }).toEqual({ lives: { user: 46, ai1: 34, ai2: 34, ai3: 34 }, hand: ["top"] });
  });

  it("⭐ a land on top (no mana cost — the ruling): it goes to hand and nobody's life changes", () => {
    const s = upkeep(pod({ top: SWAMP }));
    expect({ lives: lives(s), hand: s.players.user.hand.map((c) => c.id) }).toEqual({ lives: { user: 40, ai1: 40, ai2: 40, ai3: 40 }, hand: ["top"] });
  });

  it("CONTROL — without the city's blessing it never triggers: no card, no life", () => {
    const s = upkeep(pod({ blessing: false }));
    expect({ lives: lives(s), hand: s.players.user.hand.length }).toEqual({ lives: { user: 40, ai1: 40, ai2: 40, ai3: 40 }, hand: 0 });
  });
});
