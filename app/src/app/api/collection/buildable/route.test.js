/**
 * Smoke + contract test for /api/collection/buildable (Vault #20).
 * Data-less CI has no card index → 503; the test tolerates 200-or-503 and
 * asserts shape on the 200 path (gotcha #10 coverage for a new route).
 */

import { describe, expect, it } from "vitest";

describe("/api/collection/buildable — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a GET handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
  });

  it("GET returns a commanders array (or 503 when data is missing)", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET();
    expect([200, 503]).toContain(resp.status);
    if (resp.status === 200) {
      const body = await resp.json();
      expect(Array.isArray(body.commanders)).toBe(true);
      expect(typeof body.ownedCards).toBe("number");
    }
  }, 30000);
});
