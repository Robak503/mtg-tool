/**
 * abBench.test.js — the A/B card bench's paired run (Crucible dream feature, 2026-07-14).
 *
 * Runs a fixed pod BOTH ways on the same seeds (baseline + variant), tallies the target deck's paired
 * win/loss flips, and reports a win-rate delta with a 95% confidence band. Forest/Bears decks (fast,
 * deterministic) exercise the mechanics — reconciliation + the paired math — not deck balance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { startAbBench, abBenchStatus, requestAbBenchCancel, _resetAbBenchForTests } from "./abBench.js";

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
  });

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
