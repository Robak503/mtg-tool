export async function loadJson(key) {
  try {
    if (window.storage?.get) {
      const result = await window.storage.get(key);
      return result ? JSON.parse(result.value) : null;
    }

    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveJson(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (window.storage?.set) {
      await window.storage.set(key, serialized);
      return;
    }

    window.localStorage?.setItem(key, serialized);
  } catch {}
}
