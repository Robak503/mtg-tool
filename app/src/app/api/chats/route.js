export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { profilePath } from "../../../lib/server/paths";

// Per-profile: resolved per-call (the active profile can change between requests).
const CHAT_FILE = () => profilePath("chats.local.json");
const V1_BACKUP = () => `${CHAT_FILE()}.v1.bak`;
const AGENT_KEYS = ["jace", "karn", "tibalt", "arbiter"];

// Per-session and per-file growth caps. v1 trimmed each agent history to 200
// messages; v2's bigger lockedDeck snapshots (~80-120KB) and multi-session
// model would otherwise grow chats.local.json without bound.
//
// MAX_SESSION_MESSAGES: hard cap per session; oldest messages trimmed.
// MAX_ARCHIVED_SESSIONS: keep at most this many archived sessions; oldest go.
// MAX_ARCHIVED_DAYS:    additionally drop archived sessions older than this.
// Active sessions are NEVER pruned by count or age — the user is using them.
function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const MAX_SESSION_MESSAGES = envNumber("MAX_SESSION_MESSAGES", 500);
const MAX_ARCHIVED_SESSIONS = envNumber("MAX_ARCHIVED_SESSIONS", 50);
const MAX_ARCHIVED_DAYS = envNumber("MAX_ARCHIVED_DAYS", 90);

// ─── Normalisation ────────────────────────────────────────────────────────────

// Persisted message shape. Beyond role/content we keep a STRICT allowlist of
// the fields the UI needs after a reload — error/retry affordances, the trust
// "fact receipt", and Arbiter metadata — and drop everything else (transient
// flags like `streaming`, plus any unknown keys). Without this, a reloaded chat
// silently loses its retry buttons, grounding badge, and Arbiter trace.
function normalizeMessage(message) {
  const out = {
    role: message?.role === "assistant" ? "assistant" : "user",
    content: String(message?.content || ""),
  };
  if (typeof message?.id === "string" && message.id) out.id = message.id;
  if (message?.isError === true) out.isError = true;
  if (message?.fallbackAvailable === true) out.fallbackAvailable = true;
  if (typeof message?.originalPrompt === "string") out.originalPrompt = message.originalPrompt;
  if (typeof message?.errorProvider === "string") out.errorProvider = message.errorProvider;
  if (typeof message?.arbiterTrace === "string" && message.arbiterTrace) out.arbiterTrace = message.arbiterTrace;
  if (typeof message?.arbiterStatus === "string") out.arbiterStatus = message.arbiterStatus;
  if (message?.arbiterSources && typeof message.arbiterSources === "object") out.arbiterSources = message.arbiterSources;
  if (message?.factReceipt && typeof message.factReceipt === "object") out.factReceipt = message.factReceipt;
  if (typeof message?.fallbackNotice === "string" && message.fallbackNotice) out.fallbackNotice = message.fallbackNotice;
  return out;
}

function normalizeLockedDeck(value) {
  if (!value || typeof value !== "object") return null;
  return value;
}

