/**
 * boardEval.test.js — QUARTET PHASE 1, slice 1 (2026-08-14): evaluateBoard + permanentValue + the
 * FIRST converted choice site (the AC-1 count-of-N sacrifice-victim ranking in legalChoices).
 * Plan + gates: docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md.
 *
 * ⭐ THE CONTRACT UNDER TEST:
 *   · permanentValue is pure/deterministic, layer-aware for P/T, role-aware via cardPlayHints,
 *     commander-weighted, token-discounted.
 *   · evaluateBoard is a monotone sum — more board is more score.
 *   · the CONVERTED SITE is flag-gated: `state.usePolicyEval` absent ⇒ the legacy MV-then-power
 *     ranking BYTE-IDENTICALLY (the default-off law); flag on ⇒ the evaluator's ranking.
 *
 * ⭐⭐ THE HEADLINE WITNESS (the wrong-pick board): Bankrupt-in-Blood-style "sacrifice two creatures"…
 * we use the sac-cost path's ranking directly through a real cast offer: pool = Sol Ring is not a
 * creature, so the CREATURE pool case uses a mana DORK instead — Llanowar Elves (MV 1, role ramp)
 * beside two vanilla bears (MV 2). The LEGACY policy sacrifices the Elves first (1 < 2 — strictly by
 * MV); the EVALUATOR keeps the mana engine and gives up the bears. Seen-to-fail control: the flag-off
 * offer IS the Elves pick (the old behavior, proven, not assumed).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the ramp ROLE_BONUS zeroed → the evaluator degenerates to MV-order → the Elves die again
 *     (the witness's whole point dies with it).
 *   · the flag gate inverted at the site → the LEGACY row changes (the default-off law violated —
 *     killed by the flag-off control).
 *
 * Real oracle fixtures (bundled Scryfall wordings).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { evaluateBoard, permanentValue } from "./boardEval.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { autoPickSacrificeCandidate, autoPickDiscardCandidate, optionalAutoTakeValue, runEffectProgram } from "./effects/runProgram.js";
import { chooseTriggerTargets } from "./gameEngine.js";
import { __scoreCastActionForTests } from "./opponentAI.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ELVES = { id: "c-elf", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1,
  power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const BEAR = (id) => ({ id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", mana: "{1}{G}", cmc: 2,
  power: "2", toughness: "2", oracle: "" });
const BANKRUPT = { id: "bib", name: "Bankrupt in Blood", type: "Sorcery", mana: "{1}{B}{B}", colors: ["B"], cmc: 3,
  oracle: "As an additional cost to cast this spell, sacrifice two creatures.\nDraw three cards." };

const perm = (id, card) => createPermanent({ id, controller: "user", summoningSick: false, card });

function board({ usePolicyEval } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    ...(usePolicyEval ? { usePolicyEval: true } : {}),
    players: { ...g.players, user: { ...g.players.user,
      battlefield: [perm("ELF", ELVES), perm("B1", BEAR("B1")), perm("B2", BEAR("B2"))],
      hand: [BANKRUPT], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 1 } } } };
}
const bankruptCast = (s) => (legalActionsForPlayer(s, "user") || []).find((a) => a.kind === "cast-spell" && a.cardId === "bib");

describe("the evaluator — pure, deterministic, role-aware", () => {
  it("⭐ a mana dork outvalues a vanilla bear despite the lower MV (the role bonus is the point)", () => {
    const s = board();
    const elf = s.players.user.battlefield.find((p) => p.id === "ELF");
    const bear = s.players.user.battlefield.find((p) => p.id === "B1");
    expect(permanentValue(elf, s)).toBeGreaterThan(permanentValue(bear, s));
  });

  it("evaluateBoard is monotone (more board = more score) and deterministic", () => {
    const s = board();
    const full = evaluateBoard(s, "user");
    const less = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.slice(1) } } };
    expect(full).toBeGreaterThan(evaluateBoard(less, "user"));
    expect(evaluateBoard(s, "user")).toBe(full); // same state, same number — pure
  });
});

describe("⭐⭐ LAW 6 — the first converted site: the sac-cost ranking, flag-gated", () => {
  it("⛔ SEEN-TO-FAIL control: flag OFF, the legacy policy gives up the ELVES first (MV-blind)", () => {
    const a = bankruptCast(board());
    expect(a).toBeTruthy();
    const row = { sacIds: [...(a.sacCountIds || [])].sort() };
    console.log("  WITNESS bankruptLegacy", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.sacIds).toContain("ELF"); // the wrong pick the evaluator exists to fix
  });

  it("⭐⭐ flag ON: the evaluator keeps the mana engine — both BEARS die, the Elves live", () => {
    const a = bankruptCast(board({ usePolicyEval: true }));
    expect(a).toBeTruthy();
    const row = { sacIds: [...(a.sacCountIds || [])].sort() };
    console.log("  WITNESS bankruptEval", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.sacIds).toEqual(["B1", "B2"]);
  });
});

describe("⭐⭐ LAW 6 — the runProgram auto-pick MIRRORS convert with the same flag (slice 2)", () => {
  it("⭐⭐ the EDICT auto-pick: flag off gives up the Elves; flag on gives up a bear", () => {
    const s = board();
    const pc = { controller: "user", candidates: [{ id: "ELF" }, { id: "B1" }] };
    const legacy = autoPickSacrificeCandidate(s, pc);
    const evald = autoPickSacrificeCandidate({ ...s, usePolicyEval: true }, pc);
    const row = { legacy, evald };
    console.log("  WITNESS edictAutoPick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ legacy: "ELF", evald: "B1" }); // the mirror converts; the flag-off side is the proven old pick
  });

  it("⭐⭐ the DISCARD auto-pick: flag off bins the Elves card; flag on bins the vanilla", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const hand = [{ ...ELVES, id: "h-elf" }, { ...BEAR("HB"), id: "h-bear" }];
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, hand } } };
    const pc = { controller: "user", candidates: [{ id: "h-elf" }, { id: "h-bear" }] };
    expect(autoPickDiscardCandidate(s, pc)).toBe("h-elf");                              // legacy: lowest MV
    expect(autoPickDiscardCandidate({ ...s, usePolicyEval: true }, pc)).toBe("h-bear"); // evaluator: keep the ramp
  });
});

describe("⭐⭐ LAW 6 — the trigger-target chooser converts (slice 3)", () => {
  // A removal-shaped trigger ("destroy target creature") facing TWO enemy creatures: a 1/1 token and a
  // big value engine. The legacy chooser takes the FIRST correct-side candidate (enumeration order);
  // the evaluator aims at the bigger threat. The side FILTER is identical either way — an OWN creature
  // candidate is refused on both sides of the flag (the safety half stays untouched).
  const setup = () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const small = createPermanent({ id: "SM", controller: "ai", summoningSick: false,
      card: { id: "c-SM", name: "Small Token", type: "Creature — Soldier", power: "1", toughness: "1", oracle: "", token: true } });
    const big = createPermanent({ id: "BIG", controller: "ai", summoningSick: false,
      card: { id: "c-BIG", name: "Big Engine", type: "Creature — Dragon", mana: "{4}{R}{R}", cmc: 6, power: "6", toughness: "6", oracle: "" } });
    const s = { ...g, players: { ...g.players, ai: { ...g.players.ai, battlefield: [small, big] } } };
    const program = parseEffectClause("destroy target creature", "Instant", { hasX: false });
    const candidates = [
      { targets: [{ type: "creature", id: "SM", controller: "ai", atomIndex: 0 }] },
      { targets: [{ type: "creature", id: "BIG", controller: "ai", atomIndex: 0 }] },
    ];
    return { s, program, candidates };
  };

  it("⛔ SEEN-TO-FAIL control: flag OFF picks the FIRST correct-side candidate (the small token)", () => {
    const { s, program, candidates } = setup();
    const pick = chooseTriggerTargets(candidates, { state: s, trigger: { controller: "user" }, program });
    expect(pick?.targets?.[0]?.id).toBe("SM"); // enumeration order, threat-blind — the wrong pick
  });

  it("⭐⭐ flag ON: the evaluator aims the removal at the BIG threat", () => {
    const { s, program, candidates } = setup();
    const pick = chooseTriggerTargets(candidates, { state: { ...s, usePolicyEval: true }, trigger: { controller: "user" }, program });
    const row = { picked: pick?.targets?.[0]?.id };
    console.log("  WITNESS triggerTargetEval", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ picked: "BIG" });
  });

  it("the side FILTER is untouched by the flag: an own-creature candidate is refused on BOTH sides", () => {
    const { s, program } = setup();
    const own = createPermanent({ id: "OWN", controller: "user", summoningSick: false,
      card: { id: "c-OWN", name: "My Guy", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [own] } } };
    const onlyOwn = [{ targets: [{ type: "creature", id: "OWN", controller: "user", atomIndex: 0 }] }];
    const offPick = chooseTriggerTargets(onlyOwn, { state: s2, trigger: { controller: "user" }, program });
    const onPick = chooseTriggerTargets(onlyOwn, { state: { ...s2, usePolicyEval: true }, trigger: { controller: "user" }, program });
    expect(String(offPick)).toBe(String(onPick)); // both NO_SAFE_TARGET — never friendly fire, flag or no flag
    expect(offPick?.targets).toBeUndefined();
  });
});

describe("⭐⭐ LAW 6 — the MAY decision converts (slice 4): take iff taking scores ≥ declining", () => {
  // Two real optional programs paused at their α2 pendingChoice: a HARMFUL may ("you may sacrifice a
  // permanent" — taking gives up your own board) and a BENEFICIAL one ("you may draw a card").
  // The legacy autopilot ALWAYS takes; the evaluator declines the harmful one and takes the good one.
  const pausedOn = (clause, extra = {}) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user,
      battlefield: [perm("ELF", ELVES)],
      library: [{ id: "lib1", name: "Top", type: "Instant", oracle: "" }], ...extra } } };
    const prog = parseEffectClause(clause, "Instant", { hasX: false });
    const s = runEffectProgram(s0, { source: { name: "Probe" }, payload: { params: { program: prog, controller: "user", targets: [] } } });
    expect(s.pendingChoice?.kind).toBe("optional-effect"); // the α2 pause is real, not assumed
    return s;
  };

  it("⛔ SEEN-TO-FAIL control: flag OFF always takes — even the self-sacrifice may", () => {
    const s = pausedOn("you may sacrifice a permanent");
    expect(optionalAutoTakeValue(s, s.pendingChoice)).toBe(true); // the legacy wrong pick, proven
  });

  it("⭐⭐ flag ON: declines the self-sacrifice, still takes the draw", () => {
    const sac = pausedOn("you may sacrifice a permanent");
    const draw = pausedOn("you may draw a card");
    const row = {
      sac: optionalAutoTakeValue({ ...sac, usePolicyEval: true }, sac.pendingChoice),
      draw: optionalAutoTakeValue({ ...draw, usePolicyEval: true }, draw.pendingChoice),
    };
    console.log("  WITNESS mayDecision", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sac: false, draw: true });
  });
});

describe("⛔ SLICE 5 WITHDRAWN — the cast-ordering adjustment was FALSIFIED and removed (2026-08-15)", () => {
  // The gate diagnostic (eval-gate --diagnose, 100 seeds): 62/64 divergent games forked on a
  // cast-spell decision, and the evaluator seat won 18 vs 23 there — value-first within-tier cast
  // ordering LOSES. The adjustment is withdrawn; the threading seam remains for a data-backed
  // replacement. This pin holds the withdrawal: the flag must NOT change cast scores until a new
  // policy passes the gate — a re-introduced adjustment that forgets to re-gate fails HERE first.
  const A_ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, power: "1", toughness: "1", oracle: "{T}: Add {G}." };
  const A_DRAW = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, oracle: "Draw two cards." };

  it("⭐⭐ flag ON and OFF produce IDENTICAL cast scores (the withdrawal is total)", () => {
    const sOn = { usePolicyEval: ["ai1"] };
    const rows = [
      [__scoreCastActionForTests({ cmc: 1 }, A_ELVES, "midrange", null, {}, "ai1"),
       __scoreCastActionForTests({ cmc: 1 }, A_ELVES, "midrange", null, sOn, "ai1")],
      [__scoreCastActionForTests({ cmc: 3 }, A_DRAW, "midrange", null, {}, "ai1"),
       __scoreCastActionForTests({ cmc: 3 }, A_DRAW, "midrange", null, sOn, "ai1")],
    ];
    console.log("  WITNESS castOrderWithdrawn", JSON.stringify(rows)); // vitest 4 needs --disable-console-intercept
    for (const [off, on] of rows) expect(on).toBe(off);
    expect(rows[0][0]).toBe(0); // and the scores ARE the legacy integer tiers
    expect(rows[1][0]).toBe(1);
  });
});
