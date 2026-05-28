"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import useTauriAppVersion from "../../hooks/useTauriAppVersion";

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug", glyph: "🐛" },
  { value: "feature", label: "Feature", glyph: "💡" },
  { value: "agent-quality", label: "Agent", glyph: "🧠" },
  { value: "ui", label: "UI / UX", glyph: "🎨" },
  { value: "other", label: "Other", glyph: "💬" },
];

/**
 * Floating feedback button (bottom-right) + draggable panel.
 *
 * Desktop: opens as a free-floating panel — no backdrop, drag by the header,
 * position persists across opens via localStorage. Stays put when you click
 * back into the app behind it.
 *
 * Mobile: opens as a bottom-sheet with backdrop (drag doesn't help on touch).
 *
 * Submission POSTs to /api/feedback which writes one JSON file per entry
 * under data/feedback/. Cmd/Ctrl-Shift-F pops the standalone OS window.
 */
const PANEL_POS_KEY = "mtg-feedback-panel-pos";
const PANEL_W = 540;

function truncateMid(text, limit) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}…`;
}

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
  const [position, setPosition] = useState(null); // {x,y} on desktop; null = use default
  const dragState = useRef(null);
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

  // Pull the last user→assistant pair out of the active chat session so we
  // can auto-attach it to freeform feedback. Same plumbing as the in-bubble
  // 👍/👎 reactions — the difference is the user can opt out per-submit.
  const lastExchange = useMemo(() => {
    if (page !== "chat") return null;
    const msgs = currentSession?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) return null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (m.role === "assistant" && !m.isError && m.content) {
        const prev = msgs[i - 1];
        return {
          user: prev?.role === "user" ? String(prev.content || "").trim() : null,
          assistant: String(m.content).trim(),
        };
      }
    }
    return null;
  }, [page, currentSession?.messages]);

  const [attachExchange, setAttachExchange] = useState(true);
  // Re-arm the default each time the modal opens (or the exchange changes
  // because the user kept chatting with the modal closed).
  useEffect(() => {
    if (open) setAttachExchange(!!lastExchange);
  }, [open, lastExchange]);

  // Detect Tauri runtime. The pop-out button opens a window.open() popup,
  // which in WebView2 (Tauri's Windows webview) escapes into the system's
  // default browser — jarring and unnecessary now that the panel itself
  // is draggable and stays put. Hide the pop-out path entirely in Tauri.
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTauri(!!(window.__TAURI__ || window.__TAURI_INTERNALS__));
  }, []);

  // App version (Tauri only). Tags every entry with the build that produced
  // it — essential once the .exe starts cutting releases.
  const appVersion = useTauriAppVersion();

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

  // Cmd/Ctrl-Shift-F opens the pop-out window from anywhere. Skipped in
  // Tauri where window.open punts to the system browser (see isTauri above).
  useEffect(() => {
    if (isTauri) return undefined;
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
  }, [isTauri, agent, currentSession?.id, currentSession?.name, activeDeck?.name, page]);

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

  // Native shell handoff — hand the absolute path to the OS's default
  // markdown editor (target="digest") or open the folder in Explorer/
  // Finder (target="dir"). The Node subprocess does the spawn; works
  // identically in `npm run dev` and inside the Tauri .exe.
  const openInShell = async (target) => {
    setCopyState(null);
    try {
      const response = await fetch("/api/feedback/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setCopyState({ error: data.error || `open failed (${response.status})` });
        return;
      }
      setCopyState(target === "dir" ? "opened-dir" : "opened-digest");
      setTimeout(() => setCopyState(null), 1800);
    } catch (error) {
      setCopyState({ error: error.message || "open failed" });
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

  // Restore last position on first desktop open; compute a sensible default
  // (slightly right of center, near top) if none saved or saved position is
  // off-screen after a window resize.
  useEffect(() => {
    if (!open || mobile) return;
    if (position) {
      // Reclamp existing position to current viewport in case the window
      // shrank since last time.
      const maxX = Math.max(8, window.innerWidth - PANEL_W - 8);
      const maxY = Math.max(8, window.innerHeight - 80);
      if (position.x > maxX || position.y > maxY) {
        setPosition({ x: Math.min(position.x, maxX), y: Math.min(position.y, maxY) });
      }
      return;
    }
    let restored = null;
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          restored = parsed;
        }
      }
    } catch {}
    const maxX = Math.max(8, window.innerWidth - PANEL_W - 8);
    const maxY = Math.max(8, window.innerHeight - 80);
    if (restored && restored.x <= maxX && restored.y <= maxY && restored.x >= 0 && restored.y >= 0) {
      setPosition(restored);
    } else {
      setPosition({
        x: Math.max(20, window.innerWidth - PANEL_W - 32),
        y: Math.max(20, Math.round(window.innerHeight * 0.12)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mobile]);

  // Persist position whenever it changes.
  useEffect(() => {
    if (!position || mobile) return;
    try {
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify(position));
    } catch {}
  }, [position, mobile]);

  // Window-level drag listeners — only active while the panel is open
  // on desktop. The mousedown that arms `dragState.current` happens on
  // the header (see onHeaderMouseDown below).
  useEffect(() => {
    if (mobile || !open) return undefined;
    const onMove = (event) => {
      const drag = dragState.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const w = modalRef.current?.offsetWidth || PANEL_W;
      const maxX = Math.max(8, window.innerWidth - w - 8);
      const maxY = Math.max(8, window.innerHeight - 60);
      setPosition({
        x: Math.max(8, Math.min(maxX, drag.origX + dx)),
        y: Math.max(8, Math.min(maxY, drag.origY + dy)),
      });
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mobile, open]);

  const onHeaderMouseDown = (event) => {
    if (mobile || !position) return;
    // Allow clicks on buttons inside the header to work normally.
    if (event.target.closest("button")) return;
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: position.x,
      origY: position.y,
    };
    event.preventDefault();
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setStatus(null);
    const body = (attachExchange && lastExchange)
      ? [
          trimmed,
          "",
          "— Last exchange —",
          lastExchange.user ? `User asked:\n${lastExchange.user}` : null,
          `Agent (${agent}) replied:\n${lastExchange.assistant}`,
        ].filter(Boolean).join("\n\n")
      : trimmed;
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: body,
          category,
          context: {
            agent,
            sessionId: currentSession?.id || null,
            sessionName: currentSession?.name || null,
            deckName: activeDeck?.name || null,
            deckCommander: currentSession?.lockedDeck?.commander || null,
            page,
            appVersion: appVersion || null,
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
        <PanelWrapper mobile={mobile} onBackdropClose={close}>
          <div
            ref={modalRef}
            role="dialog"
            aria-label="Send feedback"
            style={mobile ? {
              width: "100%",
              maxHeight: "92vh",
              background: BG3,
              border: `1px solid ${LINE}`,
              borderRadius: "14px 14px 0 0",
              padding: "18px 16px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontFamily,
              color: TEXT,
              boxShadow: "0 -8px 30px rgba(0,0,0,0.55)",
              overflowY: "auto",
            } : {
              position: "fixed",
              left: position?.x ?? 0,
              top: position?.y ?? 0,
              visibility: position ? "visible" : "hidden",
              width: "min(540px, calc(100vw - 16px))",
              maxHeight: "min(720px, calc(100vh - 24px))",
              background: BG3,
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              padding: "18px 22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontFamily,
              color: TEXT,
              boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
              overflowY: "auto",
              zIndex: 100,
            }}
          >
            {/* Header: tabs + actions. On desktop, doubles as the drag handle. */}
            <div
              onMouseDown={onHeaderMouseDown}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                borderBottom: `1px solid ${LINE}`,
                paddingBottom: 2,
                cursor: mobile ? "default" : "move",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", gap: 18 }}>
                {tabButton("compose", "Send")}
                {tabButton("inbox", `Inbox${inboxEntries ? ` (${inboxEntries.length})` : ""}`)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 4 }}>
                {!mobile && !isTauri && (
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

                {/* Auto-attach the last user→assistant pair when filing from
                    a chat. Click the chip to opt out per-submit. */}
                {lastExchange && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                      padding: "8px 10px",
                      borderRadius: 7,
                      background: attachExchange ? "#0d1a2e" : BG2,
                      border: `1px solid ${attachExchange ? (cfg?.border || LINE) : LINE}`,
                      fontSize: 11,
                      color: attachExchange ? TEXT : MUTED,
                      transition: "background 120ms, border-color 120ms, color 120ms",
                    }}
                  >
                    <span style={{ fontSize: 13, lineHeight: "16px", marginTop: 1 }}>📎</span>
                    <span style={{ flex: 1, lineHeight: 1.45 }}>
                      {attachExchange
                        ? <>Including last <strong>{agent}</strong> exchange — “{truncateMid(lastExchange.assistant, 70)}”</>
                        : <>Last exchange not included.</>}
                    </span>
                    <button
                      onClick={() => setAttachExchange(v => !v)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${LINE}`,
                        borderRadius: 5,
                        color: MUTED,
                        cursor: "pointer",
                        fontSize: 10,
                        padding: "2px 9px",
                        fontFamily,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {attachExchange ? "Remove" : "Attach"}
                    </button>
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
                  <button
                    onClick={() => openInShell("digest")}
                    disabled={!inboxEntries || inboxEntries.length === 0}
                    title="Open FEEDBACK.md in your default markdown editor"
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
                    {copyState === "opened-digest" ? "✓ Opened" : "Open in editor"}
                  </button>
                  <button
                    onClick={() => openInShell("dir")}
                    title="Open the feedback folder in your file manager"
                    style={{
                      padding: "6px 12px",
                      background: "transparent",
                      border: `1px solid ${LINE}`,
                      borderRadius: 6,
                      color: MUTED,
                      cursor: "pointer",
                      fontSize: 12,
                      fontFamily,
                    }}
                  >
                    {copyState === "opened-dir" ? "✓ Opened" : "Reveal folder"}
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
        </PanelWrapper>
      )}
    </>
  );
}

/**
 * Outer container around the dialog. On mobile it's a backdrop+bottom-sheet
 * (tap outside to close). On desktop it's a render-only Fragment so the
 * dialog floats freely with no overlay and clicks pass through to the app.
 */
function PanelWrapper({ mobile, onBackdropClose, children }) {
  if (!mobile) return children;
  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onBackdropClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,4,10,0.74)",
        backdropFilter: "blur(2px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {children}
    </div>
  );
}
