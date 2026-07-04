"use client";

/**
 * LearnLogEntry — the ONE renderer for a decisionLog entry, shared by the live
 * "Recent actions" feed (LearnView) and the P7 replay scrubber (RecordsView) so
 * a recorded play-by-play reads identically to the live game.
 *
 * A decisionLog entry (learnSession.js) is a structured object:
 *   { ts, turn, phase, step, actor, action: { kind, name? }, auto, reasoning }
 * Legacy/defensive: a plain string entry renders as-is (older records, or any
 * non-object line), so this never emits "[object Object]".
 */

const ACTOR_COLOR = (actor) => (actor === "user" ? "var(--ley-green)" : "var(--ley-blue)");

/** One log line. `dim` mutes it (non-current turns in the scrubber). */
export function LearnLogEntry({ entry, dim = false }) {
  if (entry == null) return null;
  if (typeof entry === "string") {
    return (
      <div style={{ fontSize: 11, color: dim ? "var(--ley-text-faint)" : "var(--ley-text)", lineHeight: 1.4, padding: "6px 8px", background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: 4, opacity: dim ? 0.6 : 1 }}>
        {entry}
      </div>
    );
  }
  const action = entry.action || {};
  return (
    <div style={{ fontSize: 11, color: "var(--ley-text)", lineHeight: 1.4, padding: "6px 8px", background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: 4, opacity: dim ? 0.55 : 1 }}>
      <div style={{ color: ACTOR_COLOR(entry.actor), fontWeight: 700, marginBottom: 2 }}>
        T{entry.turn ?? "?"} · {entry.actor || "?"}{entry.auto ? " (auto)" : ""}
      </div>
      <div>
        {action.kind || "—"}
        {action.name ? ` · ${action.name}` : ""}
      </div>
    </div>
  );
}

/**
 * Group a chronological decisionLog into per-turn segments for the scrubber.
 * A new segment starts whenever the entry's turn changes from the previous one
 * (the log is chronological, so a turn's entries are contiguous). String/legacy
 * entries with no numeric turn fall into a `turn: null` segment. Returns an
 * ordered array of `{ turn, entries }`.
 */
export function groupLogByTurn(logTail) {
  const entries = Array.isArray(logTail) ? logTail : [];
  const groups = [];
  for (const entry of entries) {
    const turn = entry && typeof entry === "object" && typeof entry.turn === "number" ? entry.turn : null;
    const last = groups[groups.length - 1];
    if (last && last.turn === turn) last.entries.push(entry);
    else groups.push({ turn, entries: [entry] });
  }
  return groups;
}
