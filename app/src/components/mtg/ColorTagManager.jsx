"use client";

/**
 * ColorTagManager — manage the user's card color-tag set.
 *
 * A table of tags (name + color pill + edit/delete) with a "New color tag"
 * action, mirroring Archidekt's "Deck color tags" panel. Tag CRUD is owned by
 * the caller's useColorTags() instance and passed in, so there's a single
 * source of truth for the tag set. Create/edit happens in ColorTagModal.
 */

import { useState } from "react";

import { behaviorLabel } from "../../hooks/useColorTags";
import ColorTagModal from "./ColorTagModal";

export default function ColorTagManager({ tags, addTag, updateTag, deleteTag, onClose, cfg, colors, fontFamily }) {
  const { LINE, TEXT, MUTED } = colors;
  // null = closed; {} = create; { id, name, color, behavior } = edit
  const [editing, setEditing] = useState(null);

  const handleSave = ({ name, color, behavior }) => {
    if (editing?.id) updateTag(editing.id, { name, color, behavior });
    else addTag({ name, color, behavior });
    setEditing(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Color tags"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1050,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{
        width: "min(560px, 96vw)", maxHeight: "86vh", overflowY: "auto",
        background: "rgba(18,19,24,0.98)",
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        boxShadow: `0 30px 80px -20px rgba(0,0,0,0.8), inset 3px 0 0 ${cfg.color}`,
        padding: "20px 22px",
        fontFamily,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>Color tags</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, margin: "0 0 14px" }}>
          Create labels to mark cards — owned, ordered, still to buy, or anything you like. Pick a color
          and apply them to cards in your decks and the Vault.
        </p>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${LINE}`, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>
          <span style={{ flex: 1 }}>Tag name</span>
          <span style={{ width: 120 }}>Color</span>
          <span style={{ width: 60, textAlign: "right" }} />
        </div>

        {tags.map(tag => (
          <div key={tag.id} style={{ display: "flex", alignItems: "center", padding: "9px 8px", borderBottom: `1px solid ${LINE}`, gap: 8 }}>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 13, color: TEXT, fontStyle: tag.builtin ? "italic" : "normal" }}>{tag.name}</span>
              {tag.behavior && tag.behavior !== "marker" && (
                <span style={{ fontSize: 10, color: MUTED }}>{behaviorLabel(tag.behavior)}</span>
              )}
            </span>
            <span style={{ width: 120 }}>
              <span style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 999,
                background: tag.color, color: "#0c0b0a", fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.02em",
              }}>
                {tag.color}
              </span>
            </span>
            <span style={{ width: 60, display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button
                onClick={() => setEditing(tag)}
                title="Edit tag"
                style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, padding: 2 }}
              >
                ✎
              </button>
              {!tag.builtin && (
                <button
                  onClick={() => deleteTag(tag.id)}
                  title="Delete tag"
                  style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}
                >
                  ×
                </button>
              )}
            </span>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={() => setEditing({})}
            style={{
              background: cfg.color, border: "none", borderRadius: 8, color: "#05130a",
              cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "8px 16px", fontFamily,
            }}
          >
            + New color tag
          </button>
        </div>
      </div>

      {editing && (
        <ColorTagModal
          initial={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          cfg={cfg}
          colors={colors}
          fontFamily={fontFamily}
        />
      )}
    </div>
  );
}
