/**
 * chatPersistence.js (client-side)
 *
 * v2 schema. The server stores { version: 2, sessions: [...] }; this module
 * loads and saves that shape directly. The v1 backward-compat shim that
 * shipped in PR1 was removed once PR2's session-manager UI proved stable
 * and no in-flight tabs were still sending the old { histories, locks }
 * payload (commit-message reference: T20).
 */

// ─── Loaders ──────────────────────────────────────────────────────────────────

/**
 * Returns the current chat state. Shape:
 *   { version: 2, sessions: [...] }
 * The server also includes a histories/locks projection for legacy callers
 * (none remain in this codebase, but the projection is harmless).
 */
export async function loadChatState() {
  try {
    const response = await fetch("/api/chats", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.exists) return null;
    return {
      version: data.version || 2,
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
  } catch {
    return null;
  }
}

// ─── Save ────────────────────────────────────────────────────────────────────

/**
 * Save the full sessions array. POSTs { sessions } to /api/chats which
 * performs an atomic write to data/chats.local.json.
 */
export async function saveSessions(sessions) {
  try {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Debounced save ──────────────────────────────────────────────────────────

let pendingSessions = null;
let pendingTimer = null;

/**
 * Schedule a save of sessions. Coalesces rapid successive calls — only the
 * most-recent sessions payload is written after `delay` ms of quiet.
 */
export function scheduleChatSessionsSave(sessions, delay = 500) {
  pendingSessions = sessions;
  if (pendingTimer) clearTimeout(pendingTimer);
  const timerApi = typeof window !== "undefined" ? window : globalThis;
  pendingTimer = timerApi.setTimeout(() => {
    const toSave = pendingSessions;
    pendingSessions = null;
    pendingTimer = null;
    if (toSave) saveSessions(toSave);
  }, delay);
}

/**
 * Flush any pending save synchronously (or via sendBeacon when useBeacon=true
 * — used by the pagehide/beforeunload handlers so the user does not lose
 * the last few keystrokes when they close the tab).
 */
export function flushChatFileSave({ useBeacon = false } = {}) {
  if (!pendingSessions) return true;

  if (pendingTimer) clearTimeout(pendingTimer);
  const toSave = pendingSessions;
  pendingSessions = null;
  pendingTimer = null;

  if (
    useBeacon &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const payload = new Blob([JSON.stringify({ sessions: toSave })], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/chats", payload);
  }

  saveSessions(toSave);
  return true;
}
