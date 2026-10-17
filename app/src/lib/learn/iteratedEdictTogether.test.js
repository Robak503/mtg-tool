/**
 * iteratedEdictTogether.test.js — the ITERATED-edict chain chooses, then acts together, one round at a time (2026-10-17).
 *
 * iteratedEdict.advanceEdictChain — Torment of Hailfire's rounds and Braids, Arisen Nightmare's "each opponent may sacrifice" —
 * carried each opponent's answer out AS IT WAS CHOSEN, so one round's sacrifices were several events. CR 101.4: the active player
 * chooses, then each other player in turn order, "Then the actions happen simultaneously." The bundled Torment of Hailfire rulings
 * (Scryfall, 2017-07-14) say it for this card: "each opponent in turn order makes their choice once, then all of the actions occur
 * simultaneously, then they repeat this process if it hasn't been done X times yet", and "Each repetition through this process is
 * done separately." One round's sacrifices are ONE event (CR 603.2c: a "one or more" watcher triggers once, a per-creature watcher
 * once per creature; every look-back read before any left, CR 603.10a); two rounds are two events (each repetition is the next
 * instruction, followed in order — CR 608.2c). Braids' "each opponent may sacrifice …" is one instruction; the life loss and the
 * draws are its next sentence.
 *
 * Before the fix, Torment with two opponents sacrificing creatures fired Great Fierce Bee ("Whenever one or more other creatures
 * die") once per opponent per round, a later opponent chose after an earlier one's permanent had already left, and the chain asked
 * the opponents in seat order from the first seat, not from the active player (CR 101.4).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, oracle-index.json, read in-session 2026-10-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { checkStepTriggers } from "./triggers.js";
import { advanceUntilDecision, applyEdictModeChoice } from "./learnSession.js";
import { autoPickEdictMode, resolveEdictModeChoice, resolveOptionalChoice, resolveSacrificeChoice } from "./effects/runProgram.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { setPendingEdictModeChoice } from "./pendingChoice.js";

beforeEach(() => _resetIdsForTests());

const TORMENT_OF_HAILFIRE = {"name":"Torment of Hailfire","type":"Sorcery","mana":"{X}{B}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card."};
const BRAIDS = {"name":"Braids, Arisen Nightmare","type":"Legendary Creature — Nightmare","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card.","power":"3","toughness":"3"};
const GREAT_FIERCE_BEE = {"name":"Great Fierce Bee","type":"Creature — Insect","mana":"{2}{B}","cmc":3,"keywords":["Scry","Flying"],"colors":["B"],"oracle":"Flying\nWhenever one or more other creatures die, scry 1. (Look at the top card of your library. You may put that card on the bottom.)","power":"2","toughness":"2"};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const EXQUISITE_BLOOD = {"name":"Exquisite Blood","type":"Enchantment","mana":"{4}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"Whenever an opponent loses life, you gain that much life."};
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."};
const MEGRIM = {"name":"Megrim","type":"Enchantment","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Whenever an opponent discards a card, this enchantment deals 2 damage to that player."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};

// [id, card] → a permanent `controller` controls, on the battlefield since turn 1.
const place = (controller) => ([id, card]) =>
  ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), enteredOnTurn: 1 });
const library = (seat) => Array.from({ length: 10 }, (_, i) => ({ id: `${seat}-L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }));
const POOL = { W: 0, U: 0, B: 4, R: 0, G: 0, C: 4 };
/** Seats on turn 6, first main phase; `boards` maps each seat to its battlefield, `hands` to its hand, `life` to its life total. */
function table(base, boards, { hands = {}, life = {}, active = "user" } = {}) {
  const players = { ...base.players };
  for (const seat of Object.keys(players)) {
    players[seat] = { ...players[seat], battlefield: (boards[seat] || []).map(place(seat)), hand: (hands[seat] || []).map((c, i) => ({ ...c, id: `${seat}-h${i}` })),
      graveyard: [], exile: [], library: library(seat), manaPool: { ...players[seat].manaPool, ...POOL }, ...(life[seat] != null ? { life: life[seat] } : {}) };
  }
  return { ...base, turn: 6, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const duel = (boards, opts) => table(createGameState({ userDeck: [], aiDeck: [] }), boards, opts);
const pod = (boards, opts) => table(createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), boards, opts);

const triggers = (s) => [...(s.stack || []).filter((o) => o.kind === "triggered-ability"), ...(s.pendingTriggers || [])].map((t) => `${t.controller}:${t.source?.name}`);
const countOf = (list, entry) => list.filter((x) => x === entry).length;
const together = (s) => (s.log || []).filter((e) => e.effect === "sacrifice-together").map((e) => e.sacrificed);
const singles = (s) => (s.log || []).filter((e) => e.effect === "sacrifice" && e.sacrificed != null).map((e) => e.sacrificed);
const bf = (s, seat) => s.players[seat].battlefield.map((p) => p.id);
const gy = (s, seat) => s.players[seat].graveyard.map((c) => c.id);
const lives = (s, seats) => seats.map((seat) => s.players[seat].life);

/** Cast Torment of Hailfire from `seat`'s hand with X = `x`, and resolve it to its first pause (or its end). */
function castTorment(s, seat, x) {
  const a = legalActionsForPlayer(s, seat).find((o) => o.kind === "cast-spell" && !o.altCost && o.cardId === `${seat}-h0` && o.xValue === x);
  expect(a).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}
/** The atom alone, for `controller` (the spell's own resolution is pinned by the cast tests). */
const tormentAtom = (s, controller, x) => ATOM_RESOLVERS["iterated-edict"](s, { op: "iterated-edict", amountX: true, targetType: null }, { controller, xValue: x, cardName: TORMENT_OF_HAILFIRE.name });
/** Answer every edict-mode pause the way the driver does for an AI, recording each pause's chooser and its sacrifice pool. */
function autoAnswer(s, seen = []) {
  let n = s;
  for (let g = 0; n.pendingChoice?.kind === "edict-mode" && g < 40; g++) {
    seen.push({ who: n.pendingChoice.controller, sac: n.pendingChoice.sac.map((c) => c.id) });
    n = resolveEdictModeChoice(n, autoPickEdictMode(n, n.pendingChoice));
  }
  return n;
}

describe("① Torment of Hailfire — one round's sacrifices are one event, and each round is its own", () => {
  it("⭐ a pod, X = 2, two opponents sacrificing creatures each round: Great Fierce Bee once per ROUND, Blood Artist once per creature", () => {
    // ai1 and ai2 sit at 3 life with no cards in hand, so each answers with its cheapest nonland permanent (autoPickEdictMode);
    // ai3 has nothing to sacrifice or discard, so it loses 3 each round with no choice.
    const s0 = pod({ user: [["bee", GREAT_FIERCE_BEE], ["artist", BLOOD_ARTIST]], ai1: [["a1m", MEMNITE], ["a1b", GRIZZLY_BEARS]], ai2: [["a2m", MEMNITE], ["a2b", GRIZZLY_BEARS]] },
      { hands: { user: [TORMENT_OF_HAILFIRE] }, life: { ai1: 3, ai2: 3 } });
    const seen = [];
    const paused = castTorment(s0, "user", 2);
    expect(paused.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai1" });
    const end = autoAnswer(paused, seen);
    expect(end.pendingChoice).toBeFalsy();
    expect(seen.map((x) => x.who)).toEqual(["ai1", "ai2", "ai1", "ai2"]);
    expect(together(end)).toEqual([["a1m", "a2m"], ["a1b", "a2b"]]);
    expect(singles(end)).toEqual([]);
    const t = triggers(end);
    expect(countOf(t, "user:Great Fierce Bee")).toBe(2);
    expect(countOf(t, "user:Blood Artist")).toBe(4);
    expect(lives(end, ["ai1", "ai2", "ai3"])).toEqual([3, 3, 34]);
    expect(gy(end, "user")).toEqual(["user-h0"]); // the spell finishes after the last round
  });

  it("⭐ nothing leaves while a choice of the round remains; the round's permanents are gone before the next round's first choice", () => {
    const s0 = pod({ ai1: [["a1m", MEMNITE], ["a1b", GRIZZLY_BEARS]], ai2: [["a2m", MEMNITE], ["a2b", GRIZZLY_BEARS]] },
      { hands: { user: [TORMENT_OF_HAILFIRE] }, life: { ai1: 3, ai2: 3 } });
    let s = castTorment(s0, "user", 2);
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a1m" });
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai2" });
    expect(bf(s, "ai1")).toEqual(["a1m", "a1b"]); // ai1's Memnite is chosen, still on the battlefield
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a2m" });
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai1" }); // round two
    expect([bf(s, "ai1"), bf(s, "ai2")]).toEqual([["a1b"], ["a2b"]]);
    expect(s.pendingChoice.sac.map((c) => c.id)).toEqual(["a1b"]);
    expect(together(s)).toEqual([["a1m", "a2m"]]);
  });

  it("⭐ mixed answers in one round: a sacrifice, a discard and a life loss all wait for the last choice, then each lands on its own player", () => {
    const s0 = pod({ ai1: [["a1m", MEMNITE]], ai2: [["a2s", SOL_RING]], ai3: [["a3m", MEMNITE]] },
      { hands: { user: [TORMENT_OF_HAILFIRE], ai2: [GRIZZLY_BEARS], ai3: [GRIZZLY_BEARS] } });
    let s = castTorment(s0, "user", 1);
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a1m" });
    s = resolveEdictModeChoice(s, { mode: "discard", cardId: "ai2-h0" });
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai3" });
    expect([bf(s, "ai1"), s.players.ai2.hand.map((c) => c.id)]).toEqual([["a1m"], ["ai2-h0"]]); // nothing carried out yet
    s = resolveEdictModeChoice(s, { mode: "life" });
    expect(s.pendingChoice).toBeFalsy();
    expect({ ai1: [bf(s, "ai1"), gy(s, "ai1"), s.players.ai1.life], ai2: [bf(s, "ai2"), gy(s, "ai2"), s.players.ai2.hand.length, s.players.ai2.life], ai3: [bf(s, "ai3"), s.players.ai3.hand.length, s.players.ai3.life] })
      .toEqual({ ai1: [[], ["c-a1m"], 40], ai2: [["a2s"], ["ai2-h0"], 0, 40], ai3: [["a3m"], 1, 37] });
    expect(singles(s)).toEqual(["a1m"]); // one sacrifice in the round is the single sacrifice
  });

  it("⭐ a permanent sacrificed in the round is gone when the round's life is lost: Exquisite Blood, sacrificed by ai2, does not see ai1 lose 3", () => {
    // ai1 has nothing to give, so it loses 3 with no choice; ai2 answers by sacrificing Exquisite Blood. The actions are simultaneous
    // (CR 101.4); a "whenever an opponent loses life" ability of a permanent leaving in that event never sees it (only leaves-the-
    // battlefield abilities look back, CR 603.10a).
    const s0 = pod({ ai2: [["eb", EXQUISITE_BLOOD]] }, { hands: { user: [TORMENT_OF_HAILFIRE], ai2: [GRIZZLY_BEARS] }, life: { ai2: 20 } });
    let s = castTorment(s0, "user", 1);
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai2" });
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "eb" });
    expect(s.pendingChoice).toBeFalsy();
    expect(lives(s, ["ai1", "ai3"])).toEqual([37, 37]);
    expect(countOf(triggers(s), "ai2:Exquisite Blood")).toBe(0);
    expect(gy(s, "ai2")).toEqual(["c-eb"]);
  });

  it("⭐ a discard in the round happens while the round's sacrifices are still on the battlefield: Rest in Peace sacrificed in the same round still exiles the discarded card (CR 614.1a), whichever opponent chose first", () => {
    const exiledOrBinned = (ripSeat, discSeat) => {
      _resetIdsForTests();
      let s = castTorment(pod({ [ripSeat]: [["rip", REST_IN_PEACE]], [discSeat]: [["dm", MEMNITE]] }, { hands: { user: [TORMENT_OF_HAILFIRE], [ripSeat]: [GRIZZLY_BEARS], [discSeat]: [GRIZZLY_BEARS] } }), "user", 1);
      for (let g = 0; s.pendingChoice?.kind === "edict-mode" && g < 10; g++) {
        const who = s.pendingChoice.controller;
        s = resolveEdictModeChoice(s, who === ripSeat ? { mode: "sacrifice", permId: "rip" } : who === discSeat ? { mode: "discard", cardId: `${discSeat}-h0` } : { mode: "life" });
      }
      const card = `${discSeat}-h0`;
      return { rip: bf(s, ripSeat).includes("rip"), exile: s.players[discSeat].exile.some((c) => c.id === card), graveyard: gy(s, discSeat).includes(card) };
    };
    expect(exiledOrBinned("ai1", "ai2")).toEqual({ rip: false, exile: true, graveyard: false }); // the sacrificer chose first
    expect(exiledOrBinned("ai2", "ai1")).toEqual({ rip: false, exile: true, graveyard: false }); // the discarder chose first
  });

  it("⭐ …but its discard watchers look after the sacrifices: Megrim, sacrificed by ai2, does not see ai1's discard", () => {
    const s0 = pod({ ai2: [["megrim", MEGRIM]] }, { hands: { user: [TORMENT_OF_HAILFIRE], ai1: [GRIZZLY_BEARS], ai2: [GRIZZLY_BEARS] }, life: { ai1: 20 } });
    let s = castTorment(s0, "user", 1);
    s = resolveEdictModeChoice(s, { mode: "discard", cardId: "ai1-h0" });
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "megrim" });
    expect(s.pendingChoice).toBeFalsy();
    expect([gy(s, "ai1"), gy(s, "ai2")]).toEqual([["ai1-h0"], ["c-megrim"]]);
    expect(countOf(triggers(s), "ai2:Megrim")).toBe(0);
  });

  it("⭐ the opponents choose in APNAP order — the active player's turn order, whoever controls the spell (CR 101.4)", () => {
    const pair = (seat) => [[`${seat}-m`, MEMNITE], [`${seat}-b`, GRIZZLY_BEARS]];
    let s = tormentAtom(pod({ user: pair("user"), ai1: pair("ai1"), ai2: pair("ai2"), ai3: pair("ai3") }, { active: "ai2" }), "ai2", 1);
    const asked = [];
    while (s.pendingChoice?.kind === "edict-mode") {
      asked.push(s.pendingChoice.controller);
      s = resolveEdictModeChoice(s, { mode: "life" });
    }
    expect(asked).toEqual(["ai3", "user", "ai1"]);
  });

  it("⭐ a discard choice stays face down until it is carried out (CR 101.4a); a sacrifice choice is known to the next chooser (CR 101.4b)", () => {
    const s0 = pod({ ai1: [["a1m", MEMNITE]], ai2: [["a2m", MEMNITE]] }, { hands: { user: [TORMENT_OF_HAILFIRE], ai1: [GRIZZLY_BEARS], ai2: [GRIZZLY_BEARS] } });
    let s = castTorment(s0, "user", 1);
    s = resolveEdictModeChoice(s, { mode: "discard", cardId: "ai1-h0" });
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a2m" });
    const chosen = s.log.filter((e) => e.kind === "edict-mode-chosen").map(({ controller, mode, chosen: c, cardName }) => ({ controller, mode, chosen: c, cardName }));
    expect(chosen).toEqual([
      { controller: "ai1", mode: "discard", chosen: undefined, cardName: undefined },
      { controller: "ai2", mode: "sacrifice", chosen: "a2m", cardName: "Memnite" },
    ]);
  });
});

