/**
 * /api/import-all — restore round-trip. Seed current data, restore a bundle,
 * assert the files were overwritten AND the previous data was backed up first.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

function post(body) {
  return new Request("http://localhost/api/import-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const dataFile = (name) => path.join(tmpDir, "data", name);

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "import-all-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("/api/import-all", () => {
  it("rejects a non-backup bundle with 400", async () => {
    const route = await loadRoute();
    const res = await route.POST(post({ bundle: { kind: "nope" } }));
    expect(res.status).toBe(400);
  });

  it("restores file-based sections and backs up the previous data first", async () => {
    // Seed current (old) data.
    await fs.writeFile(dataFile("decks.local.json"), JSON.stringify({ version: 1, decks: [{ id: "old" }] }), "utf8");
    await fs.writeFile(dataFile("collection.json"), JSON.stringify({ version: 1, cards: [{ name: "Old Card" }] }), "utf8");

    const bundle = {
      kind: "mtg-tool-backup",
      version: 1,
      sections: {
        decks: { version: 1, decks: [{ id: "new1" }, { id: "new2" }] },
        collection: { version: 1, cards: [{ name: "New Card" }] },
        feedback: [{ id: "f1" }], // dir-based — should be ignored
      },
    };

    const route = await loadRoute();
    const res = await route.POST(post({ bundle }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.restored.sort()).toEqual(["collection", "decks"]);
    expect(out.backedUpFiles).toBe(2);

    // Files now hold the restored data.
    const decks = JSON.parse(await fs.readFile(dataFile("decks.local.json"), "utf8"));
    expect(decks.decks).toHaveLength(2);
    const collection = JSON.parse(await fs.readFile(dataFile("collection.json"), "utf8"));
    expect(collection.cards[0].name).toBe("New Card");

    // The pre-restore backup holds the OLD data.
    const backupsRoot = path.join(tmpDir, "data", "backups");
    const dirs = await fs.readdir(backupsRoot);
    expect(dirs.some(d => d.startsWith("pre-restore-"))).toBe(true);
    const oldDecks = JSON.parse(await fs.readFile(path.join(backupsRoot, dirs[0], "decks.local.json"), "utf8"));
    expect(oldDecks.decks[0].id).toBe("old");
  });

  it("no-ops cleanly when the bundle has no file-based sections", async () => {
    const route = await loadRoute();
    const res = await route.POST(post({ bundle: { kind: "mtg-tool-backup", sections: { feedback: [{ id: "x" }] } } }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.restored).toEqual([]);
  });
});
