/**
 * Smoke + contract test for /api/pod-balance.
 *
 * Per CLAUDE.md gotcha #10, every route gets at least an import smoke test.
 * rankDeckPower needs the local Oracle index; in a data-less CI checkout it
 * throws ENOENT, which the route turns into a 503. So the invariant we assert
 * is: the route never throws past producing a Response, and a valid request
 * yields either a 200 with the {ready, decks} contract or a 503 sync hint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("/api/pod-balance — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports a POST handler", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.POST).toBe("function");
  });

  it("rejects a body without a decks array (400)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/pod-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns a Response for a valid request (200 ranked, or 503 if data missing)", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/pod-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decks: [
          { id: "a", name: "Deck A", cards: [{ qty: 1, name: "Sol Ring", section: "Mainboard" }] },
        ],
      }),
    });
    const resp = await mod.POST(req);
    expect(resp).toBeInstanceOf(Response);
    expect([200, 503]).toContain(resp.status);
    const body = await resp.json();
    if (resp.status === 200) {
      expect(body.ready).toBe(true);
      expect(Array.isArray(body.decks)).toBe(true);
      expect(body.decks[0]).toHaveProperty("bracket");
      expect(body.decks[0]).toHaveProperty("powerLevel");
      // Single deck → no comparison verdict.
      expect(body.comparison).toBeNull();
    } else {
      expect(body.ready).toBe(false);
    }
    // Generous timeout: loads the oracle index when data is present locally;
    // can exceed 5s under full-suite parallelism. Fast 503 in data-less CI.
  }, 30000);
});

/**
 * W2: the deckIds + allProfiles path — deck bodies load server-side from the
 * on-disk profile files (the same pool /api/self-play resolves from).
 *
 * Fixture: tmpdir + process.chdir (paths.js resolves lazily per call) with a
 * profiles registry spanning TWO profiles. rankDeckPower is doMock'd (per-test
 * module registry, so the legacy smoke tests above keep hitting the real ranker)
 * because these tests pin the ROUTE's resolution/shape contract, not the ranker,
 * and must pass in a data-less checkout with no oracle index.
 */
describe("/api/pod-balance — deckIds + allProfiles (cross-profile pods)", () => {
  const PROF_A = "prof_11111111-1111-4111-8111-111111111111"; // "Colton" (active)
  const PROF_B = "prof_22222222-2222-4222-8222-222222222222"; // "Joe"
  let tmpDir;
  let originalCwd;
  let route;

  const deck = (id, name, cardCount) => ({
    id,
    name,
    cards: Array.from({ length: cardCount }, () => ({ qty: 1, name: "Forest", section: "Mainboard" })),
  });

  const postReq = (body) =>
    new Request("http://localhost/api/pod-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pod-balance-test-"));
    const dataDir = path.join(tmpDir, "data");
    await fs.mkdir(path.join(dataDir, "profiles", PROF_A), { recursive: true });
    await fs.mkdir(path.join(dataDir, "profiles", PROF_B), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "profiles.json"),
      JSON.stringify({
        version: 1,
        activeProfileId: PROF_A,
        profiles: [
          { id: PROF_A, name: "Colton" },
          { id: PROF_B, name: "Joe" },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(dataDir, "profiles", PROF_A, "decks.local.json"),
      JSON.stringify({ version: 1, decks: [deck("a1", "Mild", 1), deck("a2", "Spicy", 3)] }),
      "utf8",
    );
    await fs.writeFile(
      path.join(dataDir, "profiles", PROF_B, "decks.local.json"),
      JSON.stringify({ version: 1, decks: [deck("b1", "Joe One", 2), deck("b2", "Joe Two", 1), deck("b3", "Joe Three", 1)] }),
      "utf8",
    );

    originalCwd = process.cwd();
    process.chdir(tmpDir);
    vi.resetModules();
    // Deterministic stand-in: power/bracket derive from card count so the
    // comparison verdict logic is exercised without the oracle index.
    vi.doMock("../../../lib/server/powerRanker.js", () => ({
      rankDeckPower: ({ cards }) => {
        const n = Array.isArray(cards) ? cards.length : 0;
        return {
          powerLevel: n + 3,
          bracket: Math.min(5, Math.max(1, n)),
          bracketLabel: "Test",
          bracketReason: "test fixture",
          confidence: "high",
          axes: { speed: 1, consistency: 1, interaction: 1, resilience: 1, manaQuality: 1 },
          attributeRatings: {},
          spellbook: { gameChangers: [], massLandDenial: [], extraTurns: [] },
          commanderColors: [],
          commanderNames: [],
          totalCards: n,
          unresolvedCards: [],
        };
      },
    }));
    route = await import("./route.js");
  });

  afterEach(async () => {
    vi.doUnmock("../../../lib/server/powerRanker.js");
    vi.resetModules();
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("resolves deckIds across every profile and tags each deck with its owning profile", async () => {
    const resp = await route.POST(postReq({ deckIds: ["a1", "b1"], allProfiles: true }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ready).toBe(true);
    expect(body.decks).toHaveLength(2);
    const a1 = body.decks.find((d) => d.id === "a1");
    const b1 = body.decks.find((d) => d.id === "b1");
    expect(a1.profile).toBe("Colton");
    expect(b1.profile).toBe("Joe");
    expect(a1.powerLevel).toBe(4); // 1 card + 3 (mock)
    expect(b1.powerLevel).toBe(5); // 2 cards + 3 (mock)
    expect(a1).toHaveProperty("bracket");
    expect(body.comparison).not.toBeNull();
    expect(["balanced", "slight", "lopsided"]).toContain(body.comparison.severity);
  });

  it("400s when no deckIds match a saved deck", async () => {
    const resp = await route.POST(postReq({ deckIds: ["nope"], allProfiles: true }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.ready).toBe(false);
  });

  it("caps a >4 deckIds selection at 4 (a pod is 4)", async () => {
    const resp = await route.POST(postReq({ deckIds: ["a1", "a2", "b1", "b2", "b3"], allProfiles: true }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.decks).toHaveLength(4);
    expect(body.decks.map((d) => d.id)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("without allProfiles, deckIds resolve from the ACTIVE profile only (no profile tag)", async () => {
    const resp = await route.POST(postReq({ deckIds: ["a1", "b1"] }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.decks).toHaveLength(1); // b1 belongs to Joe's profile — not in the active pool
    expect(body.decks[0].id).toBe("a1");
    expect(body.decks[0].profile).toBeNull();
    expect(body.comparison).toBeNull(); // single deck → no verdict
  });

  it("legacy {decks} bodies keep working unchanged alongside the new path", async () => {
    const resp = await route.POST(postReq({ decks: [deck("x", "Legacy", 2)] }));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ready).toBe(true);
    expect(body.decks).toHaveLength(1);
    expect(body.decks[0]).toHaveProperty("powerLevel");
    expect(body.decks[0]).toHaveProperty("bracket");
    // Legacy path ships deck bodies from the client — no server-side profile tag.
    expect(body.decks[0]).not.toHaveProperty("profile");
    expect(body.comparison).toBeNull();
  });
});
