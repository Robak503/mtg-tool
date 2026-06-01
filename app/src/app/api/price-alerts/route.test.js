/**
 * Smoke + contract test for /api/price-alerts (Vault #1).
 *
 * Read-only / 400-path coverage so the test never writes to the real data dir:
 * GET returns an {alerts} array (empty when no file, so no price lookup runs),
 * and the validation paths (POST without a valid target, bad direction, DELETE
 * without scryfallId) 400 before any write.
 */

import { describe, expect, it } from "vitest";

describe("/api/price-alerts — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports GET / POST / DELETE handlers", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.DELETE).toBe("function");
  });

  it("GET returns an alerts array", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it("POST without a positive target is a 400 (no write)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/price-alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scryfallId: "a", target: 0 }),
    });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("POST with an invalid direction is a 400 (no write)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/price-alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scryfallId: "a", target: 5, direction: "sideways" }),
    });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("DELETE without scryfallId is a 400 (no write)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/price-alerts", { method: "DELETE" });
    expect((await mod.DELETE(req)).status).toBe(400);
  });
});
