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

import { useCallback, useEffect, useRef, useState } from "react";
import useLearnSession from "../../hooks/useLearnSession";
import LearnBoard from "./LearnBoard";
import StabilityBadge from "./StabilityBadge";
import { stableActionKey } from "../../lib/learn/actionKey.js";
import { LearnLogEntry } from "./LearnLogEntry.jsx";
import { evaluatePuzzle, puzzleGoalLabel } from "../../lib/learn/puzzleGoal.js";
import {
  UnresolvedPanel, TutorSearchPanel,
  DigLandPanel, DistributeCountersPanel, OptionalDrawDiscardPanel, OptionalDiscardPaymentPanel,
  SacUnlessPayPanel, TaxedPaymentPanel, EdictModePanel, CleanupDiscardPanel,
  HandDiscardPanel, ImpulseDigPanel, LookTopTakePanel, DivideDamagePanel, SoftCounterPanel,
  OptionalManaPaymentPanel, OptionalSacPanel, SacrificeChoicePanel, DiscardChoicePanel,
  OptionalChoicePanel, CommanderReturnPanel, CloneCopyPanel, ScrySurveilPanel,
} from "./learnDecisionPanels.jsx"; // the decision-panel layer (decomposition slice 2) — dispatch stays here
import {
  tutorSheetStyle, containerStyle, headerStyle, labelStyle, sectionLabelStyle,
  selectStyle, unresolvedSheetStyle, floatErrorStyle, errorBoxStyle,
} from "./learnViewStyles.js"; // LEYLINE layout tokens (decomposition slice 1) — pure, no React


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
    if (entry.section === "Sideboard" || entry.section === "Tokens" || entry.section === "Commander" || entry.section === "Companion") continue;
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

// CMD-COMPANION (CR 702.139) — a deck's companion lives in its own "Companion" section (one card,
// the same way the "Commander" section drives commandersOf). It is NOT a commander: it starts OUTSIDE
// the game and the {3}-to-hand action (no commander tax) is wired engine-side. Returns the single
// companion card ({ id, name }) or null; the route enriches type/mana from the local oracle index.
function companionOf(deck) {
  if (!deck?.cards) return null;
  const c = deck.cards.find(card => card.section === "Companion");
  return c ? { id: `comp-${deck.id || "deck"}-${c.name}`, name: c.name } : null;
}

