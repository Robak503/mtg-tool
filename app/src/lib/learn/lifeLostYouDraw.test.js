/**
 * VILIS, BROKER OF BLOOD (EDHREC #1124) — "Flying / {B}, Pay 2 life: Target creature gets -1/-1 until end of turn. / Whenever you
 * lose life, draw that many cards. (Damage causes loss of life.)"
 *
 * The life-loss event (Mindcrank's, fired from the loseLife chokepoint — damage included, CR 119.3, 120.3a) read for its watcher's
 * OWN controller ("you"), and its "that many" — the life just lost (ctx.lifeLostAmount) — on the draw. Each loss is its own event
 * with its own amount (CR 603.2). The bundled rulings: paying life is losing it (CR 119.4); a life payment made while casting or
 * activating draws only after that is finished — the trigger goes on the stack above the ability it paid for and resolves first
 * (CR 603.3, 602.2b).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, loseLife, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const VILIS = {"name":"Vilis, Broker of Blood","type":"Legendary Creature — Demon","mana":"{5}{B}{B}{B}","cmc":8,"power":"8","toughness":"8","keywords":["Flying"],"colors":["B"],"oracle":"Flying\n{B}, Pay 2 life: Target creature gets -1/-1 until end of turn.\nWhenever you lose life, draw that many cards. (Damage causes loss of life.)"};
const MARINA = {"name":"Marina Vendrell's Grimoire","type":"Legendary Artifact","mana":"{5}{U}","cmc":6,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"When Marina Vendrell's Grimoire enters, if you cast it, draw five cards.\nYou have no maximum hand size and don't lose the game for having 0 or less life.\nWhenever you gain life, draw that many cards.\nWhenever you lose life, discard that many cards. Then if you have no cards in hand, you lose the game."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
// Twins — "you lose life for the first time each turn": the PLAYER's first loss of the turn (the Warchief's rulings).
const WARCHIEF = {"name":"Vengeful Warchief","type":"Creature — Orc Warrior","mana":"{4}{B}","cmc":5,"power":"4","toughness":"4","keywords":[],"colors":["B"],"oracle":"Whenever you lose life for the first time each turn, put a +1/+1 counter on this creature. (Damage causes loss of life.)"};
const GONTI = {"name":"Gonti's Machinations","type":"Enchantment","mana":"{B}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Whenever you lose life for the first time each turn, you get {E}. (You get an energy counter. Damage causes loss of life.)\nPay {E}{E}, Sacrifice this enchantment: Each opponent loses 3 life. You gain life equal to the life lost this way."};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lib = (pid, n = 12) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `L-${pid}-${i}` }));
function table({ user = [], ai = [], userPool = null } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (pid, battlefield) => ({ ...s0.players[pid], battlefield, hand: [], graveyard: [], library: lib(pid), life: 20 });
  const players = { ...s0.players, user: seat("user", user), ai: seat("ai", ai) };
  if (userPool) players.user = { ...players.user, manaPool: userPool };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], consecutivePasses: 0 };
}
const settle = (s) => {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 40 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
};

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(VILIS))).toBe(true);
  });
  it("⭐ the watcher is its controller's own life loss, and the draw reads the life just lost", () => {
    const d = detectTriggers(VILIS).find((x) => x.event === "lifeLost");
    expect(d && { whose: d.whose, routes: triggerRoutesNatively(d) }).toEqual({ whose: "you", routes: true });
  });
  it("CONTROL — Marina Vendrell's Grimoire stays parked (its life-loss discard has a lose-the-game rider)", () => {
    expect(isNativeTier(classifyCard(MARINA))).toBe(false);
  });
});

describe("the game", () => {
  it("⭐ its controller loses 3 life: three cards drawn; then 1: one more", () => {
    let s = table({ user: [P("vilis", VILIS, "user")] });
    s = settle(loseLife(s, { playerId: "user", amount: 3 }));
    expect(s.players.user.hand).toHaveLength(3);
    s = settle(loseLife(s, { playerId: "user", amount: 1 }));
    expect(s.players.user.hand).toHaveLength(4);
  });
  it("CONTROL — an opponent losing life draws its controller nothing", () => {
    const s = settle(loseLife(table({ user: [P("vilis", VILIS, "user")] }), { playerId: "ai", amount: 3 }));
    expect({ user: s.players.user.hand.length, ai: s.players.ai.hand.length }).toEqual({ user: 0, ai: 0 });
  });
  it("⭐ damage is loss of life: 5 damage to its controller draws five", () => {
    let s = table({ user: [P("vilis", VILIS, "user")] });
    s = settle(loseLife(s, { playerId: "user", amount: 5, combatDamage: true }));
    expect({ life: s.players.user.life, hand: s.players.user.hand.length }).toEqual({ life: 15, hand: 5 });
  });
  it("⭐ its ruling: paying 2 life for its own ability draws two BEFORE the ability resolves, after its target is chosen", () => {
    const s0 = table({ user: [P("vilis", VILIS, "user")], ai: [P("bears", BEARS, "ai")], userPool: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 } });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "vilis" && (a.targets || []).some((t) => t.id === "bears"));
    expect(act).toBeTruthy();
    let s = flushTriggers(dispatchAction(s0, act), { chooseTargets: chooseTriggerTargets });
    expect(s.players.user.life).toBe(18);
    expect(s.stack).toHaveLength(2);
    s = resolveTopOfStack(s); // the life-loss trigger, above the ability
    expect({ hand: s.players.user.hand.length, stack: s.stack.length }).toEqual({ hand: 2, stack: 1 });
    s = settle(s);
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual([]);
    expect(s.players.user.hand).toHaveLength(2);
  });
});

describe("twins — \"you lose life for the first time each turn\"", () => {
  const warchiefCounters = (s) => s.players.user.battlefield.find((p) => p.id === "wc")?.counters?.["+1/+1"] || 0;
  it("⭐ both play their whole text", () => {
    expect({ warchief: isNativeTier(classifyCard(WARCHIEF)), gonti: isNativeTier(classifyCard(GONTI)) }).toEqual({ warchief: true, gonti: true });
  });
  it("⭐ Vengeful Warchief: the first loss puts one counter however much was lost; a second loss that turn, none", () => {
    let s = table({ user: [P("wc", WARCHIEF, "user")] });
    s = settle(loseLife(s, { playerId: "user", amount: 4 }));
    expect(warchiefCounters(s)).toBe(1);
    s = settle(loseLife(s, { playerId: "user", amount: 1 }));
    expect(warchiefCounters(s)).toBe(1);
  });
  it("⭐ its ruling — under its controller's control only after they already lost life this turn, it can't trigger that turn", () => {
    let s = settle(loseLife(table(), { playerId: "user", amount: 2 }));
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [P("wc", WARCHIEF, "user")] } } };
    s = settle(loseLife(s, { playerId: "user", amount: 1 }));
    expect(warchiefCounters(s)).toBe(0);
  });
  it("CONTROL — an opponent's loss puts no counter on it", () => {
    const s = settle(loseLife(table({ user: [P("wc", WARCHIEF, "user")] }), { playerId: "ai", amount: 3 }));
    expect(warchiefCounters(s)).toBe(0);
  });
});
