/**
 * CrucibleRunModal — the one continuous window for a bounded pod run: launch → live telemetry →
 * three results screens. Self-contained (owns its own /api/crucible start + poll lifecycle) so it
 * can't destabilise SimCenter. Drives the C1 backend: POST start, poll status for the glass-tile
 * averages + synopsis stream + progress bar, then GET ?results=1 for the power ranking.
 *
 * Screens: "live" (tiles + stream + bar + Stop) → "podium" (1st→4th by avg finish + most-wins
 * callout) → "highlights" (mined fact reel) → "board" (full leaderboard + per-game log + Bank).
 *
 * NOTE (banked for Colton's taste pass): the podium shows deck names + rank badges tonight;
 * commander card art / partner-overlap / foil shimmer are wired in a later visual pass.
 */

import { useEffect, useRef, useState } from "react";
import { cardImageProxySrc } from "../../lib/cardImage";

const TILE = [
  { key: "turnsPerGame", label: "turns / game", fmt: (v) => v.toFixed(1) },
  { key: "gamesPerMin", label: "games / min", fmt: (v) => v.toFixed(1) },
  { key: "cleanFinishPct", label: "% clean-finish", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "avgKillTurn", label: "avg kill-turn", fmt: (v) => (v ? v.toFixed(1) : "—") },
];

const RANK_LABEL = ["1st", "2nd", "3rd", "4th"];

