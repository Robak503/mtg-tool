export const FEEDBACK_SCHEMA_VERSION = 1;
const STORAGE_KEY = "omnath.feedback.v1";

function emptyFeedback() {
  return { schemaVersion: FEEDBACK_SCHEMA_VERSION, totals: { helpful: 0, notHelpful: 0, corrected: 0 }, outcomes: {}, modelRejections: {} };
}

function nonNegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }

function sanitize(raw) {
  if (!raw || raw.schemaVersion !== FEEDBACK_SCHEMA_VERSION) return emptyFeedback();
  const clean = emptyFeedback();
  for (const key of Object.keys(clean.totals)) clean.totals[key] = nonNegativeInteger(raw.totals?.[key]);
  for (const [key, value] of Object.entries(raw.outcomes ?? {})) if (/^[a-z_-]{1,40}$/i.test(key)) clean.outcomes[key] = nonNegativeInteger(value);
  for (const [key, value] of Object.entries(raw.modelRejections ?? {})) if (/^[a-z_-]{1,40}$/i.test(key)) clean.modelRejections[key] = nonNegativeInteger(value);
  return clean;
}

export function createFeedbackStore(storage, key = STORAGE_KEY) {
  const read = () => {
    try { return sanitize(JSON.parse(storage?.getItem(key) ?? "null")); }
    catch { return emptyFeedback(); }
  };
  const write = (value) => {
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
    return value;
  };
  const increment = (record, group, value) => {
    if (!value || !/^[a-z_-]{1,40}$/i.test(value)) return;
    record[group][value] = nonNegativeInteger(record[group][value]) + 1;
  };
  return Object.freeze({
    snapshot: () => Object.freeze(read()),
    recordRating({ rating, status, modelRejection }) {
      if (!new Set(["helpful", "notHelpful"]).has(rating)) return read();
      const record = read();
      record.totals[rating] += 1;
      increment(record, "outcomes", status);
      increment(record, "modelRejections", modelRejection);
      return write(record);
    },
    recordCorrection({ status } = {}) {
      const record = read();
      record.totals.corrected += 1;
      increment(record, "outcomes", status);
      return write(record);
    },
    clear() {
      try { storage?.removeItem(key); } catch { /* storage is optional */ }
      return emptyFeedback();
    },
  });
}
