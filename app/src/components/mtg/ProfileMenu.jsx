"use client";

/**
 * ProfileMenu — the active-profile chip + dropdown in the header.
 *
 * Shows the current profile; the dropdown lists the others (switch reloads via
 * the parent's onSwitch) plus a "Manage profiles" entry. Styled to match the
 * header's bordered-chip vocabulary.
 */
import { useEffect, useRef, useState } from "react";

export default function ProfileMenu({ activeProfile, profiles = [], activeId, onSwitch, onManage, colors, fontFamily }) {
  const { LINE, TEXT, MUTED, GOLD } = colors;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const name = activeProfile?.name || "Profile";
  const initial = (name.trim()[0] || "?").toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch profile"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          border: `1px solid ${LINE}`, borderRadius: 5, background: open ? "var(--ley-green-dim)" : "transparent",
          color: TEXT, cursor: "pointer", fontFamily, fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap",
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "var(--ley-on-green)", background: GOLD,
        }}>{initial}</span>
        <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <span style={{ color: MUTED, fontSize: 9 }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="ley-glass-strong ley-glass-lit" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 80, minWidth: 200,
          padding: 6,
        }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ley-text-faint)", padding: "4px 8px 6px" }}>
            Profiles
          </div>
          {profiles.map((p) => {
            const active = p.id === activeId;
            return (
              <button
                key={p.id}
                className="ley-row"
                disabled={active}
                onClick={() => { setOpen(false); if (!active) onSwitch(p.id); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                  padding: "7px 8px", borderRadius: 6, cursor: active ? "default" : "pointer",
                  background: active ? "var(--ley-green-dim)" : "transparent", color: active ? GOLD : TEXT,
                  fontFamily, fontSize: 12,
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: active ? "var(--ley-on-green)" : GOLD,
                  background: active ? GOLD : "var(--ley-green-dim)",
                }}>{(p.name.trim()[0] || "?").toUpperCase()}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {active && <span style={{ fontSize: 9, color: GOLD }}>●</span>}
              </button>
            );
          })}
          <div style={{ height: 1, background: LINE, margin: "6px 4px" }} />
          <button
            className="ley-row"
            onClick={() => { setOpen(false); onManage(); }}
            style={{
              width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 6,
              cursor: "pointer", background: "transparent", color: MUTED, fontFamily, fontSize: 12,
            }}
          >
            + New / manage profiles
          </button>
        </div>
      )}
    </div>
  );
}
