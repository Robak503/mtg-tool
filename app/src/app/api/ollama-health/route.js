/**
 * /api/ollama-health — Proactive Ollama readiness probe.
 *
 * Called once on app load by MTGAssistant. Returns:
 *   { ok: true,  baseUrl, modelsConfigured, modelsAvailable, missing: [] }
 *   { ok: false, status: "server-down" | "model-missing", baseUrl, message, missing }
 *
 * The frontend displays a dismissable banner when ok=false so the user can
 * fix it (start ollama serve, pull a model) before they hit a confusing
 * timeout on their first rules question.
 *
 * Mirrors the model resolution in modelProvider.js — must stay in sync with
 * DEFAULT_OLLAMA_MODEL / DEFAULT_OLLAMA_FAST_MODEL / DEFAULT_OLLAMA_AGENT_MODEL.
 */

export const runtime = "nodejs";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:32b";
const DEFAULT_OLLAMA_FAST_MODEL = "qwen2.5:7b";
const DEFAULT_OLLAMA_AGENT_MODEL = "qwen2.5:14b";

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
    return Response.json({
      ok: false,
      status: "server-down",
      baseUrl,
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
