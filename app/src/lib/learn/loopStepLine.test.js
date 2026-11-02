/**
 * loopStepLine.test.js — a loop step that adds nothing it can use is not a play.
 *
 * THE RULE (Colton, 2026-10-03): "A combo deck's AI plays to its combo line: build the resource only to 'enough', then forgo other
 * choices, then execute the finish. Never make infinite anything." loopStepLine.js names the offered loop steps and holds the ones
 * that add nothing the seat can use; every action stays offered.
 *
 * THE CASES (Omnath's 10,000-game Squirrel Girl run on v0.169.0: 110 turn stalls, Kinnan Mana Overload at 108 of them):
 *   - THE RECAST (the default AI, seed 3277877396, turn 34): Tidespout Tyrant with every opponent's permanent gone returned the
 *     caster's own permanent on each cast, and the AI cast it again — 5,417 forced self-bounces in one turn.
 *   - THE UNTAP (the persona pilots, e.g. seeds 100061 / 100258 / 100828 / 100994): Kinnan, Bonder Prodigy with Basalt Monolith and
 *     Grim Monolith, untapping them thousands of times in one turn with nothing to spend the mana on.
 *   - THE EMPTY LIBRARY (seed 100358): Thrasios, Triton Hero activated 1,911 more times after its controller's library was empty.
 * The persona pilots (omnath-tools decide.mjs, LOOP RESTRAINT R1) read the engine's "enough" through the tokenLoopLine seam
 * ({ tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan }: an action is held when `loop.holdLoop && isTokenLoopAction(loop,
 * action)`); `seamPilot` below is that contract with a taste for activations. Its seam is loopStepLine.withLoopSteps over
 * tokenLoopLine — before this file's slice there was no such module, and the witness reads the token seam alone (`seam()`).
 *
 * WHAT IS PINNED: the default AI stops recasting under a forced self-bounce and wins with the swing it has; the recast stays a play
 * while the trigger still has something on an opponent's side to take; a seat-pilot on the seam stops a Kinnan untap loop that has
 * nothing to spend on, builds it to enough for a fixed-cost finisher it then casts, and takes neither Thrasios nor its paying untap
 * once the library is empty; a person can take the untap loop as many times as they choose (CR 732.1b, 732.2a). The reads under
 * them are pinned in loopStepReads.test.js.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGame, nextDecision, act } from "./gameApi.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import * as tokenLoopLine from "./tokenLoopLine.js";

beforeEach(() => _resetIdsForTests());

// The slice's module — absent on the base this file's witnesses were first run on, where a pilot had the token seam alone.
const loopStepLine = await import("./loopStepLine.js").catch(() => null);
const seam = () => (loopStepLine ? loopStepLine.withLoopSteps(tokenLoopLine) : tokenLoopLine);

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const KINNAN = {"name":"Kinnan, Bonder Prodigy","type":"Legendary Creature — Human Druid","mana":"{G}{U}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G","U"],"oracle":"Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."};
const BASALT_MONOLITH = {"name":"Basalt Monolith","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact."};
const GRIM_MONOLITH = {"name":"Grim Monolith","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{4}: Untap this artifact."};
const THRASIOS = {"name":"Thrasios, Triton Hero","type":"Legendary Creature — Merfolk Wizard","mana":"{G}{U}","cmc":2,"power":"1","toughness":"3","keywords":["Partner","Scry"],"colors":["G","U"],"oracle":"{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)"};
const TIDESPOUT_TYRANT = {"name":"Tidespout Tyrant","type":"Creature — Djinn","mana":"{5}{U}{U}{U}","cmc":8,"power":"5","toughness":"5","keywords":["Flying"],"colors":["U"],"oracle":"Flying\nWhenever you cast a spell, return target permanent to its owner's hand."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const SEARING_FLESH = {"name":"Searing Flesh","type":"Sorcery","mana":"{6}{R}","cmc":7,"keywords":[],"colors":["R"],"oracle":"Searing Flesh deals 7 damage to target opponent or planeswalker."};
const ARCANE_ENCYCLOPEDIA = {"name":"Arcane Encyclopedia","type":"Artifact — Book","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"{3}, {T}: Draw a card."};
const LABORATORY_MANIAC = {"name":"Laboratory Maniac","type":"Creature — Human Wizard","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["U"],"oracle":"If you would draw a card while your library has no cards in it, you win the game instead."};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};

// ── two-player sessions (Standard; the seat under test is the one the session starts on) ─────────────────────────────
const deck = (prefix, card = ISLAND, n = 40) => Array.from({ length: n }, (_, i) => ({ ...card, id: `${prefix}-${i}` }));

/**
 * A session whose state is replaced by the board under test. `mine` / `theirs` are { battlefield, hand, library, life };
 * `at` is { active: "me" | "them", phase, step }. Priority starts with the active player and an empty stack.
 */
