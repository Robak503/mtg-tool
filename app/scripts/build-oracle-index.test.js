/**
 * Tests for scripts/build-oracle-index.cjs — happy path + missing-input error.
 *
 * Strategy: spawn the script with execFileSync, point it at a fixture
 * oracle_cards.json via a per-test cwd, and assert the emitted slim index.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "build-oracle-index.cjs");

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "build-oracle-index-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

async function writeFixture(cards) {
  const sourceFile = path.join(tmpDir, "data", "scryfall-bulk", "oracle_cards.json");
  await fs.writeFile(sourceFile, JSON.stringify(cards));
  return sourceFile;
}

async function readIndex() {
  const indexFile = path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json");
  const raw = await fs.readFile(indexFile, "utf8");
  return JSON.parse(raw);
}

function runScript() {
  // The script uses path.resolve(__dirname, "..") to find the data dir; we
  // override that by setting cwd. The script's __dirname is the scripts/
  // folder it lives in (always app/scripts), so we copy it into tmpDir/scripts
  // for the cwd switch to also realign the data dir.
  return execFileSync(process.execPath, [SCRIPT], {
    cwd: tmpDir,
    env: { ...process.env, MTG_OVERRIDE_REPO_ROOT: tmpDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("happy path", () => {
  it("emits the slim index with the expected fields and excludes art_series", async () => {
    await writeFixture([
      {
        name: "Lightning Bolt",
        oracle_id: "oracle-bolt",
        type_line: "Instant",
        oracle_text: "Lightning Bolt deals 3 damage to any target.",
        mana_cost: "{R}",
        cmc: 1,
        color_identity: ["R"],
        legalities: { commander: "legal" },
        layout: "normal",
        keywords: [],
      },
      {
        name: "Delver of Secrets // Insectile Aberration",
        oracle_id: "oracle-delver",
        type_line: "Creature — Human Wizard",
        layout: "transform",
        cmc: 1,
        color_identity: ["U"],
        legalities: { commander: "legal" },
        card_faces: [
          { name: "Delver of Secrets", type_line: "Creature", oracle_text: "Look at the top card...", power: "1", toughness: "1" },
          { name: "Insectile Aberration", type_line: "Creature", oracle_text: "Flying", power: "3", toughness: "2" },
        ],
      },
      {
        // Engine-critical fields (P/T, colors, produced_mana, loyalty) MUST survive the slim
        // pass — they feed combat + the CR-613 layer engine via learnDeckEnrich. Dropping
        // them silently made every enriched creature 0/0 in real play (live-QA find 2026-06-16).
        name: "Grizzly Bears",
        oracle_id: "oracle-bears",
        type_line: "Creature — Bear",
        oracle_text: "",
        mana_cost: "{1}{G}",
        cmc: 2,
        power: "2",
        toughness: "2",
        colors: ["G"],
        produced_mana: [],
        color_identity: ["G"],
        legalities: { commander: "legal" },
        layout: "normal",
        keywords: [],
      },
      {
        name: "Some Art",
        layout: "art_series",
        oracle_id: "art-id",
      },
    ]);

    // Copy script into tmp scripts dir so relative path resolution works.
    await fs.mkdir(path.join(tmpDir, "scripts"), { recursive: true });
    await fs.copyFile(SCRIPT, path.join(tmpDir, "scripts", "build-oracle-index.cjs"));

    execFileSync(process.execPath, [path.join(tmpDir, "scripts", "build-oracle-index.cjs")], {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const index = await readIndex();
    expect(index.count).toBe(3);
    expect(index.sourceCount).toBe(4);
    expect(index.cards.map(c => c.name)).toContain("Lightning Bolt");
    expect(index.cards.map(c => c.name)).toContain("Delver of Secrets // Insectile Aberration");
    expect(index.cards.find(c => c.name === "Some Art")).toBeUndefined();

    const bolt = index.cards.find(c => c.name === "Lightning Bolt");
    expect(bolt.oracle_text).toMatch(/3 damage/);
    expect(bolt.color_identity).toEqual(["R"]);
    expect(bolt.legalities.commander).toBe("legal");
    // A noncreature has no P/T — null, never undefined-dropped.
    expect(bolt.power).toBeNull();
    expect(bolt.toughness).toBeNull();

    const delver = index.cards.find(c => c.name === "Delver of Secrets // Insectile Aberration");
    expect(delver.card_faces).toHaveLength(2);
    expect(delver.card_faces[0].name).toBe("Delver of Secrets");
    // A DFC creature's P/T lives on the face — it must survive the slim pass.
    expect(delver.card_faces[0].power).toBe("1");
    expect(delver.card_faces[1].power).toBe("3");

    // Engine-critical base fields the layer engine + combat read off the enriched card.
    const bears = index.cards.find(c => c.name === "Grizzly Bears");
    expect(bears.power).toBe("2");
    expect(bears.toughness).toBe("2");
    expect(bears.colors).toEqual(["G"]);
    expect(bears).toHaveProperty("produced_mana");
    expect(bears).toHaveProperty("loyalty", null);
  });
});

describe("missing input file", () => {
  it("exits with a non-zero code and a meaningful error message", async () => {
    await fs.mkdir(path.join(tmpDir, "scripts"), { recursive: true });
    await fs.copyFile(SCRIPT, path.join(tmpDir, "scripts", "build-oracle-index.cjs"));
    // No oracle_cards.json written → script should fail.

    let threw = false;
    try {
      execFileSync(process.execPath, [path.join(tmpDir, "scripts", "build-oracle-index.cjs")], {
        cwd: tmpDir,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      threw = true;
      expect(error.status).not.toBe(0);
      const stderr = String(error.stderr || "");
      expect(stderr).toMatch(/source file not found/i);
    }
    expect(threw).toBe(true);
  });
});
