"use client";

/**
 * DeckReadyView — the post-import "deck ready" moment (wave Q3). Import used
 * to dump the user silently into chat while the auto-rate ran invisibly; this
 * confirms the save, streams the machine rating in as it lands (the deck prop
 * re-renders when the store's fire-and-forget auto-rate writes powerRank),
 * and offers the natural next steps.
 */

const isMain = (c) => c.section !== "Sideboard" && c.section !== "Tokens";

export default function DeckReadyView({ deck, onChat, onView, onKarn, onTibalt, onPodBalance, fontFamily }) {
  const rank = deck?.memory?.powerRank;
  const mainCount = (deck?.cards || []).filter(isMain).reduce((s, c) => s + (c.qty || 0), 0);
  const tokenCount = (deck?.cards || []).filter((c) => c.section === "Tokens").reduce((s, c) => s + (c.qty || 0), 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 32, overflowY: "auto", fontFamily }}>
      <div
        className="ley-glass"
        style={{ width: 460, maxWidth: "100%", padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", border: "1px solid var(--ley-line-bright)" }}
      >
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ley-green)" }}>
          Deck saved
        </div>
        <h1 style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 26, margin: 0, color: "var(--ley-text)" }}>
          {deck?.name || "Your deck"}
        </h1>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>
          {mainCount} cards{tokenCount ? ` · ${tokenCount} tokens` : ""}
          {deck?.memory?.owner ? ` · ${deck.memory.owner}` : ""}
        </div>

        <div style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {rank?.powerLevel != null ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 30, fontWeight: 700, color: "var(--ley-green)", textShadow: "0 0 12px var(--ley-green-glow)" }}>
                {rank.powerLevel}
              </span>
              <span style={{ fontSize: 13, color: "var(--ley-text)" }}>
                Bracket {rank.bracket ?? "?"}{rank.bracketLabel ? ` · ${rank.bracketLabel}` : ""}
              </span>
              <span style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                rated locally
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>
              Rating the deck locally…
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onView} className="btn btn-primary btn-sm">View deck</button>
          <button onClick={onKarn} className="btn btn-secondary btn-sm" title="Ask Karn for an upgrade plan">Karn: plan</button>
          <button onClick={onTibalt} className="btn btn-secondary btn-sm" title="Let Tibalt roast it">Tibalt: roast</button>
          <button onClick={onPodBalance} className="btn btn-secondary btn-sm">Pod Balance</button>
          <button onClick={onChat} className="btn btn-ghost btn-sm">Just chat →</button>
        </div>
      </div>
    </div>
  );
}
