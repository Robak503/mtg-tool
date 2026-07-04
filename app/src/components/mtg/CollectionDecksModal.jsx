"use client";

/**
 * CollectionDecksModal — "what would it cost to finish my decks?"
 *
 * Lists every saved deck with its owned % + $-to-finish (from
 * /api/collection/deck-costs). Unfinished ("planned") decks sort to the top.
 * Expand a deck to see the shopping list of cards you're still short, cheapest
 * line first; "Add" opens the Add-card flow pre-filled with that card so you can
 * pick the printing you bought (mark purchased).
 */

import { useEffect, useState } from "react";

export default function CollectionDecksModal({ onClose, onAddCard, colors }) {
  const { BG3, LINE, TEXT, MUTED, GOLD, RED } = colors;
  const [state, setState] = useState({ status: "loading", decks: [], error: null });
  const [expanded, setExpanded] = useState(null);
  const [buildableOnly, setBuildableOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/collection/deck-costs");
        const body = await resp.json();
        if (cancelled) return;
        if (!resp.ok) setState({ status: "error", decks: [], error: body.error || "Failed to load deck costs" });
        else setState({ status: "ready", decks: body.decks || [], error: null });
      } catch (e) {
        if (!cancelled) setState({ status: "error", decks: [], error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const buildableCount = state.decks.filter(deck => deck.complete).length;
  const shown = buildableOnly ? state.decks.filter(deck => deck.complete) : state.decks;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: 620, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 80px)",
          display: "flex", flexDirection: "column", color: TEXT,
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: GOLD, fontFamily: "var(--font-display)" }}>Decks · cost to finish</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              How much of each deck you own, and the cheapest price to complete it.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
        </header>

        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {state.status === "loading" && <Center color={MUTED}>Pricing your decks…</Center>}
          {state.status === "error" && <Center color={RED}>{state.error}</Center>}
          {state.status === "ready" && state.decks.length === 0 && <Center color={MUTED}>No saved decks yet.</Center>}

          {state.status === "ready" && state.decks.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 18px 10px" }}>
              <span style={{ fontSize: 11, color: MUTED }}>
                {buildableCount} of {state.decks.length} deck{state.decks.length === 1 ? "" : "s"} buildable now
              </span>
              <button
                onClick={() => setBuildableOnly(v => !v)}
                title="Show only decks you can build entirely from cards you own"
                style={{ background: buildableOnly ? "var(--ley-green-dim)" : "transparent", border: `1px solid ${buildableOnly ? "var(--ley-line-bright)" : LINE}`, color: buildableOnly ? "var(--ley-green)" : MUTED, fontWeight: buildableOnly ? 700 : 400, borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
              >
                {buildableOnly ? "✓ Buildable only" : "Buildable only"}
              </button>
            </div>
          )}

          {state.status === "ready" && state.decks.length > 0 && shown.length === 0 && (
            <Center color={MUTED}>No decks are fully buildable from your collection yet.</Center>
          )}

          {state.status === "ready" && shown.map(deck => {
            const open = expanded === deck.deckId;
            return (
              <div key={deck.deckId || deck.deckName} style={{ borderBottom: `1px solid ${LINE}` }}>
                <button
                  onClick={() => setExpanded(open ? null : deck.deckId)}
                  className="ley-row"
                  style={{ width: "100%", display: "block", textAlign: "left", padding: "11px 18px", background: open ? BG3 : "transparent", cursor: "pointer", color: TEXT, fontFamily: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{deck.deckName}</span>
                    <span style={{ fontSize: 12, color: deck.complete ? "var(--ley-green)" : GOLD, fontWeight: 600, flexShrink: 0 }}>
                      {deck.complete ? "✓ Fully owned" : `$${deck.costToFinish.toFixed(2)} to finish`}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 5, background: LINE, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${deck.ownedPct}%`, height: "100%", background: deck.complete ? "var(--ley-green)" : GOLD }} />
                    </div>
                    <span style={{ fontSize: 10, color: MUTED, minWidth: 128, textAlign: "right" }}>
                      {deck.ownedPct}% owned · {deck.neededCards} card{deck.neededCards === 1 ? "" : "s"} short
                      {deck.unpricedCount > 0 ? ` · ${deck.unpricedCount} unpriced` : ""}
                    </span>
                  </div>
                </button>

                {open && deck.missing.length > 0 && (
                  <div style={{ padding: "2px 10px 10px 18px" }}>
                    {deck.missing.map(card => (
                      <div key={card.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${LINE}` }}>
                        <span style={{ fontSize: 12, color: TEXT, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {card.need}× {card.name}
                          {card.owned > 0 && <span style={{ color: MUTED }}> (own {card.owned})</span>}
                        </span>
                        <span style={{ fontSize: 11, color: card.lineCost != null ? MUTED : RED, minWidth: 64, textAlign: "right" }}>
                          {card.lineCost != null ? `$${card.lineCost.toFixed(2)}` : "no price"}
                        </span>
                        <button
                          onClick={() => onAddCard?.(card.name)}
                          title="Add to your collection (mark purchased)"
                          className="btn btn-secondary btn-sm"
                          style={{ flexShrink: 0 }}
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const text = deck.missing.map(m => `${m.need} ${m.name}`).join("\n") + "\n";
                        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${(deck.deckName || "deck").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-shopping-list.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8 }}
                    >
                      ⬇ Export shopping list (paste into Moxfield / Archidekt)
                    </button>
                  </div>
                )}
                {open && deck.missing.length === 0 && (
                  <div style={{ padding: "4px 18px 12px", fontSize: 11, color: MUTED }}>You own every card in this deck.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Center({ color, children }) {
  return <div style={{ padding: 28, textAlign: "center", color, fontSize: 13 }}>{children}</div>;
}
