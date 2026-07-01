/**
 * originGuard.js — cross-origin write protection for the local server.
 *
 * The Next server binds to 127.0.0.1:3000, but "local" does not mean
 * "private": any website open in any browser on the same machine can fire
 * no-cors POSTs at http://127.0.0.1:3000/api/* (no preflight for simple
 * content types). The response stays unreadable cross-origin, but the side
 * effects happen — import-all overwrite, deck replace, collection
 * DELETE?confirm=true, chat-stream with provider "anthropic" (spends API
 * credits), install-ollama, sync-data. Classic drive-by localhost CSRF.
 *
 * Policy (enforced by src/middleware.js for /api/*):
 *   - Safe methods (GET/HEAD/OPTIONS) always pass.
 *   - Requests WITHOUT an Origin header pass: curl/scripts, server-side
 *     callers, and non-CORS navigations don't send one. Browsers attach
 *     Origin to every POST/PUT/PATCH/DELETE they issue, so a browser can't
 *     reach a write route without going through the allowlist.
 *   - Requests WITH an Origin header must match the local allowlist exactly;
 *     anything else — a website, or "null" from a sandboxed iframe — is 403'd.
 *
 * If the server port ever changes, update the allowlist alongside it.
 *
 * Dependency-free and pure so it runs in the middleware runtime unchanged and
 * is unit-testable directly (vitest imports route handlers, not the server,
 * so this logic must not live only inside the middleware wrapper).
 */

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000", // packaged .exe webview + local browser
  "http://localhost:3000", // dev browser
  "tauri://localhost", // Tauri-served pages (defensive)
]);

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * True when a request carrying this Origin header value may perform writes.
 * `null`/absent means "no Origin header" and passes (see policy above).
 * Comparison is exact — browsers send the header lowercased and without a
 * trailing slash, which is what the allowlist stores.
 */
export function isAllowedOrigin(origin) {
  if (origin === null || origin === undefined || origin === "") return true;
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * Decide whether a request must be blocked. Pure: takes the HTTP method and
 * the Origin header value (string or null) rather than a Request object.
 */
export function shouldBlockOrigin(method, origin) {
  if (!STATE_CHANGING_METHODS.has(String(method || "").toUpperCase())) return false;
  return !isAllowedOrigin(origin);
}
