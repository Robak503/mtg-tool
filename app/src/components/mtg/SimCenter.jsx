"use client";

/**
 * SimCenter — the dedicated, full-width "Sim Center" section (a top-level view,
 * like The Vault). It promotes the Pass-A self-play stress test out of the
 * Academy tab into a first-class section built to extract the MOST data from the
 * offline engine.
 *
 * Everything here is the REAL /api/self-play response — outcomes, breakages,
 * counts, and banked-training totals are never fabricated, and a failed/stuck run
 * surfaces honestly (the error box + the non-completion row in OutcomeSummary).
 * The engine runs entirely offline on the user's machine: no network, no AI.
 *
 * It reuses the pure presentational pieces from SelfPlayPanel (BreakageTable,
 * OutcomeSummary) so the result render stays in one place; what's new here is the
 * cross-profile grouped deck picker, the saved-report history, and the
 * bank-training-data toggle + cumulative stat.
 *
 * Backend surface (all offline, path-safe — see app/api/self-play/route.js):
 *   GET  /api/self-play                  → { decks: [{ id, name, profile }] }
 *   GET  /api/self-play?action=reports   → { reports: [{ file, savedAt, deckNames, games, breakages, mode }] }
 *   GET  /api/self-play?action=report&file=… → { file, report }
 *   GET  /api/self-play?action=stats     → { games, rows, files }
 *   POST /api/self-play                  → run; body { deckIds, mode, gamesPer, allProfiles, record }
 *
 * Props mirror the other center views' theme contract:
 *   colors      — { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD }
 *   cfg         — the active agent's color config (cfg.color / .border / .dim)
 *   fontFamily  — the active font
 */

import { useEffect, useMemo, useState } from "react";

import { BreakageTable, OutcomeSummary } from "./SelfPlayPanel";
import StabilityBadge from "./StabilityBadge";

const MODE_OPTIONS = [
  { value: "commander", label: "Commander 4P", blurb: "4-player pods (needs ≥4 decks; pads + flags otherwise)." },
  { value: "standard", label: "Standard 1v1", blurb: "Head-to-head pairings between the selected decks." },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "Run all pairings", blurb: "Every pod / head-to-head across the selected decks." },
  { value: "pod", label: "Just the selected pod", blurb: "Treat the picked decks as one table (a single pod)." },
];

/**
 * Group a flat [{id,name,profile}] picker list into [{ profile, decks[] }], ordered
 * alphabetically by profile. Exported so the grouping is unit-testable without
 * mounting the (fetch-driven) panel.
 */
export function groupByProfile(decks) {
  const groups = new Map();
  for (const d of decks) {
    const key = d.profile || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()]
    .map(([profile, list]) => ({ profile, decks: list }))
    .sort((a, b) => a.profile.localeCompare(b.profile));
}

