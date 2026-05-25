export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const APP_ROOT = process.cwd();
const TOOL_ROOT = path.resolve(APP_ROOT, "..");
const SCRYFALL_ROOT = path.join(APP_ROOT, "data", "scryfall-bulk");
const MANIFEST_PATH = path.join(SCRYFALL_ROOT, "tier-manifest.json");
const ORACLE_PATH = path.join(SCRYFALL_ROOT, "oracle_cards.json");
const RULINGS_PATH = path.join(SCRYFALL_ROOT, "rulings.json");
const CR_PATH = path.join(TOOL_ROOT, "mtg-judge", "data", "cr", "cr_current.json");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function fileFingerprint(file, label) {
  try {
    const stat = await fs.stat(file);
    return {
      label,
      path: path.relative(TOOL_ROOT, file).replace(/\\/g, "/"),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      version: `${label}:${stat.size}:${Math.floor(stat.mtimeMs)}`,
    };
  } catch {
    return {
      label,
      path: path.relative(TOOL_ROOT, file).replace(/\\/g, "/"),
      missing: true,
      version: `${label}:missing`,
    };
  }
}

export async function GET() {
  const manifest = await readJson(MANIFEST_PATH);
  const [oracle, rulings, rules] = await Promise.all([
    fileFingerprint(ORACLE_PATH, "scryfall-oracle"),
    fileFingerprint(RULINGS_PATH, "scryfall-rulings"),
    fileFingerprint(CR_PATH, "cr-current"),
  ]);

  return Response.json({
    version: 1,
    generatedAt: new Date().toISOString(),
    manifestGeneratedAt: manifest?.generatedAt || null,
    cardDataVersion: [
      manifest?.generatedAt ? `manifest:${manifest.generatedAt}` : "manifest:unknown",
      oracle.version,
      rulings.version,
    ].join("|"),
    rulesVersion: rules.version,
    sources: { oracle, rulings, rules },
  });
}
