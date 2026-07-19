"use client";

/**
 * VaultRail — Vihaan's rail: the Vault's guide config riding the shared RoomRail
 * (the Room Guides pattern this rail pioneered — see RoomRail.jsx for the shell).
 *
 * Colton's design, verbatim from the sketch session (vault-dashboard-rework-spec.md):
 * chat rides the rail full-height; when an answer needs a visual, THE CHAT CUTS TO
 * HALF SIZE and the widget loads ABOVE it. The deterministic reports ARE the widgets —
 * chips and chat summon the same three V1 canvases, all fed from the dashboard payload
 * (no new endpoints, no fabricated numbers): value · movers · grails.
 *
 * LANE LAW (Colton): Vihaan is the COLLECTOR's guide. Deck power / deck building =
 * Karn's bench — the system prompt routes those instead of answering out of lane.
 */
import { useMemo } from "react";

import RoomRail from "./RoomRail";

const mono = { fontFamily: "var(--font-mono), monospace" };

function RailSparkline({ series, height = 110 }) {
  const path = useMemo(() => {
    const pts = (series || []).filter((p) => Number.isFinite(p?.value));
    if (pts.length < 2) return null;
    const W = 300, H = height;
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * (W - 8) + 4);
    const vals = pts.map((p) => p.value);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const ys = vals.map((v) => H - 6 - ((v - min) / span) * (H - 20));
    const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    return { d, area: `${d} L${xs[xs.length - 1].toFixed(1)},${H - 4} L${xs[0].toFixed(1)},${H - 4} Z`, last: vals[vals.length - 1], end: [xs[xs.length - 1], ys[ys.length - 1]] };
  }, [series, height]);
  if (!path) return <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>The value line draws itself as daily snapshots accumulate.</div>;
  return (
    <svg viewBox={`0 0 300 ${height}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id="vr-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(57,245,126,0.28)" />
          <stop offset="100%" stopColor="rgba(57,245,126,0)" />
        </linearGradient>
        <linearGradient id="vr-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1d9e54" />
          <stop offset="75%" stopColor="#39f57e" />
          <stop offset="100%" stopColor="#6dffa1" />
        </linearGradient>
        <filter id="vr-blur" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g stroke="rgba(167,243,208,0.07)" strokeWidth="1">
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1="0" y1={height * k} x2="300" y2={height * k} />
        ))}
      </g>
      <path d={path.area} fill="url(#vr-grad)" stroke="none" />
      <path d={path.d} fill="none" stroke="var(--ley-green)" strokeWidth="3" strokeLinejoin="round" opacity="0.55" filter="url(#vr-blur)" />
      <path d={path.d} fill="none" stroke="url(#vr-stroke)" strokeWidth="2" strokeLinejoin="round" />
      {path.end && <circle cx={path.end[0]} cy={path.end[1]} r="2.8" fill="#6dffa1" />}
    </svg>
  );
}

const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The three V1 widgets, rendered from the dashboard payload. */
function VihaanWidget({ kind, payload: dashboard }) {
  if (!dashboard) return <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)" }}>Loading vault data…</div>;
  if (kind === "value") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>Value history</span>
          <span style={{ ...mono, fontSize: 13, color: "var(--ley-text)" }}>{usd(dashboard.vaultValue)}</span>
        </div>
        <div style={{ marginTop: 8 }}><RailSparkline series={dashboard.valueSeries} /></div>
      </div>
    );
  }
  if (kind === "movers") {
    const m = dashboard.movers;
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>Week's movers</span>
        {m?.status === "ok" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {[{ tag: "▲", row: m.winner, color: "var(--ley-green)" }, { tag: "▼", row: m.loser, color: "var(--ley-red)" }].map(({ tag, row, color }) => (
              <div key={tag} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag} {row.name}</span>
                <span style={{ ...mono, color }}>{row.pctChange > 0 ? "+" : ""}{row.pctChange.toFixed(1)}% ({usd(row.current)})</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--ley-text-dim)" }}>7-day window · owned cards only</div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>
            Building a week of price history — {m?.reason || "not enough snapshots yet"}.
          </div>
        )}
      </div>
    );
  }
  if (kind === "grails") {
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>Grail shelf</span>
        {dashboard.grails?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {dashboard.grails.map((g) => (
              <div key={g.scryfallId || g.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.flagged ? "★ " : ""}{g.name}</span>
                <span style={{ ...mono, color: "var(--ley-text-dim)" }}>{usd(g.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>No treasure flagged yet — star a signed or showcase card in The Stacks.</div>
        )}
      </div>
    );
  }
  return null;
}

/** Vihaan's V1 charter: collector scope, grounded numbers, lane discipline. */
function vihaanSystem(dashboard) {
  const facts = dashboard ? {
    uniquePrintings: dashboard.uniquePrintings,
    totalQuantity: dashboard.totalQuantity,
    vaultValue: dashboard.vaultValue,
    movers: dashboard.movers,
    grails: dashboard.grails?.map((g) => ({ name: g.name, value: g.value, flagged: g.flagged })),
    topRows: dashboard.rows?.slice(0, 12),
  } : null;
  return [
    "You are Vihaan, the Vault's guide — the collector's assistant in a Magic: The Gathering collection app.",
    "Scope: THIS user's collection — value, price movement, grails/showpieces, set completion, trades, acquisition.",
    "Ground every number in the VAULT DATA below. If the data says history is insufficient, say exactly that — never invent a price, a trend, or a delta.",
    "LANE RULE: deck power level, deck building, cuts/adds are KARN's job at the deck bench (The Agents room). If asked, say so in one friendly line and point them to Karn — do not answer out of lane.",
    "Keep answers short and concrete (2-5 sentences). Plain text only.",
    facts ? `VAULT DATA (live): ${JSON.stringify(facts)}` : "VAULT DATA: unavailable right now — say so if asked for numbers.",
  ].join("\n");
}

export const VIHAAN_GUIDE = {
  agentName: "vihaan",
  name: "VIHAAN",
  role: "the Vault's guide",
  artCard: "Vihaan, Goldwaker",
  monogram: "V",
  systemPrompt: vihaanSystem,
  chips: [
    { kind: "value", label: "Value history" },
    { kind: "movers", label: "Week's movers" },
    { kind: "grails", label: "Grail shelf" },
  ],
  defaultWidget: "value",
  widgetRouter: (lower) => {
    if (/\b(value|worth).*(history|graph|chart|over time)|history of.*value/.test(lower)) return "value";
    if (/\b(mover|winner|loser|gain|drop|spike)/.test(lower)) return "movers";
    if (/\b(grail|showpiece|shelf|signed)/.test(lower)) return "grails";
    return null;
  },
  Widget: VihaanWidget,
  emptyChatHint: "Ask about your collection — value, movers, grails, trades. (Deck questions live with Karn at the bench.)",
  placeholder: "Ask about your collection…",
};

export default function VaultRail({ fontFamily, dashboard }) {
  return <RoomRail fontFamily={fontFamily} guide={VIHAAN_GUIDE} payload={dashboard} />;
}
