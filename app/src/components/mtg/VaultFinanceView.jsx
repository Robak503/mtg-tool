"use client";

/**
 * VaultFinanceView — the Vault's MTG-finance dashboard (an MTGStocks-style price
 * watch). Renders /api/finance:
 *   - Your collection: total value + 30/90/365-day deltas + owned movers
 *   - Finance plays: top risers/fallers across everything tracked
 *   - Worth getting: EDHREC staples (overall) you don't own + near-combo pieces
 *   - Grails: a manual watchlist you build, with each card's price + movement
 *
 * Movers come from local daily price snapshots, so they're empty on a fresh
 * install and fill in over the first week or two — the UI says so rather than
 * faking movement.
 */

import { useEffect, useMemo, useRef, useState } from "react";

const money = (n) => (n == null || Number.isNaN(n) ? "—" : `$${Number(n).toFixed(2)}`);

// Grails are chase cards — a $0.50 "grail" is noise. Only offer to add a card to
// the watchlist when it's worth at least this much (item: grails are $50+ only).
const GRAIL_MIN_USD = 50;

function MoverPill({ mover, colors }) {
  if (!mover) return <span style={{ fontSize: 11, color: colors.MUTED }}>—</span>;
  const up = mover.pctChange > 0;
  const col = up ? "var(--ley-green)" : colors.RED;
  return (
    <span style={{ fontSize: 11, color: col, whiteSpace: "nowrap" }} title={`vs ${mover.asOf}`}>
      {up ? "▲" : "▼"} {Math.abs(mover.pctChange)}% ({up ? "+" : "−"}${Math.abs(mover.absChange).toFixed(2)})
    </span>
  );
}

