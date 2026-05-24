export default function GarfieldPanel({
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

  return (
    <div style={{ background: bg, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            Garfield Goldfish
          </div>
          <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.45 }}>
            Opening hand and turn 1-6 execution check for the active saved deck.
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

      {goldfishResult && (
        <div style={{ background: bg3, border: `1px solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <span style={{ color: GOLD, fontSize: 13, fontWeight: 700 }}>Score {goldfishResult.score}/100</span>
            <span style={{ color: MUTED, fontSize: 10 }}>{goldfishResult.date}</span>
          </div>
          <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{goldfishResult.summary}</div>
          {goldfishResult.openingHand ? (
            <>
              <div style={{ color: MUTED, fontSize: 11, lineHeight: 1.45, marginBottom: 8 }}>
                Mulligans: {goldfishResult.mulligans || 0}. Opening hand: {goldfishResult.openingHand.join(", ")}
              </div>
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
                  <span style={{ color: GOLD, fontWeight: 700 }}>{index + 1}. {run.score}/100</span> - {run.summary}
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
              <span style={{ color: TEXT }}>Score {run.score}/100</span> - {run.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
