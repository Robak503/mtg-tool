import path from "node:path";
import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";

let buildIdentity = "unknown";
try {
  const git = (args) => execFileSync("git", args, { cwd: import.meta.dirname, encoding: "utf8", windowsHide: true }).trim();
  buildIdentity = `${git(["rev-parse", "--short=12", "HEAD"])}${git(["status", "--porcelain", "--untracked-files=normal"]) ? "-dirty" : ""}`;
} catch { /* Source archives without Git still build with an honest unknown identity. */ }

export default defineConfig({
  base: "./",
  define: { __OMNATH_BUILD__: JSON.stringify(buildIdentity) },
  build: {
    target: "es2020",
  },
  server: {
    fs: {
      allow: [path.resolve(import.meta.dirname, "..")],
    },
  },
});
