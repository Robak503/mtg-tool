"use client";

/**
 * ColorTagModal — create / edit a single card color tag.
 *
 * A name field + an HSV picker (saturation-brightness square, hue slider, hex
 * input) via react-colorful, matching the Archidekt "Create color tag" flow.
 * Rendered only while open (the parent mounts it on demand), so its local
 * state initializes cleanly from `initial` each time.
 */

import { useState } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";

import { TAG_BEHAVIORS } from "../../hooks/useColorTags";

export default function ColorTagModal({ initial, onSave, onClose, cfg, colors, fontFamily }) {
  const { LINE, TEXT, MUTED } = colors;
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || "#fa890d");
  const [behavior, setBehavior] = useState(initial?.behavior || "marker");

  const canSave = name.trim().length > 0;
  const save = () => { if (canSave) onSave({ name: name.trim(), color, behavior }); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit color tag" : "Create color tag"}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{
        width: "min(420px, 94vw)",
        background: "rgba(18,19,24,0.98)",
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        boxShadow: `0 30px 80px -20px rgba(0,0,0,0.8), inset 3px 0 0 ${cfg.color}`,
        padding: "20px 22px",
        display: "flex", flexDirection: "column", gap: 14,
        fontFamily,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>
            {isEdit ? "Edit color tag" : "Create color tag"}
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="tag-name" style={{ fontSize: 11, color: MUTED }}>Tag name</label>
          <input
            id="tag-name"
            value={name}
            autoFocus
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") save(); }}
            placeholder="New tag name"
            style={{
              width: "100%", padding: "9px 11px",
              background: "#1c1d24", color: TEXT,
              border: `1px solid ${LINE}`, borderRadius: 8,
              fontSize: 13, fontFamily,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="tag-behavior" style={{ fontSize: 11, color: MUTED }}>What applying it does</label>
          <select
            id="tag-behavior"
            value={behavior}
            onChange={event => setBehavior(event.target.value)}
            style={{
              width: "100%", padding: "9px 11px",
              background: "#1c1d24", color: TEXT,
              border: `1px solid ${LINE}`, borderRadius: 8,
              fontSize: 13, fontFamily,
            }}
          >
            {TAG_BEHAVIORS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="color-tag-picker" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <HexColorPicker color={color} onChange={setColor} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: color, border: `1px solid ${LINE}`, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <HexColorInput
                color={color}
                onChange={setColor}
                prefixed
                style={{
                  width: 110, textAlign: "center", padding: "6px 8px",
                  background: "#1c1d24", color: TEXT,
                  border: `1px solid ${LINE}`, borderRadius: 7,
                  fontSize: 12, fontFamily, textTransform: "uppercase",
                }}
              />
              <span style={{ fontSize: 9, color: MUTED, letterSpacing: "0.18em", marginTop: 3 }}>HEX</span>
            </div>
          </div>
        </div>
        {/* react-colorful sizing override so the picker fits the modal width. */}
        <style>{`
          .color-tag-picker .react-colorful { width: 220px; height: 170px; }
          .color-tag-picker .react-colorful__saturation { border-radius: 8px 8px 0 0; }
          .color-tag-picker .react-colorful__last-control { border-radius: 0 0 8px 8px; }
          .color-tag-picker .react-colorful__hue { height: 18px; }
          .color-tag-picker .react-colorful__pointer { width: 16px; height: 16px; }
        `}</style>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2 }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: `1px solid ${LINE}`, borderRadius: 8, color: MUTED, cursor: "pointer", fontSize: 12.5, padding: "8px 14px", fontFamily }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              background: cfg.color, border: "none", borderRadius: 8, color: "#0c0b0a",
              cursor: canSave ? "pointer" : "not-allowed", opacity: canSave ? 1 : 0.45,
              fontSize: 12.5, fontWeight: 600, padding: "8px 16px", fontFamily,
            }}
          >
            {isEdit ? "Save tag" : "+ Create color tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
