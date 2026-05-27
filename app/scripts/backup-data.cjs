#!/usr/bin/env node
/**
 * backup-data.cjs — local safety net.
 *
 * Copies the data files that hold the user's actual work (decks, chats,
 * feedback, games, agent notes) into a timestamped directory under
 * `data/backups/`. Run before any risky migration, before setting up a
 * remote, before upgrading Node, or whenever paranoia strikes.
 *
 * Usage:   npm run backup
 *
 * Output:  app/data/backups/YYYY-MM-DD-HHMMSS/
 *            decks.local.json
 *            chats.local.json
 *            agent-notes.local.json   (if present)
 *            feedback/                (full directory copy)
 *            games/                   (full directory copy)
 *            MANIFEST.json            (what was backed up, sizes, source paths)
 *
 * Cap:     keeps the 20 most-recent backups. Older ones are deleted. Skip
 *          the cap by passing --keep-all.
 *
 * The backup is intentionally NOT a tarball — direct file copy means the
 * user can browse and restore individual files with finder/explorer without
 * needing extra tools. Total size is small (chats <10MB, decks <1MB,
 * feedback/games rarely exceed 10MB combined).
 */

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 20;

const FILE_TARGETS = [
  "decks.local.json",
  "chats.local.json",
  "agent-notes.local.json",
];
const DIR_TARGETS = [
  "feedback",
  "games",
];

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function bytesHuman(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function dirSize(dir) {
  let total = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return { total, files };
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(full);
        total += stat.size;
        files += 1;
      }
    }
  }
  return { total, files };
}

async function copyDirRecursive(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, dstPath);
    }
  }
}

async function pruneOld(keepAll) {
  if (keepAll) return [];
  let entries;
  try {
    entries = await fsp.readdir(BACKUPS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const stamped = entries
    .filter(name => /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(name))
    .sort()
    .reverse();
  if (stamped.length <= MAX_BACKUPS) return [];
  const toDelete = stamped.slice(MAX_BACKUPS);
  for (const name of toDelete) {
    await fsp.rm(path.join(BACKUPS_DIR, name), { recursive: true, force: true });
  }
  return toDelete;
}

async function main() {
  const keepAll = process.argv.includes("--keep-all");

  if (!fs.existsSync(DATA_DIR)) {
    process.stdout.write(`No data directory at ${DATA_DIR} — nothing to back up.\n`);
    return;
  }

  const stamp = timestamp();
  const dst = path.join(BACKUPS_DIR, stamp);
  await fsp.mkdir(dst, { recursive: true });

  const manifest = {
    timestamp: new Date().toISOString(),
    sourceRoot: path.relative(REPO_ROOT, DATA_DIR).replace(/\\/g, "/"),
    items: [],
  };

  // Single files
  for (const name of FILE_TARGETS) {
    const src = path.join(DATA_DIR, name);
    if (!fs.existsSync(src)) continue;
    const target = path.join(dst, name);
    await fsp.copyFile(src, target);
    const stat = await fsp.stat(target);
    manifest.items.push({ kind: "file", name, size: stat.size, human: bytesHuman(stat.size) });
  }

  // Directories
  for (const name of DIR_TARGETS) {
    const src = path.join(DATA_DIR, name);
    if (!fs.existsSync(src)) continue;
    const target = path.join(dst, name);
    await copyDirRecursive(src, target);
    const stats = await dirSize(target);
    manifest.items.push({ kind: "dir", name, files: stats.files, size: stats.total, human: bytesHuman(stats.total) });
  }

  await fsp.writeFile(path.join(dst, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");

  const totalSize = manifest.items.reduce((sum, item) => sum + (item.size || 0), 0);
  const totalFiles = manifest.items.reduce(
    (sum, item) => sum + (item.kind === "file" ? 1 : item.files || 0),
    0,
  );

  process.stdout.write(
    `Backup written to ${path.relative(REPO_ROOT, dst).replace(/\\/g, "/")}\n` +
    `  ${manifest.items.length} item(s), ${totalFiles} file(s), ${bytesHuman(totalSize)} total\n`,
  );
  for (const item of manifest.items) {
    if (item.kind === "file") {
      process.stdout.write(`  - ${item.name} (${item.human})\n`);
    } else {
      process.stdout.write(`  - ${item.name}/ (${item.files} files, ${item.human})\n`);
    }
  }

  const pruned = await pruneOld(keepAll);
  if (pruned.length > 0) {
    process.stdout.write(`Pruned ${pruned.length} older backup(s) (keeping most-recent ${MAX_BACKUPS}).\n`);
  }
}

main().catch(error => {
  process.stderr.write(`backup-data: ${error.message}\n`);
  process.exit(1);
});
