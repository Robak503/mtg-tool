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

  // ── Response-shape CONTRACT (added 2026-07-18, improvement slate B1) ────────
  // The prior tests prove the route ANSWERS; nothing proved WHAT it answers.
  // That gap matters because both consumers fail SILENTLY on shape drift:
  // deckContextBuilder.fetchEngineContext reads only `data.context || ""` (agent
  // rules-grounding would quietly degrade to nothing), and LibraryView renders
  // `rules`/`results`. Pin the full contract so the planned consolidation onto
  // lib/server/rulesRetrieval.js (B1 follow-up) cannot silently change it.

  it("POST semantic query honors the full response contract", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/rules-retrieval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "does deathtouch let a trampler assign one damage to a blocker", limit: 4 }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    // rules: CR hits with real rule numbers + text + source
    expect(Array.isArray(body.rules)).toBe(true);
    for (const rule of body.rules) {
      expect(rule.number).toMatch(/^\d{3}(\.\d+[a-z]?)?$/);
      expect(typeof rule.text).toBe("string");
      expect(rule.text.length).toBeGreaterThan(0);
      expect(typeof rule.source).toBe("string");
    }

    // results: doc chunks with title + chunk + score
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(4);
    for (const r of body.results) {
      expect(typeof r.title).toBe("string");
      expect(typeof r.chunk).toBe("string");
      expect(typeof r.score).toBe("number");
    }

    // context: the agent-grounding string deckContextBuilder consumes
    expect(typeof body.context).toBe("string");
    expect(body.context.length).toBeGreaterThan(0);

    // stats: the doc inventory the route claims to have searched
    expect(body.stats.engineFileCount).toBeGreaterThan(0);
    expect(body.stats.crRuleCount).toBeGreaterThan(0);
    expect(body.stats.chunkCount).toBeGreaterThan(0);
  }, 30000);

  it("POST empty query short-circuits with the documented empty shape", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/rules-retrieval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "   " }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({ results: [], rules: [], context: "" });
  });

  // ── B1 phase 2 consolidation (2026-07-23) ────────────────────────────────
  // This route used to run its own second CR-rule pipeline (loadCr/collectRules/relatedRules,
  // keyed off ROUTE_DEFINITIONS' 16 hand-curated topics) instead of the shared, tested, more
  // capable lib/server/rulesRetrieval.js — duplicating retrieval logic while being strictly LESS
  // able: no card-name-awareness, no RulesGuru precedents, a thinner pinned-hint library. These
  // two tests are regression guards for the two things a before/after comparison against real
  // queries (not just the shape contract above) proved: (1) card-name-in-query awareness is a
  // genuinely new capability, verified live to return ZERO rules before this consolidation; (2)
  // route.js's own curated topic->anchor knowledge (ROUTE_DEFINITIONS) must still reach the final
  // rule set even though rule SELECTION no longer runs through route.js's own code — it's folded
  // into the shared engine's query text instead (see route.ruleAnchors / anchorSeed in route.js).

  it("POST recognizes a bracketed card name and grounds the answer in its rules (previously: zero rules for any card-only query)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/rules-retrieval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "[[Blood Artist]] whenever a creature dies" }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    // Blood Artist is one of rulesRetrieval.js's own pinned exemplars for the "dies" trigger rule
    // (700.4) — proves the bracketed name actually reached the shared engine's card-seeded scoring,
    // not just that the query happened to contain the word "dies".
    expect(body.rules.map((r) => r.number)).toContain("700.4");
  }, 30000);

  it("POST still surfaces a route's hand-curated rule anchors even for a query with no card name (the legend rule regression)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/rules-retrieval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "how does the legend rule work" }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    // 704.5a is the legend-rule SBA itself. rulesRetrieval.js's OWN pinned/generic hint libraries
    // have no "legend rule" pattern at all — this only survives because route.js's ROUTE_DEFINITIONS
    // anchors get folded into the query text the shared engine scores (anchorSeed in route.js). A
    // regression here means that fold-in broke, not that the shared engine's hints improved.
    expect(body.rules.map((r) => r.number)).toContain("704.5a");
  }, 30000);
});
