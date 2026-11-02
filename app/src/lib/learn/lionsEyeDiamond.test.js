/**
 * lionsEyeDiamond.test.js — LION'S EYE DIAMOND (the play-weighted program, EDHREC #739):
 *
 *   "Discard your hand, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant."
 *
 * A mana ability (CR 605.1a) that may be activated only when its controller could cast an instant (its bundled ruling — "it is
 * activated and resolves as a mana ability, but it can only be activated at times when you can cast an instant"): never while a spell
 * is being cast or its costs paid (CR 601.2g). So it is no planner source (manaSources never lists it — a payment can't reach it) and
 * it is the explicit tap alone (manaModel.manualOnlyManaRecords → legalChoices' tap-for-mana, offered with priority in its
 * controller's own main phase, the engine's explicit-tap window): one action per colour, the whole hand discarded (CR 701.9a — its
 * watchers fire) and the Diamond sacrificed, three mana of the colour floating (CR 106.4) for what comes next — the commander from the
 * command zone. The default AI takes it only with an empty hand, when the three mana make a commander castable it can't cast now.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LED = {"name":"Lion's Eye Diamond","type":"Artifact","mana":"{0}","oracle":"Discard your hand, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #739
const DIAMOND_LION = {"name":"Diamond Lion","type":"Artifact Creature — Cat","mana":"{2}","oracle":"{T}, Discard your hand, Sacrifice this creature: Add three mana of any one color. Activate only as an instant.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #10966
const KRENKO = {"name":"Krenko, Mob Boss","type":"Legendary Creature — Goblin Warrior","mana":"{2}{R}{R}","oracle":"{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1088
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const CARESS = {"name":"Liliana's Caress","type":"Enchantment","mana":"{1}{B}","oracle":"Whenever an opponent discards a card, that player loses 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2408
const NULL_ROD = {"name":"Null Rod","type":"Artifact","mana":"{2}","oracle":"Activated abilities of artifacts can't be activated.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #9183
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (seat) => Array.from({ length: 5 }, (_, i) => ({ ...PLAINS, id: `L-${seat}-${i}` }));
/** `seat`'s main phase: the Diamond (unless `led: false`) and `mountains` Mountains; Krenko in its command zone; `hand`. */
function table({ seat = "user", led = true, mountains = 1, hand = [], oppBf = [], bf = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [], userCommanders: [{ ...KRENKO, id: "cmd-user" }], aiCommanders: [{ ...KRENKO, id: "cmd-ai" }] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [...(led ? [on(seat, "led", LED)] : []), ...Array.from({ length: mountains }, (_, i) => on(seat, `m${i}`, MOUNTAIN)), ...bf];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, hand, graveyard: [], library: lib(seat), landsPlayedThisTurn: 1 },
    [opp]: { ...g.players[opp], battlefield: oppBf, hand: [], graveyard: [], library: lib(opp) } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return finalizeStackResolution(n);
}
const ledTaps = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "tap-for-mana" && a.permanentId === "led");
const names = (cards) => (cards || []).map((c) => c.name).sort();
/** The Diamond's explicit activation for `color` (asserted offered). */
function ledTap(s, color, seat = "user") {
  const a = ledTaps(s, seat).find((x) => x.color === color);
  expect(a, `the Diamond's {${color}} activation`).toBeTruthy();
  return a;
}

