"use client";

/**
 * MatchupLedger — deck-vs-deck records across every banked self-play run (P4).
 * Reads /api/self-play?action=matchups (aggregated from the run sidecars) and
 * renders an overall win-rate list + a head-to-head heat table. Fills up as
 * self-play runs accumulate; empty until the first recorded run.
 */

import { useEffect, useState } from "react";

const pct = (w, g) => (g > 0 ? Math.round((w / g) * 100) : null);
// Green intensity by win rate, for the heat cell background.
const heat = (p) => {
  if (p == null) return "transparent";
  const a = 0.08 + (p / 100) * 0.5;
  return `rgba(86, 214, 93, ${a.toFixed(2)})`;
};

export default function MatchupLedger({ fontFamily }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/self-play?action=matchups", { cache: "no-store" });
        setState({ status: r.ok ? "ready" : "error", data: r.ok ? await r.json() : null });
      } catch {
        setState({ status: "error", data: null });
      }
    })();
  }, []);

  if (state.status === "loading") return null;
  const { decks = [], soloWins = {}, pair = {}, games = 0 } = state.data || {};

  const card = { background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", padding: "12px 14px", fontFamily };
  if (games === 0) {
    return (
      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Matchup ledger</div>
        <div style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>No recorded games yet — run self-play (Sim Center or &quot;Prove it&quot;) and deck-vs-deck records build up here.</div>
      </div>
    );
  }

  // Cap the grid to the 8 most-played decks so it stays legible.
  const shown = decks.slice(0, 8);
  const short = (n) => (n.length > 14 ? n.slice(0, 13) + "…" : n);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-green)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Matchup ledger</span>
        <span style={{ fontSize: 11, color: "var(--ley-text-faint)" }}>{games} recorded games</span>
      </div>

      {/* Overall win rate */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
        {shown.map((d) => {
          const s = soloWins[d];
          const p = pct(s.wins, s.games);
          return (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</span>
              <span style={{ width: 90, height: 5, background: "var(--ley-surface-1)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                <span style={{ display: "block", width: `${p ?? 0}%`, height: "100%", background: "var(--ley-green)" }} />
              </span>
              <span style={{ width: 64, textAlign: "right", color: "var(--ley-green)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{p == null ? "—" : `${p}%`} <span style={{ color: "var(--ley-text-faint)", fontSize: 10 }}>({s.games})</span></span>
            </div>
          );
        })}
      </div>

      {/* Head-to-head heat table (row beats column) */}
      {shown.length >= 2 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 10.5 }}>
            <thead>
              <tr>
                <th style={{ padding: "3px 6px", textAlign: "left", color: "var(--ley-text-faint)", fontWeight: 400 }}>beats ↓ →</th>
                {shown.map((c) => (
                  <th key={c} style={{ padding: "3px 5px", color: "var(--ley-text-dim)", fontWeight: 400, whiteSpace: "nowrap" }} title={c}>{short(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a}>
                  <td style={{ padding: "3px 6px", color: "var(--ley-text)", whiteSpace: "nowrap" }} title={a}>{short(a)}</td>
                  {shown.map((b) => {
                    if (a === b) return <td key={b} style={{ padding: "3px 5px", textAlign: "center", color: "var(--ley-text-faint)" }}>—</td>;
                    const e = pair[`${a}||${b}`];
                    const p = e ? pct(e.aWins, e.games) : null;
                    return (
                      <td key={b} title={e ? `${a} beat ${b} in ${e.aWins}/${e.games}` : "no games"} style={{ padding: "3px 5px", textAlign: "center", background: heat(p), color: "var(--ley-text)", fontVariantNumeric: "tabular-nums" }}>
                        {p == null ? "·" : `${p}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9.5, color: "var(--ley-text-faint)", marginTop: 6 }}>Cell = row deck&apos;s win rate in games that also contained the column deck. Small samples are noisy.</div>
        </div>
      )}
    </div>
  );
}
