/**
 * build-seed-price-history.mjs — bake a staples price snapshot into the shipped
 * data so the Finance tab has a baseline on a fresh install (Vault #4).
 *
 * Writes data/collection-prices.jsonl with one entry per top-staple
 * representative printing, dated at build time. On a fresh install this is the
 * "past" price point; the launch snapshot (#21) adds "today", so the Finance
 * movers compute from day one instead of staying empty for ~2 weeks.
 *
 * Reuses the exact runtime snapshot helpers (stapleSnapshotTargets +
 * buildExtraSnapshotEntries + serializeHistory), so the seed is byte-compatible
 * with what the app writes every day — no parallel format to drift.
 *
 * The write path (POST /api/collection/prices) always targets the writable data
 * dir, so the first launch merges this seed into AppData and takes precedence;
 * the bundled copy is read-only and never mutated.
 *
 * FAIL-SAFE: a seed is a nice-to-have, never a release blocker. Any error (e.g.
 * indexes not synced) logs and exits 0 — the build just ships without a seed,
 * which is exactly today's behavior. The release step is also continue-on-error.
 *
 * Run via: npm run build:seed-prices  (CI runs it after the index builds)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { stapleSnapshotTargets } from "../src/lib/server/financeUniverse.js";
import {
  todayStamp,
  buildExtraSnapshotEntries,
  serializeHistory,
} from "../src/lib/server/collectionPrices.js";

const SEED_STAPLE_LIMIT = 200;

async function main() {
  const targets = stapleSnapshotTargets(SEED_STAPLE_LIMIT);
  if (!targets.length) {
    console.warn("[seed-prices] no staple targets (indexes not synced?) — skipping seed.");
    return;
  }

  const entries = buildExtraSnapshotEntries(targets, todayStamp());
  const outFile = path.join(process.cwd(), "data", "collection-prices.jsonl");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, serializeHistory(entries), "utf8");
  console.log(`[seed-prices] wrote ${entries.length} staple price entries → ${outFile}`);
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Fail-safe: never break a build over a missing seed.
    console.warn(`[seed-prices] skipped (${err?.message || err})`);
    process.exit(0);
  });
}
