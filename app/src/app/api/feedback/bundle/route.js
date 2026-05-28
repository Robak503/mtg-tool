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

import { dataPath } from "../../../../lib/server/paths";

const FEEDBACK_DIR = dataPath("feedback");
const SCHEMA_VERSION = 1;
const MAX_BUNDLE_ENTRIES = 5000;
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
  if (typeof context.appVersion === "string" && context.appVersion) {
    out.appVersion = clampString(context.appVersion, 32);
  }
  if (typeof context.userAgent === "string" && context.userAgent) {
    out.userAgent = clampString(context.userAgent, MAX_CONTEXT_FIELD_LENGTH);
  }
  return out;
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
      /* skip unreadable file */
    }
  }
  entries.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  return entries;
}

async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

function generateFileId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

function timestampedFilename(timestamp) {
  const safeTs = String(timestamp || new Date().toISOString())
    .replace(/:/g, "-")
    .replace(/\..+Z$/, "Z");
  return `${safeTs}-${generateFileId()}.json`;
}

// ─── Digest regen (kept duplicate-free with the main route by re-reading
//     everything from disk after a merge) ─────────────────────────────
const DIGEST_FILE = path.join(FEEDBACK_DIR, "FEEDBACK.md");

const CATEGORY_LABEL = {
  bug: "Bug",
  feature: "Feature idea",
  "agent-quality": "Agent quality",
  ui: "UI / UX",
  other: "Note",
};

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
  const headerBits = [`[${friendlyTs}]`, categoryLabel];
  if (ctx.agent) headerBits.push(ctx.agent);
  if (ctx.deckName) headerBits.push(`deck: ${ctx.deckName}`);
  const header = `## ${headerBits.join(" · ")}`;
  return `${header}\n\n${entry.message}${ctxLine}`;
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
  const body = buildDigest(entries);
  const tmp = `${DIGEST_FILE}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, DIGEST_FILE);
  return entries.length;
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
        "Content-Disposition": `attachment; filename="mtg-feedback-bundle-${new Date().toISOString().slice(0, 10)}.json"`,
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
      { error: "Not a feedback bundle (missing kind=\"mtg-tool-feedback-bundle\")." },
      { status: 400 }
    );
  }
  if (body.schemaVersion !== SCHEMA_VERSION) {
    return Response.json(
      { error: `Unsupported schemaVersion ${body.schemaVersion} (expected ${SCHEMA_VERSION}).` },
      { status: 400 }
    );
  }
  const incoming = Array.isArray(body.entries) ? body.entries : null;
  if (!incoming) {
    return Response.json({ error: "Bundle.entries must be an array." }, { status: 400 });
  }
  if (incoming.length > MAX_BUNDLE_ENTRIES) {
    return Response.json(
      { error: `Bundle too large (>${MAX_BUNDLE_ENTRIES} entries).` },
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
      const filename = timestampedFilename(timestamp);
      await atomicWriteJson(path.join(FEEDBACK_DIR, filename), entry);
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
