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
import useEscapeClose from "../../hooks/useEscapeClose";

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
  "scryfall-bulk":      "Scryfall bulk (oracle, rulings, default, artwork)",
  "spellbook":          "Commander Spellbook combos",
  "edhrec-salt":        "EDHREC salt scores",
  "cardkingdom-prices": "Card Kingdom fallback prices",
  "oracle-index":       "Slim card index (rebuild)",
  "printings-index":    "Collection card index — printings (rebuild)",
  "rules-index":        "Rules retrieval index (rebuild)",
};

const DATASET_HINTS = {
  "scryfall-bulk":      "~5 minutes; downloads ~950 MB",
  "spellbook":          "~10-15 minutes (rate-limited API)",
  "edhrec-salt":        "~1-2 minutes",
  "cardkingdom-prices": "~1-2 minutes (price fallback)",
  "oracle-index":       "~10 seconds (runs after scryfall-bulk)",
  "printings-index":    "~1-2 minutes; needs Scryfall bulk first",
  "rules-index":        "~5 seconds (uses bundled rules codex)",
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
  const { LINE, GOLD } = colors || {};
  const F = fontFamily;
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);
  const abortRef = useRef(null);
  // App-update state — only meaningful inside the Tauri WebView. If the
  // parent already ran the background check, prepopulate so the user doesn't
  // have to click "Check for updates" again.
  const availableStateFrom = (info) => ({
    status: "available",
    message: `v${info.version} available (you have v${info.current})${info.body ? " — " + info.body.slice(0, 200) : ""}`,
    update: info.update,
  });
  const [appUpdate, setAppUpdate] = useState(() => initialUpdate
    ? availableStateFrom(initialUpdate)
    : { status: "idle", message: "" });
  // The modal is permanently mounted (open just toggles visibility), so the
  // background check's result usually lands AFTER the useState initializer
  // ran — apply it via effect or it is never shown (U-F6). Skips the
  // zero-touch silent-install state: that flow is already installing and the
  // shell banner covers it.
  useEffect(() => {
    if (!initialUpdate || initialUpdate.installing) return;
    setAppUpdate(availableStateFrom(initialUpdate));
  }, [initialUpdate]);
  const [appUpdateBusy, setAppUpdateBusy] = useState(false);
  useEscapeClose(onClose, { disabled: appUpdateBusy });
  const [dataMsg, setDataMsg] = useState("");
  const restoreInputRef = useRef(null);
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
              // eslint-disable-next-line no-control-regex
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

  // ── Your data: backup / restore / support bundle ──────────────────────────
  const flashData = (msg) => {
    setDataMsg(msg);
    window.setTimeout(() => setDataMsg(""), 6000);
  };
  const backupAllData = async () => {
    try {
      const resp = await fetch("/api/export-all");
      if (!resp.ok) return flashData("Backup failed.");
      const text = await resp.text();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `mtg-tool-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flashData("Backup downloaded.");
    } catch (e) {
      flashData(e.message || "Backup failed.");
    }
  };
  const copySupportInfo = async () => {
    try {
      const resp = await fetch("/api/support-bundle");
      const data = await resp.json();
      const text = data.text || JSON.stringify(data, null, 2);
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      flashData("Support info copied to clipboard.");
    } catch (e) {
      flashData(e.message || "Couldn't gather support info.");
    }
  };
  const restoreFromBackup = async (file) => {
    if (!file) return;
    const ok = window.confirm(
      "Restore REPLACES your current decks, chats, collection, grails, and agent notes with the backup's contents. A safety backup of your current data is saved first. Continue?",
    );
    if (!ok) return;
    try {
      flashData("Restoring…");
      const bundle = JSON.parse(await file.text());
      const resp = await fetch("/api/import-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle }),
      });
      const data = await resp.json();
      if (!resp.ok) return flashData(data.error || "Restore failed.");
      flashData(`Restored: ${(data.restored || []).join(", ") || "nothing"}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      flashData(e.message || "Restore failed (invalid backup file?).");
    }
  };

  if (!open) return null;

  const datasets = status?.datasets || [];
  const accent = GOLD || "var(--ley-green)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !busyAction) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F,
      }}
    >
      <div
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: "min(900px, 95vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          color: "var(--ley-text)",
        }}
      >
        <div
          style={{
            padding: "12px 18px",
            borderBottom: `1px solid ${LINE || "var(--ley-line)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 15, fontWeight: 700, color: accent, letterSpacing: "0.05em" }}>
            UPDATES &amp; DATA SYNC
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => runSync("all")}
              disabled={!!busyAction}
              className={`btn btn-sm ${busyAction === "all" ? "btn-loading" : "btn-primary"}`}
            >
              {busyAction === "all" ? "Refreshing all…" : "Refresh all"}
            </button>
            {busyAction ? (
              <button
                onClick={cancelRunning}
                className="btn btn-danger btn-sm"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="btn btn-ghost btn-icon"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "var(--ley-line)"}`, fontSize: 11, color: "var(--ley-text-faint)" }}>
          Refresh data from official sources. Writes land in <code style={{ color: accent }}>{status?.dataDir || "data/"}</code> — the bundled snapshot stays untouched. Long syncs (Spellbook) can take 10+ minutes; this panel can be closed and reopened, the sync keeps running on the server.
        </div>

        {/* App self-update section — Tauri auto-updater */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "var(--ley-line)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ley-text)" }}>
                MTG Tool <span style={{ color: accent, fontFamily: "Consolas, monospace" }}>v{currentVersion}</span>
              </div>
              <div className={appUpdate.status === "downloading" ? "ley-live" : undefined} style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 2 }}>
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
                  className="btn btn-primary btn-sm"
                >
                  {appUpdateBusy ? "Installing…" : "Download & install"}
                </button>
              )}
              <button
                onClick={checkForAppUpdate}
                disabled={appUpdateBusy}
                className="btn btn-secondary btn-sm"
              >
                {appUpdateBusy && appUpdate.status === "checking" ? "Checking…" : "Check for updates"}
              </button>
            </div>
          </div>
        </div>

        {/* Your data — backup / restore / diagnostics */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "var(--ley-line)"}` }}>
          <div style={{ fontSize: 13, color: "var(--ley-text)", marginBottom: 8 }}>Your data</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={backupAllData} className="btn btn-secondary btn-sm">Back up all data</button>
            <button onClick={() => restoreInputRef.current?.click()} className="btn btn-secondary btn-sm">Restore from backup…</button>
            <button onClick={copySupportInfo} className="btn btn-secondary btn-sm">Copy support info</button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; restoreFromBackup(f); }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 6 }}>
            {dataMsg || "Export everything (decks, chats, collection, grails, games) to one JSON, restore it on another machine, or copy redacted diagnostics for a bug report. Nothing leaves your machine unless you share the file."}
          </div>
        </div>

        {/* Update banner opt-in. Default behavior is zero-touch silent
            install on launch. Flipping this on switches back to "show
            me what's changing and let me click Install myself." */}
        {autostart.available && (
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "var(--ley-line)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ley-text)" }}>Show me updates before installing</div>
              <div style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 2 }}>
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
              className={`btn btn-sm ${(() => {
                try { return localStorage.getItem("mtg-show-update-banner-first") === "1" ? "btn-primary" : "btn-secondary"; } catch { return "btn-secondary"; }
              })()}`}
              style={{ minWidth: 80 }}
            >
              {(() => {
                try { return localStorage.getItem("mtg-show-update-banner-first") === "1" ? "Enabled" : "Enable"; } catch { return "Enable"; }
              })()}
            </button>
          </div>
        )}

        {/* Autostart toggle — only shown when running inside Tauri */}
        {autostart.available && (
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE || "var(--ley-line)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ley-text)" }}>Start MTG Tool when Windows starts</div>
              <div style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 2 }}>
                {autostart.enabled
                  ? "Enabled — the app launches into the system tray on login."
                  : "Disabled — you'll need to launch the app manually."}
              </div>
            </div>
            <button
              onClick={toggleAutostart}
              disabled={autostart.busy}
              className={`btn btn-sm ${autostart.enabled ? "btn-primary" : "btn-secondary"}`}
              style={{ minWidth: 80 }}
            >
              {autostart.busy ? "…" : autostart.enabled ? "Enabled" : "Enable"}
            </button>
          </div>
        )}

        {/* Dataset rows */}
        <div style={{ padding: "12px 0", overflowY: "auto", maxHeight: "40vh" }}>
          {datasets.length === 0 && (
            <div style={{ padding: "8px 18px", fontSize: 12, color: "var(--ley-text-faint)" }}>
              {statusLoading ? "Loading status…" : "No dataset status available."}
            </div>
          )}
          {datasets.map((ds) => (
            <div
              key={ds.key}
              className={busyAction === ds.key ? "ley-live" : undefined}
              style={{
                padding: "10px 18px",
                borderBottom: `1px solid ${LINE || "var(--ley-line)"}`,
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ley-text)" }}>
                  {DATASET_LABELS[ds.key] || ds.label}
                </div>
                <div style={{ fontSize: 11, color: ds.stale ? "var(--ley-gold)" : "var(--ley-text-faint)", marginTop: 2 }}>
                  {ds.present
                    ? `synced ${timeAgo(ds.syncedAt)} · ${fmtBytes(ds.sizeBytes)}${ds.stale ? " · stale" : ""}`
                    : "not present locally"}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "var(--ley-text-faint)", whiteSpace: "nowrap" }}>
                {DATASET_HINTS[ds.key]}
              </div>
              <div style={{ fontSize: 10, color: ds.present ? "var(--ley-green-text)" : "var(--ley-text-faint)", whiteSpace: "nowrap" }}>
                {ds.present ? "✓" : "—"}
              </div>
              <button
                onClick={() => runSync(ds.key)}
                disabled={!!busyAction}
                className={`btn btn-secondary btn-sm ${busyAction === ds.key ? "btn-loading" : ""}`}
                style={{ minWidth: 70 }}
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
            background: "var(--ley-bg)",
            color: "var(--ley-green-text)",
            fontFamily: "Consolas, Menlo, monospace",
            fontSize: 11,
            padding: "10px 18px",
            whiteSpace: "pre-wrap",
            borderTop: `1px solid ${LINE || "var(--ley-line)"}`,
          }}
        >
          {logLines.length === 0
            ? <span style={{ color: "var(--ley-text-faint)" }}>No activity yet. Click Refresh on any dataset above.</span>
            : logLines.join("\n")}
        </div>
      </div>
    </div>
  );
}
