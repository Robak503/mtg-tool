const KEY = "omnath.reading.v1";
const defaults = () => ({ schemaVersion: 1, largeText: false, showArt: true, expandRulings: false });

export function createReadingPreferences(storage) {
  let current = defaults();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (saved?.schemaVersion === 1) {
      for (const key of ["largeText", "showArt", "expandRulings"]) {
        if (typeof saved[key] === "boolean") current[key] = saved[key];
      }
    }
  } catch { /* Reading settings remain usable when local storage is unavailable. */ }
  return Object.freeze({
    snapshot: () => Object.freeze({ ...current }),
    update(patch) {
      for (const key of ["largeText", "showArt", "expandRulings"]) {
        if (typeof patch?.[key] === "boolean") current[key] = patch[key];
      }
      let saved = false;
      try {
        if (storage) { storage.setItem(KEY, JSON.stringify(current)); saved = true; }
      } catch { /* The UI reports session-only changes. */ }
      return { ...this.snapshot(), saved };
    },
    reset() {
      current = defaults();
      return this.update(current);
    },
  });
}
