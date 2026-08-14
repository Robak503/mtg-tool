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
