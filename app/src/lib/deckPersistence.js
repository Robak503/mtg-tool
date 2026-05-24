export async function loadDeckFile() {
  try {
    const response = await fetch("/api/decks", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.decks) ? data.decks : null;
  } catch {
    return null;
  }
}

export async function saveDeckFile(decks) {
  try {
    const response = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decks }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createDeckBackup(decks) {
  try {
    const response = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decks, createBackup: true, reason: "manual" }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

let pendingDecks = null;
let pendingTimer = null;

export function scheduleDeckFileSave(decks, delay = 700) {
  pendingDecks = decks;

  if (pendingTimer) clearTimeout(pendingTimer);

  const timerApi = typeof window !== "undefined" ? window : globalThis;
  pendingTimer = timerApi.setTimeout(() => {
    const decksToSave = pendingDecks;
    pendingDecks = null;
    pendingTimer = null;

    if (decksToSave) saveDeckFile(decksToSave);
  }, delay);
}

export function cancelScheduledDeckFileSave() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingDecks = null;
  pendingTimer = null;
}

export function flushDeckFileSave({ useBeacon = false } = {}) {
  if (!pendingDecks) return true;

  if (pendingTimer) clearTimeout(pendingTimer);

  const decksToSave = pendingDecks;
  pendingDecks = null;
  pendingTimer = null;

  if (
    useBeacon &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const payload = new Blob([JSON.stringify({ decks: decksToSave })], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/decks", payload);
  }

  saveDeckFile(decksToSave);
  return true;
}
