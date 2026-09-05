import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { interpretationPrompt, validateInterpretation } from "./interpretationContract.js";
import { renderNarration } from "./narrationContract.js";
import { boundedOperation } from "./asyncOperation.js";

function settleWithin(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("model bridge timed out")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function createModelClient({
  invokeCommand = invoke,
  listen = addPluginListener,
  randomId = () => crypto.randomUUID(),
  generationTimeoutMs = 12000,
  listenerTimeoutMs = 1000,
} = {}) {
  const command = (name, payload) =>
    invokeCommand(`plugin:omnath-model|${name}`, payload ? { payload } : undefined);

  async function status() {
    try { return await settleWithin(command("status"), 2000); } catch { return { state: "unavailable" }; }
  }

  async function prepareDefault(modelId = "base") {
    const current = await status();
    if (current.state === "ready") return current;
    let lastError;
    for (const candidate of [modelId, ...["base", "enhanced"].filter((id) => id !== modelId)]) {
      try { return await boundedOperation(() => command("load_model", { modelId: candidate }), { timeoutMs: 120000 }); }
      catch (error) { lastError = error; }
    }
    return { state: "unavailable", error: lastError ? "model-load-failed" : "model-unavailable" };
  }

  async function generate(prompt, onToken) {
    const requestId = randomId();
    let tokenCount = 0;
    let listener = null;
    let acceptingEvents = true;
    const unregister = (handle) => { try { Promise.resolve(handle?.unregister()).catch(() => null); } catch { /* optional progress */ } };
    if (onToken) {
      const pending = Promise.resolve().then(() => listen("omnath-model", "token", (event) => {
        if (acceptingEvents && event.requestId === requestId) onToken(++tokenCount);
      }));
      try { listener = await boundedOperation(() => pending, { timeoutMs: listenerTimeoutMs }); }
      catch { pending.then(unregister).catch(() => null); }
    }
    try {
      return await boundedOperation(() => command("generate", { requestId, prompt }), { timeoutMs: generationTimeoutMs });
    } catch (error) {
      void boundedOperation(() => command("cancel"), { timeoutMs: 1000 }).catch(() => null);
      throw error;
    } finally {
      acceptingEvents = false;
      unregister(listener);
    }
  }

  async function interpret(question, onToken) {
    if ((await status()).state !== "ready") return { valid: false, reason: "unavailable", candidate: null };
    try {
      const response = await generate(interpretationPrompt(question), onToken);
      return validateInterpretation(response.text);
    } catch {
      return { valid: false, reason: "generation-failed", candidate: null };
    }
  }

  async function narrate(plan, onToken) {
    if ((await status()).state !== "ready") return { text: plan.fallback, usedModel: false, rejection: "unavailable" };
    try {
      const response = await generate(
        "Return only these placeholders exactly once each, in a readable order. Add no words: {{RESULT}} {{FOLLOW_UP}}",
        onToken,
      );
      return renderNarration(plan, response.text);
    } catch {
      return { text: plan.fallback, usedModel: false, rejection: "generation-failed" };
    }
  }

  return Object.freeze({
    status,
    prepareDefault,
    interpret,
    narrate,
    cancel: () => boundedOperation(() => command("cancel"), { timeoutMs: 1000 }).catch(() => null),
    unload: () => boundedOperation(() => command("unload"), { timeoutMs: 2000 }).catch(() => null),
    benchmark: () => command("benchmark").catch(() => ({ benchmark: "unavailable" })),
  });
}

const defaultClient = createModelClient();

export async function modelStatus() {
  return defaultClient.status();
}

export async function prepareDefaultModel(modelId = "base") {
  return defaultClient.prepareDefault(modelId);
}

export async function narratePlan(plan, onToken) {
  return defaultClient.narrate(plan, onToken);
}

export const interpretQuestion = (question, onToken) => defaultClient.interpret(question, onToken);
export const cancelGeneration = () => defaultClient.cancel();