describe("② a person is asked, and the round waits for the answer", () => {
  it("⭐ ai1's Torment: ai2's and ai3's sacrifices are locked in but not carried out while the user chooses, then all three go as one event", () => {
    const s0 = pod({ user: [["u1", GRIZZLY_BEARS], ["u2", MEMNITE]], ai2: [["a2m", MEMNITE], ["a2b", GRIZZLY_BEARS]], ai3: [["a3m", MEMNITE], ["a3b", GRIZZLY_BEARS]] },
      { hands: { ai1: [TORMENT_OF_HAILFIRE] }, life: { ai2: 3, ai3: 3 }, active: "ai1" });
    const paused = castTorment(s0, "ai1", 1);
    expect(paused.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai2" }); // APNAP from the active ai1
    const { session, decision } = advanceUntilDecision({ id: "s", status: "active", difficulty: "beginner", state: paused, decisionLog: [] });
    expect(decision.kind).toBe("edict-mode");
    expect(decision.controller).toBe("user");
    expect(decision.sac.map((c) => c.id)).toEqual(["u1", "u2"]);
    expect([bf(session.state, "ai2"), bf(session.state, "ai3")]).toEqual([["a2m", "a2b"], ["a3m", "a3b"]]);
    expect(session.state.pendingChoice.chosen).toEqual([
      { playerId: "ai2", mode: "sacrifice", permId: "a2m", round: 0 },
      { playerId: "ai3", mode: "sacrifice", permId: "a3m", round: 0 },
    ]);
    const after = applyEdictModeChoice(session, { mode: "sacrifice", permId: "u1" }).session.state;
    expect(together(after)).toEqual([["a2m", "a3m", "u1"]]);
    expect(singles(after)).toEqual([]);
    expect(gy(after, "ai1")).toContain("ai1-h0"); // the spell finished after the batch
  });
});

describe("③ Braids, Arisen Nightmare — the opponents' answers to one trigger are one event", () => {
  const endStep = (s) => {
    let n = finalizeStackResolution(checkStepTriggers({ ...s, phase: "ending", step: "end" }, "endStep"));
    for (let g = 0; n.stack.length && !n.pendingChoice && g < 20; g++) n = finalizeStackResolution(resolveTopOfStack(n));
    return n;
  };

  it("⭐ the user sacrifices Memnite; ai1 and ai2 each answer with a creature, together — Bee once for them (once for Memnite), Blood Artist per creature; ai3 has nothing to share, loses 2, the user draws", () => {
    const s0 = pod({ user: [["braids", BRAIDS], ["bee", GREAT_FIERCE_BEE], ["artist", BLOOD_ARTIST], ["um", MEMNITE]], ai1: [["a1b", GRIZZLY_BEARS]], ai2: [["a2m", MEMNITE]], ai3: [["a3f", FOREST]] });
    let s = resolveOptionalChoice(endStep(s0), true);
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    s = resolveSacrificeChoice(s, "um");
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai1" });
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a1b" });
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai2" });
    expect(bf(s, "ai1")).toEqual(["a1b"]); // chosen, not yet sacrificed
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a2m" });
    expect(s.pendingChoice).toBeFalsy();
    expect(singles(s)).toEqual(["um"]); // the user's own sacrifice is the first sentence — its own event
    expect(together(s)).toEqual([["a1b", "a2m"]]);
    const t = triggers(s);
    expect(countOf(t, "user:Great Fierce Bee")).toBe(2);
    expect(countOf(t, "user:Blood Artist")).toBe(3);
    expect(lives(s, ["ai1", "ai2", "ai3"])).toEqual([40, 40, 38]);
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["user-L0"]);
  });

  it("⭐ ai2's Braids on ai2's end step: the opponents answer in APNAP order from ai2 — ai3, the user, ai1 (CR 101.4)", () => {
    const s0 = pod({ ai2: [["braids", BRAIDS], ["a2m", MEMNITE]], user: [["ub", GRIZZLY_BEARS]], ai1: [["a1b", GRIZZLY_BEARS]], ai3: [["a3b", GRIZZLY_BEARS]] }, { active: "ai2" });
    let s = resolveOptionalChoice(endStep(s0), true);
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai2" });
    s = resolveSacrificeChoice(s, "a2m");
    const asked = [];
    while (s.pendingChoice?.kind === "edict-mode") {
      asked.push(s.pendingChoice.controller);
      s = resolveEdictModeChoice(s, { mode: "life" });
    }
    expect(asked).toEqual(["ai3", "user", "ai1"]);
    expect(lives(s, ["ai3", "user", "ai1"])).toEqual([38, 38, 38]);
  });
});

