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

// Printings of Sol Ring (plus one other card for the same-card guard).
// Written per-test to data/scryfall-bulk/printings-index.json; the route's
// printingIndex module is re-imported fresh via vi.resetModules().
const SEED_PRINTINGS = {
  generatedAt: "2026-07-04T00:00:00Z",
  cards: [
    {
      id: "scry-sol", oracleId: "oracle-sol", name: "Sol Ring",
      set: "c21", setName: "Commander 2021", collectorNumber: "256",
      finishes: ["nonfoil", "foil"], foilTypes: [],
      artCropUrl: "https://cards.scryfall.io/art_crop/front/s/o/sol-c21.jpg",
      prices: { usd: "1.50", usdFoil: "4.00", usdEtched: null },
      releasedAt: "2021-04-23",
    },
    {
      id: "scry-sol-lci", oracleId: "oracle-sol", name: "Sol Ring",
      set: "lci", setName: "Lost Caverns Special Guests", collectorNumber: "12",
      finishes: ["nonfoil", "foil"], foilTypes: [],
      artCropUrl: "https://cards.scryfall.io/art_crop/front/s/o/sol-lci.jpg",
      prices: { usd: "9.99", usdFoil: "30.00", usdEtched: null },
      releasedAt: "2023-11-17",
    },
    {
      id: "scry-sol-etched", oracleId: "oracle-sol", name: "Sol Ring",
      set: "cmr", setName: "Commander Legends", collectorNumber: "700",
      finishes: ["etched"], foilTypes: [],
      artCropUrl: "https://cards.scryfall.io/art_crop/front/s/o/sol-cmr.jpg",
      prices: { usd: null, usdFoil: null, usdEtched: "12.00" },
      releasedAt: "2020-11-20",
    },
    {
      id: "scry-bolt", oracleId: "oracle-bolt", name: "Lightning Bolt",
      set: "2xm", setName: "Double Masters", collectorNumber: "117",
      finishes: ["nonfoil", "foil"], foilTypes: [],
      artCropUrl: "https://cards.scryfall.io/art_crop/front/b/o/bolt-2xm.jpg",
      prices: { usd: "2.00", usdFoil: "5.00", usdEtched: null },
      releasedAt: "2020-08-07",
    },
  ],
};

async function seedPrintingsIndex() {
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "scryfall-bulk", "printings-index.json"),
    JSON.stringify(SEED_PRINTINGS),
    "utf8",
  );
}

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

describe("PATCH /api/collection/[id] — C5-P1.4 acquisition fields", () => {
  it("persists a per-stack acquiredAt and a per-row language, and round-trips them", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", {
        stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM", paidUsd: 12.5, acquiredAt: "2026-03-14" }],
        language: "ja",
      }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const sol = (await resp.json()).collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.stacks[0]).toMatchObject({ finish: "nonfoil", quantity: 1, paidUsd: 12.5, acquiredAt: "2026-03-14" });
    expect(sol.language).toBe("ja");
  });

  it("clearing language (null) drops the field so the reader falls back to English", async () => {
    await route.PATCH(patchRequest("scry-sol", { language: "de" }), ctxWith("scry-sol"));
    const resp = await route.PATCH(patchRequest("scry-sol", { language: null }), ctxWith("scry-sol"));
    const sol = (await resp.json()).collection.cards.find(c => c.scryfallId === "scry-sol");
    expect("language" in sol).toBe(false);
  });

  it("rejects a non-string language", async () => {
    const resp = await route.PATCH(patchRequest("scry-sol", { language: 42 }), ctxWith("scry-sol"));
    expect(resp.status).toBe(400);
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

describe("PATCH printing move", () => {
  it("re-points a row at another printing of the same card", async () => {
    await seedPrintingsIndex();
    route = await loadRoute();
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-sol-lci" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.movedTo).toBe("scry-sol-lci");
    const moved = body.collection.cards.find(c => c.scryfallId === "scry-sol-lci");
    expect(moved).toBeDefined();
    expect(moved.setCode).toBe("lci");
    expect(moved.collectorNumber).toBe("12");
    expect(moved.artCropUrl).toContain("sol-lci");
    expect(moved.prices.usd).toBe("9.99");
    expect(moved.stacks).toEqual([{ finish: "nonfoil", quantity: 4, condition: "NM" }]);
    expect(body.collection.cards.find(c => c.scryfallId === "scry-sol")).toBeUndefined();
  });

  it("folds into an existing row when the target printing is already owned", async () => {
    await seedPrintingsIndex();
    // Seed a second Sol Ring row that already sits on the target printing.
    const withDup = {
      ...SEED_COLLECTION,
      cards: [
        ...SEED_COLLECTION.cards,
        {
          scryfallId: "scry-sol-lci", oracleId: "oracle-sol", name: "Sol Ring",
          setCode: "lci", collectorNumber: "12",
          stacks: [{ finish: "foil", quantity: 1, condition: "NM" }],
          addedAt: "2026-06-01T00:00:00Z", notes: "special guests", wishlist: false,
        },
      ],
    };
    await fs.writeFile(path.join(tmpDir, "data", "collection.json"), JSON.stringify(withDup), "utf8");
    route = await loadRoute();
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-sol-lci" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.merged).toBe(true);
    const rows = body.collection.cards.filter(c => c.scryfallId === "scry-sol-lci");
    expect(rows).toHaveLength(1);
    // foil 1 (already there) + moved nonfoil 4 → two stacks on one row.
    expect(rows[0].stacks).toEqual([
      { finish: "foil", quantity: 1, condition: "NM" },
      { finish: "nonfoil", quantity: 4, condition: "NM" },
    ]);
    expect(body.collection.cards.find(c => c.scryfallId === "scry-sol")).toBeUndefined();
  });

  it("rejects a move to a different card", async () => {
    await seedPrintingsIndex();
    route = await loadRoute();
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-bolt" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/different card/i);
  });

  it("rejects a move when a stack finish doesn't exist for the target printing", async () => {
    await seedPrintingsIndex();
    route = await loadRoute();
    // Row has a nonfoil stack; the CMR printing is etched-only in paper.
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-sol-etched" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/no nonfoil/i);
  });

  it("applies stacks first, so one PATCH can fix finish and move together", async () => {
    await seedPrintingsIndex();
    route = await loadRoute();
    const resp = await route.PATCH(
      patchRequest("scry-sol", {
        stacks: [{ finish: "etched", quantity: 1, condition: "NM" }],
        printing: { scryfallId: "scry-sol-etched" },
      }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const moved = body.collection.cards.find(c => c.scryfallId === "scry-sol-etched");
    expect(moved.stacks).toEqual([{ finish: "etched", quantity: 1, condition: "NM" }]);
  });

  it("400s with a sync hint when the printings index is missing", async () => {
    // No seedPrintingsIndex() — lookup throws ENOENT.
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-sol-lci" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/index not built/i);
  });

  it("rejects a malformed printing payload", async () => {
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: "scry-sol-lci" }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/printing must be an object/i);
  });

  it("is a no-op when moving to the printing the row already has", async () => {
    await seedPrintingsIndex();
    route = await loadRoute();
    const resp = await route.PATCH(
      patchRequest("scry-sol", { printing: { scryfallId: "scry-sol" } }),
      ctxWith("scry-sol"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const sol = body.collection.cards.find(c => c.scryfallId === "scry-sol");
    expect(sol.setCode).toBe("c21");
    expect(sol.stacks).toEqual([{ finish: "nonfoil", quantity: 4, condition: "NM" }]);
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
