"use client";

/**
 * PodBalanceModal — "is this pod fair?"
 *
 * Pick 1-4 saved decks and POST them to /api/pod-balance, which runs the local
 * power ranker over each. Shows every deck's official-WotC bracket (1-5), power
 * level, CRISPI axes, and the Game Changers it runs; with 2+ decks it adds a
 * balance verdict (bracket/power spread). All local — no network, no API cost.
 *
 * Doubles as the single-deck bracket + Game Changers surface: select one deck
 * to see just its bracket breakdown.
 */

import { useState } from "react";

const BRACKET_COLOR = { 1: "#4a9b6a", 2: "#6fae5a", 3: "#e8c423", 4: "#d9772f", 5: "#c84848" };
const AXES = [
  ["speed", "Speed"],
  ["consistency", "Consist."],
  ["interaction", "Interact."],
  ["resilience", "Resil."],
  ["manaQuality", "Mana"],
];

function AxisBars({ axes, colors }) {
  const { LINE, MUTED, GOLD } = colors;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      {AXES.map(([key, label]) => {
        const value = axes?.[key] ?? 0;
        return (
          <div key={key} style={{ fontSize: 9, color: MUTED, textAlign: "center" }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < value ? GOLD : LINE }} />
              ))}
            </div>
            {label}
          </div>
        );
      })}
    </div>
  );
}

export default function PodBalanceModal({ onClose, decks = [], colors, fontFamily }) {
  const { BG3, LINE, TEXT, MUTED, GOLD, RED = "var(--ley-red)" } = colors;
  const F = fontFamily;
  const [selected, setSelected] = useState(() => new Set());
  const [state, setState] = useState({ status: "idle", decks: [], comparison: null, error: null });

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const run = async () => {
    const chosen = decks.filter(d => selected.has(d.id)).map(d => ({ id: d.id, name: d.name, cards: d.cards }));
    if (!chosen.length) return;
    setState({ status: "loading", decks: [], comparison: null, error: null });
    try {
      const resp = await fetch("/api/pod-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decks: chosen }),
      });
      const body = await resp.json();
      if (!resp.ok || body.ready === false) {
        setState({ status: "error", decks: [], comparison: null, error: body.error || "Pod balance failed." });
      } else {
        setState({ status: "ready", decks: body.decks || [], comparison: body.comparison || null, error: null });
      }
    } catch (e) {
      setState({ status: "error", decks: [], comparison: null, error: e.message });
    }
  };

  const verdictColor = state.comparison
    ? (state.comparison.severity === "lopsided" ? RED : state.comparison.severity === "balanced" ? "var(--ley-green)" : GOLD)
    : MUTED;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{ width: 640, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", color: TEXT, fontFamily: F }}
      >
        <header style={{ padding: "14px 18px", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: GOLD }}>Pod Balance</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Compare up to 4 decks&apos; official bracket, power, and Game Changers.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
        </header>

        <div style={{ overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Deck picker */}
          <div>
            <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
              Select decks ({selected.size}/4)
            </div>
            {decks.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No saved decks to compare.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 168, overflowY: "auto" }}>
              {decks.map(deck => {
                const on = selected.has(deck.id);
                const commander = (deck.cards || []).filter(c => c.section === "Commander").map(c => c.name).join(" / ");
                const cardCount = (deck.cards || []).filter(c => c.section !== "Sideboard" && c.section !== "Tokens").reduce((s, c) => s + c.qty, 0);
                return (
                  <button
                    key={deck.id}
                    onClick={() => toggle(deck.id)}
                    disabled={!on && selected.size >= 4}
                    className="ley-row"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 5, borderColor: on ? "var(--ley-green)" : "transparent", background: on ? "var(--ley-green-dim)" : "transparent", color: TEXT, cursor: (!on && selected.size >= 4) ? "default" : "pointer", textAlign: "left", fontFamily: "inherit", opacity: (!on && selected.size >= 4) ? 0.45 : 1 }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${on ? "var(--ley-green)" : MUTED}`, background: on ? "var(--ley-green)" : "transparent", color: "var(--ley-on-green)", fontSize: 11, lineHeight: "13px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{commander || "No commander"} · {cardCount} cards</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={run}
              disabled={!selected.size || state.status === "loading"}
              className="btn btn-primary"
              style={{ marginTop: 10, width: "100%" }}
            >
              {state.status === "loading" ? "Ranking…" : `Compare ${selected.size || ""}`}
            </button>
          </div>

          {state.status === "error" && (
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "var(--ley-red-dim)", border: "1px solid var(--ley-red)", color: RED, fontSize: 12, lineHeight: 1.5 }}>{state.error}</div>
          )}

          {state.status === "ready" && state.comparison && (
            <div style={{ padding: "10px 12px", borderRadius: 6, background: BG3, border: `1px solid ${verdictColor}`, color: TEXT, fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ color: verdictColor, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>{state.comparison.severity}</span>
              <div style={{ marginTop: 4 }}>{state.comparison.verdict}</div>
              <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>Bracket spread {state.comparison.bracketSpread} · power spread {state.comparison.powerSpread}</div>
            </div>
          )}

          {state.status === "ready" && state.decks.map((deck, i) => (
            <div key={deck.id || i} style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</span>
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: MUTED }}>power {deck.powerLevel}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ley-on-green)", background: BRACKET_COLOR[deck.bracket] || GOLD, borderRadius: 4, padding: "2px 7px" }}>B{deck.bracket} · {deck.bracketLabel}</span>
                </span>
              </div>
              <AxisBars axes={deck.axes} colors={colors} />
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: MUTED }}>Game Changers ({deck.gameChangers.length}): </span>
                <span style={{ color: deck.gameChangers.length ? TEXT : MUTED }}>{deck.gameChangers.length ? deck.gameChangers.join(", ") : "none"}</span>
              </div>
              {deck.massLandDenial.length > 0 && (
                <div style={{ fontSize: 11, color: RED, marginTop: 3 }}>Mass land denial: {deck.massLandDenial.join(", ")}</div>
              )}
              {deck.extraTurns.length > 0 && (
                <div style={{ fontSize: 11, color: GOLD, marginTop: 3 }}>Extra turns: {deck.extraTurns.join(", ")}</div>
              )}
              {deck.confidence === "low" && (
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Low confidence — {deck.unresolvedCount} cards didn&apos;t resolve locally{deck.totalCards ? ` of ${deck.totalCards}` : ""}.</div>
              )}
              <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>{deck.bracketReason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
