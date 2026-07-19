"use client";

/**
 * RoomRail — the ROOM GUIDES pattern, generalized (overnight rework 2026-07-19).
 *
 * Born as VaultRail (Vihaan, the first guide — Colton's design): chat rides the
 * rail full-height; when an answer needs a visual, THE CHAT CUTS TO HALF SIZE and
 * the widget docks ABOVE it. Chips and the chat summon the same deterministic
 * canvases. Every room's guide is this component with a different face:
 * Vihaan in the Vault, Teferi in the Crucible, Jace in the Academy.
 *
 * A GUIDE CONFIG supplies the face and the lane:
 *   agentName      chat-stream agent id (model-tier passthrough is name-safe)
 *   name / role    nameplate text ("VIHAAN" / "the Vault's guide")
 *   artCard        the guide's own card — little artwork in the machined avatar
 *                  frame (/api/art-crop by name; monogram fallback, never a void).
 *                  OMIT for non-Magic personas (the Keeper): monogram-only avatar.
 *   monogram       fallback letter/glyph while/if art can't resolve
 *   systemPrompt   (payload) => lane-lawed charter grounded in LIVE data only
 *   chips          [{ kind, label }] deterministic widget summons
 *   defaultWidget  kind docked on entry (the rail boots alive, never a black column)
 *   widgetRouter   (text) => kind|null — chat phrases that summon a canvas
 *   Widget         ({ kind, payload }) => the room's deterministic canvases
 *   emptyChatHint  guidance line, states the lane (routing is product behavior)
 *
 * All the guides share ONE brain upstream (Room Guides / agent-blend, 1.1) —
 * this rail is the face pattern that design lands on.
 */
import { useEffect, useRef, useState } from "react";

const mono = { fontFamily: "var(--font-mono), monospace" };

export default function RoomRail({ fontFamily, guide, payload }) {
  const [widget, setWidget] = useState(guide.defaultWidget ?? null);
  const [messages, setMessages] = useState([]);
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

    const summoned = guide.widgetRouter?.(content.toLowerCase());
    if (summoned) setWidget(summoned);

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
          agentName: guide.agentName,
          max_tokens: 700,
          system: guide.systemPrompt(payload),
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

  const Widget = guide.Widget;

  return (
    <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, fontFamily, minHeight: 0 }}>
      {/* Nameplate — the guide wears their own card art (little artworks, never a colored ball) */}
      <div className="ley-glass ley-pane" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div className="ley-avatar" aria-hidden="true">
          <span className="ley-avatar-fallback">{guide.monogram}</span>
          {guide.artCard && (
            <img
              src={`/api/art-crop?name=${encodeURIComponent(guide.artCard)}`}
              alt=""
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
          )}
        </div>
        <div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--ley-green)" }}>{guide.name}</div>
          <div style={{ fontSize: 10, color: "var(--ley-text-dim)" }}>{guide.role}</div>
        </div>
      </div>

      {/* Widget canvas — the chat's top pane; chat drops to half height while docked */}
      {widget && (
        <div className="ley-glass-strong ley-glass-lit ley-pane" style={{ padding: "12px 14px", position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setWidget(null)}
            title="Dismiss"
            style={{ position: "absolute", top: 6, right: 8, background: "transparent", border: "none", color: "var(--ley-text-dim)", cursor: "pointer", fontSize: 13, zIndex: 1 }}
          >
            ×
          </button>
          <Widget kind={widget} payload={payload} />
        </div>
      )}

      {/* Chat — full height alone, half height when a widget is docked (the cut behavior) */}
      <div className="ley-glass ley-pane" style={{ flex: widget ? 1 : 2, display: "flex", flexDirection: "column", minHeight: 120, overflow: "hidden" }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
              {guide.emptyChatHint}
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
          {guide.chips.map((c) => (
            <button
              key={c.kind}
              onClick={() => setWidget((w) => (w === c.kind ? null : c.kind))}
              style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 999, cursor: "pointer", background: widget === c.kind ? "var(--ley-green-dim)" : "transparent", border: `1px solid ${widget === c.kind ? "var(--ley-green)" : "var(--ley-line)"}`, color: widget === c.kind ? "var(--ley-green)" : "var(--ley-text-dim)", boxShadow: widget === c.kind ? "var(--ley-aura-soft)" : "none" }}
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
            placeholder={guide.placeholder || "Ask your guide…"}
            style={{ flex: 1, fontFamily, fontSize: 12, padding: "8px 10px", background: "var(--ley-surface-2)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: 8, outline: "none" }}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={streaming || !input.trim()}>➤</button>
        </form>
      </div>
    </div>
  );
}
