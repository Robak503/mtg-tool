"use client";

/**
 * MulliganLab — opening-hand trainer (P8). Deal a seeded 7 from the deck, call
 * keep or ship, then see the engine's own verdict (its mull-0 land-count logic)
 * and your running agreement rate. Fully local via /api/mulligan-lab.
 */

import { useState } from "react";

export default function MulliganLab({ deckId, fontFamily }) {
  const [hand, setHand] = useState(null);      // { hand, lands, landsUnknown, engineVerdict, seed }
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tally, setTally] = useState({ agreed: 0, total: 0 });

  const deal = async () => {
    setBusy(true); setError(null); setRevealed(false);
    try {
      const r = await fetch("/api/mulligan-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId }),
      });
      const b = await r.json();
      if (!r.ok) { setError(b.error || "Deal failed."); setHand(null); }
      else setHand(b);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const call = (choice) => {
    if (!hand || revealed) return;
    setRevealed(true);
    setTally((t) => ({ agreed: t.agreed + (choice === hand.engineVerdict ? 1 : 0), total: t.total + 1 }));
  };

  const agreePct = tally.total ? Math.round((tally.agreed / tally.total) * 100) : null;
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, fontFamily };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-green)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Mulligan lab</span>
        {tally.total > 0 && (
          <span style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>You agree with the engine {agreePct}% ({tally.agreed}/{tally.total})</span>
        )}
        <button onClick={deal} disabled={busy} className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
          {busy ? "Dealing…" : hand ? "Deal another 7" : "Deal a hand"}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--ley-red)" }}>{error}</div>}

      {hand && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {hand.hand.map((c, i) => (
              <span key={i} style={{
                fontSize: 12, padding: "5px 9px", borderRadius: 6,
                border: `1px solid ${c.isLand ? "var(--ley-line-bright)" : "var(--ley-line)"}`,
                background: c.isLand ? "var(--ley-green-dim)" : "var(--ley-surface-2)",
                color: c.isLand ? "var(--ley-green)" : "var(--ley-text)",
              }}>
                {c.name}{c.isLand ? " 🜃" : ""}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ley-text-dim)", marginBottom: 12 }}>
            {hand.landsUnknown
              ? "Land count unavailable (sync card data to enable land-aware verdicts)."
              : `${hand.lands} land${hand.lands === 1 ? "" : "s"} in hand.`}
          </div>

          {!revealed ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => call("keep")} className="btn btn-primary btn-sm">Keep</button>
              <button onClick={() => call("ship")} className="btn btn-secondary btn-sm">Ship (mulligan)</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ley-text)" }}>
              The engine would <strong style={{ color: hand.engineVerdict === "keep" ? "var(--ley-green)" : "var(--ley-gold)" }}>{hand.engineVerdict === "keep" ? "KEEP" : "SHIP"}</strong> this hand
              <span style={{ color: "var(--ley-text-dim)" }}> — {hand.landsUnknown ? "(land count unknown)" : `${hand.lands} lands, its threshold is 2–5.`}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
