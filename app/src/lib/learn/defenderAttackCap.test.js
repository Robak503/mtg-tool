/**
 * CRAWLSPACE (EDHREC #1404) — "No more than two creatures can attack you each combat."
 *
 * An attack RESTRICTION on its controller as a defending player (CR 508.1c): the declaration may hold at most two creatures attacking
 * that player, whoever attacks. Its bundled ruling: "Your opponents can still attack planeswalkers you control with any number of
 * creatures each combat" — an attack on a planeswalker is not an attack on its controller (CR 506.2, 508.3e). The engine declares
 * attackers one at a time, so the third attack at that player is never offered; another opponent and the planeswalkers stay open.
 * Requirements still bind within the restriction (CR 508.1d): when the slots left at that player are no more than the creatures
 * that must attack and can attack only that player, the slots go to them.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";
import { pickAttackPlan } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const CRAWLSPACE = {"name":"Crawlspace","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"No more than two creatures can attack you each combat."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const BERSERKER = {"name":"Bloodrock Cyclops","type":"Creature — Cyclops","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"This creature attacks each combat if able."};
const WALKER = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"power":null,"toughness":null,"keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** 1v1: the user attacks with `attackers`; the AI holds Crawlspace (and, with `walker`, a planeswalker). */
function duel({ attackers = 3, crawlspace = true, walker = false, extra = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const ai = [...(crawlspace ? [P("cs", CRAWLSPACE, "ai")] : []), ...(walker ? [{ ...P("pw", WALKER, "ai"), counters: { loyalty: 3 } }] : [])];
  return { ...s0, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", combat: { attackers: [], blockers: [] },
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [...Array.from({ length: attackers }, (_, i) => P(`a${i + 1}`, BEARS, "user")), ...extra] },
      ai: { ...s0.players.ai, battlefield: ai } } };
}
/** A pod: the user attacks; ai1 holds Crawlspace, ai2 and ai3 don't. */
function pod() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], library: [] };
  players.user = { ...players.user, battlefield: Array.from({ length: 4 }, (_, i) => P(`a${i + 1}`, BEARS, "user")) };
  players.ai1 = { ...players.ai1, battlefield: [P("cs", CRAWLSPACE, "ai1")] };
  return { ...s0, players, turn: 4, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", combat: { attackers: [], blockers: [] } };
}
const attacks = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const declare = (s, pred) => { const a = attacks(s).find(pred); expect(a).toBeTruthy(); return dispatchAction(s, a); };

const JUDOON = {"name":"Judoon Enforcers","type":"Creature — Alien Rhino Soldier","mana":"{5}{R}{W}","cmc":7,"power":"8","toughness":"8","keywords":["Suspend","Trample"],"colors":["R","W"],"oracle":"Trample\nNo more than one creature can attack you each combat.\nSuspend 6—{1}{R}{W} (Rather than cast this card from your hand, you may pay {1}{R}{W} and exile it with six time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)"};

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(CRAWLSPACE))).toBe(true);
  });
  it("⭐ twin — Judoon Enforcers (\"No more than one creature can attack you each combat.\") plays its whole text, and one is the cap", () => {
    expect(isNativeTier(classifyCard(JUDOON))).toBe(true);
    const s0 = duel({ crawlspace: false });
    let s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [P("jd", JUDOON, "ai"), P("cs", CRAWLSPACE, "ai")] } } };
    s = declare(s, () => true);
    expect(attacks(s)).toHaveLength(0); // the lowest cap among its controller's permanents
  });
});

describe("the game", () => {
  it("⭐ 1v1: two attackers declared at its controller, the third isn't offered", () => {
    let s = duel();
    s = declare(s, () => true);
    s = declare(s, () => true);
    expect({ declared: s.combat.attackers.length, offered: attacks(s).length }).toEqual({ declared: 2, offered: 0 });
  });
  it("CONTROL — without Crawlspace the third attacker is offered", () => {
    let s = duel({ crawlspace: false });
    s = declare(s, () => true);
    s = declare(s, () => true);
    expect(attacks(s)).toHaveLength(1);
  });
  it("⭐ its ruling — its controller's planeswalker can still be attacked by any number", () => {
    let s = duel({ walker: true });
    s = declare(s, (a) => !a.defenderPlaneswalkerId);
    s = declare(s, (a) => !a.defenderPlaneswalkerId);
    const third = attacks(s);
    expect({ atPlayer: third.filter((a) => !a.defenderPlaneswalkerId).length, atWalker: third.filter((a) => a.defenderPlaneswalkerId === "pw").length }).toEqual({ atPlayer: 0, atWalker: 1 });
    s = dispatchAction(s, third[0]);
    expect(s.combat.attackers.filter((a) => a.defenderPlaneswalkerId === "pw")).toHaveLength(1);
  });
  it("CONTROL — attacks at its planeswalker leave the player its two: two at the walker, one at the player, one more offered", () => {
    let s = duel({ attackers: 4, walker: true });
    s = declare(s, (a) => a.defenderPlaneswalkerId === "pw");
    s = declare(s, (a) => a.defenderPlaneswalkerId === "pw");
    s = declare(s, (a) => !a.defenderPlaneswalkerId);
    expect(attacks(s).filter((a) => !a.defenderPlaneswalkerId)).toHaveLength(1);
  });
  it("⭐ a pod: only attacks at its controller are capped; the other opponents stay open", () => {
    let s = pod();
    s = declare(s, (a) => a.defenderId === "ai1");
    s = declare(s, (a) => a.defenderId === "ai1");
    const left = attacks(s);
    expect({ atAi1: left.filter((a) => a.defenderId === "ai1").length, atAi2: left.filter((a) => a.defenderId === "ai2").length }).toEqual({ atAi1: 0, atAi2: 2 });
  });
  it("⭐ requirements within the restriction (CR 508.1d): one slot left and a creature that must attack — only it is offered at that player", () => {
    let s = duel({ attackers: 2, extra: [P("cy", BERSERKER, "user")] });
    s = declare(s, (a) => a.permanentId === "a1");
    expect(attacks(s).map((a) => a.permanentId)).toEqual(["cy"]);
  });
});

