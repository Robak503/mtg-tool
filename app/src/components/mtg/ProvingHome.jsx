"use client";

/**
 * ProvingHome — The Crucible's front door, rebuilt in the JEWEL & MACHINE register
 * (overnight rework 2026-07-19; the Vault V2 pattern is the base).
 *
 * The flat kiosk squares are gone: halls live in the RoomHeader's "Halls ▾"
 * switcher, and the room is a LIVE dashboard — stat tiles off the real records
 * archive, the recent-tables ledger, machined door panes for the halls, and
 * TEFERI's rail (Room Guides): chat + deterministic record widgets.
 *
 * Honest states everywhere: no games recorded reads as guidance, never as
 * brokenness, and no number is ever fabricated (hollow-gate law).
 */
import { useEffect, useState } from "react";

import useCountUp from "../../hooks/useCountUp";
import CrucibleRail from "./CrucibleRail";
import RoomHeader from "./RoomHeader";
import StabilityBadge from "./StabilityBadge";
import { seatLine } from "./RecordsView";

const HALLS = [
  { id: "sim", label: "Sim Center" },
  { id: "podbalance", label: "Pod Balance" },
  { id: "records", label: "Table Records" },
  { id: "postmortem", label: "The Reflecting Pool" },
];

/* The hall door panes keep their line-mark icons + blurbs from the square era. */
const DOORS = [
  {
    id: "sim",
    title: "Sim Center",
    badge: "beta",
    blurb: "Self-play batches, stress tests, and the data your decks leave behind.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" />
      </svg>
    ),
  },
  {
    id: "postmortem",
    title: "The Reflecting Pool",
    badge: "preview",
    blurb: "Every deck's dossier — what wins you games, and what loses them.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6l4 4 3-3 4 4" />
        <circle cx="16" cy="15" r="4" />
        <path d="M19 18l2.5 2.5" />
      </svg>
    ),
  },
];

const mono = { fontFamily: "var(--font-mono), monospace" };
const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");
const statusLabel = (s) =>
  s === "user-wins" ? "You won" : s === "ai-wins" ? "The engine won" : s === "draw" ? "Draw" : "—";
const statusColor = (s) =>
  s === "user-wins" ? "var(--ley-green)" : s === "ai-wins" ? "var(--ley-red)" : "var(--ley-text-dim)";

export default function ProvingHome({ onPick, fontFamily }) {
  const [records, setRecords] = useState(null); // null = loading, [] = honest empty
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/records");
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || `Records failed: ${r.status}`);
        if (alive) { setRecords(b.records || []); setError(null); }
      } catch (e) {
        if (alive) { setRecords([]); setError(e.message); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows = records || [];
  const decided = rows.filter((r) => r.status === "user-wins" || r.status === "ai-wins");
  const winPct = decided.length ? Math.round((rows.filter((r) => r.status === "user-wins").length / decided.length) * 100) : null;
  const countGames = useCountUp(rows.length);
  const latest = rows[0] || null;

  return (
    <div className="ley-stage" style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0, position: "relative" }}>
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        <RoomHeader title="THE CRUCIBLE" tagline="Run it · rank it · record it" halls={HALLS} onPick={onPick} />

        {error && <div className="ley-glass" style={{ padding: 12, fontSize: 12.5, color: "var(--ley-red)", borderColor: "var(--ley-red)" }}>{error}</div>}

        {/* ── Tile row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 12 }}>
          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("records")} title="Open Table Records">
            <div className="ley-lab">Games recorded</div>
            <div className="ley-num">{records ? Math.round(countGames).toLocaleString() : "—"}</div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 2 }}>kept forever · full narrated tails</div>
          </div>

          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("records")} title="Open Table Records">
            <div className="ley-lab">Last table</div>
            {latest ? (
              <>
                <div className="ley-delta" style={{ marginTop: 6, color: statusColor(latest.status) }}>{statusLabel(latest.status)}</div>
                <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {seatLine(latest.meta)} · turn {latest.turns ?? "—"} · {when(latest.endedAt)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 6, lineHeight: 1.45 }}>
                {records ? "No games yet — the first finished game lands here." : "…"}
              </div>
            )}
          </div>

          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("postmortem")} title="Open The Reflecting Pool">
            <div className="ley-lab">Win rate</div>
            <div className="ley-num">{winPct != null ? `${winPct}%` : "—"}</div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 2 }}>
              {decided.length
                ? `${rows.filter((r) => r.status === "user-wins").length}W · ${rows.filter((r) => r.status === "ai-wins").length}L across ${decided.length} decided`
                : "no decided games yet"}
            </div>
          </div>
        </div>

        {/* ── Recent tables ledger + hall doors ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12 }}>
          <div className="ley-glass ley-pane ley-rise" style={{ padding: "14px 16px", animationDelay: "180ms" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="ley-lab" style={{ flex: 1 }}>Recent tables</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onPick?.("records")}>Open Table Records →</button>
            </div>
            {rows.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 }}>
                <thead>
                  <tr style={{ ...mono, fontSize: 9.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
                    <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Table</th>
                    <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Result</th>
                    <th style={{ textAlign: "right", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Turns</th>
                    <th style={{ textAlign: "right", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r) => (
                    <tr key={r.id} className="ley-ledger-row" style={{ borderTop: "1px solid var(--ley-line)" }} onClick={() => onPick?.("records")}>
                      <td style={{ padding: "8px 7px", color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{seatLine(r.meta)}</td>
                      <td style={{ padding: "8px 7px", color: statusColor(r.status), fontWeight: 600, fontSize: 11.5, whiteSpace: "nowrap" }}>{statusLabel(r.status)}</td>
                      <td style={{ ...mono, padding: "8px 7px", textAlign: "right", color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums" }}>{r.turns ?? "—"}</td>
                      <td style={{ ...mono, padding: "8px 7px", textAlign: "right", color: "var(--ley-text-dim)", fontSize: 10.5, whiteSpace: "nowrap" }}>{when(r.endedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                {records ? "The archive is empty — finish a game in the Academy or run a Sim Center batch, and every table lands here with its full narrated tail." : "Reading the archive…"}
              </div>
            )}
          </div>

          {/* Hall doors — machined, engraved, one per hall */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {DOORS.map((d, i) => (
              <div
                key={d.id}
                className="ley-glass ley-pane ley-door ley-rise"
                style={{ padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", animationDelay: `${250 + i * 70}ms`, flex: 1 }}
                onClick={() => onPick?.(d.id)}
                title={`Open ${d.title}`}
              >
                <span aria-hidden style={{ color: "var(--ley-green)", filter: "drop-shadow(0 0 10px var(--ley-green-glow))", flexShrink: 0 }}>{d.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 15, fontWeight: 700, color: "var(--ley-text)" }}>{d.title}</span>
                    <StabilityBadge level={d.badge} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ley-text-dim)", lineHeight: 1.45, marginTop: 2 }}>{d.blurb}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right rail: Teferi ─────────────────────────────────────────────────── */}
      <CrucibleRail fontFamily={fontFamily} records={rows} />
    </div>
  );
}