function sessionAt({ mine = {}, theirs = {}, at = {}, difficulty = "expert", log = [] } = {}) {
  const session = difficulty === "expert"
    ? createGame({ userDeck: deck("u"), opponentDeck: deck("a", FOREST), difficulty, mode: "standard", seed: "loop-step" })
    : createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a", FOREST), difficulty, mode: "standard" });
  const s = session.state;
  const me = difficulty === "expert" ? s.activePlayer : "user";
  const them = Object.keys(s.players).find((id) => id !== me);
  const P = (owner) => (card, id, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: owner, summoningSick: false }), ...extra });
  const seatState = (id, side, defaults) => ({
    ...s.players[id],
    battlefield: (side.battlefield || []).map(([card, pid, extra]) => P(id)(card, pid, extra)),
    hand: (side.hand || []).map((card, i) => ({ ...card, id: `${id}-hand-${i}` })),
    library: side.library ?? deck(`${id}-lib`, defaults.libraryCard, 20),
    life: side.life ?? 20,
  });
  const active = at.active === "them" ? them : me;
  const state = {
    ...s, turn: 5, phase: at.phase ?? "precombat-main", step: at.step ?? "main", activePlayer: active, priorityHolder: active,
    consecutivePasses: 0, stack: [], pendingTriggers: [],
    log: [...(s.log || []), ...log.map((e) => ({ turn: 5, ...e, playerId: e.playerId === "me" ? me : e.playerId }))],
    players: { ...s.players, [me]: seatState(me, mine, { libraryCard: ISLAND }), [them]: seatState(them, theirs, { libraryCard: FOREST }) },
  };
  return { session: { ...session, state }, me, them };
}

/** Count this seat's chosen actions by turn, from the driver's recorder. */
function tally(seat) {
  const rows = [];
  return {
    recordDecision: (row) => { if (row?.seat === seat) rows.push(row); },
    count: (turn, test) => rows.filter((r) => r.turn === turn && test(r.action || {})).length,
  };
}
const isCast = (name) => (a) => a.kind === "cast-spell" && a.name === name;
const isActivationOf = (pid) => (a) => a.kind === "activate-ability" && a.permanentId === pid;

/**
 * A pilot that reads the engine's "enough" through the seam the way the persona pilots do (R1: `loop.holdLoop &&
 * isTokenLoopAction(loop, a)` holds an action; R2: never an activation of a permanent whose own activation is still on the stack)
 * and loves activations: an untap of its own first, then any other activation; with none left it answers nothing and the engine's
 * own pick stands.
 */
function seamPilot(theSeam) {
  return ({ state, legalActions, seat }) => {
    const loop = theSeam.tokenLoopState(state, seat);
    const open = loop?.holdLoop ? legalActions.filter((a) => !theSeam.isTokenLoopAction(loop, a)) : legalActions;
    const pending = new Set((state.stack || []).filter((o) => o?.kind === "activated-ability" && o.controller === seat).map((o) => o.payload?.params?.sourceId));
    const activations = open.filter((a) => a.kind === "activate-ability" && !pending.has(a.permanentId));
    const untap = activations.find((a) => (a.program?.atoms || []).length === 1 && a.program.atoms[0].op === "untap");
    return untap ?? activations[0] ?? undefined;
  };
}
const routeFor = (seat, pilot) => (bag) => (bag.seat === seat ? pilot(bag) : undefined);

