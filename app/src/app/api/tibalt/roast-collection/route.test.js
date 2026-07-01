/**
 * /api/tibalt/roast-collection — module-load + happy-path validation.
 *
 * The actual model call is mocked because Ollama isn't available in CI
 * and the route's job is the outlier computation + persistence wiring,
 * not the LLM call itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd, route;

// The roast endpoint runs the profiles migration, so the collection + roast log
// live under data/profiles/<activeId>/. Resolve that dir from the registry.
async function activeProfileDir() {
  const reg = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "profiles.json"), "utf8"));
  return path.join(tmpDir, "data", "profiles", reg.activeProfileId);
}

async function loadRoute() {
  vi.resetModules();
  vi.doMock("../../../../lib/server/modelProvider.js", () => ({
    callModelMessages: vi.fn(async () => ({
      ok: true,
      provider: "ollama",
      data: { content: [{ type: "text", text: "Mocked Tibalt roast: your collection is bloated." }] },
    })),
  }));
  return import("./route.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tibalt-roast-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  vi.doUnmock("../../../../lib/server/modelProvider.js");
});

describe("module load", () => {
  it("imports without throwing", async () => {
    await expect(loadRoute()).resolves.toBeDefined();
  });

  it("exports POST", async () => {
    const mod = await loadRoute();
    expect(typeof mod.POST).toBe("function");
  });
});

describe("POST /api/tibalt/roast-collection", () => {
  async function seedCollection(cards) {
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify({ version: 1, updatedAt: "x", cards }),
      "utf8",
    );
  }

  it("returns 400 for an empty collection", async () => {
    route = await loadRoute();
    const resp = await route.POST(new Request("http://localhost/api/tibalt/roast-collection", { method: "POST" }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns the mocked Tibalt roast for a populated collection", async () => {
    await seedCollection([
      {
        scryfallId: "a",
        oracleId: "oracle-a",
        name: "Sol Ring",
        stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
        prices: { usd: "3.50", usdFoil: null, usdEtched: null },
        wishlist: false,
      },
    ]);
    route = await loadRoute();
    const resp = await route.POST(new Request("http://localhost/api/tibalt/roast-collection", { method: "POST" }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.roast).toMatch(/Mocked Tibalt roast/);
    expect(body.outliers.mostOwned.name).toBe("Sol Ring");
    expect(body.outliers.mostOwned.qty).toBe(4);
  });

  it("persists the roast to collection-roasts.json", async () => {
    await seedCollection([
      {
        scryfallId: "a",
        oracleId: "oracle-a",
        name: "Sol Ring",
        stacks: [{ finish: "nonfoil", quantity: 4 }],
        prices: { usd: "3.50" },
        wishlist: false,
      },
    ]);
    route = await loadRoute();
    await route.POST(new Request("http://localhost/api/tibalt/roast-collection", { method: "POST" }));
    const raw = await fs.readFile(path.join(await activeProfileDir(), "collection-roasts.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.roasts).toHaveLength(1);
    expect(parsed.roasts[0].roast).toMatch(/Mocked Tibalt roast/);
    expect(parsed.roasts[0].stats.totalCards).toBe(4);
  });
});

describe("provider failure surfacing (S-P2-3)", () => {
  async function loadRouteWithFailure() {
    vi.resetModules();
    vi.doMock("../../../../lib/server/modelProvider.js", () => ({
      // Real failure shape: providerError() nests everything under data.
      callModelMessages: vi.fn(async () => ({
        ok: false,
        status: 502,
        data: {
          error: 'Ollama model "qwen2.5:14b" is not pulled. Run: ollama pull qwen2.5:14b',
          provider: "ollama",
          modelMissing: true,
        },
      })),
    }));
    return import("./route.js");
  }

  it("surfaces result.data.error instead of the generic unreachable line", async () => {
    await fs.writeFile(
      path.join(tmpDir, "data", "collection.json"),
      JSON.stringify({
        version: 1,
        updatedAt: "x",
        cards: [
          {
            scryfallId: "a",
            oracleId: "oracle-a",
            name: "Sol Ring",
            stacks: [{ finish: "nonfoil", quantity: 4 }],
            prices: { usd: "3.50" },
            wishlist: false,
          },
        ],
      }),
      "utf8",
    );
    route = await loadRouteWithFailure();
    const resp = await route.POST(new Request("http://localhost/api/tibalt/roast-collection", { method: "POST" }));
    expect(resp.status).toBe(503);
    const body = await resp.json();
    expect(body.error).toMatch(/not pulled/);
    expect(body.error).not.toMatch(/unreachable/i);
    expect(body.provider).toBe("ollama");
  });
});
