/**
 * Smoke test for /api/rules-retrieval — catches the kind of bug introduced by
 * commit 5f8137e (paths.js migration) which dropped ENGINE_ROOT/JUDGE_ROOT
 * but left call sites referencing them, throwing ReferenceError on every
 * request. No test covered the endpoint at the time so the regression
 * shipped silently and only surfaced in the packaged .exe.
 *
 * This test loads the route module and invokes GET. We don't assert on
 * the response shape (the route depends on real rules-codex markdown);
 * we just assert that:
 *   1. importing the module doesn't throw
 *   2. GET resolves to a Response (not a thrown error)
 */

import { describe, expect, it } from "vitest";

describe("/api/rules-retrieval — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a GET handler that returns a Response", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
    const req = new Request("http://localhost/api/rules-retrieval?q=trample");
    const resp = await mod.GET(req);
    expect(resp).toBeInstanceOf(Response);
    // Status may be 200 or 500 depending on whether knowledge/mtg-judge and
    // knowledge/mtg-engine are reachable from the test cwd. The key invariant is that
    // we don't throw before producing a response.
    expect([200, 500]).toContain(resp.status);
    // Generous timeout: loads the rules codex when present; can exceed 5s under
    // full-suite parallelism alongside the other data-heavy route tests.
  }, 30000);

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("POST with an explicit-rule query returns 200 and a CR source citation", async () => {
    // Regression guard for the undefined TOOL_ROOT in formatRulesContext, which
    // threw ReferenceError -> 500 on any POST that routed to rules. An explicit
    // rule number reliably produces rules from the real bundled CR JSON, so
    // formatRulesContext actually runs (the GET smoke test never exercised it).
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/rules-retrieval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "casting a spell, rule 601.2" }),
    });
    const resp = await mod.POST(req);
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThan(0);
    expect(body.context).toContain("cr_current.json");
  }, 30000);
});
