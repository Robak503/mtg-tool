/**
 * playHintsBatch.js — merge ONE curated batch from Omnath's play-nuance queue into the play-hints ledger
 * (2026-09-29, release-readiness R3). Pure functions; the CLI is scripts/merge-play-hints-batch.mjs.
 *
 * The queue (<MEMDIR>/orders/arbiter-nuance-queue.md) keeps a "## ⭐ CURATED NOTES" section, newest batch on
 * top; each batch opens with a bold "**BATCH N (" paragraph. An entry takes one of three forms:
 *   bullet  : **Card Name** — `role · timing`            followed by "- LABEL: text" lines
 *   refresh : **REFRESH — Card Name** — `role · timing`  followed by "- LABEL: text" lines (REPLACES the note)
 *   inline  : **Card Name** — `role · timing` — LABEL: text · LABEL: text   (one line)
 * Bullet notes are joined "LABEL: text · LABEL: text" — the register the 2026-08-16 merge wrote.
 *
 * Only the named batch is applied; every other ledger entry stays byte-identical. A card is matched by its
 * EXACT ledger key (double-faced cards are keyed "Front // Back"); a name the ledger doesn't have is reported,
 * never invented. A merged entry keeps the ledger's tier / parked (the warm script's derivation).
 */

const ENTRY_RE = /^\*\*(REFRESH — )?(.+?)\*\* — `([^`]+?) · ([^`]+?)`(?: — (.+))?$/;
const BATCH_RE = /^\*\*BATCH (\d+) \(/;

/** The "## …CURATED NOTES…" section's lines (up to the next "## " heading). Throws if it is missing. */
function curatedSection(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex((l) => /^## .*CURATED NOTES/.test(l));
  if (start < 0) throw new Error('no "## … CURATED NOTES" section in the queue file');
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

/**
 * Parse batch `batchNo` → [{ name, refresh, role, timing, note }]. Throws when the batch is absent or empty,
 * when an entry has no note, or when a card appears twice in the batch.
 */
export function parseCuratedBatch(markdown, batchNo) {
  const lines = curatedSection(markdown);
  const start = lines.findIndex((l) => {
    const m = BATCH_RE.exec(l);
    return m && Number(m[1]) === Number(batchNo);
  });
  if (start < 0) throw new Error(`batch ${batchNo} not found in the CURATED NOTES section`);
  let end = lines.findIndex((l, i) => i > start && BATCH_RE.test(l));
  if (end < 0) end = lines.length;
  const block = lines.slice(start, end);

  const entries = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    const note = cur.inline ?? cur.bullets.join(" · ");
    if (!note.trim()) throw new Error(`batch ${batchNo}: "${cur.name}" has no note`);
    entries.push({ name: cur.name, refresh: cur.refresh, role: cur.role, timing: cur.timing, note: note.trim() });
    cur = null;
  };
  for (const line of block) {
    const m = ENTRY_RE.exec(line.trim());
    if (m) {
      finish();
      cur = { name: m[2].trim(), refresh: Boolean(m[1]), role: m[3].trim(), timing: m[4].trim(), inline: m[5] ? m[5].trim() : null, bullets: [] };
      if (cur.inline !== null) finish();
      continue;
    }
    // Prose outside an entry — the batch's own header paragraph, however many lines it wraps — is no note.
    if (!cur) continue;
    if (line.startsWith("- ")) cur.bullets.push(line.slice(2).trim());
    else if (line.trim() === "") finish();
    else if (cur.bullets.length) cur.bullets[cur.bullets.length - 1] += ` ${line.trim()}`; // a wrapped bullet
  }
  finish();

  if (!entries.length) throw new Error(`batch ${batchNo} has no entries`);
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.name)) throw new Error(`batch ${batchNo}: "${e.name}" appears twice`);
    seen.add(e.name);
  }
  return entries;
}

/**
 * Apply parsed entries to a ledger doc ({ version, generated, hints }). Returns a NEW doc plus the report;
 * the input doc is not mutated. `added` = a card that had no curated note; `replaced` = a curated note
 * overwritten; `skipped` = { name, reason } for names the ledger doesn't carry.
 */
export function applyCuratedBatch(doc, entries) {
  if (!doc || typeof doc.hints !== "object" || doc.hints === null) throw new Error("ledger has no hints object");
  const hints = { ...doc.hints };
  const report = { added: [], replaced: [], skipped: [], refreshOfUncurated: [] };
  for (const e of entries) {
    const prev = Object.prototype.hasOwnProperty.call(hints, e.name) ? hints[e.name] : null;
    if (!prev) {
      report.skipped.push({ name: e.name, reason: "not in the ledger (no saved deck carries it — or the name differs)" });
      continue;
    }
    const wasCurated = prev.source === "curated";
    if (e.refresh && !wasCurated) report.refreshOfUncurated.push(e.name);
    hints[e.name] = { ...prev, role: e.role, timing: e.timing, note: e.note, source: "curated" };
    (wasCurated ? report.replaced : report.added).push(e.name);
  }
  return { doc: { ...doc, hints }, report };
}
