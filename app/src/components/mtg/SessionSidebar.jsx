/**
 * SessionSidebar — the chat-session list: active and archived sessions grouped
 * by agent, each showing its locked deck and a relative timestamp, plus the
 * new-chat and archive controls.
 */
import { useMemo, useState } from "react";
import { AGENTS } from "../../lib/agents";

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function sessionSummary(session) {
  const lastAssistant = [...session.messages].reverse().find(m => m.role === "assistant" && m.content);
  const lastUser = [...session.messages].reverse().find(m => m.role === "user" && m.content);
  const last = lastAssistant || lastUser;
  if (!last) return "No messages yet";
  const oneLine = String(last.content || "").replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine;
}

export default function SessionSidebar({
  activeSessions,
  archivedSessions,
  currentSession,
  agent,
  createSession,
  switchSession,
  archiveSession,
  unarchiveSession,
  renameSession,
  fontFamily,
  mobile = false,
  onAfterSelect,
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const [query, setQuery] = useState("");

  // Name + locked-deck filter over whichever list is showing. Client-side —
  // the session objects are already fully loaded.
  const pool = showArchived ? archivedSessions : activeSessions;
  const visible = query.trim()
    ? pool.filter((s) => {
        const q = query.trim().toLowerCase();
        return (s.name || "").toLowerCase().includes(q)
          || (s.lockedDeck?.name || "").toLowerCase().includes(q);
      })
    : pool;

  // Group sessions by agent. The active agent's group renders first so the
  // user's own sessions are always at the top; other agents follow in the
  // AGENTS dict order. Groups with no sessions are dropped — the active
  // agent's included (the final filter keeps only non-empty groups).
  const grouped = useMemo(() => {
    const byAgent = new Map();
    for (const session of visible) {
      const list = byAgent.get(session.agent) || [];
      list.push(session);
      byAgent.set(session.agent, list);
    }
    for (const list of byAgent.values()) {
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }
    const agentKeys = Object.keys(AGENTS).filter(key => AGENTS[key].frontFacing !== false);
    const ordered = [agent, ...agentKeys.filter(key => key !== agent)];
    return ordered
      .map(key => ({ key, agent: AGENTS[key], sessions: byAgent.get(key) || [] }))
      .filter(group => group.sessions.length > 0);
  }, [visible, agent]);

  const commitRename = (sessionId) => {
    const trimmed = renameValue.trim();
    if (trimmed) renameSession(sessionId, trimmed);
    setRenameId(null);
    setRenameValue("");
  };

  // When the user picks a session, optionally bounce back to the chat
  // view — used on mobile so the sessions tab feels like a picker
  // rather than a permanent panel.
  const handleSelect = (sessionId) => {
    switchSession(sessionId);
    if (typeof onAfterSelect === "function") onAfterSelect(sessionId);
  };

  return (
    <div
      style={{
        width: mobile ? "100%" : 220,
        flexShrink: 0,
        borderRight: mobile ? "none" : "1px solid var(--ley-line)",
        background: "var(--ley-glass)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        fontFamily,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {showArchived ? "Archived" : "Sessions"}
        </div>
        <button
          onClick={() => setShowArchived(prev => !prev)}
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 6px", fontSize: 10 }}
        >
          {showArchived ? "← active" : `archived (${archivedSessions.length})`}
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by chat or deck…"
        style={{
          width: "100%",
          padding: "6px 9px",
          background: "var(--ley-surface-2)",
          border: "1px solid var(--ley-line)",
          borderRadius: 6,
          color: "var(--ley-text)",
          fontSize: 12,
          fontFamily,
          boxSizing: "border-box",
        }}
      />

      {!showArchived && (
        <button
          onClick={() => createSession(agent)}
          className="btn btn-primary btn-sm"
          style={{ width: "100%", padding: "8px 10px" }}
        >
          + New chat with {AGENTS[agent]?.name || "agent"}
        </button>
      )}

      {grouped.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--ley-text-faint)", lineHeight: 1.5, padding: "8px 0" }}>
          {showArchived ? "No archived chats yet." : "No conversations yet. Start one above."}
        </div>
      )}

      {grouped.map(group => (
        <div key={group.key}>
          <div
            style={{
              fontSize: 10,
              color: "var(--ley-text-faint)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 4,
            }}
          >
            {group.agent.icon} {group.agent.name} ({group.sessions.length})
          </div>
          {group.sessions.map(session => {
            const isCurrent = currentSession?.id === session.id;
            const isRenaming = renameId === session.id;
            return (
              // Quiet .ley-row list item: green edge on hover, green fill when
              // it's the current session (inline style wins over the class).
              <div
                key={session.id}
                onClick={() => !isRenaming && handleSelect(session.id)}
                className="ley-row"
                style={{
                  marginBottom: 5,
                  padding: "7px 9px",
                  borderRadius: "var(--r-sm)",
                  ...(isCurrent
                    ? { borderColor: "var(--ley-line-bright)", background: "var(--ley-green-dim)" }
                    : {}),
                  cursor: isRenaming ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={event => setRenameValue(event.target.value)}
                      onBlur={() => commitRename(session.id)}
                      onKeyDown={event => {
                        if (event.key === "Enter") commitRename(session.id);
                        if (event.key === "Escape") { setRenameId(null); setRenameValue(""); }
                      }}
                      style={{
                        flex: 1,
                        padding: "2px 4px",
                        background: "transparent",
                        border: "1px solid var(--ley-line-bright)",
                        borderRadius: 3,
                        color: "var(--ley-text)",
                        fontSize: 12,
                        fontFamily,
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={event => {
                        event.stopPropagation();
                        setRenameId(session.id);
                        setRenameValue(session.name);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: isCurrent ? "var(--ley-green)" : "var(--ley-text)",
                        fontWeight: isCurrent ? 700 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title="Double-click to rename"
                    >
                      {session.name}
                    </span>
                  )}
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      if (session.archived) unarchiveSession(session.id);
                      else archiveSession(session.id);
                    }}
                    title={session.archived ? "Unarchive" : "Archive"}
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ padding: "1px 4px", fontSize: 12, lineHeight: 1, flexShrink: 0 }}
                  >
                    {session.archived ? "↶" : "×"}
                  </button>
                </div>
                {session.lockedDeck?.name && (
                  <div style={{
                    fontSize: 9,
                    color: "var(--ley-green-text)",
                    opacity: 0.85,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    🔒 {session.lockedDeck.name}
                  </div>
                )}
                <div style={{
                  fontSize: 10,
                  color: "var(--ley-text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {sessionSummary(session)}
                </div>
                <div style={{ fontSize: 9, color: "var(--ley-text-faint)" }}>
                  {relativeTime(session.updatedAt)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