export default function SimCenter({ cfg, colors, fontFamily }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;

  // ── Cross-profile deck picker ──
  const [decks, setDecks] = useState([]);
  const [decksLoad, setDecksLoad] = useState(true);
  const [decksError, setDecksError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Run config ──
  const [mode, setMode] = useState("commander");
  const [scope, setScope] = useState("all");
  const [gamesPer, setGamesPer] = useState(1);
  const [bankData, setBankData] = useState(false);

  // ── Run state ──
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // ── History + banked-data stat ──
  const [reports, setReports] = useState([]);
  const [reportsLoad, setReportsLoad] = useState(true);
  const [stats, setStats] = useState(null);
  const [viewing, setViewing] = useState(null); // { file, report } currently open

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => groupByProfile(decks), [decks]);
  const minDecks = mode === "commander" ? 4 : 2;
  const canRun = selectedIds.length >= minDecks && !running;

  // Load the cross-profile deck list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDecksLoad(true);
      setDecksError(null);
      try {
        const resp = await fetch("/api/self-play", { cache: "no-store" });
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok) {
          setDecksError(data?.error || `Could not load decks (status ${resp.status}).`);
        } else {
          setDecks(Array.isArray(data?.decks) ? data.decks : []);
        }
      } catch (e) {
        if (!cancelled) setDecksError(e?.message || "Could not load decks.");
      } finally {
        if (!cancelled) setDecksLoad(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshHistory = async () => {
    setReportsLoad(true);
    try {
      const [rResp, sResp] = await Promise.all([
        fetch("/api/self-play?action=reports", { cache: "no-store" }),
        fetch("/api/self-play?action=stats", { cache: "no-store" }),
      ]);
      const rData = await rResp.json().catch(() => ({}));
      const sData = await sResp.json().catch(() => ({}));
      if (rResp.ok) setReports(Array.isArray(rData?.reports) ? rData.reports : []);
      if (sResp.ok) setStats(sData);
    } catch {
      // history is best-effort — a failure leaves the prior list in place
    } finally {
      setReportsLoad(false);
    }
  };

  // Load history + banked-data stat on mount.
  useEffect(() => { refreshHistory(); }, []);

  const toggleDeck = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allSelected = decks.length > 0 && selectedIds.length === decks.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : decks.map((d) => d.id));

  const toggleProfile = (profileDecks) => {
    const ids = profileDecks.map((d) => d.id);
    const allOn = ids.every((id) => selectedSet.has(id));
    setSelectedIds((prev) => {
      if (allOn) return prev.filter((id) => !ids.includes(id));
      const merged = new Set(prev);
      ids.forEach((id) => merged.add(id));
      return [...merged];
    });
  };

  const runStressTest = async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/self-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckIds: selectedIds,
          mode,
          gamesPer,
          allProfiles: true, // the picker spans every profile, so resolve ids broadly
          record: bankData,
          // "pod" scope = treat the selection as a single table. The runner pods by
          // chunks of 4 / pairs all — sending exactly the pod size yields one table.
          scope,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        setError(data?.error || `Stress test failed (status ${resp.status}).`);
        return;
      }
      setResult(data);
      // A completed run wrote a new .txt (+ maybe a JSONL) — refresh both lists.
      refreshHistory();
    } catch (e) {
      setError(e?.message || "Stress test request failed.");
    } finally {
      setRunning(false);
    }
  };

  const downloadText = (body, name) => {
    if (!body) return;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || "self-play-report.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openReport = async (file) => {
    setViewing({ file, report: null, loading: true, error: null });
    try {
      const resp = await fetch(`/api/self-play?action=report&file=${encodeURIComponent(file)}`, { cache: "no-store" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setViewing({ file, report: null, loading: false, error: data?.error || `Could not open report (status ${resp.status}).` });
      } else {
        setViewing({ file, report: data.report, loading: false, error: null });
      }
    } catch (e) {
      setViewing({ file, report: null, loading: false, error: e?.message || "Could not open report." });
    }
  };

  // ── Shared style helpers ──
  const label = (text) => (
    <span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>{text}</span>
  );
  const card = (children, extra = {}) => (
    <div style={{ background: BG3, border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, ...extra }}>{children}</div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily, position: "relative" }}>
      {/* Header */}
      <header style={{ padding: "12px 20px", borderBottom: `1px solid ${LINE}`, background: BG2, backdropFilter: "blur(16px)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: TEXT, display: "inline-flex", alignItems: "center", gap: 9 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="7" r="1" />
          </svg>
          Sim Center
        </span>
        <StabilityBadge level="beta" title="Beta — offline self-play stress test + training-data capture" />
        <span style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>
          Runs entirely offline on your machine — 0 network, 0 AI.
        </span>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.55, margin: 0 }}>
            Run the engine against itself across your decks and pull the most data out of every game:
            a ranked list of cards the simulator can&rsquo;t fully model yet, honest non-completion
            signals, and an optional bank of per-turn training rows. Hand the report to Claude to drive
            coverage work.
          </p>

          {/* ── Deck picker (cross-profile, grouped) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {label(`Decks (${selectedIds.length} selected, across all profiles)`)}
              {decks.length > 0 && (
                <button type="button" onClick={toggleAll} style={ghostBtn(accent, LINE, fontFamily)}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            {decksLoad ? (
              <div style={mutedBox(MUTED, BG3, LINE)}>Loading decks from every profile…</div>
            ) : decksError ? (
              <div style={errorBox()}>⚠ {decksError}</div>
            ) : decks.length === 0 ? (
              <div style={mutedBox(MUTED, BG3, LINE)}>
                No saved decks in any profile yet — import a deck first, then come back to stress-test it.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {groups.map((g) => {
                  const ids = g.decks.map((d) => d.id);
                  const allOn = ids.every((id) => selectedSet.has(id));
                  return (
                    <div key={g.profile} style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: BG2, borderBottom: `1px solid ${LINE}` }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                          {g.profile} <span style={{ color: MUTED, fontWeight: 400 }}>· {g.decks.length} deck{g.decks.length === 1 ? "" : "s"}</span>
                        </span>
                        <button type="button" onClick={() => toggleProfile(g.decks)} style={ghostBtn(accent, LINE, fontFamily)}>
                          {allOn ? "Clear profile" : "Select all in profile"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 6, padding: 10 }}>
                        {g.decks.map((d) => {
                          const checked = selectedSet.has(d.id);
                          return (
                            <label
                              key={d.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                                border: `1px solid ${checked ? cfg?.border || accent : LINE}`,
                                background: checked ? cfg?.dim || BG2 : "transparent",
                                borderRadius: 6, cursor: "pointer", fontSize: 12, color: TEXT,
                              }}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleDeck(d.id)} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Run config ── */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {/* Format */}
            <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <legend style={{ padding: 0 }}>{label("Format")}</legend>
              {MODE_OPTIONS.map((opt) => (
                <label key={opt.value} style={radioCard(mode === opt.value, cfg, accent, LINE, BG2)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="sim-mode" value={opt.value} checked={mode === opt.value} onChange={(e) => setMode(e.target.value)} />
                    <strong style={{ color: accent, fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: MUTED, marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>

            {/* Scope */}
            <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <legend style={{ padding: 0 }}>{label("Pairings")}</legend>
              {SCOPE_OPTIONS.map((opt) => (
                <label key={opt.value} style={radioCard(scope === opt.value, cfg, accent, LINE, BG2)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="sim-scope" value={opt.value} checked={scope === opt.value} onChange={(e) => setScope(e.target.value)} />
                    <strong style={{ color: accent, fontSize: 13 }}>{opt.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: MUTED, marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
                </label>
              ))}
            </fieldset>
          </section>

          {/* Games-per + bank-data */}
          <section style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: MUTED }}>
              {label("Games per pairing")}
              <input
                type="number"
                min={1}
                max={20}
                value={gamesPer}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setGamesPer(Number.isFinite(n) && n > 0 ? n : 1);
                }}
                style={{ width: 64, padding: "6px 8px", background: BG2, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 6, fontSize: 13, fontFamily }}
              />
            </label>

            {gamesPer > 1 && (
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, maxWidth: 360 }}>
                ⓘ Each repeat shuffles the decks with a distinct seed, so every game plays out
                differently — more games means more coverage.
              </span>
            )}
          </section>

          {/* Bank training data toggle */}
          {card(
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={bankData} onChange={(e) => setBankData(e.target.checked)} />
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Bank training data from this run</span>
              </label>
              <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginLeft: 28 }}>
                Records a per-turn <code style={{ color: TEXT }}>state → eventual-win</code> trajectory for every
                game and saves it locally (JSONL) for the learn-to-play value model. Off by default.
              </span>
              <div style={{ marginLeft: 28, marginTop: 2, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: MUTED }}>
                <span>Banked runs: <strong style={{ color: accent }}>{stats?.games ?? (reportsLoad ? "…" : 0)}</strong></span>
                <span>Training rows banked: <strong style={{ color: accent }}>{stats?.rows ?? (reportsLoad ? "…" : 0)}</strong></span>
              </div>
            </div>
          )}

          {/* ── Run button ── */}
          <section style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runStressTest}
              disabled={!canRun}
              style={{
                padding: "11px 22px",
                background: canRun ? accent : LINE,
                color: canRun ? "#0c0b0a" : MUTED,
                border: "none", borderRadius: 8,
                cursor: canRun ? "pointer" : "not-allowed",
                fontSize: 14, fontWeight: 700, fontFamily,
                opacity: canRun ? 1 : 0.6,
              }}
            >
              {running ? "Running self-play…" : "Run simulation"}
            </button>
            {running && (
              <span style={{ fontSize: 12, color: MUTED }}>
                Each game takes ~3–5s and runs offline on your machine — hang tight while the batch finishes.
              </span>
            )}
            {!running && selectedIds.length > 0 && selectedIds.length < minDecks && (
              <span style={{ fontSize: 12, color: MUTED }}>
                Select at least {minDecks} decks for {mode === "commander" ? "a Commander pod" : "Standard pairings"}.
              </span>
            )}
          </section>

          {/* Error (honest surface) */}
          {error && <div style={errorBox()}>⚠ {error}</div>}

          {/* ── Result ── */}
          {result && (
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <OutcomeSummary outcomes={result.outcomes} avgTurns={result.avgTurns} games={result.games} colors={colors} />

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {label("Unmodeled / broken cards (ranked by frequency)")}
                <BreakageTable cards={result.breakages} colors={colors} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => downloadText(result.report, result.file || "self-play-report.txt")} style={outlineBtn(accent, cfg, fontFamily)}>
                  Download report (.txt)
                </button>
                {result.file ? (
                  <span style={{ fontSize: 11, color: MUTED }}>
                    Saved locally under AppData →{" "}
                    <code style={{ color: TEXT, background: BG3, padding: "1px 5px", borderRadius: 3 }}>data/self-play/{result.file}</code>
                  </span>
                ) : result.writeError ? (
                  <span style={{ fontSize: 11, color: "#e0a89a" }}>
                    ⚠ Couldn&rsquo;t save the report to disk ({result.writeError}) — use Download to keep it.
                  </span>
                ) : null}
              </div>

              {bankData && (
                <div style={{ fontSize: 11.5, color: result.trajectoryError ? "#e0a89a" : MUTED, lineHeight: 1.5 }}>
                  {result.trajectoryError
                    ? `⚠ Banking training data failed (${result.trajectoryError}).`
                    : result.trajectoryFile
                    ? `✓ Banked ${result.trajectoryRows ?? 0} training row${result.trajectoryRows === 1 ? "" : "s"} → data/self-play/trajectories/${result.trajectoryFile}.`
                    : "No labeled training rows to bank from this run (only completed games produce labels)."}
                </div>
              )}
            </section>
          )}

          {/* ── Saved-report history ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {label(`Saved reports (${reports.length})`)}
              <button type="button" onClick={refreshHistory} style={ghostBtn(accent, LINE, fontFamily)}>Refresh</button>
            </div>

            {reportsLoad && reports.length === 0 ? (
              <div style={mutedBox(MUTED, BG3, LINE)}>Loading saved reports…</div>
            ) : reports.length === 0 ? (
              <div style={mutedBox(MUTED, BG3, LINE)}>
                No saved reports yet — run a simulation and it&rsquo;ll appear here, click-to-re-view.
              </div>
            ) : (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                {reports.map((r, i) => (
                  <div
                    key={r.file}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                      background: i % 2 ? BG3 : "transparent",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.savedAt ? new Date(r.savedAt).toLocaleString() : r.file}
                        {r.mode ? <span style={{ color: MUTED }}> · {r.mode === "commander" ? "Commander" : "Standard"}</span> : null}
                      </span>
                      <span style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.deckNames?.length ? r.deckNames.join(", ") : "decks unknown"}
                        {r.games != null ? ` · ${r.games} game${r.games === 1 ? "" : "s"}` : ""}
                        {r.breakages != null ? ` · ${r.breakages} breakage${r.breakages === 1 ? "" : "s"}` : ""}
                      </span>
                    </div>
                    <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => openReport(r.file)} style={ghostBtn(accent, LINE, fontFamily)}>View</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Saved-report viewer (modal overlay) ── */}
      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewing(null)}
          style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(760px, 100%)", maxHeight: "100%", display: "flex", flexDirection: "column", background: BG2, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.file}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {viewing.report && (
                  <button type="button" onClick={() => downloadText(viewing.report, viewing.file)} style={ghostBtn(accent, LINE, fontFamily)}>Download</button>
                )}
                <button type="button" onClick={() => setViewing(null)} aria-label="Close" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {viewing.loading ? (
                <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>Opening report…</div>
              ) : viewing.error ? (
                <div style={errorBox()}>⚠ {viewing.error}</div>
              ) : (
                <pre style={{ margin: 0, fontSize: 11.5, color: TEXT, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono), Consolas, monospace" }}>{viewing.report}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Local style helpers (kept module-scoped so the JSX stays readable) ──
function ghostBtn(accent, LINE, fontFamily) {
  return { padding: "4px 10px", fontSize: 11, background: "transparent", color: accent, border: `1px solid ${LINE}`, borderRadius: 5, cursor: "pointer", fontFamily };
}
function outlineBtn(accent, cfg, fontFamily) {
  return { padding: "9px 16px", background: "transparent", color: accent, border: `1px solid ${cfg?.border || accent}`, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily };
}
function radioCard(on, cfg, accent, LINE, BG2) {
  return {
    display: "flex", flexDirection: "column", padding: "10px 12px",
    border: `1px solid ${on ? cfg?.border || accent : LINE}`,
    background: on ? cfg?.dim || BG2 : "transparent",
    borderRadius: 6, cursor: "pointer",
  };
}
function mutedBox(MUTED, BG3, LINE) {
  return { fontSize: 12, color: MUTED, fontStyle: "italic", padding: "8px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6 };
}
function errorBox() {
  return { padding: "10px 12px", background: "#2a1414", border: "1px solid #6b3a3a", color: "#e0a89a", borderRadius: 6, fontSize: 12.5, lineHeight: 1.5 };
}
