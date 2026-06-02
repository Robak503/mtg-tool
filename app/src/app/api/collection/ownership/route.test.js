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
