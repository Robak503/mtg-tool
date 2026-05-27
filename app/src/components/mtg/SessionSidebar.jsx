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
  sessions,
  activeSessions,
  archivedSessions,
  currentSession,
  activeSessionIds,
  agent,
  setAgent,
  createSession,
  switchSession,
  archiveSession,
  unarchiveSession,
  renameSession,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, MUTED, TEXT } = colors;
  const [showArchived, setShowArchived] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const visible = showArchived ? archivedSessions : activeSessions;

  // Group sessions by agent. The active agent's group renders first so the
  // user's own sessions are always at the top; other agents follow in the
  // AGENTS dict order. Groups with no sessions are dropped EXCEPT the active
  // agent (we still show that header so the empty state reads correctly when
  // there's no "+ New chat" button visible above — but only in the archived
  // view, where the button is hidden).
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

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${LINE}`,
        background: BG2,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        fontFamily,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {showArchived ? "Archived" : "Sessions"}
        </div>
        <button
          onClick={() => setShowArchived(prev => !prev)}
          style={{
            background: "none",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            fontSize: 10,
            fontFamily,
            padding: 0,
          }}
        >
          {showArchived ? "← active" : `archived (${archivedSessions.length})`}
        </button>
      </div>

      {!showArchived && (
        <button
          onClick={() => createSession(agent)}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: `1px dashed ${AGENTS[agent]?.border || LINE}`,
            background: "transparent",
            color: AGENTS[agent]?.color || TEXT,
            cursor: "pointer",
            fontSize: 12,
            fontFamily,
            textAlign: "left",
          }}
        >
          + New chat with {AGENTS[agent]?.name || "agent"}
        </button>
      )}

      {grouped.length === 0 && (
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, padding: "8px 0" }}>
          {showArchived ? "No archived chats yet." : "No conversations yet. Start one above."}
        </div>
      )}

      {grouped.map(group => (
        <div key={group.key}>
          <div
            style={{
              fontSize: 9,
              color: group.agent.color,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 4,
              opacity: 0.7,
            }}
          >
            {group.agent.icon} {group.agent.name} ({group.sessions.length})
          </div>
          {group.sessions.map(session => {
            const isCurrent = currentSession?.id === session.id;
            const cfg = AGENTS[session.agent];
            const isRenaming = renameId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => !isRenaming && switchSession(session.id)}
                style={{
                  marginBottom: 5,
                  padding: "7px 9px",
                  borderRadius: 6,
                  border: `1px solid ${isCurrent ? cfg.border : LINE}`,
                  background: isCurrent ? cfg.dim : "transparent",
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
                        border: `1px solid ${cfg.border}`,
                        borderRadius: 3,
                        color: TEXT,
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
                        color: isCurrent ? cfg.color : TEXT,
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
                    style={{
                      background: "none",
                      border: "none",
                      color: MUTED,
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1,
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    {session.archived ? "↶" : "×"}
                  </button>
                </div>
                {session.lockedDeck?.name && (
                  <div style={{
                    fontSize: 9,
                    color: cfg.color,
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
                  color: MUTED,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {sessionSummary(session)}
                </div>
                <div style={{ fontSize: 9, color: MUTED, opacity: 0.7 }}>
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
