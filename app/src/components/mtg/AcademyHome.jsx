/**
 * AcademyHome — The Academy's front door: learn the game and sharpen your rules.
 * Learn-to-Play (against the engine), Judge Trials (the rules quiz), and Rules &
 * Rulings (the old Library, folded in). onPick(id) routes to the centerView, same
 * contract as ProvingHome. Mirrors ProvingHome's layout deliberately.
 */
import StabilityBadge from "./StabilityBadge";

const HALLS = [
  {
    id: "learn",
    title: "Learn to Play",
    badge: "preview",
    blurb: "Play against the engine — 1v1 and Commander 4P, every decision narrated.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3 1 8.5 12 14l9-4.5V15h2V8.5L12 3zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    id: "mulligan-reps",
    title: "Mulligan Reps",
    badge: "preview",
    blurb: "Judge real opening hands, keep or ship — sharpen the call that starts every game.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.5" y="7" width="9" height="13" rx="1.6" transform="rotate(-14 7 13.5)" />
        <rect x="8" y="6" width="9" height="13" rx="1.6" />
        <rect x="12.5" y="7" width="9" height="13" rx="1.6" transform="rotate(14 17 13.5)" />
      </svg>
    ),
  },
  {
    id: "judge",
    title: "Judge Trials",
    badge: "beta",
    blurb: "Test your rules knowledge against ~500 verified judge questions.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z" />
        <path d="M9 21h6" />
      </svg>
    ),
  },
  {
    id: "library",
    title: "Rules & Rulings",
    badge: "preview",
    blurb: "The Comprehensive Rules, card rulings, and plain-English engine explainers.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" />
        <path d="M9 7h7M9 10.5h7" />
      </svg>
    ),
  },
];

export default function AcademyHome({ onPick, fontFamily }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, padding: 32, overflowY: "auto" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 30, margin: 0, color: "var(--ley-text)" }}>
          The Academy
        </h1>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginTop: 6 }}>
          Learn the game. Know the rules.
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {HALLS.map((h) => (
          <button
            key={h.id}
            onClick={() => onPick(h.id)}
            className="ley-card"
            style={{
              width: 250, height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 14, cursor: "pointer", background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              border: "1px solid var(--ley-line)", borderRadius: "var(--r-xl)", color: "var(--ley-green)", fontFamily, padding: 20,
            }}
          >
            <span aria-hidden style={{ filter: "drop-shadow(0 0 10px var(--ley-green-glow))" }}>{h.icon}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display), sans-serif", fontSize: 21, fontWeight: 700, color: "var(--ley-text)" }}>
              {h.title}
              <StabilityBadge level={h.badge} />
            </span>
            <span style={{ fontSize: 12, color: "var(--ley-text-dim)", textAlign: "center", lineHeight: 1.5 }}>{h.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
