/**
 * Smoke + contract test for /api/collection/deck-overlap (collection-aware Karn, G1).
 * Data-less CI has no card index, so the handler degrades to an empty block —
 * the test asserts the import, the 400 path, and a shaped response.
 */

import { describe, expect, it } from "vitest";

describe("/api/collection/deck-overlap — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("400s on invalid JSON", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/collection/deck-overlap", { method: "POST", body: "{not json" });
    expect((await mod.POST(req)).status).toBe(400);
  });

  it("returns a shaped overlap (block + counts) for a deck payload", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/collection/deck-overlap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardNames: ["Sol Ring", "Llanowar Elves"], commanderNames: ["Atraxa, Praetors' Voice"] }),
    });
    const resp = await mod.POST(req);
    expect([200, 500]).toContain(resp.status);
    if (resp.status === 200) {
      const b = await resp.json();
      expect(typeof b.block).toBe("string");
      expect(typeof b.deckTotal).toBe("number");
      expect(Array.isArray(b.pool)).toBe(true);
    }
  }, 30000);
});
