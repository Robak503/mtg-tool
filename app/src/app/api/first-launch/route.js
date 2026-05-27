/**
 * /api/first-launch — detect fresh-install state + import user data.
 *
 * In the bundled Tauri .exe, MTG_APP_ROOT is set to
 * %APPDATA%\com.colton.mtg-tool\ which starts empty on first launch
 * (the Rust shell only seeds the slim oracle-index). This route lets
 * the UI prompt the user to import their existing decks/chats/feedback
 * from a dev-tree install rather than starting from scratch.
 *
 * In dev mode cwd is `app/` and decks.local.json typically exists, so
 * needsBootstrap returns false and the wizard never appears.
 *
 * GET:  returns { needsBootstrap, currentDataDir, suggestedSource }
 * POST: { sourcePath } → copies *.local.json + feedback/ + games/ +
 *       agent-notes/ + backups/ into the live data dir.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { dataPath } from "../../../lib/server/paths";

const KEY_DECK_FILE = "decks.local.json";

// Files we'll copy from the source data dir into the live data dir.
// Globs aren't used here — we explicitly enumerate to keep the surface
// area small and predictable. Anything not in this list (e.g. bulk
// Scryfall data) stays where it is.
const LOCAL_JSON_FILES = [
  "decks.local.json",
  "chats.local.json",
  "model-calls.local.json",
  "spellbook-meta.local.json",
  "edhrec-salt-meta.local.json",
  "spellbook-combos.local.json",
  "spellbook-cards.local.json",
  "spellbook-index.local.json",
  "edhrec-salt.local.json",
  "agent-notes.local.json",
];

const COPY_DIRS = ["feedback", "games", "agent-notes", "backups"];

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

export async function GET() {
  const liveDir = dataPath();
  const hasDecks = await pathExists(path.join(liveDir, KEY_DECK_FILE));
  return Response.json({
    needsBootstrap: !hasDecks,
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

  await fs.mkdir(dst, { recursive: true });

  const report = { copied: [], skipped: [], errors: [] };
  for (const name of LOCAL_JSON_FILES) {
    try {
      await copyFileIfExists(path.join(absSource, name), path.join(dst, name), report);
    } catch (e) {
      report.errors.push(`${name}: ${e.message || e}`);
    }
  }
  for (const dir of COPY_DIRS) {
    try {
      await copyDirIfExists(path.join(absSource, dir), path.join(dst, dir), report);
    } catch (e) {
      report.errors.push(`${dir}/: ${e.message || e}`);
    }
  }

  return Response.json({
    ok: report.errors.length === 0,
    sourcePath: absSource,
    destinationPath: dst,
    ...report,
  });
}
