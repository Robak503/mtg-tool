/**
 * ShellBanners.jsx — the three shell notice banners, extracted from MTGAssistant.jsx as PURE
 * components (NEXT-QUEUE A2's safe subset; the full decomp of the god-component stays refused —
 * no render net exists for it).
 *
 * The JSX is verbatim from the inline blocks it replaces; only closures became explicit props.
 * These are purely presentational: no `area` state, no window access — which is exactly what
 * makes them safely extractable AND directly SSR-testable (ShellBanners.test.jsx pins every
 * state of each banner; the call-site wiring is covered by the suite + lint).
 */

/** App-update banner — three states: installing (zero-touch), installFailed, available. */
export function AppUpdateBanner({ info, onSeeDetails, onDismiss, fontFamily }) {
  if (!info) return null;
  return (
    <div
      role="status"
      style={{
        padding: "10px 16px",
        background: info.installFailed ? "var(--ley-red-dim)" : "var(--ley-green-dim)",
        borderBottom: `1px solid ${info.installFailed ? "rgba(248,113,113,0.4)" : "var(--ley-line-bright)"}`,
        color: info.installFailed ? "var(--ley-red)" : "var(--ley-green-text)",
        fontSize: 12,
        fontFamily,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>
        {info.installing ? (
          <>
            <strong style={{ marginRight: 8 }}>⟳ Installing MTG Tool v{info.version}…</strong>
            The app will relaunch when it&apos;s done. Keep this window open.
          </>
        ) : info.installFailed ? (
          <>
            <strong style={{ marginRight: 8 }}>⚠ Auto-install of v{info.version} failed</strong>
            Try again from the Updates panel.
          </>
        ) : (
          <>
            <strong style={{ marginRight: 8 }}>↑ MTG Tool v{info.version} is available</strong>
            (you have v{info.current}){info.body ? " — " + info.body.slice(0, 120) : ""}
          </>
        )}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!info.installing && (
          <button
            onClick={onSeeDetails}
            style={{
              background: info.installFailed ? "var(--ley-red-dim)" : "var(--ley-green-dim)",
              border: `1px solid ${info.installFailed ? "rgba(248,113,113,0.5)" : "var(--ley-line-bright)"}`,
              color: "var(--ley-text)", cursor: "pointer",
              fontSize: 11, padding: "4px 12px", borderRadius: 4, fontFamily,
            }}
          >
            See details
          </button>
        )}
        {!info.installing && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss update notification"
            title="Hide until next launch"
            style={{
              background: "none", border: "none", color: "inherit",
              cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
            }}
          >×</button>
        )}
      </span>
    </div>
  );
}