describe("the card", () => {
  it("⭐ native-mana; the planner never lists it (no payment can reach it); Diamond Lion's {T} form stays unread", () => {
    const s = table();
    expect({ tier: classifyCard(LED), lion: classifyCard(DIAMOND_LION), planner: manaSources(s, "user").filter((x) => x.permanentId === "led").length }).toEqual({ tier: "native-mana", lion: "body-only", planner: 0 });
  });
  it("⛔ a spell its three mana would pay for is not castable through a payment (it can't be activated mid-cast)", () => {
    const s = table({ hand: [{ ...GIANT, id: "h-giant" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-giant")).toBe(false);
  });
});

describe("the explicit activation", () => {
  it("⭐ one per colour, with priority in its controller's main phase", () => {
    expect(ledTaps(table()).map((a) => [a.color, a.amount]).sort()).toEqual([["B", 3], ["G", 3], ["R", 3], ["U", 3], ["W", 3]]);
  });
  it("⭐ red: the hand is discarded, the Diamond sacrificed, {R}{R}{R} floats", () => {
    const s0 = table({ hand: [{ ...GIANT, id: "h-giant" }, { ...ISLAND, id: "h-island" }] });
    const s = dispatchAction(s0, ledTap(s0, "R"));
    expect({ hand: s.players.user.hand.length, gy: names(s.players.user.graveyard), led: s.players.user.battlefield.some((p) => p.id === "led"), pool: s.players.user.manaPool })
      .toEqual({ hand: 0, gy: ["Hill Giant", "Island", "Lion's Eye Diamond"], led: false, pool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } });
  });
  it("⭐ the floating mana and a Mountain cast the commander from the command zone", () => {
    const s0 = table();
    const s1 = dispatchAction(s0, ledTap(s0, "R"));
    const castK = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.fromZone === "command");
    expect(!!castK).toBe(true);
    const s = settle(dispatchAction(s1, castK));
    expect({ krenko: s.players.user.battlefield.some((p) => p.card?.name === "Krenko, Mob Boss"), command: s.players.user.command.length }).toEqual({ krenko: true, command: 0 });
  });
  it("⭐ the discard is a discard: an opponent's Liliana's Caress drains 2 for each card", () => {
    const s0 = table({ hand: [{ ...GIANT, id: "h-giant" }, { ...ISLAND, id: "h-island" }], oppBf: [on("ai", "caress", CARESS)] });
    const s = settle(dispatchAction(s0, ledTap(s0, "R")));
    expect(s.players.user.life).toBe(36);
  });
  it("⭐ an empty hand still pays the cost (nothing is discarded)", () => {
    const s0 = table();
    const s = dispatchAction(s0, ledTap(s0, "G"));
    expect({ pool: s.players.user.manaPool.G, gy: names(s.players.user.graveyard) }).toEqual({ pool: 3, gy: ["Lion's Eye Diamond"] });
  });
  it("⛔ under Null Rod (artifacts' activated abilities can't be activated): not offered", () => {
    expect(ledTaps(table({ oppBf: [on("ai", "rod", NULL_ROD)] }))).toEqual([]);
  });
  it("⛔ without priority or on the opponent's turn: not offered (the engine's explicit-tap window)", () => {
    const s = table();
    expect({ noPriority: ledTaps({ ...s, priorityHolder: "ai" }).length, oppTurn: ledTaps({ ...s, activePlayer: "ai" }).length }).toEqual({ noPriority: 0, oppTurn: 0 });
  });
});

describe("the default AI", () => {
  it("⭐ with an empty hand and one Mountain, it cracks the Diamond for red and casts its commander", () => {
    const s0 = table({ seat: "ai" });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: pick?.kind, permanentId: pick?.permanentId, color: pick?.color }).toEqual({ kind: "tap-for-mana", permanentId: "led", color: "R" });
    const s1 = dispatchAction(s0, pick);
    const pick2 = pickAction(s1, "ai", legalActionsForPlayer(s1, "ai"));
    expect({ kind: pick2?.kind, fromZone: pick2?.fromZone }).toEqual({ kind: "cast-spell", fromZone: "command" });
    const s = settle(dispatchAction(s1, pick2));
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Krenko, Mob Boss")).toBe(true);
  });
  it("⛔ with a card in hand it keeps the Diamond (its cost would be that card)", () => {
    const s0 = table({ seat: "ai", hand: [{ ...ISLAND, id: "h-island" }] });
    expect(pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"))?.permanentId).not.toBe("led");
  });
  it("⛔ when the commander is castable without it, it keeps the Diamond", () => {
    const s0 = table({ seat: "ai", mountains: 4 });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: pick?.kind, fromZone: pick?.fromZone }).toEqual({ kind: "cast-spell", fromZone: "command" });
  });
});
