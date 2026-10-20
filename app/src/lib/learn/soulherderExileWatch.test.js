/**
 * soulherderExileWatch.test.js — "Whenever a creature is exiled from the battlefield" (play-weighted 2026-10-20).
 *
 *   Soulherder (EDHREC #1690): "Whenever a creature is exiled from the battlefield, put a +1/+1 counter on this creature.
 *   At the beginning of your end step, you may exile another target creature you control, then return that card to the
 *   battlefield under its owner's control."
 *
 * The watcher is a leaves-the-battlefield ability (CR 603.6c, 603.10a) on any player's creature, whatever exiled it, a token
 * included (it goes to exile before it ceases to exist — CR 111.7's note). A creature that dies, is bounced or is tucked is not
 * exiled; a creature that would die under Rest in Peace is exiled instead (CR 614.1a), so it is. The leave record now says
 * whether the permanent went to exile (gameState.recordLeaveEvent), and the look-back carries it (`leftToExile`).
 * The end-step blink is the "another target creature you control" arm (blinkTargetNouns.test.js) — and its own exile feeds the
 * watcher: the classic Soulherder loop of a counter per blink.
 *
 * Oracle text and rulings copied from the bundled Scryfall snapshot (oracle_cards.json, rulings.json; read 2026-10-20). The
 * ruling "If a creature is exiled but ends up in another zone (most likely because it's a player's commander in the Commander
 * variant), Soulherder's first ability triggers." — the engine exiles a commander first and offers the command zone as the
 * state-based action (CR 903.9a), so the exile is seen.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkLeavesTriggers, checkStepTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets, passPriority } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone, groupLeaveEvents } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, colors, keywords, oracle, extra = {}) => ({ name, type, mana, cmc, colors, keywords, oracle, ...extra });
const creature = (name, type, mana, cmc, power, toughness, colors, keywords, oracle) => card(name, type, mana, cmc, colors, keywords, oracle, { power, toughness });

const SOULHERDER = creature("Soulherder", "Creature — Spirit", "{1}{W}{U}", 3, "1", "1", ["U", "W"], [],
  "Whenever a creature is exiled from the battlefield, put a +1/+1 counter on this creature.\nAt the beginning of your end step, you may exile another target creature you control, then return that card to the battlefield under its owner's control.");
const SWORDS = card("Swords to Plowshares", "Instant", "{W}", 1, ["W"], [], "Exile target creature. Its controller gains life equal to its power.");
const MURDER = card("Murder", "Instant", "{1}{B}{B}", 3, ["B"], [], "Destroy target creature.");
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, ["U"], [], "Return target creature to its owner's hand.");
const REST_IN_PEACE = card("Rest in Peace", "Enchantment", "{1}{W}", 2, ["W"], [],
  "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.");
const WALL_OF_OMENS = creature("Wall of Omens", "Creature — Wall", "{1}{W}", 2, "0", "4", ["W"], ["Defender"], "Defender\nWhen this creature enters, draw a card.");
const HILL_GIANT = creature("Hill Giant", "Creature — Giant", "{3}{R}", 4, "3", "3", ["R"], [], "");
const BEARS = creature("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "2", "2", ["G"], [], "");
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, [], [], "{T}: Add {C}{C}.");
const SOLDIER_TOKEN = { ...creature("Soldier", "Token Creature — Soldier", "", 0, "1", "1", ["W"], [], ""), token: true };
const basic = (name, c) => card(name, `Basic Land — ${name}`, "", 0, [], [], `({T}: Add {${c}}.)`);
const LIBRARY = [1, 2, 3, 4, 5].map((i) => ({ ...basic("Island", "U"), id: `lib-${i}` }));

function table({ user = [], ai = [], userHand = [], phase = "precombat-main", step = "main", active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => ({ ...createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } }), counters: { ...(o.counters || {}) } });
  return { ...s0, turn: 6, phase, step, activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [],
    players: { ...s0.players,
      user: { ...s0.players.user, landsPlayedThisTurn: 1, battlefield: user.map(P("user")), hand: userHand.map(([id, c]) => ({ ...c, id })), library: [...LIBRARY] },
      ai: { ...s0.players.ai, landsPlayedThisTurn: 1, battlefield: ai.map(P("ai")), library: [...LIBRARY] } } };
}
const lands = (prefix, name, c, n) => Array.from({ length: n }, (_, i) => [`${prefix}${i}`, basic(name, c)]);
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name);
const herder = (s) => { const h = named(s, "user", "Soulherder"); expect(h).toHaveLength(1); return h[0]; };
const counters = (s) => herder(s).counters?.["+1/+1"] || 0;
function passToResolution(s) {
  let g = 0;
  while ((s.stack.length || s.pendingChoice || (s.pendingTriggers || []).length) && g++ < 200) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (s.pendingChoice) break;
    s = passPriority(s);
  }
  return s;
}
function castAt(s, cardId, targetId) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === targetId);
  expect(cast, `${cardId} offered at ${targetId}`).toBeTruthy();
  return passToResolution(dispatchAction(s, cast));
}
function resolveAll(s) {
  let g = 0;
  while (g++ < 60) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (s.pendingChoice) break;
    if ((s.pendingTriggers || []).length) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); continue; }
    if (!s.stack.length) break;
    s = resolveTopOfStack(s);
  }
  return s;
}

describe("detection", () => {
  it("⭐ the watcher is a leaves-the-battlefield trigger on any creature's exile; both of Soulherder's triggers route natively", () => {
    const d = detectTriggers(SOULHERDER);
    expect(d.map((x) => `${x.event}/${x.scope}`)).toEqual(["permanentLeaves/creatureExiled", "endStep/you"]);
    expect(d.every((x) => triggerRoutesNatively(x))).toBe(true);
  });
  it("⭐ Soulherder plays its whole text — native", () => {
    expect(classifyCard(SOULHERDER)).toBe("native-trigger");
  });
  it("control: another subject or a dies-or-exiled pair is not this watcher", () => {
    const other = (oracle) => detectTriggers(creature("Probe", "Creature — Spirit", "{1}", 1, "1", "1", [], [], oracle)).map((x) => x.scope);
    expect(other("Whenever an artifact is exiled from the battlefield, put a +1/+1 counter on this creature.")).not.toContain("creatureExiled");
    expect(other("Whenever a creature an opponent controls is exiled from the battlefield, put a +1/+1 counter on this creature.")).not.toContain("creatureExiled");
  });
});

describe("runtime — what is and isn't an exile from the battlefield", () => {
  it("⭐ Swords to Plowshares on the opponent's Hill Giant: one counter", () => {
    let s = table({ user: [["herd", SOULHERDER], ...lands("p", "Plains", "W", 1)], ai: [["giant", HILL_GIANT]], userHand: [["stp", SWORDS]] });
    s = castAt(s, "stp", "giant");
    expect(named(s, "ai", "Hill Giant")).toHaveLength(0);
    expect(counters(s)).toBe(1);
  });
  it("⭐ a token creature exiled counts too (it goes to exile before it ceases to exist — CR 111.7)", () => {
    let s = table({ user: [["herd", SOULHERDER], ...lands("p", "Plains", "W", 1)], ai: [["tok", SOLDIER_TOKEN]], userHand: [["stp", SWORDS]] });
    s = castAt(s, "stp", "tok");
    expect(counters(s)).toBe(1);
  });
  it("control: a creature that dies or is bounced is not exiled — no counter", () => {
    let s = table({ user: [["herd", SOULHERDER], ...lands("s", "Swamp", "B", 3)], ai: [["giant", HILL_GIANT]], userHand: [["murder", MURDER]] });
    s = castAt(s, "murder", "giant");
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Hill Giant");
    expect(counters(s)).toBe(0);
    let t = table({ user: [["herd", SOULHERDER], ...lands("i", "Island", "U", 1)], ai: [["giant", HILL_GIANT]], userHand: [["uns", UNSUMMON]] });
    t = castAt(t, "uns", "giant");
    expect(t.players.ai.hand.map((c) => c.name)).toContain("Hill Giant");
    expect(counters(t)).toBe(0);
  });
  it("⭐ under Rest in Peace a creature that would die is exiled instead — it counts (CR 614.1a)", () => {
    let s = table({ user: [["herd", SOULHERDER], ["rip", REST_IN_PEACE], ...lands("s", "Swamp", "B", 3)], ai: [["giant", HILL_GIANT]], userHand: [["murder", MURDER]] });
    s = castAt(s, "murder", "giant");
    expect(s.players.ai.exile.map((c) => c.name)).toContain("Hill Giant");
    expect(counters(s)).toBe(1);
  });
  it("control: a noncreature permanent exiled is not a creature — no trigger", () => {
    let s = table({ user: [["herd", SOULHERDER]], ai: [["ring", SOL_RING]] });
    s = moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "exile", cardId: "ring" });
    s = checkLeavesTriggers(s);
    expect(s.pendingTriggers || []).toHaveLength(0);
  });
  it("two creatures exiled in one event trigger it twice", () => {
    let s = table({ user: [["herd", SOULHERDER]], ai: [["giant", HILL_GIANT], ["bears", BEARS]] });
    s = moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "exile", cardId: "giant" });
    s = moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "exile", cardId: "bears" });
    s = groupLeaveEvents(s, ["giant", "bears"]);
    s = resolveAll(checkLeavesTriggers(s));
    expect(counters(s)).toBe(2);
  });
  it("Soulherder exiled itself: the trigger looks back and resolves, but there is no creature to put the counter on", () => {
    let s = table({ user: [["herd", SOULHERDER], ...lands("p", "Plains", "W", 1)], userHand: [["stp", SWORDS]] });
    s = castAt(s, "stp", "herd");
    expect(named(s, "user", "Soulherder")).toHaveLength(0);
    expect(s.players.user.exile.map((c) => c.name)).toContain("Soulherder");
  });
});

describe("runtime — the end-step blink feeds the watcher", () => {
  it("⭐ the end step blinks the Wall of Omens (never Soulherder itself): the Wall draws again and Soulherder gets a counter", () => {
    let s = table({ user: [["herd", SOULHERDER], ["wall", WALL_OF_OMENS, { tapped: true }]], phase: "ending", step: "end" });
    s = checkStepTriggers(s, "endStep");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    const trig = s.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.targets.map((t) => t.id)).toEqual(["wall"]);
    s = resolveAll(s);
    expect(named(s, "user", "Wall of Omens")[0].id).not.toBe("wall");
    expect(s.players.user.hand).toHaveLength(1);
    expect(counters(s)).toBe(1);
  });
});
