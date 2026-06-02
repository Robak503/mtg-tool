/**
 * /api/collection/import — CSV import for Deckbox + Moxfield exports.
 *
 * Two-call protocol:
 *
 *   POST { csv: "..." }              → parse + match, returns a preview
 *                                       (no writes). Used by the import
 *                                       modal to show matched/unmatched
 *                                       counts before commit.
 *   POST { rows: [<full row obj>] }  → batch merge into the collection,
 *                                       returns the saved collection.
 *
 * Atomic writes via collectionStorage.writeCollectionAtomic. Each commit
 * goes through one merge + one rename, so partial state can't leak even
 * on a 5,000-row import.
 */

export const runtime = "nodejs";

import {
  loadCollection,
  writeCollectionAtomic,
  withCollectionLock,
  CollectionVersionMismatch,
} from "../../../../lib/server/collectionStorage.js";
import {
  parseCollectionCsv,
  matchEntries,
  mergeImportRows,
  diffImport,
} from "../../../../lib/server/collectionCsvImport.js";

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

function versionConflict(error) {
  return Response.json(
    { error: error.message, code: error.code, found: error.found, expected: error.expected },
    { status: 409 },
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("Request body must be an object");
  }

  // Branch 1: preview (parse + match, no writes)
  if (typeof body.csv === "string") {
    try {
      const parsed = parseCollectionCsv(body.csv);
      let matchResult = { matched: [], unmatched: [] };
      try {
        matchResult = matchEntries(parsed.entries);
      } catch {
        // Printings index unavailable. Return what we have.
        return Response.json({
          format: parsed.format,
          entries: parsed.entries,
          matched: [],
          unmatched: parsed.entries,
          errors: parsed.errors,
          warning:
            "Printings index unavailable — couldn't match against bundled card data. " +
            "Run `npm run build:printings-index` or trigger a data sync.",
        });
      }
      // Surface a compact response — full rows for matched, raw entries
      // for unmatched (so the modal can show what we couldn't resolve).
      return Response.json({
        format: parsed.format,
        entries: parsed.entries.length,
        matched: matchResult.matched.map(m => ({
          row: m.row,
          sourceLineNumber: m.entry.sourceLineNumber,
          sourceName: m.entry.name,
          sourceSet: m.entry.setCode,
        })),
        unmatched: matchResult.unmatched,
        errors: parsed.errors,
      });
    } catch (error) {
      return Response.json(
        { error: error.message || "Failed to parse CSV" },
        { status: 500 },
      );
    }
  }

  // Branch 2: dry-run diff (compute what a mode would change; no writes)
  if (Array.isArray(body.rows) && body.dryRun) {
    try {
      const { collection } = await loadCollection();
      return Response.json({ diff: diffImport(collection, body.rows, body.mode) });
    } catch (error) {
      if (error instanceof CollectionVersionMismatch) return versionConflict(error);
      return Response.json({ error: error.message || "Failed to compute import diff" }, { status: 500 });
    }
  }

  // Branch 3: commit (write a batch of pre-validated rows under an update mode)
  if (Array.isArray(body.rows)) {
    try {
      // Serialize against single-row adds/edits so a 5,000-row import commit
      // and a concurrent user edit can't clobber each other.
      const { saved, stats } = await withCollectionLock(async () => {
        const { collection } = await loadCollection();
        const { merged, stats: importStats } = mergeImportRows(collection, body.rows, body.mode);
        const written = await writeCollectionAtomic(merged);
        return { saved: written, stats: importStats };
      });
      return Response.json({
        collection: saved,
        stats,
      });
    } catch (error) {
      if (error instanceof CollectionVersionMismatch) return versionConflict(error);
      return Response.json(
        { error: error.message || "Failed to import rows" },
        { status: 500 },
      );
    }
  }

  return badRequest("Request must include either `csv` (preview) or `rows` (commit) field");
}
