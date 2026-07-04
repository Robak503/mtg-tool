"use client";

/**
 * /feedback-window — rapid-capture popup for in-app feedback.
 *
 * Designed to be opened via window.open() with width=420 height=620.
 * No app chrome, no sidebar. Big textarea, category selector, single
 * submit button, success toast, auto-clear for the next entry.
 *
 * Context (agent / session / deck / page) is passed via URL query
 * params at popup-open time. The user can edit or clear it. The
 * popup persists across page changes in the main window — context
 * is snapshotted, not live.
 *
 * Keyboard: Cmd/Ctrl-Enter submits. Esc clears.
 */

import { useEffect, useRef, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug", glyph: "🐛" },
  { value: "feature", label: "Feature", glyph: "💡" },
  { value: "agent-quality", label: "Agent", glyph: "🧠" },
  { value: "ui", label: "UI / UX", glyph: "🎨" },
  { value: "other", label: "Other", glyph: "💬" },
];

function readContextFromUrl() {
  if (typeof window === "undefined") return {};
  const params = new URL(window.location.href).searchParams;
  const out = {};
  for (const key of ["agent", "sessionId", "sessionName", "deckName", "deckCommander", "page"]) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

export default function FeedbackWindowPage() {
  const [context, setContext] = useState(() => readContextFromUrl());
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const textareaRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Cmd/Ctrl+Enter submits; Esc clears.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!submitting && message.trim()) submit();
      } else if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        setMessage("");
        setStatus(null);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, submitting]);

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          category,
          context: {
            ...context,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setStatus({ error: data.error || `Request failed (${response.status}).` });
      } else {
        setStatus({ success: data.digestEntryCount ?? null });
        setSubmittedCount(n => n + 1);
        setMessage("");
        // Re-focus for the next entry.
        setTimeout(() => textareaRef.current?.focus(), 30);
      }
    } catch (error) {
      setStatus({ error: error.message || "Network error — feedback not saved." });
    } finally {
      setSubmitting(false);
    }
  };

  const updateContextField = (field, value) => {
    setContext(prev => {
      const next = { ...prev };
      if (value) next[field] = value;
      else delete next[field];
      return next;
    });
  };

  // Theme — LEYLINE tokens (globals.css is loaded via the root layout, even
  // though this is a standalone popup window).
  const BG = "var(--ley-bg)";
  const BG2 = "var(--ley-surface-1)";
  const BG3 = "var(--ley-surface-2)";
  const LINE = "var(--ley-line)";
  const TEXT = "var(--ley-text)";
  const MUTED = "var(--ley-text-dim)";
  const GOLD = "var(--ley-green)";
  const FONT = "var(--font-body), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  return (
    <div style={{
      fontFamily: FONT,
      background: BG,
      color: TEXT,
      minHeight: "100vh",
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      boxSizing: "border-box",
    }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${BG};margin:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${BG}}
        ::-webkit-scrollbar-thumb{background:${LINE};border-radius:2px}
        input:focus,textarea:focus,select:focus{outline:none;border-color:var(--ley-green)!important}
      `}</style>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 14, color: GOLD, margin: 0, fontWeight: 700 }}>
          💬 Feedback capture
        </h1>
        {submittedCount > 0 && (
          <span style={{ fontSize: 10, color: MUTED }}>
            {submittedCount} this session
          </span>
        )}
      </header>

      <p style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, margin: 0 }}>
        Cmd/Ctrl-Enter submits. Esc clears. Each entry appends to <code style={{ fontFamily: "ui-monospace, monospace" }}>data/feedback/FEEDBACK.md</code>.
      </p>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {CATEGORY_OPTIONS.map(option => {
          const selected = category === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setCategory(option.value)}
              disabled={submitting}
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${selected ? GOLD : LINE}`,
                background: selected ? "var(--ley-green-dim)" : "transparent",
                color: selected ? GOLD : TEXT,
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: 11,
                fontFamily: FONT,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: selected ? 600 : 400,
              }}
            >
              <span style={{ fontSize: 12 }}>{option.glyph}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <textarea
        ref={textareaRef}
        value={message}
        onChange={event => setMessage(event.target.value)}
        disabled={submitting}
        placeholder="What happened? What did you expect? What should change?"
        rows={10}
        maxLength={4000}
        style={{
          flex: 1,
          padding: "10px 12px",
          background: BG3,
          border: `1px solid ${LINE}`,
          borderRadius: 5,
          color: TEXT,
          fontSize: 13,
          fontFamily: FONT,
          resize: "vertical",
          lineHeight: 1.5,
          minHeight: 200,
        }}
      />

      <details style={{ fontSize: 10, color: MUTED }}>
        <summary style={{ cursor: "pointer", userSelect: "none" }}>
          ▸ Context attached ({Object.keys(context).length} field{Object.keys(context).length === 1 ? "" : "s"})
        </summary>
        <div style={{ marginTop: 6, paddingLeft: 6, display: "grid", gap: 4 }}>
          {["agent", "deckName", "sessionName", "page"].map(field => (
            <label key={field} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 9 }}>{field}</span>
              <input
                type="text"
                value={context[field] || ""}
                onChange={event => updateContextField(field, event.target.value)}
                style={{
                  padding: "2px 6px",
                  background: BG2,
                  border: `1px solid ${LINE}`,
                  borderRadius: 3,
                  color: TEXT,
                  fontSize: 11,
                  fontFamily: FONT,
                }}
              />
            </label>
          ))}
        </div>
      </details>

      {status?.success !== undefined && (
        <div style={{
          padding: "6px 10px",
          borderRadius: 5,
          background: "var(--ley-green-dim)",
          border: "1px solid var(--ley-green)",
          color: "var(--ley-green-text)",
          fontSize: 11,
        }}>
          ✓ Saved{status.success !== null ? ` · ${status.success} entr${status.success === 1 ? "y" : "ies"} in FEEDBACK.md` : ""}
        </div>
      )}
      {status?.error && (
        <div style={{
          padding: "6px 10px",
          borderRadius: 5,
          background: "var(--ley-red-dim)",
          border: "1px solid var(--ley-red)",
          color: "var(--ley-red)",
          fontSize: 11,
        }}>
          ⚠ {status.error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: "auto" }}>
        <span style={{ fontSize: 10, color: MUTED }}>
          {message.length} / 4000
        </span>
        <button
          onClick={submit}
          disabled={submitting || !message.trim()}
          className="btn btn-primary"
        >
          {submitting ? "Saving…" : "Send (Cmd-Enter)"}
        </button>
      </div>
    </div>
  );
}
