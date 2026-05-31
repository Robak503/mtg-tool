/**
 * Smoke + contract test for /api/finance.
 *
 * The dashboard needs the local oracle + printings indexes; a data-less CI
 * checkout makes them throw ENOENT → the route returns 503. So the invariant
 * is: the route returns a Response, and a 200 carries the dashboard contract
 * (value / owned / movers / grails / suggestions).
 */

import { describe, expect, it } from "vitest";

describe("/api/finance — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a GET handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
  });

  it("GET returns the dashboard contract (200) or a sync hint (503)", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET();
    expect(resp).toBeInstanceOf(Response);
    expect([200, 503]).toContain(resp.status);
    const body = await resp.json();
    if (resp.status === 200) {
      expect(body.ready).toBe(true);
      expect(body.value).toHaveProperty("currentUsd");
      expect(body.owned).toHaveProperty("risers");
      expect(body.owned).toHaveProperty("fallers");
      expect(body.movers).toHaveProperty("risers");
      expect(Array.isArray(body.grails)).toBe(true);
      expect(body.suggestions).toHaveProperty("staples");
      expect(body.suggestions).toHaveProperty("combos");
      expect(Array.isArray(body.historyDates)).toBe(true);
    } else {
      expect(body.ready).toBe(false);
    }
    // Generous timeout: with synced data present locally this route loads the
    // oracle + printings + spellbook indexes; under full-suite parallelism that
    // can exceed the 5s default. (In data-less CI it returns 503 instantly.)
  }, 30000);
});
