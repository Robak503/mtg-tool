"use client";

/**
 * CollectionImportModal — Deckbox / Moxfield CSV bulk import.
 *
 * Flow: pick a CSV file → preview (POST { csv }) → review matched +
 * unmatched + errors → click Import → commit (POST { rows }) → close +
 * onAdded(updated collection).
 *
 * v1 unmatched UX: list of unresolved entries with their source line +
 * name. No inline resolution picker yet (Step 9.1 follow-up). Users
 * can re-import after fixing the source CSV, or add unmatched cards
 * manually via the search modal.
 */

import { useRef, useState } from "react";
import useEscapeClose from "../../hooks/useEscapeClose";

const MODES = [
  { id: "merge", label: "Merge", blurb: "Add the imported quantities to what you already own." },
  { id: "add-only", label: "Add only", blurb: "Add new cards/finishes; never change an existing quantity." },
  { id: "replace", label: "Replace", blurb: "Set each imported card to exactly the file's quantity." },
  { id: "reconcile", label: "Reconcile", blurb: "Make your collection match the file — also removes owned cards not in it." },
];

export default function CollectionImportModal({ onClose, onAdded, colors }) {
  useEscapeClose(onClose);
  const fileRef = useRef(null);
  const [phase, setPhase] = useState("pick"); // pick | preview | committing | done
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("merge");
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [pastedText, setPastedText] = useState(""); // C5-P1.2 paste-a-list

  const pickFile = () => fileRef.current?.click();

  // C5-P1.2 — preview a pasted decklist. Mirrors onFileChange exactly (same preview→diff flow), but POSTs
  // `{ text }` so the server runs the paste-a-list parser instead of the CSV parser. The matched rows carry
  // `pickedLatest` marks the PreviewPanel surfaces as "picked latest — tap to fix".
  const previewText = async () => {
    const text = pastedText.trim();
    if (!text) return;
    setFilename("pasted list");
    setError(null);
    setPhase("preview");
    try {
      const resp = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Preview failed (${resp.status})`);
        setPhase("pick");
        return;
      }
      setPreview(body);
      loadDiff((body.matched || []).map(m => m.row), mode);
    } catch (e) {
      setError(e.message);
      setPhase("pick");
    }
  };

  // Dry-run: ask the server what the chosen mode would change (no writes).
  const loadDiff = async (rows, m) => {
    if (!rows?.length) { setDiff(null); return; }
    setDiffLoading(true);
    setDiff(null);
    try {
      const resp = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: m, dryRun: true }),
      });
      const body = await resp.json();
      if (resp.ok) setDiff(body.diff);
    } catch {
      // Diff is advisory; commit still works without it.
    } finally {
      setDiffLoading(false);
    }
  };

  const changeMode = (m) => {
    setMode(m);
    loadDiff((preview?.matched || []).map(x => x.row), m);
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setError(null);
    setPhase("preview");
    try {
      const csv = await file.text();
      const resp = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Preview failed (${resp.status})`);
        setPhase("pick");
        return;
      }
      setPreview(body);
      loadDiff((body.matched || []).map(m => m.row), mode);
    } catch (e) {
      setError(e.message);
      setPhase("pick");
    } finally {
      // Allow re-picking the same file (browsers swallow change events for same value).
      e.target.value = "";
    }
  };

  const commit = async () => {
    if (!preview?.matched?.length) return;
    setPhase("committing");
    setError(null);
    try {
      const rows = preview.matched.map(m => m.row);
      const resp = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.error || `Import failed (${resp.status})`);
        setPhase("preview");
        return;
      }
      onAdded?.(body.collection);
      setStats(body.stats || null);
      setPhase("done");
      // Close shortly after showing the success summary
      setTimeout(() => onClose?.(), 800);
    } catch (e) {
      setError(e.message);
      setPhase("preview");
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
          <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500, fontFamily: "var(--font-display)" }}>
            Import collection
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">×</button>
        </header>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          {phase === "pick" && (
            <PickPanel onPickFile={pickFile} colors={colors} pastedText={pastedText} onPasteChange={setPastedText} onPreviewText={previewText} />
          )}

          {phase === "preview" && !preview && (
            <div style={{ padding: "16px 0", color: colors.MUTED, fontSize: 13, textAlign: "center" }}>
              Parsing {filename}...
            </div>
          )}

          {phase === "preview" && preview && (
            <PreviewPanel
              preview={preview}
              filename={filename}
              colors={colors}
              mode={mode}
              onChangeMode={changeMode}
              diff={diff}
              diffLoading={diffLoading}
            />
          )}

          {phase === "committing" && (
            <div style={{ padding: "16px 0", color: colors.MUTED, fontSize: 13, textAlign: "center" }}>
              Importing {preview?.matched?.length || 0} cards...
            </div>
          )}

          {phase === "done" && (
            <div style={{ padding: "16px 0", color: colors.GOLD, fontSize: 14, textAlign: "center" }}>
              ✓ Import complete{stats ? ` — ${stats.added} added, ${stats.mergedCount} updated${stats.removed ? `, ${stats.removed} removed` : ""}.` : "."}
            </div>
          )}

          {error && (
            <div style={errorBox(colors)}>{error}</div>
          )}
        </div>

        <footer style={{
          padding: "12px 16px",
          borderTop: `1px solid ${colors.LINE}`,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "preview" && preview?.matched?.length > 0 && (
            <button
              onClick={commit}
              className={mode === "reconcile" && diff?.removed?.length
                ? "btn btn-danger btn-sm"
                : "btn btn-primary btn-sm"}
            >
              {mode === "reconcile" && diff?.removed?.length
                ? `Reconcile (removes ${diff.removed.length})`
                : `${MODES.find(m => m.id === mode)?.label || "Import"} ${preview.matched.length} cards`}
            </button>
          )}
        </footer>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

function PickPanel({ onPickFile, colors, pastedText, onPasteChange, onPreviewText }) {
  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📥</div>
        <div style={{ fontSize: 14, color: colors.TEXT, marginBottom: 8 }}>
          Import a CSV from Deckbox or Moxfield
        </div>
        <div style={{ fontSize: 12, color: colors.MUTED, marginBottom: 14, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 14px" }}>
          Both export formats are auto-detected. Cards matched to the bundled
          Scryfall data import directly; unmatched cards are listed for review.
        </div>
        <button onClick={onPickFile} className="btn btn-primary">
          Choose CSV file
        </button>
      </div>

      {/* C5-P1.2 — PASTE A LIST: a collector entering a prerelease haul or a box of pulls types
          decklist lines instead of building a CSV elsewhere. Rides the same preview → review flow. */}
      <div style={{ borderTop: `1px solid ${colors.LINE}`, paddingTop: 16 }}>
        <div style={{ fontSize: 13, color: colors.TEXT, marginBottom: 6, fontWeight: 600 }}>…or paste a list</div>
        <div style={{ fontSize: 11, color: colors.MUTED, marginBottom: 8, lineHeight: 1.5 }}>
          One card per line: <code>4 Sol Ring (C21) 263 *F*</code> — quantity, name, then optional
          (set), collector number, and <code>*F*</code> for foil. Missing a set? We pick a printing and
          flag it so you can fix it.
        </div>
        <textarea
          value={pastedText}
          onChange={(e) => onPasteChange(e.target.value)}
          placeholder={"4 Sol Ring (C21) 263 *F*\n2 Lightning Bolt\nArcane Signet"}
          rows={6}
          style={{
            width: "100%", background: colors.BG, border: `1px solid ${colors.LINE}`, color: colors.TEXT,
            padding: "8px 10px", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)",
            resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button onClick={onPreviewText} disabled={!pastedText.trim()} className="btn btn-secondary btn-sm">
            Preview list
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ preview, filename, colors, mode, onChangeMode, diff, diffLoading }) {
  const matched = preview.matched || [];
  const unmatched = preview.unmatched || [];
  const errors = preview.errors || [];
  const formatLabel = preview.format === "unknown"
    ? "Unknown format"
    : preview.format.charAt(0).toUpperCase() + preview.format.slice(1);
  const activeMode = MODES.find(m => m.id === mode) || MODES[0];

  return (
    <div>
      <div style={{
        background: colors.BG3,
        border: `1px solid ${colors.LINE}`,
        borderRadius: 4,
        padding: "10px 14px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, color: colors.MUTED, marginBottom: 4 }}>
          {filename} · {formatLabel}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <Stat label="Matched" value={matched.length} color={colors.GOLD} />
          <Stat label="Unmatched" value={unmatched.length} color={unmatched.length > 0 ? colors.RED : colors.MUTED} />
          <Stat label="Errors" value={errors.length} color={errors.length > 0 ? colors.RED : colors.MUTED} />
        </div>
      </div>

      {preview.warning && (
        <div style={{
          padding: "10px 14px",
          background: "var(--ley-gold-dim)",
          color: "var(--ley-gold)",
          borderRadius: 4,
          fontSize: 12,
          marginBottom: 16,
        }}>
          ⚠ {preview.warning}
        </div>
      )}

      {/* C5-P1.2 honest-ambiguity note: rows resolved to a DEFAULT printing (no set given, or the set had
          no exact match) — surfaced so a paste-a-list never silently lands on the wrong printing. The user
          fixes the printing in the card's edit drawer after import (the printing switcher). */}
      {(() => {
        const picked = matched.filter(m => m.pickedLatest);
        if (picked.length === 0) return null;
        return (
          <div style={{ padding: "10px 14px", background: "var(--ley-gold-dim)", color: "var(--ley-gold)", borderRadius: 4, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            ⚠ {picked.length} card{picked.length === 1 ? "" : "s"} matched to a default printing (no exact set) — after import, open the card and use the printing switcher to fix any that are wrong:{" "}
            <span style={{ color: colors.TEXT }}>
              {picked.slice(0, 8).map(m => m.sourceName).join(", ")}{picked.length > 8 ? ` +${picked.length - 8} more` : ""}
            </span>
          </div>
        );
      })()}

      {matched.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Update mode
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {MODES.map(m => {
              const on = m.id === mode;
              const danger = m.id === "reconcile";
              return (
                <button
                  key={m.id}
                  onClick={() => onChangeMode(m.id)}
                  style={{
                    background: on ? (danger ? "var(--ley-red-dim)" : "var(--ley-green-dim)") : "transparent",
                    color: on ? (danger ? "var(--ley-red)" : "var(--ley-green)") : colors.MUTED,
                    fontWeight: on ? 700 : 400,
                    border: `1px solid ${on ? (danger ? "var(--ley-red)" : "var(--ley-line-bright)") : colors.LINE}`,
                    padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}
                >{m.label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: colors.MUTED, lineHeight: 1.45 }}>{activeMode.blurb}</div>

          {/* Diff preview for the chosen mode */}
          <div style={{ marginTop: 8, background: colors.BG3, border: `1px solid ${mode === "reconcile" && diff?.removed?.length ? colors.RED : colors.LINE}`, borderRadius: 4, padding: "8px 12px" }}>
            {diffLoading && <div style={{ fontSize: 12, color: colors.MUTED }}>Computing changes…</div>}
            {!diffLoading && diff && (
              <div style={{ fontSize: 12, color: colors.TEXT, lineHeight: 1.6 }}>
                <span style={{ color: "var(--ley-green)" }}>+{diff.newCards.length} new</span>
                {" · "}
                <span style={{ color: colors.GOLD }}>{diff.changed.length} qty changed</span>
                {" · "}
                <span style={{ color: colors.MUTED }}>{diff.unchangedCount} unchanged</span>
                {diff.removed.length > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: colors.RED, fontWeight: 600 }}>{diff.removed.length} removed</span>
                  </>
                )}
                {diff.removed.length > 0 && (
                  <div style={{ color: colors.RED, marginTop: 5, fontSize: 11.5 }}>
                    ⚠ Will remove from your collection: {diff.removed.slice(0, 12).map(c => `${c.qty}× ${c.name}`).join(", ")}{diff.removed.length > 12 ? ` +${diff.removed.length - 12} more` : ""}
                  </div>
                )}
              </div>
            )}
            {!diffLoading && !diff && (
              <div style={{ fontSize: 12, color: colors.MUTED }}>Pick a mode to preview the changes.</div>
            )}
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <details open style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: colors.MUTED, cursor: "pointer", marginBottom: 8 }}>
            Unmatched ({unmatched.length})
          </summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 200, overflowY: "auto" }}>
            {unmatched.slice(0, 50).map((u, i) => (
              <li key={i} style={{
                fontSize: 12,
                padding: "4px 10px",
                color: colors.TEXT,
                borderBottom: `1px solid ${colors.LINE}`,
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span>{u.name}</span>
                <span style={{ color: colors.MUTED, fontSize: 11 }}>
                  {u.setCode && `${u.setCode} · `}line {u.sourceLineNumber}
                </span>
              </li>
            ))}
            {unmatched.length > 50 && (
              <li style={{ fontSize: 11, color: colors.MUTED, padding: "6px 10px" }}>
                ...and {unmatched.length - 50} more.
              </li>
            )}
          </ul>
        </details>
      )}

      {errors.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: colors.MUTED, cursor: "pointer", marginBottom: 8 }}>
            Parse errors ({errors.length})
          </summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 160, overflowY: "auto" }}>
            {errors.slice(0, 30).map((e, i) => (
              <li key={i} style={{
                fontSize: 12,
                padding: "4px 10px",
                color: colors.TEXT,
                borderBottom: `1px solid ${colors.LINE}`,
              }}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {matched.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: colors.MUTED, cursor: "pointer", marginBottom: 8 }}>
            Matched preview ({matched.length})
          </summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 200, overflowY: "auto" }}>
            {matched.slice(0, 50).map((m, i) => (
              <li key={i} style={{
                fontSize: 12,
                padding: "4px 10px",
                color: colors.TEXT,
                borderBottom: `1px solid ${colors.LINE}`,
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span>{m.row.name}</span>
                <span style={{ color: colors.MUTED, fontSize: 11 }}>
                  {m.row.setCode?.toUpperCase()} · ×{m.row.stacks[0]?.quantity || 1} {m.row.stacks[0]?.finish !== "nonfoil" ? `(${m.row.stacks[0]?.finish})` : ""}
                </span>
              </li>
            ))}
            {matched.length > 50 && (
              <li style={{ fontSize: 11, color: colors.MUTED, padding: "6px 10px" }}>
                ...and {matched.length - 50} more.
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <span style={{ color: "var(--ley-text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}{" "}
      </span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function errorBox(colors) {
  return {
    padding: "10px 12px",
    background: "var(--ley-red-dim)",
    border: `1px solid ${colors.RED}`,
    borderRadius: 4,
    color: colors.RED,
    fontSize: 12,
    marginTop: 12,
  };
}
