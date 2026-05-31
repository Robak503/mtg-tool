/**
 * /api/deck-report — smoke + early-validation contract.
 *
 * The route composes the local card/power/combo indexes, so the full path needs
 * synced data. CI runs data-less, so the happy path tolerates 200-or-503; the
 * validation paths short-circuit before any index access.
 */

import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function post(body) {
  return new Request("http://localhost/api/deck-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/deck-report", () => {
  it("exports a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await route.POST(post("{ not json"));
    expect(res.status).toBe(400);
  });

  it("rejects a body without a cards array with 400", async () => {
    const res = await route.POST(post(JSON.stringify({ deckName: "x" })));
    expect(res.status).toBe(400);
  });

  it("returns a report (200) or 503 when card data isn't synced", async () => {
    const res = await route.POST(post(JSON.stringify({
      deckName: "Test",
      cards: [
        { qty: 1, name: "Sol Ring", section: "Mainboard" },
        { qty: 1, name: "Kess, Dissident Mage", section: "Commander" },
      ],
    })));
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    if (res.status === 200) {
      expect(body.ready).toBe(true);
      expect(typeof body.markdown).toBe("string");
      expect(body.markdown).toContain("# Deck Report");
    }
  }, 30000);
});
