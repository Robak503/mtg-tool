const APP_VERSION = "0.1.0";

function safeCode(value) {
  const text = String(value ?? "");
  return /^[a-z0-9._-]{1,80}$/i.test(text) ? text : null;
}

function runtimeWitnesses(runtime) {
  const checks = Array.isArray(runtime?.checks) ? runtime.checks
    : runtime?.checks && typeof runtime.checks === "object" ? Object.entries(runtime.checks).map(([id, passed]) => ({ id, passed }))
    : Array.isArray(runtime?.results) ? runtime.results : [];
  const witnesses = checks
    .map(({ id, passed }) => ({ id: safeCode(id), passed: passed === true }))
    .filter(({ id }) => id);
  for (const [id, passed] of Object.entries(runtime?.realm ?? {})) {
    const safeId = safeCode(id);
    if (safeId) witnesses.push({ id: safeId, passed: passed === true });
  }
  return witnesses;
}

export function buildDiagnosticReceipt({ runtime, knowledge, model, lastOutcome, feedback, errorCode, generatedAt = new Date().toISOString() }) {
  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    app: { version: APP_VERSION, product: "Omnath MTG Assistant", offlineOnly: true, build: typeof __OMNATH_BUILD__ === "undefined" ? "development" : __OMNATH_BUILD__ },
    runtime: {
      passed: runtime?.passed === true,
      witnesses: runtimeWitnesses(runtime),
    },
    startup: { errorCode: safeCode(errorCode) },
    knowledge: {
      ready: knowledge?.ready === true,
      schemaVersion: Number(knowledge?.schemaVersion ?? 0),
      packId: safeCode(knowledge?.packId),
      databaseBytes: Number(knowledge?.databaseBytes ?? 0),
      databaseSha256: safeCode(knowledge?.databaseSha256),
      sourceDates: Object.fromEntries(Object.entries(knowledge?.sourceDates ?? {})
        .filter(([key, value]) => ["oracle", "rulings"].includes(key) && /^\d{4}-\d{2}-\d{2}$/.test(String(value)))),
      error: knowledge?.error ? "unavailable" : null,
      art: {
        ready: knowledge?.artReady === true,
        packId: safeCode(knowledge?.artPackId),
        databaseBytes: Number(knowledge?.artDatabaseBytes ?? 0),
        databaseSha256: safeCode(knowledge?.artDatabaseSha256),
        error: knowledge?.artError ? "unavailable" : null,
      },
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
