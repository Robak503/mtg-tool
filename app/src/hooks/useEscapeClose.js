"use client";

/**
 * useEscapeClose — one shared Escape-to-close behavior for every modal/overlay
 * (wave Q1; the "one modal behavior" follow-up to v0.87.0's one-button system).
 *
 * Escape from a focused input/textarea/select/contentEditable is ignored so a
 * user backing out of a field edit never loses the whole modal; pass
 * { disabled: true } while a modal is mid-flight (sync running, save pending)
 * to hold it open.
 */

import { useEffect } from "react";

export default function useEscapeClose(onClose, { disabled = false } = {}) {
  useEffect(() => {
    if (disabled || typeof onClose !== "function") return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, disabled]);
}
