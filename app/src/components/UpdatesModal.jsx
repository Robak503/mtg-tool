/**
 * UpdatesModal — single panel for refreshing the bundled reference
 * datasets from their official sources (Scryfall, Commander Spellbook,
 * EDHREC). Each row shows last-sync time + age and has its own
 * Refresh button; "Refresh all" runs them in order.
 *
 * Streams progress from /api/sync-data via Server-Sent Events into a
 * scrolling log panel. Long-running syncs (spellbook can take 10+ min
 * at the API's rate limit) work fine — the connection stays open and
 * the panel can be left open in the background.
 */

import { useEffect, useRef, useState } from "react";

// Tauri plugin-updater is loaded dynamically — it only resolves inside
// the Tauri WebView. In a regular browser tab (dev mode) the import
// fails gracefully and the "Check for app updates" button reports that
// auto-update is unavailable.
async function loadTauriUpdater() {
  try {
    if (typeof window === "undefined") return null;
    if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return null;
    const mod = await import("@tauri-apps/plugin-updater");
    return mod;
  } catch {
    return null;
  }
}

const DATASET_LABELS = {
  "scryfall-bulk": "Scryfall bulk (oracle, rulings, default, artwork)",
  "spellbook":     "Commander Spellbook combos",
  "edhrec-salt":   "EDHREC salt scores",
  "oracle-index":  "Slim card index (rebuild)",
  "rules-index":   "Rules retrieval index (rebuild)",
};

const DATASET_HINTS = {
  "scryfall-bulk": "~5 minutes; downloads ~950 MB",
  "spellbook":     "~10-15 minutes (rate-limited API)",
  "edhrec-salt":   "~1-2 minutes",
  "oracle-index":  "~10 seconds (runs after scryfall-bulk)",
  "rules-index":   "~5 seconds (uses bundled rules codex)",
};

function timeAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ago`;
}

function fmtBytes(b) {
  if (!b) return "—";
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

async function loadAutostartPlugin() {
  try {
    if (typeof window === "undefined") return null;
    if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return null;
    return await import("@tauri-apps/plugin-autostart");
  } catch {
    return null;
  }
}

export default function UpdatesModal({ open, onClose, initialUpdate, colors, fontFamily }) {
  const { BG2, LINE, GOLD } = colors || {};
  const F = fontFamily;
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);
  const abortRef = useRef(null);
  // App-update state — only meaningful inside the Tauri WebView. If
  // the parent already ran the background check on mount, prepopulate
  // so the user doesn't have to click "Check for updates" again.
  const [appUpdate, setAppUpdate] = useState(() => initialUpdate ? {
    status: "available",
    message: `v${initialUpdate.version} available (you have v${initialUpdate.current})${initialUpdate.body ? " — " + initialUpdate.body.slice(0, 200) : ""}`,
    update: initialUpdate.update,
  } : { status: "idle", message: "" });
  const [appUpdateBusy, setAppUpdateBusy] = useState(false);
  // Autostart toggle state
  const [autostart, setAutostart] = useState({ available: false, enabled: false, busy: false });
  // Current app version from the Tauri runtime (shows "—" in a browser tab)
  const [currentVersion, setCurrentVersion] = useState("—");

  const refreshStatus = async () => {
    setStatusLoading(true);
    try {
      const resp = await fetch("/api/sync-data", { cache: "no-store" });
      if (resp.ok) setStatus(await resp.json());
    } catch (e) {
      // network error — keep prior status, surface in log
      setLogLines((prev) => [...prev, `(could not load status: ${e.message || e})`]);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refreshStatus();
  }, [open]);

  // Probe autostart state on open. Tauri plugin not present in browser
  // tabs → leaves available:false so the toggle stays hidden.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const mod = await loadAutostartPlugin();
      if (!mod || cancelled) return;
      try {
        const enabled = await mod.isEnabled();
        if (!cancelled) setAutostart({ available: true, enabled, busy: false });
      } catch { /* permission denied / not available */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Probe current app version from Tauri runtime on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return;
        const app = await import("@tauri-apps/api/app");
        const v = await app.getVersion();
        if (!cancelled) setCurrentVersion(v);
      } catch { /* not in Tauri webview — leave as "—" */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const toggleAutostart = async () => {
    setAutostart((prev) => ({ ...prev, busy: true }));
    try {
      const mod = await loadAutostartPlugin();
      if (!mod) return;
      if (autostart.enabled) {
        await mod.disable();
        setAutostart({ available: true, enabled: false, busy: false });
      } else {
        await mod.enable();
        setAutostart({ available: true, enabled: true, busy: false });
      }
    } catch (e) {
      setAutostart((prev) => ({ ...prev, busy: false }));
      setLogLines((prev) => [...prev, `autostart toggle failed: ${e.message || e}`]);
    }
  };

  // Auto-scroll the log to the bottom as new lines arrive.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  const cancelRunning = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setBusyAction(null);
      setLogLines((prev) => [...prev, "(cancelled)"]);
    }
  };

  const runSync = async (action) => {
    if (busyAction) return;
    setBusyAction(action);
    setLogLines((prev) => [
      ...prev,
      "",
      `═══ ${new Date().toLocaleTimeString()} ${action} ═══`,
    ]);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const resp = await fetch("/api/sync-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: abort.signal,
      });
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("no response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.startsWith("data: ")) continue;
          let data;
          try { data = JSON.parse(evt.slice(6)); } catch { continue; }
          if (data.text) {
            // Strip ANSI/control chars; collapse repeated trailing newlines.
            const cleaned = String(data.text)
              .replace(/\r/g, "")
              .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
              .trimEnd();
            if (cleaned) {
              setLogLines((prev) => {
                const next = [...prev, cleaned];
                // Keep last ~500 lines so the buffer doesn't grow forever.
                return next.length > 500 ? next.slice(-500) : next;
              });
            }
          }
          if (data.done) {
            setLogLines((prev) => [
              ...prev,
              data.ok ? `✓ ${data.summary || "done"}` : `✗ ${data.summary || "failed"}`,
            ]);
            await refreshStatus();
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setLogLines((prev) => [...prev, `request failed: ${e.message || e}`]);
      }
    } finally {
      abortRef.current = null;
      setBusyAction(null);
    }
  };

  const checkForAppUpdate = async () => {
    setAppUpdateBusy(true);
    setAppUpdate({ status: "checking", message: "Checking for updates…" });
    try {
      const updater = await loadTauriUpdater();
      if (!updater) {
        setAppUpdate({
          status: "unavailable",
          message: "Auto-update only works in the desktop .exe (you're in a browser tab).",
        });
        return;
      }
      const update = await updater.check();
      if (!update) {
        setAppUpdate({ status: "current", message: "You're on the latest version." });
        return;
      }
      setAppUpdate({
        status: "available",
        message: `v${update.version} available (you have v${update.currentVersion})${update.body ? " — " + update.body.slice(0, 200) : ""}`,
        update,
      });
    } catch (e) {
      setAppUpdate({
        status: "error",
        message: `Update check failed: ${e?.message || e}. The release feed may not exist yet.`,
      });
    } finally {
      setAppUpdateBusy(false);
    }
  };

  const downloadAndInstallUpdate = async () => {
    if (!appUpdate.update) return;
    setAppUpdateBusy(true);
    setAppUpdate((prev) => ({ ...prev, status: "downloading", message: "Downloading update…" }));
    let downloaded = 0;
    let total = 0;
    try {
      await appUpdate.update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data?.contentLength || 0;
          setAppUpdate((prev) => ({ ...prev, message: `Downloading ${(total / 1024 / 1024).toFixed(0)} MB…` }));
        } else if (event.event === "Progress") {
          downloaded += event.data?.chunkLength || 0;
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(0);
            setAppUpdate((prev) => ({ ...prev, message: `Downloading… ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(0)} MB)` }));
          }
        } else if (event.event === "Finished") {
          setAppUpdate((prev) => ({ ...prev, message: "Installing… the app will relaunch in a moment." }));
        }
      });
      // downloadAndInstall already triggers relaunch on Windows; this code
      // is only reached if Tauri's API changes in a future version.
      setAppUpdate({ status: "done", message: "Update installed. Restart to apply." });
    } catch (e) {
      setAppUpdate({ status: "error", message: `Install failed: ${e?.message || e}` });
    } finally {
      setAppUpdateBusy(false);
    }
  };

  if (!open) return null;

  const datasets = status?.datasets || [];
  const accent = GOLD || "#e0b64a";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !busyAction) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F,
      }}
    >
      <div
        style={{
          background: BG2 || "#16151a",
          border: `1px solid ${LINE || "#3a3640"}`,
          borderRadius: 8,
          width: "min(900px, 95vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          color: "#e0e0e0",
        }}
      >
        <div
          style={{
            padding: "12px 18px",
            borderBottom: `1px solid ${LINE || "#3a3640"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: accent, letterSpacing: "0.05em" }}>
            UPDATES &amp; DATA SYNC
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => runSync("all")}
              disabled={!!busyAction}
              style={{
                background: busyAction === "all" ? "#2a3a55" : "#244a7a",
                border: "1px solid #4a7ac4",
                color: "#e0eaf6",
                cursor: busyAction ? "default" : "pointer",
                fontSize: 12, padding: "6px 14px", borderRadius: 5, fontFamily: F,
              }}
            >
              {busyAction === "all" ? "Refreshing all…" : "Refresh all"}
            </button>
            {busyAction ? (
              <button
                onClick={cancelRunning}
                style={{
                  background: "transparent", border: "1px solid #6b3a3a",
                  color: "#e0a89a", cursor: "pointer",
                  fontSize: 12, padding: "6px 14px", borderRadius: 5, fontFamily: F,
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={onClose}
                title="Close"
                style={{
                  background: "transparent", border: "none", color: "#aaa",
                  fontSize: 22, lineHeight: 1, padding: "0 6px", cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "#3a3640"}`, fontSize: 11, color: "#9a9a9a" }}>
          Refresh data from official sources. Writes land in <code style={{ color: accent }}>{status?.dataDir || "data/"}</code> — the bundled snapshot stays untouched. Long syncs (Spellbook) can take 10+ minutes; this panel can be closed and reopened, the sync keeps running on the server.
        </div>

        {/* App self-update section — Tauri auto-updater */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "#3a3640"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "#e0e0e0" }}>
                MTG Tool <span style={{ color: accent, fontFamily: "Consolas, monospace" }}>v{currentVersion}</span>
              </div>
              <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>
                {appUpdate.status === "idle"
                  ? "Check for newer .exe releases from GitHub."
                  : appUpdate.message}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {appUpdate.status === "available" && (
                <button
                  onClick={downloadAndInstallUpdate}
                  disabled={appUpdateBusy}
                  style={{
                    background: "#244a7a", border: "1px solid #4a7ac4",
                    color: "#e0eaf6", cursor: appUpdateBusy ? "default" : "pointer",
                    fontSize: 11, padding: "4px 12px", borderRadius: 4, fontFamily: F,
                  }}
                >
                  {appUpdateBusy ? "Installing…" : "Download & install"}
                </button>
              )}
              <button
                onClick={checkForAppUpdate}
                disabled={appUpdateBusy}
                style={{
                  background: "transparent", border: `1px solid ${LINE || "#3a3640"}`,
                  color: "#e0e0e0", cursor: appUpdateBusy ? "default" : "pointer",
                  fontSize: 11, padding: "4px 10px", borderRadius: 4, fontFamily: F,
                }}
              >
                {appUpdateBusy && appUpdate.status === "checking" ? "Checking…" : "Check for updates"}
              </button>
            </div>
          </div>
        </div>

        {/* Update banner opt-in. Default behavior is zero-touch silent
            install on launch. Flipping this on switches back to "show
            me what's changing and let me click Install myself." */}
        {autostart.available && (
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "#3a3640"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "#e0e0e0" }}>Show me updates before installing</div>
              <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>
                {(() => {
                  let on = false;
                  try { on = localStorage.getItem("mtg-show-update-banner-first") === "1"; } catch {}
                  return on
                    ? "Enabled — you'll see a banner with release notes and click Install yourself."
                    : "Disabled (default) — updates install silently the moment you open the app.";
                })()}
              </div>
            </div>
            <button
              onClick={() => {
                try {
                  const cur = localStorage.getItem("mtg-show-update-banner-first") === "1";
                  localStorage.setItem("mtg-show-update-banner-first", cur ? "0" : "1");
                } catch {}
                setAppUpdate((prev) => ({ ...prev }));
              }}
              style={{
                background: (() => {
                  try { return localStorage.getItem("mtg-show-update-banner-first") === "1" ? "#244a7a" : "transparent"; } catch { return "transparent"; }
                })(),
                border: `1px solid ${LINE || "#3a3640"}`,
                color: "#e0e0e0", cursor: "pointer",
                fontSize: 11, padding: "4px 14px", borderRadius: 4, fontFamily: F,
                minWidth: 80,
              }}
            >
              {(() => {
                try { return localStorage.getItem("mtg-show-update-banner-first") === "1" ? "Enabled" : "Enable"; } catch { return "Enable"; }
              })()}
            </button>
          </div>
        )}

        {/* Autostart toggle — only shown when running inside Tauri */}
        {autostart.available && (
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "#3a3640"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "#e0e0e0" }}>Start MTG Tool when Windows starts</div>
              <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>
                {autostart.enabled
                  ? "Enabled — the app launches into the system tray on login."
                  : "Disabled — you'll need to launch the app manually."}
              </div>
            </div>
            <button
              onClick={toggleAutostart}
              disabled={autostart.busy}
              style={{
                background: autostart.enabled ? "#244a7a" : "transparent",
                border: `1px solid ${autostart.enabled ? "#4a7ac4" : (LINE || "#3a3640")}`,
                color: "#e0e0e0", cursor: autostart.busy ? "default" : "pointer",
                fontSize: 11, padding: "4px 14px", borderRadius: 4, fontFamily: F,
                minWidth: 80,
              }}
            >
              {autostart.busy ? "…" : autostart.enabled ? "Enabled" : "Enable"}
            </button>
          </div>
        )}

        {/* Dataset rows */}
        <div style={{ padding: "12px 0", overflowY: "auto", maxHeight: "40vh" }}>
          {datasets.length === 0 && (
            <div style={{ padding: "8px 18px", fontSize: 12, color: "#888" }}>
              {statusLoading ? "Loading status…" : "No dataset status available."}
            </div>
          )}
          {datasets.map((ds) => (
            <div
              key={ds.key}
              style={{
                padding: "10px 18px",
                borderBottom: `1px solid ${LINE || "#3a3640"}33`,
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#e0e0e0" }}>
                  {DATASET_LABELS[ds.key] || ds.label}
                </div>
                <div style={{ fontSize: 11, color: ds.stale ? "#e8c285" : "#7a7a7a", marginTop: 2 }}>
                  {ds.present
                    ? `synced ${timeAgo(ds.syncedAt)} · ${fmtBytes(ds.sizeBytes)}${ds.stale ? " · stale" : ""}`
                    : "not present locally"}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#666", whiteSpace: "nowrap" }}>
                {DATASET_HINTS[ds.key]}
              </div>
              <div style={{ fontSize: 10, color: ds.present ? "#9ec59e" : "#888", whiteSpace: "nowrap" }}>
                {ds.present ? "✓" : "—"}
              </div>
              <button
                onClick={() => runSync(ds.key)}
                disabled={!!busyAction}
                style={{
                  background: busyAction === ds.key ? "#2a3a55" : "transparent",
                  border: `1px solid ${LINE || "#3a3640"}`,
                  color: "#e0e0e0", cursor: busyAction ? "default" : "pointer",
                  fontSize: 11, padding: "4px 10px", borderRadius: 4, fontFamily: F,
                  minWidth: 70,
                }}
              >
                {busyAction === ds.key ? "…" : "Refresh"}
              </button>
            </div>
          ))}
        </div>

        {/* Log pane */}
        <div
          ref={logRef}
          style={{
            flex: 1,
            minHeight: 200,
            maxHeight: "35vh",
            overflowY: "auto",
            background: "#0a0a0a",
            color: "#9ec59e",
            fontFamily: "Consolas, Menlo, monospace",
            fontSize: 11,
            padding: "10px 18px",
            whiteSpace: "pre-wrap",
            borderTop: `1px solid ${LINE || "#3a3640"}`,
          }}
        >
          {logLines.length === 0
            ? <span style={{ color: "#555" }}>No activity yet. Click Refresh on any dataset above.</span>
            : logLines.join("\n")}
        </div>
      </div>
    </div>
  );
}
