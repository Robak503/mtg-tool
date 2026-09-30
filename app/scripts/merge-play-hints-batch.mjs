#!/usr/bin/env node
/**
 * merge-play-hints-batch.mjs — merge ONE curated batch from Omnath's play-nuance queue into the play-hints
 * ledger (2026-09-29, release-readiness R3). The parse / apply logic and its tests live in
 * src/lib/learn/playHintsBatch.js.
 *
 *   MTG_APP_ROOT=<root> node scripts/merge-play-hints-batch.mjs --queue=<arbiter-nuance-queue.md> --batch=19 [--dry-run] [--allow-skips]
 *
 * Writes <APP_ROOT>/data/card-play-hints.json atomically (temp file + rename) after a timestamped backup beside
 * it, in the warm script's own format (2-space JSON), then RE-READS the file and verifies that every merged note
 * landed and every other entry is unchanged. Exits non-zero when a batch card is missing from the ledger (unless
 * --allow-skips): the queue and the ledger disagreeing is a finding, not noise.
 */

import fs from "node:fs";
import path from "node:path";

import { applyCuratedBatch, parseCuratedBatch } from "../src/lib/learn/playHintsBatch.js";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
if (!argv.queue || !argv.batch) {
  console.error("usage: MTG_APP_ROOT=<root> node scripts/merge-play-hints-batch.mjs --queue=<file> --batch=<N> [--dry-run] [--allow-skips]");
  process.exit(2);
}

const APP_ROOT = process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim() ? process.env.MTG_APP_ROOT.trim() : process.cwd();
const ledgerPath = path.join(APP_ROOT, "data", "card-play-hints.json");
const batchNo = Number(argv.batch);

const entries = parseCuratedBatch(fs.readFileSync(argv.queue, "utf8"), batchNo);
const before = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const { doc, report } = applyCuratedBatch(before, entries);

const curated = (hints) => Object.values(hints).filter((e) => e?.source === "curated").length;
console.log(`batch ${batchNo}: ${entries.length} entries (${entries.filter((e) => e.refresh).length} REFRESH) → ${ledgerPath}`);
console.log(`  added (newly curated): ${report.added.length}${report.added.length ? " — " + report.added.join(" · ") : ""}`);
console.log(`  replaced (refreshed):  ${report.replaced.length}${report.replaced.length ? " — " + report.replaced.join(" · ") : ""}`);
for (const n of report.refreshOfUncurated) console.log(`  ⚠ REFRESH of a card that had no curated note: ${n}`);
for (const s of report.skipped) console.log(`  ✗ skipped ${s.name}: ${s.reason}`);
console.log(`  curated entries: ${curated(before.hints)} → ${curated(doc.hints)} · ledger entries: ${Object.keys(before.hints).length} → ${Object.keys(doc.hints).length}`);

if (report.skipped.length && !argv["allow-skips"]) {
  console.error("refusing to write: batch cards are missing from the ledger (pass --allow-skips to merge the rest)");
  process.exit(1);
}
if (argv["dry-run"]) {
  console.log("dry run — nothing written");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${ledgerPath}.pre-batch${batchNo}-${stamp}.bak`;
fs.copyFileSync(ledgerPath, backup);
const tmp = `${ledgerPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
fs.renameSync(tmp, ledgerPath);

// Verify by re-reading what is on disk now.
const after = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const merged = new Set([...report.added, ...report.replaced]);
const wrong = [];
for (const e of entries) {
  if (!merged.has(e.name)) continue;
  const got = after.hints[e.name];
  if (!got || got.source !== "curated" || got.note !== e.note || got.role !== e.role || got.timing !== e.timing) wrong.push(e.name);
}
for (const k of Object.keys(before.hints)) {
  if (!merged.has(k) && JSON.stringify(after.hints[k]) !== JSON.stringify(before.hints[k])) wrong.push(`${k} (changed but not in the batch)`);
}
if (Object.keys(after.hints).length !== Object.keys(before.hints).length) wrong.push("entry count changed");
if (wrong.length) {
  console.error(`VERIFY FAILED after write — restore from ${backup}:\n  ${wrong.join("\n  ")}`);
  process.exit(1);
}
const st = fs.statSync(ledgerPath);
console.log(`wrote + verified ${merged.size} merged notes · ${ledgerPath} (${st.size} bytes, mtime ${st.mtime.toISOString()}) · backup ${backup}`);
