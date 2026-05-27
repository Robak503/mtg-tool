/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output bundles everything the Next.js server needs into
  // .next/standalone/ — used by the Tauri production build to ship a
  // self-contained binary that spawns node server.js on launch.
  // Has no effect on `next dev`; only applies to `next build`.
  output: "standalone",

  // Without these excludes, Next.js's output file tracing copies every
  // file referenced by `path.join(process.cwd(), "data", ...)` into the
  // standalone bundle — including all_cards.json (2.4GB), default_cards.json
  // (500MB), and other Scryfall bulk data. Total trace bloat: ~3.5GB.
  //
  // In production these directories live elsewhere:
  //   data/         → %APPDATA%\com.colton.mtg-tool\data\ (user-writable)
  //   mtg-judge/    → bundled as Tauri resources
  //   MTG ENGINE/   → bundled as Tauri resources
  // ...and the Rust shell sets MTG_APP_ROOT / MTG_JUDGE_DIR / MTG_ENGINE_DIR
  // env vars (see paths.js) so the server reads from the right places.
  outputFileTracingExcludes: {
    "*": [
      "data/**",
      "../mtg-judge/**",
      "../MTG ENGINE/**",
    ],
  },
};

export default nextConfig;
