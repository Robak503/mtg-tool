/**
 * AbBenchModal — the A/B card bench UI. Pick which pod deck to bench a swap on, pull a card (dropdown of
 * that deck's cards), bench one in (with a LIVE banlist/legality check as you type), and run the pod both
 * ways on the same seeds. Shows the target deck's win-rate delta with a confidence band + the honest
 * caveat (the bench measures what the sim AI plays). Portaled to <body> so it centres on the whole window.
 */
"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function AbBenchModal({ open, deckIds = [], onClose }) {
  const [decks, setDecks] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [remove, setRemove] = useState("");
  const [add, setAdd] = useState("");
  const [addCheck, setAddCheck] = useState(null); // live commanderLegality verdict for the "bench in" field
  const [games, setGames] = useState(100);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  // Load the four selected decks (with card lists) when the modal opens.
  useEffect(() => {
    if (!open) return;
    setDecks(null); setTargetId(null); setRemove(""); setAdd(""); setAddCheck(null); setError(null); setStatus(null);
    (async () => {
      try {
        // Resolve the pod decks CROSS-PROFILE (a pod can span Colton + Joe) with their card lists.
        const r = await fetch("/api/ab-bench?decks=" + encodeURIComponent(deckIds.join(",")));
        const d = await r.json().catch(() => null);
        const all = Array.isArray(d?.decks) ? d.decks : [];
        const picked = deckIds.map((id) => all.find((x) => x.id === id)).filter(Boolean);
        setDecks(picked);
        setTargetId(picked[0]?.id ?? null);
      } catch { setError("Couldn't load the pod decks."); return; }
      // Sync to an A/B run already in flight on the server (own try — a status hiccup must NOT read as
      // "couldn't load decks", which we just did successfully).
      try {
        const sr = await fetch("/api/ab-bench", { cache: "no-store" });
        const s = await sr.json().catch(() => null);
        if (s?.running) setStatus(s);
      } catch { /* no in-flight sync — harmless */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const target = useMemo(() => (decks || []).find((d) => d.id === targetId) || null, [decks, targetId]);
  // The route returns each deck's cards as a sorted, deduped array of NAMES.
  const targetCards = useMemo(() => (Array.isArray(target?.cards) ? target.cards : []), [target]);

  // Live banlist/legality check on the "bench in" card (debounced) — the guardrail made visible.
  useEffect(() => {
    const name = add.trim();
    if (!name) { setAddCheck(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/ab-bench?check=" + encodeURIComponent(name));
        const v = await r.json().catch(() => null);
        if (alive) setAddCheck(v);
      } catch { /* ignore transient */ }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [add]);

  // Poll the paired run while it's going.
  useEffect(() => {
    if (!open || !status?.running) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/ab-bench", { cache: "no-store" });
        const s = await r.json().catch(() => null);
        if (alive && s) setStatus(s);
      } catch { /* transient */ }
    };
    const id = setInterval(poll, 600);
    return () => { alive = false; clearInterval(id); };
  }, [open, status]);

  const run = async () => {
    setError(null);
    try {
      const r = await fetch("/api/ab-bench", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", deckIds, targetDeckId: targetId, swap: { remove, add: add.trim() }, games, allProfiles: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.started === false) setError(d?.error || `Couldn't start the A/B run${d?.reason ? ` (${d.reason})` : ""}.`);
      else setStatus(d);
    } catch (e) { setError(e?.message || "Couldn't start the A/B run."); }
  };
  const stop = () => fetch("/api/ab-bench", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).catch(() => {});

  if (!open) return null;

  const running = status?.running;
  const done = status?.done;
  const pct = (x) => `${(100 * (x || 0)).toFixed(0)}%`;
  const ci = status?.ci || [0, 0];
  const canRun = Boolean(target && remove && add.trim() && addCheck?.ok && !running);
  const played = status?.played || 0;
  const noData = done && played === 0; // every paired game errored — never a fabricated "no effect"
  const noEffect = done && played > 0 && (status.flipToWin + status.flipToLoss) === 0;
  // Significant only if the 95% band clears 0 AND there's enough data — a tiny run where every game
  // happened to flip the same way makes a zero-variance (0-width) CI that would falsely read "real".
  const significant = done && played >= 15 && (ci[0] > 0 || ci[1] < 0);
  // Colour the delta by SIGNIFICANCE, not sign: green/gold only when the whole 95% band clears 0.
  const deltaColor = ci[0] > 0 ? "var(--ley-green)" : ci[1] < 0 ? "var(--ley-gold)" : "var(--ley-text-dim)";

  const modal = (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !running) onClose?.(); }}>
      <div style={panel}>
        <div style={headRow}>
          <span style={titleStyle}>A/B Card Bench{target ? ` — ${target.name}` : ""}</span>
          <button type="button" style={xBtn} onClick={onClose} disabled={running} title={running ? "Stop the run first" : "Close"}>✕</button>
        </div>
        {error && <div style={errBox}>{error}</div>}

        {!status && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={hint}>Run this pod both ways on the same seeds — one card swapped — and see whether it moves {target?.name || "the deck"}&apos;s win rate.</div>

            <label style={fieldLbl}>Bench the swap on
              <select value={targetId || ""} onChange={(e) => { setTargetId(e.target.value); setRemove(""); }} style={selectStyle}>
                {(decks || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            <label style={fieldLbl}>Pull a card
              <select value={remove} onChange={(e) => setRemove(e.target.value)} style={selectStyle} disabled={!targetCards.length}>
                <option value="">{targetCards.length ? "— pick a card to pull —" : "loading deck…"}</option>
                {targetCards.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label style={fieldLbl}>Bench in
              <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="type a card name…" style={inputStyle} />
              {add.trim() && addCheck && (
                <span style={{ fontSize: 11.5, color: addCheck.ok ? "var(--ley-green)" : "var(--ley-gold)" }}>
                  {addCheck.ok ? `✓ ${addCheck.message}` : `✗ ${addCheck.message}`}
                </span>
              )}
            </label>

            <label style={fieldLbl}>Games each way
              <input type="number" min={1} max={500} value={games} onChange={(e) => setGames(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} style={{ ...inputStyle, width: 90 }} />
            </label>

            <button type="button" style={{ ...runBtn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }} disabled={!canRun} onClick={run}>
              Run A/B — {games} games each way
            </button>
          </div>
        )}

        {status && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--ley-text)" }}>
              <span style={{ color: "var(--ley-gold)" }}>−{status.swap?.removed}</span>{"  "}
              <span style={{ color: "var(--ley-green)" }}>+{status.swap?.added}</span>{"  "}
              <span style={{ color: "var(--ley-text-dim)" }}>on {status.targetName}</span>
            </div>

            <div style={{ height: 8, background: "var(--ley-surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${status.target ? Math.round((100 * status.played) / status.target) : 0}%`, background: "linear-gradient(90deg, var(--ley-green-dim), var(--ley-green))", transition: "width 300ms ease" }} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", fontFamily: "var(--font-mono)" }}>{status.played} / {status.target} games each way {running ? "…" : "✓"}</div>
            {status.error && <div style={errBox}>Run error: {status.error}</div>}

            {noData ? (
              <div style={caveat}>No games completed — every paired game hit an engine error (see above). No result to show.</div>
            ) : (<>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ley-text)" }}>{status.targetName}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ley-text-dim)" }}>{pct(status.baseWinRate)} → {pct(status.varWinRate)}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: deltaColor }}>
                  {status.delta > 0 ? "+" : ""}{(100 * status.delta).toFixed(1)}%
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ley-text-faint)" }}>95% CI {(100 * ci[0]).toFixed(1)}…{(100 * ci[1]).toFixed(1)}%</span>
              </div>

              <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)" }}>
                {status.flipToWin} games flipped to a win · {status.flipToLoss} to a loss.
              </div>
              {done && (
                <div style={{ fontSize: 12, fontWeight: 600, color: significant ? deltaColor : "var(--ley-text-dim)" }}>
                  {significant
                    ? (status.delta > 0 ? "A real gain — the 95% band stays above 0." : "A real loss — the 95% band stays below 0.")
                    : "Within noise — the 95% band still includes 0. Run more games to tighten it."}
                </div>
              )}
              {done && !noEffect && status.whySentences?.length > 0 && (
                <div style={whyBox}>
                  <div style={whyHead}>Why {status.delta > 0 ? "it helped" : status.delta < 0 ? "it hurt" : "it landed flat"}</div>
                  {status.whySentences.map((s, i) => <div key={i} style={whyLine}>• {s}</div>)}
                </div>
              )}
              {done && !noEffect && significant && !(status.whySentences?.length) && (
                <div style={caveat}>The win rate moved for real, but the recorded game-state (mana, speed, win-con) didn&apos;t shift enough to pin a single cause — likely a play-level effect. Card-by-card cast tracing is coming to sharpen this.</div>
              )}
              {done && noEffect && (
                <div style={caveat}>Zero flips — the swap changed nothing the sim AI actually played. That&apos;s honest, not &quot;identical&quot;: the bench measures what the AI does, so a card it never casts reads ~0% (it may still matter at a real table).</div>
              )}
              {done && !noEffect && (
                <div style={caveat}>The bench measures what the sim AI plays on the same seeds — a real read on this pod, tightest where the AI actively uses the card.</div>
              )}
            </>)}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {running
                ? <button type="button" style={ghostBtn} onClick={stop}>■ Stop</button>
                : <button type="button" style={ghostBtn} onClick={() => setStatus(null)}>← New A/B</button>}
              <button type="button" style={ghostBtn} onClick={onClose} disabled={running}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(2,4,3,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const panel = { width: "min(560px, 96vw)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, background: "var(--ley-surface-0)", border: "1px solid var(--ley-line-bright)", borderRadius: "var(--r-lg, 14px)", boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(60,214,130,0.06)", padding: 16 };
const headRow = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const titleStyle = { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--ley-text)" };
const xBtn = { background: "transparent", border: "none", color: "var(--ley-text-dim)", fontSize: 16, cursor: "pointer", lineHeight: 1 };
const errBox = { fontSize: 12, color: "var(--ley-gold)", background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 8, padding: "8px 10px" };
const hint = { fontSize: 12, color: "var(--ley-text-dim)", lineHeight: 1.5 };
const fieldLbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)" };
const selectStyle = { background: "var(--ley-surface-0)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: 6, fontSize: 13, padding: "7px 8px", fontFamily: "var(--font-body, inherit)" };
const inputStyle = { background: "var(--ley-surface-0)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: 6, fontSize: 13, padding: "7px 8px" };
const runBtn = { background: "var(--ley-green-dim)", color: "var(--ley-green)", border: "1px solid var(--ley-line-bright)", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, marginTop: 4 };
const ghostBtn = { background: "transparent", color: "var(--ley-text-dim)", border: "1px solid var(--ley-line)", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" };
const caveat = { fontSize: 11, color: "var(--ley-text-faint)", lineHeight: 1.55, background: "var(--ley-surface-0)", border: "1px dashed var(--ley-line)", borderRadius: 8, padding: "8px 10px" };
const whyBox = { display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px", background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 8 };
const whyHead = { fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ley-green-text)" };
const whyLine = { fontSize: 12, color: "var(--ley-text)", lineHeight: 1.5 };
