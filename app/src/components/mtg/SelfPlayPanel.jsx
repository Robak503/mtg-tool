"use client";

/**
 * Shared presentational pieces for self-play stress-test results, rendered by
 * SimCenter (the live Sim Center view). The interactive SelfPlayPanel that
 * used to live here was superseded by SimCenter and removed as dead code —
 * nothing imported its default export.
 *
 * CREED: everything rendered here is the REAL /api/self-play response shape.
 * We never fabricate outcomes or breakages, and non-completions are surfaced
 * honestly. `breakages` is breakageReport.aggregateBreakages().cards —
 *   [{ card, count, kinds:{kind:n}, sampleReason, sampleTurn }] (ranked).
 */

/**
 * BreakageTable — pure presentational render of the ranked breakage list.
 * Exported so it can be unit-tested in isolation without mounting the whole
 * panel (the panel's data comes from a live fetch). `cards` is the API's
 * `breakages` array verbatim.
 */
export function BreakageTable({ cards }) {
  const list = Array.isArray(cards) ? cards : [];

  if (list.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--ley-text-dim)",
          lineHeight: 1.5,
          padding: "8px 10px",
          background: "var(--ley-surface-2)",
          border: "1px solid var(--ley-line)",
          borderRadius: "var(--r-sm)",
        }}
      >
        No unmodeled / broken cards — no spell-unresolved, stack-resolve-error, or
        trigger-removed entries appeared in any game&rsquo;s log. Either every card
        resolved natively, or the decks played out without reaching them.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--ley-line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 56px 1fr",
          gap: 8,
          padding: "7px 10px",
          background: "var(--ley-surface-1)",
          borderBottom: "1px solid var(--ley-line)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ley-text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>Card</span>
        <span style={{ textAlign: "right" }}>Count</span>
        <span>Kinds · sample</span>
      </div>
      {list.map((c, i) => {
        const kinds = Object.entries(c.kinds || {})
          .map(([k, n]) => `${k}×${n}`)
          .join(", ");
        return (
          <div
            key={`${c.card}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 56px 1fr",
              gap: 8,
              padding: "7px 10px",
              borderTop: i === 0 ? "none" : "1px solid var(--ley-line)",
              background: i % 2 ? "var(--ley-surface-2)" : "transparent",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ley-text)",
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 600 }}>{c.card}</span>
            <span style={{ textAlign: "right", color: "var(--ley-gold)", fontWeight: 700 }}>{c.count}</span>
            <span style={{ color: "var(--ley-text-dim)" }}>
              {kinds}
              {c.sampleReason ? (
                <span style={{ display: "block", marginTop: 2, opacity: 0.85 }}>
                  ↳ {c.sampleReason}
                  {c.sampleTurn != null ? ` (turn ${c.sampleTurn})` : ""}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * OutcomeSummary — pure render of the outcome tally + avg turns. Honest about
 * non-completions (engine-stuck / dispatch-error / setup-error): they're shown
 * in a distinct warning row, never folded into draws.
 */
export function OutcomeSummary({ outcomes, avgTurns, games }) {
  const o = outcomes || {};
  const nonCompletions =
    (o.engineStuck || 0) + (o.dispatchError || 0) + (o.setupError || 0) + (o.unexpected || 0) +
    (o.timeouts || 0);

  const stat = (label, value, accent) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 78 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: accent || "var(--ley-text)", lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );

  return (
    <div
      style={{
        background: "var(--ley-surface-2)",
        border: "1px solid var(--ley-line)",
        borderRadius: "var(--r-sm)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {stat("Games", games ?? o.total ?? 0, "var(--ley-gold)")}
        {stat("Completed", `${o.completed ?? 0}/${o.total ?? 0}`)}
        {stat("Seat-1 wins", o.userWins ?? 0, "var(--ley-green)")}
        {stat("Opp wins", o.aiWins ?? 0, "var(--ley-red)")}
        {stat("Draws", o.draws ?? 0, "var(--ley-text-dim)")}
        {stat("Avg turns", avgTurns ? Number(avgTurns).toFixed(1) : "0")}
      </div>
      {nonCompletions > 0 && (
        <div style={{ fontSize: 11, color: "var(--ley-red)", lineHeight: 1.5, borderTop: "1px solid var(--ley-line)", paddingTop: 8 }}>
          ⚠ {nonCompletions} game{nonCompletions === 1 ? "" : "s"} did not complete (reported honestly):{" "}
          {[
            o.engineStuck ? `engine-stuck ×${o.engineStuck}` : null,
            o.dispatchError ? `dispatch-error ×${o.dispatchError}` : null,
            o.setupError ? `setup-error ×${o.setupError}` : null,
            o.unexpected ? `unexpected ×${o.unexpected}` : null,
            o.timeouts ? `timeout ×${o.timeouts}` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </div>
      )}
    </div>
  );
}

// Win tables the runner has computed + persisted since v0.86.0 (HB-7) and no
// component rendered (wave Q7). summary = summarizeSeatOutcomes(): games,
// decisiveGames, bySeat/byDeck/onThePlay entries {wins, games, winRate,
// ci95 {lo, hi}}. Wilson CIs keep small samples honest.
export function SeatSummaryTables({ summary }) {
  if (!summary || !summary.games) return null;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const line = (e) => `${e.wins}/${e.games} · ${pct(e.winRate)}${e.ci95 ? ` [${pct(e.ci95.lo)}–${pct(e.ci95.hi)}]` : ""}`;
  const head = { fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 };
  const rowStyle = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--ley-line)" };
  const Table = ({ title, table }) => {
    const rows = Object.entries(table || {});
    if (!rows.length) return null;
    return (
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={head}>{title}</div>
        {rows.map(([k, e]) => (
          <div key={k} style={rowStyle}>
            <span style={{ color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
            <span style={{ color: "var(--ley-green)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{line(e)}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Table title="Win rate by deck" table={summary.byDeck} />
        <Table title="By turn-order seat" table={summary.bySeat} />
      </div>
      <div style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>
        On the play: {summary.onThePlay?.games ? line(summary.onThePlay) : "—"} · decisive {summary.decisiveGames}/{summary.games} games
      </div>
    </div>
  );
}
