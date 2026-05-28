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

const FINISH_LABELS = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched" };
const CONDITION_OPTIONS = [
  { value: "", label: "—" },
  { value: "NM", label: "NM" },
  { value: "LP", label: "LP" },
  { value: "MP", label: "MP" },
  { value: "HP", label: "HP" },
  { value: "DMG", label: "DMG" },
];

export default function CollectionCardDetail({ row, onClose, onSave, onDelete, colors }) {
  const [stacks, setStacks] = useState(row.stacks || []);
  const [notes, setNotes] = useState(row.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-sync when the selected row changes
  useEffect(() => {
    setStacks(row.stacks || []);
    setNotes(row.notes || "");
    setError(null);
  }, [row.scryfallId, row.stacks, row.notes]);

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

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const cleanStacks = stacks
        .filter(s => s.finish && Number.isFinite(s.quantity))
        .map(s => ({
          finish: s.finish,
          quantity: Math.max(0, Math.floor(s.quantity)),
          condition: s.condition || null,
        }));
      if (cleanStacks.length === 0) {
        setError("Need at least one stack. To remove the row entirely, use Delete.");
        setBusy(false);
        return;
      }
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
    } finally {
      setBusy(false);
    }
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
        <button onClick={onClose} style={iconBtn(colors)} aria-label="Close">×</button>
      </div>

      <div style={{ padding: "16px 16px 24px", overflowY: "auto", flex: 1 }}>
        {row.artCropUrl && (
          <img
            src={row.artCropUrl}
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
          <SectionLabel color={colors.MUTED}>Stacks</SectionLabel>
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
            <button onClick={addStack} style={{
              ...textBtn(colors),
              marginTop: 6,
              fontSize: 12,
            }}>
              + Add stack
            </button>
          )}
        </section>

        <section style={{ marginTop: 20 }}>
          <SectionLabel color={colors.MUTED}>Notes</SectionLabel>
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
            background: "#3a2020",
            border: `1px solid ${colors.RED}`,
            borderRadius: 4,
            color: "#f4b8b6",
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
        <button onClick={remove} disabled={busy} style={dangerBtn(colors)}>Delete</button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} disabled={busy} style={btnStyle(colors)}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn(colors)}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </aside>
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

      <input
        type="number"
        min={0}
        value={stack.quantity ?? 0}
        onChange={(e) => onChange({ quantity: parseInt(e.target.value, 10) || 0 })}
        style={{
          ...inputStyle(colors),
          width: 56,
          textAlign: "center",
        }}
      />

      <select
        value={stack.condition || ""}
        onChange={(e) => onChange({ condition: e.target.value || null })}
        style={selectStyle(colors)}
      >
        {CONDITION_OPTIONS.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      <button onClick={onRemove} style={iconBtn(colors)} aria-label="Remove stack">×</button>
    </div>
  );
}

function SectionLabel({ color, children }) {
  return (
    <div style={{
      fontSize: 10,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      marginBottom: 8,
    }}>{children}</div>
  );
}

function btnStyle(colors) {
  return {
    background: "transparent",
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
function primaryBtn(colors) { return { ...btnStyle(colors), background: colors.GOLD, color: colors.BG, borderColor: colors.GOLD, fontWeight: 600 }; }
function dangerBtn(colors) { return { ...btnStyle(colors), borderColor: colors.RED, color: colors.RED }; }
function textBtn(colors) {
  return {
    background: "none",
    border: "none",
    color: colors.MUTED,
    padding: "4px 0",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
  };
}
function iconBtn(colors) {
  return {
    background: "none",
    border: "none",
    color: colors.MUTED,
    padding: 2,
    cursor: "pointer",
    fontSize: 18,
    fontFamily: "inherit",
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
