/**
 * /api/import-all — restore a K1 backup bundle (I2).
 *
 * POST { bundle, sections? } — validates the bundle, BACKS UP the current files
 * first (I3: backup-before-destructive), then atomically overwrites the
 * file-based sections (decks / chats / collection / grails / agent notes) in the
 * writable data dir. Returns what was restored + where the pre-restore backup
 * landed.
 *
 * No UI calls this yet — it's dormant plumbing until a Settings "restore" button
 * wires it, so there's no accidental-clobber path today.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { appPath, profilePath } from "../../../lib/server/paths.js";
import {
  validateBackupBundle,
  selectRestoreSections,
} from "../../../lib/server/userDataRestore.js";

async function atomicWriteJson(target, data) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const bundle = body?.bundle;
  const check = validateBackupBundle(bundle);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const selected = selectRestoreSections(bundle, body?.sections);
  if (selected.length === 0) {
    return Response.json({ restored: [], message: "Nothing to restore (no matching sections in the backup)." });
  }

  try {
    // I3 — back up the current files before overwriting anything.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = profilePath("backups", `pre-restore-${stamp}`);
    let backedUp = 0;
    for (const { file } of selected) {
      try {
        const current = await fs.readFile(profilePath(file), "utf8");
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(path.join(backupDir, file), current, "utf8");
        backedUp += 1;
      } catch {
        /* no current file to back up */
      }
    }

    // Overwrite each section atomically.
    const restored = [];
    for (const { section, file, data } of selected) {
      await atomicWriteJson(profilePath(file), data);
      restored.push(section);
    }

    return Response.json({
      restored,
      backedUpFiles: backedUp,
      backupDir: backedUp > 0 ? path.relative(appPath(), backupDir).replace(/\\/g, "/") : null,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Restore failed." }, { status: 500 });
  }
}
