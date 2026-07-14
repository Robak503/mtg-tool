/**
 * commanderLegality.test.js — the A/B card-bench banlist guardrail (Crucible dream feature, 2026-07-14).
 *
 * commanderLegality(name) reads the bundled Scryfall `legalities.commander` (authoritative, per-sync-current)
 * and returns a structured verdict. CREED: a banned card can NEVER be benched in, the banlist is never
 * hand-authored, and an unknown name is never fuzzy-matched to a real card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ORACLE_FIXTURE = {
  cards: [
    { name: "Sol Ring", oracle_id: "o-sol", legalities: { commander: "legal" } },
    { name: "Mana Crypt", oracle_id: "o-crypt", legalities: { commander: "banned" } },
    { name: "Jeweled Lotus", oracle_id: "o-jl", legalities: { commander: "banned" } },
    { name: "Shahrazad", oracle_id: "o-shah", legalities: { commander: "not_legal" } },
    { name: "The Ur-Dragon", oracle_id: "o-urd", legalities: { commander: "legal" } },
  ],
};

let tmpDir, originalCwd;
async function loadCardIndex() { vi.resetModules(); return import("./cardIndex.js"); }

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cardlegal-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json"), JSON.stringify(ORACLE_FIXTURE), "utf8");
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("commanderLegality — the A/B bench banlist guardrail", () => {
  it("a legal card passes", async () => {
    const { commanderLegality } = await loadCardIndex();
    expect(commanderLegality("Sol Ring").ok).toBe(true);
  });

  it("a BANNED card is blocked with reason 'banned' (Mana Crypt — Colton's case)", async () => {
    const { commanderLegality } = await loadCardIndex();
    const v = commanderLegality("Mana Crypt");
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("banned");
    expect(v.message).toMatch(/banned/i);
  });

  it("a not-legal card is blocked", async () => {
    const { commanderLegality } = await loadCardIndex();
    expect(commanderLegality("Shahrazad").ok).toBe(false);
    expect(commanderLegality("Shahrazad").reason).toBe("not-legal");
  });

  it("an unknown name is blocked, never fuzzy-matched into a real card", async () => {
    const { commanderLegality } = await loadCardIndex();
    expect(commanderLegality("Notarealcardxyz").reason).toBe("unknown");
  });

  it("matching is case-insensitive", async () => {
    const { commanderLegality } = await loadCardIndex();
    expect(commanderLegality("mana crypt").reason).toBe("banned");
  });
});
