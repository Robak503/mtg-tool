/**
 * lossMiner.test.js — the Reflecting Pool dossier miner. Fixture headers exercise the honest gating:
 * too-few-losses silence, null-flag conservatism, the finishRank-2 attribution guard on cause-of-death,
 * the LIFT gate (a pattern as common in wins as losses is dropped) + lift ranking — and the R1 win side
 * (the same lift machine, sign flipped) + the dossier facts row.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { mineDeckLosses, mineDeckHistory, mineDeckLossesFromStore, readAllGrindHeaders, _internals } from "./lossMiner.js";
import { appendGame } from "./gameLogStore.js";

const DECKS4 = [
  { seat: "user", name: "Rival A" },
  { seat: "ai1", id: "koma", name: "Koma" },
  { seat: "ai2", name: "Rival B" },
  { seat: "ai3", name: "Rival C" },
];
const KOMA = { id: "koma", name: "Koma" };

// A Koma LOSS header (ai1 lost; a rival won). Override any state field. `death` = a Tier-2 per-seat record.
function loss({ screw = false, flood = false, cmdrOnline = 4, ownTurns = 6, finishRank = 3, elimTurn = 10, winCondition = "combat", finalHandSize = 7, death = null } = {}) {
  return {
    result: "ai-wins", winnerSeat: "user", decks: DECKS4, winCondition,
    seatStats: { ai1: {
      finishRank, eliminatedAtTurn: elimTurn,
      manaHealth: { screw, flood, commanderOnlineTurn: cmdrOnline, ownTurns },
      mull: { ships: 7 - finalHandSize, finalHandSize, bottomedCount: 7 - finalHandSize },
      ...(death ? { death } : {}),
    } },
  };
}
// A Koma WIN header (ai1 won). Override any state field (mirrors loss(), for building win baselines).
function win({ cmdrOnline = 3, ownTurns = 9, finalHandSize = 7, screw = false, flood = false, winCondition = "combat", turns = null } = {}) {
  return { result: "ai-wins", winnerSeat: "ai1", decks: DECKS4, winCondition, turns,
    seatStats: { ai1: {
      finishRank: 1, eliminatedAtTurn: null,
      manaHealth: { screw, flood, commanderOnlineTurn: cmdrOnline, ownTurns },
      mull: { ships: 7 - finalHandSize, finalHandSize, bottomedCount: 7 - finalHandSize },
    } } };
}
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("mineDeckLosses — honest loss-pattern mining", () => {
  it("stays silent under the min-losses floor (too few to characterize)", () => {
    const r = mineDeckLosses(rep(5, () => loss({ screw: true })), KOMA);
    expect(r.games).toBe(5);
    expect(r.losses).toBe(5);
    expect(r.patterns).toEqual([]);
    expect(r.note).toMatch(/Only 5 recorded losses/);
  });

  it("surfaces a dominant pattern with its real loss-share once past the floor", () => {
    // 20 losses: 12 mana-screw, rest clean. No wins → the lift gate is waived (share-only fallback).
    const headers = [...rep(12, () => loss({ screw: true })), ...rep(8, () => loss({ screw: false }))];
    const r = mineDeckLosses(headers, KOMA);
    expect(r.losses).toBe(20);
    const screw = r.patterns.find((p) => p.key === "mana-screw");
    expect(screw).toBeTruthy();
    expect(screw.count).toBe(12);
    expect(screw.lossShare).toBeCloseTo(0.6, 5);
    expect(screw.winShare).toBeNull();   // no win baseline
    expect(screw.lift).toBeNull();
  });

  it("excludes wins and games the deck never played in", () => {
    const other = { result: "ai-wins", winnerSeat: "ai2", decks: [{ seat: "user", name: "X" }, { seat: "ai1", name: "NotKoma" }], winCondition: "combat", seatStats: {} };
    const headers = [...rep(10, () => loss({ screw: true })), ...rep(4, () => win()), other, other];
    const r = mineDeckLosses(headers, KOMA);
    expect(r.games).toBe(14);      // 10 losses + 4 wins; the two non-Koma games excluded
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(10);
    expect(r.winRate).toBeCloseTo(4 / 14, 5);
  });

  it("never counts a null flag as the pattern (conservative — 'couldn't tell' != 'happened')", () => {
    // 12 losses where screw is null (game ended before turn 5) — mana-screw must NOT surface.
    const r = mineDeckLosses(rep(12, () => loss({ screw: null })), KOMA);
    expect(r.patterns.find((p) => p.key === "mana-screw")).toBeUndefined();
  });

  it("attributes commander-damage death only at finishRank 2 (the last elimination the header can name)", () => {
    // 6 cmdr-damage games where Koma died FIRST (rank 4) — not attributable; 5 where Koma died LAST (rank 2) — attributable.
    const headers = [
      ...rep(6, () => loss({ winCondition: "commander-damage", finishRank: 4, elimTurn: 6 })),
      ...rep(5, () => loss({ winCondition: "commander-damage", finishRank: 2, elimTurn: 12 })),
      ...rep(4, () => loss({ winCondition: "combat", finishRank: 3 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const cd = r.patterns.find((p) => p.key === "killed-commander-damage");
    expect(cd).toBeTruthy();
    expect(cd.count).toBe(5); // only the rank-2 deaths, never the rank-4 ones
    expect(cd.lossShare).toBeCloseTo(5 / 15, 5);
  });

  it("attributes cause of death only to the last-eliminated seat — a finishRank-2 SURVIVOR never counts", () => {
    // 20 losses: 6 truly beaten in combat (died last, rank 2), 6 poisoned out (died last, rank 2),
    // 8 finishRank-2 SURVIVORS of someone else's combat win (eliminatedAtTurn null — never died).
    const headers = [
      ...rep(6, () => loss({ winCondition: "combat", finishRank: 2, elimTurn: 12 })),
      ...rep(6, () => loss({ winCondition: "poison", finishRank: 2, elimTurn: 14 })),
      ...rep(8, () => loss({ winCondition: "combat", finishRank: 2, elimTurn: null })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const combat = r.patterns.find((p) => p.key === "killed-combat");
    const poison = r.patterns.find((p) => p.key === "killed-poison");
    expect(combat.count).toBe(6);            // the 8 survivors are NOT counted — they never died
    expect(combat.lossShare).toBeCloseTo(6 / 20, 5);
    expect(poison.count).toBe(6);
  });

  it("uses per-seat death.cause (Tier-2) for ANY rank — a deck that died 3rd/4th still gets its cause", () => {
    // 20 losses: 12 died 4th to POISON carrying a per-seat death record (winCondition says 'combat' — the
    // LAST elimination — so the old winCondition@rank-2 gate would miss them entirely); 8 clean rank-2.
    const headers = [
      ...rep(12, () => loss({ finishRank: 4, elimTurn: 8, winCondition: "combat", death: { cause: "poison", byCombat: null, landsInHand: 1 } })),
      ...rep(8, () => loss({ finishRank: 2, elimTurn: null })), // survived to 2nd (out-raced) — no death, no cause
    ];
    const r = mineDeckLosses(headers, KOMA);
    const poison = r.patterns.find((p) => p.key === "killed-poison");
    expect(poison).toBeTruthy();
    expect(poison.count).toBe(12); // caught by death.cause despite rank 4 + a 'combat' winCondition
    expect(r.patterns.find((p) => p.key === "killed-combat")).toBeUndefined(); // winCondition is NOT used when death.cause exists
  });

  it("merges non-combat lethal (burn + drain/damage) into one 'burned or drained' cause", () => {
    const headers = [
      ...rep(5, () => loss({ winCondition: "burn", finishRank: 2, elimTurn: 10 })),
      ...rep(5, () => loss({ winCondition: "damage", finishRank: 2, elimTurn: 11 })),
      ...rep(6, () => loss({ winCondition: "combat", finishRank: 3 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const bd = r.patterns.find((p) => p.key === "killed-burn-drain");
    expect(bd.count).toBe(10); // burn + damage folded together
  });

  it("gates + ranks on LIFT — an endemic pattern (as common in wins) is dropped; a discriminative one is kept", () => {
    // The real-data trap: mulligan-tax fires in ~90% of losses AND ~90% of wins (the sim just mulls a lot),
    // while 'commander never came down' is 50% of losses but 5% of wins. Only the second is a reason you lost.
    const L = [
      ...rep(8, () => loss({ cmdrOnline: null, ownTurns: 5, finalHandSize: 5 })), // no-commander + mull
      ...rep(2, () => loss({ cmdrOnline: null, ownTurns: 5, finalHandSize: 7 })), // no-commander, full hand
      ...rep(10, () => loss({ cmdrOnline: 4, ownTurns: 6, finalHandSize: 5 })),   // mull only
    ]; // losses: no-commander 10/20 = .50 · mulligan-tax 18/20 = .90
    const W = [
      ...rep(1, () => win({ cmdrOnline: null, finalHandSize: 5 })),
      ...rep(17, () => win({ cmdrOnline: 3, finalHandSize: 5 })),
      ...rep(2, () => win({ cmdrOnline: 3, finalHandSize: 7 })),
    ]; // wins: no-commander 1/20 = .05 · mulligan-tax 18/20 = .90
    const r = mineDeckLosses([...L, ...W], KOMA);
    const keys = r.patterns.map((p) => p.key);
    expect(keys).toContain("no-commander");
    expect(keys).not.toContain("mulligan-tax");     // .90 vs .90 → lift 0 → filtered, despite a huge loss-share
    const nc = r.patterns.find((p) => p.key === "no-commander");
    expect(nc.lossShare).toBeCloseTo(0.5, 5);
    expect(nc.winShare).toBeCloseTo(0.05, 5);
    expect(nc.lift).toBeCloseTo(0.45, 5);
  });

  it("drops patterns below the concrete-count gate and ranks the survivors (no baseline → by loss-share)", () => {
    // 20 losses, no wins: 10 died-fast (0.50), 4 flood (0.20), 2 screw (count 2 < 3 → dropped by the count gate).
    const headers = [
      ...rep(10, () => loss({ elimTurn: 6 })),
      ...rep(4, () => loss({ elimTurn: 12, flood: true })),
      ...rep(2, () => loss({ elimTurn: 12, screw: true })),
      ...rep(4, () => loss({ elimTurn: 12 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const keys = r.patterns.map((p) => p.key);
    expect(keys[0]).toBe("died-fast");           // highest loss-share leads
    expect(keys).toContain("flood");
    expect(keys).not.toContain("mana-screw");    // count 2 < MIN_PATTERN_COUNT (3)
    // ranked descending by lift ?? lossShare (no baseline here → lossShare)
    for (let i = 1; i < r.patterns.length; i++) expect(r.patterns[i - 1].lossShare).toBeGreaterThanOrEqual(r.patterns[i].lossShare);
  });

  it("returns null when the deck never appears; 0 losses when it appears but only won; reports avgLossTurn", () => {
    expect(mineDeckLosses([win(), win()], { id: "nobody" })).toBeNull(); // never in the pod → null
    expect(mineDeckLosses([win(), win()], KOMA).losses).toBe(0);          // in the pod but only won → 0 losses
    expect(mineDeckLosses([], KOMA)).toBeNull();
    const r = mineDeckLosses(rep(10, () => loss({ elimTurn: 9 })), KOMA);
    expect(r.avgLossTurn).toBeCloseTo(9, 5);
  });
});

describe("mineDeckLosses — the R1 win side ('why you win') + the dossier facts row", () => {
  it("surfaces a winning line by lift and drops an endemic one (kept-seven equal on both sides)", () => {
    // Wins: commander online by 3 in 16/20; kept-seven in 20/20. Losses: commander early in 2/20; kept-seven 20/20.
    const W = [...rep(16, () => win({ cmdrOnline: 3 })), ...rep(4, () => win({ cmdrOnline: null }))];
    const L = [...rep(2, () => loss({ cmdrOnline: 3 })), ...rep(18, () => loss({ cmdrOnline: 6 }))];
    const r = mineDeckLosses([...W, ...L], KOMA);
    const keys = r.winPatterns.map((p) => p.key);
    expect(keys).toContain("commander-early");
    expect(keys).not.toContain("kept-seven"); // 100% of wins AND 100% of losses → lift 0 → dropped
    const ce = r.winPatterns.find((p) => p.key === "commander-early");
    expect(ce.winShare).toBeCloseTo(16 / 20, 5);
    expect(ce.lossShare).toBeCloseTo(2 / 20, 5);
    expect(ce.lift).toBeCloseTo(0.7, 5);
    expect(r.winNote).toMatch(/more common in this deck's wins/);
  });

  it("won-by-X reads the winning game's finish (structurally absent from losses) and closed-fast reads turns", () => {
    const W = [
      ...rep(9, () => win({ winCondition: "commander-damage", turns: 20 })), // fast cmdr-damage closes
      ...rep(3, () => win({ winCondition: "poison", turns: 40 })),
    ];
    const L = rep(12, () => loss({}));
    const r = mineDeckLosses([...W, ...L], KOMA);
    const wc = r.winPatterns.find((p) => p.key === "won-commander-damage");
    expect(wc).toBeTruthy();
    expect(wc.winShare).toBeCloseTo(9 / 12, 5);
    expect(wc.lossShare).toBe(0);              // a loser is never finishRank 1
    const cf = r.winPatterns.find((p) => p.key === "closed-fast");
    expect(cf.count).toBe(9);                  // only the turn-20 games clear FAST_WIN_TURN
    expect(r.winPatterns.find((p) => p.key === "won-poison")).toBeTruthy(); // 3/12 = .25 ≥ share floor, count 3
  });

  it("stays silent on the win side under the min-wins floor (win floor independent of the loss floor)", () => {
    const r = mineDeckLosses([...rep(4, () => win()), ...rep(15, () => loss({ screw: true }))], KOMA);
    expect(r.winPatterns).toEqual([]);
    expect(r.winNote).toMatch(/Only 4 recorded wins/);
    expect(r.patterns.length).toBeGreaterThan(0); // the loss side still mines
  });

  it("computes the facts row honestly: avg turns, win-con mix, commander-online rate over stateful games only", () => {
    const W = [
      ...rep(6, () => win({ winCondition: "combat", turns: 30, cmdrOnline: 3 })),
      ...rep(2, () => win({ winCondition: "poison", turns: 50, cmdrOnline: null })),
    ];
    const L = rep(4, () => loss({ elimTurn: 20, cmdrOnline: 4 })); // loss() has no turns → excluded from turn averages
    const r = mineDeckLosses([...W, ...L], KOMA);
    expect(r.facts.avgWinTurn).toBeCloseTo((6 * 30 + 2 * 50) / 8, 5);
    expect(r.facts.avgGameTurns).toBeCloseTo((6 * 30 + 2 * 50) / 8, 5); // losses carry no turns here
    expect(r.facts.winConMix[0]).toMatchObject({ key: "combat", count: 6 });
    expect(r.facts.winConMix[0].share).toBeCloseTo(0.75, 5);
    expect(r.facts.winConMix[1]).toMatchObject({ key: "poison", count: 2 });
    expect(r.facts.commanderOnline.n).toBe(12);                 // every fixture game carries seatStats
    expect(r.facts.commanderOnline.rate).toBeCloseTo(10 / 12, 5); // 2 wins never landed the commander
    expect(r.facts.commanderOnline.avgTurn).toBeCloseTo((6 * 3 + 4 * 4) / 10, 5);
  });

  it("nulls each fact below its floor instead of averaging noise", () => {
    // 2 games total: under MIN_FACT_N for every fact.
    const r = mineDeckLosses([win({ turns: 20 }), loss({})], KOMA);
    expect(r.facts.avgWinTurn).toBeNull();
    expect(r.facts.avgGameTurns).toBeNull();
    expect(r.facts.winConMix).toBeNull();
    expect(r.facts.commanderOnline).toBeNull();
  });
});

describe("mineDeckHistory — the R4 living history (era slicing, registry diffs, gated deltas)", () => {
  // Stamp a version + store order onto a fixture header (deckV rides the Koma decks[] entry).
  const stamp = (h, deckV, index) => ({
    ...h, index,
    decks: h.decks.map((d) => (d.id === "koma" ? { ...d, deckV } : d)),
  });
  const era = (deckV, startIndex, nWin, nLoss, opts = {}) => [
    ...rep(nWin, (i) => stamp(win(opts.win || {}), deckV, startIndex + i)),
    ...rep(nLoss, (i) => stamp(loss(opts.loss || {}), deckV, startIndex + nWin + i)),
  ];
  const REG = {
    koma: {
      vA: { deckName: "Koma", firstSeen: "2026-07-15T00:00:00Z", cards: { "Noxious Newt": 1, Forest: 30 }, commanders: ["Koma, Cosmos Serpent"], companion: null },
      vB: { deckName: "Koma", firstSeen: "2026-07-15T01:00:00Z", cards: { "Last March of the Ents": 1, Forest: 30 }, commanders: ["Koma, Cosmos Serpent"], companion: null },
    },
  };

  it("returns null with fewer than two eras (no history to tell)", () => {
    expect(mineDeckHistory(era("vA", 0, 5, 5), KOMA, REG)).toBeNull();
    expect(mineDeckHistory([], KOMA, REG)).toBeNull();
    expect(mineDeckHistory(rep(6, () => loss({})), KOMA, REG)).toBeNull(); // all unstamped = ONE era
  });

  it("slices eras chronologically by store order, labels the unstamped era honestly, tags versions 1..N", () => {
    const headers = [...rep(10, () => loss({})).map((h, i) => ({ ...h, index: i })), ...era("vA", 100, 5, 5), ...era("vB", 300, 5, 5)];
    const r = mineDeckHistory(headers, KOMA, REG);
    expect(r.eras.map((e) => e.label)).toEqual(["Before version tracking", "Version 1", "Version 2"]);
    expect(r.eras.map((e) => e.games)).toEqual([10, 10, 10]);
    expect(r.eras[0].deckV).toBeNull();
  });

  it("names the card diff between REGISTRY-backed eras and never guesses one for the pre-tracking era", () => {
    const headers = [...rep(6, () => loss({})).map((h, i) => ({ ...h, index: i })), ...era("vA", 100, 3, 3), ...era("vB", 300, 3, 3)];
    const r = mineDeckHistory(headers, KOMA, REG);
    expect(r.eras[1].diff).toBeNull(); // previous era (pre-tracking) has no snapshot — unnameable, never fabricated
    expect(r.eras[2].diff).toEqual({
      added: [{ name: "Last March of the Ents", count: 1 }],
      removed: [{ name: "Noxious Newt", count: 1 }],
    });
  });

  it("gates the win-rate delta on BOTH eras carrying MIN_DELTA_GAMES", () => {
    const big = _internals.MIN_DELTA_GAMES; // 100
    const thin = mineDeckHistory([...era("vA", 0, 5, 5), ...era("vB", 1000, 8, 2)], KOMA, REG);
    expect(thin.eras[1].winRateDelta).toBeNull(); // 10-game eras — too thin to claim a move
    const fat = mineDeckHistory([...era("vA", 0, big / 2, big / 2), ...era("vB", 10000, (big * 3) / 4, big / 4)], KOMA, REG);
    expect(fat.eras[1].winRateDelta).toBeCloseTo(0.25, 5); // 50% → 75%
  });

  it("surfaces a gated pattern shift ('no-commander losses dropped') and stays quiet below the floors", () => {
    const n = _internals.MIN_SIDE_N + 10; // 40 losses per era
    const A = [
      ...rep(20, (i) => stamp(loss({ cmdrOnline: null, ownTurns: 6 }), "vA", i)),        // 50% no-commander
      ...rep(20, (i) => stamp(loss({}), "vA", 20 + i)),
      ...rep(n, (i) => stamp(win({}), "vA", 60 + i)),
    ];
    const B = [
      ...rep(8, (i) => stamp(loss({ cmdrOnline: null, ownTurns: 6 }), "vB", 1000 + i)),  // 20% no-commander
      ...rep(32, (i) => stamp(loss({}), "vB", 1010 + i)),
      ...rep(n, (i) => stamp(win({}), "vB", 1100 + i)),
    ];
    const r = mineDeckHistory([...A, ...B], KOMA, REG);
    const shift = r.eras[1].patternShifts.find((s) => s.key === "no-commander");
    expect(shift).toBeTruthy();
    expect(shift.side).toBe("loss");
    expect(shift.before).toBeCloseTo(0.5, 5);
    expect(shift.after).toBeCloseTo(0.2, 5);
    expect(shift.delta).toBeCloseTo(-0.3, 5);
    // sub-floor eras stay silent
    const tiny = mineDeckHistory([...era("vA", 0, 3, 3), ...era("vB", 100, 3, 3)], KOMA, REG);
    expect(tiny.eras[1].patternShifts).toEqual([]);
  });

  it("works without a registry — history still slices, diffs are simply unnameable", () => {
    const r = mineDeckHistory([...era("vA", 0, 3, 3), ...era("vB", 100, 3, 3)], KOMA, null);
    expect(r.eras).toHaveLength(2);
    expect(r.eras[1].diff).toBeNull();
  });

  it("NEVER claims a delta against the pre-tracking era (mixed engines/pilots/stamps — confounded)", () => {
    const big = _internals.MIN_DELTA_GAMES * 2;
    const pre = rep(big, (i) => ({ ...loss({}), index: i }));            // huge unstamped era, 0% win
    const cur = era("vA", 10000, big / 2, big / 2);                      // huge stamped era, 50% win
    const r = mineDeckHistory([...pre, ...cur], KOMA, REG);
    expect(r.eras[1].winRateDelta).toBeNull();                           // a 50pt "move" — still not claimable
    expect(r.eras[1].patternShifts).toEqual([]);
  });

  it("silences a shift inside sampling noise even past the flat floor (two-proportion 2σ gate)", () => {
    // 36% → 44% no-commander on 50-loss sides: |Δ|=8pt ≥ MIN_SHIFT but 2σ≈19pt → noise, stay quiet.
    const A = [...rep(18, (i) => stamp(loss({ cmdrOnline: null, ownTurns: 6 }), "vA", i)), ...rep(32, (i) => stamp(loss({}), "vA", 20 + i))];
    const B = [...rep(22, (i) => stamp(loss({ cmdrOnline: null, ownTurns: 6 }), "vB", 1000 + i)), ...rep(28, (i) => stamp(loss({}), "vB", 1030 + i))];
    const r = mineDeckHistory([...A, ...B], KOMA, REG);
    expect(r.eras[1].patternShifts.find((s) => s.key === "no-commander")).toBeUndefined();
  });
});

describe("lossMiner reader — over a REAL on-disk grind store (chdir tmp, appendGame convention)", () => {
  let tmpDir, cwd;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lossminer-")); cwd = process.cwd(); process.chdir(tmpDir); });
  afterEach(async () => { process.chdir(cwd); await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  it("reads forever-headers across shards and mines a deck's losses end-to-end", async () => {
    const lossGame = (i) => ({
      header: {
        seed: i, engineVersion: "0.140.0", result: "ai-wins", winnerSeat: "user", turns: 11, mode: "commander",
        decks: [{ seat: "user", name: "A" }, { seat: "ai1", id: "koma", name: "Koma" }, { seat: "ai2", name: "B" }, { seat: "ai3", name: "C" }],
        seatStats: { ai1: { finishRank: 3, eliminatedAtTurn: 10, manaHealth: { screw: true, flood: false, commanderOnlineTurn: null, ownTurns: 6 } } },
        winCondition: "combat",
      },
      rows: [{ turn: 1, seat: "ai1", action: { kind: "pass" } }],
    });
    for (let i = 0; i < 12; i++) await appendGame(lossGame(i));
    const headers = await readAllGrindHeaders();
    expect(headers).toHaveLength(12);              // forever-headers read back across the shard
    const r = await mineDeckLossesFromStore({ id: "koma", name: "Koma" });
    expect(r.losses).toBe(12);
    expect(r.patterns.find((p) => p.key === "mana-screw").count).toBe(12); // schema-3 seatStats survives the round-trip
  });
});
