/**
 * Tests for /api/golden-hands — the Academy "Mulligan Reps" server half.
 *
 * The load-bearing contract here is THE ROW SCHEMA. These rows merge with the vault's
 * chat-dealt golden-hands corpus and are read by Omnath's ingest task, so a silent field
 * rename/drop would corrupt a training corpus rather than throw — nothing else would catch it.
 * Schema frozen in memory/orders/academy-mulligan-panel-runbook.md (2026-07-17).
 *
 * Also pins the dealer guardrail (Colton 2026-07-17: only 2–5 land hands are worth a rep) and
 * the verdict allowlist.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// The oracle index isn't present in a temp app-root (and must not be a CI dependency), so land-ness
// is stubbed here. The unit under test is the DEALER GUARDRAIL + the row schema, not card lookup.
// `__INDEX_MISSING__` simulates an unsynced index so the honesty path can be pinned too.
let indexMissing = false;
vi.mock("../../../lib/server/cardIndex.js", () => ({
  lookupCard: (name) => {
    if (indexMissing) return null;
    const lands = ["Forest", "Island", "Mountain", "Swamp", "Plains"];
    return {
      name,
      type_line: lands.includes(name) ? `Basic Land — ${name}` : "Creature — Test",
      oracle_text: "",
      mana_cost: lands.includes(name) ? "" : "{1}{G}",
    };
  },
}));

let route;
let tmpDir;
let originalCwd;
let profileId;

/** The exact field set the ingest side reads — order-independent, but the SET is frozen. */
const ROW_FIELDS = [
  "id", "ts", "source", "host", "profileName", "deck", "seed", "lands",
  "cards", "mullNumber", "colton", "tags", "note", "pilotLabel", "agree",
];

