"use client";

/**
 * OnboardingWizard — the unified first-run flow (C4).
 *
 * Replaces the scattered first-launch + Ollama banners with one guided path:
 *   1. Path     — run the AI locally (Ollama, private + free) or via the API now.
 *   2. AI setup — install Ollama + pull a model (local), or confirm the API tier.
 *   3. Get going — restore a previous install, import a deck, or just explore.
 *
 * It orchestrates the existing handlers (passed as props) rather than
 * reimplementing them, and writes the first-launch marker on finish/skip so it
 * shows exactly once. Everything here is optional — the user can skip at any step.
 */

import { useState } from "react";

const STEPS = ["path", "ai", "decks"];

export default function OnboardingWizard({
  open,
  onClose,
  modelProvider,
  setModelProvider,
  ollamaHealth,
  runOllamaInstall,
  ollamaInstallBusy,
  ollamaInstallLog,
  runModelPull,
  ollamaPullBusy,
  ollamaPullProgress,
  suggestedSource,
  bootstrapSourcePath,
  setBootstrapSourcePath,
  runBootstrapImport,
  bootstrapBusy,
  bootstrapResult,
  onGoImport,
  onFinish,
  colors,
  fontFamily,
}) {
  const [step, setStep] = useState("path");
  const [path, setPath] = useState(null); // "local" | "api"
  if (!open) return null;

  const { BG, BG3, LINE, TEXT, MUTED, GOLD } = colors;
  const F = fontFamily;
  const idx = STEPS.indexOf(step);
  const ollamaOk = ollamaHealth?.ok;
  const missingModel = ollamaHealth?.status === "model-missing";
  const primaryModel = ollamaHealth?.missing?.[0] || "qwen2.5:14b";

  const choosePath = (p) => {
    setPath(p);
    if (p === "api") setModelProvider("anthropic");
    else if (modelProvider === "anthropic") setModelProvider("fast");
    setStep("ai");
  };
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div className="ley-glass-strong ley-glass-lit" style={{ width: 640, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column", color: TEXT, fontFamily: F, overflow: "hidden" }}>
        <header style={{ padding: "16px 22px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: "-0.01em" }}>Welcome to MTG Tool</span>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ display: "flex", gap: 6 }}>
              {STEPS.map((s, i) => (
                <span key={s} style={{ width: 7, height: 7, borderRadius: "50%", background: i <= idx ? GOLD : LINE }} />
              ))}
            </span>
            <button onClick={onClose} title="Close (you can finish setup later)" aria-label="Close" className="btn btn-ghost btn-icon">×</button>
          </span>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px" }}>
          {step === "path" && (
            <Step title="How do you want to run the AI?" subtitle="MTG Tool is local-first. You can change this any time in the header or Settings." muted={MUTED}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Choice
                  title="Local — private & free"
                  body="Runs the model on your PC via Ollama. Nothing leaves your machine. A one-time multi-GB model download is needed."
                  onClick={() => choosePath("local")}
                  colors={colors} font={F}
                />
                <Choice
                  title="Cloud API — instant"
                  body="Use the Anthropic API right now, no download. Sends prompts to Anthropic and costs API credits."
                  onClick={() => choosePath("api")}
                  colors={colors} font={F}
                />
              </div>
            </Step>
          )}

          {step === "ai" && path === "local" && (
            <Step title="Set up your local model" subtitle="You can start now via the API and let this finish in the background." muted={MUTED}>
              {ollamaOk && !missingModel ? (
                <Banner color="var(--ley-green)" colors={colors}>✓ Ollama is installed and a model is ready. You&apos;re all set.</Banner>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ollamaHealth?.status === "not-installed" && (
                    <Row label="Install Ollama" colors={colors}>
                      <Btn onClick={runOllamaInstall} disabled={ollamaInstallBusy} colors={colors} font={F}>
                        {ollamaInstallBusy ? "Installing…" : "Install Ollama"}
                      </Btn>
                    </Row>
                  )}
                  {(missingModel || ollamaOk) && (
                    <Row label={`Download model (${primaryModel})`} colors={colors}>
                      <Btn onClick={() => runModelPull(primaryModel)} disabled={ollamaPullBusy} colors={colors} font={F}>
                        {ollamaPullBusy ? "Downloading…" : `Pull ${primaryModel}`}
                      </Btn>
                    </Row>
                  )}
                  <Row label="Or skip the wait" colors={colors}>
                    <Btn onClick={() => setModelProvider("anthropic")} colors={colors} font={F}>Use the API for now</Btn>
                  </Row>
                  {(ollamaInstallLog || ollamaPullProgress) && (
                    <pre style={{ margin: 0, padding: "6px 8px", borderRadius: 4, background: BG3, color: MUTED, fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
                      {ollamaPullProgress || ollamaInstallLog}
                    </pre>
                  )}
                </div>
              )}
            </Step>
          )}

          {step === "ai" && path === "api" && (
            <Step title="You're set to use the API" subtitle="" muted={MUTED}>
              <Banner color={GOLD} colors={colors}>
                The app will use the Anthropic API for answers. This costs API credits and sends your prompts to Anthropic.
                You can switch to a free local model later from the header or Settings → Models.
              </Banner>
            </Step>
          )}

          {step === "decks" && (
            <Step title="Get your decks in" subtitle="All optional — you can do any of this later." muted={MUTED}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {suggestedSource && (
                  <div style={{ background: BG3, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Restore from a previous install</div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>We found data from an existing MTG Tool install. Import your decks, chats, and feedback?</div>
                    <input
                      value={bootstrapSourcePath}
                      onChange={(e) => setBootstrapSourcePath(e.target.value)}
                      style={{ width: "100%", padding: "7px 9px", background: BG, border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, fontSize: 12, fontFamily: F, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <Btn onClick={runBootstrapImport} disabled={bootstrapBusy || !bootstrapSourcePath} colors={colors} font={F}>
                      {bootstrapBusy ? "Importing…" : "Import data"}
                    </Btn>
                    {bootstrapResult && (
                      <span style={{ marginLeft: 10, fontSize: 12, color: bootstrapResult.ok ? "var(--ley-green)" : (colors.RED || "var(--ley-red)") }}>
                        {bootstrapResult.ok ? "✓ Imported — reloading…" : (bootstrapResult.error || "Import failed")}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ background: BG3, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Import a deck</div>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Paste a Moxfield or Archidekt URL (or a decklist) to start building, analyzing, and practicing.</div>
                  <Btn onClick={onGoImport} colors={colors} font={F}>Import a deck →</Btn>
                </div>
              </div>
            </Step>
          )}
        </div>

        <footer style={{ padding: "12px 18px", borderTop: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button onClick={onFinish} className="btn btn-ghost">Skip setup</button>
          <span style={{ display: "flex", gap: 8 }}>
            {idx > 0 && <button onClick={back} className="btn btn-ghost">Back</button>}
            {step === "decks"
              ? <button onClick={onFinish} className="btn btn-primary btn-lg">Finish</button>
              : step === "ai"
                ? <button onClick={next} className="btn btn-primary btn-lg">Continue</button>
                : null}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Step({ title, subtitle, muted, children }) {
  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.01em" }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: muted, margin: "0 0 16px", lineHeight: 1.5 }}>{subtitle}</p>}
      {!subtitle && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

function Choice({ title, body, onClick, colors, font }) {
  const { TEXT, MUTED, GOLD } = colors;
  return (
    <button onClick={onClick} className="ley-glass ley-card" style={{ textAlign: "left", borderRadius: 10, padding: 16, cursor: "pointer", fontFamily: font, color: TEXT, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{title}</span>
      <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{body}</span>
    </button>
  );
}

function Row({ label, children, colors }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: colors.TEXT }}>{label}</span>
      {children}
    </div>
  );
}

function Banner({ color, colors, children }) {
  return (
    <div style={{ background: colors.BG3, border: `1px solid ${color}`, borderRadius: 8, padding: "12px 14px", fontSize: 13, color: colors.TEXT, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn btn-primary btn-sm">
      {children}
    </button>
  );
}
