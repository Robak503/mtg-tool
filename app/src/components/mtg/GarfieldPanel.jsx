"use client";

/**
 * GarfieldPanel — the Garfield goldfish panel shown inside DeckView: runs solo
 * playtests of the active deck and renders the results classified by archetype.
 * LEYLINE surface: composes from var(--ley-*) tokens and the shared .btn system.
 */

import { useEffect, useState } from "react";

import StabilityBadge from "./StabilityBadge";

function ArchetypeBadge({ archetype, confidence, fontFamily }) {
  if (!archetype) return null;
  return (
    <span
      title={confidence ? `${confidence}% of recent runs classified as ${archetype}` : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--ley-line-bright)",
        background: "var(--ley-green-faint)",
        color: "var(--ley-green-text)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontFamily,
      }}
    >
      {archetype}{confidence ? ` · ${confidence}%` : ""}
    </span>
  );
}

function PacingBar({ label, value, color }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: "var(--ley-text-dim)" }}>{label}</span>
      <div style={{ height: 6, background: "var(--ley-surface-3)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${bounded}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--ley-text-dim)", textAlign: "right" }}>{bounded}%</span>
    </div>
  );
}

function TrendArrow({ trend }) {
  if (trend === "improving") return <span style={{ color: "var(--ley-green)" }}>↑</span>;
  if (trend === "regressing") return <span style={{ color: "var(--ley-red)" }}>↓</span>;
  return <span style={{ color: "var(--ley-text-faint)" }}>→</span>;
}

