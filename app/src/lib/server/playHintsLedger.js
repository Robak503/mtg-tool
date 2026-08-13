/**
 * playHintsLedger.js — server-side loader for the PLAY-HINTS LEDGER (2026-08-12; design:
 * docs/orchestration/PLAY-HINTS-LEDGER.md). The engine stays file-free: THIS module does the read, the
 * learn API routes thread the result into advanceUntilDecision as `policy.playHints`, and
 * opponentAI's scorer consumes it (ledger entry first, derived role otherwise — lookupPlayHint).
 *
 * The ledger is written by `scripts/warm-play-hints.mjs` to the writable data dir
 * (card-play-hints.json — dataPath's read-or-write semantics find it). Lazily cached, mtime-checked,
 * so a re-warm is picked up without a server restart. An absent/corrupt file returns null — callers
 * thread `loadPlayHints() || true`, so the Academy runs DERIVATION-ONLY rather than hint-blind when
 * the ledger has never been warmed. Self-play is deliberately NOT wired here (the frozen trajectory-
 * hash contract; it opts in via its own advanceOpts when a probe wants it).
 */
import fs from "node:fs";

import { dataPath } from "./paths.js";

let cache = null; // { mtimeMs, hints }

export function loadPlayHints() {
  try {
    const p = dataPath("card-play-hints.json");
    const st = fs.statSync(p);
    if (!cache || cache.mtimeMs !== st.mtimeMs) {
      const doc = JSON.parse(fs.readFileSync(p, "utf8"));
      cache = { mtimeMs: st.mtimeMs, hints: doc?.hints && typeof doc.hints === "object" ? doc.hints : null };
    }
    return cache.hints;
  } catch {
    return null; // unwarmed / unreadable → the caller falls back to derivation-only (never a crash)
  }
}
