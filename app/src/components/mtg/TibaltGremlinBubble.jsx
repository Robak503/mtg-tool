/**
 * TibaltGremlinBubble — the red interjection bubble (NEXT-QUEUE A1; Omnath's [O2] UI register).
 *
 * PURE presentational component: the bubble it is given, a dismiss handler, nothing else. All the
 * policy (whether a bubble may exist) is server-side; by the time this renders, the jab is allowed.
 *
 * The UI laws it is bound to (feedback_ui_nuance_ledger — three are test-enforced):
 *  - Tibalt's EXISTING registry tokens (#ffb4ab family) — the intrusion signature is already his.
 *  - Avatar = his real card art (/api/art-crop, Tibalt the Fiend-Blooded), monogram "T" fallback.
 *  - Entrance is ONE-SHOT .ley-rise (~520ms) and nothing else moves — NO infinite animation
 *    (the pulse ban is enforced by test; see TibaltGremlinBubble.test.jsx).
 *  - Glass surface composed from the app's glass geometry with red overrides (Tibalt is not green).
 *  - Dismissible, and the dismissal is DATA (the reaction feeds Omnath's tuning ledger).
 */

import { AGENTS } from "../../lib/agents.js";

export default function TibaltGremlinBubble({ bubble, onDismiss }) {
  if (!bubble?.jab) return null;
  const t = AGENTS.tibalt;
  return (
    <div
      className="ley-rise"
      role="status"
      style={{
        position: "fixed", right: 18, bottom: 18, zIndex: 60, maxWidth: 380,
        display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
        background: `linear-gradient(155deg, ${t.dim}, transparent 45%), var(--ley-glass)`,
        backdropFilter: "blur(var(--ley-blur)) saturate(1.4)",
        border: `1px solid ${t.border}`,
        borderRadius: "var(--r-lg)",
        boxShadow: `0 0 18px ${t.glow}, var(--ley-top-edge)`,
      }}
    >
      <div className="ley-avatar" aria-hidden="true" style={{ borderColor: t.border, flexShrink: 0 }}>
        <span className="ley-avatar-fallback">T</span>
        <img
          src={`/api/art-crop?name=${encodeURIComponent("Tibalt, the Fiend-Blooded")}`}
          alt=""
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: t.color, marginBottom: 4 }}>TIBALT</div>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ley-text, #e8e8e8)" }}>{bubble.jab}</div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: "none", border: "none", color: t.color, cursor: "pointer",
          fontSize: 14, lineHeight: 1, padding: "2px 4px", flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
