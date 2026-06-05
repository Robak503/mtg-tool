/**
 * /api/first-launch — detect fresh-install state + import user data.
 *
 * In the bundled Tauri .exe, MTG_APP_ROOT is set to
 * %APPDATA%\com.colton.mtg-tool\ which starts empty on first launch
 * (the Rust shell only seeds the slim oracle-index). This route lets
 * the UI prompt the user to import their existing decks/chats/feedback
 * from a dev-tree install rather than starting from scratch.
 *
 * "Fresh install" is detected by the absence of a marker file
 * (.first-launch-marker.json). That marker is written when the user
 * either imports successfully or explicitly dismisses the prompt.
 * We don't check for decks.local.json because /api/decks auto-creates
 * it from a built-in seed on first GET — so any "does decks exist"
 * check is racy: the wizard may or may not appear depending on which
 * endpoint the browser calls first.
 *
 * GET:  returns { needsBootstrap, currentDataDir, suggestedSource }
 * POST { sourcePath }: copies *.local.json + feedback/ + games/ +
 *      agent-notes/ + backups/, then writes the marker.
 * POST { action: "dismiss" }: writes the marker without copying anything.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { dataPath, profilePath } from "../../../lib/server/paths";
import { ensureMigrated } from "../../../lib/server/profiles";

const KEY_DECK_FILE = "decks.local.json";
const MARKER_FILE = ".first-launch-marker.json";

// Files we'll copy from the source data dir into the live data dir.
// Globs aren't used here — we explicitly enumerate to keep the surface
// area small and predictable. Anything not in this list (e.g. bulk
// Scryfall data) stays where it is.
//
// Split by namespace: per-profile user data lands in the ACTIVE profile so the
// imported decks/chats actually show up (post-migration, routes read from
// data/profiles/<id>/, not the flat root); machine-wide reference + dev files
// stay at the data root.
const PROFILE_JSON_FILES = [
  "decks.local.json",
  "chats.local.json",
  "agent-notes.local.json",
];
const GLOBAL_JSON_FILES = [
  "model-calls.local.json",
  "spellbook-meta.local.json",
  "edhrec-salt-meta.local.json",
  "spellbook-combos.local.json",
  "spellbook-cards.local.json",
  "spellbook-index.local.json",
  "edhrec-salt.local.json",
];

const PROFILE_DIRS = ["games", "agent-notes", "backups"];
const GLOBAL_DIRS = ["feedback"];

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Look in a handful of common locations for an existing dev-tree
 * `app/data/` directory. First match wins. Returns null if none found.
 */
function suggestSourcePath() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    home && path.join(home, "Documents", "Claude", "Projects", "MTG-TOOL", "app", "data"),
    home && path.join(home, "Documents", "MTG-TOOL", "app", "data"),
    home && path.join(home, "Documents", "Projects", "MTG-TOOL", "app", "data"),
    home && path.join(home, "MTG-TOOL", "app", "data"),
    "C:\\Users\\colto\\Documents\\Claude\\Projects\\MTG-TOOL\\app\\data",
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(path.join(c, KEY_DECK_FILE))) return c;
  }
  return null;
}

async function writeMarker(reason, extra = {}) {
  const dir = dataPath();
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    completedAt: new Date().toISOString(),
    reason, // "import" | "dismiss"
    ...extra,
  };
  await fs.writeFile(path.join(dir, MARKER_FILE), JSON.stringify(payload, null, 2));
}

export async function GET() {
  const liveDir = dataPath();
  const markerExists = await pathExists(path.join(liveDir, MARKER_FILE));
  return Response.json({
    needsBootstrap: !markerExists,
    currentDataDir: liveDir,
    suggestedSource: suggestSourcePath(),
  });
}

async function copyFileIfExists(src, dst, report) {
  if (!(await pathExists(src))) {
    report.skipped.push(path.basename(src));
    return;
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  report.copied.push(path.basename(src));
}

async function copyDirIfExists(src, dst, report) {
  if (!(await pathExists(src))) {
    report.skipped.push(`${path.basename(src)}/`);
    return;
  }
  let fileCount = 0;
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      const sub = { copied: [], skipped: [] };
      await copyDirIfExists(s, d, sub);
      fileCount += sub.copied.length;
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
      fileCount += 1;
    }
  }
  report.copied.push(`${path.basename(src)}/ (${fileCount} files)`);
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Dismiss path — user clicked "× don't ask again" without importing.
  if (body?.action === "dismiss") {
    try {
      await writeMarker("dismiss");
      return Response.json({ ok: true, dismissed: true });
    } catch (e) {
      return Response.json(
        { ok: false, error: `Could not write marker: ${e.message || e}` },
        { status: 500 },
      );
    }
  }

  const sourcePath = String(body?.sourcePath || "").trim();
  if (!sourcePath) {
    return Response.json(
      { ok: false, error: "sourcePath is required" },
      { status: 400 },
    );
  }

  // Resolve to an absolute path and validate it exists + contains the
  // sentinel deck file. We don't allow importing from a totally
  // unrelated directory just to keep accidents narrow — the source
  // must look like an MTG-Tool data dir.
  const absSource = path.resolve(sourcePath);
  if (!(await pathExists(absSource))) {
    return Response.json(
      { ok: false, error: `Source path does not exist: ${absSource}` },
      { status: 400 },
    );
  }
  if (!(await pathExists(path.join(absSource, KEY_DECK_FILE)))) {
    return Response.json(
      {
        ok: false,
        error: `Source path doesn't contain ${KEY_DECK_FILE} — pick the app/data folder of an existing install`,
      },
      { status: 400 },
    );
  }

  const dst = dataPath();
  // Refuse to copy onto itself — would corrupt files mid-write.
  if (path.resolve(absSource) === path.resolve(dst)) {
    return Response.json(
      { ok: false, error: "Source and destination are the same directory" },
      { status: 400 },
    );
  }

  // Make sure the active-profile pointer exists so per-profile imports land in
  // a real profile folder rather than the (now-shadowed) flat data root.
  ensureMigrated();
  await fs.mkdir(dst, { recursive: true });

  const report = { copied: [], skipped: [], errors: [] };
  // Per-profile user data → active profile; machine-wide data → data root.
  for (const name of PROFILE_JSON_FILES) {
    try {
      await copyFileIfExists(path.join(absSource, name), profilePath(name), report);
    } catch (e) {
      report.errors.push(`${name}: ${e.message || e}`);
    }
  }
  for (const name of GLOBAL_JSON_FILES) {
    try {
      await copyFileIfExists(path.join(absSource, name), path.join(dst, name), report);
    } catch (e) {
      report.errors.push(`${name}: ${e.message || e}`);
    }
  }
  for (const dir of PROFILE_DIRS) {
    try {
      await copyDirIfExists(path.join(absSource, dir), profilePath(dir), report);
    } catch (e) {
      report.errors.push(`${dir}/: ${e.message || e}`);
    }
  }
  for (const dir of GLOBAL_DIRS) {
    try {
      await copyDirIfExists(path.join(absSource, dir), path.join(dst, dir), report);
    } catch (e) {
      report.errors.push(`${dir}/: ${e.message || e}`);
    }
  }

  if (report.errors.length === 0) {
    try {
      await writeMarker("import", { sourcePath: absSource });
    } catch (e) {
      report.errors.push(`marker: ${e.message || e}`);
    }
  }

  return Response.json({
    ok: report.errors.length === 0,
    sourcePath: absSource,
    destinationPath: dst,
    ...report,
  });
}