export default function GarfieldPanel({
  activeDeckId,
  deckMemory,
  fontFamily,
  goldfishResult,
  goldfishRunning,
  hasData,
  loadDeckData,
  runGoldfish,
}) {
  const latestRuns = deckMemory.goldfishRuns || [];
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState(null);

  // Fetch insights for the active deck. Re-fetch when the deck changes, when
  // we just finished a run (goldfishRunning flipped back to false), or on
  // mount.
  useEffect(() => {
    if (!activeDeckId) {
      setInsights(null);
      return undefined;
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/games-summary?deckId=${encodeURIComponent(activeDeckId)}`, { cache: "no-store" });
        if (!response.ok) {
          setInsightsError(`status ${response.status}`);
          return;
        }
        const data = await response.json();
        if (active) {
          setInsights(data);
          setInsightsError(null);
        }
      } catch (error) {
        if (active) setInsightsError(error.message || "fetch failed");
      }
    })();
    return () => { active = false; };
  }, [activeDeckId, goldfishRunning]);

  const archetypeFromLatestRun = goldfishResult?.archetype || goldfishResult?.runs?.[0]?.archetype;
  const archetypeFromHistory = insights?.archetype?.consensus;
  const archetypeToShow = archetypeFromLatestRun || archetypeFromHistory;
  const confidence = goldfishResult
    ? (goldfishResult.archetypeConfidence ?? goldfishResult.runs?.[0]?.archetypeConfidence)
    : insights?.archetype?.confidence;

  return (
    <div style={{ background: "var(--ley-surface-1)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Garfield Goldfish v2
            </span>
            <StabilityBadge level="beta" />
            <ArchetypeBadge archetype={archetypeToShow} confidence={confidence} fontFamily={fontFamily} />
          </div>
          <div style={{ color: "var(--ley-text)", fontSize: 13, lineHeight: 1.45 }}>
            Opening hand and turn 1-6 execution check with archetype-aware play.
          </div>
          {!hasData && (
            <div style={{ color: "var(--ley-gold)", fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>
              Garfield will load analytics automatically before running.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!hasData && (
            <button onClick={loadDeckData} disabled={goldfishRunning} className="btn btn-ghost btn-sm">
              Load Analytics
            </button>
          )}
          <button
            onClick={() => runGoldfish(1)}
            disabled={goldfishRunning}
            className={`btn btn-primary btn-sm${goldfishRunning ? " ley-live" : ""}`}
          >
            {goldfishRunning ? "Running..." : "Run"}
          </button>
          <button onClick={() => runGoldfish(10)} disabled={goldfishRunning} className="btn btn-secondary btn-sm">
            Run 10
          </button>
        </div>
      </div>

      {/* Insights from history — only when there's enough data */}
      {insights && insights.count >= 2 && (
        <div style={{ background: "var(--ley-surface-0)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-sm)", padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              History ({insights.count} runs)
            </span>
            <span style={{ fontSize: 11, color: "var(--ley-text)" }}>
              Avg <strong style={{ color: "var(--ley-green)" }}>{insights.score.avg}/100</strong>
              {insights.score.recent5Avg > 0 && (
                <span style={{ color: "var(--ley-text-dim)" }}> · recent 5: {insights.score.recent5Avg} <TrendArrow trend={insights.score.trend} /></span>
              )}
            </span>
          </div>

          <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
            <PacingBar label="Commander ≤T4" value={insights.pacing.commanderByTurn4Rate} color="var(--ley-green)" />
            <PacingBar label="Early ramp" value={insights.pacing.earlyRampRate} color="var(--ley-green)" />
            <PacingBar label="Early draw" value={insights.pacing.earlyDrawRate} color="var(--ley-green)" />
            <PacingBar label="Threat ≤T5" value={insights.pacing.threatByTurn5Rate} color="var(--ley-green)" />
            <PacingBar label="Mulligan rate" value={insights.mulligan.rate} color="var(--ley-gold)" />
          </div>

          {(insights.weakSignals?.length > 0 || insights.strongSignals?.length > 0) && (
            <div style={{ borderTop: "1px solid var(--ley-line)", paddingTop: 6, display: "grid", gap: 3 }}>
              {insights.strongSignals?.map((signal, i) => (
                <div key={`s-${i}`} style={{ fontSize: 11, color: "var(--ley-green)", lineHeight: 1.4 }}>
                  ✓ {signal}
                </div>
              ))}
              {insights.weakSignals?.map((signal, i) => (
                <div key={`w-${i}`} style={{ fontSize: 11, color: "var(--ley-gold)", lineHeight: 1.4 }}>
                  ⚠ {signal}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {insights && insights.count > 0 && insights.count < 2 && (
        <div style={{ fontSize: 11, color: "var(--ley-text-dim)", lineHeight: 1.4, padding: "4px 0 8px" }}>
          Run a few more goldfish simulations to see trends ({insights.count}/2).
        </div>
      )}

      {/* Most recent run details */}
      {goldfishResult && (
        <div style={{ background: "var(--ley-surface-0)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-sm)", padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <span style={{ color: "var(--ley-green)", fontSize: 13, fontWeight: 700 }}>Score {goldfishResult.score}/100</span>
            <span style={{ color: "var(--ley-text-faint)", fontSize: 10 }}>{goldfishResult.date}</span>
          </div>
          <div style={{ color: "var(--ley-text)", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{goldfishResult.summary}</div>
          {goldfishResult.openingHand ? (
            <>
              <div style={{ color: "var(--ley-text-dim)", fontSize: 11, lineHeight: 1.45, marginBottom: 4 }}>
                Mulligans: {goldfishResult.mulligans || 0}. Opening hand: {goldfishResult.openingHand.join(", ")}
              </div>
              {goldfishResult.bottomedFromMulligan?.length > 0 && (
                <div style={{ color: "var(--ley-text-dim)", fontSize: 10, lineHeight: 1.45, marginBottom: 8, opacity: 0.85 }}>
                  Bottomed: {goldfishResult.bottomedFromMulligan.join(", ")}
                </div>
              )}
              <div style={{ display: "grid", gap: 5 }}>
                {goldfishResult.turns.map(turn => (
                  <div key={turn.turn} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 7, color: "var(--ley-text-dim)", fontSize: 11, lineHeight: 1.35 }}>
                    <span style={{ color: "var(--ley-green-text)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>T{turn.turn}</span>
                    <span>
                      Land: {turn.land}. Cast: {turn.cast.length ? turn.cast.join(", ") : "nothing"}. Mana: {turn.mana}. Hand: {turn.handSize}.
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gap: 5 }}>
              {(goldfishResult.runs || []).slice(0, 5).map((run, index) => (
                <div key={run.id || index} style={{ color: "var(--ley-text-dim)", fontSize: 11, lineHeight: 1.4 }}>
                  <span style={{ color: "var(--ley-green)", fontWeight: 700 }}>{index + 1}. {run.score}/100</span> · <ArchetypeBadge archetype={run.archetype} fontFamily={fontFamily} /> · {run.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {latestRuns.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Recent Runs
          </div>
          {latestRuns.slice(0, 3).map(run => (
            <div key={run.id} style={{ borderTop: "1px solid var(--ley-line)", padding: "6px 0", fontSize: 11, color: "var(--ley-text-dim)", lineHeight: 1.4, fontFamily }}>
              <span style={{ color: "var(--ley-text)" }}>Score {run.score}/100</span>
              {run.archetype && <span style={{ color: "var(--ley-green-text)" }}> · {run.archetype}</span>}
              <span> · {run.summary}</span>
            </div>
          ))}
        </div>
      )}

      {insightsError && (
        <div style={{ fontSize: 10, color: "var(--ley-text-faint)", marginTop: 6 }}>
          History insights unavailable ({insightsError}).
        </div>
      )}
    </div>
  );
}
