"use client";

/**
 * LibraryView — The Library (wave K3): a user-facing search over the bundled
 * Comprehensive Rules + the ~92 engine explainers + card rulings. The backend
 * (/api/rules-retrieval) already scored and returned all of this; it was
 * Arbiter-only until now. Two tabs: Rules (keyword / rule-number search) and
 * Card rulings (official Scryfall rulings by card name). Fully local.
 */

import { useState } from "react";

export default function LibraryView({ fontFamily }) {
  const [tab, setTab] = useState("rules");
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setState({ status: "loading", data: null, error: null });
    try {
      if (tab === "rules") {
        const resp = await fetch("/api/rules-retrieval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 6 }),
        });
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", data: null, error: body.error || "Search failed." });
        else setState({ status: "ready", data: body, error: null });
      } else {
        const resp = await fetch(`/api/cards?rulingsFor=${encodeURIComponent(q)}`);
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", data: null, error: body.error || "No rulings found." });
        else setState({ status: "ready", data: body, error: null });
      }
    } catch (e) {
      setState({ status: "error", data: null, error: e.message });
    }
  };

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", fontFamily, color: "var(--ley-text)" };
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 14 };
  const label = { fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 8 };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", letterSpacing: "-0.02em" }}>
          The Library
        </h1>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
          rules · rulings · engine explainers
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["rules", "Rules & concepts"], ["rulings", "Card rulings"]].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setState({ status: "idle", data: null, error: null }); }} className={tab === k ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder={tab === "rules" ? "Rule number or concept — e.g. 603.7, deathtouch, layers…" : "Card name — e.g. Sol Ring"}
          style={{ flex: 1, padding: "9px 12px", background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: 8, color: "var(--ley-text)", fontSize: 13, fontFamily, boxSizing: "border-box" }}
        />
        <button onClick={runSearch} disabled={state.status === "loading"} className="btn btn-primary">
          {state.status === "loading" ? "Searching…" : "Search"}
        </button>
      </div>

      {state.status === "error" && <div style={{ ...card, color: "var(--ley-red)" }}>{state.error}</div>}

      {state.status === "ready" && tab === "rules" && (
        <>
          {(state.data.rules || []).length === 0 && (state.data.results || []).length === 0 && (
            <div style={card}>No matching rules or explainers. Try a rule number (e.g. 702.19) or a keyword.</div>
          )}
          {(state.data.rules || []).length > 0 && (
            <div style={card}>
              <div style={label}>Comprehensive Rules</div>
              {state.data.rules.map((r) => (
                <div key={r.number} style={{ padding: "8px 0", borderBottom: "1px solid var(--ley-line)" }}>
                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, color: "var(--ley-green)", marginRight: 8 }}>{r.number}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ley-text)" }}>{r.text}</span>
                </div>
              ))}
            </div>
          )}
          {(state.data.results || []).length > 0 && (
            <div style={card}>
              <div style={label}>Engine explainers</div>
              {state.data.results.map((r, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--ley-line)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ley-text)", marginBottom: 3 }}>{r.title}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ley-text-dim)", whiteSpace: "pre-wrap" }}>{r.chunk}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {state.status === "ready" && tab === "rulings" && (
        <div style={card}>
          <div style={label}>{state.data.cardName || query} — official rulings</div>
          {(state.data.rulings || []).length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>No official rulings on record for this card.</div>
          ) : (
            state.data.rulings.map((r, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--ley-line)", fontSize: 13, lineHeight: 1.55 }}>
                {r.published_at && <span style={{ fontSize: 10, color: "var(--ley-text-faint)", marginRight: 8, fontVariantNumeric: "tabular-nums" }}>{String(r.published_at).slice(0, 10)}</span>}
                <span style={{ color: "var(--ley-text)" }}>{r.comment}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
