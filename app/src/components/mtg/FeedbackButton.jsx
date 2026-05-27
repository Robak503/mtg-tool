"use client";

import { useEffect, useRef, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "bug", label: "🐛 Bug" },
  { value: "feature", label: "💡 Feature idea" },
  { value: "agent-quality", label: "🧠 Agent quality" },
  { value: "ui", label: "🎨 UI / UX" },
  { value: "other", label: "💬 Other" },
];

/**
 * Floating feedback button (bottom-right) + modal.
 *
 * Captured context comes from the parent via props — agent name, current
 * session id/name, active deck name/commander, and the page the user is on.
 * Submission POSTs to /api/feedback which writes one JSON file per entry
 * under data/feedback/.
 */
export default function FeedbackButton({
  agent,
  currentSession,
  activeDeck,
  page = "chat",
  cfg,
  colors,
  fontFamily,
}) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("compose"); // "compose" | "inbox"
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // null | "success" | { error: string }
  const [inboxEntries, setInboxEntries] = useState(null);
  const [inboxError, setInboxError] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const textareaRef = useRef(null);
  const modalRef = useRef(null);

  // Load the inbox when switching to that view (and on submit-success so the
  // newly-saved entry shows up immediately if the user toggles to it).
  useEffect(() => {
    if (view !== "inbox" || !open) return undefined;
    let active = true;
    setInboxLoading(true);
    setInboxError(null);
    (async () => {
      try {
        const response = await fetch("/api/feedback", { cache: "no-store" });
        if (!response.ok) {
          if (active) setInboxError(`status ${response.status}`);
          return;
        }
        const data = await response.json();
        if (active) setInboxEntries(data.entries || []);
      } catch (error) {
        if (active) setInboxError(error.message || "network error");
      } finally {
        if (active) setInboxLoading(false);
      }
    })();
    return () => { active = false; };
  }, [view, open, status]);

  // Focus textarea when modal opens; close on Esc.
  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 60);
    const onKey = (event) => {
      if (event.key === "Escape" && !submitting) close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  // Auto-clear success state after a moment so the user can submit again.
  useEffect(() => {
    if (status !== "success") return undefined;
    const t = setTimeout(() => {
      setStatus(null);
      setMessage("");
      setOpen(false);
    }, 1600);
    return () => clearTimeout(t);
  }, [status]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setStatus(null);
  };

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
            agent,
            sessionId: currentSession?.id || null,
            sessionName: currentSession?.name || null,
            deckName: activeDeck?.name || null,
            deckCommander: currentSession?.lockedDeck?.commander || null,
            page,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setStatus({ error: data.error || `Request failed (${response.status}).` });
      } else {
        setStatus("success");
      }
    } catch (error) {
      setStatus({ error: error.message || "Network error — feedback not saved." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating launcher button */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback (Cmd/Ctrl-? also opens)"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 60,
          padding: "8px 14px",
          borderRadius: 22,
          border: `1px solid ${cfg?.border || LINE}`,
          background: cfg?.dim || BG2,
          color: cfg?.color || GOLD,
          cursor: "pointer",
          fontSize: 12,
          fontFamily,
          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        💬 Feedback
      </button>

      {open && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,4,10,0.72)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-label="Send feedback"
            style={{
              width: "min(520px, 100%)",
              maxHeight: "calc(100vh - 48px)",
              background: BG3,
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontFamily,
              color: TEXT,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <button
                  onClick={() => setView("compose")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: view === "compose" ? 700 : 400,
                    color: view === "compose" ? (cfg?.color || GOLD) : MUTED,
                    fontFamily,
                  }}
                >
                  Send
                </button>
                <button
                  onClick={() => setView("inbox")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: view === "inbox" ? 700 : 400,
                    color: view === "inbox" ? (cfg?.color || GOLD) : MUTED,
                    fontFamily,
                  }}
                >
                  Inbox{inboxEntries ? ` (${inboxEntries.length})` : ""}
                </button>
              </div>
              <button
                onClick={close}
                disabled={submitting}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  color: MUTED,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {view === "compose" && (
            <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.5 }}>
              Captured locally in <code style={{ fontFamily: "ui-monospace, monospace" }}>data/feedback/</code>.
              Nothing leaves your machine. Include what you were doing, what you expected,
              and what actually happened.
            </p>
            )}

            {view === "inbox" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 200, maxHeight: 480, overflowY: "auto" }}>
                {inboxLoading && (
                  <div style={{ fontSize: 12, color: MUTED, padding: 8 }}>Loading inbox...</div>
                )}
                {inboxError && (
                  <div style={{ fontSize: 12, color: "#c2786f", padding: 8 }}>
                    Could not load: {inboxError}
                  </div>
                )}
                {!inboxLoading && !inboxError && inboxEntries?.length === 0 && (
                  <div style={{ fontSize: 12, color: MUTED, padding: 8, lineHeight: 1.5 }}>
                    No feedback captured yet. Submit a note from the Send tab — it lands in
                    <code style={{ fontFamily: "ui-monospace, monospace", marginLeft: 4 }}>data/feedback/</code>.
                  </div>
                )}
                {inboxEntries?.map((entry) => (
                  <div
                    key={entry.filename || entry.id}
                    style={{
                      padding: "10px 12px",
                      background: BG2,
                      border: `1px solid ${LINE}`,
                      borderRadius: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 10, color: cfg?.color || GOLD, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {entry.category || "other"}
                      </span>
                      <span style={{ fontSize: 10, color: MUTED }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {entry.message}
                    </div>
                    {(entry.context?.agent || entry.context?.deckName || entry.context?.sessionName) && (
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                        {entry.context?.agent && <span>{entry.context.agent}</span>}
                        {entry.context?.sessionName && <span> · {entry.context.sessionName}</span>}
                        {entry.context?.deckName && <span> · {entry.context.deckName}</span>}
                        {entry.context?.page && <span> · {entry.context.page}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {view === "compose" && (
            <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Category
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={submitting}
                style={{
                  padding: "8px 10px",
                  background: BG2,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  color: TEXT,
                  fontSize: 13,
                  fontFamily,
                }}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Message
              </span>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={submitting}
                placeholder="What happened? What did you expect?"
                rows={6}
                maxLength={4000}
                style={{
                  padding: "10px 12px",
                  background: BG2,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  color: TEXT,
                  fontSize: 13,
                  fontFamily,
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
              />
              <span style={{ fontSize: 10, color: MUTED, alignSelf: "flex-end" }}>
                {message.length} / 4000
              </span>
            </label>

            {/* Context preview — show user what we're capturing */}
            <details style={{ fontSize: 11, color: MUTED }}>
              <summary style={{ cursor: "pointer", userSelect: "none" }}>
                ▸ Context being captured
              </summary>
              <div style={{ marginTop: 6, lineHeight: 1.6, paddingLeft: 8 }}>
                {agent && <div>Agent: {agent}</div>}
                {currentSession?.name && <div>Session: {currentSession.name}</div>}
                {activeDeck?.name && <div>Active deck: {activeDeck.name}</div>}
                {currentSession?.lockedDeck?.commander && (
                  <div>Locked commander: {currentSession.lockedDeck.commander}</div>
                )}
                <div>Page: {page}</div>
              </div>
            </details>
            </>
            )}

            {view === "compose" && status === "success" && (
              <div style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "#0d2615",
                border: "1px solid #2a5a3a",
                color: "#85d18a",
                fontSize: 12,
              }}>
                ✓ Saved. Thanks for the note.
              </div>
            )}
            {view === "compose" && status?.error && (
              <div style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "#2a1414",
                border: "1px solid #6b3a3a",
                color: "#e0a89a",
                fontSize: 12,
              }}>
                ⚠ {status.error}
              </div>
            )}

            {view === "compose" && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                onClick={close}
                disabled={submitting}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  color: MUTED,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontFamily,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !message.trim()}
                style={{
                  padding: "8px 18px",
                  background: cfg?.color || GOLD,
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: submitting || !message.trim() ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontFamily,
                  opacity: submitting || !message.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? "Saving…" : "Send"}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