export default function CrucibleRunModal({ open, deckIds, mode = "commander", target = 100, pilot = "", pilotLabel = "Default AI", onClose, onBanked }) {
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [screen, setScreen] = useState("live");
  const [error, setError] = useState(null);
  const [banking, setBanking] = useState(false);
  const [banked, setBanked] = useState(null);
  const [trainingBank, setTrainingBank] = useState(false); // opt-in: also feed the learning value-model (Q4)
  const startedRef = useRef(false);

  // Start the run once when the modal opens.
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    setScreen("live"); setStatus(null); setResults(null); setError(null); setBanked(null);
    (async () => {
      try {
        const resp = await fetch("/api/crucible", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", deckIds, mode, games: target, pilot: pilot || undefined, allProfiles: true }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.started === false) setError(data?.error || data?.reason || `Could not start the pod (status ${resp.status}).`);
      } catch (e) { setError(e?.message || "Could not start the pod."); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Poll status while the modal is open; fetch results once the run is done.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const poll = async () => {
      try {
        const resp = await fetch("/api/crucible", { cache: "no-store" });
        const s = await resp.json().catch(() => null);
        if (!alive || !s) return;
        setStatus(s);
        if (s.done && !results) {
          const rr = await fetch("/api/crucible?results=1", { cache: "no-store" });
          const rd = await rr.json().catch(() => null);
          if (alive && rd?.results) { setResults(rd.results); setScreen((cur) => (cur === "live" ? "podium" : cur)); }
        }
      } catch { /* transient — the next tick reconciles */ }
    };
    poll();
    const id = setInterval(poll, 600);
    return () => { alive = false; clearInterval(id); };
  }, [open, results]);

  // Reset the "started" latch when closed so a re-open starts fresh.
  useEffect(() => { if (!open) startedRef.current = false; }, [open]);

  const stop = () => { fetch("/api/crucible", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).catch(() => {}); };

  const bank = async () => {
    setBanking(true);
    try {
      const resp = await fetch("/api/crucible", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bank", trainingBank }) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) setError(data?.error || "Banking failed.");
      else { setBanked(data); onBanked?.(data); }
    } catch (e) { setError(e?.message || "Banking failed."); }
    finally { setBanking(false); }
  };

  if (!open) return null;

  const running = status?.running;
  const played = status?.played ?? 0;
  const pct = target ? Math.min(100, Math.round((100 * played) / target)) : 0;
  const tiles = (results?.tiles || status?.tiles) ?? {};
  const clean = results && Array.isArray(results.breakages) && results.breakages.length === 0;

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !running) onClose?.(); }}>
      <div style={panel}>
        {/* Header */}
        <div style={headRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--ley-text)" }}>The Crucible — Pod Read</span>
            <span style={pillTag}>{pilotLabel}</span>
          </div>
          <button type="button" style={xBtn} onClick={onClose} disabled={running} title={running ? "Stop the run first" : "Close"}>✕</button>
        </div>

        {error && <div style={errBox}>{error}</div>}

        {/* Glass tile header — live averages */}
        <div style={tileRow}>
          {TILE.map((t) => (
            <div key={t.key} style={tile}>
              <div style={tileVal}>{Number.isFinite(tiles?.[t.key]) ? t.fmt(tiles[t.key]) : "—"}</div>
              <div style={tileLbl}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ margin: "2px 0 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ley-text-dim)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
            <span>{running ? "grinding…" : results ? "complete" : "starting…"}</span>
            <span>{played} / {target}{status?.stuck ? ` · ${status.stuck} stuck` : ""}</span>
          </div>
          <div style={barTrack}><div style={{ ...barFill, width: `${pct}%` }} /></div>
        </div>

        {/* Body switches by screen */}
        <div style={body}>
          {(!results || screen === "live") && <LiveFeed status={status} />}
          {results && screen === "podium" && <Podium results={results} />}
          {results && screen === "highlights" && <Highlights results={results} />}
          {results && screen === "board" && <Board results={results} />}
        </div>

        {/* Footer nav */}
        <div style={footRow}>
          {running && <button type="button" style={stopBtn} onClick={stop}>■ Stop</button>}
          {results && screen === "podium" && <button type="button" style={nextBtn} onClick={() => setScreen("highlights")}>Highlights →</button>}
          {results && screen === "highlights" && (<>
            <button type="button" style={ghostBtn} onClick={() => setScreen("podium")}>← Podium</button>
            <button type="button" style={nextBtn} onClick={() => setScreen("board")}>Leaderboard →</button>
          </>)}
          {results && screen === "board" && (<>
            <button type="button" style={ghostBtn} onClick={() => setScreen("highlights")}>← Highlights</button>
            {!banked && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ley-text-dim)", cursor: "pointer" }} title="Deterministically replays this pod to feed the learn-to-play value model">
                <input type="checkbox" checked={trainingBank} onChange={(e) => setTrainingBank(e.target.checked)} />
                also feed the learning model
              </label>
            )}
            {banked ? (
              <span style={{ fontSize: 12, color: "var(--ley-green)" }}>
                ✓ Saved{banked.file ? ` → ${banked.file}` : ""}
                {banked.trainingFile ? ` · ${banked.trainingRows} training rows banked` : ""}
                {banked.trainingError ? " · ⚠ training bank failed" : ""}
              </span>
            ) : (
              <button type="button" style={nextBtn} onClick={bank} disabled={banking} title={clean ? "Clean run — save this read's report to Saved Reports" : "Save this read's report (it had some unmodeled cards)"}>
                {banking ? "Saving…" : clean ? "Save this read ✓" : "Save this read"}
              </button>
            )}
            <button type="button" style={ghostBtn} onClick={onClose}>Close</button>
          </>)}
          {!running && !results && <button type="button" style={ghostBtn} onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

function LiveFeed({ status }) {
  const recent = status?.recent || [];
  return (
    <div>
      <div style={sectionLbl}>Live · last {recent.length} games</div>
      {recent.length === 0 ? (
        <div style={{ color: "var(--ley-text-faint)", fontSize: 12, padding: "8px 0" }}>Dealing the first pod…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[...recent].reverse().map((line, i) => (
            <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: i === 0 ? "var(--ley-text)" : "var(--ley-text-dim)", padding: "3px 8px", background: i === 0 ? "var(--ley-green-dim)" : "transparent", borderRadius: 6 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Podium({ results }) {
  const podium = results.podium || [];
  const mostWins = results.mostWins;
  return (
    <div>
      <div style={sectionLbl}>Power ranking — by average finish</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {podium.map((d, i) => (
          <div key={d.id || d.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: i === 0 ? "var(--ley-green)" : "var(--ley-text-dim)", width: 30 }}>{RANK_LABEL[i]}</span>
            <CommanderCards commanders={d.commanders} companion={d.companion} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ley-text)" }}>{d.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ley-text-dim)" }}>{(d.winRate * 100).toFixed(0)}% · avg {d.avgFinish != null ? d.avgFinish.toFixed(2) : "—"}</span>
          </div>
        ))}
      </div>
      {mostWins && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--ley-surface-0)", border: "1px dashed var(--ley-line-bright)", borderRadius: 8, fontSize: 12, color: "var(--ley-text-dim)" }}>
          <strong style={{ color: "var(--ley-green-text)" }}>Most wins:</strong> {mostWins.name} — {mostWins.wins} ({(mostWins.winRate * 100).toFixed(0)}%). Best average and most wins aren&apos;t always the same deck.
        </div>
      )}
    </div>
  );
}

function Highlights({ results }) {
  const h = results.highlights || [];
  return (
    <div>
      <div style={sectionLbl}>Highlights</div>
      {h.length === 0 ? (
        <div style={{ color: "var(--ley-text-faint)", fontSize: 12 }}>No standout facts this run.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {h.map((c, i) => (
            <div key={i} style={{ padding: "8px 10px", background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ley-green-text)", fontFamily: "var(--font-mono)" }}>{c.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--ley-text)", marginTop: 2 }}>{c.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Board({ results }) {
  const rows = results.standings || [];
  const perGame = results.perGame || [];
  return (
    <div>
      <div style={sectionLbl}>Leaderboard</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ ...boardRow, color: "var(--ley-text-faint)", fontSize: 10, textTransform: "uppercase" }}>
          <span style={{ flex: 1 }}>Deck</span><span style={boardCol}>Win%</span><span style={boardCol}>Avg</span><span style={{ width: 108 }}>1/2/3/4</span><span style={{ width: 120 }}>Top win-con</span>
        </div>
        {rows.map((d) => (
          <div key={d.id || d.name} style={boardRow}>
            <span style={{ flex: 1, color: "var(--ley-text)", fontWeight: 600 }}>{d.name}</span>
            <span style={boardCol}>{(d.winRate * 100).toFixed(0)}%</span>
            <span style={boardCol}>{d.avgFinish != null ? d.avgFinish.toFixed(2) : "—"}</span>
            <span style={{ width: 108, fontFamily: "var(--font-mono)", color: "var(--ley-text-dim)" }}>{(d.finish || []).join("/")}</span>
            <span style={{ width: 120, color: "var(--ley-text-dim)" }}>{d.topWinCon || "—"}</span>
          </div>
        ))}
      </div>
      {Array.isArray(results.breakages) && results.breakages.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionLbl}>Unmodeled / broken cards</div>
          {results.breakages.slice(0, 8).map((c) => (
            <div key={c.card} style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ley-amber, #d8b34e)" }}>{c.card} ×{c.count}</div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={sectionLbl}>Per-game finishes ({perGame.length})</div>
        <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {perGame.slice(-200).map((g, i) => (
            <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ley-text-dim)" }}>
              {(g.order && g.order.length ? g.order.join(" › ") : `${g.winner || "?"} (${g.result})`)}{Number.isFinite(g.turns) ? ` · t${g.turns}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Commander card art for a podium row — the deck's commander(s) as real card frames (resolved by name
// via the local /api/card-image cache-proxy). Partners overlap; a partner+companion set stacks to three.
// (Foil shimmer is a follow-on — the run results don't yet carry each commander's printing/foil status.)
function CommanderCards({ commanders = [], companion }) {
  const cards = [...(commanders || []).map((name) => ({ name })), ...(companion ? [{ name: companion }] : [])];
  if (!cards.length) return null;
  const W = 40, H = 56, OVERLAP = 15;
  return (
    <div style={{ position: "relative", width: W + (cards.length - 1) * OVERLAP, height: H, flexShrink: 0 }} title={cards.map((c) => c.name).join(" + ")}>
      {cards.map((c, i) => (
        <img
          key={i}
          src={cardImageProxySrc(c) || undefined}
          alt={c.name}
          loading="lazy"
          style={{ position: "absolute", left: i * OVERLAP, top: 0, width: W, height: H, objectFit: "cover", objectPosition: "top center", borderRadius: 4, border: "1px solid var(--ley-line-bright)", boxShadow: "0 2px 8px rgba(0,0,0,0.55)", background: "var(--ley-surface-2)", zIndex: i }}
        />
      ))}
    </div>
  );
}

/* ── styles (LEYLINE tokens) ── */
const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(2,4,3,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const panel = { width: "min(680px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--ley-surface-0)", border: "1px solid var(--ley-line-bright)", borderRadius: "var(--r-lg, 14px)", boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(60,214,130,0.06)", padding: 16 };
const headRow = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 };
const pillTag = { fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ley-green-text)", padding: "2px 8px", border: "1px solid var(--ley-line-bright)", borderRadius: 999 };
const xBtn = { background: "transparent", border: "none", color: "var(--ley-text-dim)", fontSize: 16, cursor: "pointer", padding: 4 };
const errBox = { background: "rgba(180,60,50,0.14)", border: "1px solid rgba(180,60,50,0.4)", color: "#f0b5ae", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10 };
const tileRow = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 };
const tile = { background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: 10, padding: "8px 6px", textAlign: "center" };
const tileVal = { fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ley-green)" };
const tileLbl = { fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 };
const barTrack = { height: 8, borderRadius: 999, background: "var(--ley-surface-2)", overflow: "hidden", border: "1px solid var(--ley-line)" };
const barFill = { height: "100%", background: "linear-gradient(90deg, var(--ley-green-dim), var(--ley-green))", transition: "width 300ms ease", boxShadow: "0 0 12px rgba(60,214,130,0.4)" };
const body = { flex: 1, overflowY: "auto", minHeight: 120, padding: "4px 2px" };
const footRow = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" };
const sectionLbl = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
const nextBtn = { background: "var(--ley-green-dim)", color: "var(--ley-green)", border: "1px solid var(--ley-line-bright)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { background: "transparent", color: "var(--ley-text-dim)", border: "1px solid var(--ley-line)", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" };
const stopBtn = { background: "rgba(180,60,50,0.16)", color: "#f0b5ae", border: "1px solid rgba(180,60,50,0.45)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginRight: "auto" };
const boardRow = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 4px", borderBottom: "1px solid var(--ley-line)" };
const boardCol = { width: 48, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ley-text-dim)" };
