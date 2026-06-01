/**
 * Smoke + contract test for /api/collection/sets (the Set Browser, #23).
 *
 * Catches the gotcha-#10 failure mode (a latent ReferenceError / bad import in
 * the handler that unit tests on the pure helpers would miss). Data-less CI has
 * no printings index, so GET degrades to 503 — the test tolerates 200-or-503
 * and only asserts the response shape on the 200 path.
 */

import { describe, expect, it } from "vitest";

describe("/api/collection/sets — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a GET handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
  });

  it("GET (no param) returns a sets array or a 503 when data is missing", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET(new Request("http://localhost/api/collection/sets"));
    expect([200, 503]).toContain(resp.status);
    if (resp.status === 200) {
      const body = await resp.json();
      expect(Array.isArray(body.sets)).toBe(true);
    }
  }, 30000);

  it("GET ?set=CODE returns a set detail or a 503", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET(new Request("http://localhost/api/collection/sets?set=c21"));
    expect([200, 503]).toContain(resp.status);
    if (resp.status === 200) {
      const body = await resp.json();
      expect(body.setCode).toBe("c21");
      expect(Array.isArray(body.cards)).toBe(true);
      expect(typeof body.total).toBe("number");
    }
  }, 30000);
});
