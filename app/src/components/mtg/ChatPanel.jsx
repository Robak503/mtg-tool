import { useState, useEffect } from "react";
import { QUICK } from "../../lib/agents";

function Dots({ color }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            opacity: 0.75,
            animation: `mtgd 1.3s ${i * 0.18}s ease-in-out infinite`,
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

function ProviderLabel({ provider, style }) {
  if (!provider || provider === "ollama") return null;
  return (
    <span style={{ fontSize: 10, color: "#7f8aa3", marginLeft: 6, ...style }}>
      [via Anthropic]
    </span>
  );
}

function TrustStrip({ msg, LINE }) {
  const r = msg.factReceipt;
  if (!r) return null;
  const cloudUsed = r.provider === "anthropic" || r.fallbackUsed;
  return (
    <details
      open={typeof process !== "undefined" && process.env?.NODE_ENV === "development"}
      style={{ marginTop: 8, fontSize: 10, color: "#7f8aa3" }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none", listStyle: "none", outline: "none" }}>
        ▸ Response metadata
      </summary>
      <div style={{ paddingTop: 4, lineHeight: 1.7, borderTop: `1px solid ${LINE}`, marginTop: 4 }}>
        <span>Provider: {r.provider === "ollama" ? "Local (Ollama)" : "Anthropic API"}</span>
        {r.deckLocked && r.deckName && <span> · Deck: {r.deckName}</span>}
        {r.cardsProvided > 0 && <span> · Cards: {r.cardsProvided}</span>}
        {r.rulingsProvided > 0 && <span> · Rulings: {r.rulingsProvided}</span>}
        {r.engineContextProvided && <span> · Rules context: yes</span>}
        {r.arbiterTraceProvided && <span> · Arbiter: yes</span>}
        <span> · Cloud: {cloudUsed ? "used" : "not used"}</span>
      </div>
    </details>
  );
}

export default function ChatPanel({
  activeDeck,
  agent,
  bottomRef,
  cfg,
  colors,
  deckLocks,
  fontFamily,
  histories,
  input,
  mainCount,
  renderText,
  retryWithFallback,
  send,
  sending,
  setCenterView,
  setInput,
  unloadDeck,
  unlockDeck,
}) {
  const { BG2, BG3, LINE, TEXT } = colors;
  const quickPrompts = QUICK[agent] || [];
  const deckLock = deckLocks?.[agent];

  // T13 — "Still thinking..." counter while waiting for response
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!sending) { setWaitSeconds(0); return; }
    setWaitSeconds(0);
    const timer = setInterval(() => setWaitSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [sending]);

  return (
    <>
      {activeDeck && (
        <div
          style={{
            padding: "6px 14px",
            background: cfg.dim,
            borderBottom: `1px solid ${cfg.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: cfg.color }}>
            Loaded deck: {activeDeck.name} - {mainCount} cards
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setCenterView("deck")}
              style={{
                background: "none",
                border: "none",
                color: cfg.color,
                cursor: "pointer",
                fontSize: 11,
                fontFamily,
              }}
            >
              View
            </button>
            <button
              onClick={unloadDeck}
              style={{
                background: "none",
                border: "none",
                color: cfg.color,
                cursor: "pointer",
                fontSize: 11,
                fontFamily,
              }}
            >
              Unload
            </button>
          </span>
        </div>
      )}

      {deckLock && (
        <div
          style={{
            padding: "6px 14px",
            background: cfg.dim,
            borderBottom: `1px solid ${cfg.border}`,
            color: cfg.color,
            fontSize: 11,
            lineHeight: 1.35,
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>
            {cfg.name} locked to: {deckLock.name} / {deckLock.commander} ({deckLock.mainCount} cards). Sidebar deck changes will not alter this chat.
          </span>
          <button
            onClick={() => unlockDeck(agent)}
            style={{
              background: "transparent",
              border: `1px solid ${cfg.border}`,
              borderRadius: 5,
              color: cfg.color,
              cursor: "pointer",
              fontSize: 11,
              padding: "3px 8px",
              fontFamily,
              flexShrink: 0,
            }}
          >
            Unlock
          </button>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
          <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
          <div
            style={{
              maxWidth: "82%",
              padding: "12px 15px",
              borderRadius: "12px 12px 12px 3px",
              background: BG3,
              border: `1px solid ${cfg.border}`,
              fontSize: 14,
              color: TEXT,
              lineHeight: 1.72,
            }}
          >
            {cfg.greeting}
          </div>
        </div>

        {histories[agent].map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              gap: 3,
            }}
          >
            {msg.role === "assistant" && (
              <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>
                {cfg.name}
                <ProviderLabel provider={msg.factReceipt?.provider} />
              </span>
            )}
            <div
              style={{
                maxWidth: "82%",
                padding: "11px 15px",
                borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                background: msg.role === "user" ? "#101530" : BG3,
                border: msg.isError
                  ? "1px solid #6b3a3a"
                  : `1px solid ${msg.role === "user" ? "#1e2445" : cfg.border}`,
                fontSize: 14,
                color: msg.isError ? "#c2786f" : TEXT,
                lineHeight: 1.72,
              }}
            >
              {msg.role === "assistant"
                ? (
                  <>
                    {msg.isError
                      ? <span style={{ display: "block" }}>⚠ {msg.content}</span>
                      : renderText(msg.content)
                    }
                    {msg.arbiterStatus === "citation_failed" && (
                      <div style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #6b5a3a",
                        background: "#1a1409",
                        color: "#c89e6f",
                        fontSize: 11,
                      }}>
                        ⚠ Arbiter could not produce a verified rule citation for this answer. Verify independently before relying on it.
                      </div>
                    )}
                    {msg.arbiterTrace && (
                      <details style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                        <summary style={{ color: cfg.color, cursor: "pointer", fontSize: 11 }}>
                          View Arbiter Trace{msg.arbiterStatus ? ` (${msg.arbiterStatus})` : ""}
                        </summary>
                        <pre style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          color: TEXT,
                          background: "#070a12",
                          border: `1px solid ${LINE}`,
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 11,
                          lineHeight: 1.45,
                          overflowX: "auto",
                          fontFamily,
                        }}>
                          {msg.arbiterTrace}
                        </pre>
                      </details>
                    )}
                    {/* T8 — Trust Strip */}
                    {!msg.isError && <TrustStrip msg={msg} LINE={LINE} />}
                  </>
                )
                : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
            </div>

            {/* T6 — Fallback chip on error messages */}
            {msg.isError && msg.fallbackAvailable && retryWithFallback && (
              <button
                onClick={() => retryWithFallback(msg.originalPrompt, agent)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 2,
                  padding: "4px 11px",
                  borderRadius: 12,
                  border: "1px solid #3a4a6b",
                  background: "#0d1428",
                  color: "#7fa0c8",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily,
                }}
              >
                Retry with Anthropic ↗
              </button>
            )}
          </div>
        ))}

        {sending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px 12px 12px 3px",
                background: BG3,
                border: `1px solid ${cfg.border}`,
              }}
            >
              <Dots color={cfg.color} />
              {/* T13 — Still thinking... */}
              {waitSeconds >= 10 && (
                <div style={{ fontSize: 11, color: "#7f8aa3", marginTop: 6 }}>
                  Still thinking… (local models can take 20–60s for long responses)
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        style={{
          padding: "8px 14px",
          borderTop: `1px solid ${LINE}`,
          background: BG2,
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {quickPrompts.map(prompt => (
          <button
            key={prompt}
            onClick={() => send(prompt)}
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              border: `1px solid ${cfg.border}`,
              background: cfg.dim,
              color: cfg.color,
              cursor: "pointer",
              fontSize: 11,
              fontFamily,
              whiteSpace: "nowrap",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: `1px solid ${LINE}`,
          background: BG2,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={cfg.placeholder}
          rows={2}
          disabled={sending}
          style={{
            flex: 1,
            padding: "10px 13px",
            background: BG3,
            border: `1px solid ${LINE}`,
            borderRadius: 9,
            color: TEXT,
            fontSize: 14,
            fontFamily,
            resize: "none",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || sending}
          style={{
            minWidth: 58,
            height: 42,
            padding: "0 14px",
            borderRadius: 9,
            border: "none",
            background: cfg.color,
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: !input.trim() || sending ? 0.4 : 1,
            fontFamily,
          }}
        >
          Send
        </button>
      </div>
    </>
  );
}
