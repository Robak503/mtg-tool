/**
 * ENGINE PORTABILITY GUARD (ladder rung 0.6 — "Roots That Travel").
 *
 * The durable engine — the rules/play engine, the server-side data layer, and the API routes
 * over them — must stay platform-agnostic, so it can move to a Mac box (or run headless in a
 * bare Node harness, or in CI) as-is rather than being rewritten. The 2026-07-18 portability
 * audit found that boundary is *already* clean: zero `@tauri-apps` imports anywhere under
 * src/lib/learn, src/lib/server, or src/app/api. Only a handful of files in the tree touch
 * Tauri (MTGAssistant.jsx, mtg/UpdatesModal.jsx, mtg/FeedbackPanel.jsx, hooks/useTauriAppVersion.js)
 * — all shell-facing UI, correctly scoped.
 *
 * That cleanliness was ACCIDENTAL — observed, not enforced. This file makes it structural.
 * It is the same shape of guard as the mass-targetType partition and pendingChoiceKinds
 * contract: a boundary that is true today still erodes one PR at a time without something
 * that fails the build when it breaks.
 *
 * WHY IT MATTERS CONCRETELY: Tauri's APIs only exist inside the Tauri webview. Anything the
 * engine reaches that depends on them is code that cannot run under `npm test`, cannot run in
 * a headless server, and cannot port to another platform without being untangled first.
 * Catching that at the moment of the coupling — instead of at Mac-port time, or at a 3am prod
 * failure — is the entire point.
 *
 * WHAT THIS TEST DOES, and why each part is load-bearing:
 *
 *   1. DETECTS DYNAMIC IMPORTS, NOT JUST STATIC ONES. Every one of the real Tauri imports in
 *      this repo is a dynamic `await import("@tauri-apps/...")` — deliberately, so the web
 *      build degrades gracefully. A scanner that only understood `import X from "..."` would
 *      find nothing, pass green forever, and catch none of the leaks that can actually happen
 *      here. It would be a hollow gate. So the matcher covers static import/export-from,
 *      dynamic `import()` (including backtick specifiers and bundler comment pragmas like
 *      `/* @vite-ignore *\/`, which are *correlated* with conditional Tauri imports), and
 *      `require()`.
 *
 *   2. DETECTS THE GLOBAL-IPC PATH, NOT JUST IMPORTS. Tauri can be reached with no import at
 *      all, via `window.__TAURI_INTERNALS__.invoke(...)` / `window.__TAURI__` / a `tauri://`
 *      URL. That is not hypothetical — it is this repo's established idiom (every shell file
 *      listed above gates on exactly those globals). A dev copying that pattern into an engine
 *      file creates the precise coupling this guard exists to stop, so the globals are
 *      forbidden in the engine surface too.
 *
 *   3. FOLLOWS THE GRAPH, NOT JUST THE DIRECTORY. An engine file that imports a UI module that
 *      imports Tauri is just as broken as importing Tauri directly, and a flat per-directory
 *      grep would miss it entirely. So relative imports are resolved and walked transitively,
 *      out past the surface boundary, and a violation reports the full chain that reached it.
 *
 *   4. WITNESSES ITS OWN COVERAGE, INCLUDING THE WALKER. A scan that silently matched zero
 *      files would also report "no violations" and pass. So the test asserts a floor on files
 *      walked AND that the walk still leaves the surface at all. Critically, the graph walk is
 *      itself SEEN-TO-FAIL against a synthetic fixture tree (`scanFrom` on a temp dir with a
 *      deliberate 2-hop violation): without that, `resolveRelative` could regress to
 *      always-null, the transitive feature could die completely, and the file-count floor would
 *      still clear — a hollow gate hiding inside the anti-hollow-gate test.
 *
 * DIRECTIONAL BIAS: for a guard, a false negative is the forbidden direction — it is the exact
 * silent erosion this exists to prevent — while a false positive is loud, immediate, and
 * trivially fixed.
 *
 * KNOWN LIMIT, stated honestly: this is a static scanner, so a *deliberately* indirected
 * specifier defeats it (`const M = "@tauri-apps/api"; await import(M);`, or a `createRequire`
 * alias). Closing that needs real dataflow analysis. This guard is built to stop ACCIDENTAL
 * erosion — the ordinary PR that adds an ordinary import — not to withstand an adversary who
 * is deliberately smuggling the dependency past a test named "portability guard". The globals
 * check in (2) narrows this considerably, since indirected imports still have to *call*
 * something to be useful.
 *
 * Test files are excluded from the surface: they are dev-only, never shipped in the standalone
 * server bundle, and a test that stubs a Tauri module is not a portability break.
 *
 * vitest runs from the app/ package, so cwd-relative paths resolve here (same as
 * versionAlignment.test.js).
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * THE ENGINE SURFACE — the durable, must-stay-portable roots.
 *
 * Deliberately whole-directory rather than the audit's narrower file list (cardIndex, paths,
 * modelProvider, rulesRetrieval). Everything under src/lib/server is Node-side code that runs
 * in the spawned server process, where Tauri's webview APIs do not exist at all — so the
 * broader rule is both stricter and easier to reason about than an enumerated file list that
 * someone has to remember to extend when they add the 55th server module.
 */
