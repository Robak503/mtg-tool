/**
 * arbiterVerdictStore.js — the DETERMINISM BOUNDARY for Arbiter-in-runner (Omnath sim-center handoff #2;
 * full design in docs/orchestration/ARBITER-IN-RUNNER-SPEC.md).
 *
 * A GATED card (one the native engine can't resolve) resolved by the Ollama Arbiter is EXPENSIVE and
 * NON-DETERMINISTIC, so a live LLM call can never sit inside the hashed self-play loop (it would break the
 * ×2-reproducible trajectory-hash guarantee). Resolution: resolve-ONCE → memoize a fixed structured VERDICT
 * here → replay deterministically. A one-time async PRE-PASS populates this cache off-loop; the hashed run does
 * only SYNCHRONOUS in-memory HIT lookups (getVerdict) — the engine never touches the network or fs.
 *
 * VERDICT shape: { atoms: [...], note?, source: "arbiter"|"manual", cardName } — `atoms` is an ordinary
 * effect-program atom list (the SAME shape effects/parser.js emits), applied via runEffectProgram by
 * applyArbiterVerdict. NEVER prose: the applier validates the atoms and no-ops on anything malformed, so a bad
 * ruling can never fabricate an effect (CREED — "incomplete but never wrong").
 *
 * The cache file (profilePath("arbiter-verdicts.json")) IS the determinism boundary: the ON-anchor is defined
 * relative to verdictCacheContentHash(cache), so changing any verdict deliberately shifts the anchor. With the
 * resolveArbiter hook OFF (default), NONE of this runs and the trajectory hash is byte-identical to today.
 */

import crypto from "node:crypto";

import { profilePath } from "../server/paths.js";
import { atomicWriteJson, readJsonSafe } from "../server/atomicJson.js";

const STORE_FILE = () => profilePath("arbiter-verdicts.json");

/**
 * Cache key. A CARD-INTRINSIC verdict (the effect is the same regardless of board — most of the ~30 repeat
 * cards, e.g. a fixed "draw a card" rider) keys on cardName alone, so Garruk's Uprising × N collapses to ONE
 * entry. A BOARD-DEPENDENT verdict appends a cheap situation signature (see progressSignature) so distinct
 * situations get distinct rulings. Pure + order-stable.
 */
export function verdictKey(cardName, situationSig = null) {
  const name = String(cardName || "").trim();
  return situationSig ? `${name}::${situationSig}` : name;
}

/** Load the persisted verdict cache into a plain in-memory object (async; call ONCE before a batch). {} if absent/corrupt. */
export async function loadVerdictCache() {
  const raw = await readJsonSafe(STORE_FILE());
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
}

/**
 * SYNCHRONOUS in-memory lookup — the ONLY path the hashed self-play loop touches. Tries the card+situation
 * key first, then falls back to the card-only (intrinsic) verdict. Returns null on a miss (⇒ the runner keeps
 * today's honest no-op; never fabricated). No fs, no crypto, no async — safe inside the sync advanceUntilDecision.
 */
export function getVerdict(cache, cardName, situationSig = null) {
  if (!cache) return null;
  if (situationSig) {
    const keyed = cache[verdictKey(cardName, situationSig)];
    if (keyed) return keyed;
  }
  return cache[verdictKey(cardName)] || null;
}

/** SYNC put into the in-memory cache (the pre-pass fills it, then persists once). Stamps source + cardName. Returns the cache. */
export function putVerdict(cache, cardName, verdict, situationSig = null) {
  if (!cache || !verdict) return cache;
  cache[verdictKey(cardName, situationSig)] = { source: "arbiter", ...verdict, cardName };
  return cache;
}

/** Persist the whole in-memory cache atomically (async; after the pre-pass). */
export async function saveVerdictCache(cache) {
  await atomicWriteJson(STORE_FILE(), cache || {});
}

/**
 * Content hash of the verdict set (16 hex). The Arbiter-ON trajectory anchor is defined RELATIVE to this: same
 * seed + same verdict set ⇒ same trajectory, so pinning the anchor also pins the cache. Canonical (sorted keys)
 * so it's insertion-order-independent. Determinism-safe (sha256, no Date/random).
 */
export function verdictCacheContentHash(cache) {
  const keys = Object.keys(cache || {}).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, cache[k]]));
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