function generateSessionId() {
  // Crypto is preferred when available (Node 18+) but the route runtime is
  // always nodejs so we always have it. Fall back to timestamp+random just in
  // case some bundling target strips it.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `s-${globalThis.crypto.randomUUID()}`;
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeSession(session) {
  const rawMessages = Array.isArray(session?.messages)
    ? session.messages.map(normalizeMessage)
    : [];
  // Cap per-session messages to keep chats.local.json bounded. Trim oldest
  // first so the most recent conversation context is preserved.
  const messages = MAX_SESSION_MESSAGES > 0 && rawMessages.length > MAX_SESSION_MESSAGES
    ? rawMessages.slice(-MAX_SESSION_MESSAGES)
    : rawMessages;
  return {
    id: typeof session?.id === "string" && session.id ? session.id : generateSessionId(),
    agent: AGENT_KEYS.includes(session?.agent) ? session.agent : "jace",
    name: String(session?.name || "Untitled session").slice(0, 200),
    lockedDeck: normalizeLockedDeck(session?.lockedDeck),
    // The deck-gate opt-out ("Chat without a deck") must survive a reload, or
    // Karn/Tibalt re-prompt for a deck on every restart. Stored only when set.
    ...(session?.deckDeclined === true ? { deckDeclined: true } : {}),
    messages,
    createdAt: typeof session?.createdAt === "string" ? session.createdAt : new Date().toISOString(),
    updatedAt: typeof session?.updatedAt === "string" ? session.updatedAt : new Date().toISOString(),
    archived: Boolean(session?.archived),
  };
}

/**
 * Drop archived sessions that are either too numerous (keep the most recent
 * MAX_ARCHIVED_SESSIONS) or too old (older than MAX_ARCHIVED_DAYS based on
 * updatedAt). Active sessions are never touched — the user is actively using
 * them. Pass MAX_ARCHIVED_SESSIONS=0 or MAX_ARCHIVED_DAYS=0 in the env to
 * disable either limit.
 */
function pruneSessions(sessions) {
  const active = sessions.filter(s => !s.archived);
  let archived = sessions.filter(s => s.archived);

  // Newest first so slice(0, N) keeps the most recent.
  archived.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (MAX_ARCHIVED_DAYS > 0) {
    const cutoff = Date.now() - MAX_ARCHIVED_DAYS * 86_400_000;
    archived = archived.filter(s => {
      const t = Date.parse(s.updatedAt);
      return Number.isFinite(t) ? t >= cutoff : true;
    });
  }
  if (MAX_ARCHIVED_SESSIONS > 0 && archived.length > MAX_ARCHIVED_SESSIONS) {
    archived = archived.slice(0, MAX_ARCHIVED_SESSIONS);
  }

  return [...active, ...archived];
}

function normalizeSessions(sessions = []) {
  if (!Array.isArray(sessions)) return [];
  return sessions.map(normalizeSession);
}

// ─── v1 → v2 migration ────────────────────────────────────────────────────────

function autoNameFromMessages(messages, fallback = "Imported chat") {
  const firstUser = messages.find(m => m.role === "user");
  if (firstUser?.content) {
    const trimmed = String(firstUser.content).replace(/\s+/g, " ").trim().slice(0, 60);
    return trimmed || fallback;
  }
  return fallback;
}

function migrateV1ToV2(parsed) {
  const histories = parsed?.histories && typeof parsed.histories === "object" ? parsed.histories : {};
  const locks = parsed?.locks && typeof parsed.locks === "object" ? parsed.locks : {};
  const importedAt = new Date().toISOString();

  const sessions = [];
  for (const agent of AGENT_KEYS) {
    const messages = Array.isArray(histories[agent])
      ? histories[agent].map(normalizeMessage)
      : [];
    // Test plan edge: empty histories → empty sessions array (no synthetic sessions).
    if (messages.length === 0) continue;

    sessions.push({
      id: generateSessionId(),
      agent,
      name: `Imported — ${autoNameFromMessages(messages, `${agent} chat`)}`,
      lockedDeck: normalizeLockedDeck(locks[agent]),
      messages,
      createdAt: importedAt,
      updatedAt: importedAt,
      archived: true,
    });
  }

  return { version: 2, updatedAt: importedAt, sessions };
}

// ─── Disk I/O ─────────────────────────────────────────────────────────────────

async function readChatFile() {
  let raw;
  try {
    raw = await fs.readFile(CHAT_FILE(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { version: 2, updatedAt: null, sessions: [] };
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted file: keep the bad copy for forensics, return empty v2 state
    // so the app still boots. The user can manually inspect .corrupted later.
    try {
      await fs.copyFile(CHAT_FILE(), `${CHAT_FILE()}.corrupted`).catch(() => {});
    } catch { /* best-effort */ }
    return { version: 2, updatedAt: null, sessions: [] };
  }

  if (parsed?.version === 2 && Array.isArray(parsed.sessions)) {
    return {
      version: 2,
      updatedAt: parsed.updatedAt || null,
      sessions: normalizeSessions(parsed.sessions),
    };
  }

  // v1 (or unversioned legacy with `histories` at root) → migrate.
  const v2 = migrateV1ToV2(parsed);
  // Best-effort backup of the v1 file before we overwrite it.
  try {
    await fs.copyFile(CHAT_FILE(), V1_BACKUP());
  } catch {
    // Backup failure should not block reads.
  }
  // Persist the migrated shape so subsequent reads are fast and the file no
  // longer carries v1 keys.
  try {
    await atomicWrite(v2);
  } catch {
    // If we cannot write the migrated file (e.g. disk full), still return
    // the in-memory migrated state for this request.
  }
  return v2;
}

async function atomicWrite(payload) {
  await fs.mkdir(path.dirname(CHAT_FILE()), { recursive: true });
  // Write to a sibling temp file, then atomically rename. fs.rename on the
  // same filesystem is atomic on POSIX and on Windows >= NTFS, so a crash
  // mid-write never leaves a half-written chats.local.json behind. The temp
  // name is unique per write so two concurrent writers can't share one .tmp
  // file and interleave bytes into a corrupt rename.
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${CHAT_FILE()}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, CHAT_FILE());
}

async function writeChatFile({ sessions }) {
  const payload = {
    version: 2,
    updatedAt: new Date().toISOString(),
    sessions: pruneSessions(normalizeSessions(sessions)),
  };
  await atomicWrite(payload);
  return payload;
}

// ─── Backward-compat shim (delete with T20 after PR2 UI ships) ────────────────

/**
 * Project v2 sessions back into the v1 { histories, locks } shape that the
 * current useChatAgents.js still expects. Takes the most recent (highest
 * updatedAt) session per agent so users do not lose visible history when
 * v1 → v2 migration runs on first load.
 */
function shimV2ToV1(sessions) {
  const histories = { jace: [], karn: [], tibalt: [], arbiter: [] };
  const locks = { jace: null, karn: null, tibalt: null, arbiter: null };

  const latestPerAgent = new Map();
  for (const session of sessions) {
    if (!AGENT_KEYS.includes(session.agent)) continue;
    const current = latestPerAgent.get(session.agent);
    if (!current || String(session.updatedAt) > String(current.updatedAt)) {
      latestPerAgent.set(session.agent, session);
    }
  }

  for (const [agent, session] of latestPerAgent) {
    histories[agent] = session.messages;
    locks[agent] = session.lockedDeck || null;
  }

  return { histories, locks };
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const state = await readChatFile();
    const exists = state.sessions.length > 0 || Boolean(state.updatedAt);
    const { histories, locks } = shimV2ToV1(state.sessions);

    return Response.json({
      version: 2,
      sessions: state.sessions,
      // Backward-compat shim for useChatAgents.js. Removed after PR2 ships.
      histories,
      locks,
      exists,
      path: CHAT_FILE(),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not load chat file." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!Array.isArray(body?.sessions)) {
      return Response.json(
        { error: "POST body must include a sessions array. (The v1 { histories, locks } shim was removed; update your client.)" },
        { status: 400 }
      );
    }

    const saved = await writeChatFile({ sessions: body.sessions });
    return Response.json({ ...saved, path: CHAT_FILE() });
  } catch (error) {
    if (error.code === "ENOSPC") {
      return Response.json(
        { error: "Disk full — could not save chats. Free up space and try again." },
        { status: 507 }
      );
    }
    return Response.json(
      { error: error.message || "Could not save chat file." },
      { status: 500 }
    );
  }
}
