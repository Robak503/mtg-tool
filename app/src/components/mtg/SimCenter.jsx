"use client";

/**
 * SimCenter — the dedicated, full-width "Sim Center" section (a top-level view,
 * like The Vault), rebuilt to the LEYLINE glass mock: stat tiles + roster canvas
 * on the left, the run-control rail on the right, a live-grind panel + standings
 * board while the engine plays, and the freshness "confession" box at the bottom.
 *
 * Everything here is the REAL /api/self-play + /api/grind response — outcomes,
 * breakages, counts, standings and banked-training totals are never fabricated,
 * and a failed/stuck run surfaces honestly (the error box + the non-completion
 * row in OutcomeSummary). The engine runs entirely offline on the user's
 * machine: no network, no AI.
 *
 * It reuses the pure presentational pieces from SelfPlayPanel (BreakageTable,
 * OutcomeSummary) so the result render stays in one place; what's new in this
 * pass is the roster (search / grid⇄list / profile filter pills), the GAMES
 * segmented control (∞ = the grind loop), and the /api/health freshness
 * contract: the page polls the server's identity and compares it against the
 * identity its deck list was loaded under (plus the shell's own version inside
 * the .exe) — any drift flips the green box amber and disables Run. Stale can
 * render; it cannot launch.
 *
 * Backend surface (all offline, path-safe — see app/api/self-play/route.js):
 *   GET  /api/self-play                  → { decks: [{ id, name, profile }] }
 *   GET  /api/self-play?action=reports   → { reports: [{ file, savedAt, deckNames, games, breakages, mode }] }
 *   GET  /api/self-play?action=report&file=… → { file, report }
 *   GET  /api/self-play?action=stats     → { games, rows, files }
 *   POST /api/self-play                  → run; body { deckIds, mode, gamesPer, allProfiles, record, scope }
 *   GET  /api/grind                      → live status; ?results=1 adds the standings summary
 *   POST /api/grind                      → { action: "start" | "cancel" }
 *   GET  /api/health                     → { version, registryId, activeProfile, now } (freshness)
 *
 * Props mirror the other center views' theme contract:
 *   colors      — { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD }
 *   cfg         — the active agent's color config (cfg.color / .border / .dim)
 *   fontFamily  — the active font
 */

import { useEffect, useMemo, useState } from "react";

import useTauriAppVersion from "../../hooks/useTauriAppVersion";
import { BreakageTable, OutcomeSummary, SeatSummaryTables } from "./SelfPlayPanel";
import StabilityBadge from "./StabilityBadge";

const MODE_OPTIONS = [
  { value: "commander", label: "Commander 4P", blurb: "4-player pods (needs ≥4 decks; pads + flags otherwise)." },
  { value: "standard", label: "Standard 1v1", blurb: "Head-to-head pairings between the selected decks." },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "Run all pairings", blurb: "Every pod / head-to-head across the selected decks." },
  { value: "pod", label: "Just the selected pod", blurb: "Treat the picked decks as one table (a single pod)." },
];

// Games-per-pairing presets. The server clamps gamesPer at 50 (R2.7: the one-shot
// route is synchronous on the request thread), so the mock's ×100/×1000 stops are
// NOT offered — they'd silently run 50. Bulk collection is the ∞ grind's job.
const GAMES_OPTIONS = [1, 5, 25, 50];

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

