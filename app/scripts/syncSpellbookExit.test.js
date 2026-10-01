/**
 * syncSpellbookExit.test.js — sync-spellbook.cjs's exit codes (2026-09-30).
 *
 * Spellbook's rate limit stopping a card crawl that already saved pages THIS run exits 75, which sync-spellbook.yml
 * reports as a warning (the progress is cached and the next run resumes); a 429 before a single page landed exits 1, so
 * a stalled crawl still turns the run red. Runs the real script with fetch stubbed (no network) in a temp data root.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "sync-spellbook.cjs");
// STUB_GOOD_PAGES successful /cards pages of 100, then HTTP 429 on every call.
const STUB = `let calls = 0;
const good = Number(process.env.STUB_GOOD_PAGES || 0);
globalThis.fetch = async (url) => {
  calls += 1;
  if (calls <= good) {
    const results = Array.from({ length: 100 }, (_, i) => ({ id: calls * 1000 + i, name: "Stub Card " + calls + "-" + i }));
    return new Response(JSON.stringify({ results, next: url + "&more" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("rate limited", { status: 429 });
};
`;

function runWithGoodPages(goodPages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spellbook-exit-"));
  const stub = path.join(root, "fetch-stub.cjs");
  fs.writeFileSync(stub, STUB);
  try {
    const r = spawnSync(process.execPath, ["-r", stub, SCRIPT, "--cards-only", "--retries", "0", "--delay-ms", "0"], {
      env: { ...process.env, MTG_APP_ROOT: root, STUB_GOOD_PAGES: String(goodPages) },
      encoding: "utf8",
    });
    return { code: r.status, cardsSaved: fs.existsSync(path.join(root, "data", "spellbook-cards.local.json")) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("sync-spellbook.cjs exit codes", () => {
  it("a 429 after pages were saved this run exits 75 and keeps the saved pages", () => {
    expect(runWithGoodPages(2)).toEqual({ code: 75, cardsSaved: true });
  });

  it("a 429 before any page landed exits 1 — a stalled crawl stays red", () => {
    expect(runWithGoodPages(0)).toEqual({ code: 1, cardsSaved: false });
  });
});
