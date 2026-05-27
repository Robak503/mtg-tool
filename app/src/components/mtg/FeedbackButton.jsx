"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug", glyph: "🐛" },
  { value: "feature", label: "Feature", glyph: "💡" },
  { value: "agent-quality", label: "Agent", glyph: "🧠" },
  { value: "ui", label: "UI / UX", glyph: "🎨" },
  { value: "other", label: "Other", glyph: "💬" },
];

/**
 * Floating feedback button (bottom-right) + modal.
 *
 * Submission POSTs to /api/feedback which writes one JSON file per entry
 * under data/feedback/. Cmd/Ctrl-Shift-F pops the standalone capture window.
 */
export default function FeedbackButton({
  agent,
  currentSession,
  activeDeck,
  page = "chat",
  cfg,
  colors,
  fontFamily,
  mobile = false,
}) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("compose"); // "compose" | "inbox"
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [inboxEntries, setInboxEntries] = useState(null);
  const [inboxError, setInboxError] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [copyState, setCopyState] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const textareaRef = useRef(null);
  const modalRef = useRef(null);

  const accent = cfg?.color || GOLD;
  const accentDim = cfg?.dim || BG2;
  const accentBorder = cfg?.border || LINE;

  const contextPills = useMemo(() => {
    const pills = [];
    if (agent) pills.push({ key: "agent", label: agent });
    if (activeDeck?.name) pills.push({ key: "deck", label: activeDeck.name });
    if (currentSession?.name && currentSession.name !== activeDeck?.name) {
      pills.push({ key: "session", label: currentSession.name });
    }
    if (page) pills.push({ key: "page", label: page });
    return pills;
  }, [agent, activeDeck?.name, currentSession?.name, page]);

  const contextQueryString = () => {
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (currentSession?.id) params.set("sessionId", currentSession.id);
    if (currentSession?.name) params.set("sessionName", currentSession.name);
    if (activeDeck?.name) params.set("deckName", activeDeck.name);
    if (currentSession?.lockedDeck?.commander) params.set("deckCommander", currentSession.lockedDeck.commander);
    if (page) params.set("page", page);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const openPopout = () => {
    const url = `/feedback-window${contextQueryString()}`;
    const features = "width=440,height=680,resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no";
    if (typeof window !== "undefined") {
      const popup = window.open(url, "mtg-feedback-popup", features);
      if (popup) {
        popup.focus();
        setOpen(false);
      }
    }
  };

  // Cmd/Ctrl-Shift-F opens the pop-out window from anywhere.
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (!event.shiftKey) return;
      if (event.key !== "F" && event.key !== "f") return;
      event.preventDefault();
      openPopout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, currentSession?.id, currentSession?.name, activeDeck?.name, page]);

  const copyDigest = async () => {
    setCopyState(null);
    try {
      const response = await fetch("/api/feedback?format=md", { cache: "no-store" });
      if (!response.ok) {
        setCopyState({ error: `status ${response.status}` });
        return;
      }
      const text = await response.text();
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyState("copied");
        setTimeout(() => setCopyState(null), 2200);
      } else {
        setCopyState({ error: "clipboard not available" });
      }
    } catch (error) {
      setCopyState({ error: error.message || "copy failed" });
    }
  };

  const downloadDigest = async () => {
    try {
      const response = await fetch("/api/feedback?format=md", { cache: "no-store" });
      if (!response.ok) {
        setCopyState({ error: `status ${response.status}` });
        return;
      }
      const text = await response.text();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `FEEDBACK-${stamp}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setCopyState({ error: error.message || "download failed" });
    }
  };

  const deleteEntry = async (filename) => {
    if (!filename || deletingId) return;
    setDeletingId(filename);
    try {
      const response = await fetch(`/api/feedback?filename=${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setInboxEntries(prev => (prev || []).filter(e => e.filename !== filename));
      } else {
        setInboxError(`delete failed (${response.status})`);
      }
    } catch (error) {
      setInboxError(error.message || "delete failed");
    } finally {
      setDeletingId(null);
    }
  };

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

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 60);
    const onKey = (event) => {
      if (event.key === "Escape" && !submitting) close();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && view === "compose") {
        event.preventDefault();
        if (!submitting && message.trim()) submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting, message, view]);

  useEffect(() => {
    if (status !== "success") return undefined;
    const t = setTimeout(() => {
      setStatus(null);
      setMessage("");
      setOpen(false);
    }, 1400);
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

  // Mobile: lift above MobileTabBar (~48px tall) so it doesn't sit on top of it.
  const buttonBottom = mobile ? 64 : 18;
  const buttonRight = mobile ? 12 : 18;

  const tabButton = (key, label) => {
    const active = view === key;
    return (
      <button
        onClick={() => setView(key)}
        style={{
          background: "none",
          border: "none",
          padding: "8px 2px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: active ? 700 : 500,
          color: active ? accent : MUTED,
          fontFamily,
          borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
          marginBottom: -1,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback · Cmd/Ctrl-Shift-F pops out a small capture window"
        aria-label="Send feedback"
        style={{
          position: "fixed",
          right: buttonRight,
          bottom: buttonBottom,
          zIndex: 60,
          padding: mobile ? "10px 12px" : "9px 16px",
          borderRadius: 999,
          border: `1px solid ${accentBorder}`,
          background: accentDim,
          color: accent,
          cursor: "pointer",
          fontSize: 13,
          fontFamily,
          boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          gap: 7,
          transition: "transform 120ms ease, box-shadow 120ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      >
        <span style={{ fontSize: 14 }}>💬</span>
        {!mobile && <span>Feedback</span>}
      </button>

      {open && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,4,10,0.74)",
            backdropFilter: "blur(2px)",
            zIndex: 100,
            display: "flex",
            alignItems: mobile ? "flex-end" : "center",
            justifyContent: "center",
            padding: mobile ? 0 : 24,
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-label="Send feedback"
            style={{
              width: mobile ? "100%" : "min(540px, 100%)",
              maxHeight: mobile ? "92vh" : "calc(100vh - 48px)",
              background: BG3,
              border: `1px solid ${LINE}`,
              borderRadius: mobile ? "14px 14px 0 0" : 12,
              padding: mobile ? "18px 16px 22px" : "20px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontFamily,
              color: TEXT,
              boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
              overflowY: "auto",
            }}
          >
            {/* Header: tabs + actions */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              borderBottom: `1px solid ${LINE}`,
              paddingBottom: 2,
            }}>
              <div style={{ display: "flex", gap: 18 }}>
                {tabButton("compose", "Send")}
                {tabButton("inbox", `Inbox${inboxEntries ? ` (${inboxEntries.length})` : ""}`)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 4 }}>
                {!mobile && (
                  <button
                    onClick={openPopout}
                    title="Open the standalone capture window (handy on a second monitor)"
                    style={{
                      background: "transparent",
                      border: `1px solid ${LINE}`,
                      borderRadius: 5,
                      color: MUTED,
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "4px 9px",
                      fontFamily,
                    }}
                  >
                    ⧉ Pop out
                  </button>
                )}
                <button
                  onClick={close}
                  disabled={submitting}
                  aria-label="Close"
                  style={{
                    background: "none",
                    border: "none",
                    color: MUTED,
                    cursor: submitting ? "not-allowed" : "pointer",
                    fontSize: 20,
                    lineHeight: 1,
                    padding: "0 4px 4px",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {view === "compose" && (
              <>
                {/* Category pills */}
                <div>
                  <div style={{
                    fontSize: 10,
                    color: MUTED,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: 8,
                  }}>
                    Category
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {CATEGORY_OPTIONS.map((option) => {
                      const selected = category === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setCategory(option.value)}
                          disabled={submitting}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 999,
                            border: `1px solid ${selected ? accent : LINE}`,
                            background: selected ? accentDim : "transparent",
                            color: selected ? accent : TEXT,
                            cursor: submitting ? "not-allowed" : "pointer",
                            fontSize: 12,
                            fontFamily,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontWeight: selected ? 600 : 400,
                            transition: "border-color 100ms, color 100ms, background 100ms",
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{option.glyph}</span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Message */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}>
                    <span style={{
                      fontSize: 10,
                      color: MUTED,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}>
                      Message
                    </span>
                    <span style={{ fontSize: 10, color: MUTED }}>
                      {message.length} / 4000
                    </span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    disabled={submitting}
                    placeholder="What happened? What did you expect? What should change?"
                    rows={mobile ? 5 : 6}
                    maxLength={4000}
                    style={{
                      padding: "12px 14px",
                      background: BG2,
                      border: `1px solid ${LINE}`,
                      borderRadius: 8,
                      color: TEXT,
                      fontSize: 13,
                      fontFamily,
                      resize: "vertical",
                      lineHeight: 1.55,
                      minHeight: 120,
                    }}
                  />
                </div>

                {/* Inline context pills */}
                {contextPills.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: MUTED, marginRight: 2 }}>Attached:</span>
                    {contextPills.map((pill) => (
                      <span
                        key={pill.key}
                        title={`${pill.key}: ${pill.label}`}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: BG2,
                          border: `1px solid ${LINE}`,
                          color: MUTED,
                          fontSize: 10,
                          fontFamily,
                        }}
                      >
                        {pill.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status banner */}
                {status === "success" && (
                  <div style={{
                    padding: "9px 12px",
                    borderRadius: 7,
                    background: "#0d2615",
                    border: "1px solid #2a5a3a",
                    color: "#85d18a",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}>
                    <span>✓</span>
                    <span>Saved locally. Thanks for the note.</span>
                  </div>
                )}
                {status?.error && (
                  <div style={{
                    padding: "9px 12px",
                    borderRadius: 7,
                    background: "#2a1414",
                    border: "1px solid #6b3a3a",
                    color: "#e0a89a",
                    fontSize: 12,
                  }}>
                    ⚠ {status.error}
                  </div>
                )}

                {/* Footer: helper text + submit */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 2,
                }}>
                  <span style={{ fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
                    Stored in{" "}
                    <code style={{ fontFamily: "ui-monospace, monospace", color: MUTED }}>
                      data/feedback/
                    </code>
                    {!mobile && " · Cmd/Ctrl-Enter to send"}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={close}
                      disabled={submitting}
                      style={{
                        padding: "9px 14px",
                        background: "transparent",
                        border: `1px solid ${LINE}`,
                        borderRadius: 7,
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
                        padding: "9px 20px",
                        background: accent,
                        border: "none",
                        borderRadius: 7,
                        color: "#0a0c14",
                        cursor: submitting || !message.trim() ? "not-allowed" : "pointer",
                        fontSize: 13,
                        fontFamily,
                        opacity: submitting || !message.trim() ? 0.5 : 1,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {submitting ? "Saving…" : "Send feedback"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {view === "inbox" && (
              <>
                {/* Digest controls — the whole point: copy/download the
                    consolidated FEEDBACK.md to paste into a fresh Claude session. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={copyDigest}
                    disabled={!inboxEntries || inboxEntries.length === 0}
                    title="Copy the entire FEEDBACK.md to clipboard"
                    style={{
                      padding: "6px 12px",
                      background: accentDim,
                      border: `1px solid ${accentBorder}`,
                      borderRadius: 6,
                      color: accent,
                      cursor: !inboxEntries || inboxEntries.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontFamily,
                      opacity: !inboxEntries || inboxEntries.length === 0 ? 0.5 : 1,
                      fontWeight: 600,
                    }}
                  >
                    {copyState === "copied" ? "✓ Copied" : "Copy as markdown"}
                  </button>
                  <button
                    onClick={downloadDigest}
                    disabled={!inboxEntries || inboxEntries.length === 0}
                    title="Download FEEDBACK.md"
                    style={{
                      padding: "6px 12px",
                      background: "transparent",
                      border: `1px solid ${LINE}`,
                      borderRadius: 6,
                      color: MUTED,
                      cursor: !inboxEntries || inboxEntries.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontFamily,
                      opacity: !inboxEntries || inboxEntries.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Download
                  </button>
                  <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>
                    {inboxEntries ? `${inboxEntries.length} entr${inboxEntries.length === 1 ? "y" : "ies"}` : ""}
                  </span>
                </div>
                {copyState?.error && (
                  <div style={{ fontSize: 11, color: "#c2786f" }}>
                    ⚠ {copyState.error}
                  </div>
                )}

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 200,
                  maxHeight: mobile ? "55vh" : 420,
                  overflowY: "auto",
                  margin: "0 -2px",
                  padding: "0 2px",
                }}>
                  {inboxLoading && (
                    <div style={{ fontSize: 12, color: MUTED, padding: 8 }}>Loading inbox…</div>
                  )}
                  {inboxError && (
                    <div style={{ fontSize: 12, color: "#c2786f", padding: 8 }}>
                      Could not load: {inboxError}
                    </div>
                  )}
                  {!inboxLoading && !inboxError && inboxEntries?.length === 0 && (
                    <div style={{
                      fontSize: 12,
                      color: MUTED,
                      padding: "20px 10px",
                      lineHeight: 1.6,
                      textAlign: "center",
                    }}>
                      No feedback captured yet.<br />
                      Switch to <strong style={{ color: TEXT }}>Send</strong> to add your first note.
                    </div>
                  )}
                  {inboxEntries?.map((entry) => (
                    <div
                      key={entry.filename || entry.id}
                      style={{
                        padding: "11px 13px",
                        background: BG2,
                        border: `1px solid ${LINE}`,
                        borderRadius: 7,
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        opacity: deletingId === entry.filename ? 0.4 : 1,
                        transition: "opacity 120ms",
                      }}
                    >
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 8,
                      }}>
                        <span style={{
                          fontSize: 10,
                          color: accent,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontWeight: 600,
                        }}>
                          {entry.category || "other"}
                        </span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 10, color: MUTED }}>
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}
                          </span>
                          <button
                            onClick={() => deleteEntry(entry.filename)}
                            disabled={!entry.filename || deletingId === entry.filename}
                            title="Delete this entry"
                            aria-label="Delete entry"
                            style={{
                              background: "none",
                              border: "none",
                              color: MUTED,
                              cursor: !entry.filename || deletingId === entry.filename ? "not-allowed" : "pointer",
                              fontSize: 14,
                              lineHeight: 1,
                              padding: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div style={{
                        fontSize: 13,
                        color: TEXT,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}>
                        {entry.message}
                      </div>
                      {(entry.context?.agent || entry.context?.deckName || entry.context?.sessionName) && (
                        <div style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                          marginTop: 3,
                        }}>
                          {entry.context?.agent && (
                            <span style={{
                              fontSize: 10,
                              color: MUTED,
                              background: BG3,
                              border: `1px solid ${LINE}`,
                              padding: "1px 7px",
                              borderRadius: 999,
                            }}>{entry.context.agent}</span>
                          )}
                          {entry.context?.sessionName && (
                            <span style={{
                              fontSize: 10,
                              color: MUTED,
                              background: BG3,
                              border: `1px solid ${LINE}`,
                              padding: "1px 7px",
                              borderRadius: 999,
                            }}>{entry.context.sessionName}</span>
                          )}
                          {entry.context?.deckName && (
                            <span style={{
                              fontSize: 10,
                              color: MUTED,
                              background: BG3,
                              border: `1px solid ${LINE}`,
                              padding: "1px 7px",
                              borderRadius: 999,
                            }}>{entry.context.deckName}</span>
                          )}
                          {entry.context?.page && (
                            <span style={{
                              fontSize: 10,
                              color: MUTED,
                              background: BG3,
                              border: `1px solid ${LINE}`,
                              padding: "1px 7px",
                              borderRadius: 999,
                            }}>{entry.context.page}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
