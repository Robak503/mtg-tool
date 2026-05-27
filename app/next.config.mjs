/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output bundles everything the Next.js server needs into
  // .next/standalone/ — used by the Tauri production build to ship a
  // self-contained binary that spawns node server.js on launch.
  // Has no effect on `next dev`; only applies to `next build`.
  output: "standalone",
};

export default nextConfig;