// ── A pod with ONE legal target left under a cap (the integrator's review, 2026-11-01) ──
// The one-opponent shortcut emits declarations with no defender, and the dispatcher fills in the FIRST opponent in turn order. Once a
// cap has taken a player out, the lone target left must be named on every declaration; and an attack past a cap is refused outright.
/** A four-seat pod (ai3 eliminated when `eliminate`): `attacker` holds `n` Bears; each seat in `capped` holds a Crawlspace. */
function cappedPod({ attacker = "user", n = 4, capped = ["ai1"], eliminate = false, life = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], library: [], life: life[pid] ?? 40 };
  players[attacker] = { ...players[attacker], battlefield: Array.from({ length: n }, (_, i) => P(`b${i + 1}`, BEARS, attacker)) };
  for (const pid of capped) players[pid] = { ...players[pid], battlefield: [...players[pid].battlefield, P(`cs-${pid}`, CRAWLSPACE, pid)] };
  let s = { ...s0, players, turn: 4, phase: "combat", step: "declare-attackers", activePlayer: attacker, priorityHolder: attacker, combat: { attackers: [], blockers: [] } };
  if (eliminate) s = removePlayerFromGame(s, "ai3");
  return s;
}
const attacksBy = (s, pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "declare-attacker");
const declareBy = (s, pid, pred) => { const a = attacksBy(s, pid).find(pred); expect(a).toBeTruthy(); return dispatchAction(s, a); };
const at = (s, pid) => (s.combat?.attackers || []).filter((a) => a.defender === pid && !a.defenderPlaneswalkerId).length;

describe("one legal target left under a cap", () => {
  it("⭐ three players (ai3 eliminated): ai1's two slots spent, every attack left names ai2 — none is defenderless", () => {
    let s = cappedPod({ eliminate: true });
    s = declareBy(s, "user", (a) => a.defenderId === "ai1");
    s = declareBy(s, "user", (a) => a.defenderId === "ai1");
    const left = attacksBy(s, "user");
    expect({ offered: left.length, named: left.every((a) => a.defenderId === "ai2") }).toEqual({ offered: 2, named: true });
    s = dispatchAction(s, left[0]);
    expect({ ai1: at(s, "ai1"), ai2: at(s, "ai2") }).toEqual({ ai1: 2, ai2: 1 });
  });
  it("⭐ four players, two capped: ai1 and ai2 spent, the fifth attacker names ai3", () => {
    let s = cappedPod({ n: 5, capped: ["ai1", "ai2"] });
    for (const d of ["ai1", "ai1", "ai2", "ai2"]) s = declareBy(s, "user", (a) => a.defenderId === d);
    const left = attacksBy(s, "user");
    expect({ offered: left.length, named: left.every((a) => a.defenderId === "ai3") }).toEqual({ offered: 1, named: true });
    s = dispatchAction(s, left[0]);
    expect({ ai1: at(s, "ai1"), ai2: at(s, "ai2"), ai3: at(s, "ai3") }).toEqual({ ai1: 2, ai2: 2, ai3: 1 });
  });
  it("⭐ the AI under its opponent's cap: ai1 swings four at a three-player pod — no more than two attack the user's Crawlspace", () => {
    let s = cappedPod({ attacker: "ai1", capped: ["user"], eliminate: true, life: { user: 3, ai2: 40 } });
    for (let g = 0; g < 10; g++) {
      const acts = attacksBy(s, "ai1");
      if (!acts.length) break;
      const plan = pickAttackPlan(s, "ai1", acts);
      if (!plan.length) break;
      s = dispatchAction(s, plan[0]);
    }
    expect({ atUser: at(s, "user") <= 2, declared: s.combat.attackers.length >= 3 }).toEqual({ atUser: true, declared: true });
  });
  it("⭐ the dispatcher refuses an attack past the cap, a defenderless one included", () => {
    let s = duel();
    s = declare(s, () => true);
    s = declare(s, () => true);
    expect(() => dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "a3" })).toThrow(/can attack ai each combat/);
  });
});
