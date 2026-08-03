/**
 * /api/decks/import-url — import smoke + validation + fetch-failure messaging.
 *
 * The resolve path needs the bundled index, so it's exercised live; here we
 * cover module load, the input-validation branches (per the "always add an
 * import smoke test for a new route" rule), and the fetch-failure error
 * mapping (the provider fetch is mocked — the messages must not assert a
 * cause the HTTP status doesn't establish; see the 2026-08-02 Moxfield 403).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked provider fetch: each test sets nextFetchError to drive the catch
// branch; null means "not under test" (validation tests never reach it).
const fetchState = { nextFetchError: null };
vi.mock("../../../../lib/server/deckUrlFetch.js", () => ({
  fetchDeckFromUrl: vi.fn(async () => {
    if (fetchState.nextFetchError) throw fetchState.nextFetchError;
    throw new Error("test did not configure fetch behavior");
  }),
}));

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

describe("POST /api/decks/import-url (fetch-failure messaging)", () => {
  const MOX_URL = "https://moxfield.com/decks/vkp5_GN6GEqHUMql45PvOw";

  function providerError(status) {
    const err = new Error(`Provider returned HTTP ${status}`);
    err.status = status;
    return err;
  }

  beforeEach(() => {
    fetchState.nextFetchError = null;
  });

  it("404 → 404, and the hint points at the link (private/deleted/mistyped)", async () => {
    fetchState.nextFetchError = providerError(404);
    const resp = await POST(post({ url: MOX_URL }));
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toMatch(/private, deleted, or the URL mistyped/);
  });

  it("403 → 502, and the hint does NOT blame the link — it names the provider refusing the app", async () => {
    fetchState.nextFetchError = providerError(403);
    const resp = await POST(post({ url: MOX_URL }));
    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error).toMatch(/Provider returned HTTP 403/);
    expect(body.error).toMatch(/link is probably fine/i);
    expect(body.error).toMatch(/update/i);
    // The old message asserted an unestablished cause; it must be gone.
    expect(body.error).not.toMatch(/check the link is public/i);
  });

  it("any other failure → 502 with the underlying message and NO asserted cause", async () => {
    fetchState.nextFetchError = new Error("request timed out");
    const resp = await POST(post({ url: MOX_URL }));
    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error).toMatch(/request timed out/);
    expect(body.error).not.toMatch(/check the link/i);
  });
});