describe("④ controls — unchanged outcomes", () => {
  it("one opponent, X = 2, a creature each round: two single sacrifices, Bee once per round", () => {
    const s0 = duel({ user: [["bee", GREAT_FIERCE_BEE]], ai: [["am", MEMNITE], ["ab", GRIZZLY_BEARS]] }, { hands: { user: [TORMENT_OF_HAILFIRE] }, life: { ai: 3 } });
    const end = autoAnswer(castTorment(s0, "user", 2));
    expect(singles(end)).toEqual(["am", "ab"]);
    expect(together(end)).toEqual([]);
    expect(countOf(triggers(end), "user:Great Fierce Bee")).toBe(2);
  });

  it("every opponent keeps its board and loses the life: 3 a round each, nothing sacrificed or discarded", () => {
    const s0 = pod({ user: [["bee", GREAT_FIERCE_BEE]], ai1: [["a1m", MEMNITE]], ai2: [["a2m", MEMNITE]], ai3: [["a3s", SWAMP]] },
      { hands: { user: [TORMENT_OF_HAILFIRE], ai1: [GRIZZLY_BEARS] } });
    const end = autoAnswer(castTorment(s0, "user", 2));
    expect(lives(end, ["ai1", "ai2", "ai3"])).toEqual([34, 34, 34]);
    expect([bf(end, "ai1"), bf(end, "ai2"), bf(end, "ai3"), end.players.ai1.hand.length]).toEqual([["a1m"], ["a2m"], ["a3s"], 1]);
    expect([singles(end), together(end), countOf(triggers(end), "user:Great Fierce Bee")]).toEqual([[], [], 0]);
  });

  it("a pause from before the rounds were marked (no round on the queue, no chosen list) still settles each answer before the next choice", () => {
    const s0 = pod({ ai1: [["a1m", MEMNITE]], ai2: [["a2m", MEMNITE]] });
    let s = setPendingEdictModeChoice(s0, { controller: "ai1", modes: ["life", "sacrifice"], sac: [{ id: "a1m", name: "Memnite" }], disc: [], queue: [{ playerId: "ai1" }, { playerId: "ai2" }], sourceName: TORMENT_OF_HAILFIRE.name });
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a1m" });
    expect(s.pendingChoice).toMatchObject({ kind: "edict-mode", controller: "ai2" });
    expect(bf(s, "ai1")).toEqual([]); // the old chain's answer was carried out before the next opponent chose
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "a2m" });
    expect([singles(s), together(s)]).toEqual([["a1m", "a2m"], []]);
  });
});