function postRequest(body) {
  return new Request("http://localhost/api/golden-hands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A deck whose land ratio can satisfy the 2–5 band (24/60), like a real list. */
function seedProfile(dir) {
  // Profile ids must be prof_<uuid> — paths.js rejects any other shape (path-traversal guard).
  profileId = `prof_${crypto.randomUUID()}`;
  fs.mkdirSync(path.join(dir, "data", "profiles", profileId), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "data", "profiles.json"),
    JSON.stringify({ activeProfileId: profileId, profiles: [{ id: profileId, name: "Colton" }] }),
  );
  fs.writeFileSync(
    path.join(dir, "data", "profiles", profileId, "decks.local.json"),
    JSON.stringify([{
      id: "deck_test",
      name: "Test Stompy",
      cards: [
        { name: "Forest", qty: 24 },
        { name: "Grizzly Bears", qty: 12 },
        { name: "Llanowar Elves", qty: 12 },
        { name: "Giant Growth", qty: 12 },
      ],
    }]),
  );
}

function judgmentsPath() {
  const dir = path.join(tmpDir, "data", "golden-hands");
  const file = fs.readdirSync(dir).find((f) => f.startsWith("judgments-"));
  return path.join(dir, file);
}

beforeEach(async () => {
  indexMissing = false;
  // chdir to a temp dir so rows land under <tmp>/data/ instead of the repo or real AppData.
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-golden-hands-"));
  seedProfile(tmpDir);
  process.chdir(tmpDir);
  vi.resetModules();
  route = await import("./route.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/golden-hands — decks", () => {
  it("lists the active profile's decks and the all-time counter (0 before any judgment)", async () => {
    const body = await (await route.POST(postRequest({ action: "decks" }))).json();
    expect(body.decks).toHaveLength(1);
    expect(body.decks[0]).toMatchObject({ id: "deck_test", name: "Test Stompy" });
    expect(body.allTime).toBe(0);
  });
});

describe("POST /api/golden-hands — the dealer guardrail", () => {
  it("deals 7 cards and reports the deck + a replayable seed", async () => {
    const body = await (await route.POST(postRequest({ action: "deal" }))).json();
    expect(body.cards).toHaveLength(7);
    expect(body.deck).toBe("Test Stompy");
    expect(String(body.seed).length).toBeGreaterThan(0);
  });

  it("EVERY dealt hand lands in the 2–5 land band (silent redeal — the whole point of the dealer)", async () => {
    for (let i = 0; i < 25; i++) {
      const body = await (await route.POST(postRequest({ action: "deal" }))).json();
      expect(body.guardrailExhausted).toBe(false);
      expect(body.lands).toBeGreaterThanOrEqual(2);
      expect(body.lands).toBeLessThanOrEqual(5);
    }
  });

  it("carries oracle detail for display but never invents it (unknown names degrade, not throw)", async () => {
    const body = await (await route.POST(postRequest({ action: "deal" }))).json();
    for (const c of body.cards) {
      expect(typeof c.name).toBe("string");
      expect(c).toHaveProperty("type_line");
      expect(c).toHaveProperty("oracle_text");
    }
  });

  it("404s a deckId that isn't in the profile (never silently falls back to another deck)", async () => {
    const response = await route.POST(postRequest({ action: "deal", deckId: "nope" }));
    expect(response.status).toBe(404);
  });

  it("CREED — an unsynced oracle index reports lands UNKNOWN, never a fabricated 0", async () => {
    indexMissing = true;
    const body = await (await route.POST(postRequest({ action: "deal" }))).json();
    expect(body.landsUnknown).toBe(true);
    expect(body.lands).toBeNull();               // a confident 0 would poison the corpus
    expect(body.guardrailExhausted).toBe(false); // the guardrail didn't fail — it had nothing to measure
    expect(body.unknownCards.length).toBeGreaterThan(0);
  });
});

describe("POST /api/golden-hands — judge (THE FROZEN ROW SCHEMA)", () => {
  async function judge(overrides = {}) {
    const response = await route.POST(postRequest({
      action: "judge",
      judgment: {
        colton: "keep",
        note: "two lands and an engine",
        deck: "Test Stompy",
        seed: "12345",
        lands: 3,
        cards: ["Forest", "Forest", "Forest", "Llanowar Elves", "Grizzly Bears", "Giant Growth", "Grizzly Bears"],
        ...overrides,
      },
    }));
    return { response, body: await response.json() };
  }

  it("writes a row carrying EXACTLY the frozen field set — no drift, no extras", async () => {
    await judge();
    const row = JSON.parse(fs.readFileSync(judgmentsPath(), "utf8").trim());
    expect(Object.keys(row).sort()).toEqual([...ROW_FIELDS].sort());
  });

  it("stamps the identity fields server-side and pins the v1 constants", async () => {
    await judge();
    const row = JSON.parse(fs.readFileSync(judgmentsPath(), "utf8").trim());
    expect(row.source).toBe("exe");
    expect(row.profileName).toBe("Colton");     // name, not id — ids differ per machine
    expect(row.host).toBeTruthy();
    expect(row.mullNumber).toBe(0);             // v1 is always the first 7
    expect(row.tags).toEqual([]);               // v1: ingest-derived, never a UI control
    expect(row.pilotLabel).toBeNull();          // a guessed label would poison agreement stats
    expect(row.agree).toBeNull();
    expect(row.id.startsWith("exe-")).toBe(true);
    // Local ISO WITH offset (the corpus exemplars carry offsets, not Z).
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("stores cards as NAMES ONLY (portable + engine-re-derivable), even if given objects", async () => {
    await judge({ cards: [{ name: "Forest" }, { name: "Sol Ring" }] });
    const row = JSON.parse(fs.readFileSync(judgmentsPath(), "utf8").trim());
    expect(row.cards).toEqual(["Forest", "Sol Ring"]);
  });

  it("accepts keep / ship / unplayable and rejects anything else", async () => {
    for (const verdict of ["keep", "ship", "unplayable"]) {
      const { response, body } = await judge({ colton: verdict });
      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
    }
    const bad = await route.POST(postRequest({ action: "judge", judgment: { colton: "maybe", cards: ["Forest"] } }));
    expect(bad.status).toBe(400);
  });

  it("appends (never overwrites) and reports the running all-time count", async () => {
    const a = await judge();
    const b = await judge({ colton: "ship" });
    expect(a.body.allTime).toBe(1);
    expect(b.body.allTime).toBe(2);
    expect(fs.readFileSync(judgmentsPath(), "utf8").trim().split("\n")).toHaveLength(2);
  });
});

describe("POST /api/golden-hands — misc", () => {
  it("rejects an unknown action rather than doing something surprising", async () => {
    const response = await route.POST(postRequest({ action: "bogus" }));
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await route.POST(postRequest("{not json"));
    expect(response.status).toBe(400);
  });
});
