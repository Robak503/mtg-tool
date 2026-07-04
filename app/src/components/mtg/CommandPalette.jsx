"use client";

/**
 * CommandPalette — Ctrl/⌘+K jump-anywhere overlay (wave K6). Fuzzy-filters a
 * flat command list (areas, surfaces, decks, sessions, agents, actions) built
 * by MTGAssistant from handlers that already exist, plus a live local card
 * search that opens the card inspector. Keyboard-first: type, arrow, Enter.
 */

import { useEffect, useMemo, useRef, useState } from "react";

// Subsequence match + a light score (prefix + word-boundary bonuses) so
// "prov" ranks "The Proving Grounds" above an incidental substring hit.
function score(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000;
  const wordStart = t.split(/[\s·/-]+/).some((w) => w.startsWith(q));
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
  if (qi < q.length) return 0;
  return (wordStart ? 500 : 100) - (t.length - q.length) * 0.1;
}

export default function CommandPalette({ commands, onClose, onSearchCards, onPickCard }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [cards, setCards] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Live card search (debounced) once the query is specific enough.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || !onSearchCards) { setCards([]); return; }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const found = await onSearchCards(q).catch(() => []);
      if (!cancelled) setCards(found.slice(0, 6));
    }, 160);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [query, onSearchCards]);

  const items = useMemo(() => {
    const matched = commands
      .map((c) => ({ ...c, _s: score(query, `${c.label} ${c.hint || ""}`) }))
      .filter((c) => c._s > 0)
      .sort((a, b) => b._s - a._s)
      .slice(0, 12);
    const cardItems = cards.map((c) => ({
      label: c.name,
      hint: "card",
      group: "Cards",
      run: () => onPickCard?.(c.name),
    }));
    return [...matched, ...cardItems];
  }, [commands, query, cards, onPickCard]);

  useEffect(() => { setActive(0); }, [query, cards]);

  const run = (item) => { if (!item) return; onClose(); item.run(); };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[active]); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh", zIndex: 130 }}>
      <div onClick={(e) => e.stopPropagation()} className="ley-glass-strong ley-glass-lit" style={{ width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump to an area, deck, chat, or search a card…"
          style={{ padding: "14px 16px", background: "transparent", border: "none", borderBottom: "1px solid var(--ley-line)", color: "var(--ley-text)", fontSize: 15, fontFamily: "inherit", outline: "none" }}
        />
        <div style={{ overflowY: "auto" }}>
          {items.length === 0 && <div style={{ padding: 16, fontSize: 13, color: "var(--ley-text-dim)" }}>No matches.</div>}
          {items.map((item, i) => (
            <button
              key={`${item.group || ""}-${item.label}-${i}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 16px", background: i === active ? "var(--ley-green-dim)" : "transparent", border: "none", cursor: "pointer", color: "var(--ley-text)", fontFamily: "inherit" }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              {(item.group || item.hint) && (
                <span style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>{item.group || item.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
