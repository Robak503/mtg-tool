/**
 * /api/collection/deck-costs — import smoke + empty-data behavior.
 *
 * The full cost math is unit-tested in deckCost.test.js; here we cover module
 * load and the no-decks path (which doesn't touch the printings index).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let route;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-costs-test-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await import("./route.js");
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("GET /api/collection/deck-costs", () => {
  it("exports GET", () => {
    expect(typeof route.GET).toBe("function");
  });

  it("returns an empty deck list when there are no saved decks", async () => {
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.decks).toEqual([]);
    expect(body.totalDecks).toBe(0);
  });
});
