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
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div className="ley-glass-strong ley-glass-lit" style={{
        width: "min(560px, 96vw)", maxHeight: "86vh", overflowY: "auto",
        padding: "20px 22px",
        fontFamily,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color, fontFamily: "var(--font-display)" }}>Color tags</span>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
        </div>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, margin: "0 0 14px" }}>
          Create labels to mark cards — owned, ordered, still to buy, or anything you like. Pick a color
          and apply them to cards in your decks and the Vault.
        </p>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${LINE}`, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ley-text-faint)" }}>
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
                background: tag.color, color: "var(--ley-on-green)", fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.02em",
              }}>
                {tag.color}
              </span>
            </span>
            <span style={{ width: 60, display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button
                onClick={() => setEditing(tag)}
                title="Edit tag"
                aria-label={`Edit tag ${tag.name}`}
                className="btn btn-ghost btn-sm btn-icon"
              >
                ✎
              </button>
              {!tag.builtin && (
                <button
                  onClick={() => deleteTag(tag.id)}
                  title="Delete tag"
                  aria-label={`Delete tag ${tag.name}`}
                  className="btn btn-ghost btn-sm btn-icon"
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
            className="btn btn-primary btn-sm"
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
