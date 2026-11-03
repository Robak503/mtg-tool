/**
 * syphonMind.test.js — SYPHON MIND (the play-weighted program, EDHREC #1046):
 *
 *   "Each other player discards a card. You draw a card for each card discarded this way."
 *
 * One atom (effects/atoms/hand.matchEachOtherPlayerDiscardsThenYouDrawPerCard → applyDiscard's `drawPerDiscarded`): each other player
 * (every opponent — the game has no teams, CR 102.2, 806.1) discards one card of their own choice through the discard chain (a person
 * is asked, the default AI sheds its least valuable, a one-card hand goes unasked, an empty hand discards nothing), and the chain
 * tallies the cards really discarded across every pause (`perDiscardDraw` on the pending choice); when the chain ends, the caster
 * draws that many as one instruction (CR 121.2). Witnessed through real game states: the person casting, the person discarding to
 * the AI's Syphon Mind, the default AI casting it.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickDiscardCandidate, resolveDiscardChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const SYPHON = {"name":"Syphon Mind","type":"Sorcery","mana":"{3}{B}","oracle":"Each other player discards a card. You draw a card for each card discarded this way.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1046
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ ...SWAMP, id: `${pid}-l${i}` }));
const cards = (pid, list) => list.map((c, i) => ({ ...c, id: `${pid}-h${i}` }));
/** `caster`'s precombat main with Syphon Mind in hand and {3}{B} floating; `hands` per seat (the caster's beside the Syphon). */
function table({ caster = "user", pod = true, hands = {} } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [], graveyard: [], library: lib(pid, 6),
      hand: [...(pid === caster ? [{ ...SYPHON, id: "h-syphon" }] : []), ...cards(pid, hands[pid] || [])],
      manaPool: pid === caster ? { W: 0, U: 0, B: 1, R: 0, G: 0, C: 3 } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players };
}
/** Cast Syphon Mind for `caster` and resolve it; each discard the person faces takes the next of `userPicks`, every AI seat its autopilot. */
function cast(s, caster = "user", userPicks = []) {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-syphon");
  expect(a, "Syphon Mind is not offered").toBeTruthy();
  const asked = [];
  const picks = [...userPicks];
  let n = dispatchAction(s, a), g = 0;
  while (g++ < 60) {
    if (n.pendingChoice?.kind === "discard") {
      const pc = n.pendingChoice;
      asked.push({ seat: pc.controller, candidates: pc.candidates.map((c) => c.id) });
      const id = pc.controller === "user" ? picks.shift() : autoPickDiscardCandidate(n, pc);
      expect(id, `no pick for ${pc.controller}`).toBeTruthy();
      n = resolveDiscardChoice(n, id);
      continue;
    }
    if (n.pendingChoice) break;
    if (n.stack?.length) { n = resolveTopOfStack(n); continue; }
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s: finalizeStackResolution(n), asked };
}
const handIds = (s, pid) => s.players[pid].hand.map((c) => c.id);
const yard = (s, pid) => s.players[pid].graveyard.map((c) => c.id);

describe("the card", () => {
  it("⭐ native: one atom — each opponent discards one, the draw tallied off the discards", () => {
    expect({ tier: classifyCard(SYPHON), atoms: parseEffectProgram(SYPHON)?.atoms })
      .toEqual({ tier: "native-spell", atoms: [{ op: "discard", amount: 1, who: "eachOpponent", drawPerDiscarded: true, targetType: null }] });
  });
});

