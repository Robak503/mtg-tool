/**
 * abBench.test.js — the A/B card bench's paired run (Crucible dream feature, 2026-07-14).
 *
 * Runs a fixed pod BOTH ways on the same seeds (baseline + variant), tallies the target deck's paired
 * win/loss flips, and reports a win-rate delta with a 95% confidence band. Forest/Bears decks (fast,
 * deterministic) exercise the mechanics — reconciliation + the paired math — not deck balance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { startAbBench, abBenchStatus, requestAbBenchCancel, _resetAbBenchForTests, abBenchWhySentences } from "./abBench.js";

const forest = (i) => ({ id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
const bear = (i) => ({ id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 });
const cmdr = (n) => ({ id: `cmd-${n}`, name: `General ${n}`, type: "Legendary Creature — Elf", oracle: "", mana: "{2}{G}{G}", cmc: 4, keywords: [], power: 3, toughness: 3 });
function deck(name) {
  const c = [];
  for (let i = 0; i < 40; i++) c.push(forest(`${name}-${i}`));
  for (let i = 0; i < 59; i++) c.push(bear(`${name}-${i}`));
  return { id: name, name, cards: c, commanders: [cmdr(name)] };
}
async function awaitDone(maxMs = 40000) {
  const t0 = Date.now();
  while (abBenchStatus().running && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 15));
  return abBenchStatus();
}

afterEach(() => _resetAbBenchForTests());

describe("abBench — paired A/B run", () => {
  it("runs the pod both ways on the same seeds and produces a reconciled delta + confidence band", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = [deck("Alpha"), deck("Bravo"), deck("Charlie"), deck("Delta")];
    // Variant of Alpha: one Forest swapped to a Bear (a real shape change; abBench takes a pre-built variant).
    const variant = { ...decks[0], cards: decks[0].cards.map((c, idx) => (idx === 0 ? bear("swap-0") : c)) };
    const started = startAbBench({ decks, targetId: "Alpha", variantDeck: variant, swap: { removed: "Forest", added: "Grizzly Bears" }, games: 6, seed: 3 });
    expect(started.started).toBe(true);

    const s = await awaitDone();
    warn.mockRestore();
    log.mockRestore();

    expect(s.done).toBe(true);
    expect(s.played).toBe(6);
    expect(s.targetName).toBe("Alpha");
    // Tallies reconcile: target wins in [0..played] both ways.
    expect(s.baseWins).toBeGreaterThanOrEqual(0);
    expect(s.baseWins).toBeLessThanOrEqual(6);
    expect(s.varWins).toBeLessThanOrEqual(6);
    // delta == variant win rate − baseline win rate; the CI brackets it.
    expect(s.delta).toBeCloseTo(s.varWinRate - s.baseWinRate, 10);
    expect(s.ci[0]).toBeLessThanOrEqual(s.delta);
    expect(s.ci[1]).toBeGreaterThanOrEqual(s.delta);
    // Flips can't exceed the games played.
    expect(s.flipToWin + s.flipToLoss).toBeLessThanOrEqual(6);
    // WHY accumulator ran over REAL games without throwing: a reduced `why` object + a string[] of sentences.
    expect(s.why).toBeTruthy();
    expect(Array.isArray(s.whySentences)).toBe(true);
    if (s.why.avgTurns) { expect(Number.isFinite(s.why.avgTurns.base)).toBe(true); expect(Number.isFinite(s.why.avgTurns.var)).toBe(true); }
    // 60s WALL, measured not guessed (2026-08-15): this 12-game paired run is a REAL ~7s workload in
    // isolation (7.06s pre-/7.11s post-Bloodghast — the suspect slice measured innocent via a baseline
    // swap), and full-suite worker contention multiplies it 2.5-3× — three loaded runs tripped the old
    // 20s default at ~5-10% aggregate load variance while the isolated number never moved. The wall is a
    // HANG detector (the vault law), not a speed budget: a genuine hang still dies here, 3× over the
    // worst honest loaded run.
  }, 60_000);

  it("refuses a second concurrent run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = [deck("A"), deck("B"), deck("C"), deck("D")];
    startAbBench({ decks, targetId: "A", variantDeck: { ...decks[0] }, games: 100, seed: 1 });
    const second = startAbBench({ decks, targetId: "A", variantDeck: { ...decks[0] }, games: 100, seed: 1 });
    expect(second.started).toBe(false);
    requestAbBenchCancel();
    await awaitDone();
    warn.mockRestore();
    log.mockRestore();
  });

  it("rejects a pod that isn't exactly 4 decks", () => {
    const res = startAbBench({ decks: [deck("A"), deck("B")], targetId: "A", variantDeck: deck("A"), games: 5 });
    expect(res.started).toBe(false);
    expect(res.reason).toMatch(/exactly 4/);
  });
});

describe("abBenchWhySentences — the plain-English 'why'", () => {
  it("names the real shifts: mana screw, commander tempo, speed, and the flipped-win closers", () => {
    const status = {
      targetName: "Koma", flipToWin: 41, delta: 0.07,
      why: {
        screwRate: { base: 0.22, var: 0.14, n: 200 },
        floodRate: null,
        cmdrOnlineRate: { base: 0.61, var: 0.68, n: 200 },
        avgTurns: { base: 9.4, var: 8.0, n: 200 },
        winMix: { combat: 28, "commander-damage": 13 },
      },
    };
    const s = abBenchWhySentences(status);
    expect(s.some((x) => /mana screw less often — 14% of games vs 22%/.test(x))).toBe(true);
    expect(s.some((x) => /commander came online more reliably — 68% of games vs 61%/.test(x))).toBe(true);
    expect(s.some((x) => /1\.4 turns shorter/.test(x))).toBe(true);
    expect(s.some((x) => /flipped to wins closed on combat \(28\), commander damage \(13\)/.test(x))).toBe(true);
  });

  it("stays silent on thin samples and noise-sized moves (CREED — never narrate what isn't real)", () => {
    const status = {
      targetName: "X", flipToWin: 0, delta: 0.01,
      why: {
        screwRate: { base: 0.20, var: 0.18, n: 8 },     // n < 30 → suppressed
        floodRate: { base: 0.10, var: 0.09, n: 200 },   // 1-point move < 5 → suppressed
        cmdrOnlineRate: null,
        avgTurns: { base: 9.0, var: 8.9, n: 200 },       // 0.1-turn move < 0.5 → suppressed
        winMix: {},                                      // no games flipped to a win
      },
    };
    expect(abBenchWhySentences(status)).toEqual([]);
  });

  it("suppresses a 5-point rate move that's only 2 games (n≥30 but <3 games differed — the count-shift gate)", () => {
    // The live-run bug in miniature: a full 5-point drop on a real-ish sample, but only 2 games actually
    // differed (20/40 → 18/40). A percentage that twitched is not a cause — the count-shift gate kills it.
    const status = {
      targetName: "Koma", flipToWin: 0, delta: 0,
      why: { cmdrOnlineRate: { base: 0.50, var: 0.45, n: 40 }, screwRate: null, floodRate: null, avgTurns: null, winMix: {} },
    };
    expect(abBenchWhySentences(status)).toEqual([]);
  });

  it("returns nothing when there's no why data at all", () => {
    expect(abBenchWhySentences({})).toEqual([]);
    expect(abBenchWhySentences({ why: null })).toEqual([]);
    expect(abBenchWhySentences(null)).toEqual([]);
  });
});