export default function LearnView({
  savedDecks,
  initialUserDeckId = null,
  onConsumeInitialDeck,
  fontFamily,
  setCenterView,
}) {
  const session = useLearnSession();
  const [mode, setMode] = useState("standard");
  const [userDeckId, setUserDeckId] = useState("");
  const [oppIds, setOppIds] = useState(["", "", ""]); // up to 3 opponents (Commander)
  const [difficulty, setDifficulty] = useState("beginner");
  const [saves, setSaves] = useState([]);
  // P9 — puzzles: the saved list (idle screen), a transient save confirmation,
  // and a flag to dismiss the puzzle-result overlay so the user can keep playing.
  const [puzzles, setPuzzles] = useState([]);
  const [puzzleMsg, setPuzzleMsg] = useState(null);
  const [puzzleDismissed, setPuzzleDismissed] = useState(false);

  // P3 — post-game debrief. Only `ask` decisions carry metadata.suggestion
  // (decisionGate.js), and they reach the client UNSTRIPPED (ask ∉
  // PENDING_CHOICE_KINDS in decisionWire.js — pending sub-choices carry no
  // suggestion to compare against). We read the on-screen decision at click time
  // through a ref (no stale closure) and record one row per answered ask; the
  // game-over scrim in LearnBoard renders the pick-vs-suggestion summary.
  const [debrief, setDebrief] = useState([]);
  const latestRef = useRef({ decision: null, turn: null });
  useEffect(() => {
    latestRef.current = { decision: session.decision, turn: session.turn };
  }, [session.decision, session.turn]);

  const applyChoiceFn = session.applyChoice; // stable per session (useLearnSession memoizes it)
  const trackedApplyChoice = useCallback((choice) => {
    const { decision: d, turn } = latestRef.current;
    // Record real strategic picks only: an `ask` with a suggestion, excluding
    // tap-for-mana (its own priority window in beginner mode — plumbing, not a play).
    if (d && d.kind === "ask" && d.metadata?.suggestion && choice?.kind !== "tap-for-mana") {
      const matched = stableActionKey(choice) === stableActionKey(d.metadata.suggestion);
      setDebrief(prev => [...prev, { turn, userAction: choice, suggestion: d.metadata.suggestion, matched }]);
    }
    return applyChoiceFn(choice);
  }, [applyChoiceFn]);

  // P6: seed the user-deck picker from a DeckView "Practice" handoff, once.
  useEffect(() => {
    if (initialUserDeckId && savedDecks.some((d) => d.id === initialUserDeckId)) {
      setUserDeckId(initialUserDeckId);
      onConsumeInitialDeck?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserDeckId]);

  const oppCount = mode === "commander" ? 3 : 1;
  const userDeck = savedDecks.find(d => d.id === userDeckId);
  const oppDecks = oppIds.slice(0, oppCount).map(id => savedDecks.find(d => d.id === id));
  const canStart = userDeck && oppDecks.every(Boolean) && session.status !== "starting";

  const setOppId = (index, id) => setOppIds(prev => prev.map((v, i) => (i === index ? id : v)));

  const handleStart = async () => {
    if (!canStart) return;
    setDebrief([]); // fresh game → fresh tally
    setPuzzleMsg(null); setPuzzleDismissed(false);
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
        userCompanion: companionOf(userDeck),
        opponentCompanions: oppDecks.map(companionOf),
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
        userCompanion: companionOf(userDeck),
        opponentCompanions: companionOf(oppDecks[0]),
        difficulty,
        ...meta,
      });
    }
  };

  const handleAbandon = () => { setDebrief([]); setPuzzleMsg(null); setPuzzleDismissed(false); session.reset(); };

  // Saved-game list for the "Continue a game" panel on the idle screen.
  useEffect(() => {
    let cancelled = false;
    if (session.status === "idle") {
      session.listSaves().then(list => { if (!cancelled) setSaves(list); });
      session.listPuzzles().then(list => { if (!cancelled) setPuzzles(list); });
    }
    return () => { cancelled = true; };
    // session.listSaves/listPuzzles are stable (useCallback); refresh only on status change.
  }, [session.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = (sessionId) => { setDebrief([]); return session.resume(sessionId); };
  const handleDeleteSave = async (sessionId) => {
    await session.deleteSave(sessionId);
    setSaves(prev => prev.filter(s => s.sessionId !== sessionId));
  };

  // P9 — capture the current live position as a puzzle (win-this-turn goal for v1).
  const handleSavePuzzle = async () => {
    setPuzzleMsg("Saving…");
    const res = await session.saveAsPuzzle({ goal: "win-this-turn" });
    setPuzzleMsg(res.ok ? "✓ Saved as a puzzle" : `⚠ ${res.error}`);
  };
  // P9 — load a saved puzzle into a fresh attempt.
  const handleSolvePuzzle = (puzzleId) => { setDebrief([]); setPuzzleDismissed(false); return session.resumePuzzle(puzzleId); };

  // ─── Idle / setup screen ──────────────────────────────────────────────────

  if (session.status === "idle" || session.status === "starting") {
    return (
      <div style={containerStyle(fontFamily)}>
        <header style={{ ...headerStyle(), justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            The Academy
            <StabilityBadge level="preview" title="Preview — the Academy is early and still being built out" />
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            {setCenterView && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCenterView("sim")}
                title="The self-play stress test is now its own Sim Center section"
              >
                Stress test → Sim Center
              </button>
            )}
            {session.status === "starting" && <span style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>starting…</span>}
          </span>
        </header>
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: "var(--ley-text)", lineHeight: 1.5 }}>
              Pick a deck to learn, an opponent to play against, and a difficulty.
              The session runs locally — every decision is narrated by Jace at
              Beginner difficulty, lighter at higher difficulties.
            </p>

            {saves.length > 0 && (
              <div style={{ border: "1px solid var(--ley-line)", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ ...labelStyle(), padding: 0 }}>Continue a game</div>
                {saves.map(s => (
                  <div
                    key={s.sessionId}
                    className="ley-row"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 4, background: "var(--ley-surface-2)" }}
                  >
                    <span style={{ fontSize: 12, color: "var(--ley-text)" }}>
                      {(s.userDeckName || "Untitled deck")}
                      {" · "}{s.mode === "commander" ? "Commander" : "Standard"}
                      {" · turn "}{s.turn ?? "?"}
                      {" · "}{s.difficulty || "beginner"}
                    </span>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleResume(s.sessionId)}
                        disabled={!s.resumable || session.status === "starting"}
                        title={s.resumable ? "Resume this game" : "Saved on an incompatible version — start a new game"}
                      >
                        Resume
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => handleDeleteSave(s.sessionId)}
                        title="Delete this saved game"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {puzzles.length > 0 && (
              <div style={{ border: "1px solid var(--ley-line)", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ ...labelStyle(), padding: 0 }}>🧩 Puzzles — solve a saved position</div>
                {puzzles.map(p => (
                  <div
                    key={p.id}
                    className="ley-row"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 4, background: "var(--ley-surface-2)" }}
                  >
                    <span style={{ fontSize: 12, color: "var(--ley-text)" }}>
                      {p.label || puzzleGoalLabel(p.goal)}
                      {" · "}{p.meta?.userDeckName || "position"}
                      {" · turn "}{p.startTurn ?? "?"}
                      {" · "}<span style={{ color: "var(--ley-gold)" }}>{puzzleGoalLabel(p.goal)}</span>
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSolvePuzzle(p.id)}
                      disabled={!p.resumable || session.status === "starting"}
                      title={p.resumable ? "Load this puzzle and try to solve it" : "Saved on an incompatible version"}
                    >
                      Solve
                    </button>
                  </div>
                ))}
              </div>
            )}

            <fieldset style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "none", padding: 0 }}>
              <legend style={{ ...labelStyle(), padding: 0, gridColumn: "1 / -1" }}>Format</legend>
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", flexDirection: "column", padding: "10px 12px",
                    border: `1px solid ${mode === opt.value ? "var(--ley-green)" : "var(--ley-line)"}`,
                    background: mode === opt.value ? "var(--ley-green-dim)" : "transparent",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="mode" value={opt.value} checked={mode === opt.value} onChange={e => setMode(e.target.value)} />
                    <strong style={{ color: "var(--ley-green)", fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ley-text-dim)", marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>

            <label style={labelStyle()}>
              Your deck
              <select
                value={userDeckId}
                onChange={e => setUserDeckId(e.target.value)}
                style={selectStyle(fontFamily)}
              >
                <option value="">(pick a saved deck)</option>
                {savedDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            {Array.from({ length: oppCount }).map((_, i) => (
              <label key={i} style={labelStyle()}>
                {oppCount === 1 ? "Opponent's deck" : `Opponent ${i + 1}'s deck`}
                <select
                  value={oppIds[i] || ""}
                  onChange={e => setOppId(i, e.target.value)}
                  style={selectStyle(fontFamily)}
                >
                  <option value="">(pick a saved deck)</option>
                  {savedDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            ))}

            <fieldset style={{ display: "grid", gap: 8, border: "none", padding: 0 }}>
              <legend style={{ ...labelStyle(), padding: 0 }}>Difficulty</legend>
              {DIFFICULTY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "10px 12px",
                    border: `1px solid ${difficulty === opt.value ? "var(--ley-green)" : "var(--ley-line)"}`,
                    background: difficulty === opt.value ? "var(--ley-green-dim)" : "transparent",
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
                    <strong style={{ color: "var(--ley-green)", fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ley-text-dim)", marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleStart}
              disabled={!canStart}
              style={{ marginTop: 8 }}
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
  // P9 — evaluate the puzzle goal from observable session facts (pure). Drives the
  // result overlay; null when this isn't a puzzle attempt.
  const puzzleOutcome = session.puzzle
    ? evaluatePuzzle({ goal: session.puzzle.goal, startTurn: session.puzzle.startTurn, status: session.status, turn: session.turn, reason: decision?.reason })
    : null;
  const showPuzzleResult = session.puzzle && !puzzleDismissed && (puzzleOutcome === "solved" || puzzleOutcome === "failed");

  return (
    <div style={containerStyle(fontFamily)}>
      <header style={{ ...headerStyle(), justifyContent: "space-between" }}>
        <span>The Academy · {session.mode === "commander" ? "Commander 4P pod" : `${userDeck?.name || "You"} vs ${oppDecks[0]?.name || "Opponent"}`}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          {session.puzzle && (
            <span style={{ fontSize: 11, color: "var(--ley-gold)", fontWeight: 700 }} title={`Puzzle goal: ${puzzleGoalLabel(session.puzzle.goal)}`}>
              🧩 {puzzleGoalLabel(session.puzzle.goal)}
            </span>
          )}
          {puzzleMsg && <span style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>{puzzleMsg}</span>}
          {session.status === "active" && !session.puzzle && (
            <button className="btn btn-ghost btn-sm" onClick={handleSavePuzzle} title="Capture this position as a puzzle to solve later">
              🧩 Save as puzzle
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>
            Turn {session.turn} · {session.activePlayer === "user" ? "Your" : `${seatLabel(session.activePlayer)}'s`} {session.step}
          </span>
        </span>
      </header>

      <TableStrip table={session.table} activePlayer={session.activePlayer} />

      {session.board ? (
        <LearnBoard
          board={session.board}
          decision={decision}
          onAction={trackedApplyChoice}
          logTail={session.decisionLogTail}
          turn={session.turn}
          step={session.step}
          status={session.status}
          difficulty={session.difficulty}
          onNewGame={handleAbandon}
          debrief={debrief}
        />
      ) : (
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Decision area */}
        <main style={{ flex: 2, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <DecisionPrompt
            decision={decision}
            onChoose={trackedApplyChoice}
            onContinue={session.continueGame}
            onTutorChoose={session.applyTutorChoice}
            onCloneChoose={session.applyCloneChoice}
            onScryChoose={session.applyScryChoice}
            onOptionalChoose={session.applyOptionalChoice}
            onHandDiscardChoose={session.applyHandDiscardChoice}
            onCleanupDiscardChoose={session.applyCleanupDiscardChoice}
            onDigLandChoose={session.applyDigLandChoice}
            onDistributeCountersChoose={session.applyDistributeCountersChoice}
            onOptionalDrawDiscardChoose={session.applyOptionalDrawDiscardChoice}
            onOptionalDiscardPaymentChoose={session.applyOptionalDiscardPaymentChoice}
            onSacUnlessPayChoose={session.applySacUnlessPayChoice}
            onTaxedPaymentChoose={session.applyTaxedPaymentChoice}
            onEdictModeChoose={session.applyEdictModeChoice}
            onImpulseDigChoose={session.applyImpulseDigChoice}
            onLookTopTakeChoose={session.applyLookTopTakeChoice}
            onSacrificeChoose={session.applySacrificeChoice}
            onDiscardChoose={session.applyDiscardChoice}
            onDivideChoose={session.applyDivideChoice}
            onSoftCounterChoose={session.applySoftCounterChoice}
            onOptionalManaPaymentChoose={session.applyOptionalManaPaymentChoice}
            onOptionalSacChoose={session.applyOptionalSacChoice}
            onCommanderReturnChoose={session.applyCommanderReturnChoice}
          />
        </main>

        {/* Auto-played feed */}
        <aside style={{
          width: 280,
          borderLeft: "1px solid var(--ley-line)",
          background: "var(--ley-surface-1)",
          padding: 14,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <div style={sectionLabelStyle()}>
            Recent actions
          </div>
          {(session.decisionLogTail || []).slice().reverse().map((entry, i) => (
            <LearnLogEntry key={`${entry.ts}-${i}`} entry={entry} />
          ))}
          {!(session.decisionLogTail || []).length && (
            <div style={{ fontSize: 11, color: "var(--ley-text-dim)" }}>No actions yet.</div>
          )}
        </aside>
      </div>
      )}

      {/* Unresolved spell → Arbiter ruling as a NON-BLOCKING side-sheet over the
          board (GAP C). The board behind it stays visible and interactive. */}
      {session.board && decision?.kind === "unresolved" && (
        <div className="ley-glass-strong ley-glass-lit" style={unresolvedSheetStyle()}>
          <UnresolvedPanel decision={decision} onContinue={session.continueGame} />
        </div>
      )}
      {/* Interactive tutor search → library picker side-sheet (non-blocking, board behind
          stays visible). The game is paused on this choice until the player picks. */}
      {session.board && decision?.kind === "tutor-search" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <TutorSearchPanel decision={decision} onChoose={session.applyTutorChoice} />
        </div>
      )}
      {/* Interactive clone copy-pick → choose which creature to copy (CR 707). Same side-sheet. */}
      {session.board && decision?.kind === "clone-search" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <CloneCopyPanel decision={decision} onChoose={session.applyCloneChoice} />
        </div>
      )}
      {/* Interactive scry/surveil → keep/move the top N (CR 701.22 / 701.25). Same side-sheet. */}
      {session.board && decision?.kind === "scry-surveil" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <ScrySurveilPanel decision={decision} onChoose={session.applyScryChoice} />
        </div>
      )}
      {/* α2 — optional "you may <effect>" → a yes/no. Same side-sheet. */}
      {session.board && decision?.kind === "optional-effect" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <OptionalChoicePanel decision={decision} onChoose={session.applyOptionalChoice} />
        </div>
      )}
      {/* CMD-RETURN (CR 903.9) — your commander died: return it to the command zone (recastable, taxed) or leave it. */}
      {session.board && decision?.kind === "commander-return" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <CommanderReturnPanel decision={decision} onChoose={session.applyCommanderReturnChoice} />
        </div>
      )}
      {/* CR 514.1 — cleanup discard: you ended the turn over max hand size. Mandatory, re-raised per pick. */}
      {session.board && decision?.kind === "cleanup-discard" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <CleanupDiscardPanel decision={decision} onChoose={session.applyCleanupDiscardChoice} />
        </div>
      )}
      {/* WI-7 — the seven kinds wired 2026-07-18; each previously soft-locked a human seat. */}
      {session.board && decision?.kind === "dig-land-to-battlefield" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <DigLandPanel decision={decision} onChoose={session.applyDigLandChoice} />
        </div>
      )}
      {session.board && decision?.kind === "distribute-counters" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <DistributeCountersPanel decision={decision} onChoose={session.applyDistributeCountersChoice} />
        </div>
      )}
      {session.board && decision?.kind === "optional-draw-discard" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <OptionalDrawDiscardPanel decision={decision} onChoose={session.applyOptionalDrawDiscardChoice} />
        </div>
      )}
      {session.board && decision?.kind === "optional-discard-payment" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <OptionalDiscardPaymentPanel decision={decision} onChoose={session.applyOptionalDiscardPaymentChoice} />
        </div>
      )}
      {session.board && decision?.kind === "sac-unless-pay" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <SacUnlessPayPanel decision={decision} onChoose={session.applySacUnlessPayChoice} />
        </div>
      )}
      {session.board && decision?.kind === "taxed-payment" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <TaxedPaymentPanel decision={decision} onChoose={session.applyTaxedPaymentChoice} />
        </div>
      )}
      {session.board && decision?.kind === "edict-mode" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <EdictModePanel decision={decision} onChoose={session.applyEdictModeChoice} />
        </div>
      )}
      {/* δ-1b — hand disruption (Duress / Thoughtseize) → pick a card from the targeted opponent's
          REVEALED hand to discard. Only that one opponent's hand is shown (no 4P leak). Same side-sheet. */}
      {session.board && decision?.kind === "hand-discard" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <HandDiscardPanel decision={decision} onChoose={session.applyHandDiscardChoice} />
        </div>
      )}
      {/* δ-2 — impulse-dig (Strategic Planning / Anticipate) → keep one of the looked-at top N cards;
          the rest go to the bottom / graveyard. Same side-sheet. */}
      {session.board && decision?.kind === "impulse-dig" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <ImpulseDigPanel decision={decision} onChoose={session.applyImpulseDigChoice} />
        </div>
      )}
      {/* BLITZ LK-2 — top-card take-or-leave-on-top (Dryad Greenseeker / Frost Augur / Herald's Horn, Domri +1):
          look at the matched top card of your library → TAKE it (→ hand) or LEAVE it on top. Same side-sheet. */}
      {session.board && decision?.kind === "look-top-take" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <LookTopTakePanel decision={decision} onChoose={session.applyLookTopTakeChoice} />
        </div>
      )}
      {/* EDICTS — sacrifice choice (Diabolic Edict / Cruel Edict / Geth's Verdict) → the human (the edict's
          target) picks which of THEIR OWN creatures to sacrifice. Same side-sheet. */}
      {session.board && decision?.kind === "sacrifice-choice" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <SacrificeChoicePanel decision={decision} onChoose={session.applySacrificeChoice} />
        </div>
      )}
      {/* EACH-PLAYER discard (Mind Rot / Fugue / Delirium Skeins) → the human (a discarder) picks which
          card from THEIR OWN hand to pitch (CR 701.8 — the discarding player chooses). N>1 / each-player
          re-surfaces this panel per card. Same side-sheet. */}
      {session.board && decision?.kind === "discard" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <DiscardChoicePanel decision={decision} onChoose={session.applyDiscardChoice} />
        </div>
      )}
      {/* DIVIDE (MT-1) — divide-damage division → the human caster assigns the spell's full damage among
          any number of targets (creatures + players) via steppers. Same side-sheet. */}
      {session.board && decision?.kind === "divide-damage" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <DivideDamagePanel decision={decision} onChoose={session.applyDivideChoice} />
        </div>
      )}
      {/* SOFT-CNT — the player's spell is under a soft counter → pay {N} or let it be countered. Same side-sheet. */}
      {session.board && decision?.kind === "soft-counter" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <SoftCounterPanel decision={decision} onChoose={session.applySoftCounterChoice} />
        </div>
      )}
      {/* OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. If you do, <effect>" (Lifecrafter's
          Bestiary / Mind's Eye / Inheritance / …) → pay or decline. Same side-sheet. */}
      {session.board && decision?.kind === "optional-mana-payment" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <OptionalManaPaymentPanel decision={decision} onChoose={session.applyOptionalManaPaymentChoice} />
        </div>
      )}
      {/* REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. If you do, <effect>"
          (The Goose Mother / Wedding Security) → sac or decline. Same side-sheet. */}
      {session.board && decision?.kind === "optional-sac-payment" && (
        <div className="ley-glass-strong ley-glass-lit" style={tutorSheetStyle()}>
          <OptionalSacPanel decision={decision} onChoose={session.applyOptionalSacChoice} />
        </div>
      )}
      {/* Engine OR transport error as a floating banner over the board (never drops
          to text, and never leaves the stale board looking silently interactive). */}
      {session.board && (session.status === "error" || decision?.kind === "dispatch-error" || decision?.kind === "engine-stuck") && (
        <div className="ley-glass-strong" style={floatErrorStyle()}>
          ⚠ {session.status === "error"
            ? (session.error || "Lost the connection to the game.")
            : `${decision.kind === "engine-stuck" ? "The engine got stuck" : "The engine rejected that"}: ${decision.reason}${decision.code ? ` (${decision.code})` : ""}`}
          {" — use “Abandon game” below to start over."}
        </div>
      )}

      <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--ley-line)", background: "var(--ley-surface-1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn btn-danger btn-sm" onClick={handleAbandon}>
          Abandon game
        </button>
        {session.error && <span style={{ fontSize: 11, color: "var(--ley-red)" }}>⚠ {session.error}</span>}
      </footer>

      {showPuzzleResult && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ley-glass-strong)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
          onClick={() => setPuzzleDismissed(true)}
        >
          <div className="ley-glass-strong ley-glass-lit" style={{ textAlign: "center", maxWidth: 460, padding: "30px 34px", borderRadius: "var(--r-lg)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 10, color: puzzleOutcome === "solved" ? "var(--ley-green)" : "var(--ley-red)" }}>
              {puzzleOutcome === "solved" ? "🧩 Puzzle solved!" : "Puzzle failed"}
            </div>
            <p style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.55, margin: "0 0 20px" }}>
              {puzzleOutcome === "solved"
                ? `You hit the goal — ${puzzleGoalLabel(session.puzzle.goal)} — from the captured position. Nicely solved.`
                : `Goal missed — ${puzzleGoalLabel(session.puzzle.goal)}. The turn passed or the game slipped away. Run the line again.`}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {puzzleOutcome === "failed" && (
                <button className="btn btn-primary" onClick={() => handleSolvePuzzle(session.puzzle.id)}>Retry puzzle</button>
              )}
              <button className="btn btn-secondary" onClick={() => setPuzzleDismissed(true)}>Keep playing</button>
              <button className="btn btn-ghost" onClick={handleAbandon}>Back to Academy</button>
            </div>
          </div>
        </div>
      )}

      <AskPanel sessionId={session.sessionId} avoidSheet={!!session.board && decision?.kind === "unresolved"} />
    </div>
  );
}

