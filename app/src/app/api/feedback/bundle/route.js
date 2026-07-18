/**
 * /api/feedback/bundle — portable feedback share format.
 *
 * GET  returns a single JSON bundle containing every entry currently in
 *      data/feedback/ plus light metadata (schema version, sender app
 *      version, export timestamp). The client downloads this file and
 *      the user emails it to whoever maintains the project.
 *
 * POST imports a posted bundle into the local feedback dir, deduping
 *      against existing entries by id. Idempotent — re-importing the
 *      same bundle adds nothing. After import the digest is regenerated
 *      so FEEDBACK.md reflects the merged set.
 *
 * The bundle is intentionally not encrypted or signed. It's a friend-
 * to-maintainer share format, not a secure channel. Keep that in mind
 * before importing a bundle from an untrusted source — the entries get
 * surfaced in FEEDBACK.md which you'll then paste into a Claude session,
 * so a malicious payload could try prompt-injection through the message
 * body. We clamp lengths and re-validate every field on import to limit
 * the blast radius.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

// Shared validation + storage + digest layer — extracted to lib/server/feedbackStore.js
// (2026-07-18, slate B2): the import path MUST clamp exactly like the write path (the clamps
// limit prompt-injection blast radius) and MUST emit the identical FEEDBACK.md format. Only
// the bundle schema + import path-safety guards stay here.
import {
  FEEDBACK_DIR, MAX_MESSAGE_LENGTH,
  VALID_CATEGORIES, clampString, normaliseContext, generateFileId,
  atomicWriteJson, readAllEntries, regenerateDigest,
} from "../../../../lib/server/feedbackStore";

const SCHEMA_VERSION = 1;
const MAX_BUNDLE_ENTRIES = 5000;

// Strict ISO-8601 (with or without milliseconds), e.g. 2026-05-31T01:02:03.456Z.
// An imported timestamp is untrusted display metadata — we only let it shape the
// filename when it matches this exactly; anything else (including "../" path-
// traversal attempts) falls back to the current time.
function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function timestampedFilename(timestamp) {
  const iso = isIsoTimestamp(timestamp) ? timestamp : new Date().toISOString();
  const safeTs = iso.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  // Belt-and-suspenders: drop anything that isn't filename-safe, then basename
  // it, so the result can only ever be a flat filename — never a path.
  const flat = `${safeTs}-${generateFileId()}.json`.replace(/[^A-Za-z0-9._-]/g, "");
  return path.basename(flat);
}

// Resolve a feedback entry path and assert it lands DIRECTLY inside FEEDBACK_DIR
// (no subdirs, no escape). Returns null if the filename is unsafe. The atomic
// writer's sibling ".tmp" file stays in the same dir, so a safe target keeps the
// temp write safe too. Defence-in-depth on top of timestampedFilename().
function safeFeedbackPath(filename) {
  const dir = path.resolve(FEEDBACK_DIR);
  const target = path.resolve(dir, filename);
  return path.dirname(target) === dir ? target : null;
}

// ─── HTTP handlers ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const raw = await readAllEntries();
    // Strip filename — that's an implementation detail of the local
    // store, not part of the portable record.
    const entries = raw.map(({ filename: _f, ...rest }) => rest);
    const exporterAppVersion = entries.find(e => e.context?.appVersion)?.context?.appVersion || null;
    const bundle = {
      schemaVersion: SCHEMA_VERSION,
      kind: "mtg-tool-feedback-bundle",
      exportedAt: new Date().toISOString(),
      exportedFromAppVersion: exporterAppVersion,
      entryCount: entries.length,
      entries,
    };
    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mtg-feedback-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not export bundle." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || body.kind !== "mtg-tool-feedback-bundle") {
    return Response.json(
      { error: "This doesn't look like an MTG Tool feedback file." },
      { status: 400 }
    );
  }
  if (body.schemaVersion !== SCHEMA_VERSION) {
    return Response.json(
      { error: "This feedback file was made by an incompatible version of MTG Tool." },
      { status: 400 }
    );
  }
  const incoming = Array.isArray(body.entries) ? body.entries : null;
  if (!incoming) {
    return Response.json({ error: "Feedback file is missing its entries." }, { status: 400 });
  }
  if (incoming.length > MAX_BUNDLE_ENTRIES) {
    return Response.json(
      { error: `Feedback file is too large (>${MAX_BUNDLE_ENTRIES} entries).` },
      { status: 413 }
    );
  }

  await fs.mkdir(FEEDBACK_DIR, { recursive: true });

  // Build set of existing ids so re-import is idempotent.
  const existing = await readAllEntries();
  const existingIds = new Set(existing.map(e => e.id).filter(Boolean));

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const candidate of incoming) {
    if (!candidate || typeof candidate !== "object") { skipped++; continue; }
    const message = clampString(candidate.message, MAX_MESSAGE_LENGTH).trim();
    if (!message) { skipped++; continue; }
    const id = typeof candidate.id === "string" && candidate.id ? candidate.id : generateFileId();
    if (existingIds.has(id)) { skipped++; continue; }
    const category = VALID_CATEGORIES.has(candidate.category) ? candidate.category : "other";
    const context = normaliseContext(candidate.context);
    const timestamp = typeof candidate.timestamp === "string" && candidate.timestamp
      ? candidate.timestamp
      : new Date().toISOString();
    const entry = { id, timestamp, category, message, context };
    try {
      const target = safeFeedbackPath(timestampedFilename(timestamp));
      if (!target) {
        errors.push({ id, error: "unsafe filename" });
        continue;
      }
      await atomicWriteJson(target, entry);
      existingIds.add(id);
      imported++;
    } catch (error) {
      errors.push({ id, error: error.message || "write failed" });
    }
  }

  let digestEntryCount = null;
  try {
    digestEntryCount = await regenerateDigest();
  } catch {
    /* best-effort */
  }

  return Response.json({
    ok: true,
    imported,
    skipped,
    errors,
    digestEntryCount,
  });
}
