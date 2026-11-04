/**
 * palantirOfOrthanc.test.js — PALANTÍR OF ORTHANC (the play-weighted program, EDHREC #1343):
 *
 *   "At the beginning of your end step, put an influence counter on Palantír of Orthanc and scry 2. Then target opponent may have
 *    you draw a card. If that player doesn't, you mill X cards, where X is the number of influence counters on Palantír of
 *    Orthanc, and that player loses life equal to the total mana value of those cards."
 *
 * The punisher (CR 118.12): the TARGETED OPPONENT decides — the optional-effect pause asked of that player (a person at the
 * yes/no panel, the default AI by punisherAutoTake); yes, the Palantír's controller draws a card; no, they mill X (the influence
 * counters as it resolves — CR 608.2h, the counters it had as it last existed if it has left), and the decider loses life equal
 * to the milled cards' total mana value, read where they went (CR 701.17c — a public zone; Rest in Peace's exile too; a land is
 * 0). It loses life — it is not dealt damage (CR 119.3). The counter and the scry come first, in the printed order. The ability's
 * one target is the opponent; if that target is illegal as it resolves the ability does nothing at all (CR 608.2b — the bundled
 * ruling: "You won't put an influence counter on Palantír of Orthanc, and you won't scry, draw, or mill."). Witnessed through
 * real game states, for the person and the default AI on both sides of the choice.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, passPriority, raiseTriggerTargetChoice, resolveTopOfStack, settleTriggerTargetChoice } from "./gameEngine.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";
import { optionalAutoTakeValue, resolveOptionalChoice, resolveScryChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PALANTIR = {"name":"Palantír of Orthanc","type":"Legendary Artifact","mana":"{3}","oracle":"At the beginning of your end step, put an influence counter on Palantír of Orthanc and scry 2. Then target opponent may have you draw a card. If that player doesn't, you mill X cards, where X is the number of influence counters on Palantír of Orthanc, and that player loses life equal to the total mana value of those cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Mill","Scry"],"colors":[],"colorIdentity":[]}; // EDHREC #1343
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","oracle":"Destroy target artifact.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #14015
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2307
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
// The Palantír's controller's library, top first: Hill Giant (4), Lightning Bolt (1), Mountain (0), Craw Wurm (6), then Mountains.
const LIB = () => [GIANT, BOLT, MOUNTAIN, WURM, ...Array.from({ length: 8 }, () => MOUNTAIN)];

/**
 * `seat`'s postcombat main on turn 5 (heads-up unless `pod`): the Palantír with `influence` counters already on it, `board`
 * beside it, `hand`; `life` per seat. The person plays the user seat when `human`.
 */
function table({ seat = "user", pod = false, influence = 0, board = [], foes = {}, hand = [], life = {}, human = false, pool = {} } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    const mine = pid === seat;
    players[pid] = { ...pl, life: life[pid] ?? pl.life, graveyard: [], exile: [],
      battlefield: mine ? [on(pid, "pal", PALANTIR, influence ? { counters: { influence } } : {}), ...board] : (foes[pid] || []),
      hand: mine ? hand.map((c, i) => ({ ...c, id: `h${i}` })) : [],
      library: (mine ? LIB() : Array.from({ length: 10 }, () => MOUNTAIN)).map((c, i) => ({ ...c, id: `${pid}-l${i}` })),
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(mine ? pool : {}) } };
  }
  return { ...g, ...(human ? { humanSeats: ["user"] } : {}), turn: 5, phase: "postcombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const palOnStack = (s) => (s.stack || []).find((o) => o.source?.name === "Palantír of Orthanc");
/**
 * Run to the end of the turn. The scry keeps both cards on top (the default); each punisher pause is answered by `answer(state,
 * pc)`; a person's target question for the Palantír is answered with `pick`; `respond(state)` acts once while the Palantír's
 * ability is on the stack and its controller holds priority. Records each scry and each decider asked.
 */
function run(s0, { answer = (s, pc) => optionalAutoTakeValue(s, pc), pick = null, respond = null } = {}) {
  let s = s0;
  const asked = [];
  const scried = [];
  let responded = false;
  for (let g = 0; g < 400 && s.turn === s0.turn; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "scry-surveil") { scried.push({ seat: pc.controller, cards: pc.cards.map((c) => c.id) }); s = resolveScryChoice(s, pc.cards.map((c) => c.id)); continue; }
    if (pc?.kind === "optional-effect") { asked.push(pc.controller); s = resolveOptionalChoice(s, answer(s, pc)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (pick && (s.stack || []).some((o) => o.awaitingTargets)) {
      const q = raiseTriggerTargetChoice(s);
      const row = q.pendingChoice.candidates.find((c) => c.targets.some((t) => t.id === pick));
      expect(row, `no target row ${pick}`).toBeTruthy();
      s = settleTriggerTargetChoice(q, row.id);
      continue;
    }
    if (respond && !responded && palOnStack(s) && s.priorityHolder === s0.activePlayer) { responded = true; s = respond(s); continue; }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s, asked, scried };
}
const influenceOn = (s, seat = "user") => { const p = s.players[seat].battlefield.find((x) => x.id === "pal"); return p ? (p.counters?.influence ?? 0) : null; };
const names = (zone) => zone.map((c) => c.name);

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(PALANTIR)).toBe("native-trigger");
  });
});

