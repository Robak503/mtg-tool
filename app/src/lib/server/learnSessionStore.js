/**
 * In-memory session store for Phase 6 Learn-to-Play.
 *
 * GameState objects are large (full 100-card library × per-permanent
 * state + stack + log), so round-tripping them on every HTTP request
 * would burn bandwidth and force the client to validate untrusted
 * input. Instead the routes hold sessions in memory keyed by id; the
 * client only sees { sessionId, decision }.
 *
 * Lifetime: process lifetime. Sessions don't survive a dev-server
 * restart. That's a feature in v1 — when you reload the page mid-game
 * you start fresh. PR7+ can add disk persistence to data/learn-sessions/
 * if the user wants to resume across restarts.
 *
 * The store is intentionally a singleton at module scope. Tests use
 * the resetStore helper to clear it between cases.
 */

const SESSIONS = new Map();
const MAX_SESSIONS = 50;  // simple LRU-ish cap to keep memory bounded
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;  // 4 hours; long enough for any session

function pruneOld() {
  const now = Date.now();
  for (const [id, session] of SESSIONS) {
    const createdAt = Date.parse(session.createdAt || 0);
    if (Number.isFinite(createdAt) && now - createdAt > SESSION_TTL_MS) {
      SESSIONS.delete(id);
    }
  }
  // Hard cap fallback — drop oldest if we exceeded the limit even
  // after TTL prune.
  while (SESSIONS.size > MAX_SESSIONS) {
    const oldestKey = SESSIONS.keys().next().value;
    SESSIONS.delete(oldestKey);
  }
}

export function putSession(session) {
  if (!session?.id) throw new Error("putSession: session must have an id");
  pruneOld();
  SESSIONS.set(session.id, session);
  return session;
}

export function getSession(id) {
  if (!id) return null;
  return SESSIONS.get(id) || null;
}

export function deleteSession(id) {
  if (!id) return false;
  return SESSIONS.delete(id);
}

/** Returns the number of sessions currently held. Tests + diagnostics. */
export function sessionCount() {
  return SESSIONS.size;
}

/** Clear the entire store. Used between tests. */
export function resetStore() {
  SESSIONS.clear();
}
