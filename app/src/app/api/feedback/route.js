/**
 * /api/feedback — in-app feedback capture.
 *
 * POST writes one JSON file per submission to data/feedback/, atomically
 * (.tmp + rename) so a crash mid-write never leaves a half-written file.
 * GET lists submissions for the user to review later.
 *
 * The directory is gitignored. Submissions live alongside the user's chat
 * and deck data — never sent off the machine.
 *
 * Body shape:
 *   {
 *     message: string,           // required, 1..4000 chars
 *     category?: "bug" | "feature" | "agent-quality" | "ui" | "other",
 *     context?: {
 *       agent?: string,          // "jace" | "karn" | "tibalt" | "arbiter" | "garfield"
 *       sessionId?: string,
 *       sessionName?: string,
 *       deckName?: string,
 *       deckCommander?: string,
 *       page?: string,           // "chat" | "deck" | "import" | "garfield"
 *       userAgent?: string,
 *     },
 *   }
 *
 * On disk:
 *   data/feedback/{ISO-date}-{shortid}.json
 *
 * The route refuses to leave the data dir (no path traversal possible since
 * we generate the filename ourselves) and caps message length defensively.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FEEDBACK_DIR = path.join(DATA_DIR, "feedback");
const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_FIELD_LENGTH = 400;
const VALID_CATEGORIES = new Set(["bug", "feature", "agent-quality", "ui", "other"]);
const VALID_AGENTS = new Set(["jace", "karn", "tibalt", "arbiter", "garfield"]);
const VALID_PAGES = new Set(["chat", "deck", "import", "garfield"]);

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

async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

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
    return Response.json({ ok: true, id: entry.id, filename, timestamp });
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

export async function GET() {
  try {
    let files;
    try {
      files = await fs.readdir(FEEDBACK_DIR);
    } catch (error) {
      if (error.code === "ENOENT") return Response.json({ entries: [], count: 0 });
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

    return Response.json({ entries, count: entries.length });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not list feedback." },
      { status: 500 }
    );
  }
}
