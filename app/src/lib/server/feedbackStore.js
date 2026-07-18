/**
 * feedbackStore.js — the SHARED validation + storage + digest layer for the two feedback routes
 * (/api/feedback and /api/feedback/bundle).
 *
 * Extracted 2026-07-18 (improvement slate B2): both routes carried byte-identical copies of this
 * entire layer — the clamp/whitelist vocabulary, the atomic writers, readAllEntries, and the
 * FEEDBACK.md digest generator. That duplication was security-relevant drift risk: the clamps
 * exist to limit prompt-injection blast radius on imported bundles (the digest gets pasted into
 * a Claude session), so the write path and the import path MUST validate identically — and a
 * digest-format change in one route would silently fork the format in the other.
 *
 * Route-specific logic (filename shaping, bundle schema, path-traversal guards on import) stays
 * in the routes; this module is only what both must agree on.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { dataPath } from "./paths";

export const FEEDBACK_DIR = dataPath("feedback");
export const DIGEST_FILE = path.join(FEEDBACK_DIR, "FEEDBACK.md");
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CONTEXT_FIELD_LENGTH = 400;
export const VALID_CATEGORIES = new Set(["bug", "feature", "agent-quality", "ui", "other"]);
export const VALID_AGENTS = new Set(["jace", "karn", "tibalt", "arbiter", "garfield"]);
export const VALID_PAGES = new Set(["chat", "deck", "import", "garfield"]);

export const CATEGORY_LABEL = {
  bug: "Bug",
  feature: "Feature idea",
  "agent-quality": "Agent quality",
  ui: "UI / UX",
  other: "Note",
};

export function clampString(value, limit) {
  if (typeof value !== "string") return "";
  return value.slice(0, limit);
}

export function normaliseContext(context = {}) {
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

export function generateFileId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

export async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

export async function atomicWriteText(filePath, body) {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

// ─── Digest generation ───────────────────────────────────────────────────────

export function formatEntryAsMarkdown(entry) {
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

export async function readAllEntries() {
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

export function buildDigest(entries) {
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

export async function regenerateDigest() {
  const entries = await readAllEntries();
  await fs.mkdir(FEEDBACK_DIR, { recursive: true });
  await atomicWriteText(DIGEST_FILE, buildDigest(entries));
  return entries.length;
}
