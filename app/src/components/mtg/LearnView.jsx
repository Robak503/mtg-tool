"use client";

/**
 * LearnView — Phase 6 Learn-to-Play UI (v1).
 *
 * Minimal but functional. The user picks a deck + opponent + difficulty,
 * clicks Start, and plays through a game via the decision modal. The
 * server runs the actual engine; this view renders prompt/options and
 * forwards the user's pick.
 *
 * Layout:
 *   Header — deck names, difficulty, turn/phase/step indicator
 *   Body left — decision narration + options
 *   Body right — recent auto-decided action feed
 *   Footer — End game button
 *
 * Scope:
 *   - Deck picker reads from useDeckStore so the user can pick from
 *     their saved decks for both sides.
 *   - No fancy zone rendering, no card images. Just the decision flow.
 *     PR8+ can add proper zone graphics if it makes the experience
 *     better.
 */

import { useEffect, useState } from "react";
import useLearnSession from "../../hooks/useLearnSession";
import LearnBoard from "./LearnBoard";
import StabilityBadge from "./StabilityBadge";
import { fetchArbiterTrace } from "../../lib/arbiterUtils";

const DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "Beginner", blurb: "Ask every decision with full narration." },
  { value: "intermediate", label: "Intermediate", blurb: "Auto-play lands; surface real choices." },
  { value: "expert", label: "Expert", blurb: "Silent autopilot; post-game analysis." },
];

const MODE_OPTIONS = [
  { value: "standard", label: "Standard 1v1", blurb: "You vs one opponent, 20 life." },
  { value: "commander", label: "Commander 4P", blurb: "You + three opponents, 40 life, free-for-all." },
];

const SEAT_LABELS = { user: "You", ai: "Opponent", ai1: "AI 1", ai2: "AI 2", ai3: "AI 3" };
function seatLabel(id) {
  return SEAT_LABELS[id] || id;
}

function deckToCardArray(deck) {
  // useDeckStore exposes decks as { cards: [{ name, qty, section }] }.
  // The engine wants individual card objects with id + name + type +
  // mana + oracle. We don't have type/oracle here without the deckData
  // hydration — for v1 we pass just name + a synthetic id and let the
  // engine treat unknowns as generic non-creature cards (they end up
  // as cast-spell candidates that resolve as no-ops). PR7 will hook
  // cardIndex on the server side to enrich on load.
  if (!deck?.cards) return [];
  const out = [];
  for (const entry of deck.cards) {
    if (entry.section === "Sideboard" || entry.section === "Tokens" || entry.section === "Commander") continue;
    for (let i = 0; i < (entry.qty || 1); i++) {
      out.push({
        id: `${deck.id || "deck"}-${entry.name}-${i}`,
        name: entry.name,
        type: entry.type || "",
        mana: entry.mana || "",
        oracle: entry.oracle || "",
      });
    }
  }
  return out;
}

function commandersOf(deck) {
  if (!deck?.cards) return [];
  return deck.cards
    .filter(c => c.section === "Commander")
    .map(c => ({
      id: `cmd-${deck.id || "deck"}-${c.name}`,
      name: c.name,
      type: c.type || "Legendary Creature",
      mana: c.mana || "",
    }));
}