const ENGINE_ROOTS = ["src/lib/learn", "src/lib/server", "src/app/api"];

/**
 * Individually-seeded engine files outside those roots. Both run in the spawned Node server
 * and both point *into* the surface (middleware -> server/originGuard, instrumentation ->
 * server/profiles), so nothing in the surface imports them and the graph walk would never
 * reach them on its own.
 */
const ENGINE_FILES = ["src/middleware.js", "src/instrumentation.js"];

/** The forbidden package scope. */
const FORBIDDEN_SCOPE = "@tauri-apps";

/**
 * Lower bound on files walked (seeds + everything reached transitively). Guards against the
 * scan silently matching nothing — a moved root, a broken walker — and reporting a vacuous
 * green. Measured at the time of writing: 255 seeds, 260 scanned. 235 leaves real churn room
 * (files get deleted in normal refactors) while still catching a root that stops resolving.
 */
const MIN_SCANNED_FILES = 235;

/**
 * Extensions the walker seeds and resolves. Deliberately wider than what exists today (the
 * tree is all .js/.jsx): Next 15 accepts a stray .ts/.mjs with no config change, and a
 * `bridge.mjs` under src/lib/server would otherwise be invisible to this guard twice over —
 * never seeded, and dropped as an unresolvable edge.
 */
const SOURCE_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const isTestFile = (f) => /\.test\.(js|jsx|mjs|cjs|ts|tsx)$/.test(f);

const QUOTE = "[\"'`]"; // backticks included: `await import(`@tauri-apps/api`)` must not slip through.
const NOT_QUOTE = "[^\"'`]";
// Bundler pragmas (`/* @vite-ignore */`, `/* webpackIgnore: true */`) sit between the paren and
// the specifier, and are exactly what someone adds to a conditional Tauri import.
const PRAGMA = "(?:/\\*[\\s\\S]*?\\*/\\s*)*";

/**
 * Matchers for every syntactic position a module specifier can appear in.
 *
 * The bare side-effect form is anchored to a statement boundary (line start, `;`, or `}`)
 * rather than allowing any preceding character. That keeps prose from tripping the guard —
 * an error string like `throw new Error("do not import '@tauri-apps/api' here")` has a word
 * before `import`, so it is correctly ignored, while `import"@tauri-apps/x"` (minified, no
 * space) is still caught.
 */
