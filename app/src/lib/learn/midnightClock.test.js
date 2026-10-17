/**
 * midnightClock.test.js — the play-weighted program, #645 Midnight Clock.
 *
 *   "{T}: Add {U}.
 *    {2}{U}: Put an hour counter on this artifact.
 *    At the beginning of each upkeep, put an hour counter on this artifact.
 *    When the twelfth hour counter is put on this artifact, shuffle your hand and graveyard into your library, then draw
 *    seven cards. Exile this artifact."
 *
 * The first three lines were already modeled; the fourth held the card back. What was built:
 *   · the counter-threshold trigger ("When the <Nth> <kind> counter is put on this <permanent>"): gameState.addCounter records
 *     how many counters of the kind the permanent had BEFORE the placement, and triggers.checkCounterTriggers fires the
 *     descriptor once when one placement takes the count from below N to N or more (CR 122.6, 603.2 — the bundled ruling: "if it
 *     had fewer than twelve counters on it before those counters were put on it and it has twelve or more counters on it
 *     after"). A permanent already at N or more never fires it again;
 *   · "shuffle your hand and graveyard into your library, then draw seven cards" — ONE controller-only atom over the
 *     Timetwister fold (library.wheelOnePlayer: hand + graveyard into the library, one seeded shuffle, seven draws);
 *   · "Exile this artifact." — the self exile (the source permanent, if it is still the same object on the battlefield, CR
 *     400.7: the bundled ruling "If Midnight Clock leaves the battlefield while its last ability is on the stack, it won't be
 *     exiled").
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Every runtime case runs through the engine's own entry points: passPriority walks the table (an empty-stack lap
 * advances the step; a full lap of passes resolves the top of the stack), nextStep leaves the priority-less steps, and the
 * activation is the offered legal action, dispatched.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, nextStep, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone, addCounter } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const CLOCK = {"name":"Midnight Clock","type":"Artifact","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"{T}: Add {U}.\n{2}{U}: Put an hour counter on this artifact.\nAt the beginning of each upkeep, put an hour counter on this artifact.\nWhen the twelfth hour counter is put on this artifact, shuffle your hand and graveyard into your library, then draw seven cards. Exile this artifact."}; // body-only
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."}; // native-static
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const clockAt = (n, controller = "user") => P("clock", CLOCK, controller, { counters: { hour: n } });
const cards = (prefix, n) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}${i}` }));

/**
 * A four-seat pod (user → ai1 → ai2 → ai3). The user holds three cards, has two in the graveyard and twenty in the library;
 * the table opens at `phase`/`step` of `active`, priority on the active player.
 */
function table({ active = "ai3", phase = "precombat-main", step = "main", userBoard = [], turn = 5 } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: cards(`${pid}-lib-`, 20) };
  }
  players.user = { ...players.user, battlefield: userBoard, hand: cards("hand-", 3), graveyard: cards("gy-", 2) };
  return { ...s0, players, turn, phase, step, activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}

/** Walk the turn structure (passPriority, or nextStep where no one holds priority) until `pred` holds. */
function until(s, pred, cap = 600) {
  let g = 0;
  while (!pred(s) && g++ < cap) s = s.priorityHolder ? passPriority(s) : nextStep(s);
  if (!pred(s)) throw new Error(`until: condition not reached (turn ${s.turn}, ${s.activePlayer} ${s.phase}/${s.step})`);
  return s;
}
/** Pass priority until the stack is empty (each full lap resolves the top object). */
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}

const clockOnBattlefield = (s) => s.players.user.battlefield.find((p) => p.id === "clock") || null;
const hours = (s) => clockOnBattlefield(s)?.counters?.hour ?? null;
const clockInExile = (s) => s.players.user.exile.some((c) => c.name === "Midnight Clock");
const wheels = (s) => (s.log || []).filter((e) => e.effect === "shuffle-hand-graveyard-draw").length;
const zoneIds = (s, zone) => s.players.user[zone].map((c) => c.id);
const activateClock = (s) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "clock");
  if (!a) throw new Error("the Clock's {2}{U} ability was not offered");
  return dispatchAction(s, a);
};

