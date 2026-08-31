const APP_VERSION = "0.1.0";

function safeCode(value) {
  const text = String(value ?? "");
  return /^[a-z0-9._-]{1,80}$/i.test(text) ? text : null;
}

export function buildDiagnosticReceipt({ runtime, knowledge, model, lastOutcome, feedback, generatedAt = new Date().toISOString() }) {
  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    app: { version: APP_VERSION, product: "Omnath MTG Assistant", offlineOnly: true },
    runtime: {
      passed: runtime?.passed === true,
      witnesses: Array.isArray(runtime?.results)
        ? runtime.results.map(({ id, passed }) => ({ id: safeCode(id), passed: passed === true })).filter(({ id }) => id)
        : [],
    },
    knowledge: {
      ready: knowledge?.ready === true,
      schemaVersion: Number(knowledge?.schemaVersion ?? 0),
      packId: safeCode(knowledge?.packId),
      databaseBytes: Number(knowledge?.databaseBytes ?? 0),
      databaseSha256: safeCode(knowledge?.databaseSha256),
    },
    model: { state: safeCode(model?.state), modelId: safeCode(model?.modelId) },
    lastOutcome: { status: safeCode(lastOutcome?.status), modelRejection: safeCode(lastOutcome?.modelRejection) },
    feedback: feedback ?? { schemaVersion: 1, totals: {}, outcomes: {}, modelRejections: {} },
  });
}

export async function copyDiagnosticReceipt(receipt, clipboard = globalThis.navigator?.clipboard) {
  const text = JSON.stringify(receipt, null, 2);
  if (!clipboard?.writeText) return { copied: false, text };
  try { await clipboard.writeText(text); return { copied: true, text }; }
  catch { return { copied: false, text }; }
}
