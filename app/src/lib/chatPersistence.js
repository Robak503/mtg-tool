/**
 * chatPersistence.js (client-side)
 *
 * v2 schema-aware persistence with a backward-compat shim. The server stores
 * { version: 2, sessions: [...] }; this module exposes BOTH the v1 shape
 * ({ histories, locks }) for the current useChatAgents.js and the v2 shape
 * ({ sessions }) for PR2's session manager UI.
 *
 * After PR2 lands, delete loadChatState's histories/locks projection and the
 * scheduleChatFileSave histories overload (search for "T20" markers).
 */

// ─── Loaders ──────────────────────────────────────────────────────────────────

/**
 * Returns the current chat state. Shape:
 *   { version: 2, sessions: [...], histories: {...}, locks: {...} }
 * The histories/locks fields are derived from sessions and are kept for
 * backward compatibility with useChatAgents.js.
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
      histories: data.histories || null,
      locks: data.locks || null,
    };
  } catch {
    return null;
  }
}

export async function loadChatFile() {
  const state = await loadChatState();
  return state?.histories || null;
}

// ─── Savers ───────────────────────────────────────────────────────────────────

/**
 * Save the full sessions array directly (v2 client). PR2 callers use this.
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

/**
 * v1 shim: save by histories/locks. Server converts to sessions internally.
 * T20: remove this after PR2 UI ships and useChatAgents.js calls saveSessions.
 */
export async function saveChatFile(histories, locks = {}) {
  try {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ histories, locks }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Debounced save ──────────────────────────────────────────────────────────

// Pending state is one of:
//   { kind: "sessions", sessions }                     ← v2 callers
//   { kind: "v1-shim", histories, locks }              ← current callers
let pendingState = null;
let pendingTimer = null;

/**
 * Schedule a save of sessions (v2). Coalesces with any pending v1 shim save.
 */
export function scheduleChatSessionsSave(sessions, delay = 500) {
  pendingState = { kind: "sessions", sessions };
  armTimer(delay);
}

/**
 * Schedule a save of v1 histories/locks (current useChatAgents.js path).
 * T20: remove after PR2 UI ships.
 */
export function scheduleChatFileSave(histories, locks = {}, delay = 500) {
  pendingState = { kind: "v1-shim", histories, locks };
  armTimer(delay);
}

function armTimer(delay) {
  if (pendingTimer) clearTimeout(pendingTimer);
  const timerApi = typeof window !== "undefined" ? window : globalThis;
  pendingTimer = timerApi.setTimeout(() => {
    const stateToSave = pendingState;
    pendingState = null;
    pendingTimer = null;
    if (!stateToSave) return;
    if (stateToSave.kind === "sessions") {
      saveSessions(stateToSave.sessions);
    } else {
      saveChatFile(stateToSave.histories, stateToSave.locks);
    }
  }, delay);
}

/**
 * Flush any pending save synchronously (or via sendBeacon when useBeacon=true
 * — used by the pagehide/beforeunload handlers so the user does not lose the
 * last few keystrokes when they close the tab).
 */
export function flushChatFileSave({ useBeacon = false } = {}) {
  if (!pendingState) return true;

  if (pendingTimer) clearTimeout(pendingTimer);
  const stateToSave = pendingState;
  pendingState = null;
  pendingTimer = null;

  // Build the beacon payload in the same shape the route expects so the
  // beacon survives the shim removal in T20 without coordinating clients
  // and server.
  const beaconBody = stateToSave.kind === "sessions"
    ? { sessions: stateToSave.sessions }
    : { histories: stateToSave.histories, locks: stateToSave.locks };

  if (
    useBeacon &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const payload = new Blob([JSON.stringify(beaconBody)], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/chats", payload);
  }

  if (stateToSave.kind === "sessions") {
    saveSessions(stateToSave.sessions);
  } else {
    saveChatFile(stateToSave.histories, stateToSave.locks);
  }
  return true;
}
