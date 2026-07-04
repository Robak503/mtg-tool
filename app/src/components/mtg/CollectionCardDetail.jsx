"use client";

/**
 * CollectionCardDetail — right drawer showing one selected row.
 *
 * Renders the row's core data + per-stack inline editor + delete.
 * PATCH updates via /api/collection/[scryfallId]; DELETE removes
 * the row.
 *
 * v1 omits oracle text / rulings / deck list — those need joins
 * against cardIndex / decks that this drawer doesn't currently
 * have. Add in follow-up.
 */

import { useEffect, useState } from "react";

import { artCropProxySrc } from "../../lib/artCrop";
import Sparkline from "./Sparkline";

const FINISH_LABELS = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched" };
const CONDITION_OPTIONS = [
  { value: "", label: "—" },
  { value: "NM", label: "NM" },
  { value: "LP", label: "LP" },
  { value: "MP", label: "MP" },
  { value: "HP", label: "HP" },
  { value: "DMG", label: "DMG" },
];

export default function CollectionCardDetail({ row, onClose, onSave, onDelete, tags = [], onAssignTag, colors }) {
  const [stacks, setStacks] = useState(row.stacks || []);
  const [notes, setNotes] = useState(row.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState([]);
  const [alert, setAlert] = useState(null);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDir, setAlertDir] = useState("below");
  const [alertBusy, setAlertBusy] = useState(false);

  // Re-sync when the selected row changes
  useEffect(() => {
    setStacks(row.stacks || []);
    setNotes(row.notes || "");
    setError(null);
  }, [row.scryfallId, row.stacks, row.notes]);

  // Fetch the card's local price history for the sparkline (advisory).
  useEffect(() => {
    let cancelled = false;
    setSeries([]);
    if (!row.scryfallId) return;
    (async () => {
      try {
        const resp = await fetch(`/api/collection/price-history?scryfallId=${encodeURIComponent(row.scryfallId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && Array.isArray(data.series)) setSeries(data.series);
      } catch {
        /* sparkline is advisory */
      }
    })();
    return () => { cancelled = true; };
  }, [row.scryfallId]);

  // Load any existing price alert for this card (#1).
  useEffect(() => {
    let cancelled = false;
    setAlert(null);
    setAlertTarget("");
    setAlertDir("below");
    if (!row.scryfallId) return;
    (async () => {
      try {
        const resp = await fetch("/api/price-alerts");
        if (!resp.ok) return;
        const data = await resp.json();
        const mine = (data.alerts || []).find(a => a.scryfallId === row.scryfallId);
        if (!cancelled && mine) {
          setAlert(mine);
          setAlertTarget(String(mine.target));
          setAlertDir(mine.direction);
        }
      } catch {
        /* alerts are advisory */
      }
    })();
    return () => { cancelled = true; };
  }, [row.scryfallId]);

  const saveAlert = async () => {
    const target = parseFloat(alertTarget);
    if (!Number.isFinite(target) || target <= 0) {
      setError("Enter a target price above $0.");
      return;
    }
    setAlertBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfallId: row.scryfallId, name: row.name, target, direction: alertDir }),
      });
      const body = await resp.json();
      if (!resp.ok) { setError(body.error || `Alert save failed (${resp.status})`); return; }
      setAlert((body.alerts || []).find(a => a.scryfallId === row.scryfallId) || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setAlertBusy(false);
    }
  };

  const clearAlert = async () => {
    setAlertBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/price-alerts?scryfallId=${encodeURIComponent(row.scryfallId)}`, { method: "DELETE" });
      if (!resp.ok) { const b = await resp.json(); setError(b.error || `Clear failed (${resp.status})`); return; }
      setAlert(null);
      setAlertTarget("");
    } catch (e) {
      setError(e.message);
    } finally {
      setAlertBusy(false);
    }
  };

  const updateStack = (idx, patch) => {
    setStacks(stacks.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeStack = (idx) => {
    setStacks(stacks.filter((_, i) => i !== idx));
  };

  const addStack = () => {
    const existingFinishes = new Set(stacks.map(s => s.finish));
    const newFinish = ["nonfoil", "foil", "etched"].find(f => !existingFinishes.has(f));
    if (!newFinish) return;
    setStacks([...stacks, { finish: newFinish, quantity: 1, condition: "NM" }]);
  };

  // DELETE the row. Shared by the explicit Delete button and the save() path
  // when every stack has been zeroed out (delete-at-zero).
  const deleteRowRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/collection/${encodeURIComponent(row.scryfallId)}`, {
        method: "DELETE",
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Delete failed (${resp.status})`);
        setBusy(false);
        return;
      }
      onDelete?.(body.collection);
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const save = async () => {
    // Drop zero-quantity stacks so we never persist a zombie "0 copies" stack.
    const cleanStacks = stacks
      .filter(s => s.finish && Number.isFinite(s.quantity) && s.quantity > 0)
      .map(s => ({
        finish: s.finish,
        quantity: Math.max(0, Math.floor(s.quantity)),
        condition: s.condition || null,
      }));

    // Saving with everything at 0 means "I no longer own this" → delete the row
    // (the API rejects an empty stacks array, so PATCH isn't an option anyway).
    if (cleanStacks.length === 0) {
      if (!confirm(`All quantities are 0 — remove ${row.name} from your collection?`)) return;
      await deleteRowRequest();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/collection/${encodeURIComponent(row.scryfallId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stacks: cleanStacks, notes }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Save failed (${resp.status})`);
        setBusy(false);
        return;
      }
      onSave?.(body.collection);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${row.name} from your collection?`)) return;
    await deleteRowRequest();
  };

  return (
    <aside style={{
      width: 360,
      background: colors.BG2,
      borderLeft: `1px solid ${colors.LINE}`,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      flexShrink: 0,
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${colors.LINE}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 11, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Card detail
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">×</button>
      </div>

      <div style={{ padding: "16px 16px 24px", overflowY: "auto", flex: 1 }}>
        {(row.scryfallId || row.artCropUrl) && (
          <img
            src={artCropProxySrc(row)}
            alt=""
            style={{
              width: "100%",
              height: 180,
              objectFit: "cover",
              borderRadius: 4,
              marginBottom: 12,
              background: colors.BG,
            }}
          />
        )}

        <div style={{ fontSize: 16, color: colors.TEXT, fontWeight: 500, marginBottom: 4 }}>
          {row.name}
        </div>
        {series.length >= 2 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Price trend · ${series[0].usd.toFixed(2)} → ${series[series.length - 1].usd.toFixed(2)}
            </div>
            <Sparkline points={series} />
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.MUTED, marginBottom: 16 }}>
          {row.setCode?.toUpperCase()} · #{row.collectorNumber}
          {row.wishlist && (
            <span style={{
              marginLeft: 8,
              background: colors.GOLD,
              color: colors.BG,
              padding: "1px 6px",
              borderRadius: 3,
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: "0.06em",
            }}>WISHLIST</span>
          )}
        </div>

        {row.prices && <PriceBlock prices={row.prices} colors={colors} />}

        <section style={{ marginTop: 20 }}>
          <SectionLabel>Price alert</SectionLabel>
          <AlertEditor
            alert={alert}
            target={alertTarget}
            direction={alertDir}
            busy={alertBusy}
            onTarget={setAlertTarget}
            onDirection={setAlertDir}
            onSave={saveAlert}
            onClear={clearAlert}
            colors={colors}
          />
        </section>

        {onAssignTag && tags.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <SectionLabel>Tag</SectionLabel>
            <TagPicker
              tags={tags}
              activeId={row.colorTagId || null}
              onAssign={(tagId) => onAssignTag(row.scryfallId, tagId)}
              colors={colors}
            />
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <SectionLabel>Stacks</SectionLabel>
          {stacks.map((stack, idx) => (
            <StackRow
              key={`${stack.finish}-${idx}`}
              stack={stack}
              onChange={(patch) => updateStack(idx, patch)}
              onRemove={() => removeStack(idx)}
              colors={colors}
            />
          ))}
          {stacks.length < 3 && (
            <button onClick={addStack} className="btn btn-ghost btn-sm" style={{ marginTop: 6, padding: "4px 0" }}>
              + Add stack
            </button>
          )}
        </section>

        <section style={{ marginTop: 20 }}>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Pre-release pull, signed, traded for, etc."
            rows={3}
            style={{
              width: "100%",
              background: colors.BG,
              border: `1px solid ${colors.LINE}`,
              color: colors.TEXT,
              padding: "8px 10px",
              borderRadius: 4,
              fontSize: 12,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </section>

        {error && (
          <div style={{
            marginTop: 16,
            padding: "8px 10px",
            background: "var(--ley-red-dim)",
            border: `1px solid ${colors.RED}`,
            borderRadius: 4,
            color: colors.RED,
            fontSize: 12,
          }}>{error}</div>
        )}
      </div>

      <div style={{
        padding: "12px 16px",
        borderTop: `1px solid ${colors.LINE}`,
        display: "flex",
        gap: 8,
      }}>
        <button onClick={remove} disabled={busy} className="btn btn-danger btn-sm">Delete</button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="btn btn-primary btn-sm">
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </aside>
  );
}

// What applying a tag does to the row, by behavior. Shown under the picker so
// the action isn't a surprise (it mirrors the reflection in CollectionView).
const BEHAVIOR_EFFECT = {
  collection: "Counts as owned in your Vault.",
  wishlist: "Tracked on your wishlist — won't count toward owned value.",
  consider: "Kept as “considering” — won't count toward owned value.",
  swap: "Flagged for Karn to suggest replacements.",
  marker: null,
};

function TagPicker({ tags, activeId, onAssign, colors }) {
  const activeTag = activeId ? tags.find(t => t.id === activeId) : null;
  const effect = activeTag ? BEHAVIOR_EFFECT[activeTag.behavior || "marker"] : null;
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map(tag => {
          const isNone = tag.id === "default" || tag.builtin;
          const active = isNone ? !activeId : activeId === tag.id;
          return (
            <button
              key={tag.id}
              onClick={() => onAssign(isNone ? null : tag.id)}
              title={isNone ? "Clear tag" : tag.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: active ? "var(--ley-surface-3)" : "transparent",
                border: `1px solid ${active ? (isNone ? colors.MUTED : tag.color) : colors.LINE}`,
                color: colors.TEXT,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{
                width: 11,
                height: 11,
                borderRadius: 999,
                flexShrink: 0,
                background: isNone ? "transparent" : tag.color,
                border: isNone ? `1px solid ${colors.MUTED}` : "none",
                display: "inline-block",
              }} />
              {isNone ? "None" : tag.name}
            </button>
          );
        })}
      </div>
      {effect && (
        <div style={{ fontSize: 10.5, color: colors.MUTED, marginTop: 7, lineHeight: 1.4 }}>
          {effect}
        </div>
      )}
    </>
  );
}

function AlertEditor({ alert, target, direction, busy, onTarget, onDirection, onSave, onClear, colors }) {
  const dirVerb = direction === "above" ? "rises to ≥" : "drops to ≤";
  return (
    <>
      {alert && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: alert.met ? "var(--ley-green-dim)" : colors.BG,
          border: `1px solid ${alert.met ? "var(--ley-green)" : colors.LINE}`,
          borderRadius: 4,
          marginBottom: 8,
          fontSize: 12,
          color: colors.TEXT,
        }}>
          <span style={{ fontSize: 14 }}>{alert.met ? "🔔" : "⏳"}</span>
          <div style={{ flex: 1, lineHeight: 1.35 }}>
            Notify when {alert.direction === "above" ? "≥" : "≤"} ${alert.target.toFixed(2)}
            <span style={{ color: colors.MUTED }}>
              {alert.currentPrice != null ? ` · now $${alert.currentPrice.toFixed(2)}` : " · no price yet"}
              {alert.met ? " · target hit" : ""}
            </span>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select value={direction} onChange={(e) => onDirection(e.target.value)} style={selectStyle(colors)} aria-label="Alert direction">
          <option value="below">Drops to ≤</option>
          <option value="above">Rises to ≥</option>
        </select>
        <span style={{ color: colors.MUTED, fontSize: 12 }}>$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          placeholder="0.00"
          style={{ ...inputStyle(colors), width: 70, fontSize: 12, padding: "5px 6px" }}
        />
        <button onClick={onSave} disabled={busy} className="btn btn-primary btn-sm">
          {alert ? "Update" : "Set"}
        </button>
        {alert && (
          <button onClick={onClear} disabled={busy} className="btn btn-ghost btn-sm">Clear</button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: colors.MUTED, marginTop: 6, lineHeight: 1.4 }}>
        Flags on the daily price snapshot when the card {dirVerb} your target.
      </div>
    </>
  );
}

function PriceBlock({ prices, colors }) {
  const entries = [
    { label: "Nonfoil", key: "usd",       value: prices.usd },
    { label: "Foil",    key: "usdFoil",   value: prices.usdFoil },
    { label: "Etched",  key: "usdEtched", value: prices.usdEtched },
  ].filter(e => e.value != null);
  if (entries.length === 0) return null;
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: "10px 12px",
      background: colors.BG,
      border: `1px solid ${colors.LINE}`,
      borderRadius: 4,
      marginTop: 8,
    }}>
      {entries.map(e => (
        <div key={e.key} style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {e.label}
          </div>
          <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500 }}>${e.value}</div>
        </div>
      ))}
    </div>
  );
}

