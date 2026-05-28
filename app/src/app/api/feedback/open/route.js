/**
 * /api/feedback/open — native shell handoff for the feedback inbox.
 *
 * POST { target: "dir" | "digest" }
 *   - "dir"    → opens the feedback folder in the OS file manager
 *                (Explorer / Finder / xdg-open)
 *   - "digest" → opens FEEDBACK.md in the user's default markdown editor
 *
 * Works in both `npm run dev` AND the packaged Tauri .exe because it runs
 * inside the Node subprocess that owns the filesystem. The Rust shim never
 * touches the file — Node spawns explorer/open/xdg-open directly.
 *
 * No path traversal possible — target is a fixed enum that picks between
 * two server-resolved absolute paths via paths.js. The user can't supply
 * an arbitrary path.
 */

export const runtime = "nodejs";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { dataPath } from "../../../../lib/server/paths";

const FEEDBACK_DIR = dataPath("feedback");
const DIGEST_FILE = path.join(FEEDBACK_DIR, "FEEDBACK.md");

function openWithDefaultApp(absPath) {
  // Detached so the spawned process doesn't tie its stdio to our route.
  // `unref()` lets the route return immediately while the editor opens
  // in the background.
  if (process.platform === "win32") {
    // `start "" "path"` via cmd is the most reliable way on Windows to
    // hand a file or folder to the user's default application. The empty
    // title argument is required because the first quoted token is
    // treated as a window title otherwise.
    const child = spawn("cmd", ["/c", "start", "", absPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", [absPath], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  // Linux / BSD / etc.
  const child = spawn("xdg-open", [absPath], { detached: true, stdio: "ignore" });
  child.unref();
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const target = body?.target;
  if (target !== "dir" && target !== "digest") {
    return Response.json(
      { error: "target must be 'dir' or 'digest'." },
      { status: 400 }
    );
  }

  try {
    // Ensure the directory exists either way; the digest file is created
    // lazily by the main feedback route the first time something is saved.
    await fs.mkdir(FEEDBACK_DIR, { recursive: true });

    let abs;
    if (target === "dir") {
      abs = FEEDBACK_DIR;
    } else {
      // If the digest hasn't been generated yet (no entries), fall back to
      // opening the directory rather than throwing — the user can see the
      // empty state instead of getting a confusing error.
      try {
        await fs.access(DIGEST_FILE);
        abs = DIGEST_FILE;
      } catch {
        abs = FEEDBACK_DIR;
      }
    }

    openWithDefaultApp(abs);
    return Response.json({ ok: true, opened: abs, target });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not open." },
      { status: 500 }
    );
  }
}