describe("the person's Palantír — the default AI decides", () => {
  it("⭐ the first end step: one counter, scry 2, the AI (40 life) refuses the draw — the person mills one (Hill Giant), the AI loses 4", () => {
    const { s, asked, scried } = run(table());
    expect({ influence: influenceOn(s), scried, asked, yard: names(s.players.user.graveyard), hand: s.players.user.hand.length, ai: s.players.ai.life })
      .toEqual({ influence: 1, scried: [{ seat: "user", cards: ["user-l0", "user-l1"] }], asked: ["ai"], yard: ["Hill Giant"], hand: 0, ai: 36 });
  });
  it("⭐ X is the counters as it resolves: two already on it, now three — Hill Giant, Lightning Bolt and a Mountain milled, 5 life", () => {
    const { s } = run(table({ influence: 2 }));
    expect({ influence: influenceOn(s), yard: names(s.players.user.graveyard), ai: s.players.ai.life })
      .toEqual({ influence: 3, yard: ["Hill Giant", "Lightning Bolt", "Mountain"], ai: 35 });
  });
  it("⭐ the AI low on life (12) lets the person draw rather than risk it: one card drawn, nothing milled, no life lost", () => {
    const { s, asked } = run(table({ influence: 1, life: { ai: 12 } }));
    expect({ asked, hand: names(s.players.user.hand), yard: s.players.user.graveyard.length, ai: s.players.ai.life })
      .toEqual({ asked: ["ai"], hand: ["Hill Giant"], yard: 0, ai: 12 });
  });
  it("⭐ Rest in Peace: the milled cards are exiled — their total still counts (4 + 1)", () => {
    const { s } = run(table({ influence: 1, board: [on("user", "rip", RIP)] }));
    expect({ exile: names(s.players.user.exile), yard: s.players.user.graveyard.length, ai: s.players.ai.life })
      .toEqual({ exile: ["Hill Giant", "Lightning Bolt"], yard: 0, ai: 35 });
  });
  it("⭐ in a pod the person picks which opponent: ai2 is asked and loses the life, ai1 and ai3 untouched", () => {
    const { s, asked } = run(table({ pod: true, human: true }), { pick: "ai2" });
    expect({ asked, life: [s.players.ai1.life, s.players.ai2.life, s.players.ai3.life] }).toEqual({ asked: ["ai2"], life: [40, 36, 40] });
  });
  it("⭐ the Palantír Shattered in response: no counter placed, but the scry and the choice still happen — X is the two it had as it left", () => {
    const respond = (st) => dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.kind === "cast-spell" && a.name === "Shatter" && (a.targets || []).some((t) => t.id === "pal")));
    const { s, scried } = run(table({ influence: 2, hand: [SHATTER], board: [on("user", "mt0", MOUNTAIN), on("user", "mt1", MOUNTAIN)] }), { respond });
    expect({ palantir: s.players.user.battlefield.some((p) => p.id === "pal"), scried: scried.length, yard: names(s.players.user.graveyard).sort(), ai: s.players.ai.life })
      .toEqual({ palantir: false, scried: 1, yard: ["Hill Giant", "Lightning Bolt", "Palantír of Orthanc", "Shatter"], ai: 35 });
  });
});

describe("the AI's Palantír — the person decides", () => {
  it("⭐ the person says yes: the AI draws a card — nothing milled, no life lost", () => {
    const { s, asked } = run(table({ seat: "ai", human: true }), { answer: () => true });
    expect({ asked, aiHand: s.players.ai.hand.length, aiYard: s.players.ai.graveyard.length, user: s.players.user.life, influence: influenceOn(s, "ai") })
      .toEqual({ asked: ["user"], aiHand: 1, aiYard: 0, user: 40, influence: 1 });
  });
  it("⭐ the person says no: the AI mills one (Hill Giant) and the person loses 4", () => {
    const { s, asked } = run(table({ seat: "ai", human: true }), { answer: () => false });
    expect({ asked, aiHand: s.players.ai.hand.length, aiYard: names(s.players.ai.graveyard), user: s.players.user.life })
      .toEqual({ asked: ["user"], aiHand: 0, aiYard: ["Hill Giant"], user: 36 });
  });
});

describe("controls", () => {
  it("control (CR 608.2b): the targeted opponent leaves the game in response (Bolted at 3 life) — no counter, no scry, no draw, no mill", () => {
    // The Bolt resolves; ai2 at 0 life leaves the game the way the session's state-based check removes a player (CR 104.3b, 800.4a).
    const respond = (st) => {
      const bolted = resolveTopOfStack(dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.kind === "cast-spell" && a.name === "Lightning Bolt" && (a.targets || []).some((t) => t.id === "ai2"))));
      expect(bolted.players.ai2.life).toBe(0);
      return removePlayerFromGame(bolted, "ai2");
    };
    const { s, scried, asked } = run(table({ pod: true, human: true, influence: 1, life: { ai2: 3 }, hand: [BOLT], board: [on("user", "mt0", MOUNTAIN)] }), { pick: "ai2", respond });
    expect({ ai2: !!s.players.ai2, influence: influenceOn(s), scried, asked, library: s.players.user.library.length, hand: s.players.user.hand.length })
      .toEqual({ ai2: false, influence: 1, scried: [], asked: [], library: 12, hand: 0 });
  });
  it("control: an opponent's end step — the person's Palantír doesn't trigger", () => {
    const s0 = table({ seat: "ai", human: false });
    const swapped = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [] }, user: { ...s0.players.user, battlefield: [on("user", "pal", PALANTIR)] } } };
    const { s, scried, asked } = run(swapped);
    expect({ influence: influenceOn(s), scried, asked }).toEqual({ influence: 0, scried: [], asked: [] });
  });
});
