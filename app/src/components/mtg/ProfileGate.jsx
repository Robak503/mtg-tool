"use client";

/**
 * ProfileGate — the full-screen "Who's playing?" launch picker (Netflix-style).
 *
 * Shown on launch before the shell renders. The active profile is already set
 * server-side (last-used), so picking it is friction-free (no reload); picking a
 * different one switches + reloads. Local-first multi-user — no auth.
 *
 * Styled with the runtime `colors` object (GOLD === the cyan hero in Aether) to
 * match the shell, deck view, and modals.
 */
const FD = "var(--font-display), Georgia, serif";

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function ProfileGate({ profiles = [], activeId, onPick, onManage, colors, fontFamily, busy, error }) {
  const { BG, LINE, TEXT, MUTED, GOLD } = colors;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "radial-gradient(ellipse 100% 70% at 50% -10%, rgba(0,242,255,0.07) 0%, rgba(0,242,255,0.015) 32%, transparent 60%), " + BG,
      color: TEXT, fontFamily,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, overflowY: "auto",
    }}>
      <h1 style={{ fontFamily: FD, fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", color: GOLD, margin: "0 0 6px" }}>
        Who&apos;s playing?
      </h1>
      <div style={{ fontSize: 14, color: MUTED, marginBottom: 30, textAlign: "center" }}>
        Pick a profile — your decks, Vault, chats, and games are kept separate per person.
      </div>

      {error && (
        <div style={{ marginBottom: 18, padding: "8px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
          background: "rgba(147,0,10,0.18)", border: "1px solid rgba(255,180,171,0.4)", color: "#ffb4ab" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", maxWidth: 720 }}>
        {profiles.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              className="aether-card"
              disabled={busy}
              onClick={() => onPick(p)}
              title={active ? `${p.name} (current)` : `Switch to ${p.name}`}
              style={{
                width: 150, padding: "22px 14px 16px", cursor: busy ? "default" : "pointer",
                background: active ? "rgba(0,242,255,0.06)" : "var(--surface-container-lowest)",
                border: `1px solid ${active ? "rgba(0,242,255,0.45)" : LINE}`,
                borderRadius: 12, color: TEXT, fontFamily,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                opacity: busy ? 0.55 : 1,
              }}
            >
              <span style={{
                width: 72, height: 72, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: FD, fontSize: 28, fontWeight: 700,
                color: active ? "#00363a" : GOLD,
                background: active ? GOLD : "rgba(0,242,255,0.10)",
                border: `1px solid ${active ? GOLD : "rgba(0,242,255,0.3)"}`,
              }}>
                {initials(p.name)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                {p.name}
              </span>
              {active && <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD }}>current</span>}
            </button>
          );
        })}

        <button
          className="aether-card"
          disabled={busy}
          onClick={onManage}
          title="Create or manage profiles"
          style={{
            width: 150, padding: "22px 14px 16px", cursor: busy ? "default" : "pointer",
            background: "transparent", border: `1px dashed ${LINE}`, borderRadius: 12,
            color: MUTED, fontFamily, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}
        >
          <span style={{ width: 72, height: 72, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: MUTED, border: `1px dashed ${LINE}` }}>+</span>
          <span style={{ fontSize: 14 }}>New / Manage</span>
        </button>
      </div>

      {busy && <div style={{ marginTop: 24, fontSize: 13, color: MUTED }}>Switching profile…</div>}
    </div>
  );
}
