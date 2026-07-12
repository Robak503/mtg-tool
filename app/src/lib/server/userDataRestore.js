/**
 * userDataRestore.js — validate + plan a restore from a K1 backup bundle (I2).
 *
 * Pure: the route does the file I/O (back up current files first, then write).
 * Only the file-based sections are restored here; feedback/ and games/ are
 * directory-of-files stores and are left for a follow-up.
 */

// Backup section → the writable data file it restores into. Internal-only.
const RESTORE_SECTION_FILES = {
  decks: "decks.local.json",
  chats: "chats.local.json",
  collection: "collection.json",
  watchlist: "watchlist.json",
  priceAlerts: "price-alerts.json",
  agentNotes: "agent-notes.local.json",
  // C5-P1.1 (data-hygiene keystone): the color-tag DEFINITIONS. Without this, a restore/reinstall brought
  // back every collection row's `colorTagId` while the definitions those ids point at were lost — the row's
  // stripe rendered against a tag the data layer had never seen. Restoring color-tags.json alongside
  // collection.json makes a backup whole. Additive: an older backup with no `colorTags` section simply
  // isn't restored here (selectRestoreSections skips null sections), so old bundles load unchanged.
  colorTags: "color-tags.json",
};

export function validateBackupBundle(bundle) {
  if (!bundle || typeof bundle !== "object") return { ok: false, error: "Not a backup object." };
  if (bundle.kind !== "mtg-tool-backup") {
    return { ok: false, error: "This doesn't look like an MTG Tool backup file." };
  }
  if (!bundle.sections || typeof bundle.sections !== "object") {
    return { ok: false, error: "Backup is missing its sections." };
  }
  return { ok: true };
}

/**
 * Which sections to restore. Returns [{ section, file, data }] for the
 * file-based sections that are present (non-null) in the bundle and, if
 * `requested` is a non-empty list, also requested.
 */
export function selectRestoreSections(bundle, requested = null) {
  const sections = bundle?.sections || {};
  const want = Array.isArray(requested) && requested.length ? new Set(requested) : null;
  const out = [];
  for (const [section, file] of Object.entries(RESTORE_SECTION_FILES)) {
    if (want && !want.has(section)) continue;
    const data = sections[section];
    if (data == null) continue;
    out.push({ section, file, data });
  }
  return out;
}
