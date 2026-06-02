/** @type {import('next').NextConfig} */

// Content-Security-Policy (A6). Previously disabled (tauri.conf.json csp: null).
// We set it here, on the Node server that the Tauri webview loads from, rather
// than in tauri.conf — that keeps it to a single policy (no conflicting
// double-CSP) AND makes it verifiable in `next dev`/the browser preview, since
// the same header is enforced there.
//
// Notes on each directive:
//   - script/style 'unsafe-inline': Next.js injects inline bootstrap/hydration
//     scripts and the app uses inline <style> keyframes + style={} attributes.
//     Without it the window blanks. 'unsafe-eval' is kept in BOTH dev and prod
//     on purpose: dev needs it (HMR/React Refresh), and keeping prod identical
//     means the policy verified in the preview is exactly what ships — a
//     blank-window regression would otherwise auto-update to every user. The
//     residual eval risk is minimal for a local app running only its own
//     bundled code; the external-resource lockdown below is the real win.
//   - img 'self' data: blob:: all card art is proxied through same-origin
//     /api/art-crop; data:/blob: cover inline SVG/canvas.
//   - connect 'self' + Tauri ipc + (dev) ws: API calls are same-origin; the
//     Tauri webview talks to the Rust backend over the ipc scheme; dev needs the
//     HMR websocket.
//   - object/base/frame-ancestors/form-action: lock down the classic injection
//     and clickjacking vectors. The app loads no plugins, frames, or cross-origin
//     forms.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost${isDev ? " ws: http://localhost:3000" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  // standalone output bundles everything the Next.js server needs into
  // .next/standalone/ — used by the Tauri production build to ship a
  // self-contained binary that spawns node server.js on launch.
  // Has no effect on `next dev`; only applies to `next build`.
  //
  // Note: we deliberately do NOT set outputFileTracingExcludes here.
  // Adding it caused @vercel/nft to skip including the metadata
  // submodule of Next.js itself (`node_modules/next/dist/lib/metadata/`),
  // which the standalone server requires at startup. Instead, post-build
  // cleanup happens in scripts/strip-standalone-bloat.cjs — same effect,
  // doesn't break the tracer.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
