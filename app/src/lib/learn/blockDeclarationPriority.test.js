/**
 * THE DECLARE BLOCKERS STEP'S PRIORITY — a rules-faithfulness fix, every case driven through the engine's own entry points
 * (legalActionsForPlayer → dispatchAction → passPriority / resolveTopOfStack / nextStep) and, end to end, through the session
 * driver (advanceUntilDecision / applyChoice).
 *
 *    CR 509.1  — "First, the defending player declares blockers. This turn-based action doesn't use the stack."
 *    CR 509.2  — "Second, the active player gets priority."
 *    CR 509.2a — "Any abilities that triggered on blockers being declared or that triggered during the process described in
 *                 rule 509.1 are put onto the stack before the active player gets priority"
 *    CR 117.3d — a player who passes hands priority to the next player in turn order.
 *    CR 117.4  — "If all players pass in succession (that is, if all players pass without taking any actions in between
 *                 passing), the spell or ability on top of the stack resolves or, if the stack is empty, the phase or step ends."
 *    CR 500.2  — the step ends when the stack is empty and all players pass in succession.
 *
 * The bug: the engine took the block declaration one declare-blocker action at a time inside the step's first priority lap,
 * which began with the active player. The active player held priority before any block existed; the defending player
 * declared and passed; and the passes of that lap ended the step. So the attacking player never held priority with the
 * blocks declared (its trick after blocks was reachable only when another player acted first), in a pod the players seated
 * before the defending player never saw the blocks either, and a defending player could cast a spell in the middle of its
 * own declaration.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-18; the trailing comment is the tier
 * at generation). Per-test instance ids only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep } from "./gameEngine.js";
import { advanceUntilDecision, applyChoice } from "./learnSession.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const CENTAUR_COURSER = {"name":"Centaur Courser","type":"Creature — Centaur Warrior","mana":"{2}{G}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["G"],"oracle":""}; // native-body
const DEEPROOT_WARRIOR = {"name":"Deeproot Warrior","type":"Creature — Merfolk Warrior","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"Whenever this creature becomes blocked, it gets +1/+1 until end of turn."}; // native-trigger
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const inHand = (id, card) => ({ id, ...card });

/** A two-seat game on `active`'s turn (that seat holds priority), by default in the declare attackers step with no attacker yet. */
function table({ user = [], ai = [], userHand = [], aiHand = [], active = "user", step = "declare-attackers" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "combat", step, activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: userHand, library: [] },
      ai: { ...s0.players.ai, battlefield: ai, hand: aiHand, library: [] },
    },
  };
}
/** A four-seat Commander pod on the user's turn in the declare attackers step; ai2 holds Hill Giant. */
function pod() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0, turn: 5, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [P("gb", GRIZZLY_BEARS, "user")], library: [] },
      ai1: { ...s0.players.ai1, battlefield: [], library: [] },
      ai2: { ...s0.players.ai2, battlefield: [P("hg", HILL_GIANT, "ai2")], library: [] },
      ai3: { ...s0.players.ai3, battlefield: [], library: [] },
    },
  };
}

const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const kinds = (s, pid) => [...new Set(legalActionsForPlayer(s, pid).map((a) => a.kind))].sort();
/** Dispatch the first OFFERED action of `kind` for `pid` that satisfies `pred`; throws when none is offered (used only for setup). */
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid} at ${s.step}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
/** The declaring seat attacks with each id (setup), then passes once — the pass that closes the attack declaration. */
const attackWith = (s, seat, ids, defenderId = null) =>
  pass(ids.reduce((cur, id) => act(cur, seat, "declare-attacker", (a) => a.permanentId === id && (defenderId == null || a.defenderId === defenderId)), s));
