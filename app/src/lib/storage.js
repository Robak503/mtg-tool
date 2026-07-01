// Thin async JSON wrappers over localStorage. Async is kept so callers can
// stay agnostic about the backing store (a future Tauri store could be
// awaited here without touching call sites).
export async function loadJson(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveJson(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {}
}
