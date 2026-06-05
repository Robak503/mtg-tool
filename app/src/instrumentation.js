/**
 * instrumentation.js — Next.js server-startup hook.
 *
 * Runs the one-time local-profiles migration eagerly when the server boots, so
 * it completes BEFORE any request is served. This closes a race: the client
 * fires /api/profiles (migration) and /api/decks (which reads-then-writes the
 * deck file) concurrently on load; without an eager migration, /api/decks could
 * read the legacy flat decks file via the pre-migration fallback and write it
 * back into the freshly-created active profile, clobbering the per-owner split.
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
  }
}
