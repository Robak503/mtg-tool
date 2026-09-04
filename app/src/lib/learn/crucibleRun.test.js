/**
 * crucibleRun.test.js — the bounded Crucible pod runs REAL games to N, in-memory, and produces
 * an honest power ranking: per-deck placement (finish ranks), wins, live tiles, and a synopsis
 * stream. Uses synthetic Forest/Bears commander decks (deterministic, resolve by combat) so the
 * run mechanics — not deck balance — are what's under test.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startCrucibleRun,
  crucibleStatus,
  crucibleResults,
  requestCrucibleCancel,
  crucibleReportText,
  bankCrucibleRun,
  crucibleTrainingStatus,
  replayCrucibleGame,
  _resetCrucibleForTests,
} from "./crucibleRun.js";

function forest(i) { return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" }; }
function bear(i) { return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 }; }
function cmdr(name) { return { id: `cmd-${name}`, name: `General ${name}`, type: "Legendary Creature — Elf", oracle: "", mana: "{2}{G}{G}", cmc: 4, keywords: [], power: 3, toughness: 3 }; }
function deck(name) {
  const c = [];
  for (let i = 0; i < 40; i++) c.push(forest(`${name}-${i}`));
  for (let i = 0; i < 59; i++) c.push(bear(`${name}-${i}`));
  return { id: name, name, cards: c, commanders: [cmdr(name)] };
}
const POD = () => [deck("Alpha"), deck("Bravo"), deck("Charlie"), deck("Delta")];

async function awaitDone(maxMs = 40000) {
  const t0 = Date.now();
  while (crucibleStatus().running && Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
  return crucibleStatus();
}

afterEach(() => _resetCrucibleForTests());

describe("startCrucibleRun — bounded pod power-read", () => {
  it("plays EXACTLY N games and produces per-deck placement + wins that reconcile", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const started = startCrucibleRun({ decks: POD(), mode: "commander", target: 8, seed: 7 });
    expect(started.started).toBe(true);
    const status = await awaitDone();
    warn.mockRestore();
    log.mockRestore();

    // Ran to the target and stopped.
    expect(status.done).toBe(true);
    expect(status.running).toBe(false);
    expect(status.played).toBe(8);

    const res = crucibleResults();
    // All four decks appear, each played every game (fixed 4-deck pod).
    expect(res.standings).toHaveLength(4);
    for (const row of res.standings) expect(row.games).toBe(8);
    // Exactly one winner per DECISIVE game → total wins === decisive count (honest, no fabricated wins).
    const totalWins = res.standings.reduce((n, r) => n + r.wins, 0);
    expect(totalWins).toBe(res.decisive);
    // The pod-wide win-con mix sums to the decisive-game count (every win contributes exactly one tag).
    expect(Object.values(res.winConMix).reduce((a, b) => a + b, 0)).toBe(res.decisive);
    // Each deck's finish-rank counts never exceed its games (a stuck game yields no rank).
    for (const row of res.standings) {
      const finishTotal = row.finish.reduce((a, b) => a + b, 0);
      expect(finishTotal).toBeLessThanOrEqual(row.games);
    }
    // Podium is the top 4 sorted by BEST average finish (ascending).
    expect(res.podium).toHaveLength(4);
    for (let k = 1; k < res.podium.length; k++) {
      expect(res.podium[k - 1].avgFinish).toBeLessThanOrEqual(res.podium[k].avgFinish);
    }
    // Most-wins is called out separately and is a real deck.
    expect(res.mostWins).not.toBeNull();
    expect(res.standings.some((r) => r.name === res.mostWins.name)).toBe(true);
  });

  it("exposes live tiles + a capped synopsis stream", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startCrucibleRun({ decks: POD(), mode: "commander", target: 6, seed: 11 });
    const status = await awaitDone();
    warn.mockRestore();
    log.mockRestore();

    expect(status.tiles.turnsPerGame).toBeGreaterThan(0);
    expect(status.tiles.gamesPerMin).toBeGreaterThan(0);
    expect(status.tiles.cleanFinishPct).toBeGreaterThanOrEqual(0);
    expect(status.tiles.cleanFinishPct).toBeLessThanOrEqual(100);
    expect(status.recent.length).toBeGreaterThan(0);
    expect(status.recent.length).toBeLessThanOrEqual(12); // RECENT_CAP
    expect(status.recent[0]).toMatch(/won by|Draw|No result/);
  });

  it("refuses a second concurrent run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const first = startCrucibleRun({ decks: POD(), mode: "commander", target: 5, seed: 3 });
    const second = startCrucibleRun({ decks: POD(), mode: "commander", target: 5, seed: 3 });
    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.reason).toMatch(/already/);
    await awaitDone();
    warn.mockRestore();
    log.mockRestore();
  }, 90_000); // CI (2026-09-04): 24.9 s on a loaded 2-CPU runner against the 20 s default (run 33837232224, shard 2) — the wall is a hang detector, not a speed budget

  it("stops early on cancel (before target)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startCrucibleRun({ decks: POD(), mode: "commander", target: 100, seed: 9 });
    // Wait until at least one game has landed, then cancel.
    const t0 = Date.now();
    while (crucibleStatus().played < 1 && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 10));
    requestCrucibleCancel();
    const status = await awaitDone();
    warn.mockRestore();
    log.mockRestore();
    expect(status.running).toBe(false);
    expect(status.played).toBeLessThan(100);
    expect(status.played).toBeGreaterThanOrEqual(1);
  });

  it("refuses a pod with too few decks", () => {
    const res = startCrucibleRun({ decks: [deck("Solo"), deck("Duo")], mode: "commander", target: 5 });
    expect(res.started).toBe(false);
    expect(res.reason).toMatch(/need 4 decks/);
  });
});

describe("crucibleReportText + bank guard", () => {
  it("formats a results object into the report sections", () => {
    const txt = crucibleReportText(
      {
        mode: "commander", played: 100, decisive: 98, stuck: 2,
        standings: [{ name: "Ur-Dragon", winRate: 0.46, avgFinish: 1.9, finish: [46, 20, 18, 16], topWinCon: "damage" }],
        mostWins: { name: "Zaxara", wins: 52, winRate: 0.52 },
        highlights: [{ title: "The crown", detail: "Ur-Dragon topped the pod." }],
        breakages: [],
      },
      { pilotLabel: "Specialist" },
    );
    expect(txt).toContain("The Crucible · Pod Read");
    expect(txt).toContain("POWER RANKING");
    expect(txt).toContain("Ur-Dragon");
    expect(txt).toContain("Most wins: Zaxara");
    expect(txt).toContain("Specialist");
    expect(txt).toContain("The crown");
  });

  it("bankCrucibleRun refuses (no write) when nothing has been played", async () => {
    _resetCrucibleForTests();
    const res = await bankCrucibleRun();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/nothing to bank/);
  });

  it("training bank is FIRE-AND-FORGET — the report saves instantly, the replay finishes in the background", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startCrucibleRun({ decks: POD(), mode: "commander", target: 3, seed: 11 });
    await awaitDone();

    const res = await bankCrucibleRun({ trainingBank: true, pilotLabel: "Specialist" });
    expect(res.ok).toBe(true);
    expect(res.file).toBeTruthy();
    // The bank returned BEFORE the replay finished (non-blocking) — it's still running in the background.
    expect(res.training?.running).toBe(true);
    expect(res.training?.target).toBe(3);
    expect(crucibleTrainingStatus().running).toBe(true);

    // …and the background replay completes on its own, writing real trajectory rows.
    const t0 = Date.now();
    while (crucibleTrainingStatus().running && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 20));
    const done = crucibleTrainingStatus();
    warn.mockRestore();
    log.mockRestore();
    expect(done.running).toBe(false);
    expect(done.error).toBeNull();
    expect(done.rows).toBeGreaterThan(0);
    expect(done.file).toBeTruthy();
  });
});

describe("replayCrucibleGame — feature C: deterministic watch-it replay", () => {
  it("re-runs a recorded game byte-identical (winner/turns match the per-game row) with a full log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startCrucibleRun({ decks: POD(), mode: "commander", target: 3, seed: 11 });
    await awaitDone();
    warn.mockRestore();
    log.mockRestore();

    const rows = crucibleResults().perGame;
    expect(rows.length).toBeGreaterThan(0);
    // Every folded row carries its SEED index (the replay anchor; drifts past the array index on throws).
    for (const r of rows) expect(Number.isInteger(r.seedIndex)).toBe(true);

    const row = rows[rows.length - 1];
    const warn2 = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log2 = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await replayCrucibleGame(row.seedIndex);
    warn2.mockRestore();
    log2.mockRestore();
    expect(res.ok).toBe(true);
    expect(res.replayVerified).toBe(true); // same seed → the identical game, cross-checked, not assumed
    expect(res.game.winner).toBe(row.winner);
    expect(res.game.turns).toBe(row.turns);
    expect(res.game.seats).toHaveLength(4);
    // Pre-narrated play-by-play: per-turn groups of plain strings with the DECK names in them.
    expect(Array.isArray(res.game.playByPlay)).toBe(true);
    expect(res.game.playByPlay.length).toBeGreaterThan(0); // the scrubber has something to play
    const allLines = res.game.playByPlay.flatMap((g) => g.lines);
    expect(allLines.length).toBeGreaterThan(0);
    expect(allLines.some((l) => /Alpha|Bravo|Charlie|Delta/.test(l))).toBe(true); // seat ids humanized to deck names
    expect(allLines.some((l) => l.includes("?"))).toBe(false);                     // no un-narrated residue
  });

  it("refuses honestly: no run in memory, and an out-of-range game index", async () => {
    const none = await replayCrucibleGame(0);
    expect(none.ok).toBe(false);
    expect(none.error).toMatch(/No pod run in memory/);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startCrucibleRun({ decks: POD(), mode: "commander", target: 2, seed: 11 });
    await awaitDone();
    warn.mockRestore();
    log.mockRestore();
    const out = await replayCrucibleGame(99);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/No game #99/);
    const bad = await replayCrucibleGame(-1);
    expect(bad.ok).toBe(false);
  });
});
