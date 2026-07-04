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
  const { LINE, TEXT, MUTED, GOLD } = colors;
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 420, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="ley-glass-strong ley-glass-lit" style={{
        width: 500, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 60px)",
        display: "flex", flexDirection: "column", color: TEXT, fontFamily, overflow: "hidden",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: "-0.01em" }}>Profiles</span>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon">×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {error && (
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: "var(--ley-red-dim)", border: "1px solid var(--ley-red)", color: "var(--ley-red)" }}>
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
            <button onClick={create} disabled={busy || !name.trim()} className="btn btn-primary btn-sm">Create</button>
          </div>

          {/* List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p) => {
              const active = p.id === activeId;
              const last = profiles.length <= 1;
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                  background: "var(--surface-container-lowest)", border: `1px solid ${active ? "var(--ley-line-bright)" : LINE}`,
                }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FD, fontSize: 13, fontWeight: 700, color: active ? "var(--ley-on-green)" : GOLD, background: active ? GOLD : "var(--ley-green-dim)" }}>
                    {(p.name.trim()[0] || "?").toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                    {active && <span style={{ marginLeft: 8, fontFamily: "var(--font-mono), monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>current</span>}
                  </span>
                  {!active && <button onClick={() => onSwitch(p.id)} disabled={busy} className="btn btn-secondary btn-sm">Switch</button>}
                  <button onClick={() => rename(p)} disabled={busy} className="btn btn-ghost btn-sm">Rename</button>
                  <button
                    onClick={() => remove(p)}
                    disabled={busy || active || last}
                    title={active ? "Switch to another profile first" : last ? "Can't delete the only profile" : "Delete profile"}
                    className="btn btn-danger btn-sm"
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
