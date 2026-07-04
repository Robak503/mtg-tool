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

const MODES = [
  { id: "merge", label: "Merge", blurb: "Add the imported quantities to what you already own." },
  { id: "add-only", label: "Add only", blurb: "Add new cards/finishes; never change an existing quantity." },
  { id: "replace", label: "Replace", blurb: "Set each imported card to exactly the file's quantity." },
  { id: "reconcile", label: "Reconcile", blurb: "Make your collection match the file — also removes owned cards not in it." },
];

export default function CollectionImportModal({ onClose, onAdded, colors }) {
  const fileRef = useRef(null);
  const [phase, setPhase] = useState("pick"); // pick | preview | committing | done
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("merge");
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const pickFile = () => fileRef.current?.click();

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
            <PickPanel onPickFile={pickFile} colors={colors} />
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

function PickPanel({ onPickFile, colors }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📥</div>
      <div style={{ fontSize: 14, color: colors.TEXT, marginBottom: 8 }}>
        Import a CSV from Deckbox or Moxfield
      </div>
      <div style={{ fontSize: 12, color: colors.MUTED, marginBottom: 16, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 16px" }}>
        Both export formats are auto-detected. Cards matched to the bundled
        Scryfall data import directly; unmatched cards are listed for review.
      </div>
      <button onClick={onPickFile} className="btn btn-primary">
        Choose CSV file
      </button>
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
