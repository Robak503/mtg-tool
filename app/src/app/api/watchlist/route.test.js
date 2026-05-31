/**
 * Smoke + contract test for /api/watchlist (the Finance "Grails" list).
 *
 * Read-only / 400-path coverage so the test never writes to the real data dir:
 * GET returns a {cards} array (empty when no file), and the validation paths
 * (POST without scryfallId/name, DELETE without scryfallId) 400 before any write.
 */

import { describe, expect, it } from "vitest";

describe("/api/watchlist — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports GET / POST / DELETE handlers", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.DELETE).toBe("function");
  });

  it("GET returns a cards array", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it("POST without scryfallId/name is a 400 (no write)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "missing ids" }),
    });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("DELETE without scryfallId is a 400 (no write)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/watchlist", { method: "DELETE" });
    expect((await mod.DELETE(req)).status).toBe(400);
  });
});
