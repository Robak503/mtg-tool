/**
 * Smoke tests for /api/sync-data — the route spawns child processes
 * for real work so we don't exercise the network paths in vitest.
 * Verifies module import, GET status shape, POST action dispatch.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Intercept child_process.spawn so the derived-index chain (B3) can be exercised without
// running the real sync scripts. Each fake process reports the basename it was asked to run and
// closes with a configurable exit code on the next microtask (after the route registers its
// "close" handler). vi.hoisted keeps the shared state visible to the hoisted mock factory.
const spawnState = vi.hoisted(() => ({ calls: [], exit: {} }));
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  return {
    spawn: (_cmd, args) => {
      const base = String(args[0]).split(/[\\/]/).pop();
      spawnState.calls.push(base);
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      queueMicrotask(() => {
        proc.stdout.emit("data", Buffer.from(`ran ${base}`));
        proc.emit("close", spawnState.exit[base] ?? 0);
      });
      return proc;
    },
  };
});

/** Drain the SSE stream a POST returns into the array of parsed `data:` events. */
async function drain(resp) {
  const text = await resp.text();
  return text
    .split("\n\n")
    .map((block) => block.replace(/^data: /, "").trim())
    .filter(Boolean)
    .map((json) => {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const post = (action) =>
  new Request("http://localhost/api/sync-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });

describe("/api/sync-data — derived-index chain (B3 cold-start)", () => {
  beforeEach(() => {
    spawnState.calls = [];
    spawnState.exit = {};
  });

  it("a lone scryfall-bulk sync rebuilds the derived oracle + printings indexes, in order", async () => {
    const mod = await import("./route.js");
    const events = await drain(await mod.POST(post("scryfall-bulk")));
    // The primary bulk script, THEN both derived index builders — the single-action gap the full
    // ("all") sequence never had.
    expect(spawnState.calls).toEqual([
      "sync-scryfall-bulk.cjs",
      "build-oracle-index.cjs",
      "build-collection-printings-index.cjs",
    ]);
    const done = events.find((e) => e.done);
    expect(done.ok).toBe(true);
  });

  it("a failed derived rebuild flips the whole sync to not-ok and names the stale index", async () => {
    spawnState.exit["build-oracle-index.cjs"] = 1; // the index build fails
    const mod = await import("./route.js");
    const events = await drain(await mod.POST(post("scryfall-bulk")));
    const done = events.find((e) => e.done);
    expect(done.ok).toBe(false);
    expect(done.summary).toContain("Slim oracle index");
    expect(done.summary.toLowerCase()).toContain("stale");
    // It still attempted the printings index — one failure doesn't abort the rest of the chain.
    expect(spawnState.calls).toContain("build-collection-printings-index.cjs");
  });

  it("a non-bulk single action has no derived follow-ups", async () => {
    const mod = await import("./route.js");
    await drain(await mod.POST(post("oracle-index")));
    expect(spawnState.calls).toEqual(["build-oracle-index.cjs"]);
  });
});

describe("/api/sync-data", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("GET returns datasets array and dataDir", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET(new Request("http://localhost/api/sync-data"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.datasets)).toBe(true);
    expect(typeof body.dataDir).toBe("string");
    // Every dataset has the expected shape
    for (const ds of body.datasets) {
      expect(typeof ds.key).toBe("string");
      expect(typeof ds.label).toBe("string");
      expect(typeof ds.present).toBe("boolean");
      expect(["bundle", "appdata"]).toContain(ds.source);
    }
  });

  it("GET reports which copy each dataset reads — a newer bundle reads as source: bundle, with the bundle's date", async () => {
    // The 2026-09-29 shadowing bug, at the route: a synced rules-index from 07-19 must not hide the bundle's
    // 08-16 one, and a Spellbook synced AFTER the bundle was built must keep winning.
    const appRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "syncdata-approot-"));
    const refDir = await fs.mkdtemp(path.join(os.tmpdir(), "syncdata-refdir-"));
    const saved = { app: process.env.MTG_APP_ROOT, ref: process.env.MTG_REFERENCE_DIR };
    const put = async (file, content, mtimeIso) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content);
      const t = new Date(mtimeIso);
      await fs.utimes(file, t, t);
    };
    try {
      process.env.MTG_APP_ROOT = appRootDir;
      process.env.MTG_REFERENCE_DIR = refDir;
      await put(path.join(appRootDir, "data", "rules-index.json"), "[]", "2026-07-19T03:06:44.000Z");
      await put(path.join(refDir, "rules-index.json"), "[]", "2026-08-16T10:54:00.000Z");
      await put(path.join(appRootDir, "data", "spellbook-meta.local.json"), JSON.stringify({ syncedAt: "2026-08-20T00:00:00.000Z" }), "2026-08-20T00:00:00.000Z");
      await put(path.join(refDir, "spellbook-meta.local.json"), JSON.stringify({ syncedAt: "2026-08-16T10:57:00.000Z" }), "2026-08-16T10:57:00.000Z");

      const mod = await import("./route.js");
      const body = await (await mod.GET(new Request("http://localhost/api/sync-data"))).json();
      const byKey = Object.fromEntries(body.datasets.map((d) => [d.key, d]));
      expect(byKey["rules-index"].source).toBe("bundle");
      expect(byKey["rules-index"].syncedAt).toBe("2026-08-16T10:54:00.000Z");
      expect(byKey.spellbook.source).toBe("appdata");
      expect(byKey.spellbook.syncedAt).toBe("2026-08-20T00:00:00.000Z");
    } finally {
      if (saved.app === undefined) delete process.env.MTG_APP_ROOT;
      else process.env.MTG_APP_ROOT = saved.app;
      if (saved.ref === undefined) delete process.env.MTG_REFERENCE_DIR;
      else process.env.MTG_REFERENCE_DIR = saved.ref;
      await fs.rm(appRootDir, { recursive: true, force: true });
      await fs.rm(refDir, { recursive: true, force: true });
    }
  });

  it("POST rejects unknown action with 400", async () => {
    vi.resetModules();
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/sync-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "wipe-disk" }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("Unknown action");
  });

  it("POST rejects malformed JSON with 400", async () => {
    vi.resetModules();
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/sync-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ broken",
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("Invalid JSON");
  });
});
