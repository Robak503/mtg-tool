/**
 * massacreWurm.test.js — Massacre Wurm (play-weighted #512): "When this creature enters, creatures your opponents control get
 * -2/-2 until end of turn." / "Whenever a creature an opponent controls dies, that player loses 2 life."
 *
 * The ETB was already modeled (the opponent-side mass debuff, a fixed set chosen as it resolves — CR 611.2c). The death watcher
 * was already DETECTED (a dies trigger scoped creatureOpponentControls) but its payoff never parsed: "that player" had no
 * referent. detectTriggers now rebuilds the whole clause, gated to that event and scope, as the "triggering permanent's
 * controller" sentinel — the controller stamped on the dying creature's look-back (CR 603.10a, CR 608.2h), which is the
 * battlefield it died from, never its owner.
 *
 * The 2020-06-23 rulings (bundled Scryfall) witnessed here: the trigger fires for the creatures the Wurm's own ETB kills; the ETB
 * affects only the creatures opponents control as it resolves (a creature they get later that turn is untouched); a creature an
 * opponent controls that dies at the same time as the Wurm still triggers it.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01). The Wurm, Day of Judgment, Act of
 * Treason and Unsummon are cast for real (legal action → dispatch → resolve); the other deaths go through the lethal-damage SBA
 * (destroyLethalCreatures → checkDiesTriggers). The last block's cards are SYNTHETIC — see its header.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, destroyLethalCreatures, creaturePower, creatureToughness } from "./gameState.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures ──
const WURM = {"name":"Massacre Wurm","type":"Creature — Phyrexian Wurm","mana":"{3}{B}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":[],"colors":["B"],"oracle":"When this creature enters, creatures your opponents control get -2/-2 until end of turn.\nWhenever a creature an opponent controls dies, that player loses 2 life."}; // native-trigger
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const TRAVELER = {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying."}; // native-trigger
const DAY = {"name":"Day of Judgment","type":"Sorcery","mana":"{2}{W}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Destroy all creatures."}; // native-spell
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Return target creature to its owner's hand."}; // native-spell

const P = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false });
const library = (prefix) => [1, 2, 3].map((i) => ({ ...BEARS, id: `${prefix}${i}` }));
const MANA = { W: 2, U: 1, B: 6, R: 3, C: 2 };
/** A two-player board in the active player's precombat main phase, both seats with mana for anything this file casts. */
function board({ user = [], ai = [], userHand = [], aiHand = [], active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...MANA }, library: library("ul") },
      ai: { ...s.players.ai, battlefield: ai, hand: aiHand, manaPool: { ...s.players.ai.manaPool, ...MANA }, library: library("al") } } };
}
/** A four-seat Commander pod (user → ai1 → ai2 → ai3): every other seat is the user's opponent. */
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], userHand = [] } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s.players[pid], battlefield, library: library(`${pid}l`), ...extra });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: seat("user", user, { hand: userHand, manaPool: { ...s.players.user.manaPool, ...MANA } }), ai1: seat("ai1", ai1), ai2: seat("ai2", ai2), ai3: seat("ai3", ai3) } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 30 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
/** Cast `cardId` from `pid`'s hand through the real legal-action offer (the one aimed at `targetId`, when given) and resolve it. */
function cast(s, pid, cardId, targetId = null) {
  const act = legalActionsForPlayer(s, pid).find((a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || a.targets?.[0]?.id === targetId));
  expect(act, `${pid} can cast ${cardId}${targetId ? ` at ${targetId}` : ""}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}
/** Lethal damage on `ids`, then the SBA death chokepoint (destroyLethalCreatures → checkDiesTriggers); not yet settled. */
function killByDamage(s, ids) {
  const players = Object.fromEntries(Object.entries(s.players).map(([pid, pl]) => [pid, { ...pl, battlefield: pl.battlefield.map((p) => (ids.includes(p.id) ? { ...p, damageMarked: 99 } : p)) }]));
  const r = destroyLethalCreatures({ ...s, players });
  return checkDiesTriggers(r.state, r.dead);
}
const lifeDelta = (s0, s) => Object.fromEntries(Object.keys(s0.players).map((pid) => [pid, s.players[pid].life - s0.players[pid].life]));
/** The Wurm's death triggers waiting on the stack, by the creature whose death caused each. */
const wurmDiesTriggers = (s) => (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Massacre Wurm" && o.payload?.params?.context?.triggeringPermanentId !== o.source?.permanentId)
  .map((o) => o.payload.params.context.triggeringPermanentId).sort();
const pending = (s) => (s.pendingTriggers || []).filter((t) => t.source?.name === "Massacre Wurm").length;
const pt = (s, perm) => `${creaturePower(perm, s)}/${creatureToughness(perm, s)}`;
const controllerOf = (s, id) => Object.keys(s.players).find((pid) => s.players[pid].battlefield.some((p) => p.id === id)) ?? null;

/** Cast the Wurm into an AI board of two Bears, a Hill Giant and a Doomed Traveler (the user keeps a Bears of its own). */
function castWurmIntoTheAiBoard() {
  const s0 = board({ user: [P("ub", "user", BEARS)], ai: [P("b1", "ai", BEARS), P("b2", "ai", BEARS), P("hg", "ai", HILL_GIANT), P("trav", "ai", TRAVELER)], userHand: [{ ...WURM, id: "wurm" }] });
  const entered = cast(s0, "user", "wurm"); // the Wurm resolved; its ETB is on the stack
  const debuffed = flushTriggers(resolveTopOfStack(entered), { chooseTargets: chooseTriggerTargets }); // the -2/-2 resolved; the deaths' triggers stacked
  return { s0, debuffed, s: settle(debuffed) };
}

describe("classification and parse", () => {
  it("⭐ Massacre Wurm → native-trigger", () => {
    expect(classifyCard(WURM)).toBe("native-trigger");
  });

  it("the death watcher's clause becomes the triggering permanent's controller; the ETB is the opponent-side mass debuff", () => {
    const dets = detectTriggers(WURM);
    const dies = dets.find((d) => d.event === "dies");
    const etb = dets.find((d) => d.event === "etb");
    expect(dies).toMatchObject({ scope: "creatureOpponentControls", effectClause: "the triggering permanent's controller loses 2 life" });
    expect(parseEffectClause(dies.effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "lose-life", amount: 2, who: "triggeringPermanentController", targetType: null }]);
    expect(etb.scope).toBe("self");
    expect(parseEffectClause(etb.effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "pump", scope: "eachOpponentCreature", ptDelta: { p: -2, t: -2 } }]);
  });
});

describe("RUNTIME — the dying creature's controller loses 2", () => {
  it("⭐ cast for real: the -2/-2 kills both Bears and the Traveler, each death its own trigger; the AI loses 6, the Hill Giant lives at 1/1, the user's own Bears is untouched, the Spirit the AI gets afterwards is a 1/1", () => {
    const { s0, debuffed, s } = castWurmIntoTheAiBoard();
    const spirit = s.players.ai.battlefield.find((p) => p.card?.token);
    const row = {
      triggers: wurmDiesTriggers(debuffed),
      life: lifeDelta(s0, s),
      giant: pt(s, s.players.ai.battlefield.find((p) => p.id === "hg")),
      userBears: pt(s, s.players.user.battlefield.find((p) => p.id === "ub")),
      spirit: spirit ? pt(s, spirit) : null,
    };
    console.log("  WITNESS wurmCast", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ triggers: ["b1", "b2", "trav"], life: { user: 0, ai: -6 }, giant: "1/1", userBears: "2/2", spirit: "1/1" });
  });

  it("⭐ a token dies too: the Spirit the Traveler left behind, killed by lethal damage, costs the AI 2 more", () => {
    const { s } = castWurmIntoTheAiBoard();
    const spirit = s.players.ai.battlefield.find((p) => p.card?.token);
    const after = settle(killByDamage(s, [spirit.id]));
    expect({ spiritGone: !after.players.ai.battlefield.some((p) => p.id === spirit.id), life: lifeDelta(s, after) }).toEqual({ spiritGone: true, life: { user: 0, ai: -2 } });
  });

  it("⭐ multiplayer: each death drains ITS controller — ai1 (one Bears) 2, ai2 (two Bears) 4, ai3 (a Hill Giant that lives) 0, the caster 0", () => {
    const s0 = pod({ ai1: [P("a1b", "ai1", BEARS)], ai2: [P("a2b1", "ai2", BEARS), P("a2b2", "ai2", BEARS)], ai3: [P("a3g", "ai3", HILL_GIANT)], userHand: [{ ...WURM, id: "wurm" }] });
    const s = settle(cast(s0, "user", "wurm"));
    const row = lifeDelta(s0, s);
    console.log("  WITNESS wurmPod", JSON.stringify(row));
    expect(row).toEqual({ user: 0, ai1: -2, ai2: -4, ai3: 0 });
  });

  it("⭐ dying at the same time (CR 603.10a; the ruling): Day of Judgment takes the Wurm, the user's Bears and the AI's two Bears — the Wurm triggers for the AI's two only", () => {
    const s0 = board({ user: [P("wurm", "user", WURM), P("ub", "user", BEARS)], ai: [P("b1", "ai", BEARS), P("b2", "ai", BEARS)], userHand: [{ ...DAY, id: "day" }] });
    const resolved = cast(s0, "user", "day");
    const s = settle(resolved);
    expect({ triggers: wurmDiesTriggers(resolved), life: lifeDelta(s0, s) }).toEqual({ triggers: ["b1", "b2"], life: { user: 0, ai: -4 } });
  });

  it("VACUITY CONTROL — the user's own Bears dies under the user's Wurm: no trigger, no life moves", () => {
    const s0 = board({ user: [P("wurm", "user", WURM), P("ub", "user", BEARS)] });
    const s = killByDamage(s0, ["ub"]);
    expect({ fired: pending(s), life: lifeDelta(s0, settle(s)) }).toEqual({ fired: 0, life: { user: 0, ai: 0 } });
  });

  it("⭐ controller, not owner: the AI's Bears, taken by the user's Act of Treason, dies under the USER's control — no trigger", () => {
    const s0 = board({ user: [P("wurm", "user", WURM)], ai: [P("b1", "ai", BEARS)], userHand: [{ ...ACT_OF_TREASON, id: "aot" }] });
    const taken = settle(cast(s0, "user", "aot", "b1"));
    expect(controllerOf(taken, "b1")).toBe("user");
    const s = killByDamage(taken, ["b1"]);
    expect({ fired: pending(s), life: lifeDelta(taken, settle(s)) }).toEqual({ fired: 0, life: { user: 0, ai: 0 } });
  });

  it("⭐ controller, not owner: the user's Bears, taken by the AI's Act of Treason on its turn, dies under the AI's control — the AI loses 2, not the user who owns it", () => {
    const s0 = board({ user: [P("wurm", "user", WURM), P("ub", "user", BEARS)], aiHand: [{ ...ACT_OF_TREASON, id: "aot" }], active: "ai" });
    const taken = settle(cast(s0, "ai", "aot", "ub"));
    expect(controllerOf(taken, "ub")).toBe("ai");
    const s = settle(killByDamage(taken, ["ub"]));
    const row = lifeDelta(taken, s);
    console.log("  WITNESS wurmStolenBears", JSON.stringify(row));
    expect(row).toEqual({ user: 0, ai: -2 });
  });

  it("the other way round: the AI's Wurm, and the user's Bears dying, cost the user 2", () => {
    const s0 = board({ user: [P("ub", "user", BEARS)], ai: [P("wurm", "ai", WURM)] });
    expect(lifeDelta(s0, settle(killByDamage(s0, ["ub"])))).toEqual({ user: -2, ai: 0 });
  });

  it("leaving is not dying (CR 700.4): the AI's Bears returned to hand by Unsummon triggers nothing", () => {
    const s0 = board({ user: [P("wurm", "user", WURM)], ai: [P("b1", "ai", BEARS)], userHand: [{ ...UNSUMMON, id: "uns" }] });
    const resolved = cast(s0, "user", "uns", "b1");
    const s = settle(resolved);
    expect({ inHand: s.players.ai.hand.some((c) => c.id === "c-b1"), fired: pending(resolved) + wurmDiesTriggers(resolved).length, life: lifeDelta(s0, s) })
      .toEqual({ inHand: true, fired: 0, life: { user: 0, ai: 0 } });
  });
});

/**
 * ⛔ SYNTHETIC FALSE-POSITIVE WITNESSES — no printed card carries these texts (the 2026-10-01 corpus scan found Massacre Wurm the
 * only trigger whose clause is "that player loses N life" on an opponent-creature death). Each pins one gate of the rewrite by
 * showing the binding it would fabricate without it; each must stay unrewritten and off the native tiers.
 */
describe("⛔ synthetic — the gates that keep a fabricated referent out", () => {
  const synth = (oracle) => ({ name: "Synthetic Drain Probe", type: "Creature — Horror", mana: "{3}{B}", cmc: 4, power: "3", toughness: "3", keywords: [], colors: ["B"], oracle });
  const drainClause = (card, event) => detectTriggers(card).find((d) => d.event === event)?.effectClause;

  it("the BATCH event: \"one or more creatures your opponents control die\" can carry several opponents' creatures — \"that player\" names no single seat", () => {
    const card = synth("Whenever one or more creatures your opponents control die, that player loses 2 life.");
    expect({ clause: drainClause(card, "diesBatch"), tier: classifyCard(card) }).toEqual({ clause: "that player loses 2 life", tier: "body-only" });
  });

  it("another dies scope names no player at all: \"a creature you control dies, that player …\" is never bound (it would drain the watcher's own controller)", () => {
    const card = synth("Whenever a creature you control dies, that player loses 2 life.");
    expect({ clause: drainClause(card, "dies"), tier: classifyCard(card) }).toEqual({ clause: "that player loses 2 life", tier: "body-only" });
  });

  it("matched from the START of the clause: after \"target player draws a card and …\" the pronoun is the TARGET — never rebuilt onto the dying creature's controller", () => {
    const card = synth("Whenever a creature an opponent controls dies, target player draws a card and that player loses 2 life.");
    expect({ clause: drainClause(card, "dies"), tier: classifyCard(card) }).toEqual({ clause: "target player draws a card and that player loses 2 life", tier: "body-only" });
  });

  it("matched to the END of the clause: a trailing rider is never swallowed by the rebuild", () => {
    const card = synth("Whenever a creature an opponent controls dies, that player loses 2 life and you gain 2 life.");
    expect({ clause: drainClause(card, "dies"), tier: classifyCard(card) }).toEqual({ clause: "that player loses 2 life and you gain 2 life", tier: "body-only" });
  });
});
