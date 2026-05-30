"use client";

/**
 * CollectionAddModal — search-to-add card flow.
 *
 * Search input → live debounced search against /api/printings/search →
 * click a result → configure stack (finish/quantity/condition) → POST
 * /api/collection. On success: close modal, call onAdded with the new
 * collection so CollectionView can refresh.
 *
 * v1 deliberately ships a quick-add flow rather than a batch editor.
 * For multiple cards in one sitting, use the Import flow (Step 9) once
 * it lands. CSV is faster than the modal for batches >5.
 */

import { useEffect, useMemo, useRef, useState } from "react";

const DEBOUNCE_MS = 280;
const MIN_QUERY_CHARS = 2;

const CONDITION_OPTIONS = [
  { value: "NM", label: "NM" },
  { value: "LP", label: "LP" },
  { value: "MP", label: "MP" },
  { value: "HP", label: "HP" },
  { value: "DMG", label: "DMG" },
];

const FINISH_LABELS = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched" };

export default function CollectionAddModal({ onClose, onAdded, colors }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [stack, setStack] = useState({ finish: "nonfoil", quantity: 1, condition: "NM" });
  const [wishlist, setWishlist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // All printings of the picked card (the search list is deduped to one per
  // name, so this is what lets the user choose the exact printing they own).
  const [allPrintings, setAllPrintings] = useState([]);
  const [printingsLoading, setPrintingsLoading] = useState(false);

  const searchInputRef = useRef(null);
  useEffect(() => { searchInputRef.current?.focus(); }, []);

  // Debounced search — keep the last request token so out-of-order
  // responses don't overwrite newer results.
  const requestSeq = useRef(0);
  useEffect(() => {
    if (query.trim().length < MIN_QUERY_CHARS) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const handle = setTimeout(async () => {
      const seq = ++requestSeq.current;
      setSearching(true);
      setSearchError(null);
      try {
        const resp = await fetch(`/api/printings/search?q=${encodeURIComponent(query.trim())}&limit=20`);
        const body = await resp.json();
        if (seq !== requestSeq.current) return; // outdated
        if (!resp.ok) {
          setSearchError(body.error || `Search failed (${resp.status})`);
          setResults([]);
        } else {
          setResults(body.results || []);
        }
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setSearchError(e.message);
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // When a card is picked from search, load ALL its printings so the user can
  // switch to the exact one they own. Keyed by oracleId so switching among a
  // card's printings (same oracleId) doesn't re-fetch.
  useEffect(() => {
    const oid = selected?.oracleId;
    const nm = selected?.name;
    if (!oid || !nm) { setAllPrintings([]); return; }
    let cancelled = false;
    setPrintingsLoading(true);
    (async () => {
      try {
        const resp = await fetch(`/api/printings/by-name?name=${encodeURIComponent(nm)}&oracleId=${encodeURIComponent(oid)}`);
        const body = await resp.json();
        if (!cancelled && resp.ok) setAllPrintings(body.results || []);
      } catch {
        // Keep the single selected printing if the lookup fails.
      } finally {
        if (!cancelled) setPrintingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected?.oracleId, selected?.name]);

  const supportedFinishes = useMemo(() => {
    if (!selected) return ["nonfoil"];
    const arr = Array.isArray(selected.finishes) && selected.finishes.length > 0
      ? selected.finishes
      : ["nonfoil"];
    return arr;
  }, [selected]);

  // When the selected card's supported finishes change, reset finish to
  // the first supported one so we don't try to submit a finish the
  // printing doesn't offer.
  useEffect(() => {
    if (!supportedFinishes.includes(stack.finish)) {
      setStack(s => ({ ...s, finish: supportedFinishes[0] }));
    }
  }, [supportedFinishes, stack.finish]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const qty = wishlist ? 0 : Math.max(1, Math.floor(stack.quantity || 1));
      const payload = {
        scryfallId: selected.id,
        oracleId: selected.oracleId,
        name: selected.name,
        setCode: selected.set,
        collectorNumber: selected.collectorNumber,
        stacks: [{
          finish: stack.finish,
          quantity: qty,
          condition: wishlist ? null : (stack.condition || "NM"),
        }],
        wishlist,
      };
      const resp = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Add failed (${resp.status})`);
        setBusy(false);
        return;
      }
      onAdded?.(body.collection);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
          background: colors.BG2,
          border: `1px solid ${colors.LINE}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          color: colors.TEXT,
          fontFamily: "inherit",
        }}
      >
        <header style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${colors.LINE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500 }}>Add card</div>
          <button onClick={onClose} style={iconBtn(colors)} aria-label="Close">×</button>
        </header>

        <div style={{ padding: 16 }}>
          <input
            ref={searchInputRef}
            type="search"
            placeholder='Search by name, set, or collector ("sol ring c21")'
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            style={{
              width: "100%",
              background: colors.BG,
              border: `1px solid ${colors.LINE}`,
              color: colors.TEXT,
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {searchError && (
            <div style={errorBox(colors)}>{searchError}</div>
          )}
          {!selected && results.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {results.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    style={resultRow(colors)}
                  >
                    {r.artCropUrl ? (
                      <img src={r.artCropUrl} alt="" loading="lazy" style={{
                        width: 56, height: 40, objectFit: "cover",
                        borderRadius: 3, flexShrink: 0, background: colors.BG,
                      }} />
                    ) : (
                      <div style={{
                        width: 56, height: 40, borderRadius: 3, flexShrink: 0,
                        background: colors.BG, color: colors.MUTED,
                        fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>no art</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{
                        fontSize: 13, color: colors.TEXT,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {r.set} · #{r.collectorNumber}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: colors.MUTED, flexShrink: 0 }}>
                      {r.prices?.usd ? `$${r.prices.usd}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!selected && !searching && query.length >= MIN_QUERY_CHARS && results.length === 0 && !searchError && (
            <div style={{ padding: "20px 0", color: colors.MUTED, fontSize: 12, textAlign: "center" }}>
              No matches for &quot;{query}&quot;.
            </div>
          )}
          {!selected && searching && (
            <div style={{ padding: "12px 0", color: colors.MUTED, fontSize: 12, textAlign: "center" }}>
              Searching...
            </div>
          )}
          {!selected && query.length < MIN_QUERY_CHARS && (
            <div style={{ padding: "20px 0", color: colors.MUTED, fontSize: 12, textAlign: "center" }}>
              Type at least {MIN_QUERY_CHARS} characters to search.
            </div>
          )}

          {selected && (
            <div style={{ paddingBottom: 12 }}>
              <SelectedPreview card={selected} onChange={() => setSelected(null)} colors={colors} />

              {printingsLoading && allPrintings.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: colors.MUTED }}>Loading printings…</div>
              )}
              {allPrintings.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                    Which printing do you own? ({allPrintings.length})
                  </div>
                  <div style={{ maxHeight: 170, overflowY: "auto", border: `1px solid ${colors.LINE}`, borderRadius: 4 }}>
                    {allPrintings.map(p => {
                      const active = p.id === selected.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelected(p)}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 10px", background: active ? colors.BG3 : "transparent",
                            border: "none", borderLeft: `3px solid ${active ? colors.GOLD : "transparent"}`,
                            borderBottom: `1px solid ${colors.LINE}`, cursor: "pointer", color: colors.TEXT,
                            fontFamily: "inherit", textAlign: "left",
                          }}
                        >
                          <span style={{ flex: 1, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {p.set} · #{p.collectorNumber}
                          </span>
                          <span style={{ fontSize: 10, color: colors.MUTED }}>{(p.finishes || []).join(" / ")}</span>
                          <span style={{ fontSize: 11, color: colors.MUTED, minWidth: 44, textAlign: "right" }}>
                            {p.prices?.usd ? `$${p.prices.usd}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <label style={chipRow()}>
                  <input
                    type="checkbox"
                    checked={wishlist}
                    onChange={(e) => setWishlist(e.target.checked)}
                    style={{ accentColor: colors.GOLD }}
                  />
                  <span style={{ fontSize: 12, color: colors.TEXT }}>Add to wishlist (track without owning)</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <Field label="Finish" colors={colors}>
                  <select
                    value={stack.finish}
                    onChange={(e) => setStack(s => ({ ...s, finish: e.target.value }))}
                    style={selectStyle(colors)}
                  >
                    {supportedFinishes.map(f => (
                      <option key={f} value={f}>{FINISH_LABELS[f]}</option>
                    ))}
                  </select>
                </Field>
                {!wishlist && (
                  <>
                    <Field label="Qty" colors={colors}>
                      <input
                        type="number"
                        min={1}
                        value={stack.quantity}
                        onChange={(e) => setStack(s => ({ ...s, quantity: parseInt(e.target.value, 10) || 1 }))}
                        style={{ ...inputStyle(colors), width: 64, textAlign: "center" }}
                      />
                    </Field>
                    <Field label="Condition" colors={colors}>
                      <select
                        value={stack.condition}
                        onChange={(e) => setStack(s => ({ ...s, condition: e.target.value }))}
                        style={selectStyle(colors)}
                      >
                        {CONDITION_OPTIONS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </div>

              {error && <div style={{ ...errorBox(colors), marginTop: 12 }}>{error}</div>}
            </div>
          )}
        </div>

        <footer style={{
          padding: "12px 16px",
          borderTop: `1px solid ${colors.LINE}`,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button onClick={onClose} disabled={busy} style={btn(colors)}>Cancel</button>
          <button onClick={submit} disabled={!selected || busy} style={primary(colors)}>
            {busy ? "Adding..." : "Add to collection"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SelectedPreview({ card, onChange, colors }) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: "10px 12px",
      background: colors.BG3,
      border: `1px solid ${colors.LINE}`,
      borderRadius: 4,
      alignItems: "center",
    }}>
      {card.artCropUrl ? (
        <img src={card.artCropUrl} alt="" style={{
          width: 80, height: 56, objectFit: "cover",
          borderRadius: 3, flexShrink: 0, background: colors.BG,
        }} />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500 }}>{card.name}</div>
        <div style={{ fontSize: 11, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {card.set} · #{card.collectorNumber}
        </div>
      </div>
      <button onClick={onChange} style={textBtn(colors)}>Change</button>
    </div>
  );
}

function Field({ label, children, colors }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function btn(colors) {
  return {
    background: "transparent",
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "6px 14px",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
function primary(colors) {
  return { ...btn(colors), background: colors.GOLD, color: colors.BG, borderColor: colors.GOLD, fontWeight: 600 };
}
function textBtn(colors) {
  return {
    background: "none",
    border: "none",
    color: colors.MUTED,
    padding: "4px 0",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 11,
  };
}
function iconBtn(colors) {
  return {
    background: "none",
    border: "none",
    color: colors.MUTED,
    padding: 2,
    cursor: "pointer",
    fontSize: 20,
    width: 24,
    height: 24,
    lineHeight: 1,
  };
}
function selectStyle(colors) {
  return {
    background: colors.BG,
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "5px 8px",
    borderRadius: 3,
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}
function inputStyle(colors) {
  return {
    background: colors.BG,
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "5px 8px",
    borderRadius: 3,
    fontSize: 12,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}
function resultRow(colors) {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${colors.LINE}`,
    cursor: "pointer",
    color: colors.TEXT,
    fontFamily: "inherit",
  };
}
function chipRow() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  };
}
function errorBox(colors) {
  return {
    padding: "8px 10px",
    background: "#3a2020",
    border: `1px solid ${colors.RED}`,
    borderRadius: 4,
    color: "#f4b8b6",
    fontSize: 12,
  };
}
