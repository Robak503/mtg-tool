"use client";

/**
 * VaultRail — Vihaan's rail: live chat + the widget canvas (V1 of the Room Guides pattern).
 *
 * Colton's design, verbatim from the sketch session (vault-dashboard-rework-spec.md): chat rides the
 * rail full-height; when an answer needs a visual, THE CHAT CUTS TO HALF SIZE and the widget loads
 * ABOVE it. Widget stays pinned until replaced or dismissed; dismiss → chat returns to full height.
 *
 * The deterministic reports ARE the widgets — the quick chips and the chat summon the same three
 * V1 canvases, all fed from the dashboard payload (no new endpoints, no fabricated numbers):
 *   value   — the collection value series
 *   movers  — the weekly winner/loser detail (honest empty state per the hollow-gate law)
 *   grails  — the showpiece shelf
 *
 * LANE LAW (Colton): Vihaan is the COLLECTOR's guide. Deck power / deck building = Karn's bench —
 * the system prompt routes those instead of answering out of lane.
 */
import { useEffect, useMemo, useRef, useState } from "react";

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
    return { d, area: `${d} L${xs[xs.length - 1].toFixed(1)},${H - 4} L${xs[0].toFixed(1)},${H - 4} Z`, last: vals[vals.length - 1] };
  }, [series, height]);
  if (!path) return <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>The value line draws itself as daily snapshots accumulate.</div>;
  return (
    <svg viewBox={`0 0 300 ${height}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <path d={path.area} fill="var(--ley-green-faint)" stroke="none" />
      <path d={path.d} fill="none" stroke="var(--ley-green)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The three V1 widgets, rendered from the dashboard payload. */
function Widget({ kind, dashboard }) {
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

const CHIPS = [
  { kind: "value", label: "Value history" },
  { kind: "movers", label: "Week's movers" },
  { kind: "grails", label: "Grail shelf" },
];

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

export default function VaultRail({ fontFamily, dashboard }) {
  const [widget, setWidget] = useState(null);          // null | "value" | "movers" | "grails"
  const [messages, setMessages] = useState([]);         // {role, content}
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { scrollRef.current?.scrollTo?.(0, 1e9); }, [messages]);

  const send = async (text) => {
    const content = String(text || "").trim();
    if (!content || streaming) return;
    setInput("");

    // The chat can summon widgets too — same three canvases the chips trigger.
    const lower = content.toLowerCase();
    if (/\b(value|worth).*(history|graph|chart|over time)|history of.*value/.test(lower)) setWidget("value");
    else if (/\b(mover|winner|loser|gain|drop|spike)/.test(lower)) setWidget("movers");
    else if (/\b(grail|showpiece|shelf|signed)/.test(lower)) setWidget("grails");

    const next = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: "auto",
          agentName: "vihaan",
          max_tokens: 700,
          system: vihaanSystem(dashboard),
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok || !response.body) throw new Error("Could not reach the model endpoint.");
      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let buf = "", streamed = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === "text_delta") {
            streamed += event.text;
            setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: streamed } : m)));
          } else if (event.type === "error") {
            streamed += streamed ? `\n\n(${event.error})` : `The model isn't reachable right now — ${event.error}`;
            setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: streamed, isError: true } : m)));
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: `The model isn't reachable right now — ${e.message}`, isError: true } : m)));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const glass = {
    background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)",
  };

  return (
    <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, fontFamily, minHeight: 0 }}>
      {/* Nameplate */}
      <div style={{ ...glass, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ley-green-dim)", border: "1px solid var(--ley-green)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>💎</div>
        <div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--ley-green)" }}>VIHAAN</div>
          <div style={{ fontSize: 10, color: "var(--ley-text-dim)" }}>the Vault's guide</div>
        </div>
      </div>

      {/* Widget canvas — the chat's top pane; chat drops to half height while docked */}
      {widget && (
        <div style={{ ...glass, padding: "12px 14px", position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setWidget(null)}
            title="Dismiss"
            style={{ position: "absolute", top: 6, right: 8, background: "transparent", border: "none", color: "var(--ley-text-dim)", cursor: "pointer", fontSize: 13 }}
          >
            ×
          </button>
          <Widget kind={widget} dashboard={dashboard} />
        </div>
      )}

      {/* Chat — full height alone, half height when a widget is docked (Colton's cut behavior) */}
      <div style={{ ...glass, flex: widget ? 1 : 2, display: "flex", flexDirection: "column", minHeight: 120, overflow: "hidden" }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
              Ask about your collection — value, movers, grails, trades. (Deck questions live with Karn at the bench.)
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", padding: "7px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", background: m.role === "user" ? "var(--ley-green-dim)" : "var(--ley-surface-2)", color: m.isError ? "var(--ley-red)" : "var(--ley-text)", border: `1px solid ${m.role === "user" ? "var(--ley-green)" : "var(--ley-line)"}` }}>
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          ))}
        </div>

        {/* Quick chips */}
        <div style={{ display: "flex", gap: 6, padding: "0 10px 8px", flexWrap: "wrap" }}>
          {CHIPS.map((c) => (
            <button
              key={c.kind}
              onClick={() => setWidget((w) => (w === c.kind ? null : c.kind))}
              style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 999, cursor: "pointer", background: widget === c.kind ? "var(--ley-green-dim)" : "transparent", border: `1px solid ${widget === c.kind ? "var(--ley-green)" : "var(--ley-line)"}`, color: widget === c.kind ? "var(--ley-green)" : "var(--ley-text-dim)" }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          style={{ display: "flex", gap: 6, padding: "0 10px 10px" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your collection…"
            style={{ flex: 1, fontFamily, fontSize: 12, padding: "8px 10px", background: "var(--ley-surface-2)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: 8, outline: "none" }}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={streaming || !input.trim()}>➤</button>
        </form>
      </div>
    </div>
  );
}
