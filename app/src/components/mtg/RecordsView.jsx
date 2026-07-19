"use client";

/**
 * RecordsView — the completed-game archive (P2 v1): every finished Academy
 * game persists now instead of being deleted at game over. List → detail with
 * the narrated log tail. Replay scrubber + self-play records are the wave's
 * parked follow-ups (UPGRADE-BACKLOG P2).
 */

import { useEffect, useState } from "react";
import { LearnLogEntry, groupLogByTurn } from "./LearnLogEntry.jsx";

// Shared with the Crucible home + Teferi's rail — ONE interpretation of a record's seats.
export const seatLine = (meta) => {
  if (!meta) return "—";
  if (Array.isArray(meta.seatNames) && meta.seatNames.length) return meta.seatNames.join(" vs ");
  if (meta.deckName) return meta.oppName ? `${meta.deckName} vs ${meta.oppName}` : meta.deckName;
  return "—";
};
const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");
const statusColor = (s) =>
  s === "user-wins" ? "var(--ley-green)" : s === "ai-wins" ? "var(--ley-red)" : "var(--ley-text-dim)";

/**
 * RecordDetail — a single record's header + the P7 REPLAY SCRUBBER. Groups the
 * recorded decisionLog into per-turn segments and steps through them (prev / next
 * / jump-to-turn), rendering each entry with the SAME LearnLogEntry the live
 * "Recent actions" feed uses — so the play-by-play reads like the live game.
 * (Replaces the old `logTail.join("\n")` detail, which rendered structured entry
 * objects as "[object Object]".) Mounted with key={record.id} so the scrub index
 * resets when a different record is opened.
 */
function RecordDetail({ record, card }) {
  const groups = groupLogByTurn(record.logTail);
  const [idx, setIdx] = useState(0);
  const clamped = Math.min(Math.max(idx, 0), Math.max(0, groups.length - 1));
  const seg = groups[clamped] || null;
  const turnLabel = (g) => (g && g.turn != null ? `T${g.turn}` : "—");

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{seatLine(record.meta)}</span>
        <span style={{ fontSize: 12, color: statusColor(record.status), fontWeight: 600 }}>{record.status || "unknown result"}</span>
        <span style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>turn {record.turns ?? "—"} · {record.difficulty || "—"} · {when(record.endedAt)}</span>
      </div>

      {groups.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>No log lines were captured for this game.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setIdx(() => Math.max(0, clamped - 1))} disabled={clamped <= 0}>◂ Prev</button>
            <span style={{ fontSize: 11, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums", minWidth: 120, textAlign: "center" }}>
              {turnLabel(seg)} · segment {clamped + 1}/{groups.length}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setIdx(() => Math.min(groups.length - 1, clamped + 1))} disabled={clamped >= groups.length - 1}>Next ▸</button>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {groups.map((g, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="btn btn-ghost btn-sm"
                style={{ minWidth: 34, ...(i === clamped ? { background: "var(--ley-green-dim)", borderColor: "var(--ley-green)", color: "var(--ley-green)" } : {}) }}
                title={`Jump to ${turnLabel(g)}`}
              >
                {turnLabel(g)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
            {seg.entries.map((entry, i) => (
              <LearnLogEntry key={i} entry={entry} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function RecordsView({ onBack, fontFamily }) {
  const [state, setState] = useState({ status: "loading", records: [], error: null });
  const [open, setOpen] = useState(null); // { record } | null
  const [openBusy, setOpenBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/records", { cache: "no-store" });
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", records: [], error: body.error || "Failed to load records." });
        else setState({ status: "ready", records: body.records || [], error: null });
      } catch (e) {
        setState({ status: "error", records: [], error: e.message });
      }
    })();
  }, []);

  const openRecord = async (id) => {
    if (openBusy) return;
    setOpenBusy(true);
    try {
      const resp = await fetch(`/api/records?id=${encodeURIComponent(id)}`);
      const body = await resp.json();
      if (resp.ok) setOpen(body.record);
    } finally {
      setOpenBusy(false);
    }
  };

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", fontFamily, color: "var(--ley-text)" };
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 16 };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      {onBack && <button onClick={() => (open ? setOpen(null) : onBack())} className="btn btn-ghost btn-sm">← {open ? "All records" : "Proving Grounds"}</button>}
      <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", letterSpacing: "-0.02em" }}>
        Table Records
      </h1>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
        every finished game, kept
      </span>
    </div>
  );

  if (state.status === "loading") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Opening the ledger…</div></div>;
  if (state.status === "error") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-red)" }}>{state.error}</div></div>;

  if (open) {
    return (
      <div style={wrap}>
        {header}
        <RecordDetail key={open.id} record={open} card={card} />
      </div>
    );
  }

  return (
    <div style={wrap}>
      {header}
      {state.records.length === 0 ? (
        <div style={card}>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.6 }}>
            No finished games yet. Play one out in the Academy and it lands here —
            result, turns, and the full narrated tail. (Games finished before
            v0.91.0 were discarded at game over; from now on they keep.)
          </div>
        </div>
      ) : (
        <div style={card}>
          {state.records.map((r) => (
            <button
              key={r.id}
              onClick={() => openRecord(r.id)}
              className="ley-row"
              style={{ display: "flex", alignItems: "baseline", gap: 12, width: "100%", textAlign: "left", padding: "9px 6px", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--ley-text)", fontFamily }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seatLine(r.meta)}</span>
              <span style={{ fontSize: 11, color: statusColor(r.status), fontWeight: 600, flexShrink: 0 }}>{r.status || "?"}</span>
              <span style={{ fontSize: 11, color: "var(--ley-text-faint)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>t{r.turns ?? "—"} · {when(r.endedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
