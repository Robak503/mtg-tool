"use client";

/**
 * GarfieldPanel — the Garfield goldfish panel shown inside DeckView: runs solo
 * playtests of the active deck and renders the results classified by archetype
 * (see ARCHETYPE_COLORS).
 */

import { useEffect, useState } from "react";

const ARCHETYPE_COLORS = {
  aggro: "#c2786f",
  control: "#7fa0c8",
  combo: "#b58fd1",
  ramp: "#85b387",
  voltron: "#d1a85f",
  tokens: "#a8c87f",
  aristocrats: "#a0676b",
  midrange: "#a8a39a",
  unknown: "#9d98b8",
};

function ArchetypeBadge({ archetype, confidence, fontFamily }) {
  if (!archetype) return null;
  const color = ARCHETYPE_COLORS[archetype] || ARCHETYPE_COLORS.unknown;
  return (
    <span
      title={confidence ? `${confidence}% of recent runs classified as ${archetype}` : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 10,
        border: `1px solid ${color}`,
        background: `${color}1f`,
        color,
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

function PacingBar({ label, value, color, MUTED }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
      <div style={{ height: 6, background: "#1a1b30", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${bounded}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontSize: 10, color: MUTED, textAlign: "right" }}>{bounded}%</span>
    </div>
  );
}

function TrendArrow({ trend }) {
  if (trend === "improving") return <span style={{ color: "#85b387" }}>↑</span>;
  if (trend === "regressing") return <span style={{ color: "#c2786f" }}>↓</span>;
  return <span style={{ color: "#9d98b8" }}>→</span>;
}

export default function GarfieldPanel({
  activeDeckId,
  bg,
  bg3,
  colors,
  deckMemory,
  fontFamily,
  goldfishResult,
  goldfishRunning,
  hasData,
  loadDeckData,
  pb,
  runGoldfish,
}) {
  const { LINE, TEXT, MUTED, GOLD } = colors;
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
    <div style={{ background: bg, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Garfield Goldfish v2
            </span>
            <ArchetypeBadge archetype={archetypeToShow} confidence={confidence} fontFamily={fontFamily} />
          </div>
          <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.45 }}>
            Opening hand and turn 1-6 execution check with archetype-aware play.
          </div>
          {!hasData && (
            <div style={{ color: GOLD, fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>
              Garfield will load analytics automatically before running.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!hasData && <button onClick={loadDeckData} disabled={goldfishRunning} style={{...pb(false, true),opacity:goldfishRunning?.45:1}}>Load Analytics</button>}
          <button onClick={() => runGoldfish(1)} disabled={goldfishRunning} style={{ ...pb(true, true), background: "#8b6f3d", opacity: goldfishRunning ? .45 : 1 }}>
            {goldfishRunning ? "Running..." : "Run"}
          </button>
          <button onClick={() => runGoldfish(10)} disabled={goldfishRunning} style={{ ...pb(false, true), borderColor: "rgba(139,111,61,0.65)", color: GOLD, opacity: goldfishRunning ? .45 : 1 }}>Run 10</button>
        </div>
      </div>

      {/* Insights from history — only when there's enough data */}
      {insights && insights.count >= 2 && (
        <div style={{ background: bg3, border: `1px solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              History ({insights.count} runs)
            </span>
            <span style={{ fontSize: 11, color: TEXT }}>
              Avg <strong style={{ color: GOLD }}>{insights.score.avg}/100</strong>
              {insights.score.recent5Avg > 0 && (
                <span style={{ color: MUTED }}> · recent 5: {insights.score.recent5Avg} <TrendArrow trend={insights.score.trend} /></span>
              )}
            </span>
          </div>

          <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
            <PacingBar label="Commander ≤T4" value={insights.pacing.commanderByTurn4Rate} color="#8b6f3d" MUTED={MUTED} />
            <PacingBar label="Early ramp" value={insights.pacing.earlyRampRate} color="#85b387" MUTED={MUTED} />
            <PacingBar label="Early draw" value={insights.pacing.earlyDrawRate} color="#7fa0c8" MUTED={MUTED} />
            <PacingBar label="Threat ≤T5" value={insights.pacing.threatByTurn5Rate} color="#c89e6f" MUTED={MUTED} />
            <PacingBar label="Mulligan rate" value={insights.mulligan.rate} color="#a0676b" MUTED={MUTED} />
          </div>

          {(insights.weakSignals?.length > 0 || insights.strongSignals?.length > 0) && (
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6, display: "grid", gap: 3 }}>
              {insights.strongSignals?.map((signal, i) => (
                <div key={`s-${i}`} style={{ fontSize: 11, color: "#85b387", lineHeight: 1.4 }}>
                  ✓ {signal}
                </div>
              ))}
              {insights.weakSignals?.map((signal, i) => (
                <div key={`w-${i}`} style={{ fontSize: 11, color: "#c89e6f", lineHeight: 1.4 }}>
                  ⚠ {signal}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {insights && insights.count > 0 && insights.count < 2 && (
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, padding: "4px 0 8px" }}>
          Run a few more goldfish simulations to see trends ({insights.count}/2).
        </div>
      )}

      {/* Most recent run details */}
      {goldfishResult && (
        <div style={{ background: bg3, border: `1px solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <span style={{ color: GOLD, fontSize: 13, fontWeight: 700 }}>Score {goldfishResult.score}/100</span>
            <span style={{ color: MUTED, fontSize: 10 }}>{goldfishResult.date}</span>
          </div>
          <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{goldfishResult.summary}</div>
          {goldfishResult.openingHand ? (
            <>
              <div style={{ color: MUTED, fontSize: 11, lineHeight: 1.45, marginBottom: 4 }}>
                Mulligans: {goldfishResult.mulligans || 0}. Opening hand: {goldfishResult.openingHand.join(", ")}
              </div>
              {goldfishResult.bottomedFromMulligan?.length > 0 && (
                <div style={{ color: MUTED, fontSize: 10, lineHeight: 1.45, marginBottom: 8, opacity: 0.85 }}>
                  Bottomed: {goldfishResult.bottomedFromMulligan.join(", ")}
                </div>
              )}
              <div style={{ display: "grid", gap: 5 }}>
                {goldfishResult.turns.map(turn => (
                  <div key={turn.turn} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 7, color: MUTED, fontSize: 11, lineHeight: 1.35 }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>T{turn.turn}</span>
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
                <div key={run.id || index} style={{ color: MUTED, fontSize: 11, lineHeight: 1.4 }}>
                  <span style={{ color: GOLD, fontWeight: 700 }}>{index + 1}. {run.score}/100</span> · <ArchetypeBadge archetype={run.archetype} fontFamily={fontFamily} /> · {run.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {latestRuns.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Recent Runs
          </div>
          {latestRuns.slice(0, 3).map(run => (
            <div key={run.id} style={{ borderTop: `1px solid ${LINE}`, padding: "6px 0", fontSize: 11, color: MUTED, lineHeight: 1.4, fontFamily }}>
              <span style={{ color: TEXT }}>Score {run.score}/100</span>
              {run.archetype && <span style={{ color: ARCHETYPE_COLORS[run.archetype] || MUTED }}> · {run.archetype}</span>}
              <span> · {run.summary}</span>
            </div>
          ))}
        </div>
      )}

      {insightsError && (
        <div style={{ fontSize: 10, color: MUTED, opacity: 0.7, marginTop: 6 }}>
          History insights unavailable ({insightsError}).
        </div>
      )}
    </div>
  );
}
