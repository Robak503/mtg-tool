/**
 * AreaBar — the bottom area-switcher (kiosk chrome). Home + one button per
 * AREAS entry (registry-driven: a new area in areas.jsx shows up here
 * automatically). Active area glows green; everything else stays quiet.
 */
import { AREAS } from "./areas";

export default function AreaBar({ area, onEnterArea, onHome, fontFamily }) {
  // Layout only — the visual states (idle/hover/active + the magnetic lens
  // that springs between buttons) live on .ley-area-btn in globals.css.
  const baseBtn = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 22px",
    fontFamily,
    fontSize: 13,
    fontWeight: 600,
  };

  return (
    <div
      className="ley-areabar"
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
      <button onClick={onHome} className="ley-area-btn" style={baseBtn} title="Back to the landing screen">
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>⌂</span>
        Home
      </button>
      <span aria-hidden style={{ width: 1, height: 20, background: "var(--ley-line)" }} />
      {AREAS.map((a) => (
        <button
          key={a.id}
          onClick={() => onEnterArea(a.id)}
          className={area === a.id ? "ley-area-btn act" : "ley-area-btn"}
          style={baseBtn}
          aria-current={area === a.id ? "page" : undefined}
        >
          {a.title}
        </button>
      ))}
    </div>
  );
}
