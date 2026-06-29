"use client";

/**
 * SelfPlayPanel — the in-EXE front-end over the Pass-A self-play backend
 * (POST /api/self-play). The user multi-selects saved decks, picks a mode
 * (Commander / Standard) and an optional games count, hits "Run stress test",
 * and the server runs an OFFLINE self-play batch (no network, no model calls)
 * and returns the engine's honest outcome tally + a ranked breakage list.
 *
 * CREED: everything shown here is the REAL API response. We never fabricate
 * outcomes or breakages, and we surface a failed/stuck run honestly (the error
 * box) rather than hiding it. The breakage list is the engine's own signals.
 *
 * Props mirror LearnView's so it slots into the Academy with the same theme:
 *   savedDecks  — useDeckStore's deck library [{ id, name, cards }]
 *   cfg         — the active agent's color config (cfg.color / .border / .dim)
 *   colors      — { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD }
 *   fontFamily  — the active font
 *
 * The shape we render comes straight from /api/self-play's JSON:
 *   { ok, mode, deckNames, games, outcomes, avgTurns, breakages, report, file,
 *     writeError? }
 * where `breakages` is breakageReport.aggregateBreakages().cards —
 *   [{ card, count, kinds:{kind:n}, sampleReason, sampleTurn }] (ranked).
 */

import { useMemo, useState } from "react";

import StabilityBadge from "./StabilityBadge";

const MODE_OPTIONS = [
  { value: "commander", label: "Commander 4P", blurb: "4-player pods (needs ≥4 decks; pads + flags otherwise)." },
  { value: "standard", label: "Standard 1v1", blurb: "Head-to-head pairings between the selected decks." },
];

/**
 * BreakageTable — pure presentational render of the ranked breakage list.
 * Exported so it can be unit-tested in isolation without mounting the whole
 * panel (the panel's data comes from a live fetch). `cards` is the API's
 * `breakages` array verbatim.
 */
