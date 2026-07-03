/**
 * EXILE-X-CONTROLLER-RIDER (Curse of the Swine) — an {X}-cost exile whose TARGET COUNT is X, with a
 * per-exiled-creature controllerRider: "Exile X target creatures. For each creature exiled this way, its
 * controller creates a 2/2 green Boar creature token."
 *
 * The X-count twin of the RIDER-REMOVAL family (Beast Within / Generous Gift — "Exile target creature. Its
 * controller creates a token"). Two additions over the single-target rider:
 *   1. PARSER — matchExileXControllerRider emits { op:"exile", targetType:"creature", targetCountX:true,
 *      controllerRider:{createToken} }, xSpell:true, gated to hasX.
 *   2. TARGETING — targeting.expandAtoms's targetCountX branch picks EXACTLY ctx.xValue distinct creatures
 *      (min=max=X), enumerated per-X in legalChoices' xSpell cast branch.
 * The RESOLVER is UNCHANGED: applyRemovalWithRider already loops over ctx.targets, captures each target's
 * controller before the exile, then applies the createToken rider to EACH captured controller — exactly "for
 * each creature exiled this way, its controller creates a token".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "../gameState.js";
import { legalActionsForPlayer } from "../legalChoices.js";
import { dispatchAction } from "../actionDispatcher.js";
import { resolveTopOfStack } from "../gameEngine.js";
import { parseEffectProgram } from "./parser.js";
import { expandCastChoices } from "./targeting.js";
import { runEffectProgram } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

const CURSE_ORACLE =
  "Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token.";
const curseProg = () => parseEffectProgram({ type: "Sorcery", mana: "{X}{U}{U}", oracle: CURSE_ORACLE });
const comboSets = (combos) => combos.map((c) => (c.targets || []).map((t) => t.id).sort().join(",")).sort();

// A battlefield of vanilla 2/2 creatures per player (for exile + token checks).
const bfState = (specs) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (pid) => (id) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: pid, summoningSick: false });
  const next = { ...s, players: { ...s.players } };
  for (const [pid, ids] of Object.entries(specs)) next.players[pid] = { ...next.players[pid], battlefield: ids.map(mk(pid)), hand: [] };
  return next;
};

describe("EXILE-X-CONTROLLER-RIDER — parse shape", () => {
  it("parses Curse of the Swine → an X-count exile with a createToken controllerRider", () => {
    const p = curseProg();
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({
      op: "exile",
      targetType: "creature",
      targetCountX: true,
      controllerRider: { kind: "createToken", power: 2, toughness: 2, color: "green", subtype: "boar" },
    });
  });

  it("scales the token P/T and subtype off the printed rider (not hardcoded to Boar)", () => {
    const p = parseEffectProgram({ type: "Sorcery", mana: "{X}{U}{U}", oracle: "Exile X target creatures. For each creature exiled this way, its controller creates a 1/1 white Sheep creature token." });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0].controllerRider).toMatchObject({ kind: "createToken", power: 1, toughness: 1, color: "white", subtype: "sheep" });
  });
});

describe("EXILE-X-CONTROLLER-RIDER — CREED near-misses (whole card or nothing)", () => {
  // These MUST stay non-native (Arbiter) — a partial exile that drops/mismodels the rider is a forbidden FP.
  it("NO {X} cost (a printed 'two') is NOT matched by this X-count matcher — stays off targetCountX", () => {
    // hasX is false here (no {X} in the cost), so the matcher never runs; the two-sentence shape is unmodeled → low.
    const p = parseEffectProgram({ type: "Sorcery", mana: "{2}{U}{U}", oracle: "Exile two target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token." });
    expect(p.confidence).not.toBe("high");
  });

  it("a NON-createToken rider (its controller draws a card) stays LOW → Arbiter", () => {
    const p = parseEffectProgram({ type: "Sorcery", mana: "{X}{U}{U}", oracle: "Exile X target creatures. For each creature exiled this way, its controller draws a card." });
    expect(p.confidence).not.toBe("high");
  });

  it("a trailing rider after the token clause leaves residue → LOW → Arbiter", () => {
    const p = parseEffectProgram({ type: "Sorcery", mana: "{X}{U}{U}", oracle: "Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token. You gain 2 life." });
    expect(p.confidence).not.toBe("high");
  });
});

describe("EXILE-X-CONTROLLER-RIDER — X-count target expansion (targeting.expandAtoms)", () => {
  it("at X=2, offers exactly the size-2 target subsets (never fewer, never more)", () => {
    const s = bfState({ user: ["a"], ai: ["x", "y"] });
    const combos = expandCastChoices(s, "user", curseProg(), ["U"], { xValue: 2 });
    // C(3,2) = 3 pairs; every combo has exactly 2 targets, all atomIndex 0
    expect(comboSets(combos)).toEqual(["a,x", "a,y", "x,y"]);
    expect(combos.every((c) => c.targets.length === 2 && c.targets.every((t) => t.atomIndex === 0))).toBe(true);
  });

  it("at X=1, offers exactly the single-target picks", () => {
    const s = bfState({ user: ["a"], ai: ["x", "y"] });
    const combos = expandCastChoices(s, "user", curseProg(), ["U"], { xValue: 1 });
    expect(comboSets(combos)).toEqual(["a", "x", "y"]);
  });

  it("when X exceeds the legal-target pool, the cast is uncastable at that X (no combos)", () => {
    const s = bfState({ user: ["a"], ai: [] }); // only 1 creature
    const combos = expandCastChoices(s, "user", curseProg(), ["U"], { xValue: 3 });
    expect(combos).toEqual([]); // can't choose 3 targets from 1 → uncastable
  });
});

describe("EXILE-X-CONTROLLER-RIDER — runtime (per-exiled rider)", () => {
  it("resolving a 2-target cast exiles BOTH and each controller makes ONE 2/2 Boar", () => {
    const s = bfState({ user: ["a"], ai: ["x", "y"] });
    const p = curseProg();
    const targets = [
      { type: "creature", id: "a", controller: "user", atomIndex: 0 },
      { type: "creature", id: "x", controller: "ai", atomIndex: 0 },
    ];
    const out = runEffectProgram(s, { source: { name: "Curse of the Swine" }, payload: { params: { program: p, controller: "user", xValue: 2, targets } } });
    // a and x are exiled; y untouched.
    expect(out.players.user.battlefield.filter((pm) => !pm.card?.token)).toHaveLength(0); // a gone
    expect(out.players.ai.battlefield.filter((pm) => pm.id === "y")).toHaveLength(1);      // y stayed
    expect(out.players.ai.battlefield.filter((pm) => pm.id === "x")).toHaveLength(0);      // x gone
    // EACH exiled creature's controller made exactly one 2/2 Boar (user for a, ai for x).
    const userBoars = out.players.user.battlefield.filter((pm) => pm.card?.token && /Boar/.test(pm.card.type));
    const aiBoars = out.players.ai.battlefield.filter((pm) => pm.card?.token && /Boar/.test(pm.card.type));
    expect(userBoars).toHaveLength(1);
    expect(aiBoars).toHaveLength(1);
    expect(userBoars[0].card).toMatchObject({ power: 2, toughness: 2 });
    expect(aiBoars[0].card).toMatchObject({ power: 2, toughness: 2 });
  });

  it("two exiled creatures under the SAME controller → that controller makes TWO Boars", () => {
    const s = bfState({ user: [], ai: ["x", "y"] });
    const p = curseProg();
    const targets = [
      { type: "creature", id: "x", controller: "ai", atomIndex: 0 },
      { type: "creature", id: "y", controller: "ai", atomIndex: 0 },
    ];
    const out = runEffectProgram(s, { source: { name: "Curse of the Swine" }, payload: { params: { program: p, controller: "user", xValue: 2, targets } } });
    const aiBoars = out.players.ai.battlefield.filter((pm) => pm.card?.token && /Boar/.test(pm.card.type));
    expect(aiBoars).toHaveLength(2); // one per exiled creature (both ai's)
    expect(out.players.user.battlefield.filter((pm) => pm.card?.token)).toHaveLength(0); // controller (user) exiled none of its own
  });
});

describe("EXILE-X-CONTROLLER-RIDER — full cast pipeline (cast → pay → resolve)", () => {
  const island = (id) => ({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
  const bear = (id, pid) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: pid, summoningSick: false });
  function curseState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const curse = { id: "curse", name: "Curse of the Swine", type: "Sorcery", mana: "{X}{U}{U}", oracle: CURSE_ORACLE };
    return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
      players: { ...s.players,
        user: { ...s.players.user, hand: [curse], battlefield: [island("i0"), island("i1"), island("i2"), island("i3"), bear("a", "user")] },
        ai: { ...s.players.ai, battlefield: [bear("x", "ai"), bear("y", "ai")] } } };
  }

  it("4 Islands ({X}{U}{U}) surfaces X=1..2, casting X=2 pays {2}{U}{U}, exiles 2, mints 2 Boars", () => {
    const state = curseState();
    const casts = legalActionsForPlayer(state, "user").filter((a) => a.kind === "cast-spell");
    expect([...new Set(casts.map((a) => a.xValue))].sort()).toEqual([1, 2]); // {U}{U} + up to {2}

    const action = casts.find((a) => a.xValue === 2 && (a.targets || []).map((t) => t.id).sort().join(",") === "a,x");
    expect(action).toBeTruthy();
    expect(action.targets).toHaveLength(2); // exactly X targets
    expect(action.targets.every((t) => t.atomIndex === 0)).toBe(true);

    const afterCast = dispatchAction(state, action);
    expect(afterCast.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(4); // {U}{U}{2}
    expect(afterCast.stack).toHaveLength(1);

    const resolved = resolveTopOfStack(afterCast);
    // a and x exiled; y stays.
    expect(resolved.players.user.battlefield.some((p) => p.id === "a")).toBe(false);
    expect(resolved.players.ai.battlefield.some((p) => p.id === "x")).toBe(false);
    expect(resolved.players.ai.battlefield.some((p) => p.id === "y")).toBe(true);
    // Each controller of an exiled creature made exactly one 2/2 Boar.
    const boars = (pid) => resolved.players[pid].battlefield.filter((p) => p.card?.token && /Boar/.test(p.card.type));
    expect(boars("user")).toHaveLength(1);
    expect(boars("ai")).toHaveLength(1);
    expect(boars("user")[0].card).toMatchObject({ power: 2, toughness: 2 });
    expect(resolved.pendingArbiter).toBeUndefined(); // fully native — never routed to the Arbiter
  });
});
