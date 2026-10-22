/**
 * engineBuild.bundled.test.js — the engine build stamp and the Academy autosave, run the way the app runs them:
 * bundled by Next's own webpack.
 *
 * Plain Node and vitest never bundle, so every other test passed while every bundled server failed. From
 * 2026-09-29 (v0.161.0) engineBuild() read package.json through `new URL("../../../package.json",
 * import.meta.url)`; Next's webpack (its server config sets `module.parser.javascript.url: "relative"`) rewrites
 * that into its own relative-URL object in dev and a "/_next/static/media/package.<hash>.json" asset URL in the
 * production build the exe ships, and `readFileSync` rejects both (ERR_INVALID_ARG_TYPE). autosaveSession builds
 * the save document with engineBuild() before it creates the save folder, so in `npm run dev` and in the exe no
 * Academy game was ever written to disk, and the routes' silent catch hid it.
 *
 * Here learnSaveStore.js + engineBuild.js are bundled with next/dist/compiled/webpack (the webpack `next dev` and
 * `next build` use) in both modes, with Next's parser setting and public path, then run from the bundle.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { engineBuild } from "./engineBuild.js";
import { loadSave } from "../server/learnSaveStore.js";

const require = createRequire(import.meta.url);
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let tmpDir;
let originalCwd;
beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-enginebuild-bundled-"));
});
afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Bundle an entry that re-exports engineBuild + autosaveSession, as Next's server compiler would, and load it. */
async function bundle(mode) {
  const wp = require(path.join(APP_DIR, "node_modules", "next", "dist", "compiled", "webpack", "webpack.js"));
  wp.init();
  const entry = path.join(tmpDir, "entry.js");
  const fwd = (p) => p.split(path.sep).join("/");
  fs.writeFileSync(
    entry,
    `export { engineBuild } from "${fwd(path.join(APP_DIR, "src", "lib", "learn", "engineBuild.js"))}";\n` +
      `export { autosaveSession } from "${fwd(path.join(APP_DIR, "src", "lib", "server", "learnSaveStore.js"))}";\n`,
  );
  const outDir = path.join(tmpDir, `out-${mode}`);
  const stats = await new Promise((resolve, reject) =>
    wp.webpack(
      {
        mode,
        devtool: false,
        target: "node",
        context: APP_DIR,
        entry,
        optimization: { minimize: false },
        output: { path: outDir, filename: "bundle.cjs", library: { type: "commonjs2" }, publicPath: "/_next/" },
        module: { parser: { javascript: { url: "relative" } } }, // as next/dist/build/webpack-config.js sets it
      },
      (err, s) => (err ? reject(err) : resolve(s)),
    ),
  );
  expect(stats.hasErrors() ? stats.toString({ all: false, errors: true }) : null).toBeNull();
  return require(path.join(outDir, "bundle.cjs"));
}

function liveSession(id) {
  return {
    id,
    createdAt: "2026-10-21T00:00:00.000Z",
    difficulty: "beginner",
    mode: "standard",
    status: "active",
    state: { turn: 3, step: "main", idSeq: 9, stack: [], players: { user: { life: 40 }, ai: { life: 38 } } },
    decisionLog: [],
    meta: { userDeckName: "Omnath, Locus of Mana" },
  };
}

async function outcome(fn) {
  try {
    return { value: await fn(), error: null };
  } catch (error) {
    return { value: null, error: `${error.code || error.name}: ${error.message}` };
  }
}

describe.each(["development", "production"])("bundled by Next's webpack (%s mode)", (mode) => {
  it("engineBuild() returns the source tree's stamp instead of throwing", async () => {
    const bundled = await bundle(mode);
    const stamp = await outcome(() => bundled.engineBuild());
    expect(stamp.error).toBeNull();
    expect(stamp.value).toBe(engineBuild());
  }, 60_000);

  it("autosaveSession writes the game to disk (the save `npm run dev` and the exe never wrote)", async () => {
    const bundled = await bundle(mode);
    process.chdir(tmpDir); // paths.js falls back to cwd with MTG_APP_ROOT unset: saves land in <tmp>/data/learn-sessions
    const saved = await outcome(() => bundled.autosaveSession(liveSession("learn-bundled-1")));
    expect(saved.error).toBeNull();
    expect(fs.existsSync(path.join(tmpDir, "data", "learn-sessions", "learn-bundled-1.json"))).toBe(true);
    const loaded = await loadSave("learn-bundled-1");
    expect(loaded.ok).toBe(true);
    expect(loaded.saveDoc.session.state.turn).toBe(3);
    expect(loaded.saveDoc.engineVersion).toBe(engineBuild());
  }, 60_000);
});
