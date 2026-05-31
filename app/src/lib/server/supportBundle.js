/**
 * supportBundle.js — assemble a redacted diagnostics bundle for bug reports (D5,
 * PLAN B7). Pure: the route gathers the facts and hands them here.
 *
 * Privacy: ONLY app/runtime facts, data-file freshness, and content COUNTS are
 * included — never secrets/env/API keys and never the actual deck/chat content.
 */

export function buildSupportBundle({ app = {}, runtime = {}, data = {}, content = {} } = {}, generatedAt = new Date().toISOString()) {
  return {
    kind: "mtg-tool-support",
    generatedAt,
    app: {
      name: app.name ?? "MTG Tool",
      version: app.version ?? "unknown",
    },
    runtime: {
      platform: runtime.platform ?? null,
      arch: runtime.arch ?? null,
      node: runtime.node ?? null,
    },
    data,
    content,
  };
}

/** A compact, paste-friendly text rendering for dropping into a bug report. */
export function renderSupportText(bundle) {
  if (!bundle) return "";
  const L = [];
  L.push(`MTG Tool ${bundle.app?.version ?? "?"} — support info (${bundle.generatedAt})`);
  L.push(`Runtime: ${bundle.runtime?.platform ?? "?"}/${bundle.runtime?.arch ?? "?"} · node ${bundle.runtime?.node ?? "?"}`);
  const d = bundle.data || {};
  const dataBits = Object.keys(d).map(k => `${k}=${d[k]?.present ? (d[k].mtime || "present") : "missing"}`);
  if (dataBits.length) L.push(`Data: ${dataBits.join(", ")}`);
  const c = bundle.content || {};
  const contentBits = Object.keys(c).map(k => `${k}=${c[k]}`);
  if (contentBits.length) L.push(`Content: ${contentBits.join(", ")}`);
  return L.join("\n") + "\n";
}
