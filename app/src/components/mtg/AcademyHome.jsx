"use client";

/**
 * AcademyHome — The Academy's front door, rebuilt in the JEWEL & MACHINE register
 * (overnight rework 2026-07-19; the Vault V2 pattern is the base).
 *
 * The flat kiosk squares are gone: halls live in the RoomHeader's "Halls ▾"
 * switcher, and the room is a LIVE dashboard — the judge corpus in stat tiles,
 * TODAY'S TRIAL as the showpiece (a real RulesGuru case, deterministic on the
 * UTC day, verdict server-sealed), machined hall doors, and JACE's rail
 * (Room Guides): rules chat + deterministic corpus widgets.
 *
 * onPick(id) contract unchanged: learn / mulligan-reps / judge / library.
 */
import { useEffect, useState } from "react";

import useCountUp from "../../hooks/useCountUp";
import AcademyRail from "./AcademyRail";
import RoomHeader from "./RoomHeader";
import StabilityBadge from "./StabilityBadge";

const HALLS = [
  { id: "learn", label: "Learn to Play" },
  { id: "mulligan-reps", label: "Mulligan Reps" },
  { id: "judge", label: "Judge Trials" },
  { id: "library", label: "Rules & Rulings" },
];

const DOORS = [
  {
    id: "learn",
    title: "Learn to Play",
    badge: "preview",
    blurb: "Play against the engine — 1v1 and Commander 4P, every decision narrated.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3 1 8.5 12 14l9-4.5V15h2V8.5L12 3zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    id: "mulligan-reps",
    title: "Mulligan Reps",
    badge: "preview",
    blurb: "Judge real opening hands, keep or ship — the call that starts every game.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.5" y="7" width="9" height="13" rx="1.6" transform="rotate(-14 7 13.5)" />
        <rect x="8" y="6" width="9" height="13" rx="1.6" />
        <rect x="12.5" y="7" width="9" height="13" rx="1.6" transform="rotate(14 17 13.5)" />
      </svg>
    ),
  },
  {
    id: "library",
    title: "Rules & Rulings",
    badge: "preview",
    blurb: "The Comprehensive Rules, card rulings, and plain-English engine explainers.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" />
        <path d="M9 7h7M9 10.5h7" />
      </svg>
    ),
  },
];

const mono = { fontFamily: "var(--font-mono), monospace" };

export default function AcademyHome({ onPick, fontFamily }) {
  const [stats, setStats] = useState(null);   // { total, levels, ready } | null while loading
  const [trial, setTrial] = useState(null);   // today's sealed case | null
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await (await fetch("/api/judge-quiz")).json();
        if (!alive) return;
        setStats(s);
        if (s?.ready) {
          // Deterministic on the UTC day: the whole install sees ONE trial per day.
          const day = Math.floor(Date.now() / 86400000);
          const t = await (await fetch(`/api/judge-quiz?action=question&seed=${day}`)).json();
          if (alive && t && !t.error) setTrial(t);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  const countCases = useCountUp(stats?.total ?? 0);

  return (
    <div className="ley-stage" style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0, position: "relative" }}>
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        <RoomHeader title="THE ACADEMY" tagline="Learn the game · know the rules" halls={HALLS} onPick={onPick} />

        {error && <div className="ley-glass" style={{ padding: 12, fontSize: 12.5, color: "var(--ley-red)", borderColor: "var(--ley-red)" }}>{error}</div>}

        {/* ── Tile row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 12 }}>
          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("judge")} title="Open Judge Trials">
            <div className="ley-lab">Judge corpus</div>
            <div className="ley-num">{stats ? Math.round(countCases).toLocaleString() : "—"}</div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 2 }}>
              {stats?.ready ? "verified cases, every answer cited to the CR" : stats ? "corpus not ready on this install" : ""}
            </div>
          </div>

          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("judge")} title="Open Judge Trials">
            <div className="ley-lab">Difficulty ladder</div>
            {stats?.ready && Array.isArray(stats.levels) && stats.levels.length ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                {stats.levels.map((l) => (
                  <span key={String(l)} className="ley-qty" style={{ fontSize: 10.5, padding: "3px 9px" }}>{String(l)}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.45 }}>
                {stats ? "The ladder appears once the corpus loads." : "…"}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 6 }}>climb from basics to corner cases</div>
          </div>
        </div>

        {/* ── Today's trial (the showpiece) + hall doors — stretches to the floor ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12, flex: 1, minHeight: 340 }}>
          <div className="ley-glass ley-pane ley-door ley-rise" style={{ padding: "14px 16px", animationDelay: "180ms" }} onClick={() => onPick?.("judge")} title="Take today's trial">
            <div className="ley-lab">Today's trial</div>
            {trial ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* RulesGuru titles ARE the question — only render a title when it adds something. */}
                {trial.title && !String(trial.scenario || "").startsWith(String(trial.title).slice(0, 30)) && (
                  <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 16, fontWeight: 700, color: "var(--ley-text)" }}>
                    {trial.title}
                  </div>
                )}
                <div style={{ fontSize: 13, color: "var(--ley-text)", lineHeight: 1.6 }}>
                  {trial.scenario}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                  {trial.level != null && <span className="ley-qty" style={{ fontSize: 10.5, padding: "3px 9px" }}>difficulty {String(trial.level)}</span>}
                  {(trial.cardNames || []).slice(0, 4).map((n) => (
                    <span key={n} style={{ ...mono, fontSize: 10.5, color: "var(--ley-green)" }}>{n}</span>
                  ))}
                </div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-green)", marginTop: 4 }}>
                  The verdict is sealed — take the trial ▸
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                {stats && !stats.ready
                  ? "The judge corpus isn't bundled on this install — sync data from the Updates panel to open the trials."
                  : "Drawing today's case from the corpus…"}
              </div>
            )}
          </div>

          {/* Hall doors — machined, engraved */}
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

      {/* ── Right rail: Jace ───────────────────────────────────────────────────── */}
      <AcademyRail fontFamily={fontFamily} stats={stats} trial={trial} />
    </div>
  );
}
