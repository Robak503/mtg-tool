/**
 * AreaBar — the bottom area-switcher (kiosk chrome). Home + one button per
 * AREAS entry (registry-driven: a new area in areas.jsx shows up here
 * automatically). Active area glows green; everything else stays quiet.
 */
import { AREAS } from "./areas";

export default function AreaBar({ area, onEnterArea, onHome, fontFamily }) {
  const baseBtn = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 22px",
    borderRadius: "var(--r-pill)",
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--ley-text-dim)",
    cursor: "pointer",
    fontFamily,
    fontSize: 13,
    fontWeight: 600,
    transition: "border-color .1s, background .1s, color .1s, box-shadow .16s",
  };
  const activeBtn = {
    ...baseBtn,
    border: "1px solid var(--ley-line-bright)",
    background: "var(--ley-green-dim)",
    color: "var(--ley-green)",
    boxShadow: "0 0 12px var(--ley-green-glow)",
  };

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "9px 16px",
        borderTop: "1px solid var(--ley-line)",
        background: "var(--ley-glass-strong)",
        backdropFilter: "blur(14px) saturate(1.15)",
        WebkitBackdropFilter: "blur(14px) saturate(1.15)",
      }}
    >
      <button onClick={onHome} style={baseBtn} title="Back to the landing screen">
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>⌂</span>
        Home
      </button>
      <span aria-hidden style={{ width: 1, height: 20, background: "var(--ley-line)" }} />
      {AREAS.map((a) => (
        <button
          key={a.id}
          onClick={() => onEnterArea(a.id)}
          style={area === a.id ? activeBtn : baseBtn}
          aria-current={area === a.id ? "page" : undefined}
        >
          {a.title}
        </button>
      ))}
    </div>
  );
}
