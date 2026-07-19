/**
 * /api/collection/dashboard tests — the Vault V1 payload.
 *
 * The load-bearing assertions are the HONEST-STATE ones (hollow-gate law): the movers tile must
 * distinguish "insufficient history" from "prices flat", and an empty collection must produce a
 * clean all-zeroes payload rather than an error. Everything else composes already-tested lib
 * functions (collectionPrices / showpiece), so these tests pin the composition, not the math.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let route;
let tmpDir;
let originalCwd;

function writeCollection(cards) {
  const dir = path.join(tmpDir, "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "collection.json"), JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), cards }));
}

function writeHistory(lines) {
  fs.writeFileSync(path.join(tmpDir, "data", "collection-prices.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

const stamp = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
};

function row(id, name, price, { qty = 1, signed = false } = {}) {
  return {
    scryfallId: id, oracleId: `o-${id}`, name,
    prices: { usd: String(price) },
    stacks: [{ finish: "nonfoil", quantity: qty }],
    signed,
  };
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-vault-dash-"));
  fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  process.chdir(tmpDir);
  vi.resetModules();
  route = await import("./route.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("empty vault — honest zeroes, never an error", () => {
  it("returns a clean payload with insufficient-history movers", async () => {
    const body = await (await route.GET()).json();
    expect(body.uniquePrintings).toBe(0);
    expect(body.totalQuantity).toBe(0);
    expect(body.vaultValue).toBe(0);
    expect(body.grails).toEqual([]);
    expect(body.rows).toEqual([]);
    expect(body.movers.status).toBe("insufficient-history");
    expect(body.movers.reason).toBeTruthy(); // the tile prints WHY — "no data" must never look like "no movement"
  });
});

describe("tiles — his exact counting spec", () => {
  it("uniquePrintings counts DISTINCT printings; totalQuantity counts copies", async () => {
    writeCollection([
      row("aaa", "Sol Ring", 2, { qty: 4 }),
      row("bbb", "Sol Ring", 3, { qty: 2 }),   // same name, DIFFERENT printing — counts separately
      row("ccc", "Rhystic Study", 40, { qty: 1 }),
    ]);
    const body = await (await route.GET()).json();
    expect(body.uniquePrintings).toBe(3);
    expect(body.totalQuantity).toBe(7);
    expect(body.vaultValue).toBeCloseTo(4 * 2 + 2 * 3 + 40, 2);
  });

  it("wishlist rows and zero-qty rows are excluded from every number", async () => {
    writeCollection([
      row("aaa", "Sol Ring", 2, { qty: 1 }),
      { ...row("bbb", "Mox Diamond", 500, { qty: 1 }), wishlist: true },
      row("ccc", "Empty Stack", 9, { qty: 0 }),
    ]);
    const body = await (await route.GET()).json();
    expect(body.uniquePrintings).toBe(1);
    expect(body.rows.map((r) => r.name)).toEqual(["Sol Ring"]);
  });
});

describe("weekly movers — the hollow-gate distinction", () => {
  it("one snapshot DAY => insufficient-history, even with many card lines (never a fabricated 0%)", async () => {
    writeCollection([row("aaa", "Sol Ring", 2), row("bbb", "Rhystic Study", 40)]);
    // Two LINES but one DAY — raw line count must not fool the check.
    writeHistory([
      { snappedAt: stamp(0), scryfallId: "aaa", usd: "2" },
      { snappedAt: stamp(0), scryfallId: "bbb", usd: "40" },
    ]);
    const body = await (await route.GET()).json();
    expect(body.movers.status).toBe("insufficient-history");
  });

  it("two snapshot days a week apart => real winner/loser with names", async () => {
    writeCollection([row("aaa", "Riser", 10), row("bbb", "Faller", 10)]);
    writeHistory([
      { snappedAt: stamp(7), scryfallId: "aaa", usd: "5" },
      { snappedAt: stamp(7), scryfallId: "bbb", usd: "20" },
      { snappedAt: stamp(0), scryfallId: "aaa", usd: "10" },
      { snappedAt: stamp(0), scryfallId: "bbb", usd: "10" },
    ]);
    const body = await (await route.GET()).json();
    expect(body.movers.status).toBe("ok");
    expect(body.movers.winner.name).toBe("Riser");
    expect(body.movers.winner.pctChange).toBeGreaterThan(0);
    expect(body.movers.loser.name).toBe("Faller");
    expect(body.movers.loser.pctChange).toBeLessThan(0);
  });

  it("snapshots that DON'T span the window => still honest (the branch a redundant fast-path was masking)", async () => {
    // Two distinct DAYS, but both inside the last 3 days — computeCardMovers needs a snapshot
    // >= 7 days back, so movers are empty. The payload must say so, never fabricate a 0% pair.
    writeCollection([row("aaa", "Sol Ring", 2)]);
    writeHistory([
      { snappedAt: stamp(2), scryfallId: "aaa", usd: "2" },
      { snappedAt: stamp(0), scryfallId: "aaa", usd: "2.5" },
    ]);
    const body = await (await route.GET()).json();
    expect(body.movers.status).toBe("insufficient-history");
    expect(body.movers.winner).toBeUndefined();
  });
});

describe("grails + rows", () => {
  it("flagged showpieces lead the shelf; rows sort by total value", async () => {
    writeCollection([
      row("aaa", "Signed Beauty", 5, { signed: true }),
      row("bbb", "Big Ticket", 120),
      row("ccc", "Bulk Rare", 1, { qty: 30 }),
    ]);
    const body = await (await route.GET()).json();
    expect(body.grails[0].name).toBe("Signed Beauty"); // provenance beats price
    expect(body.grails[0].flagged).toBe(true);
    expect(body.rows[0].name).toBe("Big Ticket");       // 120 > 30 > 5
  });
});
