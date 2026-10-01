/**
 * BRAIDS, ARISEN NIGHTMARE — the play-weighted program, P·20 (EDHREC #291).
 *   "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do,
 *    each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't,
 *    that player loses 2 life and you draw a card."
 *
 * Two atoms: the controller's OPTIONAL sacrifice from the five-type pool, then `edict-shares-type`, gated `ifSacrificed`. The
 * payoff is the Torment of Hailfire edict chain with a spec — each opponent's pool is their permanents sharing a card type
 * with the sacrificed one (its types as it left, layer-aware, supertypes excluded — CR 205.4a), the life branch loses the
 * printed 2 and Braids' controller draws, and there is no discard mode. A sole candidate sacrifices inline; the optional
 * settle now tells the gated payoff that it happened (before P·20 only a paused pick could).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { addContinuousEffect } from "./layers.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveOptionalChoice, resolveSacrificeChoice, resolveEdictModeChoice, autoPickEdictMode, runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS, PAUSING_ATOM_OPS } from "./effects/effectAtoms.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";

beforeEach(() => _resetIdsForTests());

const BRAIDS = { name: "Braids, Arisen Nightmare", type: "Legendary Creature — Nightmare", mana: "{1}{B}{B}", keywords: [], power: 3, toughness: 3, oracle: "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." };

const perm = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, oracle: "", ...card }, controller: ctrl, summoningSick: false });
const bear = (id, ctrl) => perm(id, ctrl, { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2 });
const swamp = (id, ctrl) => perm(id, ctrl, { name: "Swamp", type: "Basic Land — Swamp" });
const ring = (id, ctrl) => perm(id, ctrl, { name: "Sol Ring", type: "Artifact", mana: "{1}" });
const myr = (id, ctrl) => perm(id, ctrl, { name: "Palladium Myr", type: "Artifact Creature — Myr", mana: "{3}", power: 2, toughness: 2 });
const arena = (id, ctrl) => perm(id, ctrl, { name: "Phyrexian Arena", type: "Enchantment", mana: "{1}{B}{B}" });
const shrine = (id, ctrl) => perm(id, ctrl, { name: "Honden of Night's Reach", type: "Legendary Enchantment — Shrine", mana: "{3}{B}" });
const walker = (id, ctrl) => perm(id, ctrl, { name: "Liliana of the Veil", type: "Legendary Planeswalker — Liliana", mana: "{1}{B}{B}" });
const battle = (id, ctrl) => perm(id, ctrl, { name: "Invasion of Tolvada", type: "Battle — Siege", mana: "{3}{W}{B}" });
const food = (id, ctrl) => perm(id, ctrl, { name: "Food", type: "Token Artifact — Food", token: true });
const libCard = (i) => ({ id: `L${i}`, name: `Library Card ${i}`, type: "Sorcery", oracle: "" });
const handCard = (id) => ({ id, name: "Hand Card", type: "Sorcery", oracle: "" });

function duel({ user = [], ai = [], aiHand = [], aiLife = 40 } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...b, activePlayer: "user", priorityHolder: "user", phase: "ending", step: "end", pendingTriggers: [],
    players: {
      ...b.players,
      user: { ...b.players.user, battlefield: [perm("braids", "user", BRAIDS), ...user], library: [libCard(1), libCard(2), libCard(3)], hand: [] },
      ai: { ...b.players.ai, battlefield: ai, hand: aiHand, life: aiLife },
    },
  };
}
function pod({ ai1 = [], ai2 = [], ai3 = [] } = {}) {
  const b = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...b, activePlayer: "user", priorityHolder: "user", phase: "ending", step: "end", pendingTriggers: [],
    players: {
      ...b.players,
      user: { ...b.players.user, battlefield: [perm("braids", "user", BRAIDS)], library: [libCard(1), libCard(2), libCard(3)], hand: [] },
      ai1: { ...b.players.ai1, battlefield: ai1 },
      ai2: { ...b.players.ai2, battlefield: ai2 },
      ai3: { ...b.players.ai3, battlefield: ai3 },
    },
  };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const endStep = (s) => settle(checkStepTriggers(s, "endStep"));
const bfIds = (s, pid) => s.players[pid].battlefield.map((p) => p.id);
const gyNames = (s, pid) => s.players[pid].graveyard.map((c) => c.name);
const pcView = (pc) => (pc ? { kind: pc.kind, controller: pc.controller, modes: pc.modes ?? null, sac: (pc.sac || pc.candidates || []).map((c) => c.id) } : null);

describe("classify + parse", () => {
  it("the end-step trigger parses HIGH as the optional five-type sacrifice + the gated shares-a-card-type edict; the card classifies native-trigger", () => {
    const d = detectTriggers(BRAIDS);
    const p = parseEffectClause(d[0].effectClause, "trigger");
    const row = { triggers: d.map((x) => `${x.event}/${x.scope}`), confidence: p.confidence, atoms: p.atoms, tier: classifyCard(BRAIDS) };
    console.log("  WITNESS braidsParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.triggers).toEqual(["endStep/you"]);
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([
      { op: "sacrifice", who: "controller", what: "nonbattlePermanent", optional: true },
      { op: "edict-shares-type", ifSacrificed: true, lifeLoss: 2, casterDraws: 1, targetType: null },
    ]);
    expect(row.tier).toBe("native-trigger");
  });
  it("a different printed shape stays unparsed by this matcher (no discard-mode or 3-life variant is read as Braids)", () => {
    const variant = (t) => parseEffectClause(t, "trigger").atoms?.some((a) => a.op === "edict-shares-type") ?? false;
    expect(variant("you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card.")).toBe(true);
    expect(variant("you may sacrifice a creature. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card.")).toBe(false);
    expect(variant("you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life.")).toBe(false);
  });
});

describe("the end step", () => {
  it("the trigger resolves into the printed 'you may' for Braids' controller", () => {
    const p = endStep(duel({ ai: [bear("b1", "ai")] }));
    expect(p.pendingChoice?.kind).toBe("optional-effect");
    expect(p.pendingChoice?.controller).toBe("user");
    expect(p.pendingChoice?.effectOp).toBe("sacrifice");
  });

  it("declined: nothing is sacrificed, no opponent is asked, nobody loses life, nothing is drawn", () => {
    const s = resolveOptionalChoice(endStep(duel({ ai: [bear("b1", "ai")] })), false);
    const row = { pc: pcView(s.pendingChoice), user: bfIds(s, "user"), ai: bfIds(s, "ai"), aiLife: s.players.ai.life, hand: s.players.user.hand.length };
    console.log("  WITNESS braidsDecline", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pc: null, user: ["braids"], ai: ["b1"], aiLife: 40, hand: 0 });
  });

  it("a sole candidate goes inline — Braids herself, a LEGENDARY creature: the opponent's pool is its creatures, never its legendary enchantment (a supertype is not a card type, CR 205.4a); a hand gives no discard mode", () => {
    const s = resolveOptionalChoice(endStep(duel({ ai: [bear("b1", "ai"), shrine("h1", "ai"), swamp("s1", "ai")], aiHand: [handCard("h-1")] })), true);
    const sacEvent = [...s.log].reverse().find((e) => e.effect === "sacrifice" && e.controller === "user");
    const row = { gy: gyNames(s, "user"), cardTypes: sacEvent?.cardTypes, pc: pcView(s.pendingChoice), spec: s.pendingChoice?.spec };
    console.log("  WITNESS braidsInline", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.gy).toEqual(["Braids, Arisen Nightmare"]);
    expect(row.cardTypes).toEqual(["Creature"]);
    expect(row.pc).toEqual({ kind: "edict-mode", controller: "ai", modes: ["life", "sacrifice"], sac: ["b1"] });
    expect(row.spec).toEqual({ lifeLoss: 2, drawFor: "user", drawCount: 1, sacTypes: ["Creature"], allowDiscard: false });
  });

  it("the opponent doesn't sacrifice: it loses 2 and Braids' controller draws a card", () => {
    const paused = resolveOptionalChoice(endStep(duel({ ai: [bear("b1", "ai")] })), true);
    const s = resolveEdictModeChoice(paused, { mode: "life" });
    const row = { pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, ai: bfIds(s, "ai"), hand: s.players.user.hand.map((c) => c.id), library: s.players.user.library.length };
    console.log("  WITNESS braidsLife", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pc: null, aiLife: 38, ai: ["b1"], hand: ["L1"], library: 2 });
  });

  it("the opponent sacrifices a sharing permanent: no life lost, nothing drawn", () => {
    const paused = resolveOptionalChoice(endStep(duel({ ai: [bear("b1", "ai")] })), true);
    const s = resolveEdictModeChoice(paused, { mode: "sacrifice", permId: "b1" });
    const row = { pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, aiGy: gyNames(s, "ai"), hand: s.players.user.hand.length };
    expect(row).toEqual({ pc: null, aiLife: 40, aiGy: ["Grizzly Bears"], hand: 0 });
  });

  it("a real pick: Braids' controller chooses among the five types (a planeswalker yes, a battle no) and takes the artifact — the opponent may answer with an artifact creature, not a plain creature", () => {
    const taken = resolveOptionalChoice(endStep(duel({ user: [ring("r1", "user"), swamp("us", "user"), walker("pw", "user"), battle("bt", "user")], ai: [myr("m1", "ai"), bear("b1", "ai")] })), true);
    const picked = resolveSacrificeChoice(taken, "r1");
    const row = { pick: pcView(taken.pendingChoice), gy: gyNames(picked, "user"), pc: pcView(picked.pendingChoice) };
    console.log("  WITNESS braidsPick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pick).toEqual({ kind: "sacrifice-choice", controller: "user", modes: null, sac: ["braids", "r1", "us", "pw"] }); // the planeswalker may go; the battle may not
    expect(row.gy).toEqual(["Sol Ring"]);
    expect(row.pc).toEqual({ kind: "edict-mode", controller: "ai", modes: ["life", "sacrifice"], sac: ["m1"] });
  });

  it("an opponent with nothing sharing a type has no choice (a hand doesn't give one): it loses 2 and you draw", () => {
    const taken = resolveOptionalChoice(endStep(duel({ user: [arena("e1", "user")], ai: [bear("b1", "ai"), swamp("s1", "ai")], aiHand: [handCard("h-1")] })), true);
    const s = resolveSacrificeChoice(taken, "e1");
    const row = { pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, aiHand: s.players.ai.hand.length, hand: s.players.user.hand.length };
    console.log("  WITNESS braidsForced", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pc: null, aiLife: 38, aiHand: 1, hand: 1 });
  });

  it("card types are read layer-aware on both sides: an animated land leaves as a creature, and an opponent's animated land is a creature to answer with", () => {
    // A full animate: the layer-4 Creature type plus a layer-7b 3/3 body (a 0/0 would die to state-based actions first).
    const animate = (s, id) => {
      const typed = addContinuousEffect(s, { layer: 4, op: { types: ["Creature"], subtypes: ["Elemental"] }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "test" } }).state;
      return addContinuousEffect(typed, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 3, toughness: 3 }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "test" } }).state;
    };
    // Braids' side: the user's animated Swamp (Land + Creature) — the opponent controls a creature and no land.
    const mine = animate(duel({ user: [swamp("us", "user")], ai: [bear("b1", "ai")] }), "us");
    const minePc = resolveSacrificeChoice(resolveOptionalChoice(endStep(mine), true), "us").pendingChoice;
    // The opponent's side: the user sacrifices Braids (a creature); the opponent's only permanent is an animated Swamp.
    const theirs = animate(duel({ ai: [swamp("s1", "ai")] }), "s1");
    const theirsPc = resolveOptionalChoice(endStep(theirs), true).pendingChoice;
    const row = { mine: { ...pcView(minePc), types: minePc?.spec?.sacTypes }, theirs: pcView(theirsPc) };
    console.log("  WITNESS braidsLayers", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.mine).toEqual({ kind: "edict-mode", controller: "ai", modes: ["life", "sacrifice"], sac: ["b1"], types: ["Land", "Creature"] });
    expect(row.theirs).toEqual({ kind: "edict-mode", controller: "ai", modes: ["life", "sacrifice"], sac: ["s1"] });
  });

  it("nothing left to sacrifice when it resolves: 'if you do' fails — no opponent is asked, even with an earlier sacrifice (a Food, this turn) in the log", () => {
    const earlier = sacrificeCreatureEffect(duel({ user: [food("f1", "user")], ai: [ring("r9", "ai")] }), "user", "f1");
    const p = endStep(earlier);
    const gone = { ...p, players: { ...p.players, user: { ...p.players.user, battlefield: [] } } };
    const s = resolveOptionalChoice(gone, true);
    const row = { pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, hand: s.players.user.hand.length };
    expect(row).toEqual({ pc: null, aiLife: 40, hand: 0 });
  });

  it("declined after an earlier sacrifice this turn: the old sacrifice is not Braids' — no opponent is asked", () => {
    const earlier = sacrificeCreatureEffect(duel({ user: [food("f1", "user")], ai: [ring("r9", "ai")] }), "user", "f1");
    const s = resolveOptionalChoice(endStep(earlier), false);
    const row = { pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, ai: bfIds(s, "ai"), hand: s.players.user.hand.length };
    expect(row).toEqual({ pc: null, aiLife: 40, ai: ["r9"], hand: 0 });
  });

  it("Braids' controller leaves the game mid-pause: the opponent's answer still settles, and nobody draws for a departed player", () => {
    const paused = resolveOptionalChoice(endStep(pod({ ai1: [bear("b1", "ai1")], ai2: [], ai3: [] })), true);
    const { user: _departed, ...rest } = paused.players;
    const s = resolveEdictModeChoice({ ...paused, players: rest, turnOrder: paused.turnOrder.filter((pid) => pid !== "user") }, { mode: "life" });
    const row = { pc: pcView(s.pendingChoice), life: [s.players.ai1.life, s.players.ai2.life, s.players.ai3.life], user: !!s.players.user };
    expect(row.user).toBe(false);
    expect(row.pc).toBe(null);
    expect(row.life[0]).toBe(38);
  });
});

describe("the payoff atom's own reads", () => {
  const payoff = (s) => ATOM_RESOLVERS["edict-shares-type"](s, { op: "edict-shares-type", ifSacrificed: true, lifeLoss: 2, casterDraws: 1, targetType: null }, { controller: "user", cardName: BRAIDS.name });
  it("with no sacrifice of Braids' controller in the log it does nothing (no opponent asked, no life lost)", () => {
    const s = payoff(duel({ ai: [bear("b1", "ai")] }));
    expect({ pc: pcView(s.pendingChoice), aiLife: s.players.ai.life, hand: s.players.user.hand.length }).toEqual({ pc: null, aiLife: 40, hand: 0 });
  });
  it("reads the sacrifice Braids' controller made, not a later one by another player; it pauses, as the pausing-op registry declares", () => {
    let s = duel({ user: [arena("e1", "user")], ai: [bear("b1", "ai"), arena("e2", "ai")] });
    s = sacrificeCreatureEffect(s, "user", "e1");
    s = sacrificeCreatureEffect(s, "ai", "b1");
    const p = payoff(s).pendingChoice;
    expect({ ...pcView(p), types: p?.spec?.sacTypes }).toEqual({ kind: "edict-mode", controller: "ai", modes: ["life", "sacrifice"], sac: ["e2"], types: ["Enchantment"] });
    expect(PAUSING_ATOM_OPS.has("edict-shares-type")).toBe(true);
  });
});

describe("'if you do' reads a REAL sacrifice", () => {
  it("a sacrifice entry with no victim (an escaped self-sacrifice) never opens the gate — not even onto an earlier real sacrifice in the log (a synthetic program; runEffectProgram and the optional settle share the one predicate)", () => {
    const program = { version: 1, source: "parser", confidence: "high", structure: "sequence", modal: null, xSpell: false, unparsedTail: null,
      atoms: [{ op: "sacrifice", target: "self", unlessEscaped: true }, { op: "edict-shares-type", ifSacrificed: true, lifeLoss: 2, casterDraws: 1, targetType: null }] };
    let s = duel({ user: [food("f1", "user"), { ...bear("esc", "user"), escaped: true }], ai: [ring("r9", "ai")] });
    s = sacrificeCreatureEffect(s, "user", "f1"); // an earlier REAL sacrifice — an artifact, which the opponent's Sol Ring would share
    const out = runEffectProgram(s, { source: { name: "Test Source" }, payload: { params: { program, controller: "user", targets: [], sourceId: "esc", context: {} } } });
    const row = { pc: pcView(out.pendingChoice), user: bfIds(out, "user"), aiLife: out.players.ai.life, ai: bfIds(out, "ai") };
    expect(row).toEqual({ pc: null, user: ["braids", "esc"], aiLife: 40, ai: ["r9"] });
  });
});

describe("the pod", () => {
  it("each opponent answers in turn order — one keeps its creature and loses 2, one with nothing to share is forced, one sacrifices; you draw once per opponent who didn't", () => {
    let s = resolveOptionalChoice(endStep(pod({ ai1: [bear("b1", "ai1")], ai2: [swamp("s2", "ai2")], ai3: [bear("b3", "ai3")] })), true);
    const first = pcView(s.pendingChoice);
    s = resolveEdictModeChoice(s, { mode: "life" });
    const second = pcView(s.pendingChoice);
    s = resolveEdictModeChoice(s, { mode: "sacrifice", permId: "b3" });
    const row = { first, second, pc: pcView(s.pendingChoice), life: [s.players.ai1.life, s.players.ai2.life, s.players.ai3.life], ai3Gy: gyNames(s, "ai3"), hand: s.players.user.hand.map((c) => c.id) };
    console.log("  WITNESS braidsPod", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.first).toEqual({ kind: "edict-mode", controller: "ai1", modes: ["life", "sacrifice"], sac: ["b1"] });
    expect(row.second).toEqual({ kind: "edict-mode", controller: "ai3", modes: ["life", "sacrifice"], sac: ["b3"] });
    expect(row.pc).toBe(null);
    expect(row.life).toEqual([38, 38, 40]);
    expect(row.ai3Gy).toEqual(["Grizzly Bears"]);
    expect(row.hand).toEqual(["L1", "L2"]);
  });
});

describe("the AI's answer", () => {
  it("reads the printed 2: at 3 life it keeps its board and loses 2; at 2 it sacrifices", () => {
    const at = (life) => { const s = resolveOptionalChoice(endStep(duel({ ai: [bear("b1", "ai")], aiLife: life })), true); return autoPickEdictMode(s, s.pendingChoice); };
    expect(at(3)).toEqual({ mode: "life" });
    expect(at(2)).toEqual({ mode: "sacrifice", permId: "b1" });
  });
});
