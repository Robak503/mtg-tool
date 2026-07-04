"use client";

/**
 * CardInspector — a local card panel (wave K1) that replaces the reflex of
 * opening scryfall.com on every card click. Full image (local /api/card-image
 * cache), oracle text / type / mana / legality (/api/cards), official rulings
 * (/api/cards?rulingsFor), and a Printings tab (/api/printings/by-name) — all
 * from bundled local data. Scryfall stays one click away as a fallback link.
 */

import { useEffect, useState } from "react";

import useEscapeClose from "../../hooks/useEscapeClose";

const money = (v) => (v == null || v === "" ? null : `$${Number(v).toFixed(2)}`);

export default function CardInspector({ name, onClose, onAskJace }) {
  const [tab, setTab] = useState("card");
  const [card, setCard] = useState({ status: "loading", data: null });
  const [rulings, setRulings] = useState(null);
  const [printings, setPrintings] = useState(null);
  useEscapeClose(onClose);

  useEffect(() => {
    setTab("card"); setRulings(null); setPrintings(null);
    setCard({ status: "loading", data: null });
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/cards?name=${encodeURIComponent(name)}`);
        const b = await r.json();
        if (cancelled) return;
        setCard(r.ok ? { status: "ready", data: b.card } : { status: "error", data: b.error || "Card not found locally." });
      } catch (e) {
        if (!cancelled) setCard({ status: "error", data: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [name]);

  useEffect(() => {
    if (tab !== "rulings" || rulings !== null) return;
    (async () => {
      try {
        const r = await fetch(`/api/cards?rulingsFor=${encodeURIComponent(name)}`);
        const b = await r.json();
        setRulings(r.ok ? (b.rulings || []) : []);
      } catch { setRulings([]); }
    })();
  }, [tab, name, rulings]);

  useEffect(() => {
    if (tab !== "printings" || printings !== null) return;
    (async () => {
      try {
        const r = await fetch(`/api/printings/by-name?name=${encodeURIComponent(name)}`);
        const b = await r.json();
        setPrintings(r.ok ? (b.results || []) : []);
      } catch { setPrintings([]); }
    })();
  }, [tab, name, printings]);

  const c = card.data;
  const label = { fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 8 };
  const notableLegal = ["commander", "legacy", "modern", "pioneer", "standard", "pauper"];

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{ width: 720, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column", color: "var(--ley-text)" }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ley-line)" }}>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, fontWeight: 700 }}>{c?.name || name}</div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
        </header>

        <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
          {[["card", "Card"], ["rulings", "Rulings"], ["printings", "Printings"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={tab === k ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}>{l}</button>
          ))}
          <a href={`https://scryfall.com/search?q=${encodeURIComponent('"' + name + '"')}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>Scryfall ↗</a>
        </div>

        <div style={{ overflowY: "auto", padding: 16 }}>
          {card.status === "loading" && <div style={{ color: "var(--ley-text-dim)", fontSize: 13 }}>Loading…</div>}
          {card.status === "error" && <div style={{ color: "var(--ley-red)", fontSize: 13 }}>{card.data}</div>}

          {card.status === "ready" && tab === "card" && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <img src={`/api/card-image?name=${encodeURIComponent(name)}`} alt={c.name} width={220}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                style={{ width: 220, maxWidth: "100%", borderRadius: 10, border: "1px solid var(--ley-line)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginBottom: 6 }}>{c.type}{c.mana ? ` · ${c.mana}` : ""}</div>
                {c.oracle && <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 12 }}>{c.oracle}</div>}
                {(c.power != null || c.loyalty != null) && (
                  <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginBottom: 10 }}>
                    {c.power != null ? `${c.power}/${c.toughness}` : ""}{c.loyalty != null ? `Loyalty ${c.loyalty}` : ""}
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, marginBottom: 10 }}>
                  {money(c.prices?.usd) && <span style={{ color: "var(--ley-green)" }}>{money(c.prices.usd)}</span>}
                  {c.setName && <span style={{ color: "var(--ley-text-dim)" }}>{c.setName}</span>}
                  {c.rarity && <span style={{ color: "var(--ley-text-dim)", textTransform: "capitalize" }}>{c.rarity}</span>}
                </div>
                <div style={{ ...label, marginTop: 8 }}>Legal in</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {notableLegal.map((fmt) => {
                    const legal = c.legalities?.[fmt] === "legal";
                    return (
                      <span key={fmt} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, textTransform: "capitalize", background: legal ? "var(--ley-green-dim)" : "transparent", color: legal ? "var(--ley-green)" : "var(--ley-text-faint)", border: `1px solid ${legal ? "var(--ley-line-bright)" : "var(--ley-line)"}` }}>{fmt}</span>
                    );
                  })}
                </div>
                {onAskJace && (
                  <button onClick={() => { onAskJace(c.name || name); onClose(); }} className="btn btn-secondary btn-sm" style={{ marginTop: 16 }}>Ask Jace about this card</button>
                )}
              </div>
            </div>
          )}

          {card.status === "ready" && tab === "rulings" && (
            <div>
              <div style={label}>Official rulings</div>
              {rulings === null ? <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Loading…</div>
                : rulings.length === 0 ? <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>No official rulings on record.</div>
                : rulings.map((r, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--ley-line)", fontSize: 13, lineHeight: 1.55 }}>
                    {r.published_at && <span style={{ fontSize: 10, color: "var(--ley-text-faint)", marginRight: 8 }}>{String(r.published_at).slice(0, 10)}</span>}
                    {r.comment}
                  </div>
                ))}
            </div>
          )}

          {card.status === "ready" && tab === "printings" && (
            <div>
              <div style={label}>Every printing</div>
              {printings === null ? <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Loading…</div>
                : printings.length === 0 ? <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>No printings in the local index (sync data to populate).</div>
                : printings.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--ley-line)", fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.setName || p.set?.toUpperCase()} <span style={{ color: "var(--ley-text-faint)", fontSize: 11 }}>#{p.collectorNumber}</span></span>
                    {p.artist && <span style={{ color: "var(--ley-text-dim)", fontSize: 11, flexShrink: 0 }}>{p.artist}</span>}
                    <span style={{ color: "var(--ley-green)", flexShrink: 0, minWidth: 52, textAlign: "right" }}>{money(p.usd) || "—"}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
