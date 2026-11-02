/**
 * loopStepReads.test.js — the reads under the loop-step line (loopStepLine.js; the games are in loopStepLine.test.js).
 *
 * THE RULE (Colton, 2026-10-03): a loop builds its resource only to "enough" and never infinitely. These pin how the line names a
 * step and decides "enough": an untap step's NET (the mana its permanent makes, Kinnan's extra counted, minus its cost — or minus the
 * cost alone when it untaps an untapped permanent paid from elsewhere); the DEMAND (more of the loop's mana unlocks a cast or an
 * activation, read with the loop's own source kept tapped; an X spell already offered never counts); the EMPTY LIBRARY step; the
 * FORCED CAST TRIGGER (gameEngine.castTriggerRemovesOwn) and the recast it makes a step; the seam's pass-through.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { castTriggerRemovesOwn } from "./gameEngine.js";
import * as tokenLoopLine from "./tokenLoopLine.js";
import { loopStepOf, isHeldLoopStep, withLoopSteps, LOOP_MANA_PLENTY } from "./loopStepLine.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const KINNAN = {"name":"Kinnan, Bonder Prodigy","type":"Legendary Creature — Human Druid","mana":"{G}{U}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G","U"],"oracle":"Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."};
const BASALT_MONOLITH = {"name":"Basalt Monolith","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact."};
const GRIM_MONOLITH = {"name":"Grim Monolith","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{4}: Untap this artifact."};
const THRASIOS = {"name":"Thrasios, Triton Hero","type":"Legendary Creature — Merfolk Wizard","mana":"{G}{U}","cmc":2,"power":"1","toughness":"3","keywords":["Partner","Scry"],"colors":["G","U"],"oracle":"{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)"};
const TIDESPOUT_TYRANT = {"name":"Tidespout Tyrant","type":"Creature — Djinn","mana":"{5}{U}{U}{U}","cmc":8,"power":"5","toughness":"5","keywords":["Flying"],"colors":["U"],"oracle":"Flying\nWhenever you cast a spell, return target permanent to its owner's hand."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const BLAZE = {"name":"Blaze","type":"Sorcery","mana":"{X}{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Blaze deals X damage to any target."};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};

// A four-seat pod; the seat under test is "user".
const perm = (card, id, extra = {}, controller = "user") => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }), ...extra });
function pod({ user = [], hand = [], library = 20, active = "user", phase = "precombat-main", step = "main", log = [], ai1 = [], pool = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    players[seat] = {
      ...g.players[seat], battlefield: seat === "user" ? user : seat === "ai1" ? ai1 : [], life: 40,
      hand: seat === "user" ? hand.map((c, i) => ({ ...c, id: `h${i}` })) : [],
      library: Array.from({ length: seat === "user" ? library : 20 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${seat}-lib${i}` })),
    };
  }
  players.user = { ...players.user, manaPool: { ...players.user.manaPool, ...pool } };
  return { ...g, players, phase, step, activePlayer: active, priorityHolder: "user", turn: 8, consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] }, log: log.map((e) => ({ turn: 8, ...e })) };
}
const offers = (state) => legalActionsForPlayer(state, "user");
const isActivationOf = (pid) => (a) => a.kind === "activate-ability" && a.permanentId === pid;
const isCast = (name) => (a) => a.kind === "cast-spell" && a.name === name;
const untapOf = (state, pid) => offers(state).find(isActivationOf(pid));

describe("the untap step and its net", () => {
  it("Basalt tapped nets +1 (four with Kinnan, minus three); Grim untapping itself nets 0", () => {
    const own = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt", { tapped: true }), perm(GRIM_MONOLITH, "grim")] });
    expect(loopStepOf(own, "user", untapOf(own, "basalt"))).toMatchObject({ kind: "untap", permanentId: "basalt", net: 1, colors: ["C"] });
    expect(loopStepOf(own, "user", untapOf(own, "grim"))).toMatchObject({ kind: "untap", net: 0 });
    expect(isHeldLoopStep(own, "user", untapOf(own, "grim"))).toBe(true);
  });

  it("on another seat's turn Grim's untap is paid with Basalt's mana: it untaps an untapped artifact and nets -4 (held); Basalt paying itself nets +1", () => {
    const off = pod({ active: "ai1", user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt"), perm(GRIM_MONOLITH, "grim")] });
    expect(loopStepOf(off, "user", untapOf(off, "grim"))).toMatchObject({ kind: "untap", net: -4 });
    expect(loopStepOf(off, "user", untapOf(off, "basalt"))).toMatchObject({ kind: "untap", net: 1 });
    expect(isHeldLoopStep(off, "user", untapOf(off, "grim"))).toBe(true);
    expect(isHeldLoopStep(off, "user", untapOf(off, "basalt"))).toBe(true); // nothing to cast on that turn
  });

  it("with its own untap already on the stack, another untap of the tapped Basalt untaps an untapped artifact: it nets minus its cost (held)", () => {
    const tapped = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt", { tapped: true }), perm(GRIM_MONOLITH, "grim")] });
    const untap = untapOf(tapped, "basalt");
    expect(loopStepOf(tapped, "user", untap)).toMatchObject({ kind: "untap", net: 1 });
    const pending = { ...tapped, stack: [{ id: "stk-1", kind: "activated-ability", controller: "user", source: tapped.players.user.battlefield[1].card, targets: [],
      payload: { params: { program: untap.program, controller: "user", targets: [], sourceId: "basalt" } } }] };
    expect(loopStepOf(pending, "user", untap)).toMatchObject({ kind: "untap", net: -3 });
    expect(isHeldLoopStep(pending, "user", untap)).toBe(true);
  });

  it("an untap of something that is no mana source is no loop step", () => {
    const state = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt")] });
    const fake = { ...untapOf(state, "basalt"), permanentId: "kinnan" };
    expect(loopStepOf(state, "user", fake)).toBe(null);
  });
});

describe("the demand: more of the loop's mana is a use only while it unlocks something, its own source kept", () => {
  it("Tidespout Tyrant in hand, three Islands and Kinnan beside Basalt: the cast needs the loop — Basalt's +1 untap is a play", () => {
    const short = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt"), perm(ISLAND, "i1"), perm(ISLAND, "i2"), perm(ISLAND, "i3")], hand: [TIDESPOUT_TYRANT] });
    expect(isHeldLoopStep(short, "user", untapOf(short, "basalt"))).toBe(false);
  });

  it("…and with five colorless floating the Tyrant is paid without Basalt: enough — the untap is held and the cast offered", () => {
    const enough = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt"), perm(ISLAND, "i1"), perm(ISLAND, "i2"), perm(ISLAND, "i3")], hand: [TIDESPOUT_TYRANT], pool: { C: 5 } });
    expect(offers(enough).some(isCast("Tidespout Tyrant"))).toBe(true);
    expect(isHeldLoopStep(enough, "user", untapOf(enough, "basalt"))).toBe(true);
  });

  it("an X spell offered at any X never makes more mana a use (never infinite): Blaze off two Mountains (X = 1 with the Monolith kept) holds the untap", () => {
    const blaze = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt"), perm(MOUNTAIN, "m1"), perm(MOUNTAIN, "m2")], hand: [BLAZE] });
    expect(offers(blaze).some(isCast("Blaze"))).toBe(true);
    expect(isHeldLoopStep(blaze, "user", untapOf(blaze, "basalt"))).toBe(true);
  });

  it("a colour the loop cannot make is no use for its mana: Craw Wurm ({4}{G}{G}) with no green source holds the untap", () => {
    const wurm = pod({ user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt")], hand: [CRAW_WURM] });
    expect(isHeldLoopStep(wurm, "user", untapOf(wurm, "basalt"))).toBe(true);
  });

  it(`a fixed cost above the board is reachable: the demand pool is ${LOOP_MANA_PLENTY} of each colour the step makes`, () => {
    expect(LOOP_MANA_PLENTY).toBeGreaterThanOrEqual(16);
  });
});

describe("the empty library", () => {
  it("Thrasios (paid by Kinnan and Basalt) is a held step only once its controller's library is empty", () => {
    const empty = pod({ library: 0, user: [perm(KINNAN, "kinnan"), perm(THRASIOS, "thrasios"), perm(BASALT_MONOLITH, "basalt")] });
    expect(loopStepOf(empty, "user", offers(empty).find(isActivationOf("thrasios")))).toMatchObject({ kind: "empty-library", permanentId: "thrasios" });
    expect(isHeldLoopStep(empty, "user", offers(empty).find(isActivationOf("thrasios")))).toBe(true);
    const full = pod({ library: 5, user: [perm(KINNAN, "kinnan"), perm(THRASIOS, "thrasios"), perm(BASALT_MONOLITH, "basalt")] });
    expect(loopStepOf(full, "user", offers(full).find(isActivationOf("thrasios")))).toBe(null);
  });
});

describe("the forced cast trigger and the recast", () => {
  it("gameEngine.castTriggerRemovesOwn: Tidespout Tyrant returns the caster's own Ornithopter only when no opponent has a permanent", () => {
    const alone = pod({ user: [perm(TIDESPOUT_TYRANT, "tyrant"), perm(ORNITHOPTER, "thopter")], hand: [MEMNITE] });
    expect(castTriggerRemovesOwn(alone, "user", alone.players.user.hand[0])).toMatchObject({ source: "Tidespout Tyrant", op: "bounce", target: { id: "thopter", name: "Ornithopter" } });
    const contested = pod({ user: [perm(TIDESPOUT_TYRANT, "tyrant"), perm(ORNITHOPTER, "thopter")], hand: [MEMNITE], ai1: [perm(GRIZZLY_BEARS, "bears", {}, "ai1")] });
    expect(castTriggerRemovesOwn(contested, "user", contested.players.user.hand[0])).toBe(null);
    const noWatcher = pod({ user: [perm(ORNITHOPTER, "thopter")], hand: [MEMNITE] });
    expect(castTriggerRemovesOwn(noWatcher, "user", noWatcher.players.user.hand[0])).toBe(null);
  });

  it("a first cast this turn is no loop step; the same card cast again this turn under that trigger is a recast (held)", () => {
    const alone = pod({ user: [perm(TIDESPOUT_TYRANT, "tyrant"), perm(ORNITHOPTER, "thopter")], hand: [MEMNITE] });
    const cast = offers(alone).find(isCast("Memnite"));
    expect(loopStepOf(alone, "user", cast)).toBe(null);
    const again = { ...alone, log: [{ turn: 8, kind: "cast-spell", playerId: "user", cardName: "Memnite" }] };
    expect(loopStepOf(again, "user", cast)).toMatchObject({ kind: "recast", cardName: "Memnite", removes: { target: { name: "Ornithopter" } } });
    expect(isHeldLoopStep(again, "user", cast)).toBe(true);
    const lastTurn = { ...alone, log: [{ turn: 7, kind: "cast-spell", playerId: "user", cardName: "Memnite" }] };
    expect(loopStepOf(lastTurn, "user", cast)).toBe(null);
  });
});

describe("the seam (withLoopSteps over tokenLoopLine)", () => {
  it("a seat with neither a token loop nor a loop step reads null, as the token seam does", () => {
    const plain = pod({ user: [perm(GRIZZLY_BEARS, "bears")] });
    expect(withLoopSteps(tokenLoopLine).tokenLoopState(plain, "user")).toBe(null);
    expect(tokenLoopLine.tokenLoopState(plain, "user")).toBe(null);
  });

  it("a Kinnan seat on another's turn: holdLoop, the held untap answers isTokenLoopAction, a pass does not", () => {
    const s = withLoopSteps(tokenLoopLine);
    const off = pod({ active: "ai1", user: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt"), perm(GRIM_MONOLITH, "grim")] });
    const loop = s.tokenLoopState(off, "user");
    expect(loop).toMatchObject({ holdLoop: true, finishNow: false, tokenHold: false });
    expect(s.isTokenLoopAction(loop, untapOf(off, "basalt"))).toBe(true);
    expect(s.isTokenLoopAction(loop, offers(off).find((a) => a.kind === "pass-priority"))).toBe(false);
    expect(s.tokenLoopAttackPlan(off, "user", [])).toBe(null);
  });
});
