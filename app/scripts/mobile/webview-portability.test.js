import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOBILE_RUNTIME_MANIFEST } from "../../src/lib/mobile/runtimeManifest.js";
import {
  describeWebviewViolations,
  moduleSpecifiersIn,
  scanWebviewRuntime,
} from "./webview-portability.mjs";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..");

function fixture(files) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omnath-webview-portability-"));
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(workspaceRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source, "utf8");
  }
  return workspaceRoot;
}

function fixtureManifest(entrypoint = "app/src/runtime.js") {
  return {
    entrypoints: [{ id: "fixture", file: entrypoint, exports: [] }],
    allowedPackages: [],
    forbiddenPathPrefixes: ["app/src/lib/server/", "app/src/app/api/", "app/scripts/"],
  };
}

describe("Omnath mobile WebView portability contract", () => {
  it("keeps the declared runtime graph free of Node, server, and unapproved package imports", () => {
    const result = scanWebviewRuntime({
      workspaceRoot: WORKSPACE_ROOT,
      manifest: MOBILE_RUNTIME_MANIFEST,
    });

    expect(result.violations, describeWebviewViolations(result.violations)).toEqual([]);
    expect(result.scanned).toContain("app/src/lib/mobile/runtime.js");
    expect(result.scanned).toContain("app/src/lib/learn/coverage.js");
    expect(result.scanned).toContain("app/src/lib/learn/legalChoices.js");
    // Measured at introduction: 97 files. Keep enough deletion/refactor room
    // while still making an empty or one-hop-only scan impossible to pass.
    expect(result.scanned.length).toBeGreaterThanOrEqual(90);
  });

  it("extracts static, dynamic, re-export, and require specifiers", () => {
    const source = [
      'import "./side-effect.js";',
      'export { x } from "./leaf.js";',
      'const dynamic = await import(/* @vite-ignore */ "node:fs");',
      'const legacy = require("path");',
    ].join("\n");
    expect(moduleSpecifiersIn(source).sort()).toEqual([
      "./leaf.js",
      "./side-effect.js",
      "node:fs",
      "path",
    ]);
  });

  it("does not treat comments or game text containing import-like prose as dependencies", () => {
    const source = [
      '// import fs from "node:fs";',
      '/* export { read } from "./server/read.js"; */',
      'const oracle = "Whenever a creature enters from exile, draw a card.";',
      "const diagnostic = \"do not import '@tauri-apps/api' here\";",
    ].join("\n");
    expect(moduleSpecifiersIn(source)).toEqual([]);
  });

  it("is seen to fail on a two-hop Node builtin import", () => {
    const workspaceRoot = fixture({
      "app/src/runtime.js": 'export { bridge } from "./bridge.js";',
      "app/src/bridge.js": 'import fs from "node:fs"; export const bridge = fs;',
    });
    try {
      const result = scanWebviewRuntime({ workspaceRoot, manifest: fixtureManifest() });
      expect(result.violations).toEqual([
        expect.objectContaining({
          kind: "node-builtin",
          specifier: "node:fs",
          chain: ["app/src/runtime.js", "app/src/bridge.js"],
        }),
      ]);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("is seen to fail when a transitive import reaches server-only source", () => {
    const workspaceRoot = fixture({
      "app/src/runtime.js": 'export { bridge } from "./bridge.js";',
      "app/src/bridge.js": 'export { read } from "./lib/server/read.js";',
      "app/src/lib/server/read.js": "export const read = () => null;",
    });
    try {
      const result = scanWebviewRuntime({ workspaceRoot, manifest: fixtureManifest() });
      expect(result.violations).toEqual([
        expect.objectContaining({
          kind: "forbidden-source-path",
          chain: ["app/src/runtime.js", "app/src/bridge.js", "app/src/lib/server/read.js"],
        }),
      ]);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("fails closed on missing entrypoints and unresolved relative imports", () => {
    const workspaceRoot = fixture({
      "app/src/runtime.js": 'export { missing } from "./missing.js";',
    });
    try {
      const missingImport = scanWebviewRuntime({
        workspaceRoot,
        manifest: fixtureManifest(),
      });
      expect(missingImport.violations).toEqual([
        expect.objectContaining({
          kind: "unresolved-relative-import",
          specifier: "./missing.js",
        }),
      ]);

      const missingEntrypoint = scanWebviewRuntime({
        workspaceRoot,
        manifest: fixtureManifest("app/src/does-not-exist.js"),
      });
      expect(missingEntrypoint.violations).toEqual([
        expect.objectContaining({ kind: "missing-entrypoint" }),
      ]);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
