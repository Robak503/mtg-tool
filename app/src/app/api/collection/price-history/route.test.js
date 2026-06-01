/**
 * /api/collection/price-history — returns one card's daily price series.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}
const get = (qs) => new Request(`http://localhost/api/collection/price-history${qs}`, { method: "GET" });

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "price-history-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});
afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/collection/price-history", () => {
  it("requires a scryfallId", async () => {
    const route = await loadRoute();
    expect((await route.GET(get(""))).status).toBe(400);
  });

  it("returns the card's series and an empty one for unknown cards", async () => {
    const lines = [
      { snappedAt: "2026-05-01", scryfallId: "a", usd: "1.00" },
      { snappedAt: "2026-05-02", scryfallId: "a", usd: "1.25" },
      { snappedAt: "2026-05-02", scryfallId: "b", usd: "9.00" },
    ].map(o => JSON.stringify(o)).join("\n");
    await fs.writeFile(path.join(tmpDir, "data", "collection-prices.jsonl"), lines + "\n", "utf8");

    const route = await loadRoute();
    const a = await (await route.GET(get("?scryfallId=a"))).json();
    expect(a.scryfallId).toBe("a");
    expect(a.series).toEqual([
      { snappedAt: "2026-05-01", usd: 1.0 },
      { snappedAt: "2026-05-02", usd: 1.25 },
    ]);

    const z = await (await route.GET(get("?scryfallId=zzz"))).json();
    expect(z.series).toEqual([]);
  });

  it("returns an empty series on a fresh install (no history file)", async () => {
    const route = await loadRoute();
    const body = await (await route.GET(get("?scryfallId=a"))).json();
    expect(body.series).toEqual([]);
  });
});
