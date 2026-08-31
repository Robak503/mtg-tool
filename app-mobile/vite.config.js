import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
  },
  server: {
    fs: {
      allow: [path.resolve(import.meta.dirname, "..")],
    },
  },
});