// ─── Ask Jace — real-time, board-aware tutor pop-out ──────────────────────────

function AskPanel({ sessionId, avoidSheet = false }) {
  // When the unresolved Arbiter side-sheet (right:16, width:372 → left edge ~388,
  // z-40) is up, slide the Ask-Jace pop-out clear of it and lift it above the sheet
  // so the affordance isn't painted behind the ruling card.
  const dockRight = avoidSheet ? 404 : 18;
  const dockZ = avoidSheet ? 45 : 20;
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

  if (!open) {
    return (
      <button
        className="btn btn-secondary"
        onClick={() => setOpen(true)}
        title="Ask Jace about the board"
        style={{ position: "absolute", bottom: 60, right: dockRight, zIndex: dockZ }}
      >
        💬 Ask Jace
      </button>
    );
  }

  return (
    <div className="ley-glass-strong ley-glass-lit" style={{
      position: "absolute", bottom: 60, right: dockRight, zIndex: dockZ,
      width: 330, maxWidth: "calc(100% - 36px)", maxHeight: 400,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--ley-line)" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ley-green)" }}>Ask Jace</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {history.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
            Ask anything about the current board — &ldquo;what can I play?&rdquo;, &ldquo;is it safe to attack?&rdquo;, &ldquo;what does this step do?&rdquo;. Jace reads the live game to answer.
          </div>
        )}
        {history.map((item, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, color: "var(--ley-text)", fontWeight: 600 }}>{item.q}</div>
            {item.pending && <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", fontStyle: "italic" }}>Jace is thinking…</div>}
            {item.a && <div style={{ fontSize: 12, color: "var(--ley-text)", lineHeight: 1.5, background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: 6, padding: "7px 9px", whiteSpace: "pre-wrap" }}>{item.a}</div>}
            {item.error && <div style={{ fontSize: 11.5, color: "var(--ley-red)" }}>⚠ {item.error}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: "1px solid var(--ley-line)" }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !busy) ask(); }}
          placeholder="Ask about the board…"
          style={{ flex: 1, padding: "7px 10px", background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: 6, color: "var(--ley-text)", fontSize: 12.5 }}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={ask}
          disabled={busy || !q.trim()}
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ─── Table strip (all seats: life / zones / commander damage) ─────────────────