describe("the person casts it", () => {
  it("⭐ a pod: ai1 sheds its least valuable of two, ai2's one card goes unasked, ai3 has none — you draw two", () => {
    const { s, asked } = cast(table({ hands: { ai1: [WURM, BEARS], ai2: [GIANT], ai3: [] } }));
    expect({
      asked, user: handIds(s, "user"), ai1: handIds(s, "ai1"), ai2: handIds(s, "ai2"),
      yards: { ai1: yard(s, "ai1"), ai2: yard(s, "ai2"), ai3: yard(s, "ai3"), user: yard(s, "user") },
    }).toEqual({
      asked: [{ seat: "ai1", candidates: ["ai1-h0", "ai1-h1"] }],
      user: ["user-l0", "user-l1"], ai1: ["ai1-h0"], ai2: [],
      yards: { ai1: ["ai1-h1"], ai2: ["ai2-h0"], ai3: [], user: ["h-syphon"] },
    });
  });
  it("⭐ every opponent holds cards: three discards, three draws; your own hand is never asked", () => {
    const { s, asked } = cast(table({ hands: { user: [BOLT], ai1: [BEARS, GIANT], ai2: [BEARS, WURM], ai3: [BOLT, GIANT] } }));
    expect({ seats: asked.map((x) => x.seat), user: handIds(s, "user"), lost: ["ai1", "ai2", "ai3"].map((p) => s.players[p].hand.length) })
      .toEqual({ seats: ["ai1", "ai2", "ai3"], user: ["user-h0", "user-l0", "user-l1", "user-l2"], lost: [1, 1, 1] });
  });
  it("⭐ heads-up: the one opponent discards one, you draw one", () => {
    const { s } = cast(table({ pod: false, hands: { ai: [BEARS, GIANT, WURM] } }));
    expect({ user: handIds(s, "user"), ai: s.players.ai.hand.length, aiYard: yard(s, "ai") }).toEqual({ user: ["user-l0"], ai: 2, aiYard: ["ai-h0"] });
  });
  it("⭐ nobody has a card: nothing is discarded and you draw nothing", () => {
    const { s } = cast(table({ hands: {} }));
    expect({ user: handIds(s, "user"), draws: (s.log || []).filter((e) => e.effect === "draw-per-discarded").map((e) => e.amount) })
      .toEqual({ user: [], draws: [0] });
  });
});

describe("the person discards to the AI's Syphon Mind", () => {
  it("⭐ the person is asked among their own hand and keeps the card they choose; the AI draws one per card discarded", () => {
    const { s, asked } = cast(table({ caster: "ai1", hands: { user: [BOLT, WURM], ai2: [GIANT], ai3: [BEARS, GIANT] } }), "ai1", ["user-h1"]);
    expect({
      asked, userHand: handIds(s, "user"), userYard: yard(s, "user"), ai1: handIds(s, "ai1"),
    }).toEqual({
      asked: [{ seat: "user", candidates: ["user-h0", "user-h1"] }, { seat: "ai3", candidates: ["ai3-h0", "ai3-h1"] }],
      userHand: ["user-h0"], userYard: ["user-h1"], ai1: ["ai1-l0", "ai1-l1", "ai1-l2"],
    });
  });
  it("⭐ the tally rides on the person's pause: asked first, the person's discard still counts when the AI seats finish", () => {
    const s0 = table({ caster: "ai1", hands: { user: [BOLT, WURM], ai2: [GIANT, BEARS], ai3: [] } });
    const a = legalActionsForPlayer(s0, "ai1").find((x) => x.kind === "cast-spell" && x.cardId === "h-syphon");
    let n = resolveTopOfStack(dispatchAction(s0, a));
    expect({ kind: n.pendingChoice?.kind, seat: n.pendingChoice?.controller, tally: n.pendingChoice?.perDiscardDraw })
      .toEqual({ kind: "discard", seat: "user", tally: { controller: "ai1", count: 0 } });
    n = resolveDiscardChoice(n, "user-h0");
    expect({ seat: n.pendingChoice?.controller, tally: n.pendingChoice?.perDiscardDraw }).toEqual({ seat: "ai2", tally: { controller: "ai1", count: 1 } });
    n = resolveDiscardChoice(n, autoPickDiscardCandidate(n, n.pendingChoice));
    n = finalizeStackResolution(n);
    expect({ pc: n.pendingChoice ?? null, ai1: handIds(n, "ai1"), ai2: handIds(n, "ai2") }).toEqual({ pc: null, ai1: ["ai1-l0", "ai1-l1"], ai2: ["ai2-h0"] });
  });
});

describe("the default AI", () => {
  it("⭐ casts it in its own main phase", () => {
    const s = table({ caster: "ai1", hands: { user: [BOLT], ai2: [GIANT], ai3: [BEARS] } });
    expect(pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"))?.cardId).toBe("h-syphon");
  });
});
