import fs from "node:fs";

/**
 * Read + JSON.parse a file, returning `fallback` (default null) instead of
 * throwing on a MISSING or CORRUPT file.
 *
 * Why: the reference-data files (Scryfall index, EDHREC salt, rules index,
 * printings index) are written by sync scripts. An interrupted sync or a disk
 * glitch can leave a half-written / corrupt file. Without this, the bare
 * `JSON.parse(readFileSync(...))` throws a SyntaxError that 500s the whole app
 * (card lookups, power-rank, rules retrieval) until the file is hand-repaired.
 * Degrading one feature gracefully — with a loud warning — is the right call.
 *
 * Real I/O errors (permissions, etc.) still throw: those are not "corrupt data."
 */
export function readJsonOrNull(file, { fallback = null, label } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(
      `[${label || file}] corrupt JSON — ignoring it (feature degraded). ` +
        `Re-run the matching sync to regenerate.`,
    );
    return fallback;
  }
}
