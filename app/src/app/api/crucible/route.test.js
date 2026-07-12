/**
 * Tests for /api/crucible — the bounded POD route. Covers its OWN logic: request validation,
 * the exactly-podSize deck-count gate, and idle GET status wiring. The engine itself (real games,
 * placement, tiles) is covered by crucibleRun.test.js; deck/pilot loading is the same code path
 * as the already-tested /api/grind, so it isn't re-mocked here.
 */

import { describe, expect, it } from "vitest";
import { GET, POST } from "./route.js";

function postReq(body, raw) {
  return new Request("http://localhost/api/crucible", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

describe("/api/crucible validation + wiring", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await POST(postReq(undefined, "{ not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
  });

  it("rejects an unknown action with 400", async () => {
    const res = await POST(postReq({ action: "explode" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/action must be/);
  });

  it("rejects a start that isn't exactly a pod (commander = 4 decks)", async () => {
    const two = await POST(postReq({ action: "start", mode: "commander", deckIds: ["a", "b"] }));
    expect(two.status).toBe(400);
    expect((await two.json()).error).toMatch(/exactly 4 decks/);

    const none = await POST(postReq({ action: "start", mode: "commander" }));
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/exactly 4 decks/);
  });

  it("a standard pod requires exactly 2 decks", async () => {
    const res = await POST(postReq({ action: "start", mode: "standard", deckIds: ["a", "b", "c"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exactly 2 decks/);
  });

  it("GET returns idle status (running false) when no run is active", async () => {
    const res = await GET(new Request("http://localhost/api/crucible"));
    expect(res.status).toBe(200);
    const status = await res.json();
    expect(status.running).toBe(false);
    expect(status).toHaveProperty("tiles");
    expect(status).toHaveProperty("target");
  });

  it("action:status and action:results are readable without a run", async () => {
    const st = await POST(postReq({ action: "status" }));
    expect(st.status).toBe(200);
    const rs = await POST(postReq({ action: "results" }));
    expect(rs.status).toBe(200);
    expect(await rs.json()).toHaveProperty("standings");
  });
});
