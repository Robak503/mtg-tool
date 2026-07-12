"use client";

/**
 * CollectionAddModal — search-to-add card flow.
 *
 * Search input → live debounced search against /api/printings/search →
 * click a result → pick the exact printing from the printing menu (set
 * name · SET · #collector) → check the finish(es) you own (only finishes
 * that exist in paper for that printing; special foils named: Surge Foil,
 * Ripple Foil, Etched…) → qty per finish + condition → POST /api/collection.
 * On success: close modal, call onAdded with the new collection so
 * CollectionView can refresh.
 *
 * Checking several finishes adds one stack per finish in a single POST
 * (the route already accepts a stacks array). Card thumbnails render the
 * FULL card via /api/card-image (local-first cache) — never a raw CDN hit.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { treatmentButtons } from "../../lib/foilTreatments";
import { cardImageProxySrc } from "../../lib/cardImage";
import useEscapeClose from "../../hooks/useEscapeClose";

const DEBOUNCE_MS = 280;
const MIN_QUERY_CHARS = 2;

const CONDITION_OPTIONS = [
  { value: "NM", label: "NM" },
  { value: "LP", label: "LP" },
  { value: "MP", label: "MP" },
  { value: "HP", label: "HP" },
  { value: "DMG", label: "DMG" },
];

// Per-finish price for a printing row.
function priceForFinish(printing, finish) {
  const p = printing?.prices || {};
  if (finish === "foil") return p.usdFoil ?? p.usd ?? p.usdEtched ?? null;
  if (finish === "etched") return p.usdEtched ?? p.usdFoil ?? p.usd ?? null;
  return p.usd ?? p.usdFoil ?? p.usdEtched ?? null;
}

// C5-P1.3 quick-add decision (pure, exported for test): what a keydown should do in the search box.
// "pick-first" = commit the top search result (nothing picked yet); "submit" = add the picked card
// (a finish is checked and we're not mid-request); null = let the keystroke pass through. Only Enter acts.
export function quickAddKeyAction({ key, hasSelection, hasResults, hasCheckedFinish, busy }) {
  if (key !== "Enter") return null;
  if (!hasSelection && hasResults) return "pick-first";
  if (hasSelection && hasCheckedFinish && !busy) return "submit";
  return null;
}

// Fresh finish-selection state for a printing: first available finish
// checked at qty 1, the rest unchecked.
function initialFinishSel(printing) {
  const buttons = treatmentButtons(printing?.finishes, printing?.foilTypes);
  const sel = {};
  buttons.forEach((b, i) => { sel[b.finish] = { checked: i === 0, qty: 1 }; });
  return sel;
}

export default function CollectionAddModal({ onClose, onAdded, initialQuery = "", colors }) {
  useEscapeClose(onClose);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);
  // finish → { checked, qty } for the selected printing (see initialFinishSel).
  const [finishSel, setFinishSel] = useState({});
  const [condition, setCondition] = useState("NM");
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

  // The printings to choose from. by-name returns every printing of the card;
  // fall back to the single search-picked printing if that lookup hasn't landed.
  const printings = allPrintings.length ? allPrintings : (selected ? [selected] : []);

  // The finish options that exist in paper for the selected printing.
  const finishOptions = useMemo(
    () => (selected ? treatmentButtons(selected.finishes, selected.foilTypes) : []),
    [selected],
  );

  // Pick a printing from the menu — reset the finish checkboxes to that
  // printing's real finishes (never carry a finish it doesn't offer).
  const pickPrinting = (printing) => {
    setSelected(printing);
    setFinishSel(initialFinishSel(printing));
  };

  const toggleFinish = (finish) => {
    setFinishSel(sel => ({
      ...sel,
      [finish]: { checked: !sel[finish]?.checked, qty: sel[finish]?.qty || 1 },
    }));
  };

  const setFinishQty = (finish, qty) => {
    setFinishSel(sel => ({
      ...sel,
      [finish]: { ...(sel[finish] || { checked: true }), qty: Math.max(1, Math.floor(qty || 1)) },
    }));
  };

  const checkedFinishes = finishOptions.filter(b => finishSel[b.finish]?.checked);

  const submit = async () => {
    if (!selected || checkedFinishes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        scryfallId: selected.id,
        oracleId: selected.oracleId,
        name: selected.name,
        setCode: selected.set,
        collectorNumber: selected.collectorNumber,
        stacks: checkedFinishes.map(b => ({
          finish: b.finish,
          quantity: wishlist ? 0 : Math.max(1, Math.floor(finishSel[b.finish]?.qty || 1)),
          condition: wishlist ? null : (condition || "NM"),
        })),
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
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: 560,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
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
          <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500, fontFamily: "var(--font-display)" }}>Add card</div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">×</button>
        </header>

        <div style={{ padding: 16 }}>
          <input
            ref={searchInputRef}
            type="search"
            placeholder='Search by name, set, or collector ("sol ring c21")'
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            onKeyDown={(e) => {
              // C5-P1.3 quick-add: Enter-Enter adds a card in two keystrokes without leaving the keyboard.
              // 1st Enter (no card picked yet) → pick the TOP search result (it already defaults to
              // nonfoil ×1 via initialFinishSel). 2nd Enter (a card is picked, a finish checked) → submit.
              // Deliberate picks (a different printing / foil / higher qty) still use the mouse; this only
              // greases the common "one nonfoil, next card" path. Decision is the pure quickAddKeyAction.
              const act = quickAddKeyAction({
                key: e.key, hasSelection: !!selected, hasResults: results.length > 0,
                hasCheckedFinish: checkedFinishes.length > 0, busy,
              });
              if (act === "pick-first") { e.preventDefault(); pickPrinting(results[0]); }
              else if (act === "submit") { e.preventDefault(); submit(); }
            }}
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
                    onClick={() => pickPrinting(r)}
                    className="ley-row"
                    style={resultRow(colors)}
                  >
                    <CardThumb card={r} width={40} colors={colors} />
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
              {printings.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                    Which printing do you own?{printings.length > 1 ? ` (${printings.length})` : ""}
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${colors.LINE}`, borderRadius: 4 }}>
                    {printings.map(p => (
                      <PrintingRow
                        key={p.id}
                        printing={p}
                        isSelected={p.id === selected.id}
                        onPick={() => pickPrinting(p)}
                        colors={colors}
                      />
                    ))}
                  </div>
                </div>
              )}

              {finishOptions.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                    Finish — only what this printing exists as
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {finishOptions.map(b => {
                      const sel = finishSel[b.finish] || { checked: false, qty: 1 };
                      const price = priceForFinish(selected, b.finish);
                      return (
                        <div
                          key={b.finish}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 10px",
                            background: sel.checked ? "var(--ley-green-dim)" : colors.BG3,
                            border: `1px solid ${sel.checked ? "var(--ley-green)" : colors.LINE}`,
                            borderRadius: 4,
                          }}
                        >
                          {/* checkbox + label share a <label>; the qty input sits
                              OUTSIDE it so clicking qty never toggles the checkbox */}
                          <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={sel.checked}
                              onChange={() => toggleFinish(b.finish)}
                              style={{ accentColor: "var(--ley-green)" }}
                            />
                            <span style={{
                              flex: 1, fontSize: 12.5,
                              color: sel.checked ? "var(--ley-green)" : colors.TEXT,
                              fontWeight: sel.checked ? 700 : 400,
                            }}>
                              {b.label}
                            </span>
                          </label>
                          <span style={{ fontSize: 11, color: colors.GOLD, flexShrink: 0 }}>
                            {price != null ? `$${price}` : ""}
                          </span>
                          {sel.checked && !wishlist && (
                            <input
                              type="number"
                              min={1}
                              value={sel.qty}
                              onChange={(e) => setFinishQty(b.finish, parseInt(e.target.value, 10))}
                              aria-label={`${b.label} quantity`}
                              style={{ ...inputStyle(colors), width: 52, textAlign: "center", flexShrink: 0 }}
                            />
                          )}
                        </div>
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

              {!wishlist && (
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <Field label="Condition" colors={colors}>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      style={selectStyle(colors)}
                    >
                      {CONDITION_OPTIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

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
          <button onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={submit} disabled={!selected || checkedFinishes.length === 0 || busy} className="btn btn-primary btn-sm">
            {busy ? "Adding..." : "Add to collection"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Small FULL-card thumbnail (63:88) routed through the local cache proxy.
function CardThumb({ card, width, colors }) {
  const [failed, setFailed] = useState(false);
  const src = cardImageProxySrc(card);
  const height = Math.round(width * 88 / 63);
  if (!src || failed) {
    return (
      <div style={{
        width, height, borderRadius: 3, flexShrink: 0,
        background: colors.BG, color: colors.MUTED,
        fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: 2, boxSizing: "border-box",
      }}>{failed ? card.name : "no image"}</div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width, height, objectFit: "cover",
        borderRadius: Math.max(3, Math.round(width * 0.045)),
        flexShrink: 0, background: colors.BG,
      }}
    />
  );
}

function PrintingRow({ printing, isSelected, onPick, colors }) {
  const buttons = treatmentButtons(printing.finishes, printing.foilTypes);
  const price = priceForFinish(printing, buttons[0]?.finish);
  return (
    <button
      onClick={onPick}
      className="ley-row"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        background: isSelected ? colors.BG3 : "transparent",
        border: "none",
        borderBottom: `1px solid ${colors.LINE}`,
        borderLeft: `3px solid ${isSelected ? colors.GOLD : "transparent"}`,
        cursor: "pointer",
        color: colors.TEXT,
        fontFamily: "inherit",
      }}
    >
      {/* Row 1: set name · CODE #collector · price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12.5, color: colors.TEXT, fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {printing.setName || (printing.set || "").toUpperCase()}
        </span>
        <span style={{
          fontSize: 10, color: colors.MUTED, textTransform: "uppercase",
          letterSpacing: "0.04em", flexShrink: 0,
        }}>
          {printing.set} · #{printing.collectorNumber}
        </span>
        <span style={{ fontSize: 11, color: colors.GOLD, minWidth: 46, textAlign: "right", flexShrink: 0 }}>
          {price != null ? `$${price}` : "—"}
        </span>
      </div>
      {/* Row 2: the finishes this printing exists as (pick them below) */}
      <div style={{ fontSize: 10, color: colors.MUTED, marginTop: 3 }}>
        {buttons.map(b => b.label).join(" · ")}
      </div>
    </button>
  );
}

function SelectedPreview({ card, onChange, colors }) {
  return (
    <div style={{
      display: "flex",
      gap: 14,
      padding: "10px 12px",
      background: colors.BG3,
      border: `1px solid ${colors.LINE}`,
      borderRadius: 4,
      alignItems: "center",
    }}>
      {/* Keyed by printing id so the image swaps when a different printing is picked. */}
      <CardThumb key={card.id} card={card} width={110} colors={colors} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500 }}>{card.name}</div>
        <div style={{ fontSize: 11, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
          {card.setName ? `${card.setName} · ` : ""}{card.set} · #{card.collectorNumber}
        </div>
      </div>
      <button onClick={onChange} className="btn btn-ghost btn-sm">Change</button>
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
    borderRadius: 6,
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
    background: "var(--ley-red-dim)",
    border: `1px solid ${colors.RED}`,
    borderRadius: 4,
    color: colors.RED,
    fontSize: 12,
  };
}
