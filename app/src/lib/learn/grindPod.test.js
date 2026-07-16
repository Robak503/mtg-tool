/**
 * grindPod.test.js — the R3 deck-version stamp (deckVersionHash) + the shared header builder's decks[]
 * assembly. The hash is the living-history foundation: EXACT to the card (every copy, basics included,
 * commanders + companion, by name), so ANY list change registers — while seat position, enrichment
 * noise, and card ORDER don't. buildGrindHeader stamps it per seat so both grind write paths (grindLoop
 * + the pool worker) carry it via the one drift-guarded builder.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGrindHeader, deckVersionHash, deckVersionEntry, formPod, gameSeedAt } from "./grindPod.js";
import { loadDeckVersions, upsertDeckVersions } from "./gameLogStore.js";

const mkDeck = (name, cardNames, { commanders = ["Koma, Cosmos Serpent"], companion = null, id = name } = {}) => ({
  id, name,
  cards: cardNames.map((n, i) => ({ id: `${id}-${n}-${i}`, name: n, type: "", mana: "", oracle: "" })),
  commanders: commanders.map((n) => ({ id: `${id}-cmd-${n}`, name: n })),
  companion: companion ? { id: `${id}-comp`, name: companion } : null,
});

describe("deckVersionHash — exact-to-the-card version stamp (R3)", () => {
  it("is stable across calls and across card ORDER (a shuffle is not a new version)", () => {
    const a = mkDeck("Koma", ["Forest", "Forest", "Island", "Sol Ring"]);
    const b = mkDeck("Koma", ["Sol Ring", "Island", "Forest", "Forest"]);
    expect(deckVersionHash(a)).toBe(deckVersionHash(a));
    expect(deckVersionHash(a)).toBe(deckVersionHash(b));
    expect(deckVersionHash(a)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("registers a one-card swap, a count change (a basic!), a commander change, and a companion change", () => {
    const base = mkDeck("Koma", ["Forest", "Forest", "Island", "Sol Ring"]);
    const swap = mkDeck("Koma", ["Forest", "Forest", "Island", "Arcane Signet"]);           // Sol Ring → Signet
    const count = mkDeck("Koma", ["Forest", "Forest", "Forest", "Sol Ring"]);               // an Island became a Forest
    const cmdr = mkDeck("Koma", ["Forest", "Forest", "Island", "Sol Ring"], { commanders: ["Omnath, Locus of Mana"] });
    const comp = mkDeck("Koma", ["Forest", "Forest", "Island", "Sol Ring"], { companion: "Lurrus of the Dream-Den" });
    const seen = new Set([base, swap, count, cmdr, comp].map(deckVersionHash));
    expect(seen.size).toBe(5); // every change is a distinct version
  });

  it("a card MOVING between the 99 and the command zone registers (sections are prefixed)", () => {
    const inNinetyNine = mkDeck("K", ["Koma, Cosmos Serpent", "Forest"], { commanders: ["Omnath, Locus of Mana"] });
    const asCommander = mkDeck("K", ["Omnath, Locus of Mana", "Forest"], { commanders: ["Koma, Cosmos Serpent"] });
    expect(deckVersionHash(inNinetyNine)).not.toBe(deckVersionHash(asCommander));
  });

  it("returns null on a non-deck, never throws", () => {
    expect(deckVersionHash(null)).toBeNull();
    expect(deckVersionHash(undefined)).toBeNull();
  });
});

describe("formPod — deck→seat uniformity guard (SIM-INTEGRITY Phase 0 tripwire)", () => {
  // The data-trust anchor behind every per-deck standings number: pod formation assigns decks to
  // seats UNIFORMLY, so any per-seat win skew in real data is an ENGINE positional property, never a
  // sampling artifact. 2,000 seeded pods over 5 decks → each (deck, seat) cell expects 25% of that
  // deck's appearances (SE ≈ 1.1pt); the ±5pt band is >4σ — a real regression trips it, noise never.
  // (The MIRRORED-pod acceptance run from the order is a separate ENGINE measurement — the 2026-07-15
  // probe found identical-deck pods pile onto early seats (0/5/14/41 @ n=60), banked as an engine
  // finding; real-deck pods measured uniform: 25.0/25.1/24.8/25.1 over 23,313 games.)
  it("assigns each deck to each seat ~uniformly across seeded pods, and includes decks evenly", () => {
    const decks = ["A", "B", "C", "D", "E"].map((n) => ({ id: n, name: n }));
    const PODS = 2000;
    const bySeat = new Map(decks.map((d) => [d.id, [0, 0, 0, 0]]));
    const appearances = new Map(decks.map((d) => [d.id, 0]));
    for (let i = 0; i < PODS; i++) {
      const pod = formPod(decks, 4, gameSeedAt(0xc0ffee, i));
      pod.forEach((d, seatIdx) => { bySeat.get(d.id)[seatIdx] += 1; appearances.set(d.id, appearances.get(d.id) + 1); });
    }
    for (const d of decks) {
      const n = appearances.get(d.id);
      expect(n / PODS).toBeGreaterThan(0.75);        // each deck sits in ~4/5 of pods…
      expect(n / PODS).toBeLessThan(0.85);
      for (const seatCount of bySeat.get(d.id)) {
        const share = seatCount / n;
        expect(share).toBeGreaterThan(0.20);          // …and lands in every seat ~25% (±5pt > 4σ)
        expect(share).toBeLessThan(0.30);
      }
    }
  });

  it("is deterministic per seed (the pool's lane-split reproducibility rests on this)", () => {
    const decks = ["A", "B", "C", "D", "E"].map((n) => ({ id: n, name: n }));
    const a = formPod(decks, 4, 12345).map((d) => d.id);
    const b = formPod(decks, 4, 12345).map((d) => d.id);
    expect(a).toEqual(b);
  });
});

describe("deck-versions registry — deckVersionEntry + the idempotent store upsert (R4)", () => {
  let tmpDir, cwd;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deckver-")); cwd = process.cwd(); process.chdir(tmpDir); });
  afterEach(async () => { process.chdir(cwd); await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  it("deckVersionEntry snapshots the exact list ({name: copies}) under the SAME hash the headers stamp", () => {
    const deck = mkDeck("Koma", ["Forest", "Forest", "Sol Ring"]);
    const e = deckVersionEntry(deck);
    expect(e.deckV).toBe(deckVersionHash(deck)); // one fn — registry can never disagree with headers
    expect(e.cards).toEqual({ Forest: 2, "Sol Ring": 1 });
    expect(e.commanders).toEqual(["Koma, Cosmos Serpent"]);
    expect(deckVersionEntry(null)).toBeNull();
  });

  it("upsert merges new (deckId, deckV) pairs, first write wins, repeat upserts are no-ops", async () => {
    const v1 = deckVersionEntry(mkDeck("Koma", ["Forest", "Sol Ring"]));
    const v2 = deckVersionEntry(mkDeck("Koma", ["Forest", "Arcane Signet"]));
    expect(await upsertDeckVersions([v1])).toBe(1);
    expect(await upsertDeckVersions([v1])).toBe(0);          // idempotent — no rewrite
    expect(await upsertDeckVersions([v1, v2])).toBe(1);      // only the new version lands
    const reg = await loadDeckVersions();
    expect(Object.keys(reg.Koma).sort()).toEqual([v1.deckV, v2.deckV].sort());
    expect(reg.Koma[v1.deckV].cards).toEqual({ Forest: 1, "Sol Ring": 1 });
    expect(reg.Koma[v1.deckV].firstSeen).toBeTruthy();
  });

  it("loadDeckVersions never throws — {} on an absent registry; upsert ignores junk entries", async () => {
    expect(await loadDeckVersions()).toEqual({});
    expect(await upsertDeckVersions([null, { deckId: "x" }, { deckV: "y" }])).toBe(0);
  });
});

describe("buildGrindHeader — decks[] assembly with the deckV stamp (both write paths share this)", () => {
  it("stamps {seat, id, name, deckV} per pod seat, in pod order", () => {
    const pod = [mkDeck("A", ["Forest"]), mkDeck("B", ["Island"])];
    const h = buildGrindHeader({
      gameSeed: 42, pilots: {}, pod, seatNames: ["user", "ai1"],
      engineVersion: "0.141.0", mode: "commander", pool: "mixed",
      game: { result: "ai-wins", winnerSeat: "ai1", turns: 20 },
    });
    expect(h.decks).toEqual([
      { seat: "user", id: "A", name: "A", deckV: deckVersionHash(pod[0]) },
      { seat: "ai1", id: "B", name: "B", deckV: deckVersionHash(pod[1]) },
    ]);
    expect(h.seed).toBe(42);
    expect(h.winnerSeat).toBe("ai1");
  });
});
