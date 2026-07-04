"use client";

/**
 * VaultSetBrowserView — the Vault's Set Browser (#23).
 *
 * List every set (newest first, searchable) with how many of its cards you own;
 * drill into a set to see every printing as a value list, owned cards flagged,
 * sortable by value / collector number / owned. All local — sets + prices from
 * the bundled printings index, ownership from your collection.
 */

import { useEffect, useMemo, useState, memo } from "react";

const money = (n) => (n == null || Number.isNaN(n) ? "—" : `$${Number(n).toFixed(2)}`);
const RARITY_COLOR = { mythic: "#d8542f", rare: "#d9a531", uncommon: "#b6c2cc", common: "#7d8590", special: "#a06fd8", bonus: "#a06fd8" };
const year = (iso) => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : "");

export default function VaultSetBrowserView({ colors, fontFamily }) {
  const { BG, BG3, LINE, TEXT, MUTED, GOLD, RED } = colors;
  const F = fontFamily;

  const [state, setState] = useState({ status: "loading", sets: null, error: null });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null); // { setCode, setName }
  const [detail, setDetail] = useState({ status: "idle", data: null, error: null });
  const [sortBy, setSortBy] = useState("value");

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/collection/sets");
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", sets: null, error: body.error || "Failed to load sets." });
        else setState({ status: "ready", sets: body.sets || [], error: null });
      } catch (e) {
        setState({ status: "error", sets: null, error: e.message });
      }
    })();
  }, []);

  useEffect(() => {
    if (!active) { setDetail({ status: "idle", data: null, error: null }); return; }
    let cancelled = false;
    setDetail({ status: "loading", data: null, error: null });
    (async () => {
      try {
        const resp = await fetch(`/api/collection/sets?set=${encodeURIComponent(active.setCode)}`);
        const body = await resp.json();
        if (cancelled) return;
        if (!resp.ok) setDetail({ status: "error", data: null, error: body.error || "Failed to load set." });
        else setDetail({ status: "ready", data: body, error: null });
      } catch (e) {
        if (!cancelled) setDetail({ status: "error", data: null, error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const filteredSets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = state.sets || [];
    if (!q) return list;
    return list.filter((s) => s.setName.toLowerCase().includes(q) || s.setCode.toLowerCase().includes(q));
  }, [state.sets, query]);

  const sortedCards = useMemo(() => {
    const cards = detail.data?.cards ? [...detail.data.cards] : [];
    if (sortBy === "value") cards.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || a.name.localeCompare(b.name));
    else if (sortBy === "number") cards.sort((a, b) => collNum(a.collectorNumber) - collNum(b.collectorNumber));
    else if (sortBy === "owned") cards.sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0) || (b.usd ?? -1) - (a.usd ?? -1));
    return cards;
  }, [detail.data, sortBy]);

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", background: BG, color: TEXT, fontFamily: F };
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 16 };
  const h = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 12 };

  if (state.status === "loading") return <Centered color={MUTED}>Loading sets…</Centered>;
  if (state.status === "error") return <Centered color={RED}>{state.error}</Centered>;

  // ── Set detail ──
  if (active) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setActive(null)} className="btn btn-secondary btn-sm">← All sets</button>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, fontWeight: 700, color: TEXT }}>{active.setName}</span>
          <span style={{ fontSize: 12, color: MUTED }}>{active.setCode.toUpperCase()}</span>
          {detail.status === "ready" && (
            <span style={{ marginLeft: "auto", fontSize: 13, color: GOLD, fontWeight: 600 }}>
              own {detail.data.owned} / {detail.data.total}
            </span>
          )}
        </div>

        {detail.status === "loading" && <Centered color={MUTED}>Loading {active.setName}…</Centered>}
        {detail.status === "error" && <Centered color={RED}>{detail.error}</Centered>}
        {detail.status === "ready" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ ...h, marginBottom: 0 }}>Cards</span>
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                {[["value", "Value"], ["number", "Collector #"], ["owned", "Owned"]].map(([k, label]) => (
                  <button key={k} onClick={() => setSortBy(k)} style={{
                    background: sortBy === k ? "var(--ley-green-dim)" : "transparent",
                    color: sortBy === k ? "var(--ley-green)" : MUTED,
                    fontWeight: sortBy === k ? 700 : 400,
                    border: `1px solid ${sortBy === k ? "var(--ley-line-bright)" : LINE}`, borderRadius: 4, padding: "3px 9px",
                    fontSize: 11, cursor: "pointer", fontFamily: F,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {sortedCards.map((c) => (
              <SetCardRow key={c.scryfallId} c={c} colors={colors} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Set list ──
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={h}>Browse sets</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a set (name or code, e.g. Modern Horizons or MH3)…"
          style={{ width: "100%", padding: "8px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, fontSize: 13, fontFamily: F, marginBottom: 12, boxSizing: "border-box" }}
        />
        {filteredSets.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No sets match.</div>}
        {filteredSets.map((s) => (
          <button key={s.setCode} onClick={() => setActive({ setCode: s.setCode, setName: s.setName })} className="ley-row" style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
            padding: "8px 6px", background: "transparent", borderRadius: 6,
            cursor: "pointer", fontFamily: F, color: TEXT,
          }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.setName} <span style={{ color: MUTED, fontSize: 11 }}>· {s.setCode.toUpperCase()}{year(s.releasedAt) ? ` · ${year(s.releasedAt)}` : ""}</span>
            </span>
            <span style={{ fontSize: 12, color: s.owned > 0 ? GOLD : MUTED, flexShrink: 0 }}>own {s.owned} / {s.total}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, padding: "0 2px 16px" }}>
        Sets and prices come from the local printings index; ownership from your collection. Prices link to Scryfall. Counts are printings the index holds for each set.
      </div>
    </div>
  );
}

// Memoized so a sort toggle (which only reorders the list) doesn't re-render
// every row — sets can carry hundreds of printings.
const SetCardRow = memo(function SetCardRow({ c, colors }) {
  const { LINE, TEXT, MUTED, GOLD } = colors;
  return (
    <div style={rowStyle(LINE)}>
      <span style={{ width: 46, fontSize: 11, color: MUTED, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>#{c.collectorNumber}</span>
      {c.rarity && <span title={c.rarity} style={{ width: 8, height: 8, borderRadius: "50%", background: RARITY_COLOR[c.rarity] || "var(--ley-text-faint)", flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.owned ? TEXT : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
      {c.owned
        ? <span style={{ fontSize: 10, color: "var(--ley-green)", border: "1px solid var(--ley-line-bright)", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>✓ Owned</span>
        : c.ownedOtherPrinting
          ? <span title="You own a different printing of this card" style={{ fontSize: 10, color: GOLD, border: `1px solid ${LINE}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>other printing</span>
          : null}
      <a href={`https://scryfall.com/search?q=${encodeURIComponent("set:" + c.setCode + " cn:" + c.collectorNumber)}`} target="_blank" rel="noreferrer"
         style={{ fontSize: 13, color: GOLD, minWidth: 64, textAlign: "right", textDecoration: "none", flexShrink: 0 }}>
        {money(c.usd)}
      </a>
    </div>
  );
});

function collNum(cn) {
  const n = parseInt(String(cn).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function rowStyle(line) {
  return { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${line}` };
}
function Centered({ color, children }) {
  return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color, fontSize: 13, padding: 40 }}>{children}</div>;
}
