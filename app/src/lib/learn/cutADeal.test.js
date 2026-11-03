/**
 * cutADeal.test.js — CUT A DEAL (the play-weighted program, EDHREC #978):
 *
 *   "Each opponent draws a card, then you draw a card for each opponent who drew a card this way."
 *
 * One atom (effects/atoms/misc.applyOpponentsDrawThenYouPerDrawer): each opponent draws one card through the one draw chokepoint
 * (applyDrawEffect — draw watchers, draw doublers), then the controller draws one card per opponent whose draw took a card. Its
 * rulings witnessed: "if an opponent doesn't draw a card, perhaps because a replacement effect replaced the draw with another effect,
 * that player is not counted" — an opponent with an empty library draws nothing (and loses at the next check, CR 121.4), and an
 * opponent whose empty draw Laboratory Maniac replaced with a win took no card; "If an opponent drew more than one card this way due to
 * a replacement effect, you still draw only one card for that player" — an opponent's Alhammarret's Archive.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const DEAL = {"name":"Cut a Deal","type":"Sorcery","mana":"{2}{W}","oracle":"Each opponent draws a card, then you draw a card for each opponent who drew a card this way.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #978
const ARCHIVE = {"name":"Alhammarret's Archive","type":"Legendary Artifact","mana":"{5}","oracle":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #966
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const LABMAN = {"name":"Laboratory Maniac","type":"Creature — Human Wizard","mana":"{2}{U}","oracle":"If you would draw a card while your library has no cards in it, you win the game instead.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #555

const on = (seat, id, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false });
const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ ...ISLAND, id: `${pid}-l${i}` }));
/** The user's precombat main with Cut a Deal in hand and {2}{W} floating; `libs` / `boards` per seat. */
function table({ pod = true, libs = {}, boards = {} } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], library: libs[pid] ?? lib(pid, 5),
      hand: pid === "user" ? [{ ...DEAL, id: "h-deal" }] : [], manaPool: pid === "user" ? { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}
function castDeal(s) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-deal");
  expect(a, "Cut a Deal is not offered").toBeTruthy();
  let n = dispatchAction(s, a), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return finalizeStackResolution(n);
}
const hands = (s) => Object.fromEntries(Object.keys(s.players).map((pid) => [pid, s.players[pid].hand.length]));

describe("the card", () => {
  it("⭐ native: one atom, the count read off the first instruction", () => {
    expect({ tier: classifyCard(DEAL), atoms: parseEffectProgram(DEAL)?.atoms }).toEqual({ tier: "native-spell", atoms: [{ op: "opponents-draw-then-you-per-drawer", targetType: null }] });
  });
});

describe("the resolution", () => {
  it("⭐ a pod: each of three opponents draws one card, then you draw three", () => {
    const s = castDeal(table());
    expect({ hands: hands(s), userTop: s.players.user.hand.map((c) => c.id), gy: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ hands: { user: 3, ai1: 1, ai2: 1, ai3: 1 }, userTop: ["user-l0", "user-l1", "user-l2"], gy: ["Cut a Deal"] });
  });
  it("⭐ heads-up: the opponent draws one, you draw one", () => {
    const s = castDeal(table({ pod: false }));
    expect(hands(s)).toEqual({ user: 1, ai: 1 });
  });
  it("⭐ its ruling — an opponent who draws no card isn't counted: ai2's library is empty, so you draw two (and ai2 is marked for the empty draw, CR 121.4)", () => {
    const s = castDeal(table({ libs: { ai2: [] } }));
    expect({ hands: hands(s), ai2Empty: !!s.players.ai2.triedToDrawFromEmpty }).toEqual({ hands: { user: 2, ai1: 1, ai2: 0, ai3: 1 }, ai2Empty: true });
  });
  it("⭐ its ruling — a draw a replacement took isn't counted: ai2's Laboratory Maniac turns its empty draw into a win, no card, so you draw two", () => {
    const s = castDeal(table({ libs: { ai2: [] }, boards: { ai2: [on("ai2", "labman", LABMAN)] } }));
    expect({ hands: hands(s), ai2Won: !!s.players.ai2.wonGame }).toEqual({ hands: { user: 2, ai1: 1, ai2: 0, ai3: 1 }, ai2Won: true });
  });
  it("⭐ its ruling — an opponent who drew more than one still counts once: ai1's Alhammarret's Archive makes its draw two cards, you draw three", () => {
    const s = castDeal(table({ boards: { ai1: [on("ai1", "arch", ARCHIVE)] } }));
    expect(hands(s)).toEqual({ user: 3, ai1: 2, ai2: 1, ai3: 1 });
  });
  it("⭐ your own draw is one instruction of N cards: your Alhammarret's Archive doubles it — three becomes six", () => {
    const s = castDeal(table({ boards: { user: [on("user", "arch", ARCHIVE)] }, libs: { user: lib("user", 8) } }));
    expect(hands(s)).toEqual({ user: 6, ai1: 1, ai2: 1, ai3: 1 });
  });
  it("⛔ every opponent's library empty: no opponent drew, you draw nothing", () => {
    const s = castDeal(table({ libs: { ai1: [], ai2: [], ai3: [] } }));
    expect(hands(s)).toEqual({ user: 0, ai1: 0, ai2: 0, ai3: 0 });
  });
});