function specifierPatterns(prefix) {
  return [
    // import "@tauri-apps/x";  (statement-anchored)
    new RegExp(`(?:^|[;}])\\s*import\\s*${QUOTE}(${prefix}${NOT_QUOTE}*)${QUOTE}`, "gm"),
    // import X from "…" | import {a} from "…" | export * from "…"  (all end in a from-clause)
    new RegExp(`\\bfrom\\s*${QUOTE}(${prefix}${NOT_QUOTE}*)${QUOTE}`, "g"),
    // await import("…")  <- the form this repo actually uses
    new RegExp(`\\bimport\\s*\\(\\s*${PRAGMA}${QUOTE}(${prefix}${NOT_QUOTE}*)${QUOTE}`, "g"),
    // require("…")
    new RegExp(`\\brequire\\s*\\(\\s*${PRAGMA}${QUOTE}(${prefix}${NOT_QUOTE}*)${QUOTE}`, "g"),
  ];
}

const TAURI_IMPORT_PATTERNS = specifierPatterns("@tauri-apps");
const RELATIVE_IMPORT_PATTERNS = specifierPatterns("\\.");

/**
 * Tauri's import-free escape hatch. These globals are injected by the Tauri webview, so any
 * engine file referencing them is coupled to the shell just as hard as an import would be —
 * and this is the idiom the repo's own shell files use, making it the likeliest thing to get
 * copy-pasted into engine code.
 */
const TAURI_GLOBAL_PATTERNS = [
  /\b__TAURI_INTERNALS__\b/g,
  /\b__TAURI__\b/g,
  new RegExp(`${QUOTE}tauri://`, "g"),
];

/**
 * NARROW, DOCUMENTED EXCEPTIONS.
 *
 * Each entry needs a reason that survives the question "would this still work on the Mac box?".
 * Naming a Tauri string is not automatically coupling — depending on Tauri's runtime is. An
 * exception is only legitimate when the code is inert on other platforms.
 *
 * This list polices itself: a test below fails if an exception stops matching anything, so a
 * stale allowance gets deleted instead of quietly widening the guard forever.
 */
const DOCUMENTED_EXCEPTIONS = [
  {
    file: "src/lib/server/originGuard.js",
    contains: "tauri://",
    why:
      "A literal in the CSRF Origin allowlist, not a call into Tauri. originGuard.js is pure and " +
      "dependency-free; on a non-Tauri platform the entry simply never matches an incoming Origin " +
      "header. Nothing about it needs the shell to be present, so it does not block portability.",
  },
];

function isExcepted(violationFile, what) {
  return DOCUMENTED_EXCEPTIONS.some((e) => e.file === violationFile && what.includes(e.contains));
}

/** All Tauri coupling in one file: imports by specifier, plus global/IPC references. */
function tauriCouplingIn(source) {
  const found = new Set();
  for (const re of TAURI_IMPORT_PATTERNS) {
    for (const m of source.matchAll(re)) found.add(`import of ${m[1]}`);
  }
  for (const re of TAURI_GLOBAL_PATTERNS) {
    for (const m of source.matchAll(re)) found.add(`Tauri global/IPC reference: ${m[0]}`);
  }
  return [...found];
}