describe("THE RECAST — the default AI under its own forced cast trigger (seed 3277877396's turn 34)", () => {
  it("⭐ WITNESS: Tidespout Tyrant beside Ornithopter, Memnite in hand, the opponent at 5 with nothing: each 0-drop is cast once, then the Tyrant swings and wins this turn", () => {
    const { session, me, them } = sessionAt({
      mine: { battlefield: [[TIDESPOUT_TYRANT, "tyrant"], [ORNITHOPTER, "thopter"]], hand: [MEMNITE] },
      theirs: { battlefield: [], life: 5 },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { recordDecision: t.recordDecision });
    expect(decision.kind).toBe("game-over");
    expect(out.state.turn).toBe(5);
    expect(out.state.players[them].life).toBeLessThanOrEqual(0);
    expect({ memnite: t.count(5, isCast("Memnite")), ornithopter: t.count(5, isCast("Ornithopter")) }).toEqual({ memnite: 1, ornithopter: 1 });
  });

  it("⭐ WITNESS (the pick): Memnite already cast this turn and back in hand, the Tyrant's trigger forced onto the AI's own Ornithopter — the recast is offered and not chosen", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[TIDESPOUT_TYRANT, "tyrant"], [ORNITHOPTER, "thopter"]], hand: [MEMNITE] },
      theirs: { battlefield: [] },
      log: [{ kind: "cast-spell", playerId: "me", cardName: "Memnite" }],
    });
    const offered = legalActionsForPlayer(session.state, me);
    expect(offered.some(isCast("Memnite"))).toBe(true);
    const pick = pickAction(session.state, me, offered);
    expect(isCast("Memnite")(pick)).toBe(false);
    expect(pick.kind).toBe("pass-priority");
  });

  it("the policy seam: `loopStep` is a POLICY_KEYS subsystem, and `loopStep: \"v1\"` restores the recast", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[TIDESPOUT_TYRANT, "tyrant"], [ORNITHOPTER, "thopter"]], hand: [MEMNITE] },
      theirs: { battlefield: [] },
      log: [{ kind: "cast-spell", playerId: "me", cardName: "Memnite" }],
    });
    expect(POLICY_KEYS).toContain("loopStep");
    const pick = pickAction(session.state, me, legalActionsForPlayer(session.state, me), { policy: { loopStep: "v1" } });
    expect(isCast("Memnite")(pick)).toBe(true);
  });

  it("⭐ CONTROL — the loop's work is not done: the same recast while the opponent still has a flying blocker is cast, the trigger returns the blocker, and the Tyrant wins this turn", () => {
    const { session, me, them } = sessionAt({
      mine: { battlefield: [[TIDESPOUT_TYRANT, "tyrant"]], hand: [MEMNITE] },
      theirs: { battlefield: [[ORNITHOPTER, "their-thopter"]], life: 5 },
      log: [{ kind: "cast-spell", playerId: "me", cardName: "Memnite" }],
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { recordDecision: t.recordDecision });
    expect(t.count(5, isCast("Memnite"))).toBe(1);
    expect(out.state.players[them].hand.some((c) => c.name === "Ornithopter")).toBe(true);
    expect(decision.kind).toBe("game-over");
    expect(out.state.players[them].life).toBeLessThanOrEqual(0);
  });
});

describe("THE UNTAP and THE EMPTY LIBRARY — a pilot on the engine's seam (Kinnan, Bonder Prodigy beside Basalt and Grim Monolith)", () => {
  it("⭐ WITNESS: on the opponent's upkeep with a hand of sorcery-speed cards, nothing to spend the mana on — no untap at all; the game goes on and Kinnan wins on its own turn", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[KINNAN, "kinnan"], [BASALT_MONOLITH, "basalt"], [GRIM_MONOLITH, "grim"]], hand: [CRAW_WURM] },
      theirs: { battlefield: [], life: 2 },
      at: { active: "them", phase: "beginning", step: "upkeep" },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision });
    expect(decision.kind).toBe("game-over");
    expect(out.status).not.toBe("active");
    expect({ basalt: t.count(5, isActivationOf("basalt")), grim: t.count(5, isActivationOf("grim")) }).toEqual({ basalt: 0, grim: 0 });
  });

  it("⭐ CONTROL — the loop IS the line: Searing Flesh ({6}{R}) beside Kinnan, Basalt and a Mountain — Basalt untapped three times (+1 each, floated), then the Flesh kills the opponent at 7", () => {
    // Enough is three: with three floating the next untap would be paid from the pool (the payment spends floating mana first) and
    // untap an untapped Monolith — a step that adds nothing — and the Flesh is paid by the three floating, the Monolith and the Mountain.
    const { session, me, them } = sessionAt({
      mine: { battlefield: [[KINNAN, "kinnan"], [BASALT_MONOLITH, "basalt"], [MOUNTAIN, "mountain"]], hand: [SEARING_FLESH] },
      theirs: { battlefield: [], life: 7 },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision });
    expect(t.count(5, isActivationOf("basalt"))).toBe(3);
    expect(t.count(5, isCast("Searing Flesh"))).toBe(1);
    expect(decision.kind).toBe("game-over");
    expect(out.state.turn).toBe(5);
    expect(out.state.players[them].life).toBeLessThanOrEqual(0);
  });

  it("⭐ WITNESS: Thrasios beside Kinnan and Basalt with its controller's library empty (seed 100358) — neither Thrasios nor the untap that would pay for it is taken; the turn ends", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[KINNAN, "kinnan"], [THRASIOS, "thrasios"], [BASALT_MONOLITH, "basalt"]], hand: [], library: [] },
      theirs: { battlefield: [], life: 40 },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision });
    expect(decision.kind).toBe("game-over"); // its next draw from the empty library loses (CR 704.5b) — the game ends, it does not stall
    expect(out.state.turn).toBeGreaterThan(5);
    expect({ thrasios: t.count(5, isActivationOf("thrasios")), basalt: t.count(5, isActivationOf("basalt")) }).toEqual({ thrasios: 0, basalt: 0 });
  });
});

