import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { interpretationPrompt, validateInterpretation } from "./interpretationContract.js";
import { renderNarration } from "./narrationContract.js";

export function createModelClient({
  invokeCommand = invoke,
  listen = addPluginListener,
  randomId = () => crypto.randomUUID(),
} = {}) {
  const command = (name, payload) =>
    invokeCommand(`plugin:omnath-model|${name}`, payload ? { payload } : undefined);

  async function status() {
    try { return await command("status"); } catch { return { state: "unavailable" }; }
  }

  async function prepareDefault(modelId = "base") {
    const current = await status();
    if (current.state === "ready") return current;
    let lastError;
    for (const candidate of [modelId, ...["base", "enhanced"].filter((id) => id !== modelId)]) {
      try { return await command("load_model", { modelId: candidate }); }
      catch (error) { lastError = error; }
    }
    return { state: "unavailable", error: lastError ? "model-load-failed" : "model-unavailable" };
  }

  async function generate(prompt, onToken) {
    const requestId = randomId();
    let tokenCount = 0;
    const listener = onToken
      ? await listen("omnath-model", "token", (event) => {
          if (event.requestId === requestId) onToken(++tokenCount);
        })
      : null;
    try {
      return await command("generate", { requestId, prompt });
    } finally {
      listener?.unregister();
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
    cancel: () => command("cancel").catch(() => null),
    unload: () => command("unload").catch(() => null),
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
