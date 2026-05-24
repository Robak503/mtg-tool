import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:32b";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_CONTEXT = 32768;
const MODEL_CALL_LOG = path.join(process.cwd(), "data", "model-calls.local.json");
const MODEL_CALL_LOG_LIMIT = 1000;

function cleanProvider(value) {
  return String(value || "").trim().toLowerCase();
}

export function selectedProvider(requestedProvider) {
  return cleanProvider(requestedProvider || process.env.MTG_MODEL_PROVIDER || process.env.MODEL_PROVIDER || "ollama");
}

function maxTokensFrom(value) {
  const maxTokens = Number(value);
  return Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 8000) : 2500;
}

function ollamaContextFrom(value) {
  const context = Number(value || process.env.OLLAMA_NUM_CTX);
  return Number.isFinite(context) && context > 0 ? Math.min(context, 32768) : DEFAULT_OLLAMA_CONTEXT;
}

function anthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key !== "sk-ant-your-key-here" ? key : "";
}

function fallbackAllowed() {
  return process.env.ALLOW_ANTHROPIC_AUTO_FALLBACK === "true";
}

function anthroContent(text) {
  return [{ type: "text", text: text || "" }];
}

function inputCharCount(body = {}) {
  const systemChars = String(body.system || "").length;
  const messageChars = (body.messages || []).reduce((sum, message) => sum + String(message.content || "").length, 0);
  return { systemChars, messageChars, totalChars: systemChars + messageChars };
}

function outputCharCount(data = {}) {
  return String(data.content?.[0]?.text || "").length;
}

async function appendModelCallLog(entry) {
  try {
    await fs.mkdir(path.dirname(MODEL_CALL_LOG), { recursive: true });

    let existing = { version: 1, calls: [] };
    try {
      const raw = await fs.readFile(MODEL_CALL_LOG, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.calls)) existing = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const calls = [...existing.calls, entry].slice(-MODEL_CALL_LOG_LIMIT);
    await fs.writeFile(MODEL_CALL_LOG, JSON.stringify({ version: 1, calls }, null, 2));
  } catch {
    // Logging must never block a model response.
  }
}

async function recordModelCall({ body, provider, model, result }) {
  const chars = inputCharCount(body);
  const data = result.data || {};
  await appendModelCallLog({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    provider,
    model,
    ok: Boolean(result.ok),
    status: result.status,
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    systemChars: chars.systemChars,
    inputChars: chars.messageChars,
    totalInputChars: chars.totalChars,
    outputChars: outputCharCount(data),
    usage: data.usage || null,
    error: result.ok ? null : String(data.error || "unknown error"),
  });
}

function providerError(message, status, provider, extra = {}) {
  return {
    ok: false,
    status,
    data: {
      error: message,
      provider,
      ...extra,
    },
  };
}

export async function callAnthropicMessages(body = {}) {
  const apiKey = anthropicKey();
  if (!apiKey) {
    return providerError(
      "Missing ANTHROPIC_API_KEY. Create .env.local from .env.local.example and restart the dev server.",
      500,
      "anthropic"
    );
  }

  const payload = {
    model: process.env.ANTHROPIC_MODEL || body.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: maxTokensFrom(body.max_tokens),
    system: body.system || "",
    messages: body.messages || [],
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorResult = providerError(data.error || data.message || "Anthropic request failed.", response.status, "anthropic", {
        raw: data,
      });
      await recordModelCall({ body, provider: "anthropic", model: payload.model, result: errorResult });
      return errorResult;
    }

    const result = {
      ok: true,
      status: response.status,
      provider: "anthropic",
      data: { ...data, provider: "anthropic" },
    };
    await recordModelCall({ body, provider: "anthropic", model: payload.model, result });
    return result;
  } catch {
    const result = providerError("Could not reach Anthropic API.", 502, "anthropic");
    await recordModelCall({ body, provider: "anthropic", model: payload.model, result });
    return result;
  }
}

export async function callOllamaMessages(body = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL || body.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const system = body.system ? [{ role: "system", content: body.system }] : [];
  const messages = [...system, ...(body.messages || [])].map(message => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: String(message.content || ""),
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: maxTokensFrom(body.max_tokens),
          num_ctx: ollamaContextFrom(body.ollamaContext),
        },
      }),
    });

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorText = String(data.error || data.message || "");
      const isModelMissing = /model.{0,40}not found|pull/i.test(errorText);
      const errorMsg = isModelMissing
        ? `Ollama model "${model}" is not pulled. Run: ollama pull ${model}`
        : (errorText || "Ollama request failed.");
      const errorResult = providerError(errorMsg, response.status, "ollama", {
        fallbackAvailable: Boolean(anthropicKey()),
        modelMissing: isModelMissing,
        raw: data,
      });
      await recordModelCall({ body, provider: "ollama", model, result: errorResult });
      return errorResult;
    }

    const text = data.message?.content || data.response || "";
    const result = {
      ok: true,
      status: response.status,
      provider: "ollama",
      data: {
        id: data.created_at || "ollama-local",
        type: "message",
        role: "assistant",
        model,
        provider: "ollama",
        content: anthroContent(text),
        usage: {
          input_tokens: null,
          output_tokens: data.eval_count ?? null,
        },
        raw: data,
      },
    };
    await recordModelCall({ body, provider: "ollama", model, result });
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error?.name === "AbortError";
    const errorMsg = isTimeout
      ? "Ollama request timed out after 120s. The model may be overloaded or out of VRAM."
      : "Could not reach Ollama at localhost:11434. Is Ollama running? Start with: ollama serve";
    const result = providerError(errorMsg, isTimeout ? 504 : 502, "ollama", {
      fallbackAvailable: Boolean(anthropicKey()),
      timeout: isTimeout,
    });
    await recordModelCall({ body, provider: "ollama", model, result });
    return result;
  }
}

export async function callModelMessages(body = {}) {
  const provider = selectedProvider(body.provider);

  if (provider === "ollama" || provider === "local") {
    return callOllamaMessages(body);
  }

  if (provider === "auto") {
    const local = await callOllamaMessages(body);
    if (local.ok || !fallbackAllowed()) return local;
    return callAnthropicMessages(body);
  }

  return callAnthropicMessages(body);
}
