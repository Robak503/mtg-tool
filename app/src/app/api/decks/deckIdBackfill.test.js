/**
 * deckIdBackfill.test.js — every saved deck gets a stable, unique id (2026-10-21).
 *
 * The owner's library held 8 decks and only 2 had an `id`: the other 6 were saved by a writer that
 * posted the import preview's `{ name, format, source, cards }` shape plus `memory` and no id, and
 * /api/decks stored them as sent. Everything that picks a deck keys it by id, so the Academy could not
 * start a game with any of the 6. These tests pin the fix in the route:
 *   - GET gives each id-less deck a derived id and rewrites the file ONCE (atomic), keeping a
 *     timestamped backup of the original beside it in the profile's backups/ folder;
 *   - the ids are stable (a second GET, a restart, a redo from the backup all land on the same ids),
 *     unique (two decks with the same name differ), and an existing id is never changed;
 *   - POST stamps an id on any id-less deck it is sent (the path the 6 came in by).
 *
 * tmpdir + process.chdir, exactly like route.test.js: paths.js resolves the profile under the temp tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

const dataDirPath = () => path.join(tmpDir, "data");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function activeProfileDir() {
  const reg = JSON.parse(await fs.readFile(path.join(dataDirPath(), "profiles.json"), "utf8"));
  return path.join(dataDirPath(), "profiles", reg.activeProfileId);
}
async function deckFilePath() {
  return path.join(await activeProfileDir(), "decks.local.json");
}
async function backupFiles(profileDir) {
  try {
    return (await fs.readdir(path.join(profileDir ?? (await activeProfileDir()), "backups"))).sort();
  } catch (error) {
    if (error.code === "ENOENT") return []; // no backup was ever made
    throw error;
  }
}
function postReq(body) {
  return new Request("http://localhost/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function getDecks() {
  const resp = await route.GET();
  expect(resp.status).toBe(200);
  return (await resp.json()).decks;
}

// The owner's SHAPE (names invented): two decks saved by the app with an id, six saved by the
// outside writer — the import preview's key order, cards carrying oracleId/resolved, no id.
const cards = (commander) => [
  { name: commander, qty: 1, section: "Commander", oracleId: "o-cmd", resolved: true },
  { name: "Forest", qty: 40, section: "Mainboard", oracleId: "o-forest", resolved: true },
];
const withId = (id, name) => ({ id, name, format: "commander", cards: cards(`${name} Commander`), memory: { owner: "Colton" }, source: "archidekt:1" });
const noId = (name) => ({ name, format: "commander", source: "archidekt:2", cards: cards(`${name} Commander`), memory: { owner: "Colton", notes: "" } });
const OWNER_SHAPE = [
  withId("deck_mana_ramp_aaaa1111", "Mana Ramp"),
  noId("Treasure Aristocrats"),
  noId("cdh"),
  noId("Hive Mind"),
  noId("X Spells"),
  noId("Cantrip Storm"),
  noId("Turtle Attack"),
  withId("deck_squirrels_bbbb2222", "Squirrel Army"),
];

async function seedLibrary(decks) {
  await route.GET(); // migrate: the active profile + its folder exist
  const target = await deckFilePath();
  const body = JSON.stringify({ version: 1, updatedAt: "2026-09-03T06:16:09.579Z", decks }, null, 2);
  await fs.writeFile(target, body, "utf8");
  return { target, body };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-ids-test-"));
  await fs.mkdir(dataDirPath(), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  vi.resetModules();
  route = await import("./route.js");
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("GET /api/decks — the one-time id backfill", () => {
  it("every id-less deck comes back with an id; the two existing ids are unchanged; all ids are distinct", async () => {
    await seedLibrary(OWNER_SHAPE);
    const decks = await getDecks();
    expect(decks.map((d) => d.name)).toEqual(OWNER_SHAPE.map((d) => d.name)); // nothing added, dropped or reordered
    for (const d of decks) expect(typeof d.id === "string" && d.id.trim() !== "", `${d.name} has an id`).toBe(true);
    expect(decks[0].id).toBe("deck_mana_ramp_aaaa1111");
    expect(decks[7].id).toBe("deck_squirrels_bbbb2222");
    expect(new Set(decks.map((d) => d.id)).size).toBe(8);
    expect(decks[1].id).toMatch(/^deck_treasure_aristocrats_[0-9a-z]{8}$/);
  });

  it("rewrites the file once, keeping a timestamped backup of the original bytes in backups/", async () => {
    const { target, body } = await seedLibrary(OWNER_SHAPE);
    const decks = await getDecks();

    const onDisk = JSON.parse(await fs.readFile(target, "utf8"));
    expect(onDisk.decks.map((d) => d.id)).toEqual(decks.map((d) => d.id)); // persisted, not only served
    expect(onDisk.version).toBe(1);
    // Only the ids were added: each deck is otherwise exactly what was on disk.
    onDisk.decks.forEach((d, i) => {
      const { id, ...rest } = d;
      expect(id).toBeTruthy();
      expect(rest).toEqual(Object.fromEntries(Object.entries(OWNER_SHAPE[i]).filter(([k]) => k !== "id")));
    });

    const backups = (await backupFiles()).filter((f) => f.includes("deck-id-backfill"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^decks\.local\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.deck-id-backfill\.json$/);
    const kept = await fs.readFile(path.join(await activeProfileDir(), "backups", backups[0]), "utf8");
    expect(sha(kept)).toBe(sha(body)); // the original file, byte for byte

    const files = await fs.readdir(await activeProfileDir());
    expect(files.some((f) => f.includes(".tmp"))).toBe(false); // atomic writer: no temp left behind
  });

  it("is idempotent: a second GET serves the same ids and writes nothing (no new backup, same bytes)", async () => {
    const { target } = await seedLibrary(OWNER_SHAPE);
    const first = await getDecks();
    const afterFirst = await fs.readFile(target, "utf8");
    const backupsAfterFirst = await backupFiles();
    expect(backupsAfterFirst.some((f) => f.includes("deck-id-backfill"))).toBe(true);

    const second = await getDecks();
    expect(second.map((d) => d.id)).toEqual(first.map((d) => d.id));
    expect(await fs.readFile(target, "utf8")).toBe(afterFirst);
    expect(await backupFiles()).toEqual(backupsAfterFirst);
  });

  it("survives a restart: a fresh server process serves the same ids", async () => {
    await seedLibrary(OWNER_SHAPE);
    const before = (await getDecks()).map((d) => d.id);
    vi.resetModules();
    route = await import("./route.js");
    const after = (await getDecks()).map((d) => d.id);
    expect(after).toEqual(before);
    expect(after.every(Boolean)).toBe(true);
  });

  it("is deterministic: redone from the backup, the backfill lands on the ids it wrote the first time", async () => {
    const { target } = await seedLibrary(OWNER_SHAPE);
    const first = (await getDecks()).map((d) => d.id);
    const backup = (await backupFiles()).find((f) => f.includes("deck-id-backfill"));
    expect(backup, "the backfill kept a backup").toBeTruthy();
    await fs.copyFile(path.join(await activeProfileDir(), "backups", backup), target); // the original, id-less again
    const redone = (await getDecks()).map((d) => d.id);
    expect(redone).toEqual(first);
    expect(redone.every(Boolean)).toBe(true);
  });

  it("two decks with the same name (and owner) get different ids", async () => {
    await seedLibrary([noId("Twin Brew"), noId("Twin Brew"), noId("Twin Brew")]);
    const decks = await getDecks();
    const ids = decks.map((d) => d.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it("a derived id that would collide with an existing id takes a suffix; the existing id is kept", async () => {
    // First learn what "Echo" derives in this profile, then plant that exact id on another deck.
    await seedLibrary([noId("Echo")]);
    const derived = (await getDecks())[0].id;
    expect(typeof derived, "the deck was given an id").toBe("string");
    expect(derived).toMatch(/^deck_echo_[0-9a-z]{8}$/);
    await fs.writeFile(await deckFilePath(), JSON.stringify({ version: 1, decks: [withId(derived, "Squatter"), noId("Echo")] }), "utf8");
    const decks = await getDecks();
    expect(decks[0].id).toBe(derived);
    expect(decks[1].id).toBe(`${derived}_2`);
  });

  it("a library whose decks all have ids is left alone: no write, no backup (control)", async () => {
    const { target, body } = await seedLibrary([withId("a-1", "Alpha"), withId("b-2", "Beta")]);
    const decks = await getDecks();
    expect(decks.map((d) => d.id)).toEqual(["a-1", "b-2"]);
    expect(await fs.readFile(target, "utf8")).toBe(body);
    expect((await backupFiles()).some((f) => f.includes("deck-id-backfill"))).toBe(false);
  });

  it("a failed backfill write is logged, not hidden — and the decks are still served with their ids", async () => {
    const { target, body } = await seedLibrary(OWNER_SHAPE);
    // backups/ is a FILE, so the backup can't be made; the backfill must then not rewrite the deck file.
    await fs.writeFile(path.join(await activeProfileDir(), "backups"), "not a folder", "utf8");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const decks = await getDecks();
    expect(decks.every((d) => typeof d.id === "string" && d.id !== "")).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe(body); // untouched without its backup
    expect(errors.mock.calls.some((c) => String(c[0]).includes("[decks]") && String(c[0]).includes("id"))).toBe(true);
    // ... and once the backup can be made, the next read persists the SAME ids.
    await fs.rm(path.join(await activeProfileDir(), "backups"));
    const retried = await getDecks();
    expect(retried.map((d) => d.id)).toEqual(decks.map((d) => d.id));
    expect(JSON.parse(await fs.readFile(target, "utf8")).decks.map((d) => d.id)).toEqual(decks.map((d) => d.id));
  });

  it("every other profile's id-less decks get their ids at the first read too, each with a backup in its own folder", async () => {
    await route.GET(); // migrate: the active profile exists
    const { createProfile } = await import("../../../lib/server/profiles.js");
    const other = createProfile("Second Player");
    const otherDir = path.join(dataDirPath(), "profiles", other.id);
    const otherFile = path.join(otherDir, "decks.local.json");
    const otherBody = JSON.stringify({ version: 1, decks: [noId("Shared Name"), noId("Only Here"), withId("has-1", "Has One")] }, null, 2);
    await fs.writeFile(otherFile, otherBody, "utf8");
    await fs.writeFile(await deckFilePath(), JSON.stringify({ version: 1, decks: [noId("Shared Name")] }), "utf8");
    vi.resetModules(); // a server start: the sweep runs once per process
    route = await import("./route.js");

    const active = await getDecks();
    const onDisk = JSON.parse(await fs.readFile(otherFile, "utf8"));
    for (const d of onDisk.decks) expect(typeof d.id === "string" && d.id !== "", `${d.name} has an id`).toBe(true);
    expect(onDisk.decks[2].id).toBe("has-1");
    expect(onDisk.decks[0].id).not.toBe(active[0].id); // the same owner + name derives per profile
    const kept = (await backupFiles(otherDir)).filter((f) => f.includes("deck-id-backfill"));
    expect(kept).toHaveLength(1);
    expect(sha(await fs.readFile(path.join(otherDir, "backups", kept[0]), "utf8"))).toBe(sha(otherBody));

    // The cross-profile list the Sim Center / Pod Balance pickers read now has an id on every deck.
    const { listAllProfileDecks } = await import("../../../lib/server/selfPlayDecks.js");
    const all = await listAllProfileDecks();
    expect(all).toHaveLength(4);
    expect(all.every((d) => typeof d.id === "string" && d.id !== "")).toBe(true);
    expect(new Set(all.map((d) => d.id)).size).toBe(4);

    // ... and that profile's own read later serves the same ids, with nothing left to write.
    const before = await fs.readFile(otherFile, "utf8");
    const { setActiveProfile } = await import("../../../lib/server/profiles.js");
    setActiveProfile(other.id);
    expect((await getDecks()).map((d) => d.id)).toEqual(onDisk.decks.map((d) => d.id));
    expect(await fs.readFile(otherFile, "utf8")).toBe(before);
  });

  it("an empty fresh profile writes nothing (control)", async () => {
    const decks = await getDecks();
    expect(decks).toEqual([]);
    expect(await backupFiles()).toEqual([]);
  });
});

describe("POST /api/decks — a deck saved without an id gets one", () => {
  it("stamps ids on id-less decks (the import preview's shape) and keeps an existing id", async () => {
    await route.GET();
    const resp = await route.POST(postReq({ decks: [withId("kept-1", "Kept"), noId("Posted Without Id")] }));
    expect(resp.status).toBe(200);
    const saved = (await resp.json()).decks;
    expect(saved[0].id).toBe("kept-1");
    expect(typeof saved[1].id, "the posted deck was given an id").toBe("string");
    expect(saved[1].id).toMatch(/^deck_posted_without_id_[0-9a-z]{8}$/);
    const onDisk = JSON.parse(await fs.readFile(await deckFilePath(), "utf8"));
    expect(onDisk.decks.map((d) => d.id)).toEqual(saved.map((d) => d.id));
  });

  it("re-posting the same id-less library (an outside script, a window opened before the fix) lands on the same ids", async () => {
    await route.GET();
    const library = [noId("Repost A"), noId("Repost B"), noId("Repost A")];
    const first = (await (await route.POST(postReq({ decks: library }))).json()).decks.map((d) => d.id);
    const second = (await (await route.POST(postReq({ decks: library }))).json()).decks.map((d) => d.id);
    expect(first.every(Boolean)).toBe(true);
    expect(new Set(first).size).toBe(3);
    expect(second).toEqual(first);
  });

  it("what GET backfills and what a re-post of the original stamps are the same ids", async () => {
    await seedLibrary(OWNER_SHAPE);
    const backfilled = (await getDecks()).map((d) => d.id);
    const reposted = (await (await route.POST(postReq({ decks: OWNER_SHAPE }))).json()).decks.map((d) => d.id);
    expect(backfilled.every(Boolean)).toBe(true);
    expect(reposted).toEqual(backfilled);
  });

  it("a POST of decks that all have ids saves them as sent (control)", async () => {
    await route.GET();
    const saved = (await (await route.POST(postReq({ decks: [withId("x-1", "X"), withId("y-2", "Y")] }))).json()).decks;
    expect(saved.map((d) => d.id)).toEqual(["x-1", "y-2"]);
  });
});