export function TableStrip({ table, activePlayer }) {
  if (!table || table.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "var(--ley-surface-1)", borderBottom: "1px solid var(--ley-line)", overflowX: "auto" }}>
      {table.map(seat => {
        const active = seat.id === activePlayer;
        const cmd = Object.entries(seat.commanderDamage || {}).filter(([, n]) => n > 0);
        return (
          <div
            key={seat.id}
            className={active ? "ley-live" : undefined}
            style={{
              minWidth: 118, flexShrink: 0, padding: "8px 10px", borderRadius: 6,
              background: "var(--ley-surface-2)",
              border: `1px solid ${active ? "var(--ley-green)" : "var(--ley-line)"}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: seat.isUser ? "var(--ley-green-text)" : "var(--ley-text)" }}>
                {seatLabel(seat.id)}
              </span>
              {active && <span style={{ fontSize: 8, color: "var(--ley-green)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>turn</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: seat.life <= 5 ? "var(--ley-red)" : "var(--ley-text)", lineHeight: 1.15 }}>
              {seat.life} <span style={{ fontSize: 10, color: "var(--ley-text-dim)", fontWeight: 400 }}>life</span>
            </div>
            <div style={{ display: "flex", gap: 9, fontSize: 10, color: "var(--ley-text-dim)", marginTop: 2 }}>
              <span title="cards in hand">✋ {seat.handCount}</span>
              <span title="permanents on board">▦ {seat.boardCount}</span>
              <span title="cards in graveyard">⚰ {seat.graveyardCount}</span>
            </div>
            {cmd.length > 0 && (
              <div style={{ fontSize: 9, color: "var(--ley-text-faint)", marginTop: 3 }}>
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

function DecisionPrompt({ decision, onChoose, onContinue, onTutorChoose, onCloneChoose, onScryChoose, onOptionalChoose, onHandDiscardChoose, onCleanupDiscardChoose, onDigLandChoose, onDistributeCountersChoose, onOptionalDrawDiscardChoose, onOptionalDiscardPaymentChoose, onSacUnlessPayChoose, onTaxedPaymentChoose, onEdictModeChoose, onImpulseDigChoose, onLookTopTakeChoose, onSacrificeChoose, onDiscardChoose, onDivideChoose, onSoftCounterChoose, onOptionalManaPaymentChoose, onOptionalSacChoose, onCommanderReturnChoose }) {

  if (!decision) {
    return <p style={{ color: "var(--ley-text-dim)", fontSize: 13 }}>Waiting for engine…</p>;
  }
  if (decision.kind === "unresolved") {
    return <UnresolvedPanel decision={decision} onContinue={onContinue} />;
  }
  if (decision.kind === "tutor-search") {
    return <TutorSearchPanel decision={decision} onChoose={onTutorChoose} />;
  }
  if (decision.kind === "clone-search") {
    return <CloneCopyPanel decision={decision} onChoose={onCloneChoose} />;
  }
  if (decision.kind === "scry-surveil") {
    return <ScrySurveilPanel decision={decision} onChoose={onScryChoose} />;
  }
  if (decision.kind === "optional-effect") {
    return <OptionalChoicePanel decision={decision} onChoose={onOptionalChoose} />;
  }
  if (decision.kind === "cleanup-discard") {
    return <CleanupDiscardPanel decision={decision} onChoose={onCleanupDiscardChoose} />;
  }
  if (decision.kind === "dig-land-to-battlefield") {
    return <DigLandPanel decision={decision} onChoose={onDigLandChoose} />;
  }
  if (decision.kind === "distribute-counters") {
    return <DistributeCountersPanel decision={decision} onChoose={onDistributeCountersChoose} />;
  }
  if (decision.kind === "optional-draw-discard") {
    return <OptionalDrawDiscardPanel decision={decision} onChoose={onOptionalDrawDiscardChoose} />;
  }
  if (decision.kind === "optional-discard-payment") {
    return <OptionalDiscardPaymentPanel decision={decision} onChoose={onOptionalDiscardPaymentChoose} />;
  }
  if (decision.kind === "sac-unless-pay") {
    return <SacUnlessPayPanel decision={decision} onChoose={onSacUnlessPayChoose} />;
  }
  if (decision.kind === "taxed-payment") {
    return <TaxedPaymentPanel decision={decision} onChoose={onTaxedPaymentChoose} />;
  }
  if (decision.kind === "edict-mode") {
    return <EdictModePanel decision={decision} onChoose={onEdictModeChoose} />;
  }
  if (decision.kind === "hand-discard") {
    return <HandDiscardPanel decision={decision} onChoose={onHandDiscardChoose} />;
  }
  if (decision.kind === "impulse-dig") {
    return <ImpulseDigPanel decision={decision} onChoose={onImpulseDigChoose} />;
  }
  if (decision.kind === "look-top-take") {
    return <LookTopTakePanel decision={decision} onChoose={onLookTopTakeChoose} />;
  }
  if (decision.kind === "sacrifice-choice") {
    return <SacrificeChoicePanel decision={decision} onChoose={onSacrificeChoose} />;
  }
  if (decision.kind === "discard") {
    return <DiscardChoicePanel decision={decision} onChoose={onDiscardChoose} />;
  }
  if (decision.kind === "divide-damage") {
    return <DivideDamagePanel decision={decision} onChoose={onDivideChoose} />;
  }
  if (decision.kind === "soft-counter") {
    return <SoftCounterPanel decision={decision} onChoose={onSoftCounterChoose} />;
  }
  if (decision.kind === "optional-mana-payment") {
    return <OptionalManaPaymentPanel decision={decision} onChoose={onOptionalManaPaymentChoose} />;
  }
  if (decision.kind === "optional-sac-payment") {
    return <OptionalSacPanel decision={decision} onChoose={onOptionalSacChoose} />;
  }
  if (decision.kind === "commander-return") {
    return <CommanderReturnPanel decision={decision} onChoose={onCommanderReturnChoose} />;
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
    return <p style={{ color: "var(--ley-text-dim)", fontSize: 13 }}>Engine auto-decided ({decision.metadata?.reasoning || "no reason"})…</p>;
  }
  if (decision.kind !== "ask") {
    return <p style={{ color: "var(--ley-text-dim)", fontSize: 13 }}>Unknown decision kind: {decision.kind}</p>;
  }

  return (
    <>
      <div style={{
        whiteSpace: "pre-wrap",
        fontSize: 13,
        color: "var(--ley-text)",
        lineHeight: 1.6,
        padding: "12px 14px",
        background: "var(--ley-surface-2)",
        border: "1px solid var(--ley-line)",
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
              className="btn btn-secondary btn-sm"
              onClick={() => onChoose(opt)}
              style={{
                width: "100%",
                justifyContent: "flex-start",
                textAlign: "left",
                whiteSpace: "normal",
                ...(isRecommended ? { background: "var(--ley-green-dim)" } : {}),
              }}
            >
              <span style={{ color: isRecommended ? "var(--ley-green)" : "var(--ley-text-faint)", fontSize: 10, marginRight: 8 }}>
                {i + 1}.
              </span>
              {opt.name || opt.kind}
              {opt.kind === "declare-attacker" && opt.defenderId && (
                <span style={{ color: "var(--ley-text-dim)" }}> → {seatLabel(opt.defenderId)}</span>
              )}
              {isRecommended && <span style={{ fontSize: 10, color: "var(--ley-green)", marginLeft: 8 }}>(recommended)</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}


// Re-exported so existing importers and the render fingerprint keep one surface.
export {
  tutorSheetStyle, containerStyle, headerStyle, labelStyle, sectionLabelStyle,
  selectStyle, unresolvedSheetStyle, floatErrorStyle, errorBoxStyle,
} from "./learnViewStyles.js";

// Panel layer re-exported so existing importers (tests, the render fingerprint) keep one surface.
export * from "./learnDecisionPanels.jsx";
