/**
 * Smoke tests for /api/sync-data — the route spawns child processes
 * for real work so we don't exercise the network paths in vitest.
 * Verifies module import, GET status shape, POST action dispatch.
 */

import { describe, expect, it, vi } from "vitest";

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