export function BreakageTable({ cards, colors }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const list = Array.isArray(cards) ? cards : [];

  if (list.length === 0) {
    return (
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, padding: "8px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6 }}>
        No unmodeled / broken cards — no spell-unresolved, stack-resolve-error, or
        trigger-removed entries appeared in any game&rsquo;s log. Either every card
        resolved natively, or the decks played out without reaching them.
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 56px 1fr",
          gap: 8,
          padding: "7px 10px",
          background: BG2,
          borderBottom: `1px solid ${LINE}`,
          fontSize: 10,
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>Card</span>
        <span style={{ textAlign: "right" }}>Count</span>
        <span>Kinds · sample</span>
      </div>
      {list.map((c, i) => {
        const kinds = Object.entries(c.kinds || {})
          .map(([k, n]) => `${k}×${n}`)
          .join(", ");
        return (
          <div
            key={`${c.card}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 56px 1fr",
              gap: 8,
              padding: "7px 10px",
              borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
              background: i % 2 ? BG3 : "transparent",
              fontSize: 11,
              color: TEXT,
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 600 }}>{c.card}</span>
            <span style={{ textAlign: "right", color: GOLD, fontWeight: 700 }}>{c.count}</span>
            <span style={{ color: MUTED }}>
              {kinds}
              {c.sampleReason ? (
                <span style={{ display: "block", marginTop: 2, opacity: 0.85 }}>
                  ↳ {c.sampleReason}
                  {c.sampleTurn != null ? ` (turn ${c.sampleTurn})` : ""}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * OutcomeSummary — pure render of the outcome tally + avg turns. Honest about
 * non-completions (engine-stuck / dispatch-error / setup-error): they're shown
 * in a distinct warning row, never folded into draws.
 */
export function OutcomeSummary({ outcomes, avgTurns, games, colors }) {
  const { BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const o = outcomes || {};
  const nonCompletions =
    (o.engineStuck || 0) + (o.dispatchError || 0) + (o.setupError || 0) + (o.unexpected || 0);

  const stat = (label, value, accent) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 78 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: accent || TEXT, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );

  return (
    <div style={{ background: BG3, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {stat("Games", games ?? o.total ?? 0, GOLD)}
        {stat("Completed", `${o.completed ?? 0}/${o.total ?? 0}`)}
        {stat("Seat-1 wins", o.userWins ?? 0)}
        {stat("Opp wins", o.aiWins ?? 0)}
        {stat("Draws", o.draws ?? 0)}
        {stat("Avg turns", avgTurns ? Number(avgTurns).toFixed(1) : "0")}
      </div>
      {nonCompletions > 0 && (
        <div style={{ fontSize: 11, color: "#e0a89a", lineHeight: 1.5, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
          ⚠ {nonCompletions} game{nonCompletions === 1 ? "" : "s"} did not complete (reported honestly):{" "}
          {[
            o.engineStuck ? `engine-stuck ×${o.engineStuck}` : null,
            o.dispatchError ? `dispatch-error ×${o.dispatchError}` : null,
            o.setupError ? `setup-error ×${o.setupError}` : null,
            o.unexpected ? `unexpected ×${o.unexpected}` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </div>
      )}
    </div>
  );
}

export default function SelfPlayPanel({ savedDecks = [], cfg, colors, fontFamily }) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors || {};
  const accent = cfg?.color || GOLD;

  const [mode, setMode] = useState("commander");
  const [selectedIds, setSelectedIds] = useState([]);
  const [gamesPer, setGamesPer] = useState(1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = savedDecks.length > 0 && selectedIds.length === savedDecks.length;
  const minDecks = mode === "commander" ? 4 : 2;
  const canRun = selectedIds.length >= minDecks && !running;

  const toggleDeck = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : savedDecks.map((d) => d.id));

  const runStressTest = async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/self-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // allProfiles: the 13-deck set can span two profiles; let the route
        // resolve ids across all of them so cross-profile selections still run.
        body: JSON.stringify({ deckIds: selectedIds, mode, gamesPer, allProfiles: true }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        setError(data?.error || `Stress test failed (status ${resp.status}).`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e?.message || "Stress test request failed.");
    } finally {
      setRunning(false);
    }
  };

  const downloadReport = () => {
    if (!result?.report) return;
    const url = URL.createObjectURL(new Blob([result.report], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.file || "self-play-report.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <strong style={{ color: accent, fontSize: 14 }}>Self-Play Stress Test</strong>
          <StabilityBadge level="beta" title="Beta — offline self-play breakage report" />
        </span>
        <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, margin: 0 }}>
          Run the engine against itself over your decks and get a ranked list of
          cards the simulator can&rsquo;t fully model yet. This runs{" "}
          <strong style={{ color: TEXT }}>entirely offline on your machine</strong> — no
          network calls, no AI. Hand the report to Claude to drive coverage work.
        </p>
      </div>

      {/* Deck multi-select */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Decks ({selectedIds.length} selected)
          </span>
          {savedDecks.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "transparent",
                color: accent,
                border: `1px solid ${LINE}`,
                borderRadius: 5,
                cursor: "pointer",
                fontFamily,
              }}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        {savedDecks.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", padding: "8px 10px", background: BG3, border: `1px solid ${LINE}`, borderRadius: 6 }}>
            No saved decks yet — import a deck first, then come back to stress-test it.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
            {savedDecks.map((d) => {
              const checked = selectedSet.has(d.id);
              return (
                <label
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    border: `1px solid ${checked ? cfg?.border || accent : LINE}`,
                    background: checked ? cfg?.dim || BG2 : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    color: TEXT,
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleDeck(d.id)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Mode + games count */}
      <fieldset style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", padding: 0, gridColumn: "1 / -1" }}>
          Format
        </legend>
        {MODE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 12px",
              border: `1px solid ${mode === opt.value ? cfg?.border || accent : LINE}`,
              background: mode === opt.value ? cfg?.dim || BG2 : "transparent",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name="self-play-mode" value={opt.value} checked={mode === opt.value} onChange={(e) => setMode(e.target.value)} />
              <strong style={{ color: accent, fontSize: 13 }}>{opt.label}</strong>
            </span>
            <span style={{ fontSize: 11, color: MUTED, marginLeft: 26, marginTop: 2 }}>{opt.blurb}</span>
          </label>
        ))}
      </fieldset>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: MUTED }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 }}>Games per pairing</span>
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

      {/* Run button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={runStressTest}
          disabled={!canRun}
          style={{
            padding: "10px 18px",
            background: canRun ? accent : LINE,
            color: canRun ? "#0c0b0a" : MUTED,
            border: "none",
            borderRadius: 6,
            cursor: canRun ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 600,
            fontFamily,
            opacity: canRun ? 1 : 0.6,
          }}
        >
          {running ? "Running self-play…" : "Run stress test"}
        </button>
        {running && (
          <span style={{ fontSize: 12, color: MUTED }}>
            Each game takes ~3–5s and runs offline on your machine — hang tight.
          </span>
        )}
        {!running && selectedIds.length > 0 && selectedIds.length < minDecks && (
          <span style={{ fontSize: 12, color: MUTED }}>
            Select at least {minDecks} decks for {mode === "commander" ? "a Commander pod" : "Standard pairings"}.
          </span>
        )}
      </div>

      {/* Error (honest surface — never hidden) */}
      {error && (
        <div style={{ padding: "10px 12px", background: "#2a1414", border: "1px solid #6b3a3a", color: "#e0a89a", borderRadius: 6, fontSize: 12.5, lineHeight: 1.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <OutcomeSummary outcomes={result.outcomes} avgTurns={result.avgTurns} games={result.games} colors={colors} />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Unmodeled / broken cards (ranked by frequency)
            </span>
            <BreakageTable cards={result.breakages} colors={colors} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={downloadReport}
              style={{
                padding: "9px 16px",
                background: "transparent",
                color: accent,
                border: `1px solid ${cfg?.border || accent}`,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily,
              }}
            >
              Download report (.txt)
            </button>
            {result.file ? (
              <span style={{ fontSize: 11, color: MUTED }}>
                Saved on your machine under AppData →{" "}
                <code style={{ color: TEXT, background: BG3, padding: "1px 5px", borderRadius: 3 }}>data/self-play/{result.file}</code>
              </span>
            ) : result.writeError ? (
              <span style={{ fontSize: 11, color: "#e0a89a" }}>
                ⚠ Couldn&rsquo;t save the report to disk ({result.writeError}) — use Download to keep it.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
