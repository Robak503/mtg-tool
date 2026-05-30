/**
 * /api/collection/[id] — PATCH + DELETE on a single row.
 *
 * Seeds a tmpdir collection with two rows then exercises mutations.
 * Same pattern as the parent route test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

const SEED_COLLECTION = {
  version: 1,
  updatedAt: "2026-05-27T00:00:00Z",
  cards: [
    {
      scryfallId: "scry-sol",
      oracleId: "oracle-sol",
      name: "Sol Ring",
      setCode: "c21",
      collectorNumber: "256",
      stacks: [{ finish: "nonfoil", quantity: 4, condition: "NM" }],
      addedAt: "2026-05-01T00:00:00Z",
      notes: "",
      wishlist: false,
    },
    {
      scryfallId: "scry-counter",
      oracleId: "oracle-counter",
      name: "Counterspell",
      setCode: "mh3",
      collectorNumber: "42",
      stacks: [{ finish: "foil", quantity: 0, condition: null }],
      addedAt: "2026-05-15T00:00:00Z",
      notes: "want foil",
      wishlist: true,
    },
  ],
};

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

function patchRequest(id, body) {
  return new Request(`http://localhost/api/collection/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(id) {
  return new Request(`http://localhost/api/collection/${id}`, { method: "DELETE" });
}

function ctxWith(id) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "collection-id-route-test-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "collection.json"),
    JSON.stringify(SEED_COLLECTION),
    "utf8",
  );
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("module load", () => {
  it("imports without throwing", async () => {
    await expect(loadRoute()).resolves.toBeDefined();
  });

  it("exports PATCH and DELETE", () => {
    expect(typeof route.PATCH).toBe("function");
    expect(typeof route.DELETE).toBe("function");
  });
});

describe("PATCH /api/collection/[id]", () => {
  it("updates stacks (replace, not merge)", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", {
        stacks: [
          { finish: "nonfoil", quantity: 2, condition: "LP" },
          { finish: "foil",    quantity: 1, condition: "NM" },
        ],
      }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const sol = body.collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.stacks).toEqual([
      { finish: "nonfoil", quantity: 2, condition: "LP" },
      { finish: "foil",    quantity: 1, condition: "NM" },
    ]);
  });

  it("updates only notes when only notes is provided", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { notes: "Promo from FNM" }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const sol = body.collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.notes).toBe("Promo from FNM");
    // Stacks unchanged
    expect(sol.stacks).toEqual([{ finish: "nonfoil", quantity: 4, condition: "NM" }]);
  });

  it("auto-flips wishlist=false when stacks gain quantity", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-counter", {
        stacks: [{ finish: "foil", quantity: 1, condition: "NM" }],
      }),
      ctxWith("scry-counter"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const counter = body.collection.cards.find(c => c.scryfallId === "scry-counter");
    expect(counter.wishlist).toBe(false);
    expect(counter.stacks[0].quantity).toBe(1);
  });

  it("keeps wishlist=true if the caller explicitly sets it even with quantity > 0", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-counter", {
        stacks: [{ finish: "foil", quantity: 1, condition: "NM" }],
        wishlist: true,
      }),
      ctxWith("scry-counter"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const counter = body.collection.cards.find(c => c.scryfallId === "scry-counter");
    expect(counter.wishlist).toBe(true);
  });

  it("returns 404 for unknown scryfallId", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-ghost", { notes: "x" }),
      ctxWith("scry-ghost"),
    );
    expect(resp.status).toBe(404);
  });

  it("rejects empty body with 400", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", {}),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/mutable/i);
  });

  it("rejects invalid stack finish with 400", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { stacks: [{ finish: "purple", quantity: 1 }] }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects non-string notes with 400", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { notes: 42 }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects non-boolean wishlist with 400", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { wishlist: "yes" }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
  });

  it("assigns a colorTagId on its own", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { colorTagId: "have" }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const sol = body.collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.colorTagId).toBe("have");
    // Other fields untouched
    expect(sol.stacks).toEqual([{ finish: "nonfoil", quantity: 4, condition: "NM" }]);
  });

  it("clears a colorTagId when set to null", async () => {
    await route.PATCH(patchRequest("scry-sol", { colorTagId: "have" }), ctxWith("scry-sol"));
    const resp = await route.PATCH(
      patchRequest("scry-sol", { colorTagId: null }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const sol = body.collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.colorTagId).toBeNull();
  });

  it("rejects a non-string, non-null colorTagId with 400", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { colorTagId: 7 }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
  });
});

describe("DELETE /api/collection/[id]", () => {
  it("removes the row by scryfallId", async () => {
    const resp = await route.DELETE(deleteRequest("scry-sol"), ctxWith("scry-sol"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.removed).toBe("Sol Ring");
    expect(body.collection.cards).toHaveLength(1);
    expect(body.collection.cards[0].scryfallId).toBe("scry-counter");
  });

  it("returns 404 for unknown id", async () => {
    const resp = await route.DELETE(deleteRequest("scry-ghost"), ctxWith("scry-ghost"));
    expect(resp.status).toBe(404);
  });
});
