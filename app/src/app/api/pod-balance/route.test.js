/**
 * Smoke + contract test for /api/pod-balance.
 *
 * Per CLAUDE.md gotcha #10, every route gets at least an import smoke test.
 * rankDeckPower needs the local Oracle index; in a data-less CI checkout it
 * throws ENOENT, which the route turns into a 503. So the invariant we assert
 * is: the route never throws past producing a Response, and a valid request
 * yields either a 200 with the {ready, decks} contract or a 503 sync hint.
 */

import { describe, expect, it } from "vitest";

describe("/api/pod-balance — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("rejects a body without a decks array (400)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/pod-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns a Response for a valid request (200 ranked, or 503 if data missing)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/pod-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decks: [
          { id: "a", name: "Deck A", cards: [{ qty: 1, name: "Sol Ring", section: "Mainboard" }] },
        ],
      }),
    });
    const resp = await mod.POST(req);
    expect(resp).toBeInstanceOf(Response);
    expect([200, 503]).toContain(resp.status);
    const body = await resp.json();
    if (resp.status === 200) {
      expect(body.ready).toBe(true);
      expect(Array.isArray(body.decks)).toBe(true);
      expect(body.decks[0]).toHaveProperty("bracket");
      expect(body.decks[0]).toHaveProperty("powerLevel");
      // Single deck → no comparison verdict.
      expect(body.comparison).toBeNull();
    } else {
      expect(body.ready).toBe(false);
    }
  });
});
