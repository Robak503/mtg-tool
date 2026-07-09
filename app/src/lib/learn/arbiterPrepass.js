/**
 * arbiterPrepass.js — the OFF-LOOP cache warmer for Arbiter-in-runner (Piece 4; spec:
 * docs/orchestration/ARBITER-IN-RUNNER-SPEC.md). Runs BEFORE the hashed self-play batch: for each gated card it
 * calls a PLUGGABLE `resolve(pa) → verdict|null`, validates the verdict structurally, and writes it to the
 * verdict cache. The hashed run then replays synchronously off the warm, frozen cache (no LLM in the loop).
 *
 * The verdict SOURCE is pluggable BY DESIGN (mirrors the `--pilot` seam): the injection point + cache + validation
 * are here; the ruling generator (a tuned structured-Ollama resolver, or a CURATED hand-authored verdict set — the
 * reliable near-term source, since a small model can't emit valid MTG-Tool atom programs) is provided by the
 * caller. Because applyArbiterVerdict already rejects any un-applyable verdict at apply time (→ honest no-op), a
 * bad ruling is never fabricated; this pre-validation just keeps garbage OUT of the cache (and out of the ON-anchor).
 */

import { KNOWN_ATOM_OPS } from "./effects/parser.js";
import { getVerdict, putVerdict } from "./arbiterVerdictStore.js";

// KNOWN_ATOM_OPS is exported as a frozen ARRAY; a Set gives O(1) per-atom membership in the validator.
const KNOWN_OPS = new Set(KNOWN_ATOM_OPS);

/**
 * STATIC applyability check — a cheap, state-free approximation of applyArbiterVerdict's runtime gate, used to
 * filter obvious garbage before caching. Requires: a non-empty atoms array where EVERY atom has a string `op`
 * that OWNS A RESOLVER (KNOWN_ATOM_OPS) and is neither targeted nor optional (those reject in the applier). It
 * canNOT catch the resolver-returns-null / pendingChoice cases (those need a live state) — the applier is still
 * the final authority — but it stops a hallucinated / malformed ruling from ever entering the cache.
 */
export function verdictLooksApplyable(verdict) {
  const atoms = Array.isArray(verdict?.atoms) ? verdict.atoms : null;
  if (!atoms || atoms.length === 0) return false;
  return atoms.every((a) => a && typeof a.op === "string" && KNOWN_OPS.has(a.op) && !a.optional && !a.targetType);
}

/**
 * Warm the verdict cache for a set of gated pendingArbiter descriptors. DEDUPES by card-only key first (Garruk's
 * Uprising × 307 → ONE resolve call), so the repeat-heavy corpus is cheap. `resolve` may be async (an LLM call).
 * A resolver throw / null / un-applyable verdict is skipped (never cached, never fabricated). Returns
 * { cache, resolved, skipped, errors } — pure bookkeeping; the caller persists via saveVerdictCache.
 *
 * @param {Array<{cardName:string,...}>} gatedPAs  pendingArbiter-shaped descriptors of the gated cards
 * @param {{ resolve:(pa)=>Promise<object|null>|object|null, cache?:object, validate?:(v,pa)=>boolean }} opts
 */
export async function warmArbiterCache(gatedPAs, { resolve, cache = {}, validate = verdictLooksApplyable } = {}) {
  if (typeof resolve !== "function") throw new Error("warmArbiterCache: opts.resolve must be a function (pa)->verdict|null");
  let resolved = 0, skipped = 0, errors = 0;
  const seen = new Set();
  for (const pa of Array.isArray(gatedPAs) ? gatedPAs : []) {
    const name = pa?.cardName;
    if (!name || seen.has(name)) continue; // dedup within this run
    seen.add(name);
    if (getVerdict(cache, name)) continue; // already cached from a prior warm — reuse, don't re-query
    let verdict;
    try {
      verdict = await resolve(pa);
    } catch {
      errors += 1;
      continue;
    }
    if (verdict && (!validate || validate(verdict, pa))) {
      putVerdict(cache, name, verdict);
      resolved += 1;
    } else {
      skipped += 1;
    }
  }
  return { cache, resolved, skipped, errors };
}
