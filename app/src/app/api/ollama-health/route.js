/**
 * /api/ollama-health — Proactive Ollama readiness probe.
 *
 * Called once on app load by MTGAssistant. Returns:
 *   { ok: true,  baseUrl, modelsConfigured, modelsAvailable, missing: [] }
 *   { ok: false, status: "not-installed", message }
 *   { ok: false, status: "server-down" | "model-missing", baseUrl, message, missing }
 *
 * The frontend displays a dismissable banner when ok=false so the user can
 * fix it (install ollama, start ollama serve, pull a model) before they
 * hit a confusing timeout on their first rules question.
 *
 * "not-installed" only fires on Windows when the binary is missing from
 * the default install location AND the server is unreachable — i.e. the
 * .exe user hasn't installed Ollama yet and the install-ollama wizard
 * should offer to do it for them.
 *
 * Mirrors the model resolution in modelProvider.js — must stay in sync with
 * DEFAULT_OLLAMA_MODEL / DEFAULT_OLLAMA_FAST_MODEL / DEFAULT_OLLAMA_AGENT_MODEL.
 */

export const runtime = "nodejs";

import path from "node:path";
import { existsSync } from "node:fs";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:32b";
const DEFAULT_OLLAMA_FAST_MODEL = "qwen2.5:7b";
const DEFAULT_OLLAMA_AGENT_MODEL = "qwen2.5:14b";

/**
 * Check the well-known Windows install locations for Ollama. Returns the
 * absolute path if found, null otherwise. Doesn't run the binary — just
 * looks for it on disk so we can distinguish "not installed yet" from
 * "installed but the server isn't running."
 */
function findOllamaBinary() {
  if (process.platform !== "win32") return null;
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Ollama", "ollama.exe"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function configuredModels() {
  // The three tiers in active rotation. De-dup since users can point them all
  // at the same model.
  return [...new Set([
    process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    process.env.OLLAMA_FAST_MODEL || DEFAULT_OLLAMA_FAST_MODEL,
    process.env.OLLAMA_AGENT_MODEL || process.env.OLLAMA_ARBITER_MODEL || DEFAULT_OLLAMA_AGENT_MODEL,
  ])];
}

export async function GET() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  const wanted = configuredModels();

  // Use AbortController so a hung Ollama daemon can't park this request
  // forever on app load.
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), 3000);

  let response;
  try {
    response = await fetch(`${baseUrl}/api/tags`, { signal: abort.signal });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error?.name === "AbortError";
    // Server isn't reachable. On Windows, also check whether Ollama is
    // installed at all — if not, the .exe user needs the install flow,
    // not the "start the daemon" flow.
    const binaryPath = findOllamaBinary();
    if (!binaryPath) {
      return Response.json({
        ok: false,
        status: "not-installed",
        baseUrl,
        modelsConfigured: wanted,
        modelsAvailable: [],
        missing: wanted,
        message: "Ollama isn't installed yet. Click Install Ollama to set it up.",
        canAutoInstall: process.platform === "win32",
      });
    }
    return Response.json({
      ok: false,
      status: "server-down",
      baseUrl,
      binaryPath,
      modelsConfigured: wanted,
      modelsAvailable: [],
      missing: wanted,
      message: isTimeout
        ? `Ollama at ${baseUrl} did not respond within 3s. Is it running? Start with: ollama serve`
        : `Could not reach Ollama at ${baseUrl}. Start with: ollama serve`,
      timeout: isTimeout,
    });
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    return Response.json({
      ok: false,
      status: "server-down",
      baseUrl,
      modelsConfigured: wanted,
      modelsAvailable: [],
      missing: wanted,
      message: `Ollama at ${baseUrl} returned ${response.status} for /api/tags.`,
    });
  }

  let data = {};
  try { data = await response.json(); } catch { /* empty body */ }
  // /api/tags returns { models: [{ name: "qwen2.5:7b", ... }, ...] }
  const available = Array.isArray(data.models)
    ? data.models.map(m => String(m.name || "")).filter(Boolean)
    : [];

  const missing = wanted.filter(name => !available.includes(name));
  if (missing.length > 0) {
    const pullList = missing.map(m => `ollama pull ${m}`).join(" && ");
    return Response.json({
      ok: false,
      status: "model-missing",
      baseUrl,
      modelsConfigured: wanted,
      modelsAvailable: available,
      missing,
      message: `Ollama is running but missing model${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Run: ${pullList}`,
    });
  }

  return Response.json({
    ok: true,
    baseUrl,
    modelsConfigured: wanted,
    modelsAvailable: available,
    missing: [],
  });
}
