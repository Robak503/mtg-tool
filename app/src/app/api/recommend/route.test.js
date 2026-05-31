/**
 * Smoke + contract test for /api/recommend.
 *
 * Per CLAUDE.md gotcha #10. rankDeckPower needs the local Oracle index; a
 * data-less CI checkout makes it throw ENOENT, which the route turns into a
 * 503. So we assert the route never throws past a Response and a valid request
 * yields a 200 with the {adds, cuts, completions} contract or a 503 sync hint.
 */

import { describe, expect, it } from "vitest";

describe("/api/recommend — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("rejects a body without a cards array (400)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns a Response for a valid request (200 recs, or 503 if data missing)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cards: [{ qty: 1, name: "Sol Ring", section: "Mainboard" }] }),
    });
    const resp = await mod.POST(req);
    expect(resp).toBeInstanceOf(Response);
    expect([200, 503]).toContain(resp.status);
    const body = await resp.json();
    if (resp.status === 200) {
      expect(body.ready).toBe(true);
      expect(Array.isArray(body.adds)).toBe(true);
      expect(Array.isArray(body.cuts)).toBe(true);
      expect(Array.isArray(body.completions)).toBe(true);
    } else {
      expect(body.ready).toBe(false);
    }
  });
});