describe("THE EMPTY LIBRARY — the default AI", () => {
  it("⭐ WITNESS: Arcane Encyclopedia ({3}, {T}: Draw a card.) with three Islands and an empty library on its own main phase — the draw, which would lose the game (CR 704.5b), is offered and not chosen", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[ARCANE_ENCYCLOPEDIA, "book"], [ISLAND, "i1"], [ISLAND, "i2"], [ISLAND, "i3"]], hand: [], library: [] },
      theirs: { battlefield: [] },
    });
    const offered = legalActionsForPlayer(session.state, me);
    expect(offered.some(isActivationOf("book"))).toBe(true);
    const pick = pickAction(session.state, me, offered);
    expect(isActivationOf("book")(pick)).toBe(false);
    expect(pick.kind).toBe("pass-priority");
  });
  it("⭐ CONTROL — the draw IS the win: the same Arcane Encyclopedia and empty library beside Laboratory Maniac (CR 614.1a, 104.2b) — the draw is not a loop step, and the AI takes it", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: [[ARCANE_ENCYCLOPEDIA, "book"], [LABORATORY_MANIAC, "maniac"], [ISLAND, "i1"], [ISLAND, "i2"], [ISLAND, "i3"]], hand: [], library: [] },
      theirs: { battlefield: [] },
    });
    const offered = legalActionsForPlayer(session.state, me);
    const draw = offered.find(isActivationOf("book"));
    expect(draw).toBeTruthy();
    expect(loopStepLine.loopStepOf(session.state, me, draw)).toBeNull();
    expect(isActivationOf("book")(pickAction(session.state, me, offered))).toBe(true);
    // Without the Maniac the same draw is the empty-library step (the witness above).
    const bare = sessionAt({ mine: { battlefield: [[ARCANE_ENCYCLOPEDIA, "book"], [ISLAND, "i1"], [ISLAND, "i2"], [ISLAND, "i3"]], hand: [], library: [] }, theirs: { battlefield: [] } });
    const bareDraw = legalActionsForPlayer(bare.session.state, bare.me).find(isActivationOf("book"));
    expect(loopStepLine.loopStepOf(bare.session.state, bare.me, bareDraw)).toMatchObject({ kind: "empty-library" });
  });
});

describe("A PERSON TAKES THE LOOP BY HAND (CR 732.1b, 732.2a — a loop is repeated as many times as its player chooses)", () => {
  it("⭐ CONTROL: the user (Beginner — every decision asked) taps Basalt Monolith for mana and untaps it twenty times on their own main phase: each untap is offered, and the pool grows one colorless each time", () => {
    const { session } = sessionAt({
      difficulty: "beginner",
      mine: { battlefield: [[KINNAN, "kinnan"], [BASALT_MONOLITH, "basalt"]], hand: [] },
      theirs: { battlefield: [] },
    });
    let { session: s, decision } = nextDecision(session);
    const option = (test) => (decision.options || []).find(test);
    const basaltTapped = () => s.state.players.user.battlefield.find((p) => p.id === "basalt").tapped;
    let untaps = 0;
    for (let guard = 0; guard < 400 && untaps < 20; guard++) {
      expect(decision.kind).toBe("ask");
      if ((s.state.stack || []).length > 0) ({ session: s, decision } = act(s, decision, option((o) => o.kind === "pass-priority")));
      else if (!basaltTapped()) ({ session: s, decision } = act(s, decision, option((o) => o.kind === "tap-for-mana" && o.permanentId === "basalt")));
      else {
        const untap = option(isActivationOf("basalt"));
        expect(untap).toBeTruthy();
        ({ session: s, decision } = act(s, decision, untap));
        untaps += 1;
      }
    }
    while (decision.kind === "ask" && (s.state.stack || []).length > 0) ({ session: s, decision } = act(s, decision, option((o) => o.kind === "pass-priority")));
    expect(untaps).toBe(20);
    expect(s.state.players.user.manaPool.C).toBe(20);
    expect(basaltTapped()).toBe(false);
    expect(option(isActivationOf("basalt"))).toBeTruthy();
  });
});
