import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "../..");
const PROBE_ROOT = path.join(APP_ROOT, "src/lib/mobile/probe");
const TEMP_ROOT = path.resolve(os.tmpdir());
const OUTPUT_PREFIX = "omnath-webview-probe-";

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeOutputDirectory(outDir) {
  const resolved = path.resolve(outDir);
  if (!isWithin(resolved, TEMP_ROOT) || !path.basename(resolved).startsWith(OUTPUT_PREFIX)) {
    throw new Error(
      `Refusing WebView probe output outside an ${OUTPUT_PREFIX}* directory under ${TEMP_ROOT}`,
    );
  }
  return resolved;
}

export async function buildWebviewProbe({ outDir } = {}) {
  const resolvedOutDir = assertSafeOutputDirectory(
    outDir ?? fs.mkdtempSync(path.join(TEMP_ROOT, OUTPUT_PREFIX)),
  );
  fs.mkdirSync(resolvedOutDir, { recursive: true });

  await build({
    root: PROBE_ROOT,
    base: "./",
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      target: "es2020",
      outDir: resolvedOutDir,
      emptyOutDir: true,
      manifest: true,
      sourcemap: true,
      reportCompressedSize: false,
      rollupOptions: {
        input: path.join(PROBE_ROOT, "index.html"),
      },
    },
  });

  return {
    outDir: resolvedOutDir,
    indexHtml: path.join(resolvedOutDir, "index.html"),
    manifest: path.join(resolvedOutDir, ".vite/manifest.json"),
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await buildWebviewProbe();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
