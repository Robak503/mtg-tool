/**
 * syncSpellbookExit.test.js — sync-spellbook.cjs's exit codes and its card-crawl resume (2026-09-30).
 *
 * Exit codes: Spellbook's rate limit stopping a card crawl that already saved pages THIS run exits 75, which
 * sync-spellbook.yml reports as a warning (the progress is cached and the next run resumes); a 429 before a single page
 * landed exits 1, so a stalled crawl still turns the run red.
 *
 * Resume: Spellbook gives `id` only to cards that appear in a combo — every other card comes back `id: null` (81 of 100 on
 * a live page, 2026-09-30). Keyed on `id`, a reload kept ONE null-id card and the crawl restarted from the id'd count every
 * run, so it never finished. The stub below serves offset-aware pages where four cards in five have a null id, like the
 * real API, and records every offset the script asks for.
 *
 * Runs the real script with fetch stubbed (no network) in a temp data root.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "sync-spellbook.cjs");
// STUB_GOOD_PAGES successful /cards pages of 100 (cards numbered by offset; id only on every fifth), then HTTP 429.
const STUB = `const fs = require("fs");
let calls = 0;
const good = Number(process.env.STUB_GOOD_PAGES || 0);
globalThis.fetch = async (url) => {
  calls += 1;
  const offset = Number(new URL(url).searchParams.get("offset") || 0);
  fs.appendFileSync(process.env.STUB_LOG, offset + "\\n");
  if (calls <= good) {
    const results = Array.from({ length: 100 }, (_, i) => {
      const n = offset + i;
      return { id: n % 5 === 0 ? n + 1 : null, name: "Stub Card " + n, oracleId: "oracle-" + n };
    });
    return new Response(JSON.stringify({ results, next: url + "&more" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("rate limited", { status: 429 });
};
`;

function dataRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spellbook-sync-"));
  fs.writeFileSync(path.join(root, "fetch-stub.cjs"), STUB);
  return root;
}
function runIn(root, goodPages) {
  const log = path.join(root, `offsets-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  const r = spawnSync(process.execPath, ["-r", path.join(root, "fetch-stub.cjs"), SCRIPT, "--cards-only", "--retries", "0", "--delay-ms", "0"], {
    env: { ...process.env, MTG_APP_ROOT: root, STUB_GOOD_PAGES: String(goodPages), STUB_LOG: log },
    encoding: "utf8",
  });
  const cardsFile = path.join(root, "data", "spellbook-cards.local.json");
  const cards = fs.existsSync(cardsFile) ? JSON.parse(fs.readFileSync(cardsFile, "utf8")) : null;
  const offsets = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(Number) : [];
  return { code: r.status, uniqueSaved: cards ? new Set(Object.values(cards).map((c) => c.oracleId)).size : 0, offsets };
}
function withRoot(fn) {
  const root = dataRoot();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("sync-spellbook.cjs exit codes", () => {
  it("a 429 after pages were saved this run exits 75 and keeps the saved pages", () => {
    const r = withRoot((root) => runIn(root, 2));
    expect({ code: r.code, uniqueSaved: r.uniqueSaved }).toEqual({ code: 75, uniqueSaved: 200 });
  });

  it("a 429 before any page landed exits 1 — a stalled crawl stays red", () => {
    const r = withRoot((root) => runIn(root, 0));
    expect({ code: r.code, uniqueSaved: r.uniqueSaved }).toEqual({ code: 1, uniqueSaved: 0 });
  });
});

describe("sync-spellbook.cjs card-crawl resume", () => {
  it("the next run resumes where the last stopped, keeping every card although four in five have no Spellbook id", () => {
    const [first, second] = withRoot((root) => [runIn(root, 2), runIn(root, 1)]);
    expect({ first: { saved: first.uniqueSaved, asked: first.offsets }, second: { saved: second.uniqueSaved, asked: second.offsets } }).toEqual({
      first: { saved: 200, asked: [0, 100, 200] },
      second: { saved: 300, asked: [200, 300] },
    });
  });
});
