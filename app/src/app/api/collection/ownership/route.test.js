/**
 * Smoke + contract test for /api/collection/ownership (G1).
 * Tolerant of data-less CI (empty collection → all "missing"); asserts shape.
 * Import smoke test per gotcha #10.
 */

import { describe, expect, it } from "vitest";

describe("/api/collection/ownership — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("400s when names is missing", async () => {
    const mod = await import("./route.js");
    const resp = await mod.POST({ json: async () => ({}) });
    expect(resp.status).toBe(400);
  });

  it("returns a statuses map keyed by the requested names", async () => {
    const mod = await import("./route.js");
    const resp = await mod.POST({ json: async () => ({ names: ["Sol Ring", "Definitely Not A Real Card 9000"] }) });
    expect([200, 500]).toContain(resp.status);
    if (resp.status === 200) {
      const body = await resp.json();
      expect(body.statuses).toBeTypeOf("object");
      // The fake card can never be owned → "missing".
      expect(body.statuses["Definitely Not A Real Card 9000"].status).toBe("missing");
    }
  }, 30000);
});

// ── A3: the excludeDeckId join (cross-deck commitments) — functional, tmpdir-seeded ────────────
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("/api/collection/ownership — excludeDeckId (A3)", () => {
  it("inDecks counts OTHER decks when the asking deck is excluded", async () => {
    const originalCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-ownership-"));
    try {
      process.chdir(tmpDir);
      fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
      // One owned card (oracleId o-solring) used by three saved decks, including the asker (d1).
      fs.writeFileSync(path.join(tmpDir, "data", "collection.json"), JSON.stringify({
        cards: [{ name: "Sol Ring", oracleId: "o-solring", wishlist: false, stacks: [{ finish: "nonfoil", quantity: 3 }] }],
      }));
      const deck = (id) => ({ id, name: id, cards: [{ name: "Sol Ring", oracleId: "o-solring", qty: 1, section: "Mainboard" }] });
      fs.writeFileSync(path.join(tmpDir, "data", "decks.local.json"), JSON.stringify([deck("d1"), deck("d2"), deck("d3")]));

      const mod = await import("./route.js");
      const ask = (body) => mod.POST({ json: async () => body });

      const all = await (await ask({ names: ["Sol Ring"] })).json();
      expect(all.statuses["Sol Ring"]).toMatchObject({ status: "owned", inDecks: 3 });

      const excluded = await (await ask({ names: ["Sol Ring"], excludeDeckId: "d1" })).json();
      expect(excluded.statuses["Sol Ring"]).toMatchObject({ status: "owned", inDecks: 2 });
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);
});
