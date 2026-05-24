export async function loadChatState() {
  try {
    const response = await fetch("/api/chats", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.exists) return null;
    return { histories: data.histories || null, locks: data.locks || null };
  } catch {
    return null;
  }
}

export async function loadChatFile() {
  const state = await loadChatState();
  return state?.histories || null;
}

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

let pendingState = null;
let pendingTimer = null;

export function scheduleChatFileSave(histories, locks = {}, delay = 500) {
  pendingState = { histories, locks };

  if (pendingTimer) clearTimeout(pendingTimer);

  const timerApi = typeof window !== "undefined" ? window : globalThis;
  pendingTimer = timerApi.setTimeout(() => {
    const stateToSave = pendingState;
    pendingState = null;
    pendingTimer = null;

    if (stateToSave) saveChatFile(stateToSave.histories, stateToSave.locks);
  }, delay);
}

export function flushChatFileSave({ useBeacon = false } = {}) {
  if (!pendingState) return true;

  if (pendingTimer) clearTimeout(pendingTimer);

  const stateToSave = pendingState;
  pendingState = null;
  pendingTimer = null;

  if (
    useBeacon &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const payload = new Blob([JSON.stringify(stateToSave)], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/chats", payload);
  }

  saveChatFile(stateToSave.histories, stateToSave.locks);
  return true;
}