/** Every relative specifier in a file, so the graph can be walked past the surface boundary. */
function relativeSpecifiersIn(source) {
  const found = new Set();
  for (const re of RELATIVE_IMPORT_PATTERNS) {
    for (const m of source.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

/**
 * Resolve a relative specifier to a real SOURCE file, mirroring Node/bundler extension
 * resolution. Only source extensions are followed: a few engine modules import package.json
 * for the version string, and while scanning it is harmless (a dependency declaration is not
 * an import, so it never matches), walking data files is not what this guard is for.
 */
function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    ...(SOURCE_EXTENSIONS.includes(path.extname(base)) ? [base] : []),
    ...SOURCE_EXTENSIONS.map((e) => base + e),
    ...SOURCE_EXTENSIONS.map((e) => path.join(base, "index" + e)),
  ];
  for (const c of candidates) {
    // statSync (not the dirent type) so a symlinked/junctioned file still resolves — this repo
    // uses git worktrees and junctions.
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null; // JSON/asset/unresolvable — nothing further to walk.
}

function walkSourceFiles(dir) {
  // Explicit, actionable failure instead of a raw ENOENT stack: the scan runs at module load
  // (so the whole file errors out) and a moved/renamed engine root is the likeliest cause.
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Engine portability guard: engine root not found — ${relative(dir)}. ` +
        `If the engine surface moved, update ENGINE_ROOTS in this file so the guard keeps covering it.`,
    );
  }
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // statSync follows symlinks/junctions, so a symlinked subtree is not silently skipped
    // (a bare `entry.isDirectory()` is false for a directory symlink, dropping it entirely).
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkSourceFiles(full));
    else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && !isTestFile(entry.name))
      out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

/**
 * Walk from the given seed files across every relative import, returning violations (each with
 * the import chain that reached it) plus the set of files actually scanned.
 *
 * Parameterised by seeds so the graph walk can be exercised against a synthetic fixture tree —
 * see the SEEN-TO-FAIL block at the bottom of this file.
 */
function scanFrom(seedFiles) {
  const violations = [];
  const excepted = [];
  const scanned = new Set();
  // chain = the import path taken from a seed to the current file.
  const queue = seedFiles.map((f) => ({ file: f, chain: [f] }));

  while (queue.length) {
    const { file, chain } = queue.shift();
    if (scanned.has(file)) continue;
    scanned.add(file);

    const source = fs.readFileSync(file, "utf8");

    for (const what of tauriCouplingIn(source)) {
      // Exceptions are keyed to the file the coupling was FOUND in (chain's tail), not the seed.
      if (isExcepted(relative(file), what)) {
        excepted.push({ file: relative(file), what });
        continue;
      }
      violations.push({ what, chain: chain.map(relative) });
    }

    for (const specifier of relativeSpecifiersIn(source)) {
      const resolved = resolveRelative(file, specifier);
      // Test files are excluded from the surface, and so from the graph: an engine module
      // never imports a test, and a test that stubs Tauri is not a portability break.
      if (resolved && !scanned.has(resolved) && !isTestFile(path.basename(resolved))) {
        queue.push({ file: resolved, chain: [...chain, resolved] });
      }
    }
  }

  return { violations, excepted, scanned };
}

function engineSeeds() {
  const fromRoots = ENGINE_ROOTS.flatMap((r) => walkSourceFiles(path.join(process.cwd(), r)));
  const fromFiles = ENGINE_FILES.map((f) => path.join(process.cwd(), f)).filter((f) =>
    fs.existsSync(f),
  );
  return [...fromRoots, ...fromFiles];
}

function describeViolations(violations) {
  return violations
    .map(({ what, chain }) => {
      const how =
        chain.length === 1 ? `in ${chain[0]}` : `reached via: ${chain.join("\n           -> ")}`;
      return `  * ${what}\n           ${how}`;
    })
    .join("\n");
}

describe("engine portability — the engine surface must not couple to the Tauri shell", () => {
  const seeds = engineSeeds();
  const { violations, excepted, scanned } = scanFrom(seeds);

  it("reaches no Tauri coupling from anywhere in the engine surface", () => {
    expect(
      violations,
      violations.length === 0
        ? ""
        : [
            "",
            `PORTABILITY BREAK: the durable engine now couples to the Tauri shell.`,
            "",
            describeViolations(violations),
            "",
            `The engine surface (${ENGINE_ROOTS.join(", ")}) must stay platform-agnostic:`,
            "it runs in the spawned Node server and in bare `npm test`, where the Tauri webview",
            `APIs (${FORBIDDEN_SCOPE}/*, window.__TAURI_INTERNALS__) do not exist. Coupling here`,
            "breaks headless runs and blocks porting to another platform.",
            "",
            "FIX: move the Tauri-dependent code into the shell/UI layer (see MTGAssistant.jsx,",
            "mtg/UpdatesModal.jsx, hooks/useTauriAppVersion.js for the correctly-scoped pattern),",
            "and have the engine expose a platform-neutral seam the shell calls into instead.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  // COVERAGE WITNESS: proves the assertion above was applied to a real corpus, so a broken
  // walker or a moved root can never present as a clean pass.
  it("actually scanned the engine surface (not a vacuous pass)", () => {
    expect(scanned.size).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);

    for (const root of ENGINE_ROOTS) {
      const abs = path.join(process.cwd(), root);
      expect(fs.existsSync(abs), `engine root missing — update ENGINE_ROOTS: ${root}`).toBe(true);
      const fromRoot = [...scanned].filter((f) => f.startsWith(abs + path.sep));
      expect(fromRoot.length, `no files scanned under ${root}`).toBeGreaterThan(0);
    }
  });

  // Keeps the exception list honest: an allowance that no longer matches anything is dead
  // weight that silently widens the guard, so it must be deleted rather than left to rot.
  it("has no stale documented exceptions", () => {
    for (const e of DOCUMENTED_EXCEPTIONS) {
      const used = excepted.some((x) => x.file === e.file && x.what.includes(e.contains));
      expect(
        used,
        `Stale exception: ${e.file} no longer contains "${e.contains}". ` +
          `Delete it from DOCUMENTED_EXCEPTIONS so the guard stops carrying an unused allowance.`,
      ).toBe(true);
    }
  });

  // Live-tree witness that the transitive walk is still doing something on the REAL graph:
  // the engine reaches a handful of shared lib modules (goldfish, agents, deck/*, gameInsights).
  // If this drops to zero, either the engine genuinely stopped importing anything outside the
  // roots, or the walker broke — both worth a human look.
  it("still leaves the engine roots when following imports", () => {
    const rootPaths = ENGINE_ROOTS.map((r) => path.join(process.cwd(), r) + path.sep);
    const outside = [...scanned].filter((f) => !rootPaths.some((r) => f.startsWith(r)));
    expect(
      outside.length,
      "the transitive walk reached nothing outside the engine roots — the graph walk may be broken",
    ).toBeGreaterThan(0);
  });

  // SEEN-TO-FAIL: the matcher is exercised against synthetic sources, so if a future edit breaks
  // it the failure surfaces as a red test rather than a permanently-green guard that quietly
  // stopped guarding.
  describe("the detector itself", () => {
    const shouldMatch = {
      "static default import": 'import updater from "@tauri-apps/plugin-updater";',
      "static named import": 'import { relaunch } from "@tauri-apps/plugin-process";',
      "bare side-effect import": 'import "@tauri-apps/api";',
      "single quotes": "import { relaunch } from '@tauri-apps/plugin-process';",
      "re-export": 'export * from "@tauri-apps/api/app";',
      // The form every real Tauri import in this repo actually uses.
      "dynamic await import": 'const app = await import("@tauri-apps/api/app");',
      "dynamic import, no await": 'void import("@tauri-apps/plugin-autostart");',
      "dynamic import with whitespace": 'await import(  "@tauri-apps/api/window"  );',
      "backtick specifier": "await import(`@tauri-apps/api/app`);",
      "vite-ignore pragma": 'await import(/* @vite-ignore */ "@tauri-apps/api/app");',
      "webpackIgnore pragma": 'await import(/* webpackIgnore: true */ "@tauri-apps/api/app");',
      "minified, no whitespace": 'import{relaunch}from"@tauri-apps/plugin-process";',
      require: 'const app = require("@tauri-apps/api/app");',
      "multiline named import":
        'import {\n  check,\n  relaunch,\n} from "@tauri-apps/plugin-updater";',
      // Import-free coupling — the repo's own shell idiom.
      "__TAURI_INTERNALS__ global":
        'const v = await window.__TAURI_INTERNALS__.invoke("plugin:app|version");',
      "__TAURI__ global":
        "if (typeof window !== 'undefined' && window.__TAURI__) { doShellThing(); }",
      "tauri:// URL": 'fetch("tauri://localhost/thing");',
    };

    for (const [label, source] of Object.entries(shouldMatch)) {
      it(`detects ${label}`, () => {
        expect(tauriCouplingIn(source).length).toBeGreaterThan(0);
      });
    }

    it("does not flag unrelated imports", () => {
      const clean = [
        'import fs from "node:fs";',
        'import { cardIndex } from "./cardIndex.js";',
        'const mod = await import("./learnSession.js");',
        // A string that merely contains the scope name is not an import of it.
        'const docsUrl = "https://example.test/@tauri-apps/guide";',
        // Prose about the rule must not trip the rule (statement-anchored bare-import matcher).
        "throw new Error(\"do not import '@tauri-apps/api' from the engine\");",
      ].join("\n");
      expect(tauriCouplingIn(clean)).toEqual([]);
    });

    it("resolves relative specifiers so the graph walk can leave the surface", () => {
      const source =
        'import { dataPath } from "./server/paths.js";\nawait import("../hooks/useTauriAppVersion.js");';
      expect(relativeSpecifiersIn(source).sort()).toEqual([
        "../hooks/useTauriAppVersion.js",
        "./server/paths.js",
      ]);
    });
  });

  /**
   * SEEN-TO-FAIL for the GRAPH WALK — the part that cannot be witnessed on the live tree.
   *
   * Without this, `resolveRelative` could regress to always-null: the transitive feature would
   * be entirely dead, the scan would still cover every seed, the file-count floor would still
   * clear, and this guard would report green while no longer catching indirect coupling at all.
   * A fixture tree with a deliberate 2-hop violation is the only thing that actually proves the
   * walk works, so it lives here permanently instead of as a one-off manual probe.
   */
  describe("the graph walk itself", () => {
    function fixtureTree(files) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-portability-"));
      for (const [rel, body] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, body, "utf8");
      }
      return dir;
    }

    it("catches a violation two hops out and reports the whole chain", () => {
      const dir = fixtureTree({
        "engine/seed.js":
          'import { helper } from "../ui/helper.js";\nexport const go = () => helper();',
        "ui/helper.js":
          'export const helper = async () => (await import("@tauri-apps/api/app")).getVersion();',
      });
      try {
        const { violations, scanned } = scanFrom([path.join(dir, "engine/seed.js")]);
        expect(violations).toHaveLength(1);
        expect(violations[0].what).toContain("@tauri-apps/api/app");
        // The chain must name BOTH files — the seed alone would not tell anyone where to look.
        expect(violations[0].chain).toHaveLength(2);
        expect(violations[0].chain[0]).toContain("seed.js");
        expect(violations[0].chain[1]).toContain("helper.js");
        expect(scanned.size).toBe(2);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("terminates on an import cycle instead of spinning", () => {
      const dir = fixtureTree({
        "a.js": 'import "./b.js";',
        "b.js": 'import "./a.js";\nconst v = window.__TAURI__;',
      });
      try {
        const { violations, scanned } = scanFrom([path.join(dir, "a.js")]);
        expect(scanned.size).toBe(2);
        expect(violations).toHaveLength(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("resolves extensionless, index, and non-.js source specifiers", () => {
      const dir = fixtureTree({
        "from.js": "",
        "target.js": "",
        "bridge.mjs": "",
        "pkg/index.js": "",
      });
      try {
        const from = path.join(dir, "from.js");
        expect(resolveRelative(from, "./target")).toBe(path.join(dir, "target.js"));
        expect(resolveRelative(from, "./target.js")).toBe(path.join(dir, "target.js"));
        expect(resolveRelative(from, "./bridge.mjs")).toBe(path.join(dir, "bridge.mjs"));
        expect(resolveRelative(from, "./pkg")).toBe(path.join(dir, "pkg", "index.js"));
        expect(resolveRelative(from, "./nope")).toBeNull();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
