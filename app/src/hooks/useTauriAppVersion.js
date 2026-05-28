"use client";

import { useEffect, useState } from "react";

/**
 * Returns the Tauri app version (e.g. "0.1.0") if running inside the .exe,
 * or null in a regular browser / SSR.
 *
 * Used by the feedback tools to tag every entry with the build that
 * produced it — essential once the .exe starts cutting releases. Reads
 * once on mount; the version doesn't change at runtime.
 *
 * Detection mirrors the pattern used in UpdatesModal/MTGAssistant.
 */
export default function useTauriAppVersion() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return;
    let cancelled = false;
    (async () => {
      try {
        const app = await import("@tauri-apps/api/app");
        const v = await app.getVersion();
        if (!cancelled && v) setVersion(v);
      } catch {
        /* Not available — leave as null. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return version;
}