export default function LearnView({
  savedDecks,
  cfg,
  colors,
  fontFamily,
}) {
  const { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const session = useLearnSession();
  const [mode, setMode] = useState("standard");
  const [userDeckId, setUserDeckId] = useState("");
  const [oppIds, setOppIds] = useState(["", "", ""]); // up to 3 opponents (Commander)
  const [difficulty, setDifficulty] = useState("beginner");
  const [saves, setSaves] = useState([]);

  const oppCount = mode === "commander" ? 3 : 1;
  const userDeck = savedDecks.find(d => d.id === userDeckId);
  const oppDecks = oppIds.slice(0, oppCount).map(id => savedDecks.find(d => d.id === id));
  const canStart = userDeck && oppDecks.every(Boolean) && session.status !== "starting";

  const setOppId = (index, id) => setOppIds(prev => prev.map((v, i) => (i === index ? id : v)));

  const handleStart = async () => {
    if (!canStart) return;
    // Deck identity for the saved-game list ("Sliver Hivelord · turn 4").
    const meta = {
      userDeckId: userDeck?.id,
      userDeckName: userDeck?.name,
      opponentDeckNames: oppDecks.map(d => d?.name),
    };
    if (mode === "commander") {
      await session.start({
        mode: "commander",
        userDeck: deckToCardArray(userDeck),
        opponentDecks: oppDecks.map(deckToCardArray),
        userCommanders: commandersOf(userDeck),
        opponentCommanders: oppDecks.map(commandersOf),
        difficulty,
        ...meta,
      });
    } else {
      await session.start({
        mode: "standard",
        userDeck: deckToCardArray(userDeck),
        opponentDeck: deckToCardArray(oppDecks[0]),
        userCommanders: commandersOf(userDeck),
        opponentCommanders: commandersOf(oppDecks[0]),
        difficulty,
        ...meta,
      });
    }
  };

  const handleAbandon = () => session.reset();

  // Saved-game list for the "Continue a game" panel on the idle screen.
  useEffect(() => {
    let cancelled = false;
    if (session.status === "idle") {
      session.listSaves().then(list => { if (!cancelled) setSaves(list); });
    }
    return () => { cancelled = true; };
    // session.listSaves is stable (useCallback); refresh only on status change.
  }, [session.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = (sessionId) => session.resume(sessionId);
  const handleDeleteSave = async (sessionId) => {
    await session.deleteSave(sessionId);
    setSaves(prev => prev.filter(s => s.sessionId !== sessionId));
  };

  // ─── Idle / setup screen ──────────────────────────────────────────────────

  if (session.status === "idle" || session.status === "starting") {
    return (
      <div style={containerStyle(BG, fontFamily)}>
        <header style={{ ...headerStyle(LINE, BG2, GOLD), justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            The Academy · Learn to Play
            <StabilityBadge level="preview" title="Preview — the Academy is early and still being built out" />
          </span>
          {session.status === "starting" && <span style={{ fontSize: 12, color: MUTED }}>starting…</span>}
        </header>
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>
              Pick a deck to learn, an opponent to play against, and a difficulty.
              The session runs locally — every decision is narrated by Jace at
              Beginner difficulty, lighter at higher difficulties.
            </p>

            {saves.length > 0 && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ ...labelStyle(MUTED), padding: 0 }}>Continue a game</div>
                {saves.map(s => (
                  <div
                    key={s.sessionId}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: `1px solid ${LINE}`, borderRadius: 4, background: BG2 }}
                  >
                    <span style={{ fontSize: 12, color: TEXT }}>
                      {(s.userDeckName || "Untitled deck")}
                      {" · "}{s.mode === "commander" ? "Commander" : "Standard"}
                      {" · turn "}{s.turn ?? "?"}
                      {" · "}{s.difficulty || "beginner"}
                    </span>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        onClick={() => handleResume(s.sessionId)}
                        disabled={!s.resumable || session.status === "starting"}
                        title={s.resumable ? "Resume this game" : "Saved on an incompatible version — start a new game"}
                        style={{ padding: "4px 10px", fontSize: 11, background: s.resumable ? (cfg?.color || GOLD) : LINE, color: "#fff", border: "none", borderRadius: 4, cursor: s.resumable ? "pointer" : "not-allowed", fontFamily, opacity: s.resumable ? 1 : 0.5 }}
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => handleDeleteSave(s.sessionId)}
                        title="Delete this saved game"
                        style={{ padding: "4px 8px", fontSize: 11, background: "transparent", color: MUTED, border: `1px solid ${LINE}`, borderRadius: 4, cursor: "pointer", fontFamily }}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <fieldset style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "none", padding: 0 }}>
              <legend style={{ ...labelStyle(MUTED), padding: 0, gridColumn: "1 / -1" }}>Format</legend>
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", flexDirection: "column", padding: "10px 12px",
                    border: `1px solid ${mode === opt.value ? cfg?.border || GOLD : LINE}`,
                    background: mode === opt.value ? cfg?.dim || BG2 : "transparent",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="mode" value={opt.value} checked={mode === opt.value} onChange={e => setMode(e.target.value)} />
                    <strong style={{ color: cfg?.color || GOLD, fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: MUTED, marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>

            <label style={labelStyle(MUTED)}>
              Your deck
              <select
                value={userDeckId}
                onChange={e => setUserDeckId(e.target.value)}
                style={selectStyle(BG2, BG3, LINE, TEXT, fontFamily)}
              >
                <option value="">(pick a saved deck)</option>
                {savedDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            {Array.from({ length: oppCount }).map((_, i) => (
              <label key={i} style={labelStyle(MUTED)}>
                {oppCount === 1 ? "Opponent's deck" : `Opponent ${i + 1}'s deck`}
                <select
                  value={oppIds[i] || ""}
                  onChange={e => setOppId(i, e.target.value)}
                  style={selectStyle(BG2, BG3, LINE, TEXT, fontFamily)}
                >
                  <option value="">(pick a saved deck)</option>
                  {savedDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            ))}

            <fieldset style={{ display: "grid", gap: 8, border: "none", padding: 0 }}>
              <legend style={{ ...labelStyle(MUTED), padding: 0 }}>Difficulty</legend>
              {DIFFICULTY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "10px 12px",
                    border: `1px solid ${difficulty === opt.value ? cfg?.border || GOLD : LINE}`,
                    background: difficulty === opt.value ? cfg?.dim || BG2 : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={opt.value}
                      checked={difficulty === opt.value}
                      onChange={e => setDifficulty(e.target.value)}
                    />
                    <strong style={{ color: cfg?.color || GOLD, fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: MUTED, marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>

            <button
              onClick={handleStart}
              disabled={!canStart}
              style={{
                padding: "10px 18px",
                background: canStart ? cfg?.color || GOLD : LINE,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: canStart ? "pointer" : "not-allowed",
                fontSize: 14,
                fontFamily,
                opacity: canStart ? 1 : 0.5,
                marginTop: 8,
              }}
            >
              {session.status === "starting" ? "Starting…" : "Start game"}
            </button>

            {session.error && (
              <div style={errorBoxStyle()}>⚠ {session.error}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Active game (and terminal/hand-off states, as overlays ON the board) ──
  // The board stays mounted for active, ended, unresolved and error states; the
  // result scrim / Arbiter side-sheet / error banner layer on TOP of it (GAP C).
  // The legacy two-column text view is only a fallback when there is no board.

  const decision = session.decision;

  return (
    <div style={containerStyle(BG, fontFamily)}>
      <header style={{ ...headerStyle(LINE, BG2, GOLD), justifyContent: "space-between" }}>
        <span>The Academy · {session.mode === "commander" ? "Commander 4P pod" : `${userDeck?.name || "You"} vs ${oppDecks[0]?.name || "Opponent"}`}</span>
        <span style={{ fontSize: 11, color: MUTED }}>
          Turn {session.turn} · {session.activePlayer === "user" ? "Your" : `${seatLabel(session.activePlayer)}'s`} {session.step}
        </span>
      </header>

      <TableStrip table={session.table} activePlayer={session.activePlayer} cfg={cfg} colors={colors} />

      {session.board ? (
        <LearnBoard
          board={session.board}
          decision={decision}
          onAction={session.applyChoice}
          logTail={session.decisionLogTail}
          turn={session.turn}
          step={session.step}
          colors={colors}
          status={session.status}
          difficulty={session.difficulty}
          onNewGame={handleAbandon}
        />
      ) : (
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Decision area */}
        <main style={{ flex: 2, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <DecisionPrompt
            decision={decision}
            cfg={cfg}
            colors={colors}
            fontFamily={fontFamily}
            onChoose={session.applyChoice}
            onContinue={session.continueGame}
            onTutorChoose={session.applyTutorChoice}
            onCloneChoose={session.applyCloneChoice}
            onScryChoose={session.applyScryChoice}
          />
        </main>

        {/* Auto-played feed */}
        <aside style={{
          width: 280,
          borderLeft: `1px solid ${LINE}`,
          background: BG2,
          padding: 14,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Recent actions
          </div>
          {(session.decisionLogTail || []).slice().reverse().map((entry, i) => (
            <div
              key={`${entry.ts}-${i}`}
              style={{
                fontSize: 11,
                color: TEXT,
                lineHeight: 1.4,
                padding: "6px 8px",
                background: BG3,
                border: `1px solid ${LINE}`,
                borderRadius: 4,
              }}
            >
              <div style={{ color: entry.actor === "user" ? cfg?.color || GOLD : "#9d98b8", fontWeight: 700, marginBottom: 2 }}>
                T{entry.turn} · {entry.actor}{entry.auto ? " (auto)" : ""}
              </div>
              <div>
                {entry.action.kind}
                {entry.action.name ? ` · ${entry.action.name}` : ""}
              </div>
            </div>
          ))}
          {!(session.decisionLogTail || []).length && (
            <div style={{ fontSize: 11, color: MUTED }}>No actions yet.</div>
          )}
        </aside>
      </div>
      )}

      {/* Unresolved spell → Arbiter ruling as a NON-BLOCKING side-sheet over the
          board (GAP C). The board behind it stays visible and interactive. */}
      {session.board && decision?.kind === "unresolved" && (
        <div style={unresolvedSheetStyle(LINE, BG2)}>
          <UnresolvedPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onContinue={session.continueGame} />
        </div>
      )}
      {/* Interactive tutor search → library picker side-sheet (non-blocking, board behind
          stays visible). The game is paused on this choice until the player picks. */}
      {session.board && decision?.kind === "tutor-search" && (
        <div style={tutorSheetStyle(LINE, BG2)}>
          <TutorSearchPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={session.applyTutorChoice} />
        </div>
      )}
      {/* Interactive clone copy-pick → choose which creature to copy (CR 707). Same side-sheet. */}
      {session.board && decision?.kind === "clone-search" && (
        <div style={tutorSheetStyle(LINE, BG2)}>
          <CloneCopyPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={session.applyCloneChoice} />
        </div>
      )}
      {/* Interactive scry/surveil → keep/move the top N (CR 701.18 / 701.43). Same side-sheet. */}
      {session.board && decision?.kind === "scry-surveil" && (
        <div style={tutorSheetStyle(LINE, BG2)}>
          <ScrySurveilPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={session.applyScryChoice} />
        </div>
      )}
      {/* Engine OR transport error as a floating banner over the board (never drops
          to text, and never leaves the stale board looking silently interactive). */}
      {session.board && (session.status === "error" || decision?.kind === "dispatch-error" || decision?.kind === "engine-stuck") && (
        <div style={floatErrorStyle()}>
          ⚠ {session.status === "error"
            ? (session.error || "Lost the connection to the game.")
            : `${decision.kind === "engine-stuck" ? "The engine got stuck" : "The engine rejected that"}: ${decision.reason}${decision.code ? ` (${decision.code})` : ""}`}
          {" — use “Abandon game” below to start over."}
        </div>
      )}

      <footer style={{ padding: "10px 16px", borderTop: `1px solid ${LINE}`, background: BG2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={handleAbandon} style={{ ...subtleButtonStyle(LINE, MUTED, fontFamily) }}>
          Abandon game
        </button>
        {session.error && <span style={{ fontSize: 11, color: "#e0a89a" }}>⚠ {session.error}</span>}
      </footer>

      <AskPanel sessionId={session.sessionId} cfg={cfg} colors={colors} fontFamily={fontFamily} avoidSheet={!!session.board && decision?.kind === "unresolved"} />
    </div>
  );
}

// ─── Ask Jace — real-time, board-aware tutor pop-out ──────────────────────────

function AskPanel({ sessionId, cfg, colors, fontFamily, avoidSheet = false }) {
  // When the unresolved Arbiter side-sheet (right:16, width:372 → left edge ~388,
  // z-40) is up, slide the Ask-Jace pop-out clear of it and lift it above the sheet
  // so the affordance isn't painted behind the ruling card.
  const dockRight = avoidSheet ? 404 : 18;
  const dockZ = avoidSheet ? 45 : 20;
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]); // [{ q, a, error, pending }]

  const ask = async () => {
    const question = q.trim();
    if (!question || busy || !sessionId) return;
    setBusy(true);
    setQ("");
    setHistory(h => [...h, { q: question, a: null, error: null, pending: true }]);
    const finish = patch => setHistory(h => h.map((it, i) => (i === h.length - 1 ? { ...it, ...patch, pending: false } : it)));
    try {
      const resp = await fetch("/api/learn/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, question }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) finish({ a: data.answer });
      else finish({ error: data.error || `Failed (${resp.status})` });
    } catch (e) {
      finish({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const accent = cfg?.color || GOLD;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask Jace about the board"
        style={{
          position: "absolute", bottom: 60, right: dockRight, zIndex: dockZ,
          display: "flex", alignItems: "center", gap: 7,
          padding: "9px 14px", borderRadius: 999,
          background: accent, color: "#fff", border: "none", cursor: "pointer",
          fontSize: 12.5, fontWeight: 600, fontFamily,
          boxShadow: "0 6px 18px -6px rgba(0,0,0,0.6)",
        }}
      >
        💬 Ask Jace
      </button>
    );
  }

  return (
    <div style={{
      position: "absolute", bottom: 60, right: dockRight, zIndex: dockZ,
      width: 330, maxWidth: "calc(100% - 36px)", maxHeight: 400,
      display: "flex", flexDirection: "column",
      background: BG2, border: `1px solid ${cfg?.border || LINE}`, borderRadius: 10,
      boxShadow: "0 16px 40px -12px rgba(0,0,0,0.7)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: accent }}>Ask Jace</span>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {history.length === 0 && (
          <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            Ask anything about the current board — &ldquo;what can I play?&rdquo;, &ldquo;is it safe to attack?&rdquo;, &ldquo;what does this step do?&rdquo;. Jace reads the live game to answer.
          </div>
        )}
        {history.map((item, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>{item.q}</div>
            {item.pending && <div style={{ fontSize: 11.5, color: MUTED, fontStyle: "italic" }}>Jace is thinking…</div>}
            {item.a && <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5, background: BG3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 9px", whiteSpace: "pre-wrap" }}>{item.a}</div>}
            {item.error && <div style={{ fontSize: 11.5, color: "#e0a89a" }}>⚠ {item.error}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: `1px solid ${LINE}` }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !busy) ask(); }}
          placeholder="Ask about the board…"
          style={{ flex: 1, padding: "7px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, fontSize: 12.5, fontFamily }}
        />
        <button
          onClick={ask}
          disabled={busy || !q.trim()}
          style={{ padding: "7px 12px", background: accent, color: "#fff", border: "none", borderRadius: 6, cursor: busy || !q.trim() ? "not-allowed" : "pointer", opacity: busy || !q.trim() ? 0.5 : 1, fontSize: 12.5, fontWeight: 600, fontFamily }}
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ─── Table strip (all seats: life / zones / commander damage) ─────────────────

function TableStrip({ table, activePlayer, cfg, colors }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  if (!table || table.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: BG2, borderBottom: `1px solid ${LINE}`, overflowX: "auto" }}>
      {table.map(seat => {
        const active = seat.id === activePlayer;
        const cmd = Object.entries(seat.commanderDamage || {}).filter(([, n]) => n > 0);
        return (
          <div
            key={seat.id}
            style={{
              minWidth: 118, flexShrink: 0, padding: "8px 10px", borderRadius: 6,
              background: BG3,
              border: `1px solid ${active ? cfg?.border || GOLD : LINE}`,
              boxShadow: active ? `0 0 0 1px ${cfg?.border || GOLD}` : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: seat.isUser ? (cfg?.color || GOLD) : TEXT }}>
                {seatLabel(seat.id)}
              </span>
              {active && <span style={{ fontSize: 8, color: cfg?.color || GOLD, textTransform: "uppercase", letterSpacing: "0.08em" }}>turn</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: seat.life <= 5 ? "#e0a89a" : TEXT, lineHeight: 1.15 }}>
              {seat.life} <span style={{ fontSize: 10, color: MUTED, fontWeight: 400 }}>life</span>
            </div>
            <div style={{ display: "flex", gap: 9, fontSize: 10, color: MUTED, marginTop: 2 }}>
              <span title="cards in hand">✋ {seat.handCount}</span>
              <span title="permanents on board">▦ {seat.boardCount}</span>
              <span title="cards in graveyard">⚰ {seat.graveyardCount}</span>
            </div>
            {cmd.length > 0 && (
              <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>
                cmdr dmg {cmd.map(([from, n]) => `${seatLabel(from)} ${n}`).join(" · ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Decision prompt ─────────────────────────────────────────────────────────

function DecisionPrompt({ decision, cfg, colors, fontFamily, onChoose, onContinue, onTutorChoose, onCloneChoose, onScryChoose }) {
  const { BG3, LINE, TEXT, MUTED, GOLD } = colors || {};

  if (!decision) {
    return <p style={{ color: MUTED, fontSize: 13 }}>Waiting for engine…</p>;
  }
  if (decision.kind === "unresolved") {
    return <UnresolvedPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onContinue={onContinue} />;
  }
  if (decision.kind === "tutor-search") {
    return <TutorSearchPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={onTutorChoose} />;
  }
  if (decision.kind === "clone-search") {
    return <CloneCopyPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={onCloneChoose} />;
  }
  if (decision.kind === "scry-surveil") {
    return <ScrySurveilPanel decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={onScryChoose} />;
  }
  if (decision.kind === "dispatch-error") {
    return (
      <div style={errorBoxStyle()}>
        ⚠ {decision.reason || "Engine rejected that choice"}
        {decision.code && <div style={{ fontSize: 10, marginTop: 4 }}>code: {decision.code}</div>}
      </div>
    );
  }
  if (decision.kind === "engine-stuck") {
    return <div style={errorBoxStyle()}>⚠ Engine got stuck: {decision.reason}</div>;
  }
  if (decision.kind === "auto-decided") {
    return <p style={{ color: MUTED, fontSize: 13 }}>Engine auto-decided ({decision.metadata?.reasoning || "no reason"})…</p>;
  }
  if (decision.kind !== "ask") {
    return <p style={{ color: MUTED, fontSize: 13 }}>Unknown decision kind: {decision.kind}</p>;
  }

  return (
    <>
      <div style={{
        whiteSpace: "pre-wrap",
        fontSize: 13,
        color: TEXT,
        lineHeight: 1.6,
        padding: "12px 14px",
        background: BG3,
        border: `1px solid ${LINE}`,
        borderRadius: 6,
      }}>
        {decision.prompt}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(decision.options || []).map((opt, i) => {
          const isRecommended = i === decision.metadata?.defaultIndex;
          return (
            <button
              key={`${opt.kind}-${opt.cardId || opt.permanentId || "x"}-${i}`}
              onClick={() => onChoose(opt)}
              style={{
                textAlign: "left",
                padding: "10px 14px",
                background: isRecommended ? (cfg?.dim || BG3) : "transparent",
                border: `1px solid ${isRecommended ? cfg?.border || GOLD : LINE}`,
                borderRadius: 6,
                color: TEXT,
                cursor: "pointer",
                fontSize: 13,
                fontFamily,
              }}
            >
              <span style={{ color: isRecommended ? cfg?.color || GOLD : MUTED, fontSize: 10, marginRight: 8 }}>
                {i + 1}.
              </span>
              {opt.name || opt.kind}
              {opt.kind === "declare-attacker" && opt.defenderId && (
                <span style={{ color: MUTED }}> → {seatLabel(opt.defenderId)}</span>
              )}
              {isRecommended && <span style={{ fontSize: 10, color: cfg?.color || GOLD, marginLeft: 8 }}>(recommended)</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── Unresolved → Arbiter teaching moment (P2.1) ──────────────────────────────

/**
 * The engine couldn't model a spell's effect, so instead of silently doing
 * nothing it paused and handed the card to the Arbiter (the local, Ollama-only
 * rules engine) for a verified ruling. We auto-fetch that ruling on mount, show
 * it as a teaching moment, and let the player continue. The engine never made a
 * network call — this component does, exactly as the design intends.
 */
function UnresolvedPanel({ decision, cfg, colors, fontFamily, onContinue }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;
  const [ruling, setRuling] = useState({ trace: "", status: null, loading: true, error: null });
  const [continuing, setContinuing] = useState(false);

  // Fetch the Arbiter's ruling once per unresolved spell (keyed by stack id).
  useEffect(() => {
    let cancelled = false;
    setRuling({ trace: "", status: null, loading: true, error: null });
    fetchArbiterTrace({
      question: decision.question,
      cardContext: decision.oracle || "",
      context: decision.context || "",
      cardNames: decision.cardName ? [decision.cardName] : undefined,
      provider: "ollama", // local-only — never spends API credits
    })
      .then(res => {
        if (cancelled) return;
        if (res.trace) setRuling({ trace: res.trace, status: res.status, loading: false, error: null });
        else setRuling({ trace: "", status: res.status, loading: false, error: "Arbiter is offline — make sure Ollama is running, or continue without a ruling." });
      })
      .catch(e => { if (!cancelled) setRuling({ trace: "", status: null, loading: false, error: e.message }); });
    return () => { cancelled = true; };
  }, [decision.stackObjectId, decision.question, decision.oracle, decision.context, decision.cardName]);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    try { await onContinue?.(); } finally { setContinuing(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        padding: "12px 14px",
        background: BG3,
        border: `1px solid ${accent}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          ⚖ Rules check — {decision.cardName || "this card"}
        </div>
        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5 }}>
          The simulator can&rsquo;t fully model this card yet, so rather than guess it asked
          the Arbiter (the local rules engine) for a ruling. Read it, apply it on your board
          if you like, then continue.
        </div>
      </div>

      <div style={{
        padding: "12px 14px",
        background: BG2,
        border: `1px solid ${LINE}`,
        borderRadius: 6,
        minHeight: 60,
      }}>
        {ruling.loading && <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>Asking the Arbiter…</div>}
        {!ruling.loading && ruling.trace && (
          <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{ruling.trace}</div>
        )}
        {!ruling.loading && !ruling.trace && ruling.error && (
          <div style={{ fontSize: 12, color: "#e0a89a" }}>⚠ {ruling.error}</div>
        )}
      </div>

      <button
        onClick={handleContinue}
        disabled={continuing}
        style={{
          alignSelf: "flex-start",
          padding: "9px 16px",
          background: accent,
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: continuing ? "not-allowed" : "pointer",
          opacity: continuing ? 0.6 : 1,
          fontSize: 13,
          fontWeight: 600,
          fontFamily,
        }}
      >
        {continuing ? "Continuing…" : "Continue playing"}
      </button>
    </div>
  );
}

/**
 * Interactive tutor search — the player browses the matching cards in their own library
 * (real art via /api/art-crop?name=) and picks one to put into their hand, or finds
 * nothing. Resumes the suspended spell via session.applyTutorChoice. The board behind
 * stays visible (non-blocking sheet), but the game is paused until the choice is made.
 */
function TutorSearchPanel({ decision, cfg, colors, fontFamily, onChoose }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  // Reset the selection whenever the search changes — a card with two tutor clauses
  // resolves one tutor-search straight into the next, reusing this same panel; without
  // this the stale selection from the first search could be submitted to the second
  // (a non-candidate → rejected). Keyed on the candidate ids (a new search → new set).
  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => { setSelected(null); }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting) return;
    setSubmitting(true);
    try { await onChoose?.(cardId); } finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ padding: "12px 14px", background: BG3, border: `1px solid ${accent}`, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          🔍 Search your library{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5, marginTop: 4 }}>
          Choose {decision.filterLabel ? `a ${decision.filterLabel}` : "a card"} to put into your hand
          ({candidates.length} match{candidates.length === 1 ? "" : "es"}). Then your library is shuffled.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignContent: "start" }}>
        {candidates.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: MUTED, fontStyle: "italic" }}>
            No matching cards in your library.
          </div>
        )}
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex", flexDirection: "column", gap: 4, padding: 4,
                background: isSel ? (cfg?.dim || BG3) : "transparent",
                border: `2px solid ${isSel ? accent : LINE}`,
                borderRadius: 8, cursor: "pointer", fontFamily, textAlign: "left",
              }}
            >
              <img
                src={`/api/art-crop?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "626 / 457", objectFit: "cover", borderRadius: 4, background: BG2 }}
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              />
              <div style={{ fontSize: 11, color: isSel ? accent : TEXT, lineHeight: 1.25, fontWeight: isSel ? 700 : 400 }}>
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => submit(selected)}
          disabled={!selected || submitting}
          style={{
            flex: 1, padding: "9px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6,
            cursor: (!selected || submitting) ? "not-allowed" : "pointer", opacity: (!selected || submitting) ? 0.5 : 1,
            fontSize: 13, fontWeight: 600, fontFamily,
          }}
        >
          {submitting ? "…" : "Put in hand"}
        </button>
        <button
          onClick={() => submit(null)}
          disabled={submitting}
          style={{
            padding: "9px 14px", background: "transparent", color: MUTED, border: `1px solid ${LINE}`,
            borderRadius: 6, cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontFamily,
          }}
        >
          Find nothing
        </button>
      </div>
    </div>
  );
}

/**
 * Interactive clone copy-pick (CR 707) — the player browses the creatures on the battlefield
 * (real art via /api/art-crop?name=) and picks which one their clone enters as a copy of, or
 * declines (a "you may" clone then enters as a 0/0 and dies). Finishes the entry server-side via
 * session.applyCloneChoice. Same non-blocking side-sheet as the tutor picker.
 */
function CloneCopyPanel({ decision, cfg, colors, fontFamily, onChoose }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => { setSelected(null); }, [candidateKey]);

  const submit = async (permId) => {
    if (submitting) return;
    setSubmitting(true);
    try { await onChoose?.(permId); } finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ padding: "12px 14px", background: BG3, border: `1px solid ${accent}`, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          🧬 Enter as a copy{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5, marginTop: 4 }}>
          Choose a creature for {decision.sourceName || "this creature"} to enter as a copy of
          ({candidates.length} option{candidates.length === 1 ? "" : "s"}).
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignContent: "start" }}>
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex", flexDirection: "column", gap: 4, padding: 4,
                background: isSel ? (cfg?.dim || BG3) : "transparent",
                border: `2px solid ${isSel ? accent : LINE}`,
                borderRadius: 8, cursor: "pointer", fontFamily, textAlign: "left",
              }}
            >
              <img
                src={`/api/art-crop?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "626 / 457", objectFit: "cover", borderRadius: 4, background: BG2 }}
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              />
              <div style={{ fontSize: 11, color: isSel ? accent : TEXT, lineHeight: 1.25, fontWeight: isSel ? 700 : 400 }}>
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => submit(selected)}
          disabled={!selected || submitting}
          style={{
            flex: 1, padding: "9px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6,
            cursor: (!selected || submitting) ? "not-allowed" : "pointer", opacity: (!selected || submitting) ? 0.5 : 1,
            fontSize: 13, fontWeight: 600, fontFamily,
          }}
        >
          {submitting ? "…" : "Enter as copy"}
        </button>
        <button
          onClick={() => submit(null)}
          disabled={submitting}
          style={{
            padding: "9px 14px", background: "transparent", color: MUTED, border: `1px solid ${LINE}`,
            borderRadius: 6, cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontFamily,
          }}
          title="Enter as itself (a 0/0 that dies)"
        >
          Don&apos;t copy
        </button>
      </div>
    </div>
  );
}

/**
 * Interactive scry / surveil (CR 701.18 / 701.43) — the player sees the top N cards of their own
 * library and decides which to keep on top (and in what order) vs move away: to the bottom (scry)
 * or the graveyard (surveil). Submits the ordered keep-list via session.applyScryChoice. Same
 * non-blocking side-sheet as the tutor/clone pickers.
 */
function ScrySurveilPanel({ decision, cfg, colors, fontFamily, onChoose }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;
  const cards = decision.cards || [];
  const surveil = decision.mode === "surveil";
  const awayLabel = surveil ? "graveyard" : "bottom";
  const [submitting, setSubmitting] = useState(false);
  // `kept` is the ordered list of card ids on top; any card not in it is moved away. Default: keep all.
  const [kept, setKept] = useState(() => cards.map((c) => c.id));
  const key = cards.map((c) => c.id).join("|");
  // Reset the keep-list to "keep all" when a NEW scry surfaces (keyed on the card ids), mirroring
  // the tutor panel's reset-on-candidate-change. `cards` is stable per scry, so the key is enough.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setKept(cards.map((c) => c.id)); }, [key]);

  const byId = (id) => cards.find((c) => c.id === id);
  const moved = cards.filter((c) => !kept.includes(c.id));
  const setMove = (id) => setKept((k) => k.filter((x) => x !== id));
  const setKeep = (id) => setKept((k) => (k.includes(id) ? k : [...k, id]));
  const move = (id, dir) => setKept((k) => {
    const i = k.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= k.length) return k;
    const n = [...k]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await onChoose?.(kept); } finally { setSubmitting(false); }
  };

  const CardRow = ({ id, where }) => {
    const c = byId(id);
    if (!c) return null;
    const i = kept.indexOf(id);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 4, border: `1px solid ${LINE}`, borderRadius: 8, background: where === "keep" ? (cfg?.dim || BG3) : "transparent" }}>
        <img src={`/api/art-crop?name=${encodeURIComponent(c.name)}`} alt={c.name} loading="lazy"
          style={{ width: 64, aspectRatio: "626 / 457", objectFit: "cover", borderRadius: 4, background: BG2 }}
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        <div style={{ flex: 1, fontSize: 12, color: TEXT, fontWeight: where === "keep" ? 600 : 400 }}>{c.name}</div>
        {where === "keep" ? (
          <>
            <button onClick={() => move(id, -1)} disabled={i <= 0} title="Move up" style={arrowBtn(LINE, MUTED, i <= 0)}>▲</button>
            <button onClick={() => move(id, 1)} disabled={i >= kept.length - 1} title="Move down" style={arrowBtn(LINE, MUTED, i >= kept.length - 1)}>▼</button>
            <button onClick={() => setMove(id)} title={`Put on ${awayLabel}`} style={pillBtn(accent, "transparent", MUTED, LINE)}>→ {awayLabel}</button>
          </>
        ) : (
          <button onClick={() => setKeep(id)} title="Keep on top" style={pillBtn(accent, accent, "#fff")}>↑ keep on top</button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ padding: "12px 14px", background: BG3, border: `1px solid ${accent}`, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {surveil ? "📜 Surveil" : "🔮 Scry"} {cards.length}{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5, marginTop: 4 }}>
          Top of your library. Keep cards on top (drag order with ▲▼) or send them to the {awayLabel}.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>On top ({kept.length}) — top first</div>
        {kept.length === 0 && <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>(nothing kept)</div>}
        {kept.map((id) => <CardRow key={id} id={id} where="keep" />)}
        {moved.length > 0 && <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>To {awayLabel} ({moved.length})</div>}
        {moved.map((c) => <CardRow key={c.id} id={c.id} where="away" />)}
      </div>

      <button onClick={submit} disabled={submitting}
        style={{ padding: "9px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6,
          cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.5 : 1, fontSize: 13, fontWeight: 600, fontFamily }}>
        {submitting ? "…" : "Done"}
      </button>
    </div>
  );
}
function arrowBtn(LINE, MUTED, disabled) {
  return { padding: "2px 6px", background: "transparent", color: MUTED, border: `1px solid ${LINE}`, borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1, fontSize: 11 };
}
function pillBtn(accent, bg, color, border) {
  return { padding: "3px 8px", background: bg, color, border: `1px solid ${border || accent}`, borderRadius: 5, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" };
}

// ─── Style helpers ───────────────────────────────────────────────────────────

function tutorSheetStyle(LINE, BG2) {
  return {
    position: "absolute",
    top: 70,
    right: 16,
    bottom: 64,
    width: 440,
    maxWidth: "52%",
    background: BG2 || "#12131c",
    border: `1px solid ${LINE || "#272a3c"}`,
    borderRadius: 12,
    boxShadow: "0 20px 60px #000a",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    zIndex: 45,
  };
}

function containerStyle(BG, fontFamily) {
  return {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: BG,
    fontFamily,
    position: "relative", // anchors the floating Ask-Jace pop-out
  };
}

function headerStyle(LINE, BG2, GOLD) {
  return {
    padding: "10px 16px",
    borderBottom: `1px solid ${LINE}`,
    background: BG2,
    color: GOLD,
    fontFamily: "var(--font-display), Georgia, serif",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    display: "flex",
    alignItems: "center",
    gap: 12,
  };
}

function labelStyle(MUTED) {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 11,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function selectStyle(BG2, BG3, LINE, TEXT, fontFamily) {
  return {
    padding: "8px 10px",
    background: BG2,
    color: TEXT,
    border: `1px solid ${LINE}`,
    borderRadius: 6,
    fontSize: 13,
    fontFamily,
  };
}

// Floating Arbiter side-sheet — sits over the right of the board, non-blocking
// (the board behind stays visible + interactive). Anchored by containerStyle's
// position:relative.
function unresolvedSheetStyle(LINE, BG2) {
  return {
    position: "absolute",
    top: 70,
    right: 16,
    bottom: 64,
    width: 372,
    maxWidth: "44%",
    background: BG2 || "#12131c",
    border: `1px solid ${LINE || "#272a3c"}`,
    borderRadius: 12,
    boxShadow: "0 20px 60px #000a",
    padding: 16,
    overflowY: "auto",
    zIndex: 40,
  };
}

// Floating engine-error banner over the board (replaces the old drop-to-text).
function floatErrorStyle() {
  return {
    position: "absolute",
    top: 70,
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: 560,
    background: "#2a1416",
    border: "1px solid #7a3a3a",
    color: "#e0a89a",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 12.5,
    lineHeight: 1.5,
    zIndex: 41,
    boxShadow: "0 12px 36px #000a",
  };
}

function subtleButtonStyle(LINE, MUTED, fontFamily) {
  return {
    padding: "6px 12px",
    background: "transparent",
    color: MUTED,
    border: `1px solid ${LINE}`,
    borderRadius: 5,
    fontSize: 11,
    cursor: "pointer",
    fontFamily,
  };
}

function errorBoxStyle() {
  return {
    padding: "10px 12px",
    background: "#2a1414",
    border: "1px solid #6b3a3a",
    color: "#e0a89a",
    borderRadius: 6,
    fontSize: 12,
  };
}