/** Pass until the declare blockers step begins (throws if it never does — setup). */
function toBlockers(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.step !== "declare-blockers"; g++) cur = pass(cur);
  if (cur.step !== "declare-blockers") throw new Error(`never reached declare-blockers (at ${cur.step})`);
  return cur;
}
/** The Giant Growth cast `pid` is offered on `targetId`, or null. */
const ggOffer = (s, pid, targetId) => offered(s, pid, "cast-spell").find((a) => a.name === "Giant Growth" && (a.targets || []).some((t) => t.id === targetId)) || null;
/**
 * Walk the declare blockers step: `block` (a seat → [blockerId, attackerId] list) declares each listed block the first time its
 * seat holds priority, and every other priority is passed. Records one row per priority window until the step is left or
 * `stopWhen(state, windows)` holds. Never throws on a missing offer — what was offered is part of the row.
 */
function walkBlockers(s, { block = {}, stopWhen = () => false, limit = 40 } = {}) {
  let cur = s;
  const windows = [];
  const done = new Set();
  for (let g = 0; g < limit && cur.step === "declare-blockers" && !stopWhen(cur, windows); g++) {
    const h = cur.priorityHolder;
    if (block[h] && !done.has(h)) {
      done.add(h);
      for (const [blockerId, attackerId] of block[h]) {
        const a = offered(cur, h, "declare-blocker").find((x) => x.permanentId === blockerId && x.attackerId === attackerId);
        if (a) cur = dispatchAction(cur, a);
      }
    }
    windows.push({ holder: cur.priorityHolder, blocks: (cur.combat?.blockers || []).length, passes: cur.consecutivePasses, stack: cur.stack.length });
    cur = pass(cur);
  }
  return { state: cur, windows };
}

