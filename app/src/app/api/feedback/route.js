/**
 * /api/feedback — in-app feedback capture.
 *
 * POST writes one JSON file per submission to data/feedback/ AND
 * regenerates data/feedback/FEEDBACK.md (the consolidated digest the
 * user pastes into a Claude session later to batch-fix everything).
 * Both writes are atomic (.tmp + rename).
 *
 * GET returns the entries list (JSON).
 * GET ?format=md returns the consolidated FEEDBACK.md as text/markdown.
 * DELETE ?filename=X removes a specific entry and regenerates the digest.
 *
 * The directory is gitignored. Submissions live alongside the user's chat
 * and deck data — never sent off the machine.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

// Shared validation + storage + digest layer — extracted to lib/server/feedbackStore.js
// (2026-07-18, slate B2) so this route and /api/feedback/bundle can never drift apart on
// the security clamps or the FEEDBACK.md format. Route-specific filename logic stays here.
import {
  FEEDBACK_DIR, DIGEST_FILE, MAX_MESSAGE_LENGTH,
  VALID_CATEGORIES, clampString, normaliseContext, generateFileId,
  atomicWriteJson, readAllEntries, regenerateDigest,
} from "../../../lib/server/feedbackStore";

function generateFilename(timestamp) {
  // ISO 8601 with colons replaced (Windows-safe) plus short random suffix.
  // Result looks like: 2026-05-26T21-34-52Z-a1b2c3d4.json
  const safeTs = timestamp.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  return `${safeTs}-${generateFileId()}.json`;
}

function sanitiseFilename(value) {
  // Strip path separators; keep only the basename. Anything weirder is
  // dropped. Returns null when the result is empty or doesn't look like
  // one of our own filenames.
  if (typeof value !== "string") return null;
  const basename = path.basename(value);
  if (!/^[\w.-]+\.json$/.test(basename) || basename.includes("..")) return null;
  return basename;
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const message = clampString(body?.message, MAX_MESSAGE_LENGTH).trim();
  if (!message) {
    return Response.json(
      { error: "Feedback message is required (1-4000 characters)." },
      { status: 400 }
    );
  }

  const category = VALID_CATEGORIES.has(body?.category) ? body.category : "other";
  const context = normaliseContext(body?.context);
  const timestamp = new Date().toISOString();

  const entry = {
    id: generateFileId(),
    timestamp,
    category,
    message,
    context,
  };

  try {
    await fs.mkdir(FEEDBACK_DIR, { recursive: true });
    const filename = generateFilename(timestamp);
    const filePath = path.join(FEEDBACK_DIR, filename);
    await atomicWriteJson(filePath, entry);

    // Regenerate the consolidated digest. Failure here is non-fatal —
    // the per-submission JSON is the source of truth; the next POST or
    // DELETE will retry the regenerate.
    let digestEntryCount = null;
    try {
      digestEntryCount = await regenerateDigest();
    } catch {
      // best-effort
    }

    return Response.json({
      ok: true,
      id: entry.id,
      filename,
      timestamp,
      digestEntryCount,
    });
  } catch (error) {
    if (error.code === "ENOSPC") {
      return Response.json(
        { error: "Disk full — could not save feedback. Free up space and try again." },
        { status: 507 }
      );
    }
    return Response.json(
      { error: error.message || "Could not save feedback." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    // Markdown digest path — return the FEEDBACK.md as text/markdown.
    if (format === "md" || format === "markdown") {
      let body;
      try {
        body = await fs.readFile(DIGEST_FILE, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        // No digest yet — generate one on demand (will be empty-state copy).
        await regenerateDigest();
        body = await fs.readFile(DIGEST_FILE, "utf8");
      }
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": "inline; filename=\"FEEDBACK.md\"",
        },
      });
    }

    const entries = await readAllEntries();
    return Response.json({ entries, count: entries.length });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not list feedback." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("filename");
    const filename = sanitiseFilename(requested);
    if (!filename) {
      return Response.json(
        { error: "filename query param required and must look like {ts}-{id}.json." },
        { status: 400 }
      );
    }
    const target = path.join(FEEDBACK_DIR, filename);
    try {
      await fs.unlink(target);
    } catch (error) {
      if (error.code === "ENOENT") {
        return Response.json({ error: "Entry not found." }, { status: 404 });
      }
      throw error;
    }
    // Regenerate digest after deletion — best-effort; failure shouldn't
    // cascade since the underlying JSON file is already gone.
    let digestEntryCount = null;
    try {
      digestEntryCount = await regenerateDigest();
    } catch {
      // best-effort
    }
    return Response.json({ ok: true, deleted: filename, digestEntryCount });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not delete feedback." },
      { status: 500 }
    );
  }
}
