/**
 * HB-2 pins — fresh-migration write hygiene + crash-recovery semantics.
 *
 * The fresh migration's per-profile decks.local.json writes are atomic
 * (tmp+rename, the writeRegistry idiom): a kill during the per-profile loop
 * lands BEFORE the terminal writeRegistry, and the next launch's
 * rebuildRegistryFromDirs registers whatever folders exist as live profiles —
 * so a torn/0-byte decks file would otherwise persist as silent deck loss.
 *
 * Uses process.chdir(tmpdir) so paths.js resolves data/ to a throwaway
 * location per test (matches profiles.test.js).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
const originalCwd = process.cwd();

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "profiles-hygiene-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
});

const loadProfiles = () => import("./profiles.js?bust=" + Math.random());

describe("fresh migration write hygiene (HB-2)", () => {
  it("leaves no .tmp.* files under data/ after a multi-owner migration, and every decks file parses", async () => {
    await fs.writeFile(
      path.join(workDir, "data", "decks.local.json"),
      JSON.stringify(
        {
          version: 1,
          updatedAt: "x",
          decks: [
            { id: "d1", name: "Sliver", memory: { owner: "Colton" } },
            { id: "d2", name: "Omnath", memory: { owner: "Colton" } },
            { id: "d3", name: "Kinnan", memory: { owner: "Joe" } },
          ],
        },
        null,
        2,
      ),
    );

    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();

    // Walk data/ recursively: the atomic idiom must never leave a temp file.
    const leftovers = [];
    async function walk(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (/\.tmp\./.test(entry.name)) leftovers.push(p);
      }
    }
    await walk(path.join(workDir, "data"));
    expect(leftovers).toEqual([]);

    // Every per-profile decks file is complete (parses), never torn.
    const reg = JSON.parse(await fs.readFile(path.join(workDir, "data", "profiles.json"), "utf8"));
    expect(reg.profiles.length).toBe(2);
    for (const p of reg.profiles) {
      const decksFile = JSON.parse(
        await fs.readFile(path.join(workDir, "data", "profiles", p.id, "decks.local.json"), "utf8"),
      );
      expect(Array.isArray(decksFile.decks)).toBe(true);
    }
  });

  it("registers a crash-torn folder via registry rebuild as 'Recovered profile 1' (pinned recovery semantics)", async () => {
    // Simulate a kill mid-migration: a profile folder with a 0-byte decks file
    // exists, but the terminal writeRegistry never ran (no profiles.json).
    const tornId = "prof_00000000-0000-4000-8000-000000000001";
    const tornDir = path.join(workDir, "data", "profiles", tornId);
    await fs.mkdir(tornDir, { recursive: true });
    await fs.writeFile(path.join(tornDir, "decks.local.json"), "");

    const { listProfiles } = await loadProfiles();
    const { profiles, activeProfileId } = listProfiles(); // runs ensureMigrated

    // rebuildRegistryFromDirs registers the folder (never re-migrates over it);
    // recoverProfileName can't parse the 0-byte file → positional fallback name.
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(tornId);
    expect(profiles[0].name).toBe("Recovered profile 1");
    expect(activeProfileId).toBe(tornId);
  });
});
