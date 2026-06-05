/**
 * /api/support-bundle — copyable, redacted diagnostics for bug reports (D5).
 *
 * GET → { ...bundle, text }. Includes app version, OS/arch/node, the freshness
 * (presence + mtime) of the key data files, and content COUNTS. Never includes
 * secrets, env, API keys, or any actual deck/chat content.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import pkg from "../../../../package.json";
import { dataPath, profilePath } from "../../../lib/server/paths.js";
import { ensureMigrated } from "../../../lib/server/profiles.js";
import { summarizeUserData } from "../../../lib/server/userDataExport.js";
import { buildSupportBundle, renderSupportText } from "../../../lib/server/supportBundle.js";

// Machine-wide reference data — resolved at the global data root.
const DATA_FILES = {
  oracleIndex: ["scryfall-bulk", "oracle-index.json"],
  printingsIndex: ["scryfall-bulk", "printings-index.json"],
  rulesIndex: ["rules-index.json"],
  spellbookMeta: ["spellbook-meta.local.json"],
  saltMeta: ["edhrec-salt-meta.local.json"],
  cardKingdomPrices: ["cardkingdom-prices.json"],
};

// Per-profile user data — resolved under the ACTIVE profile.
const PROFILE_DATA_FILES = {
  priceHistory: ["collection-prices.jsonl"],
};

async function freshness(parts, resolve = dataPath) {
  try {
    const stat = await fs.stat(resolve(...parts));
    return { present: true, mtime: stat.mtime.toISOString() };
  } catch {
    return { present: false };
  }
}

// User-data files live under the ACTIVE profile post-migration; resolve them
// through profilePath so the bundle summarizes the current profile's data, not
// a stale/empty global copy (or a mix of every profile's data).
async function readProfileJson(rel) {
  try {
    return JSON.parse(await fs.readFile(profilePath(rel), "utf8"));
  } catch {
    return null;
  }
}

// `resolve` selects the namespace: profilePath for per-profile dirs (games),
// dataPath for machine-wide dirs (feedback is a dev-facing channel, global).
async function countDir(rel, resolve = dataPath) {
  try {
    return (await fs.readdir(resolve(rel))).filter(n => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    // Ensure the active-profile pointer exists before resolving per-profile
    // paths, so a first-ever call doesn't read the legacy flat layout.
    ensureMigrated();

    const data = {};
    for (const [key, parts] of Object.entries(DATA_FILES)) {
      data[key] = await freshness(parts);
    }
    for (const [key, parts] of Object.entries(PROFILE_DATA_FILES)) {
      data[key] = await freshness(parts, profilePath);
    }

    const [decks, chats, collection, watchlist, priceAlerts] = await Promise.all([
      readProfileJson("decks.local.json"),
      readProfileJson("chats.local.json"),
      readProfileJson("collection.json"),
      readProfileJson("watchlist.json"),
      readProfileJson("price-alerts.json"),
    ]);
    const content = summarizeUserData({ decks, chats, collection, watchlist, priceAlerts });
    content.games = await countDir("games", profilePath); // per-profile
    content.feedback = await countDir("feedback"); // machine-wide (dev channel)

    const bundle = buildSupportBundle({
      app: { name: "MTG Tool", version: pkg.version },
      runtime: { platform: process.platform, arch: process.arch, node: process.version },
      data,
      content,
    });

    return Response.json({ ...bundle, text: renderSupportText(bundle) });
  } catch (error) {
    return Response.json({ error: error.message || "Support bundle failed." }, { status: 500 });
  }
}
