/**
 * loopDrawBack.test.js — a draw that takes back a card whose only use is to come back is not a play (loopStepLine.js, the DRAW-BACK).
 *
 * THE RULE (Colton, 2026-10-03): "A combo deck's AI plays to its combo line: build the resource only to 'enough', then forgo other
 * choices, then execute the finish. Never make infinite anything." An iteration that adds nothing it can use is not a play.
 *
 * THE CASE (Omnath's replay of the 108 Kinnan stall seeds with loopStepLine.withLoopSteps threaded, engine 7705a376): 107 finished;
 * seed 106558 stalled on turn 46, ai2's upkeep. Kinnan's seat, its library drawn out, cast Green Sun's Zenith ("Search your library
 * for a green creature card with mana value X or less … Shuffle Green Sun's Zenith into its owner's library.") into the empty
 * library — the search found nothing and the Zenith shuffled itself in — and Thrasios, Triton Hero drew it straight back, 794 times.
 * Valley Floodcaller untapped and pumped its Birds and Otters on every cast, and Enduring Vitality, Kinnan and Badgermole Cub turned
 * the untaps into more mana than the pair cost; three Hullbreaker Horrors had no target. The hold read neither half as a step:
 * Thrasios's library was not empty (one card), and the Zenith's recast forced no cast trigger onto its own permanent.
 *
 * WHAT IS PINNED: on another player's upkeep a seat-pilot on the seam casts the Zenith once and does not draw it back — the Zenith
 * stays in the library (its next draw does not lose, CR 704.5b) and the game goes on; the same loop is played while a cast trigger
 * reaches the opponent (Guttersnipe: the loop is the kill), and on the seat's own turn it is built to "enough" for its pump — lethal —
 * and the attack finishes; a person repeats the loop as often as they choose (CR 732.1b, 732.2a). The reads under it are below.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction } from "./opponentAI.js";
import { createGame, nextDecision, act } from "./gameApi.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import * as tokenLoopLine from "./tokenLoopLine.js";
import * as loopStepLine from "./loopStepLine.js";
import * as gameEngine from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const GREEN_SUNS_ZENITH = {"name":"Green Sun's Zenith","type":"Sorcery","mana":"{X}{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle. Shuffle Green Sun's Zenith into its owner's library."};
const THRASIOS = {"name":"Thrasios, Triton Hero","type":"Legendary Creature — Merfolk Wizard","mana":"{G}{U}","cmc":2,"power":"1","toughness":"3","keywords":["Partner","Scry"],"colors":["G","U"],"oracle":"{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)"};
const KINNAN = {"name":"Kinnan, Bonder Prodigy","type":"Legendary Creature — Human Druid","mana":"{G}{U}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G","U"],"oracle":"Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."};
const VALLEY_FLOODCALLER = {"name":"Valley Floodcaller","type":"Creature — Otter Wizard","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flash"],"colors":["U"],"oracle":"Flash\nYou may cast noncreature spells as though they had flash.\nWhenever you cast a noncreature spell, Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them."};
const ENDURING_VITALITY = {"name":"Enduring Vitality","type":"Enchantment Creature — Elk Glimmer","mana":"{1}{G}{G}","cmc":3,"power":"3","toughness":"3","keywords":["Vigilance"],"colors":["G"],"oracle":"Vigilance\nCreatures you control have \"{T}: Add one mana of any color.\"\nWhen Enduring Vitality dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)"};
const BIRDS_OF_PARADISE = {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","cmc":1,"power":"0","toughness":"1","keywords":["Flying"],"colors":["G"],"oracle":"Flying\n{T}: Add one mana of any color."};
const BADGERMOLE_CUB = {"name":"Badgermole Cub","type":"Creature — Badger Mole","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Earthbend"],"colors":["G"],"oracle":"When this creature enters, earthbend 1. (Target land you control becomes a 0/0 creature with haste that's still a land. Put a +1/+1 counter on it. When it dies or is exiled, return it to the battlefield tapped.)\nWhenever you tap a creature for mana, add an additional {G}."};
const COLOSSAL_DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const BASALT_MONOLITH = {"name":"Basalt Monolith","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact."};
const GUTTERSNIPE = {"name":"Guttersnipe","type":"Creature — Goblin Shaman","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"Whenever you cast an instant or sorcery spell, this creature deals 2 damage to each opponent."};
const PSYCHOSIS_CRAWLER = {"name":"Psychosis Crawler","type":"Artifact Creature — Phyrexian Horror","mana":"{5}","cmc":5,"power":"*","toughness":"*","keywords":[],"colors":[],"oracle":"Psychosis Crawler's power and toughness are each equal to the number of cards in your hand.\nWhenever you draw a card, each opponent loses 1 life."};
const HULLBREAKER_HORROR = {"name":"Hullbreaker Horror","type":"Creature — Kraken Horror","mana":"{5}{U}{U}","cmc":7,"power":"7","toughness":"8","keywords":["Flash"],"colors":["U"],"oracle":"Flash\nThis spell can't be countered.\nWhenever you cast a spell, choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

// ── two-player sessions (Standard; the seat under test is the one the session starts on) ─────────────────────────────
const deck = (prefix, card = ISLAND, n = 40) => Array.from({ length: n }, (_, i) => ({ ...card, id: `${prefix}-${i}` }));

/** A session whose state is the board under test: `mine` / `theirs` = { battlefield: [[card, id, extra]], hand, library, life }. */
function sessionAt({ mine = {}, theirs = {}, at = {}, difficulty = "expert", log = [] } = {}) {
  const session = difficulty === "expert"
    ? createGame({ userDeck: deck("u"), opponentDeck: deck("a", FOREST), difficulty, mode: "standard", seed: "draw-back" })
    : createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a", FOREST), difficulty, mode: "standard" });
  const s = session.state;
  const me = difficulty === "expert" ? s.activePlayer : "user";
  const them = Object.keys(s.players).find((id) => id !== me);
  const P = (owner) => (card, id, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: owner, summoningSick: false }), ...extra });
  const seatState = (id, side, libraryCard) => ({
    ...s.players[id],
    battlefield: (side.battlefield || []).map(([card, pid, extra]) => P(id)(card, pid, extra)),
    hand: (side.hand || []).map((card, i) => ({ ...card, id: `${id}-hand-${i}` })),
    library: (side.library ?? deck(`${id}-lib`, libraryCard, 20)).map((card, i) => ({ ...card, id: card.id ?? `${id}-lib-${i}` })),
    life: side.life ?? 20,
  });
  const active = at.active === "them" ? them : me;
  const state = {
    ...s, turn: 5, phase: at.phase ?? "precombat-main", step: at.step ?? "main", activePlayer: active, priorityHolder: active,
    consecutivePasses: 0, stack: [], pendingTriggers: [],
    log: [...(s.log || []), ...log.map((e) => ({ turn: 5, ...e, playerId: e.playerId === "me" ? me : e.playerId }))],
    players: { ...s.players, [me]: seatState(me, mine, ISLAND), [them]: seatState(them, theirs, FOREST) },
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
const names = (cards) => (cards || []).map((c) => c.name);

/**
 * A pilot that reads the engine's "enough" through the seam the way the persona pilots do (R1: `loop.holdLoop && isTokenLoopAction(loop,
 * a)` holds an action; R2: never an activation of a permanent whose own activation is still on the stack) and loves to act: any open
 * activation first, then a cast at its smallest X; with neither it answers nothing and the engine's own pick stands.
 */
function seamPilot(theSeam) {
  return ({ state, legalActions, seat }) => {
    const loop = theSeam.tokenLoopState(state, seat);
    const open = loop?.holdLoop ? legalActions.filter((a) => !theSeam.isTokenLoopAction(loop, a)) : legalActions;
    const pending = new Set((state.stack || []).filter((o) => o?.kind === "activated-ability" && o.controller === seat).map((o) => o.payload?.params?.sourceId));
    const activation = open.find((a) => a.kind === "activate-ability" && !pending.has(a.permanentId));
    if (activation) return activation;
    return open.filter((a) => a.kind === "cast-spell").sort((x, y) => (x.xValue ?? 0) - (y.xValue ?? 0))[0] ?? undefined;
  };
}
const routeFor = (seat, pilot) => (bag) => (bag.seat === seat ? pilot(bag) : undefined);
const seam = () => loopStepLine.withLoopSteps(tokenLoopLine);

// The engine: Kinnan and Thrasios beside Valley Floodcaller, Enduring Vitality, Birds of Paradise and Badgermole Cub — each noncreature
// cast untaps the Birds and the Floodcaller, and each taps for three (one of any colour, Kinnan's one more, Badgermole's {G}): six
// mana per cast pays the Zenith at X = 1 and Thrasios.
const ENGINE = [[KINNAN, "kinnan"], [THRASIOS, "thrasios"], [VALLEY_FLOODCALLER, "floodcaller"], [ENDURING_VITALITY, "vitality"], [BIRDS_OF_PARADISE, "birds"], [BADGERMOLE_CUB, "badger"]];
const TURN_BUDGET = 300; // a loop on the base stalls in a few hundred empty-stack ticks (the default 2,000 only takes longer); no guard here changes

describe("THE DRAW-BACK — Green Sun's Zenith and Thrasios on an empty library (seed 106558's turn 46)", () => {
  it("⭐ WITNESS: on the opponent's upkeep the seat casts the Zenith once and does not draw it back — the Zenith stays in its library and the game goes on (the opponent's trampler wins it this turn)", () => {
    const { session, me, them } = sessionAt({
      mine: { battlefield: ENGINE, hand: [GREEN_SUNS_ZENITH], library: [], life: 2 },
      theirs: { battlefield: [[COLOSSAL_DREADMAW, "dreadmaw"]], life: 40 },
      at: { active: "them", phase: "beginning", step: "upkeep" },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision, turnTickBudget: TURN_BUDGET });
    expect(decision.kind).toBe("game-over");
    expect(out.state.turn).toBe(5);
    expect(out.state.players[them].life).toBe(40);
    expect({ zenith: t.count(5, isCast("Green Sun's Zenith")), thrasios: t.count(5, isActivationOf("thrasios")) }).toEqual({ zenith: 1, thrasios: 0 });
    expect(names(out.state.players[me].library)).toEqual(["Green Sun's Zenith"]);
  });

  it("⭐ WITNESS (the hold): the Zenith shuffled into the otherwise empty library — Thrasios is offered and held, its step a draw-back; the default AI does not take it either", () => {
    const { session, me } = sessionAt({
      mine: { battlefield: ENGINE, hand: [], library: [GREEN_SUNS_ZENITH] },
      theirs: { battlefield: [] },
      at: { active: "them", phase: "beginning", step: "upkeep" },
      log: [{ kind: "cast-spell", playerId: "me", cardName: "Green Sun's Zenith" }],
    });
    const state = { ...session.state, priorityHolder: me };
    const offered = legalActionsForPlayer(state, me);
    const thrasios = offered.find(isActivationOf("thrasios"));
    expect(thrasios).toBeTruthy();
    expect(loopStepLine.loopStepOf(state, me, thrasios)).toMatchObject({ kind: "draw-back", permanentId: "thrasios", returns: ["Green Sun's Zenith"] });
    expect(loopStepLine.isHeldLoopStep(state, me, thrasios)).toBe(true);
    const s = seam();
    const loop = s.tokenLoopState(state, me);
    expect(loop?.holdLoop).toBe(true);
    expect(s.isTokenLoopAction(loop, thrasios)).toBe(true);
    expect(isActivationOf("thrasios")(pickAction(state, me, offered))).toBe(false);
  });

  it("⭐ CONTROL — the loop is the kill: Guttersnipe beside the engine, the opponent at 9 — the Zenith is cast and drawn back until the fifth cast's 2 damage kills, this turn", () => {
    const { session, me, them } = sessionAt({
      mine: { battlefield: [...ENGINE, [GUTTERSNIPE, "guttersnipe"]], hand: [GREEN_SUNS_ZENITH], library: [] },
      theirs: { battlefield: [[COLOSSAL_DREADMAW, "dreadmaw"]], life: 9 },
      at: { active: "them", phase: "beginning", step: "upkeep" },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision, turnTickBudget: TURN_BUDGET });
    expect(decision.kind).toBe("game-over");
    expect(out.state.turn).toBe(5);
    expect(out.state.players[them].life).toBeLessThanOrEqual(0);
    expect({ zenith: t.count(5, isCast("Green Sun's Zenith")), thrasios: t.count(5, isActivationOf("thrasios")) }).toEqual({ zenith: 5, thrasios: 4 });
  });

  it("⭐ WITNESS — on its own turn the pump is built to enough: the loop runs until its Birds and Floodcaller could attack for the opponent's 40, stops, and the attacks finish the game", () => {
    const { session, me, them } = sessionAt({
      mine: { battlefield: ENGINE, hand: [GREEN_SUNS_ZENITH], library: [] },
      theirs: { battlefield: [[COLOSSAL_DREADMAW, "dreadmaw"]], life: 40 },
    });
    const t = tally(me);
    const { session: out, decision } = advanceUntilDecision(session, { decide: routeFor(me, seamPilot(seam())), recordDecision: t.recordDecision, turnTickBudget: TURN_BUDGET });
    expect(decision.kind).toBe("game-over");
    expect(out.state.players[them].life).toBeLessThanOrEqual(0);
    const zenith = t.count(5, isCast("Green Sun's Zenith"));
    expect(zenith).toBeGreaterThan(1);
    expect(zenith).toBeLessThan(TURN_BUDGET / 4);
  });
});

describe("A PERSON TAKES THE LOOP BY HAND (CR 732.1b, 732.2a — a loop is repeated as many times as its player chooses)", () => {
  it("⭐ CONTROL: the user (Beginner — every decision asked) casts the Zenith into the empty library and draws it back with Thrasios ten times: each cast and each Thrasios is offered", () => {
    const { session } = sessionAt({
      difficulty: "beginner",
      mine: { battlefield: ENGINE, hand: [GREEN_SUNS_ZENITH], library: [] },
      theirs: { battlefield: [] },
    });
    let { session: s, decision } = nextDecision(session);
    const option = (test) => (decision.options || []).find(test);
    const zone = (z) => names(s.state.players.user[z]);
    let casts = 0, draws = 0;
    for (let guard = 0; guard < 600 && draws < 10; guard++) {
      if (decision.kind === "scry-surveil") { ({ session: s, decision } = act(s, decision, { keep: (decision.cards || []).map((c) => c.id) })); continue; } // Thrasios's scry 1: keep it on top
      expect(decision.kind).toBe("ask");
      const pass = option((o) => o.kind === "pass-priority");
      const choice = option((o) => o.kind === "pending-choice");
      if (choice) ({ session: s, decision } = act(s, decision, choice));
      else if ((s.state.stack || []).length > 0) ({ session: s, decision } = act(s, decision, pass));
      else if (zone("hand").includes("Green Sun's Zenith")) {
        const cast = (decision.options || []).filter(isCast("Green Sun's Zenith")).sort((x, y) => (x.xValue ?? 0) - (y.xValue ?? 0))[0];
        expect(cast).toBeTruthy();
        ({ session: s, decision } = act(s, decision, cast));
        casts += 1;
      } else {
        expect(zone("library")).toEqual(["Green Sun's Zenith"]);
        const thrasios = option(isActivationOf("thrasios"));
        expect(thrasios).toBeTruthy();
        ({ session: s, decision } = act(s, decision, thrasios));
        draws += 1;
      }
    }
    while (decision.kind === "scry-surveil" || (decision.kind === "ask" && (s.state.stack || []).length > 0)) { // the last Thrasios resolves (its scry suspends it)
      ({ session: s, decision } = decision.kind === "scry-surveil" ? act(s, decision, { keep: (decision.cards || []).map((c) => c.id) })
        : act(s, decision, option((o) => o.kind === "pending-choice") || option((o) => o.kind === "pass-priority")));
    }
    expect({ casts, draws }).toEqual({ casts: 10, draws: 10 });
    expect(zone("hand")).toContain("Green Sun's Zenith");
    expect(option(isCast("Green Sun's Zenith"))).toBeTruthy();
  });
});

describe("the draw-back read", () => {
  const upkeepWith = ({ battlefield = ENGINE, library = [GREEN_SUNS_ZENITH], life = 20, at = { active: "them", phase: "beginning", step: "upkeep" } } = {}) => {
    const { session, me } = sessionAt({ mine: { battlefield, hand: [], library }, theirs: { battlefield: [], life }, at,
      log: [{ kind: "cast-spell", playerId: "me", cardName: "Green Sun's Zenith" }] });
    const state = { ...session.state, priorityHolder: me };
    const thrasios = legalActionsForPlayer(state, me).find(isActivationOf("thrasios"));
    return { state, me, thrasios };
  };

  it("a library with a card the Zenith could find, or any other card, is no draw-back (the draw takes a real card)", () => {
    for (const library of [[GREEN_SUNS_ZENITH, GRIZZLY_BEARS], [GREEN_SUNS_ZENITH, ISLAND], [ISLAND]]) {
      const { state, me, thrasios } = upkeepWith({ library });
      expect(loopStepLine.loopStepOf(state, me, thrasios)).toBe(null);
    }
  });

  it("a cast trigger that reaches an opponent (Guttersnipe), a draw trigger of the seat's own (Psychosis Crawler) or mana with a use (Hullbreaker Horror, flash, unaffordable now) keeps the draw-back a play on the opponent's upkeep", () => {
    for (const extra of [[GUTTERSNIPE, "guttersnipe"], [PSYCHOSIS_CRAWLER, "crawler"]]) {
      const { state, me, thrasios } = upkeepWith({ battlefield: [...ENGINE, extra] });
      expect(loopStepLine.loopStepOf(state, me, thrasios)).toMatchObject({ kind: "draw-back" });
      expect(loopStepLine.isHeldLoopStep(state, me, thrasios)).toBe(false);
    }
    // Four creatures that tap for one each cannot pay {5}{U}{U}; with twenty more of every colour the Horror (flash) is cast — the
    // mana has a use, and on another player's upkeep nothing else (no pump use, no trigger reaching past the seat) keeps it a play.
    const sink = sessionAt({ mine: { battlefield: [[THRASIOS, "thrasios"], [VALLEY_FLOODCALLER, "floodcaller"], [ENDURING_VITALITY, "vitality"], [BIRDS_OF_PARADISE, "birds"]], hand: [HULLBREAKER_HORROR], library: [GREEN_SUNS_ZENITH] },
      theirs: { battlefield: [] }, at: { active: "them", phase: "beginning", step: "upkeep" }, log: [{ kind: "cast-spell", playerId: "me", cardName: "Green Sun's Zenith" }] });
    const state = { ...sink.session.state, priorityHolder: sink.me };
    const offered = legalActionsForPlayer(state, sink.me);
    expect(offered.some(isCast("Hullbreaker Horror"))).toBe(false);
    expect(loopStepLine.loopStepOf(state, sink.me, offered.find(isActivationOf("thrasios")))).toMatchObject({ kind: "draw-back" });
    expect(loopStepLine.isHeldLoopStep(state, sink.me, offered.find(isActivationOf("thrasios")))).toBe(false);
    // …and without the sink in hand the same draw-back is held.
    const bare = { ...state, players: { ...state.players, [sink.me]: { ...state.players[sink.me], hand: [] } } };
    expect(loopStepLine.isHeldLoopStep(bare, sink.me, legalActionsForPlayer(bare, sink.me).find(isActivationOf("thrasios")))).toBe(true);
  });

  it("the mana that feeds a draw-back which is a play has a use: Basalt Monolith tapped with three floating cannot pay Thrasios — its untap is the fuel while Guttersnipe makes the loop a kill, and is held without it", () => {
    const fuelled = (extra) => {
      const { session, me } = sessionAt({
        mine: { battlefield: [[KINNAN, "kinnan"], [THRASIOS, "thrasios"], [BASALT_MONOLITH, "basalt", { tapped: true }], ...extra], hand: [], library: [GREEN_SUNS_ZENITH] },
        theirs: { battlefield: [] }, log: [{ kind: "cast-spell", playerId: "me", cardName: "Green Sun's Zenith" }],
      });
      const s0 = session.state;
      const state = { ...s0, players: { ...s0.players, [me]: { ...s0.players[me], manaPool: { ...s0.players[me].manaPool, C: 3 } } } };
      const offered = legalActionsForPlayer(state, me);
      return { state, me, offered, untap: offered.find(isActivationOf("basalt")) };
    };
    const kill = fuelled([[GUTTERSNIPE, "guttersnipe"]]);
    expect(kill.untap).toBeTruthy();
    expect(kill.offered.some(isActivationOf("thrasios"))).toBe(false);
    expect(loopStepLine.loopStepOf(kill.state, kill.me, kill.untap)).toMatchObject({ kind: "untap", net: 1 });
    expect(loopStepLine.isHeldLoopStep(kill.state, kill.me, kill.untap)).toBe(false);
    const idle = fuelled([]);
    expect(loopStepLine.isHeldLoopStep(idle.state, idle.me, idle.untap)).toBe(true);
  });

  it("the pump's enough is lethal: on its own turn the draw-back stays a play while its attack-capable power is short of the opponent's life, and is held at or past it", () => {
    const own = { active: "me", phase: "precombat-main", step: "main" };
    const short = upkeepWith({ at: own, life: 40 });
    expect(loopStepLine.isHeldLoopStep(short.state, short.me, short.thrasios)).toBe(false);
    const past = upkeepWith({ at: own, life: 3 });
    expect(loopStepLine.isHeldLoopStep(past.state, past.me, past.thrasios)).toBe(true);
  });

  it("gameEngine.castTriggerOutcomes previews every own cast trigger as the flush routes it: Valley Floodcaller's untap and pump of its own types", () => {
    expect(typeof gameEngine.castTriggerOutcomes).toBe("function");
    const { state, me } = upkeepWith();
    const outcomes = gameEngine.castTriggerOutcomes(state, me, state.players[me].library[0]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ source: "Valley Floodcaller", removed: false, programmed: true, targets: [] });
    expect(outcomes[0].atoms).toMatchObject([{ op: "pump", scope: "youControl", untap: true }]);
  });
});
