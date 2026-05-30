/**
 * /api/decks/import-url — import smoke + validation.
 *
 * The fetch + resolve paths need the network and the bundled index, so they're
 * exercised live; here we cover module load and the input-validation branches
 * (per the "always add an import smoke test for a new route" rule).
 */

import { describe, it, expect } from "vitest";

import { POST } from "./route.js";

function post(body) {
  return new Request("http://localhost/api/decks/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/decks/import-url (validation)", () => {
  it("exports POST", () => {
    expect(typeof POST).toBe("function");
  });

  it("rejects a non-JSON body with 400", async () => {
    const resp = await POST(post("not json{"));
    expect(resp.status).toBe(400);
  });

  it("rejects a missing url with 400", async () => {
    const resp = await POST(post({}));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/deck url/i);
  });

  it("rejects a URL that isn't Moxfield/Archidekt with 400", async () => {
    const resp = await POST(post({ url: "https://example.com/decks/123" }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/moxfield or archidekt/i);
  });
});
