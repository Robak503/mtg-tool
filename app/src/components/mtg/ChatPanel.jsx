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

        {histories[agent].map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: message.role === "user" ? "flex-end" : "flex-start",
              gap: 3,
            }}
          >
            {message.role === "assistant" && (
              <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
            )}
            <div
              style={{
                maxWidth: "82%",
                padding: "11px 15px",
                borderRadius: message.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                background: message.role === "user" ? "#101530" : BG3,
                border: `1px solid ${message.role === "user" ? "#1e2445" : cfg.border}`,
                fontSize: 14,
                color: TEXT,
                lineHeight: 1.72,
              }}
            >
              {message.role === "assistant"
                ? (
                  <>
                    {renderText(message.content)}
                    {message.arbiterTrace && (
                      <details style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                        <summary style={{ color: cfg.color, cursor: "pointer", fontSize: 11 }}>
                          View Arbiter Trace
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
                          {message.arbiterTrace}
                        </pre>
                      </details>
                    )}
                  </>
                )
                : <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>}
            </div>
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
