/**
 * RITES OF FLOURISHING (EDHREC #1519) — "At the beginning of each player's draw step, that player draws an additional card. / Each player
 * may play an additional land on each of their turns." The symmetric extra land drop (CR 305.2 — one land a turn; CR 505.6b — an
 * effect may let a player play more): every player's allowance, from whichever battlefield the enchantment is on. Exploration's
 * "You may play an additional land on each of your turns." is the one-player form beside it.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { landDropAllowance, legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const RITES_OF_FLOURISHING = {"name":"Rites of Flourishing","type":"Enchantment","mana":"{2}{G}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"At the beginning of each player's draw step, that player draws an additional card.\nEach player may play an additional land on each of their turns."}; // body-only on 55eb7d63
const EXPLORATION = {"name":"Exploration","type":"Enchantment","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"You may play an additional land on each of your turns."}; // native-static on 55eb7d63
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
/** A four-seat pod, `active`'s precombat main phase; each player holds three Forests. */
function pod(user = [], ai1 = [], active = "user") {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...s0, turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0, players: { ...s0.players } };
  for (const pid of ["user", "ai1", "ai2", "ai3"]) {
    s.players[pid] = { ...s.players[pid], battlefield: pid === "user" ? user : pid === "ai1" ? ai1 : [], hand: [0, 1, 2].map((i) => ({ ...FOREST, id: `${pid}-f${i}` })), landsPlayedThisTurn: 0 };
  }
  return s;
}
const allowances = (s) => Object.fromEntries(["user", "ai1", "ai2", "ai3"].map((pid) => [pid, landDropAllowance(s, pid)]));
/** Play lands from hand while one is offered; how many went down. */
function playAll(s0, pid) {
  let s = s0;
  for (let i = 0; i < 5; i++) {
    const act = legalActionsForPlayer(s, pid).find((a) => a.kind === "play-land");
    if (!act) break;
    s = dispatchAction(s, act);
  }
  return s.players[pid].battlefield.filter((p) => p.card?.name === "Forest").length;
}

describe("Rites of Flourishing", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(RITES_OF_FLOURISHING)).toBe("native-mixed");
  });

  it("⭐ every player may play two lands a turn while it is on the battlefield — its controller and each opponent", () => {
    expect({ without: allowances(pod()), with: allowances(pod([P("rites", RITES_OF_FLOURISHING)])) })
      .toEqual({ without: { user: 1, ai1: 1, ai2: 1, ai3: 1 }, with: { user: 2, ai1: 2, ai2: 2, ai3: 2 } });
  });

  it("⭐ an opponent's Rites counts for you too; beside your own Exploration you may play three", () => {
    expect(allowances(pod([P("expl", EXPLORATION)], [P("rites", RITES_OF_FLOURISHING, "ai1")]))).toEqual({ user: 3, ai1: 2, ai2: 2, ai3: 2 });
  });

  it("⭐ played out: on its turn an opponent puts down two Forests, never a third; with no Rites, one", () => {
    expect({ withRites: playAll(pod([P("rites", RITES_OF_FLOURISHING)], [], "ai1"), "ai1"), without: playAll(pod([], [], "ai1"), "ai1") })
      .toEqual({ withRites: 2, without: 1 });
  });
});
