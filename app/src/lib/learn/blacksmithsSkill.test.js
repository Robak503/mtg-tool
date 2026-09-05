/**
 * BLACKSMITH'S SKILL — SHELF-85 · Otharri O9 (2026-09-05). "Target permanent gains hexproof and indestructible until end
 * of turn. If it's an artifact creature, it gets +2/+2 until end of turn." Two seams: the keyword grant on a target
 * PERMANENT (the creature-only arm's twin; the splitter's permanent-subject keep-whole was nailed to "you control"), and
 * a TYPE-CONDITIONAL bound-referent pump — "if it's an artifact creature" is a per-object condition the leading-if peel
 * refuses (no board reader), so a dedicated arm carries it as `ifBoundTypes` and applyPumpEffect reads the target's
 * LAYER-4 types at resolution (CR 608.2): an artifact creature is pumped, a plain creature or a non-creature artifact
 * only gets the grant, and an artifact ANIMATED into a creature counts (the layer-aware read, not the printed line).
 *
 * Mutation-checked: see the run ledger (docs-sk56).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { permanentHasKeyword, addContinuousEffect } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SKILL = { name: "Blacksmith's Skill", type: "Instant", mana: "{W}", keywords: [], oracle: "Target permanent gains hexproof and indestructible until end of turn. If it's an artifact creature, it gets +2/+2 until end of turn." };
const perm = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
const bear = () => perm("bear", { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
const golem = () => perm("golem", { name: "Iron Golem", type: "Artifact Creature — Golem", power: 3, toughness: 3, oracle: "" });
const ring = () => perm("ring", { name: "Sol Ring", type: "Artifact", oracle: "" });
function setup(board) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, hand: [{ ...SKILL, id: "sk1" }], battlefield: board, manaPool: { ...b.players.user.manaPool, W: 1 } } } };
}
const castAt = (s, targetName) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sk1" && a.targetName === targetName);
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const find = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const kws = (s, id) => ["hexproof", "indestructible"].map((k) => permanentHasKeyword(s, id, k));

describe("classify + parse", () => {
  it("the whole card parses HIGH: a permanent-scoped grant + a type-conditional bound pump; native-spell", () => {
    const prog = parseEffectProgram(SKILL);
    const row = { confidence: prog.confidence, atoms: prog.atoms.map((a) => [a.op, a.targetType ?? null, a.grantKeywords, a.ptDelta, a.bindPreviousTargets ?? false, a.ifBoundTypes ?? null]), tier: classifyCard(SKILL) };
    console.log("  WITNESS skillParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([
      ["pump", "permanent", ["hexproof", "indestructible"], { p: 0, t: 0 }, false, null],
      ["pump", null, [], { p: 2, t: 2 }, true, ["Artifact", "Creature"]],
    ]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("the type-conditional pump at resolution", () => {
  it("a plain creature: the grant lands, NO pump (2/2 stays 2/2); an artifact creature: grant + +2/+2 (3/3 → 5/5); a non-creature artifact: the grant lands, no pump", () => {
    const row = {};
    for (const [key, mk, name] of [["bear", bear, "Grizzly Bears"], ["golem", golem, "Iron Golem"], ["ring", ring, "Sol Ring"]]) {
      let s = setup([mk()]);
      const cast = castAt(s, name);
      expect(cast, `${name} must be a legal target`).toBeTruthy();
      s = drain(dispatchAction(s, cast));
      const p = find(s, key);
      row[key] = { kws: kws(s, key), pt: p.card.type.includes("Creature") ? [creaturePower(p, s), creatureToughness(p, s)] : null, stack: s.stack.length };
    }
    console.log("  WITNESS skillResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.bear).toEqual({ kws: [true, true], pt: [2, 2], stack: 0 });
    expect(row.golem).toEqual({ kws: [true, true], pt: [5, 5], stack: 0 });
    expect(row.ring).toEqual({ kws: [true, true], pt: null, stack: 0 });
  });

  it("an artifact ANIMATED into a creature (a layer-4 type grant, printed line still 'Artifact') IS an artifact creature at resolution: +2/+2 lands (0/0 base → the layer-7 read shows +2/+2)", () => {
    let s = setup([ring()]);
    s = addContinuousEffect(s, { layer: 4, op: { types: ["Creature"], subtypes: ["Golem"] }, affects: { mode: "fixed", permanentIds: ["ring"] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "test" } }).state;
    s = addContinuousEffect(s, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 1, toughness: 1 }, affects: { mode: "fixed", permanentIds: ["ring"] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "test" } }).state;
    const before = [creaturePower(find(s, "ring"), s), creatureToughness(find(s, "ring"), s)];
    const cast = castAt(s, "Sol Ring");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    const after = [creaturePower(find(s, "ring"), s), creatureToughness(find(s, "ring"), s)];
    const row = { before, after, kws: kws(s, "ring") };
    console.log("  WITNESS skillAnimated", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.kws).toEqual([true, true]);
    expect(row.after).toEqual([before[0] + 2, before[1] + 2]);
  });
});