/** First-launch data import — legacy fallback banner (the OnboardingWizard supersedes it). */
export function FirstLaunchImportBanner({
  sourcePath, onSourcePathChange, busy, result, onImport, onDismiss, fontFamily,
}) {
  return (
    <div
      role="status"
      style={{
        padding: "10px 16px",
        background: "var(--ley-surface-1)",
        borderBottom: "1px solid var(--ley-line)",
        color: "var(--ley-text-dim)",
        fontSize: 12,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>
          <strong style={{ marginRight: 8 }}>👋 Welcome to MTG Tool</strong>
          No saved data here yet. Import your decks, chats, and feedback from an existing install?
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss welcome banner"
          title="Don't ask again this session"
          style={{
            background: "none", border: "none", color: "inherit",
            cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
          }}
        >×</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={sourcePath}
          onChange={(e) => onSourcePathChange(e.target.value)}
          placeholder="C:\path\to\MTG-TOOL\app\data"
          disabled={busy}
          style={{
            flex: 1, padding: "6px 10px", borderRadius: 5,
            border: "1px solid var(--ley-line)", background: "var(--ley-surface-0)",
            color: "var(--ley-text)", fontFamily, fontSize: 12,
          }}
        />
        <button
          onClick={onImport}
          disabled={busy || !sourcePath.trim()}
          style={{
            padding: "6px 14px", borderRadius: 5,
            border: "1px solid var(--ley-green)",
            background: busy ? "var(--ley-surface-1)" : "var(--ley-line)",
            color: "var(--ley-text)", fontFamily, fontSize: 12,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {result && (
        <div
          style={{
            fontSize: 11,
            color: result.ok ? "var(--ley-green-text)" : "var(--ley-red)",
            padding: "4px 0",
          }}
        >
          {result.ok ? (
            <>
              ✓ Imported{" "}
              {result.copied?.length ? result.copied.join(", ") : "(no files)"}
              {result.copied?.length > 0 && " — reloading…"}
            </>
          ) : (
            <>✗ {result.error || "Import failed"}</>
          )}
        </div>
      )}
    </div>
  );
}

/** Ollama startup health banner — not-installed / server-down / model-missing. */
export function OllamaHealthBanner({
  health, installBusy, pullBusy, installLog, pullProgress,
  onInstall, onPull, onUseAnthropic, onDismiss, fontFamily,
}) {
  if (!health || health.ok) return null;
  const palette = health.status === "not-installed"
    ? { bg: "var(--ley-surface-1)", border: "var(--ley-line)", text: "var(--ley-text-dim)", accent: "var(--ley-line)", accentBorder: "var(--ley-green)" }
    : health.status === "server-down"
    ? { bg: "var(--ley-red-dim)", border: "rgba(248,113,113,0.4)", text: "var(--ley-red)", accent: "var(--ley-red-dim)", accentBorder: "rgba(248,113,113,0.4)" }
    : { bg: "var(--ley-gold-dim)", border: "rgba(245,176,75,0.4)", text: "var(--ley-gold)", accent: "var(--ley-gold-dim)", accentBorder: "rgba(245,176,75,0.4)" };
  const title =
    health.status === "not-installed" ? "👋 Ollama not installed" :
    health.status === "server-down" ? "⚠ Ollama not running" :
    "⚠ Ollama model missing";
  const primaryModel = health.missing?.[0] || "qwen2.5:14b";
  // While Ollama is installing or a model is downloading, the user doesn't
  // have to wait — they can chat right now via the API (C2 fast path).
  const setupBusy = installBusy || pullBusy;
  return (
    <div
      role="status"
      style={{
        padding: "8px 16px",
        background: palette.bg,
        borderBottom: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ flex: 1 }}>
          <strong style={{ marginRight: 8 }}>{title}</strong>
          {health.message}
          {setupBusy && (
            <span style={{ display: "block", marginTop: 3, color: palette.text, opacity: 0.85 }}>
              No need to wait — you can chat now via the API while this finishes, then switch back to Local.
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {health.status === "not-installed" && health.canAutoInstall && (
            <button
              onClick={onInstall}
              disabled={installBusy}
              title="Run `winget install Ollama.Ollama` — Windows will ask for permission"
              style={{
                background: palette.accent, border: `1px solid ${palette.accentBorder}`,
                color: "inherit", cursor: installBusy ? "default" : "pointer",
                fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily,
              }}
            >
              {installBusy ? "Installing…" : "Install Ollama"}
            </button>
          )}
          {health.status === "model-missing" && (
            <button
              onClick={() => onPull(primaryModel)}
              disabled={pullBusy}
              title={`Run: ollama pull ${primaryModel}`}
              style={{
                background: palette.accent, border: `1px solid ${palette.accentBorder}`,
                color: "inherit", cursor: pullBusy ? "default" : "pointer",
                fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily,
              }}
            >
              {pullBusy ? "Pulling…" : `Pull ${primaryModel}`}
            </button>
          )}
          <button
            onClick={onUseAnthropic}
            title="Switch to the Anthropic API so you can chat right now"
            style={{
              background: setupBusy ? palette.accent : "transparent", border: `1px solid ${setupBusy ? palette.accentBorder : palette.border}`,
              color: "inherit", cursor: "pointer",
              fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily,
            }}
          >
            {setupBusy ? "Chat now via API" : "Use Anthropic instead"}
          </button>
          <button
            onClick={onDismiss}
            aria-label="Dismiss banner"
            title="Dismiss this banner (will not show again this session)"
            style={{
              background: "none", border: "none", color: "inherit",
              cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
            }}
          >×</button>
        </span>
      </div>
      {installLog && (
        <pre style={{
          margin: 0, padding: "6px 8px", borderRadius: 4,
          background: "rgba(0,0,0,0.25)", color: palette.text, fontSize: 11,
          whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto",
        }}>{installLog}</pre>
      )}
      {pullProgress && (
        <pre style={{
          margin: 0, padding: "6px 8px", borderRadius: 4,
          background: "rgba(0,0,0,0.25)", color: palette.text, fontSize: 11,
          whiteSpace: "pre-wrap", maxHeight: 150, overflowY: "auto",
        }}>{pullProgress}</pre>
      )}
    </div>
  );
}
