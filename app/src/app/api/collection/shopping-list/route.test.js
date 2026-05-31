/**
 * /api/collection/shopping-list — smoke + validation. The full path needs the
 * printings index, so the happy path tolerates 200-or-503.
 */

import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function post(body) {
  return new Request("http://localhost/api/collection/shopping-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/collection/shopping-list", () => {
  it("exports a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON with 400", async () => {
    expect((await route.POST(post("{ no"))).status).toBe(400);
  });

  it("rejects a body without a cards array with 400", async () => {
    expect((await route.POST(post(JSON.stringify({ deckName: "x" })))).status).toBe(400);
  });

  it("returns a buy list (200) or 503 when the printings index isn't synced", async () => {
    const res = await route.POST(post(JSON.stringify({
      deckName: "Test",
      cards: [{ qty: 1, name: "Mana Crypt", section: "Mainboard" }],
    })));
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(typeof body.text).toBe("string");
      expect(typeof body.csv).toBe("string");
      expect(Array.isArray(body.entries)).toBe(true);
    }
  }, 30000);
});