describe("classification — every line of Midnight Clock is modeled", () => {
  it("the twelfth-counter trigger is detected with its counter kind and threshold, and routes natively", () => {
    const d = detectTriggers(CLOCK).find((x) => x.event === "nthCounterPut");
    expect(d).toMatchObject({ event: "nthCounterPut", scope: "self", counterType: "hour", counterThreshold: 12 });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("the card classifies native", () => {
    expect(isNativeTier(classifyCard(CLOCK))).toBe(true);
  });

  it("CREED — a different threshold wording or a non-self subject stays undetected", () => {
    const on = (oracle) => detectTriggers({ ...CLOCK, oracle }).filter((x) => x.event === "nthCounterPut");
    expect(on("When the twelfth hour counter is put on a permanent you control, draw a card.")).toHaveLength(0);
    expect(on("When an hour counter is put on this artifact, draw a card.")).toHaveLength(0);
  });
});

describe("RUNTIME — the twelfth counter, reached through the upkeeps", () => {
  it("⭐ the eleventh counter does nothing; the twelfth shuffles hand and graveyard into the library, draws seven and exiles the Clock — exactly once", () => {
    let s = table({ active: "ai2", userBoard: [clockAt(10)] });
    // ai3's upkeep: the each-upkeep trigger puts the eleventh counter on. No wheel.
    s = until(s, (x) => x.activePlayer === "ai3" && x.step === "upkeep" && !x.stack.length && hours(x) === 11);
    expect({ hours: hours(s), wheels: wheels(s), hand: s.players.user.hand.length }).toEqual({ hours: 11, wheels: 0, hand: 3 });
    // The user's upkeep: the twelfth counter goes on, the threshold trigger fires and resolves.
    const before = { lib: zoneIds(s, "library").length, hand: zoneIds(s, "hand"), gy: zoneIds(s, "graveyard") };
    // (the user's upkeep with its stack empty and the Clock at twelve or gone — the base engine stops here with twelve counters)
    s = until(s, (x) => x.activePlayer === "user" && x.step === "upkeep" && !x.stack.length && (hours(x) === null || hours(x) >= 12));
    expect(wheels(s)).toBe(1);
    expect(s.players.user.hand).toHaveLength(7);
    expect(s.players.user.graveyard).toHaveLength(0);
    // Every card that was in hand or graveyard is in the library or the new hand — nothing lost, nothing added.
    const nowHeld = new Set([...zoneIds(s, "library"), ...zoneIds(s, "hand")]);
    for (const id of [...before.hand, ...before.gy]) expect(nowHeld.has(id)).toBe(true);
    expect(zoneIds(s, "library").length + 7).toBe(before.lib + before.hand.length + before.gy.length);
    expect(clockOnBattlefield(s)).toBeNull();
    expect(clockInExile(s)).toBe(true);
    // Exactly once: the next round of upkeeps finds no Clock and no second wheel.
    s = until(s, (x) => x.activePlayer === "ai1" && x.step === "draw");
    expect(wheels(s)).toBe(1);
  });

  it("control — at nine, an upkeep makes ten and nothing else happens", () => {
    let s = table({ active: "ai2", userBoard: [clockAt(9)] });
    s = until(s, (x) => x.activePlayer === "ai3" && x.step === "upkeep" && !x.stack.length && hours(x) === 10);
    expect({ hours: hours(s), wheels: wheels(s), exiled: clockInExile(s) }).toEqual({ hours: 10, wheels: 0, exiled: false });
  });

  it("a Clock already at twelve or more does not trigger again when more counters are put on it", () => {
    let s = table({ active: "ai2", userBoard: [clockAt(12)] });
    s = until(s, (x) => x.activePlayer === "ai3" && x.step === "upkeep" && !x.stack.length && hours(x) === 13);
    expect({ hours: hours(s), wheels: wheels(s), exiled: clockInExile(s) }).toEqual({ hours: 13, wheels: 0, exiled: false });
  });
});

describe("RUNTIME — the twelfth counter, reached through the activated ability", () => {
  const mainWithIslands = (n, extra = []) => table({ active: "user", userBoard: [clockAt(n), ...extra, ...Array.from({ length: 3 }, (_, i) => P(`isl${i}`, ISLAND, "user"))] });

  it("⭐ at eleven, {2}{U} puts the twelfth on: the wheel and the exile follow", () => {
    let s = mainWithIslands(11);
    s = activateClock(s);
    s = resolveStack(s); // the counter, then the threshold trigger
    expect(s.players.user.hand).toHaveLength(7);
    expect(s.players.user.graveyard).toHaveLength(0);
    expect(clockOnBattlefield(s)).toBeNull();
    expect(clockInExile(s)).toBe(true);
    expect(wheels(s)).toBe(1);
  });

  it("at ten, one activation makes eleven — no wheel", () => {
    let s = mainWithIslands(10);
    s = resolveStack(activateClock(s));
    expect({ hours: hours(s), wheels: wheels(s), hand: s.players.user.hand.length }).toEqual({ hours: 11, wheels: 0, hand: 3 });
  });

  it("with Doubling Season, eleven → thirteen in one placement crosses twelve: one wheel", () => {
    let s = mainWithIslands(11, [P("ds", DOUBLING_SEASON, "user")]);
    s = resolveStack(activateClock(s));
    expect(wheels(s)).toBe(1);
    expect(clockInExile(s)).toBe(true);
  });
});

describe("RUNTIME — CR 122.6: counters given as a permanent enters are counters put on it", () => {
  it("SYNTHETIC — a permanent entering with the threshold's count fires it (no printed card pairs the two today)", () => {
    // The enters-with half of the counter events (enterReplacements.settleEnterReplacements) records the count before as 0.
    const card = { id: "synth", name: "Threshold Probe", type: "Artifact", mana: "{3}", cmc: 3, keywords: [], colors: [],
      oracle: "This artifact enters with three charge counters on it.\nWhen the third charge counter is put on this artifact, draw a card." };
    let s = table({ active: "user" });
    s = enterPermanent(s, card, "user");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveStack(s);
    expect(s.players.user.hand).toHaveLength(4);
  });
});

describe("RUNTIME — the bundled ruling: a Clock that left the battlefield is not exiled", () => {
  it("the Clock bounced in response: the wheel still happens (the Clock card shuffles in from hand), and nothing is exiled", () => {
    let s = table({ active: "user", userBoard: [clockAt(11)] });
    s = addCounter(s, { permanentId: "clock", type: "hour", amount: 1 });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); // the flush puts the threshold trigger on the stack
    expect(s.stack.some((o) => o.source?.name === "Midnight Clock")).toBe(true);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "clock" });
    s = resolveStack(s);
    expect(wheels(s)).toBe(1);
    expect(clockInExile(s)).toBe(false);
    expect(s.players.user.hand).toHaveLength(7);
    // the Clock card went with the hand into the library, or was drawn back — never exiled, never lost
    expect([...s.players.user.library, ...s.players.user.hand].some((c) => c.name === "Midnight Clock")).toBe(true);
  });
});
