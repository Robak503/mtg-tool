"use client";

/**
 * RoomHeader — the shared room masthead of the JEWEL & MACHINE register (overnight
 * rework, 2026-07-19): chrome hero title on the left, the HALLS dropdown on the
 * right. Every room (Vault · Crucible · Academy · Agents) wears this same header,
 * so the app reads as one building with four wings.
 *
 * Naming (Colton: "we may wanna rename that"): the four big spaces are ROOMS
 * (the bottom bar); the spaces inside a room are HALLS — so the switcher reads
 * "Halls ▾", and the room/hall words stop colliding.
 *
 * Z-ORDER (Colton's bug: "the drop down… falls behind the win/loss panel"):
 * filled .ley-rise animations keep a transform stacking context on every sibling
 * pane, so a dropdown's z-index only competed INSIDE the header's own context and
 * DOM-later tiles painted over it. The header root pins its own stacking context
 * ABOVE the content (zIndex 50) — structural fix, not a bigger z-index war.
 */
import { useEffect, useRef, useState } from "react";

export default function RoomHeader({ title, tagline = null, halls = [], onPick, menuLabel = "Halls", right = null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click / Escape — this is the app's canonical switcher now.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="ley-rise" style={{ display: "flex", alignItems: "center", gap: 14, animationDelay: "40ms", position: "relative", zIndex: 50 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span className="ley-hero-title">{title}</span>
        {tagline && (
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ley-text-faint)" }}>
            {tagline}
          </span>
        )}
      </div>
      {right}
      <div ref={rootRef} style={{ marginLeft: "auto", position: "relative" }}>
        {halls.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
            {menuLabel} ▾
          </button>
        )}
        {open && (
          <div className="ley-glass-strong ley-glass-lit" role="menu" style={{ position: "absolute", right: 0, top: "110%", zIndex: 60, minWidth: 180, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {halls.map((h) => (
              <button
                key={h.id}
                role="menuitem"
                onClick={() => { setOpen(false); onPick?.(h.id); }}
                style={{ textAlign: "left", padding: "7px 10px", fontSize: 12.5, background: "transparent", border: "none", color: "var(--ley-text)", cursor: "pointer", borderRadius: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ley-green-dim)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
