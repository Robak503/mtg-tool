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

import { dataPath } from "../../../lib/server/paths";

const FEEDBACK_DIR = dataPath("feedback");
const DIGEST_FILE = path.join(FEEDBACK_DIR, "FEEDBACK.md");
const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_FIELD_LENGTH = 400;
const VALID_CATEGORIES = new Set(["bug", "feature", "agent-quality", "ui", "other"]);
const VALID_AGENTS = new Set(["jace", "karn", "tibalt", "arbiter", "garfield"]);
const VALID_PAGES = new Set(["chat", "deck", "import", "garfield"]);

const CATEGORY_LABEL = {
  bug: "Bug",
  feature: "Feature idea",
  "agent-quality": "Agent quality",
  ui: "UI / UX",
  other: "Note",
};

function clampString(value, limit) {
  if (typeof value !== "string") return "";
  return value.slice(0, limit);
}

function normaliseContext(context = {}) {
  if (!context || typeof context !== "object") return {};
  const out = {};
  if (VALID_AGENTS.has(context.agent)) out.agent = context.agent;
  if (typeof context.sessionId === "string" && context.sessionId) {
    out.sessionId = clampString(context.sessionId, 100);
  }
  if (typeof context.sessionName === "string" && context.sessionName) {
    out.sessionName = clampString(context.sessionName, MAX_CONTEXT_FIELD_LENGTH);
  }
  if (typeof context.deckName === "string" && context.deckName) {
    out.deckName = clampString(context.deckName, MAX_CONTEXT_FIELD_LENGTH);
  }
  if (typeof context.deckCommander === "string" && context.deckCommander) {
    out.deckCommander = clampString(context.deckCommander, MAX_CONTEXT_FIELD_LENGTH);
  }
  if (VALID_PAGES.has(context.page)) out.page = context.page;
  if (typeof context.userAgent === "string" && context.userAgent) {
    out.userAgent = clampString(context.userAgent, MAX_CONTEXT_FIELD_LENGTH);
  }
  if (typeof context.appVersion === "string" && context.appVersion) {
    // Short enough that 32 chars is generous; rejects garbage.
    out.appVersion = clampString(context.appVersion, 32);
  }
  return out;
}

function generateFileId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

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

async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

async function atomicWriteText(filePath, body) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

// ─── Digest generation ───────────────────────────────────────────────────────

function formatEntryAsMarkdown(entry) {
  const ts = entry.timestamp || "";
  const friendlyTs = ts ? new Date(ts).toLocaleString() : "(no timestamp)";
  const categoryLabel = CATEGORY_LABEL[entry.category] || "Note";
  const ctx = entry.context || {};
  const ctxBits = [];
  if (ctx.agent) ctxBits.push(`agent=${ctx.agent}`);
  if (ctx.sessionName) ctxBits.push(`session="${ctx.sessionName}"`);
  if (ctx.deckName) ctxBits.push(`deck="${ctx.deckName}"`);
  if (ctx.deckCommander) ctxBits.push(`commander="${ctx.deckCommander}"`);
  if (ctx.page) ctxBits.push(`page=${ctx.page}`);
  if (ctx.appVersion) ctxBits.push(`v${ctx.appVersion}`);
  const ctxLine = ctxBits.length ? `\n— context: ${ctxBits.join(", ")} · ${ts}` : `\n— ${ts}`;

  // Header: "## [date] Category · agent · session · deck"
  const headerBits = [`[${friendlyTs}]`, categoryLabel];
  if (ctx.agent) headerBits.push(ctx.agent);
  if (ctx.deckName) headerBits.push(`deck: ${ctx.deckName}`);
  const header = `## ${headerBits.join(" · ")}`;

  return `${header}\n\n${entry.message}${ctxLine}`;
}

async function readAllEntries() {
  let files;
  try {
    files = await fs.readdir(FEEDBACK_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
    try {
      const raw = await fs.readFile(path.join(FEEDBACK_DIR, file), "utf8");
      const parsed = JSON.parse(raw);
      entries.push({ filename: file, ...parsed });
    } catch {
      // Skip unreadable/corrupt files; don't block the whole listing.
    }
  }
  // Newest first.
  entries.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  return entries;
}

function buildDigest(entries) {
  const header = [
    "# MTG Tool — Feedback Log",
    "",
    "Consolidated dump of all in-app feedback captured locally. Newest at the top.",
    "Auto-regenerated on every submission by `/api/feedback`. Paste this whole file",
    "into a fresh Claude Code session and say \"fix all of this\" — every entry has",
    "enough context (agent, session, deck, page) to find the relevant code path.",
    "",
    `_${entries.length} entr${entries.length === 1 ? "y" : "ies"} as of ${new Date().toISOString()}_`,
    "",
    "---",
    "",
  ];
  if (entries.length === 0) {
    header.push("_(no feedback yet — submit one to populate this file)_");
    return header.join("\n") + "\n";
  }
  const blocks = entries.map(formatEntryAsMarkdown).join("\n\n---\n\n");
  return header.join("\n") + blocks + "\n";
}

async function regenerateDigest() {
  const entries = await readAllEntries();
  await fs.mkdir(FEEDBACK_DIR, { recursive: true });
  await atomicWriteText(DIGEST_FILE, buildDigest(entries));
  return entries.length;
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
