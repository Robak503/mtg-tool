"use client";

/**
 * ProfileManageModal — create / rename / delete local profiles.
 *
 * Mirrors the SettingsModal / OnboardingWizard overlay conventions. Delete is
 * blocked for the active profile (switch away first) and for the last remaining
 * profile (the server enforces this too). Switching reloads via the parent.
 */
import { useState } from "react";

const FD = "var(--font-display), Georgia, serif";

export default function ProfileManageModal({ profiles = [], activeId, onCreate, onRename, onDelete, onSwitch, onClose, colors, fontFamily }) {
  const { BG2, LINE, TEXT, MUTED, GOLD } = colors;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const guard = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message || "Something went wrong"); } finally { setBusy(false); }
  };

  const create = () => {
    if (!name.trim() || busy) return;
    guard(async () => { await onCreate(name.trim()); setName(""); });
  };
  const rename = (p) => {
    if (busy || typeof window === "undefined") return;
    const next = window.prompt("Rename profile:", p.name);
    if (next === null || !next.trim() || next.trim() === p.name) return;
    guard(() => onRename(p.id, next.trim()));
  };
  const remove = (p) => {
    if (busy || typeof window === "undefined") return;
    if (!window.confirm(`Delete "${p.name}"? This permanently removes that profile's decks, Vault, chats, and games. This cannot be undone.`)) return;
    guard(() => onDelete(p.id));
  };

  const btn = (variant) => ({
    fontFamily, fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${variant === "danger" ? "rgba(255,180,171,0.45)" : LINE}`,
    background: "transparent", color: variant === "danger" ? "#ffb4ab" : MUTED,
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 420, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 500, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 60px)",
        background: BG2, border: `1px solid ${LINE}`, borderRadius: 12,
        display: "flex", flexDirection: "column", color: TEXT, fontFamily, overflow: "hidden",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: "-0.01em" }}>Profiles</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 20, width: 24, height: 24, lineHeight: 1 }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {error && (
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: "rgba(147,0,10,0.18)", border: "1px solid rgba(255,180,171,0.4)", color: "#ffb4ab" }}>
              {error}
            </div>
          )}

          {/* Create */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder="New profile name…"
              disabled={busy}
              style={{ flex: 1, padding: "8px 10px", background: "var(--surface-container-lowest)", border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, fontFamily, fontSize: 13 }}
            />
            <button onClick={create} disabled={busy || !name.trim()} style={{
              fontFamily, fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: busy || !name.trim() ? "default" : "pointer",
              background: GOLD, color: "#00363a", border: `1px solid ${GOLD}`, opacity: busy || !name.trim() ? 0.5 : 1,
            }}>Create</button>
          </div>

          {/* List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p) => {
              const active = p.id === activeId;
              const last = profiles.length <= 1;
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                  background: "var(--surface-container-lowest)", border: `1px solid ${active ? "rgba(0,242,255,0.35)" : LINE}`,
                }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FD, fontSize: 13, fontWeight: 700, color: active ? "#00363a" : GOLD, background: active ? GOLD : "rgba(0,242,255,0.12)" }}>
                    {(p.name.trim()[0] || "?").toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                    {active && <span style={{ marginLeft: 8, fontFamily: "var(--font-mono), monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>current</span>}
                  </span>
                  {!active && <button onClick={() => onSwitch(p.id)} disabled={busy} style={{ ...btn(), color: GOLD, borderColor: "rgba(0,242,255,0.4)" }}>Switch</button>}
                  <button onClick={() => rename(p)} disabled={busy} style={btn()}>Rename</button>
                  <button
                    onClick={() => remove(p)}
                    disabled={busy || active || last}
                    title={active ? "Switch to another profile first" : last ? "Can't delete the only profile" : "Delete profile"}
                    style={{ ...btn("danger"), opacity: busy || active || last ? 0.4 : 1, cursor: busy || active || last ? "default" : "pointer" }}
                  >Delete</button>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: 16, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
            Each profile keeps its own decks, Vault collection, chats, and games. Card data, combos, rules, and model settings are shared across all profiles.
          </p>
        </div>
      </div>
    </div>
  );
}
