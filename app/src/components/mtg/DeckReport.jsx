"use client";

/**
 * DeckReport — the "reality report" (P5). Runs a quick local self-play batch of this deck
 * and shows how it ACTUALLY played: dead-turn rate, avg spells cast, avg lands, mulligan
 * rate, avg X — mined from the recorded decision trajectory. Fully offline via
 * /api/self-play with the `analyze` flag; reads the "user" seat's per-deck reality row.
 */

import { useState } from "react";

export default function DeckReport({ deckId, fontFamily }) {
  const [report, setReport] = useState(null); // the seat-"user" reality row for this deck
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      // Standard 1v1 mirror (deck vs itself) — fast, and the tempo metrics are the deck's
      // own development, so a mirror is a clean solo profile. analyze → per-deck reality rows.
      const r = await fetch("/api/self-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds: [deckId], mode: "standard", gamesPer: 8, analyze: true }),
      });
      const b = await r.json();
      if (!r.ok) { setError(b.error || "Run failed."); setReport(null); return; }
      const mine = (b.reality || []).find((x) => x.seat === "user") || (b.reality || [])[0] || null;
      if (!mine) { setError("No games completed — nothing to report."); setReport(null); return; }
      setReport(mine);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, fontFamily };
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const n1 = (x) => (x == null ? "—" : x.toFixed(1));

  const stats = report ? [
    { label: "Games", value: report.games },
    { label: "Avg length", value: `${n1(report.avgActiveTurns)} turns` },
    { label: "Dead-turn rate", value: pct(report.deadTurnRate), warn: report.deadTurnRate > 0.15 },
    { label: "Spells / game", value: n1(report.avgCasts) },
    { label: "Lands / game", value: n1(report.avgLands) },
    { label: "Mulligan rate", value: n1(report.mulliganRate), warn: report.mulliganRate > 0.8 },
    ...(report.avgX != null ? [{ label: "Avg X paid", value: n1(report.avgX) }] : []),
  ] : [];

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-green)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Reality report</span>
        <span style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>how the deck actually plays, from local self-play</span>
        <button onClick={run} disabled={busy} className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
          {busy ? "Running…" : report ? "Run again" : "Run reality check"}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--ley-red)" }}>{error}</div>}

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ley-line)", background: "var(--ley-surface-2)" }}>
                <div style={{ fontSize: 10, color: "var(--ley-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                <div style={{ fontSize: 18, color: s.warn ? "var(--ley-gold)" : "var(--ley-text)", marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ley-text-dim)", marginTop: 10 }}>
            Over {report.games} local 1v1 game{report.games === 1 ? "" : "s"} (deck vs itself). A high dead-turn or
            mulligan rate is worth a second look at the curve.
          </div>
        </>
      )}
    </div>
  );
}