export default function VaultFinanceView({ colors, fontFamily }) {
  const { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD, RED } = colors;
  const F = fontFamily;

  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [grails, setGrails] = useState([]);
  const [watched, setWatched] = useState(() => new Set());
  const [worthTab, setWorthTab] = useState("staples");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const load = async () => {
    setState(s => ({ ...s, status: s.data ? "ready" : "loading" }));
    try {
      const resp = await fetch("/api/finance");
      const body = await resp.json();
      if (!resp.ok || body.ready === false) {
        setState({ status: "error", data: null, error: body.error || "Failed to load finance data." });
      } else {
        setState({ status: "ready", data: body, error: null });
      }
    } catch (e) {
      setState({ status: "error", data: null, error: e.message });
    }
  };

  useEffect(() => { load(); }, []);

  // Seed the local grails list + watched-set from the server payload.
  useEffect(() => {
    if (state.data?.grails) {
      setGrails(state.data.grails);
      setWatched(new Set(state.data.grails.map(g => g.scryfallId)));
    }
  }, [state.data]);

  // Grail search (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/printings/search?q=${encodeURIComponent(q)}&limit=8`);
        const body = await resp.json();
        if (seq === searchSeq.current) setResults(resp.ok ? (body.results || []) : []);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const addGrail = async (card) => {
    if (!card?.scryfallId || watched.has(card.scryfallId)) return;
    // Guard: grails are $50+ chase cards (the +Grail button is hidden below this,
    // but defend the handler too).
    if (card.usd != null && Number(card.usd) < GRAIL_MIN_USD) return;
    setWatched(prev => new Set(prev).add(card.scryfallId));
    setGrails(prev => [{
      scryfallId: card.scryfallId, name: card.name, setCode: card.setCode || card.set || null,
      collectorNumber: card.collectorNumber || null, note: "", usd: card.usd ?? null,
      mover30d: card.mover30d || null, mover7d: null,
    }, ...prev.filter(g => g.scryfallId !== card.scryfallId)]);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scryfallId: card.scryfallId, oracleId: card.oracleId || null, name: card.name,
          setCode: card.setCode || card.set || null, collectorNumber: card.collectorNumber || null,
        }),
      });
    } catch { /* optimistic; a failed add just won't persist */ }
  };

  const removeGrail = async (scryfallId) => {
    setWatched(prev => { const next = new Set(prev); next.delete(scryfallId); return next; });
    setGrails(prev => prev.filter(g => g.scryfallId !== scryfallId));
    try {
      await fetch(`/api/watchlist?scryfallId=${encodeURIComponent(scryfallId)}`, { method: "DELETE" });
    } catch { /* optimistic */ }
  };

  const data = state.data;
  const deltas = data?.value?.deltas || {};
  const noHistory = data && !data.historyAvailable;

  const worthList = useMemo(() => {
    if (!data) return [];
    return worthTab === "staples" ? (data.suggestions?.staples || []) : (data.suggestions?.combos || []);
  }, [data, worthTab]);

  if (state.status === "loading") {
    return <Centered color={MUTED}>Loading finance data…</Centered>;
  }
  if (state.status === "error") {
    return <Centered color={RED}>{state.error}</Centered>;
  }

  const card = { background: BG2, border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, marginBottom: 16 };
  const h = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 10 };
  const colHead = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 6 };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: BG, color: TEXT, fontFamily: F }}>
      {/* Value */}
      <div style={card}>
        <div style={h}>Collection value</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 38, color: GOLD, fontWeight: 700, letterSpacing: "-0.01em" }}>{money(data?.value?.currentUsd)}</span>
          {["d30", "d90", "d365"].map(k => {
            const d = deltas[k];
            const label = k === "d30" ? "30d" : k === "d90" ? "90d" : "1yr";
            if (!d) return <span key={k} style={{ fontSize: 12, color: MUTED }}>{label}: —</span>;
            const up = d.delta > 0;
            return (
              <span key={k} style={{ fontSize: 13, color: d.delta === 0 ? MUTED : up ? "var(--ley-green)" : RED }}>
                {label}: {d.delta === 0 ? "flat" : `${up ? "▲" : "▼"} $${Math.abs(d.delta).toFixed(2)}`}
              </span>
            );
          })}
        </div>
        {noHistory && (
          <div style={{ marginTop: 10, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            Price movement fills in as the app records daily snapshots (it just tracked{" "}
            <strong style={{ color: TEXT }}>{data?.trackedCount ?? 0}</strong> cards). Open the Vault over the next
            week or two and risers/fallers will appear here — there's no free way to back-fill historical prices.
          </div>
        )}
      </div>

      {/* Price alerts */}
      {(data?.alerts?.length || 0) > 0 && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={h}>Price alerts</span>
            {(data.alertsMetCount || 0) > 0 && (
              <span style={{
                marginLeft: "auto", marginBottom: 10, fontSize: 11, fontWeight: 700,
                color: "var(--ley-green)", background: "var(--ley-green-dim)",
                border: "1px solid var(--ley-green)", borderRadius: 999, padding: "1px 9px",
              }}>🔔 {data.alertsMetCount} hit</span>
            )}
          </div>
          {[...data.alerts].sort((a, b) => (b.met ? 1 : 0) - (a.met ? 1 : 0)).map(a => (
            <div key={a.scryfallId} style={rowStyle(LINE)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: TEXT, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.met ? "🔔 " : ""}{a.name}
                </span>
                <span style={{ fontSize: 10, color: MUTED }}>
                  notify {a.direction === "above" ? "≥" : "≤"} ${a.target.toFixed(2)}
                </span>
              </span>
              <span style={{ fontSize: 13, color: a.met ? "var(--ley-green)" : GOLD, minWidth: 64, textAlign: "right" }}>{money(a.currentPrice)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Deal radar — owned/grail cards near a recent low */}
      {(data?.deals?.length || 0) > 0 && (
        <div style={card}>
          <div style={h}>Deals · your cards near a recent low</div>
          {data.deals.map((d) => (
            <div key={d.scryfallId} style={rowStyle(LINE)}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ fontSize: 11, color: "var(--ley-green)", minWidth: 92, textAlign: "right" }}>▼ {d.dipPct}% off high</span>
              <span style={{ fontSize: 13, color: GOLD, minWidth: 64, textAlign: "right" }}>{money(d.current)}</span>
              <span style={{ fontSize: 10, color: MUTED, minWidth: 70, textAlign: "right" }}>low {money(d.low)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Finance plays — movers across everything tracked */}
      {!noHistory && (
        <div style={card}>
          <div style={h}>Finance plays · biggest movers (30d)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ ...colHead, color: "var(--ley-green)" }}>▲ Risers</div>
              <MoverList movers={data?.movers?.risers} colors={colors} empty="No risers yet." />
            </div>
            <div>
              <div style={{ ...colHead, color: RED }}>▼ Fallers</div>
              <MoverList movers={data?.movers?.fallers} colors={colors} empty="No fallers yet." />
            </div>
          </div>
        </div>
      )}

      {/* Your collection movers */}
      {!noHistory && (
        <div style={card}>
          <div style={h}>Your cards · movers (30d)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ ...colHead, color: "var(--ley-green)" }}>▲ Up</div>
              <MoverList movers={data?.owned?.risers} colors={colors} empty="None of your cards are up." />
            </div>
            <div>
              <div style={{ ...colHead, color: RED }}>▼ Down</div>
              <MoverList movers={data?.owned?.fallers} colors={colors} empty="None of your cards are down." />
            </div>
          </div>
        </div>
      )}

      {/* Worth getting */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ ...h, marginBottom: 0 }}>Worth getting</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {[["staples", "EDHREC staples"], ["combos", "Combo pieces"]].map(([k, label]) => (
              <button key={k} onClick={() => setWorthTab(k)} style={{
                background: worthTab === k ? "var(--ley-green-dim)" : "transparent",
                color: worthTab === k ? "var(--ley-green)" : MUTED,
                fontWeight: worthTab === k ? 700 : 400,
                border: `1px solid ${worthTab === k ? "var(--ley-line-bright)" : LINE}`, borderRadius: 4, padding: "3px 9px",
                fontSize: 11, cursor: "pointer", fontFamily: F,
              }}>{label}</button>
            ))}
          </div>
        </div>
        {worthList.length === 0 && (
          <div style={{ fontSize: 12, color: MUTED }}>
            {worthTab === "staples" ? "No un-owned staples to suggest." : "No one-card-away combos across your decks."}
          </div>
        )}
        {worthList.map((c) => (
          <div key={c.scryfallId || c.name} style={rowStyle(LINE)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{c.name}</span>
              <span style={{ fontSize: 10, color: MUTED }}>
                {worthTab === "staples"
                  ? `EDHREC #${c.edhrecRank}${c.setCode ? ` · ${String(c.setCode).toUpperCase()}` : ""}`
                  : `with ${(c.pieces || []).slice(0, 2).join(" + ")}${c.produces?.length ? ` → ${c.produces[0]}` : ""}`}
              </span>
            </span>
            <span style={{ fontSize: 13, color: GOLD, minWidth: 64, textAlign: "right" }}>{money(c.usd)}</span>
            <div style={{ minWidth: 96, textAlign: "right" }}><MoverPill mover={c.mover30d} colors={colors} /></div>
            <GrailButton on={watched.has(c.scryfallId)} onClick={() => addGrail(c)} colors={colors} font={F} usd={c.usd} />
          </div>
        ))}
      </div>

      {/* Grails */}
      <div style={card}>
        <div style={h}>Grails · your price watchlist</div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a card to track (e.g. Mana Crypt)…"
            style={{ width: "100%", padding: "8px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, fontSize: 13, fontFamily: F }}
          />
          {(searching || results.length > 0) && query.trim().length >= 2 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: BG2, border: `1px solid ${LINE}`, borderRadius: 6, marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
              {searching && <div style={{ padding: 10, fontSize: 12, color: MUTED }}>Searching…</div>}
              {!searching && results.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: TEXT, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>{String(r.set || "").toUpperCase()} #{r.collectorNumber} · {money(r.prices?.usd != null ? parseFloat(r.prices.usd) : null)}</span>
                  </span>
                  <GrailButton
                    on={watched.has(r.id)}
                    usd={r.prices?.usd != null ? parseFloat(r.prices.usd) : null}
                    onClick={() => addGrail({ scryfallId: r.id, oracleId: r.oracleId, name: r.name, setCode: r.set, collectorNumber: r.collectorNumber, usd: r.prices?.usd != null ? parseFloat(r.prices.usd) : null })}
                    colors={colors} font={F}
                  />
                </div>
              ))}
              {!searching && results.length === 0 && <div style={{ padding: 10, fontSize: 12, color: MUTED }}>No matches.</div>}
            </div>
          )}
        </div>
        {grails.length === 0 && (
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            No grails yet. Search above (or hit “+ Grail” on a suggestion) to track a card's price over time.
          </div>
        )}
        {grails.map(g => (
          <div key={g.scryfallId} style={rowStyle(LINE)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: TEXT, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
              {g.setCode && <span style={{ fontSize: 10, color: MUTED }}>{String(g.setCode).toUpperCase()}{g.collectorNumber ? ` #${g.collectorNumber}` : ""}</span>}
            </span>
            <span style={{ fontSize: 13, color: GOLD, minWidth: 64, textAlign: "right" }}>{money(g.usd)}</span>
            <div style={{ minWidth: 96, textAlign: "right" }}><MoverPill mover={g.mover30d} colors={colors} /></div>
            <button onClick={() => removeGrail(g.scryfallId)} title="Stop tracking" aria-label={`Stop tracking ${g.name}`} className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, padding: "0 2px 16px" }}>
        Prices: TCGPlayer (via Scryfall) with a Card Kingdom fallback, refreshed on data sync. Movement is computed from this app's own daily snapshots — all local, no API cost.
      </div>
    </div>
  );
}

function MoverList({ movers, colors, empty }) {
  const { LINE, TEXT, GOLD, MUTED } = colors;
  if (!movers || movers.length === 0) return <div style={{ fontSize: 12, color: MUTED }}>{empty}</div>;
  return movers.map(m => (
    <div key={m.scryfallId} style={rowStyle(LINE)}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
      <span style={{ fontSize: 12, color: GOLD, minWidth: 54, textAlign: "right" }}>${m.current.toFixed(2)}</span>
      <div style={{ minWidth: 92, textAlign: "right" }}><MoverPill mover={m} colors={colors} /></div>
    </div>
  ));
}

function GrailButton({ on, onClick, usd }) {
  // Below the grail threshold (and not already tracked): don't offer it at all.
  if (!on && usd != null && usd < GRAIL_MIN_USD) return null;
  return (
    <button
      onClick={onClick}
      disabled={on}
      title={on ? "Tracking in Grails" : "Add to Grails watchlist"}
      className="btn btn-secondary btn-sm"
      style={{ flexShrink: 0 }}
    >
      {on ? "✓ Tracking" : "+ Grail"}
    </button>
  );
}

function rowStyle(LINE) {
  return { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: `1px solid ${LINE}` };
}

function Centered({ color, children }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color, fontSize: 14 }}>{children}</div>;
}
