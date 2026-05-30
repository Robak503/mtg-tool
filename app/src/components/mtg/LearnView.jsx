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

import { useState } from "react";
import useLearnSession from "../../hooks/useLearnSession";

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
    if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
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

  const oppCount = mode === "commander" ? 3 : 1;
  const userDeck = savedDecks.find(d => d.id === userDeckId);
  const oppDecks = oppIds.slice(0, oppCount).map(id => savedDecks.find(d => d.id === id));
  const canStart = userDeck && oppDecks.every(Boolean) && session.status !== "starting";

  const setOppId = (index, id) => setOppIds(prev => prev.map((v, i) => (i === index ? id : v)));

  const handleStart = async () => {
    if (!canStart) return;
    if (mode === "commander") {
      await session.start({
        mode: "commander",
        userDeck: deckToCardArray(userDeck),
        opponentDecks: oppDecks.map(deckToCardArray),
        userCommanders: commandersOf(userDeck),
        opponentCommanders: oppDecks.map(commandersOf),
        difficulty,
      });
    } else {
      await session.start({
        mode: "standard",
        userDeck: deckToCardArray(userDeck),
        opponentDeck: deckToCardArray(oppDecks[0]),
        userCommanders: commandersOf(userDeck),
        opponentCommanders: commandersOf(oppDecks[0]),
        difficulty,
      });
    }
  };

  const handleAbandon = () => session.reset();

  // ─── Idle / setup screen ──────────────────────────────────────────────────

  if (session.status === "idle" || session.status === "starting") {
    return (
      <div style={containerStyle(BG, fontFamily)}>
        <header style={{ ...headerStyle(LINE, BG2, GOLD), justifyContent: "space-between" }}>
          <span>Garfield · Learn to Play</span>
          {session.status === "starting" && <span style={{ fontSize: 12, color: MUTED }}>starting…</span>}
        </header>
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>
              Pick a deck to learn, an opponent to play against, and a difficulty.
              The session runs locally — every decision is narrated by Jace at
              Beginner difficulty, lighter at higher difficulties.
            </p>

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

  // ─── Game-over screen ─────────────────────────────────────────────────────

  if (session.status === "ended") {
    const reason = session.decision?.reason || "game-ended";
    const youWon = reason === "user-wins";
    return (
      <div style={containerStyle(BG, fontFamily)}>
        <header style={headerStyle(LINE, BG2, GOLD)}>Garfield · Game Over</header>
        <div style={{ flex: 1, padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <h2 style={{ fontSize: 24, color: youWon ? "#85d18a" : "#e0a89a", margin: 0 }}>
              {youWon ? "You won." : "You lost."}
            </h2>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
              {reasonBlurb(reason)}
            </p>
            <button
              onClick={handleAbandon}
              style={primaryButtonStyle(cfg, fontFamily)}
            >
              New game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active game ──────────────────────────────────────────────────────────

  const decision = session.decision;

  return (
    <div style={containerStyle(BG, fontFamily)}>
      <header style={{ ...headerStyle(LINE, BG2, GOLD), justifyContent: "space-between" }}>
        <span>Garfield · {session.mode === "commander" ? "Commander 4P pod" : `${userDeck?.name || "You"} vs ${oppDecks[0]?.name || "Opponent"}`}</span>
        <span style={{ fontSize: 11, color: MUTED }}>
          Turn {session.turn} · {session.activePlayer === "user" ? "Your" : `${seatLabel(session.activePlayer)}'s`} {session.step}
        </span>
      </header>

      <TableStrip table={session.table} activePlayer={session.activePlayer} cfg={cfg} colors={colors} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Decision area */}
        <main style={{ flex: 2, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <DecisionPrompt decision={decision} cfg={cfg} colors={colors} fontFamily={fontFamily} onChoose={session.applyChoice} />
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

      <footer style={{ padding: "10px 16px", borderTop: `1px solid ${LINE}`, background: BG2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={handleAbandon} style={{ ...subtleButtonStyle(LINE, MUTED, fontFamily) }}>
          Abandon game
        </button>
        {session.error && <span style={{ fontSize: 11, color: "#e0a89a" }}>⚠ {session.error}</span>}
      </footer>
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

function DecisionPrompt({ decision, cfg, colors, fontFamily, onChoose }) {
  const { BG3, LINE, TEXT, MUTED, GOLD } = colors || {};

  if (!decision) {
    return <p style={{ color: MUTED, fontSize: 13 }}>Waiting for engine…</p>;
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

// ─── Style helpers ───────────────────────────────────────────────────────────

function containerStyle(BG, fontFamily) {
  return {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: BG,
    fontFamily,
  };
}

function headerStyle(LINE, BG2, GOLD) {
  return {
    padding: "10px 16px",
    borderBottom: `1px solid ${LINE}`,
    background: BG2,
    color: GOLD,
    fontSize: 13,
    fontWeight: 600,
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

function primaryButtonStyle(cfg, fontFamily) {
  return {
    padding: "10px 18px",
    background: cfg?.color || "#cc8a38",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
    fontFamily,
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

function reasonBlurb(reason) {
  switch (reason) {
    case "user-wins":   return "Opponent's life hit 0 (or commander damage finished them).";
    case "ai-wins":     return "Your life hit 0 (or commander damage finished you).";
    case "abandoned":   return "You abandoned the run.";
    default:            return reason;
  }
}
