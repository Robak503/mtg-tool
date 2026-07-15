/**
 * ProvingHome — The Crucible's front door: run your decks and read the results.
 * The Sim Center (self-play at scale + bounded pod power-reads), Pod Balance (how
 * your decks stack up), and Table Records (every finished game, kept). Learn-to-play
 * and Judge Trials moved to The Academy.
 */
import StabilityBadge from "./StabilityBadge";

const GROUNDS = [
  {
    id: "sim",
    title: "Sim Center",
    badge: "beta",
    blurb: "Self-play batches, stress tests, and the data your decks leave behind.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M7 14l3-4 3 3 4-6" />
        <circle cx="7" cy="14" r="1" />
        <circle cx="17" cy="7" r="1" />
      </svg>
    ),
  },
  {
    id: "podbalance",
    title: "Pod Balance",
    badge: "beta",
    blurb: "Compare power across every deck in the tool — find the fair pod.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" />
      </svg>
    ),
  },
  {
    id: "records",
    title: "Table Records",
    badge: "preview",
    blurb: "Every finished game, kept — results, turns, and the full narrated tail.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M15 3v4h4" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
      </svg>
    ),
  },
  {
    // id stays "postmortem" internally (routing/palette key on it); the USER sees "The Reflecting Pool".
    id: "postmortem",
    title: "The Reflecting Pool",
    badge: "preview",
    blurb: "Every deck's dossier — the record, what wins you games, and what loses them.",
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6l4 4 3-3 4 4" />
        <circle cx="16" cy="15" r="4" />
        <path d="M19 18l2.5 2.5" />
      </svg>
    ),
  },
];

export default function ProvingHome({ onPick, fontFamily }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        padding: 32,
        overflowY: "auto",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 30,
            margin: 0,
            color: "var(--ley-text)",
          }}
        >
          The Crucible
        </h1>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginTop: 6 }}>
          Run it. Rank it. Record it.
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {GROUNDS.map((g) => (
          <button
            key={g.id}
            onClick={() => onPick(g.id)}
            className="ley-card"
            style={{
              width: 250,
              height: 280,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              cursor: "pointer",
              background: "var(--ley-glass)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid var(--ley-line)",
              borderRadius: "var(--r-xl)",
              color: "var(--ley-green)",
              fontFamily,
              padding: 20,
            }}
          >
            <span aria-hidden style={{ filter: "drop-shadow(0 0 10px var(--ley-green-glow))" }}>
              {g.icon}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-display), sans-serif",
                fontSize: 21,
                fontWeight: 700,
                color: "var(--ley-text)",
              }}
            >
              {g.title}
              <StabilityBadge level={g.badge} />
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--ley-text-dim)",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              {g.blurb}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