function StackRow({ stack, onChange, onRemove, colors }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      background: colors.BG3,
      border: `1px solid ${colors.LINE}`,
      borderRadius: 4,
      marginBottom: 6,
    }}>
      <select
        value={stack.finish}
        onChange={(e) => onChange({ finish: e.target.value })}
        style={selectStyle(colors)}
      >
        {["nonfoil", "foil", "etched"].map(f => (
          <option key={f} value={f}>{FINISH_LABELS[f]}</option>
        ))}
      </select>

      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button
          onClick={() => onChange({ quantity: Math.max(0, (stack.quantity || 0) - 1) })}
          className="btn btn-secondary btn-sm btn-icon"
          style={{ width: 22, height: 24, padding: 0, flexShrink: 0 }}
          aria-label="Decrease quantity"
        >−</button>
        <input
          type="number"
          min={0}
          value={stack.quantity ?? 0}
          onChange={(e) => onChange({ quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          style={{
            ...inputStyle(colors),
            width: 42,
            textAlign: "center",
          }}
        />
        <button
          onClick={() => onChange({ quantity: (stack.quantity || 0) + 1 })}
          className="btn btn-secondary btn-sm btn-icon"
          style={{ width: 22, height: 24, padding: 0, flexShrink: 0 }}
          aria-label="Increase quantity"
        >+</button>
      </div>

      <select
        value={stack.condition || ""}
        onChange={(e) => onChange({ condition: e.target.value || null })}
        style={selectStyle(colors)}
      >
        {CONDITION_OPTIONS.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      <button onClick={onRemove} className="btn btn-ghost btn-sm btn-icon" aria-label="Remove stack">×</button>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--ley-text-faint)",
      textTransform: "uppercase",
      letterSpacing: "0.18em",
      marginBottom: 8,
    }}>{children}</div>
  );
}

function selectStyle(colors) {
  return {
    background: colors.BG,
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "4px 6px",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}
function inputStyle(colors) {
  return {
    background: colors.BG,
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "4px 6px",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}
