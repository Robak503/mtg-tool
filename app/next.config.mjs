/** @type {import('next').NextConfig} */
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
};

export default nextConfig;