// The user's Grizzly Bears attacks into the AI's Hill Giant; the user holds Giant Growth and a Forest.
const bearsIntoGiant = (over = {}) => table({
  user: [P("gb", GRIZZLY_BEARS, "user"), P("f1", FOREST, "user")],
  userHand: [inHand("h-gg", GIANT_GROWTH)],
  ai: [P("hg", HILL_GIANT, "ai")],
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 509.2 — the active player gets priority after blockers are declared", () => {
  it("⭐ after the defending player blocks and passes, the step is still declare blockers, the attacking player holds priority with the pass count reset, the block is there, and Giant Growth is offered on its blocked attacker", () => {
    const s = toBlockers(attackWith(bearsIntoGiant(), "user", ["gb"]));
    const { state } = walkBlockers(s, { block: { ai: [["hg", "gb"]] }, stopWhen: (c) => (c.combat?.blockers || []).length > 0 && c.priorityHolder === "user" });
    const row = { step: state.step, holder: state.priorityHolder, passes: state.consecutivePasses, blocks: (state.combat?.blockers || []).map((b) => `${b.blockerId}>${b.attackerId}`), giantGrowth: !!ggOffer(state, "user", "gb") };
    expect(row).toEqual({ step: "declare-blockers", holder: "user", passes: 0, blocks: ["hg>gb"], giantGrowth: true });
  });

  it("⭐ the attacker's Giant Growth cast after the block resolves before combat damage: Grizzly Bears survives as a 5/5 and Hill Giant dies", () => {
    const s = toBlockers(attackWith(bearsIntoGiant(), "user", ["gb"]));
    const { state: afterBlocks } = walkBlockers(s, { block: { ai: [["hg", "gb"]] }, stopWhen: (c) => (c.combat?.blockers || []).length > 0 && c.priorityHolder === "user" });
    const gg = afterBlocks.step === "declare-blockers" ? ggOffer(afterBlocks, "user", "gb") : null;
    let cur = gg ? dispatchAction(afterBlocks, gg) : afterBlocks;
    const castInStep = gg ? cur.step : null;
    for (let g = 0; g < 30 && cur.step !== "end-of-combat"; g++) cur = pass(cur);
    const row = { cast: !!gg, castInStep, bears: cur.players.user.battlefield.some((p) => p.id === "gb"), bearsPower: permanentPower(cur, "gb"), giant: cur.players.ai.battlefield.some((p) => p.id === "hg") };
    expect(row).toEqual({ cast: true, castInStep: "declare-blockers", bears: true, bearsPower: 5, giant: false });
  });

  it("⭐ with no block declared the attacking player still gets priority in the declare blockers step, and its Giant Growth on the unblocked Grizzly Bears deals 5", () => {
    const s = toBlockers(attackWith(bearsIntoGiant(), "user", ["gb"]));
    // Nobody blocks: the step's first lap is passes only. Stop the first time the user holds priority after the AI passed.
    const { state } = walkBlockers(s, { stopWhen: (c, w) => c.priorityHolder === "user" && w.some((x) => x.holder === "ai") });
    const atBlockers = state.step === "declare-blockers" && state.priorityHolder === "user";
    const gg = atBlockers ? ggOffer(state, "user", "gb") : null;
    let cur = gg ? dispatchAction(state, gg) : state;
    for (let g = 0; g < 30 && cur.step !== "end-of-combat"; g++) cur = pass(cur);
    const row = { atBlockers, cast: !!gg, lifeLost: s.players.ai.life - cur.players.ai.life };
    expect(row).toEqual({ atBlockers: true, cast: true, lifeLost: 5 });
  });

  it("⭐ after the attacking player passes in that window, the defending player gets priority in the declare blockers step — before combat damage — and its own Giant Growth is offered", () => {
    const s = toBlockers(attackWith(bearsIntoGiant({ ai: [P("hg", HILL_GIANT, "ai"), P("af1", FOREST, "ai")], aiHand: [inHand("h-agg", GIANT_GROWTH)] }), "user", ["gb"]));
    const { state: afterBlocks } = walkBlockers(s, { block: { ai: [["hg", "gb"]] }, stopWhen: (c) => (c.combat?.blockers || []).length > 0 && c.priorityHolder === "user" });
    const next = afterBlocks.step === "declare-blockers" ? pass(afterBlocks) : afterBlocks;
    const row = { step: next.step, holder: next.priorityHolder, passes: next.consecutivePasses, aiGiantGrowth: !!ggOffer(next, "ai", "hg") };
    expect(row).toEqual({ step: "declare-blockers", holder: "ai", passes: 1, aiGiantGrowth: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 509.1 — no player has priority while blockers are declared", () => {
  it("⭐ at the start of the step the active player is offered only the pass — no spell before any block exists", () => {
    const s = toBlockers(attackWith(bearsIntoGiant(), "user", ["gb"]));
    const row = { holder: s.priorityHolder, blocks: (s.combat?.blockers || []).length, kinds: kinds(s, "user") };
    expect(row).toEqual({ holder: "user", blocks: 0, kinds: ["pass-priority"] });
  });

  it("⭐ the defending player is offered its blocks and the pass, never a spell, in the middle of its own declaration", () => {
    const s = toBlockers(attackWith(bearsIntoGiant({ ai: [P("hg", HILL_GIANT, "ai"), P("af1", FOREST, "ai")], aiHand: [inHand("h-agg", GIANT_GROWTH)] }), "user", ["gb"]));
    const atDefender = pass(s); // the active player's pass of the declaration lap
    const beforeBlock = { holder: atDefender.priorityHolder, kinds: kinds(atDefender, "ai") };
    const blocked = act(atDefender, "ai", "declare-blocker", (a) => a.permanentId === "hg");
    const afterBlock = { holder: blocked.priorityHolder, kinds: kinds(blocked, "ai") };
    expect({ beforeBlock, afterBlock }).toEqual({
      beforeBlock: { holder: "ai", kinds: ["declare-blocker", "pass-priority"] },
      afterBlock: { holder: "ai", kinds: ["pass-priority"] },
    });
  });

  it("⭐ once the declaration has closed no block is offered: the defending player holding priority in the step — Deeproot Warrior's trigger on the stack, then after it resolved — can't add Grizzly Bears to the combat", () => {
    const s = toBlockers(attackWith(table({ user: [P("dw", DEEPROOT_WARRIOR, "user")], ai: [P("hg", HILL_GIANT, "ai"), P("gb", GRIZZLY_BEARS, "ai")] }), "user", ["dw"]));
    let cur = pass(s); // the active player's pass of the declaration lap
    cur = act(cur, "ai", "declare-blocker", (a) => a.permanentId === "hg"); // Hill Giant blocks; Grizzly Bears stays home
    const offeredAtDeclaration = offered(cur, "ai", "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`);
    cur = pass(cur); // the defending player's pass ends its declaration
    const later = [];
    for (let g = 0; g < 12 && cur.step === "declare-blockers"; g++) {
      if (cur.priorityHolder === "ai") later.push({ stack: cur.stack.length, blocks: offered(cur, "ai", "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`) });
      cur = pass(cur);
    }
    expect({ offeredAtDeclaration, later }).toEqual({ offeredAtDeclaration: ["gb>dw"], later: [{ stack: 1, blocks: [] }, { stack: 0, blocks: [] }] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 509.2a — the block triggers are on the stack before the active player gets priority", () => {
  it("Deeproot Warrior's becomes-blocked trigger is already on the stack the first time the active player holds priority after the block, and it resolves before combat damage", () => {
    const s = toBlockers(attackWith(table({ user: [P("dw", DEEPROOT_WARRIOR, "user")], ai: [P("hg", HILL_GIANT, "ai")] }), "user", ["dw"]));
    const { state } = walkBlockers(s, { block: { ai: [["hg", "dw"]] }, stopWhen: (c, w) => c.priorityHolder === "user" && w.some((x) => x.holder === "ai") });
    const atTrigger = { step: state.step, holder: state.priorityHolder, passes: state.consecutivePasses, stack: state.stack.map((o) => o.source?.name ?? o.sourceName ?? o.kind) };
    let cur = state;
    for (let g = 0; g < 10 && cur.stack.length; g++) cur = pass(cur);
    const resolved = { step: cur.step, power: permanentPower(cur, "dw") };
    expect({ atTrigger, resolved }).toEqual({
      atTrigger: { step: "declare-blockers", holder: "user", passes: 0, stack: ["Deeproot Warrior"] },
      resolved: { step: "declare-blockers", power: 3 },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 509.2, 117.3d — in a pod every player gets priority after the blocks, the active player first, in turn order", () => {
  it("⭐ the user attacks ai2; after ai2 blocks, priority runs user → ai1 → ai2 → ai3 inside the declare blockers step, and the step ends after the fourth pass", () => {
    const s = toBlockers(attackWith(pod(), "user", ["gb"], "ai2"));
    const { state, windows } = walkBlockers(s, { block: { ai2: [["hg", "gb"]] } });
    const afterBlocks = windows.filter((w) => w.blocks > 0).map((w) => `${w.holder}:${w.passes}`);
    expect({ afterBlocks, leftInto: state.step }).toEqual({ afterBlocks: ["ai2:2", "ai3:3", "user:0", "ai1:1", "ai2:2", "ai3:3"], leftInto: "first-strike-damage" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 117.4, 500.2 — the step still ends (controls)", () => {
  it("with nobody acting, the declare blockers step ends within two laps of passes and combat damage is dealt: Grizzly Bears dies to Hill Giant", () => {
    const s = toBlockers(attackWith(bearsIntoGiant(), "user", ["gb"]));
    const { state, windows } = walkBlockers(s, { block: { ai: [["hg", "gb"]] } });
    let cur = state;
    for (let g = 0; g < 10 && cur.step !== "end-of-combat"; g++) cur = pass(cur);
    const row = { left: state.step !== "declare-blockers", withinTwoLaps: windows.length <= 2 * 2, bears: cur.players.user.battlefield.some((p) => p.id === "gb"), giant: cur.players.ai.battlefield.some((p) => p.id === "hg") };
    expect(row).toEqual({ left: true, withinTwoLaps: true, bears: false, giant: true });
  });

  it("with no attacker declared the declare blockers step never begins (CR 508.8)", () => {
    let cur = pass(bearsIntoGiant()); // the user declares nothing; its pass closes the empty declaration
    const steps = [];
    for (let g = 0; g < 10 && cur.phase === "combat"; g++) { steps.push(cur.step); cur = pass(cur); }
    expect(steps.includes("declare-blockers")).toBe(false);
  });

  it("a pod with nobody acting leaves the step within two laps of passes", () => {
    const s = toBlockers(attackWith(pod(), "user", ["gb"], "ai2"));
    const { state, windows } = walkBlockers(s, {});
    expect({ left: state.step, withinTwoLaps: windows.length <= 2 * 4 }).toEqual({ left: "first-strike-damage", withinTwoLaps: true });
  });

  it("a state built inside the step after the declaration (blocks recorded, nothing open) offers the holder its instants, and one lap of passes ends the step", () => {
    const s = {
      ...bearsIntoGiant(),
      step: "declare-blockers",
      combat: { attackers: [{ permanentId: "gb", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "hg", blockingPlayer: "ai", attackerId: "gb" }], declaredAttackerCount: 1 },
    };
    const offeredGG = !!ggOffer(s, "user", "gb");
    const after = pass(pass(s));
    expect({ offeredGG, left: after.step }).toEqual({ offeredGG: true, left: "first-strike-damage" });
  });

  it("a forced advance out of the step (nextStep) fires the block trigger once and holds in the step with the active player's priority", () => {
    const s = toBlockers(attackWith(table({ user: [P("dw", DEEPROOT_WARRIOR, "user")], ai: [P("hg", HILL_GIANT, "ai")] }), "user", ["dw"]));
    const blocked = act(pass(s), "ai", "declare-blocker", (a) => a.permanentId === "hg");
    const held = nextStep(blocked);
    let cur = held;
    for (let g = 0; g < 10 && cur.stack.length; g++) cur = pass(cur);
    const left = nextStep(cur);
    expect({ step: held.step, holder: held.priorityHolder, stack: held.stack.length, leftInto: left.step, power: permanentPower(cur, "dw") })
      .toEqual({ step: "declare-blockers", holder: "user", stack: 1, leftInto: "first-strike-damage", power: 3 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("end to end through the session driver", () => {
  /** Run the session, answering each human ask with `answer(decision, session)`; collect every ask until combat ends. */
  function drive(s0, answer) {
    let { session, decision } = advanceUntilDecision({ status: "active", state: s0, difficulty: "beginner", decisionLog: [] });
    const asks = [];
    for (let g = 0; g < 40 && decision.kind === "ask" && session.state.turn === 5 && session.state.phase === "combat"; g++) {
      asks.push({ step: session.state.step, blocks: (session.state.combat?.blockers || []).length, giantGrowth: decision.options.some((a) => a.kind === "cast-spell" && a.name === "Giant Growth") });
      ({ session, decision } = applyChoice(session, answer(decision, session)));
    }
    return { session, decision, asks };
  }
  const passOption = (d) => d.options.find((a) => a.kind === "pass-priority");

  it("⭐ the human attacking: after the AI's block the human is asked in the declare blockers step with the block on the board and Giant Growth among the options — and is never asked there before the block", () => {
    const { session, asks } = drive(bearsIntoGiant(), (d) => d.options.find((a) => a.kind === "declare-attacker" && a.permanentId === "gb") || passOption(d));
    const atBlockers = asks.filter((a) => a.step === "declare-blockers");
    const blocked = session.state.log.some((e) => e.kind === "block-declared" && e.blockerId === "hg");
    expect({ blocked, atBlockers }).toEqual({ blocked: true, atBlockers: [{ step: "declare-blockers", blocks: 1, giantGrowth: true }] });
  });

  it("⭐ the default AI attacking: Grizzly Bears blocked by Hill Giant, it casts Giant Growth after the block — its Bears survives and Hill Giant dies", () => {
    const s = table({
      ai: [P("gb", GRIZZLY_BEARS, "ai"), P("af1", FOREST, "ai")],
      aiHand: [inHand("h-agg", GIANT_GROWTH)],
      user: [P("hg", HILL_GIANT, "user")],
      active: "ai",
    });
    const declared = act(s, "ai", "declare-attacker", (a) => a.permanentId === "gb");
    const { session } = drive(declared, (d) => d.options.find((a) => a.kind === "declare-blocker" && a.permanentId === "hg") || passOption(d));
    const log = session.state.log.filter((e) => e.turn === 5);
    const row = {
      blocked: log.some((e) => e.kind === "block-declared" && e.blockerId === "hg"),
      bears: session.state.players.ai.battlefield.some((p) => p.id === "gb"),
      giant: session.state.players.user.battlefield.some((p) => p.id === "hg"),
      ggInGraveyard: session.state.players.ai.graveyard.some((c) => c.name === "Giant Growth"),
      ggCastStep: session.decisionLog.find((d) => d.actor === "ai" && d.action?.kind === "cast-spell" && d.action?.name === "Giant Growth")?.step ?? null,
    };
    expect(row).toEqual({ blocked: true, bears: true, giant: false, ggInGraveyard: true, ggCastStep: "declare-blockers" });
  });

  it("the default AI defending: its Hill Giant blocks the human's Centaur Courser and its Giant Growth wins the trade before combat damage — Hill Giant survives, Centaur Courser dies", () => {
    const s = table({
      user: [P("cc", CENTAUR_COURSER, "user")],
      ai: [P("hg", HILL_GIANT, "ai"), P("af1", FOREST, "ai")],
      aiHand: [inHand("h-agg", GIANT_GROWTH)],
    });
    const { session } = drive(s, (d) => d.options.find((a) => a.kind === "declare-attacker" && a.permanentId === "cc") || passOption(d));
    const row = {
      blocked: session.state.log.some((e) => e.kind === "block-declared" && e.blockerId === "hg"),
      ggCastStep: session.decisionLog.find((d) => d.actor === "ai" && d.action?.kind === "cast-spell" && d.action?.name === "Giant Growth")?.step ?? null,
      courser: session.state.players.user.battlefield.some((p) => p.id === "cc"),
      giant: session.state.players.ai.battlefield.some((p) => p.id === "hg"),
    };
    expect(row).toEqual({ blocked: true, ggCastStep: "declare-blockers", courser: false, giant: true });
  });

  it("the default AI defending: its Hill Giant blocks the human's Grizzly Bears and its Giant Growth is not wasted on a block it already wins", () => {
    const s = bearsIntoGiant({ userHand: [], ai: [P("hg", HILL_GIANT, "ai"), P("af1", FOREST, "ai")], aiHand: [inHand("h-agg", GIANT_GROWTH)] });
    const { session } = drive(s, (d) => d.options.find((a) => a.kind === "declare-attacker" && a.permanentId === "gb") || passOption(d));
    const row = {
      blocked: session.state.log.some((e) => e.kind === "block-declared" && e.blockerId === "hg"),
      bears: session.state.players.user.battlefield.some((p) => p.id === "gb"),
      giant: session.state.players.ai.battlefield.some((p) => p.id === "hg"),
      ggInHand: session.state.players.ai.hand.some((c) => c.name === "Giant Growth"),
    };
    expect(row).toEqual({ blocked: true, bears: false, giant: true, ggInHand: true });
  });
});