/** "52m" / "4h 12m" / "38s" — for grind uptime + fetched-ago stamps. */
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function SimCenter({ cfg, colors, fontFamily , initialSelection = null, onConsumeInitialSelection }) {
  const accent = cfg?.color || "var(--ley-green)";

  // ── Cross-profile deck picker ──
  const [decks, setDecks] = useState([]);
  const [decksLoad, setDecksLoad] = useState(true);
  const [decksError, setDecksError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Roster view controls (presentation only — selection stays id-based) ──
  const [view, setView] = useState("grid"); // "grid" | "list"
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState([]); // empty = show every profile

  // ── Run config ──
  const [mode, setMode] = useState("commander");
  const [scope, setScope] = useState("all");
  const [gamesPer, setGamesPer] = useState(1);
  const [endless, setEndless] = useState(false); // the GAMES seg's ∞ stop — Run becomes the grind
  const [bankData, setBankData] = useState(false);
  // PILOT PANEL (Omnath seam): the selected persona filename ("" = default autopilot) + the list of persona
  // .mjs modules in pilotsDir(), fetched from /api/pilots. Injecting a persona makes self-play persona-driven;
  // Omnath drops/edits files in the pilots dir and they appear here — no rebuild.
  const [pilot, setPilot] = useState("");
  const [availablePilots, setAvailablePilots] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/pilots")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d?.pilots) ? d.pilots : [];
        setAvailablePilots(list);
        // Selection defaults to "" = Default AI (no persona); the user opts INTO a shipped persona
        // explicitly. (Was: auto-prefer a pilot literally named "omnath" — Colton's call is no omnath
        // default and no silent auto-persona on the walk-away grind.)
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Seed from a cross-surface handoff (Pod Balance's "Run this pod here"),
  // consumed exactly once so later manual edits stick.
  useEffect(() => {
    if (!initialSelection) return;
    if (Array.isArray(initialSelection.deckIds) && initialSelection.deckIds.length) {
      setSelectedIds(initialSelection.deckIds);
    }
    if (initialSelection.scope) setScope(initialSelection.scope);
    if (initialSelection.mode) setMode(initialSelection.mode);
    onConsumeInitialSelection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection]);

  // ── Run state ──
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // ── Freshness confession (/api/health) ── the page keeps two snapshots: the LATEST
  // health payload, and the BASELINE captured when the deck list last loaded. Any drift
  // between them (registry changed on disk, active profile switched, server swapped) —
  // or a dead health endpoint, or server ≠ shell inside the .exe — marks the page stale.
  const shellVersion = useTauriAppVersion(); // the .exe's own version; null in a plain browser
  const [health, setHealth] = useState(null); // last payload + fetchedAt
  const [healthFailed, setHealthFailed] = useState(false);
  const [healthBase, setHealthBase] = useState(null); // identity the CURRENT deck list loaded under
  const fetchHealth = async ({ baseline = false } = {}) => {
    try {
      const resp = await fetch("/api/health", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const snap = { ...data, fetchedAt: Date.now() };
      setHealth(snap);
      setHealthFailed(false);
      if (baseline) setHealthBase(snap);
    } catch {
      setHealthFailed(true); // surfaced below: flips the box amber + kills the Run button
    }
  };
  // 30s freshness cadence (mount + focus fetches ride the deck load below).
  useEffect(() => {
    const id = setInterval(() => { fetchHealth(); }, 30000);
    return () => clearInterval(id);
  }, []);

  const staleReasons = useMemo(() => {
    const reasons = [];
    if (healthFailed) reasons.push("health check unreachable");
    if (health?.registryError) reasons.push(`registry: ${health.registryError}`);
    if (shellVersion && health?.version && health.version !== shellVersion) {
      reasons.push(`server v${health.version} ≠ shell v${shellVersion}`);
    }
    if (health && healthBase) {
      if (health.registryId !== healthBase.registryId) reasons.push("profile registry changed on disk since decks loaded");
      if ((health.activeProfile?.id ?? null) !== (healthBase.activeProfile?.id ?? null)) reasons.push("active profile switched since decks loaded");
      if (health.version !== healthBase.version) reasons.push("server changed underneath the page");
    }
    return reasons;
  }, [health, healthBase, healthFailed, shellVersion]);
  const stale = staleReasons.length > 0;

  // ── Grind pod pool (SIM-INTEGRITY Phase 3): cedh decks (Rograkh/Thrasios, Kinnan) never sit
  // in mixed pods — pods form within ONE pool and records carry the tag.
  const [grindPool, setGrindPool] = useState("mixed");
  // ── Grind (run-until-cancel) state ── polled from /api/grind (a background singleton loop).
  const [grind, setGrind] = useState(null);
  useEffect(() => {
    let alive = true;
    const poll = () => fetch("/api/grind").then((r) => r.json()).then((s) => { if (alive) setGrind(s); }).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const grindRunning = !!grind?.running;

  // ── Grind RESULTS (standings) ── the saved-game readout: per-deck W/L, winner split, totals. Summarizing
  // reads every header, so we fetch it on mount, on a manual refresh, and only every 8s WHILE grinding (not the
  // 2s status cadence) — then once more right after a grind stops, to capture the final tally.
  const [grindResults, setGrindResults] = useState(null);
  const [grindResultsLoading, setGrindResultsLoading] = useState(false);
  const loadGrindResults = async () => {
    setGrindResultsLoading(true);
    try {
      const r = await fetch("/api/grind?results=1", { cache: "no-store" });
      const j = await r.json();
      setGrindResults(j?.results ?? null);
    } catch {
      /* leave prior results in place */
    } finally {
      setGrindResultsLoading(false);
    }
  };
  useEffect(() => { loadGrindResults(); }, []);
  useEffect(() => {
    if (!grindRunning) return undefined;
    const id = setInterval(loadGrindResults, 8000);
    // one more refresh shortly after the loop stops (cleanup runs on the running→stopped transition)
    return () => { clearInterval(id); setTimeout(loadGrindResults, 1500); };
  }, [grindRunning]);

  // ── History + banked-data stat ──
  const [reports, setReports] = useState([]);
  const [reportsLoad, setReportsLoad] = useState(true);
  const [stats, setStats] = useState(null);
  const [viewing, setViewing] = useState(null); // { file, report } currently open

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => groupByProfile(decks), [decks]);
  const minDecks = mode === "commander" ? 4 : 2;
  const canRun = selectedIds.length >= minDecks && !running;
  // The Grind button is walk-away "gain as much data as we can" mode — it does NOT
  // require a manual selection. As long as at least a pod's worth of decks EXISTS it
  // grinds the WHOLE shelf in random balanced pods; a selection of >= minDecks just
  // narrows it to that subset. (canRun above still gates the one-shot Run button,
  // which needs an explicit matchup.)
  const grindReady = decks.length >= minDecks && !running;

  // Roster filter: search over name + profile, then the profile pills.
  const visibleDecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decks.filter((d) => {
      const prof = d.profile || "Unknown";
      if (profileFilter.length && !profileFilter.includes(prof)) return false;
      if (q && !(d.name || "").toLowerCase().includes(q) && !prof.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [decks, query, profileFilter]);

  // Load the cross-profile deck list once on mount.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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
          // Re-baseline the freshness contract: THIS is the identity the roster loaded under.
          fetchHealth({ baseline: true });
        }
      } catch (e) {
        if (!cancelled) setDecksError(e?.message || "Could not load decks.");
      } finally {
        if (!cancelled) setDecksLoad(false);
      }
    };
    load();
    // TRAY-STALENESS fix (GHOST-REGISTRY incident, 2026-07-10): the window hides to the tray, so this
    // panel's deck/profile groups can be DAYS old when re-shown — refresh on visibility/focus so the
    // labels always reflect the live registry (the "my decks show under the wrong profile" report).
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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

  const toggleProfileFilter = (profile) =>
    setProfileFilter((prev) => (prev.includes(profile) ? prev.filter((p) => p !== profile) : [...prev, profile]));

  const runStressTest = async () => {
    if (!canRun || stale) return; // stale can render, not launch
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
          pilot: pilot || undefined, // PILOT PANEL: the selected persona filename ("" ⇒ omitted ⇒ default AI)
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

  // GRIND (run-until-cancel): kick off the background loop; it plays random balanced pods with the selected
  // persona, appending one file per game, until Stop (finishes the in-flight game) or the disk cap.
  const startGrind = async () => {
    if (stale) return; // stale can render, not launch
    setError(null);
    try {
      const resp = await fetch("/api/grind", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // No explicit selection (or fewer than a pod) → grind the WHOLE shelf; a real selection narrows it.
        body: JSON.stringify({ action: "start", deckIds: selectedIds.length >= minDecks ? selectedIds : [], mode, allProfiles: true, pilot: pilot || undefined, pool: grindPool }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.started === false) setError(data?.reason || data?.error || `Grind failed to start (status ${resp.status}).`);
      setGrind(data);
    } catch (e) {
      setError(e?.message || "Grind request failed.");
    }
  };
  const stopGrind = async () => {
    try {
      const resp = await fetch("/api/grind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      setGrind(await resp.json().catch(() => grind));
    } catch { /* ignore — the poll will reconcile */ }
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

  // ── Derived live-grind numbers (real fields only: gamesPlayed + uptimeMs from /api/grind) ──
  const uptimeMs = grind?.uptimeMs ?? 0;
  const gamesPerMin = grindRunning && uptimeMs > 0 && grind?.gamesPlayed > 0
    ? grind.gamesPlayed / (uptimeMs / 60000)
    : null; // only while running — startedAt keeps aging after a stop, so the ratio would rot
  // Standings, sorted by win % (the API sorts by games; the board leads with the winners).
  const standingsRows = useMemo(
    () => (grindResults?.decks ? [...grindResults.decks].sort((a, b) => b.winRate - a.winRate) : []),
    [grindResults],
  );
  const maxWinRate = standingsRows.reduce((m, d) => Math.max(m, d.winRate), 0);
  const healthAgo = health ? fmtDuration(Date.now() - health.fetchedAt) : null;

  // ── Shared style helpers ──
  const label = (text) => (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{text}</span>
  );
  const seg = (options, isOn, onPick) => (
    <div className="ley-seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`ley-seg-opt${isOn(o.value) ? " on" : ""}`}
          onClick={() => onPick(o.value)}
          title={o.blurb || undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  const tile = (lab, big, sub, bigStyle = {}) => (
    <div className="ley-glass" style={{ padding: "11px 14px 12px", minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ley-text-faint)", textTransform: "uppercase" }}>{lab}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 25, fontWeight: 650, color: "var(--ley-green-text)", marginTop: 2, fontVariantNumeric: "tabular-nums", ...bigStyle }}>{big}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div> : null}
    </div>
  );
  const qrow = (k, v, vColor) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--ley-text-faint)", padding: "2px 0" }}>
      <span>{k}</span>
      <strong style={{ color: vColor || "var(--ley-text)", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</strong>
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily, position: "relative" }}>
      {/* Header — title + freshness pill (the confession, at a glance) */}
      <header
        className="ley-glass"
        style={{ padding: "12px 20px", borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--ley-text)", display: "inline-flex", alignItems: "center", gap: 9 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="7" r="1" />
          </svg>
          Sim Center
        </span>
        <StabilityBadge level="beta" title="Beta — offline self-play stress test + training-data capture" />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ley-text-faint)" }}>
          Runs entirely offline on your machine — 0 network, 0 AI.
        </span>
        <span
          title={stale ? staleReasons.join(" · ") : "Server identity — version · profile-registry hash · fetched"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: stale ? "var(--ley-gold)" : "var(--ley-text-faint)",
            border: `1px solid ${stale ? "var(--ley-gold)" : "rgba(57, 245, 126, 0.35)"}`,
            borderRadius: "var(--r-pill)", padding: "5px 11px",
            background: stale ? "var(--ley-gold-dim)" : "var(--ley-green-faint)",
          }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: stale ? "var(--ley-gold)" : "var(--ley-green-bright)" }} />
          {stale
            ? "stale — restart to repair"
            : health
            ? `v${health.version}${shellVersion && health.version === shellVersion ? " = shell" : ""} · reg ${health.registryId ?? "—"} · ${healthAgo}`
            : "checking…"}
        </span>
      </header>

      {/* Body — canvas (tiles + roster + standings + confession) | run rail */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 14, alignItems: "start" }}>
          {/* ══ CANVAS ══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* ── Stat tiles (all real: picker count, selection, banked totals, grind state) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {tile("Decks", decksLoad ? "…" : decks.length, `${groups.length} profile${groups.length === 1 ? "" : "s"}`)}
              {tile("Selected", selectedIds.length, `min ${minDecks} for ${mode === "commander" ? "a pod" : "a pairing"}`)}
              {/* C2 (road-to-1.0): lead with the GRIND STORE's real game count — this tile used to read
                  only trajectory-export files, so a 40k-game grind honestly-but-misleadingly showed 0. */}
              {tile("Games banked", stats?.grindGames ?? (reportsLoad ? "…" : 0), `${stats?.rows ?? 0} training rows · ${stats?.files ?? 0} exports`)}
              {tile(
                "Grind",
                grindRunning ? "LIVE" : grindReady ? "READY" : "—",
                grind?.gamesPlayed > 0 ? `${grind.gamesPlayed} games this session` : "run until cancelled",
                { fontSize: 17, paddingTop: 5, color: grindRunning ? "var(--ley-green-bright)" : grindReady ? "var(--ley-green)" : "var(--ley-text-faint)" },
              )}
            </div>

            {/* ── Live Grind (only while the loop plays — glow means games running) ── */}
            {grindRunning && (
              <section className="ley-glass" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, borderColor: "rgba(57, 245, 126, 0.45)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className="ley-live" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ley-green-bright)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 13.5, fontWeight: 650, color: "var(--ley-text)" }}>Live Grind</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-green)" }}>● LIVE · {fmtDuration(uptimeMs)}</span>
                </div>
                {qrow("games", `${grind.gamesPlayed}${grind.gamesTrusted != null ? ` (${grind.gamesTrusted} trusted)` : ""}${grind.gamesStuck > 0 ? ` · ${grind.gamesStuck} stuck` : ""}`)}
                {grind.pool ? qrow("pool", grind.pool === "cedh" ? "cEDH" : "mixed") : null}
                {gamesPerMin != null ? qrow("throughput", `${gamesPerMin.toFixed(1)} games/min`) : null}
                {grind.lastResult ? qrow("last result", grind.lastResult) : null}
                {/* No target exists on the grind API — the meter is honestly endless (indeterminate). */}
                <span className="ley-gel-live" style={{ marginTop: 4 }}>
                  <progress className="ley-gel" aria-label="Endless grind running" />
                </span>
                {grind.capReached && <span style={{ fontSize: 11, color: "var(--ley-gold)" }}>⚠ disk cap reached — paused</span>}
                {grind.error && <span style={{ fontSize: 11, color: "var(--ley-red)" }}>⚠ {grind.error}</span>}
              </section>
            )}

            {/* ── Live standings (real banked games — shown whenever any exist) ── */}
            {grindResults && grindResults.games > 0 && (
              <section className="ley-glass" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 13.5, fontWeight: 650, color: "var(--ley-text)" }}>Live standings</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ley-text-faint)" }}>
                    {grindResults.games.toLocaleString()} games logged · sorted by win %
                  </span>
                  <button type="button" onClick={loadGrindResults} disabled={grindResultsLoading} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
                    {grindResultsLoading ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--ley-text-faint)", lineHeight: 1.6 }}>
                  avg {grindResults.avgTurns.toFixed(1)} player-turns (~{(grindResults.avgTurns / 4).toFixed(1)} rounds)/game · seat wins {Object.entries(grindResults.winnerSeats).map(([s, n]) => `${s} ${n}`).join(" · ")}
                  {grindResults.engineVersions?.length ? ` · engine ${grindResults.engineVersions.join(", ")}` : ""}
                  {grindResults.personas?.length ? <><br />personas: {grindResults.personas.join(", ")}</> : null}
                </div>
                {grindResults.legacyGames > 0 && (
                  <div style={{ fontSize: 11, color: "var(--ley-gold)", lineHeight: 1.5 }}>
                    ⚠ Standings below use <strong>{grindResults.withDeckAttribution.toLocaleString()}</strong> verified games —{" "}
                    {grindResults.legacyGames.toLocaleString()} older games are excluded (recorded before the win-detection fix; their
                    “winners” aren’t trustworthy).
                  </div>
                )}
                {standingsRows.length > 0 ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 52px 44px minmax(120px, 170px)", gap: 10, padding: "4px 4px 6px", borderBottom: "1px solid var(--ley-line-bright)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--ley-text-faint)", textTransform: "uppercase" }}>
                      <span>Deck</span><span style={{ textAlign: "right" }}>Games</span><span style={{ textAlign: "right" }}>Wins</span><span>Win %</span>
                    </div>
                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                      {standingsRows.map((d) => {
                        // Seat-spread honesty flag (Phase 1): if any seat's share of this deck's WINS
                        // deviates >15pts from its share of the deck's GAMES, the pooled number is
                        // position-inflected — surface it instead of letting the % read as pure deck skill.
                        const seatTotal = Object.values(d.seats || {}).reduce((a, b) => a + b, 0);
                        const skewed = seatTotal > 0 && d.wins >= 8 && Object.keys(d.seats || {}).some((s) => {
                          const gShare = (d.seats[s] || 0) / seatTotal;
                          const wShare = (d.seatWins?.[s] || 0) / Math.max(1, d.wins);
                          return Math.abs(wShare - gShare) > 0.15;
                        });
                        return (
                          <div key={d.id || d.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 52px 44px minmax(120px, 170px)", gap: 10, alignItems: "center", padding: "7px 4px", borderBottom: "1px solid var(--ley-line)", fontSize: 12.5 }}>
                            <span style={{ fontWeight: 600, color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.name || d.id}
                              {skewed && <span title="Seat-position skew >15pts — this deck's wins cluster in specific seats; treat the pooled % with care" style={{ color: "var(--ley-gold)", marginLeft: 4 }}>⚠</span>}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ley-green-text)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.games}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ley-green-text)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.wins}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 9 }} title={d.ci95 ? `95% CI ${(d.ci95[0] * 100).toFixed(0)}–${(d.ci95[1] * 100).toFixed(0)}%` : undefined}>
                              <span style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--ley-surface-1)", overflow: "hidden" }}>
                                <span style={{ display: "block", height: "100%", width: `${maxWinRate > 0 ? (d.winRate / maxWinRate) * 100 : 0}%`, background: "linear-gradient(90deg, var(--ley-green-deep), var(--ley-green))" }} />
                              </span>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ley-green-bright)", minWidth: 44, textAlign: "right" }}>{(d.winRate * 100).toFixed(1)}%</strong>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--ley-text-faint)" }}>Per-deck standings appear once games are logged with deck attribution (new games).</div>
                )}
                {grindResults.withDeckAttribution < grindResults.games && (
                  <div style={{ fontSize: 10, color: "var(--ley-text-faint)" }}>
                    {grindResults.games - grindResults.withDeckAttribution} older game(s) are in the totals but predate per-deck tagging.
                  </div>
                )}
              </section>
            )}

            {/* ── Roster (search + grid⇄list + profile pills; selection via checkboxes) ── */}
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="⌕ commander, profile, name…"
                  aria-label="Search decks"
                  style={{ flex: 1, minWidth: 160, maxWidth: 320, padding: "7px 12px", background: "var(--ley-surface-1)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                />
                {decks.length > 0 && (
                  <button type="button" onClick={toggleAll} className="btn btn-ghost btn-sm">
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                )}
                <span style={{ flex: 1 }} />
                {seg(
                  [{ value: "grid", label: "▦ Grid" }, { value: "list", label: "☰ List" }],
                  (v) => view === v,
                  setView,
                )}
              </div>

              {decksLoad ? (
                <div style={mutedBox()}>Loading decks from every profile…</div>
              ) : decksError ? (
                <div style={errorBox()}>⚠ {decksError}</div>
              ) : decks.length === 0 ? (
                <div style={mutedBox()}>
                  No saved decks in any profile yet — import a deck first, then come back to stress-test it.
                </div>
              ) : visibleDecks.length === 0 ? (
                <div style={mutedBox()}>No decks match the current search / profile filter.</div>
              ) : view === "grid" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                  {visibleDecks.map((d) => {
                    const checked = selectedSet.has(d.id);
                    return (
                      <label
                        key={d.id}
                        className="ley-card"
                        style={{
                          display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", minWidth: 0,
                          border: `1px solid ${checked ? "var(--ley-line-bright)" : "var(--ley-line)"}`,
                          background: checked ? "var(--ley-green-dim)" : "var(--ley-surface-1)",
                          borderRadius: "var(--r-md)", cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleDeck(d.id)} />
                          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-green-text)", border: "1px solid var(--ley-line)", borderRadius: 5, padding: "2px 6px", background: "var(--ley-surface-2)" }}>
                            {d.profile || "Unknown"}
                          </span>
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style={{ border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) 110px", gap: 12, padding: "7px 12px", background: "var(--ley-surface-1)", borderBottom: "1px solid var(--ley-line)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--ley-text-faint)", textTransform: "uppercase" }}>
                    <span style={{ width: 15 }} /><span>Deck</span><span>Profile</span>
                  </div>
                  {visibleDecks.map((d, i) => {
                    const checked = selectedSet.has(d.id);
                    return (
                      <label
                        key={d.id}
                        className="ley-row"
                        style={{
                          display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) 110px", gap: 12, alignItems: "center",
                          padding: "8px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--ley-text)",
                          borderTop: i === 0 ? "none" : "1px solid var(--ley-line)",
                          background: checked ? "var(--ley-green-dim)" : "transparent",
                          boxShadow: checked ? "inset 2px 0 0 var(--ley-green)" : "none",
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleDeck(d.id)} />
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)" }}>{d.profile || "Unknown"}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Profile pills: the name filters the roster; the checkbox selects/clears that profile's decks. */}
              {groups.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {groups.map((g) => {
                    const ids = g.decks.map((d) => d.id);
                    const allOn = ids.every((id) => selectedSet.has(id));
                    const filterOn = profileFilter.includes(g.profile);
                    return (
                      <span
                        key={g.profile}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 9px",
                          border: `1px solid ${filterOn ? "var(--ley-line-bright)" : "var(--ley-line)"}`,
                          borderRadius: "var(--r-pill)", background: "var(--ley-surface-1)",
                          opacity: profileFilter.length && !filterOn ? 0.55 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allOn}
                          onChange={() => toggleProfile(g.decks)}
                          title={allOn ? `Clear every ${g.profile} deck` : `Select every ${g.profile} deck`}
                          style={{ margin: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => toggleProfileFilter(g.profile)}
                          title={filterOn ? "Show all profiles" : `Show only ${g.profile} decks`}
                          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: 11.5, color: filterOn ? "var(--ley-green-text)" : "var(--ley-text-dim)", font: "inherit" }}
                        >
                          {g.profile} · {g.decks.length}
                        </button>
                      </span>
                    );
                  })}
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)" }}>
                    <strong style={{ color: "var(--ley-green)" }}>{selectedIds.length} selected</strong>
                  </span>
                </div>
              )}
            </section>

            {/* Error (honest surface) */}
            {error && <div style={errorBox()}>⚠ {error}</div>}

            {/* ── One-shot result ── */}
            {result && (
              <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <OutcomeSummary outcomes={result.outcomes} avgTurns={result.avgTurns} games={result.games} colors={colors} />

                <SeatSummaryTables summary={result.seatSummary} />

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {label("Unmodeled / broken cards (ranked by frequency)")}
                  <BreakageTable cards={result.breakages} colors={colors} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => downloadText(result.report, result.file || "self-play-report.txt")} className="btn btn-secondary btn-sm">
                    Download report (.txt)
                  </button>
                  {result.file ? (
                    <span style={{ fontSize: 11, color: "var(--ley-text-faint)" }}>
                      Saved locally under AppData →{" "}
                      <code style={{ color: "var(--ley-text)", background: "var(--ley-surface-2)", padding: "1px 5px", borderRadius: 3 }}>data/self-play/{result.file}</code>
                    </span>
                  ) : result.writeError ? (
                    <span style={{ fontSize: 11, color: "var(--ley-red)" }}>
                      ⚠ Couldn&rsquo;t save the report to disk ({result.writeError}) — use Download to keep it.
                    </span>
                  ) : null}
                </div>

                {bankData && (
                  <div style={{ fontSize: 11.5, color: result.trajectoryError ? "var(--ley-red)" : "var(--ley-text-faint)", lineHeight: 1.5 }}>
                    {result.trajectoryError
                      ? `⚠ Banking training data failed (${result.trajectoryError}).`
                      : result.trajectoryFile
                      ? `✓ Banked ${result.trajectoryRows ?? 0} training row${result.trajectoryRows === 1 ? "" : "s"} → data/self-play/trajectories/${result.trajectoryFile}.`
                      : "No labeled training rows to bank from this run (only completed games produce labels)."}
                  </div>
                )}
              </section>
            )}

            {/* ── Freshness confession — green when server identity matches what the page loaded under ── */}
            <section
              style={{
                display: "flex", flexDirection: "column", gap: 6, padding: "12px 15px",
                border: `1px solid ${stale ? "var(--ley-gold)" : "rgba(57, 245, 126, 0.4)"}`,
                borderRadius: "var(--r-lg)",
                background: stale
                  ? "linear-gradient(155deg, rgba(120, 84, 26, 0.16), var(--ley-gold-dim))"
                  : "linear-gradient(155deg, rgba(52, 140, 88, 0.13), var(--ley-green-faint))",
                boxShadow: stale ? "0 0 22px rgba(245, 176, 75, 0.12)" : "0 0 22px rgba(57, 245, 126, 0.14)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 650, color: stale ? "var(--ley-gold)" : "var(--ley-green)" }}>
                  {stale ? "⚠ Stale data detected — restart to repair" : health ? "◉ All Systems Green" : "◌ Checking server freshness…"}
                </span>
                <button type="button" onClick={() => fetchHealth()} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>↻ Refresh</button>
              </div>
              {health && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 10.5, color: stale ? "var(--ley-gold)" : "var(--ley-text-faint)" }}>
                  <span>server <strong style={{ color: stale ? "var(--ley-gold)" : "var(--ley-green)" }}>v{health.version}</strong>{shellVersion ? (health.version === shellVersion ? " = shell" : ` ≠ shell v${shellVersion}`) : ""}</span>
                  <span>registry <strong style={{ color: stale ? "var(--ley-gold)" : "var(--ley-green)" }}>{health.registryId ?? "—"}</strong>{healthBase ? (health.registryId === healthBase.registryId ? " ✓" : " ✗") : ""}</span>
                  {health.activeProfile && <span>profile <strong style={{ color: stale ? "var(--ley-gold)" : "var(--ley-green)" }}>{health.activeProfile.name}</strong></span>}
                  <span>fetched <strong style={{ color: stale ? "var(--ley-gold)" : "var(--ley-green)" }}>{healthAgo} ago</strong></span>
                </div>
              )}
              {stale && <div style={{ fontSize: 11, color: "var(--ley-gold)", lineHeight: 1.5 }}>{staleReasons.join(" · ")}</div>}
            </section>

            {/* ── Stop dock — floats over the canvas while the grind plays ── */}
            {grindRunning && (
              <div className="ley-glass-strong ley-glass-lit" style={{ position: "sticky", bottom: 8, zIndex: 5, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ley-text-faint)" }}>
                  game <strong style={{ color: "var(--ley-green)" }}>{grind.gamesPlayed}</strong> · {fmtDuration(uptimeMs)} · banking rows
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={stopGrind} className="btn btn-danger">■ Stop after this game</button>
              </div>
            )}
          </div>

          {/* ══ RUN RAIL ══ */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* ── Run Control ── */}
            <section className="ley-glass" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13.5, fontWeight: 650, color: "var(--ley-text)" }}>Run Control</span>

              <button
                type="button"
                onClick={endless ? startGrind : runStressTest}
                disabled={stale || (endless ? !grindReady || grindRunning : !canRun)}
                className={`btn btn-primary btn-lg${running ? " btn-loading" : ""}`}
                style={{ width: "100%" }}
              >
                {endless
                  ? grindRunning ? "Grinding…" : "▶ Grind endless"
                  : running ? "Running self-play…" : "▶ Run simulation"}
              </button>
              {stale && (
                <span style={{ fontSize: 11, color: "var(--ley-gold)", lineHeight: 1.5 }}>
                  Launch disabled — stale data detected. Restart the app to repair.
                </span>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {label("Games / pairing")}
                {seg(
                  [
                    ...GAMES_OPTIONS.map((n) => ({ value: n, label: `×${n}` })),
                    { value: "inf", label: "∞", blurb: "Endless — the grind loop plays random balanced pods until you stop it" },
                  ],
                  (v) => (v === "inf" ? endless : !endless && gamesPer === v),
                  (v) => {
                    if (v === "inf") { setEndless(true); return; }
                    setEndless(false);
                    setGamesPer(v);
                  },
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {label("Format")}
                {seg(MODE_OPTIONS, (v) => mode === v, setMode)}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {label("Pairings")}
                {seg(SCOPE_OPTIONS, (v) => scope === v, setScope)}
              </div>

              {/* PILOT PANEL (Omnath seam): one persona for the whole batch — the API has no per-deck
                  pilot assignment, so no per-deck control is faked here. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {label("Pilot")}
                <select
                  value={pilot}
                  onChange={(e) => setPilot(e.target.value)}
                  title="Persona modules live in the pilots/ folder of the app data dir"
                  style={{ padding: "6px 8px", background: "var(--ley-surface-1)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", fontSize: 12, fontFamily }}
                >
                  <option value="">Default AI (no persona)</option>
                  {availablePilots.map((p) => (
                    <option key={p.file} value={p.file} title={p.description || undefined}>{p.label}</option>
                  ))}
                </select>
                {availablePilots.length === 0 && (
                  <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                    ⓘ Drop persona <code>.mjs</code> modules in the app-data <code>pilots/</code> folder to run
                    persona-driven self-play (tags each game by playbook/temperament).
                  </span>
                )}
              </div>

              {endless && !grindRunning && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {label("Pod pool")}
                  <select
                    value={grindPool}
                    onChange={(e) => setGrindPool(e.target.value)}
                    title="Pod pool — cEDH decks (Rograkh/Thrasios, Kinnan) only ever pod with each other"
                    style={{ padding: "6px 8px", background: "var(--ley-surface-1)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", fontSize: 12, fontFamily }}
                  >
                    <option value="mixed">Mixed pool</option>
                    <option value="cedh">cEDH pool</option>
                  </select>
                </div>
              )}

              {!endless && !running && selectedIds.length > 0 && selectedIds.length < minDecks && (
                <span style={{ fontSize: 11, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  Select at least {minDecks} decks for {mode === "commander" ? "a Commander pod" : "Standard pairings"}.
                </span>
              )}
              {!endless && gamesPer > 1 && (
                <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  ⓘ Each repeat shuffles the decks with a distinct seed, so every game plays out
                  differently — more games means more coverage.
                </span>
              )}
              {endless && !grindRunning && (
                <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  {grindReady ? (
                    <>Walk-away mode — grinds {selectedIds.length >= minDecks ? `your ${selectedIds.length} selected decks` : `all ${decks.length} decks`} in random balanced pods, non-stop, logging every game. Stop anytime; it finishes the in-flight game.</>
                  ) : (
                    <>Load at least {minDecks} playable decks to grind (walk-away mode: random pods across the whole shelf, non-stop).</>
                  )}
                </span>
              )}
              {!grindRunning && grind && grind.gamesPlayed > 0 && (
                <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  Last grind: <strong style={{ color: "var(--ley-text)" }}>{grind.gamesPlayed}</strong> games
                  {grind.gamesTrusted != null ? ` (${grind.gamesTrusted} trusted)` : ""}
                  {grind.gamesStuck > 0 ? ` · ${grind.gamesStuck} stuck` : ""}
                  {grind.lastResult ? ` · last: ${grind.lastResult}` : ""} · stopped
                  {grind.capReached && <span style={{ color: "var(--ley-gold)" }}> · disk cap reached — paused</span>}
                  {grind.error && <span style={{ color: "var(--ley-red)" }}> · {grind.error}</span>}
                </span>
              )}

              {/* Bank training data toggle (one-shot runs) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--ley-line)", paddingTop: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={bankData} onChange={(e) => setBankData(e.target.checked)} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ley-text)" }}>Bank training data from this run</span>
                </label>
                <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  Records a per-turn <code style={{ color: "var(--ley-text)" }}>state → eventual-win</code> trajectory for every
                  game and saves it locally (JSONL) for the learn-to-play value model. Off by default.
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5, color: "var(--ley-text-faint)" }}>
                  <span>Banked runs: <strong style={{ color: "var(--ley-green)" }}>{stats?.games ?? (reportsLoad ? "…" : 0)}</strong></span>
                  <span>Training rows banked: <strong style={{ color: "var(--ley-green)" }}>{stats?.rows ?? (reportsLoad ? "…" : 0)}</strong></span>
                </div>
              </div>
            </section>

            {/* ── Session (only while a one-shot batch runs — the POST has no live progress feed,
                so the meter is honestly indeterminate) ── */}
            {running && (
              <section className="ley-glass" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="ley-live" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ley-green-bright)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 650, color: "var(--ley-text)" }}>Session</span>
                </div>
                <span className="ley-gel-live">
                  <progress className="ley-gel" aria-label="Self-play batch running" />
                </span>
                <span style={{ fontSize: 11, color: "var(--ley-text-faint)", lineHeight: 1.5 }}>
                  Each game takes ~3–5s and runs offline on your machine — hang tight while the batch finishes.
                </span>
              </section>
            )}

            {/* ── Saved-report history ── */}
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {label(`Saved reports (${reports.length})`)}
                <button type="button" onClick={refreshHistory} className="btn btn-ghost btn-sm">Refresh</button>
              </div>

              {reportsLoad && reports.length === 0 ? (
                <div style={mutedBox()}>Loading saved reports…</div>
              ) : reports.length === 0 ? (
                <div style={mutedBox()}>
                  No saved reports yet — run a simulation and it&rsquo;ll appear here, click-to-re-view.
                </div>
              ) : (
                <div style={{ border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                  {reports.map((r, i) => (
                    <div
                      key={r.file}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        padding: "9px 12px", borderTop: i === 0 ? "none" : "1px solid var(--ley-line)",
                        background: i % 2 ? "var(--ley-surface-2)" : "transparent",
                      }}
                    >
                      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 11.5, color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.savedAt ? new Date(r.savedAt).toLocaleString() : r.file}
                          {r.mode ? <span style={{ color: "var(--ley-text-faint)" }}> · {r.mode === "commander" ? "Commander" : "Standard"}</span> : null}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--ley-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.deckNames?.length ? r.deckNames.join(", ") : "decks unknown"}
                          {r.games != null ? ` · ${r.games} game${r.games === 1 ? "" : "s"}` : ""}
                          {r.breakages != null ? ` · ${r.breakages} breakage${r.breakages === 1 ? "" : "s"}` : ""}
                        </span>
                      </div>
                      <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => openReport(r.file)} className="btn btn-secondary btn-sm">View</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* ── Saved-report viewer (modal overlay) ── */}
      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewing(null)}
          style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ley-glass-strong ley-glass-lit"
            style={{ width: "min(760px, 100%)", maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--ley-line)" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 12.5, fontWeight: 700, color: accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.file}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {viewing.report && (
                  <button type="button" onClick={() => downloadText(viewing.report, viewing.file)} className="btn btn-ghost btn-sm">Download</button>
                )}
                <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {viewing.loading ? (
                <div style={{ fontSize: 12, color: "var(--ley-text-faint)", fontStyle: "italic" }}>Opening report…</div>
              ) : viewing.error ? (
                <div style={errorBox()}>⚠ {viewing.error}</div>
              ) : (
                <pre style={{ margin: 0, fontSize: 11.5, color: "var(--ley-text)", lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>{viewing.report}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Local style helpers (kept module-scoped so the JSX stays readable) ──
function mutedBox() {
  return {
    fontSize: 12, color: "var(--ley-text-faint)", fontStyle: "italic", padding: "8px 10px",
    background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)",
  };
}
function errorBox() {
  return {
    padding: "10px 12px", background: "var(--ley-red-dim)", border: "1px solid var(--ley-red)",
    color: "var(--ley-red)", borderRadius: "var(--r-md)", fontSize: 12.5, lineHeight: 1.5,
  };
}
