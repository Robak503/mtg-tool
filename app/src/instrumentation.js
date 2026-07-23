/**
 * instrumentation.js — Next.js server-startup hook.
 *
 * Two boot tasks:
 *
 * 1. **Eager profiles migration** (BLOCKING, before any request): the client fires /api/profiles
 *    (migration) and /api/decks (read-then-write) concurrently on load; without an eager migration,
 *    /api/decks could read the legacy flat decks file via the pre-migration fallback and write it
 *    back into the freshly-created active profile, clobbering the per-owner split. So this must
 *    complete before requests are served — it's awaited.
 *
 * 2. **Card + rulings index pre-warm** (NON-BLOCKING, B3 cold-start): the oracle/rulings indexes
 *    load lazily on the first card lookup (chat, deck load, coverage) via a synchronous read. That
 *    first request otherwise pays the whole read. Warming it here means the cache is usually hot by
 *    the time the first request lands. Scheduled off the boot path via setImmediate so the window
 *    comes up first; the load is idempotent + cached (getCardIndex no-ops once warm), and a request
 *    that beats the warm simply loads it itself — there is no double-load, because the cache check
 *    and the synchronous build can't interleave in a single-threaded runtime. Best-effort: a failed
 *    warm just falls back to the lazy path and is logged, never thrown.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureMigrated } = await import("./lib/server/profiles.js");
      ensureMigrated();
    } catch (error) {
      // Never block server startup on migration — a per-profile route will
      // trigger it lazily as a fallback. Surface it for diagnostics.
      console.error("[profiles] startup migration failed:", error?.message || error);
    }

    // Pre-warm the card + rulings indexes AFTER boot (non-blocking — see task 2 above).
    setImmediate(async () => {
      try {
        const { getCardIndex, getRulingsIndex } = await import("./lib/server/cardIndex.js");
        getCardIndex();
        getRulingsIndex();
      } catch (error) {
        console.error(
          "[cardIndex] boot pre-warm failed (will load lazily):",
          error?.message || error,
        );
      }
    });
  }
}
