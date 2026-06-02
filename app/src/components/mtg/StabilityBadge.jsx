/**
 * StabilityBadge — a tiny Preview / Beta label for features that aren't fully
 * finished yet (master-plan §1 / D3). Stable features get no badge (absence =
 * stable), so the badges stay high-signal: they only mark the rough edges.
 *
 *   Preview — early, expect gaps (e.g. The Academy / learn-to-play).
 *   Beta    — works, still being tuned (e.g. goldfish scoring, power ranking).
 */
const PALETTE = {
  preview: { border: "#a06fd8", text: "#c6a6f0", bg: "rgba(160,111,216,0.14)" },
  beta: { border: "#b08a3e", text: "#e8c285", bg: "rgba(176,138,62,0.14)" },
};

export default function StabilityBadge({ level, style, title }) {
  const p = PALETTE[level];
  if (!p) return null; // unknown / "stable" → no badge
  return (
    <span
      title={title || (level === "preview" ? "Preview — early, expect gaps" : "Beta — works, still being tuned")}
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: p.text,
        border: `1px solid ${p.border}`,
        background: p.bg,
        borderRadius: 3,
        padding: "1px 5px",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {level}
    </span>
  );
}
