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
import { dataPath } from "../../../lib/server/paths.js";
import { summarizeUserData } from "../../../lib/server/userDataExport.js";
import { buildSupportBundle, renderSupportText } from "../../../lib/server/supportBundle.js";

const DATA_FILES = {
  oracleIndex: ["scryfall-bulk", "oracle-index.json"],
  printingsIndex: ["scryfall-bulk", "printings-index.json"],
  rulesIndex: ["rules-index.json"],
  spellbookMeta: ["spellbook-meta.local.json"],
  saltMeta: ["edhrec-salt-meta.local.json"],
  cardKingdomPrices: ["cardkingdom-prices.json"],
  priceHistory: ["collection-prices.jsonl"],
};

async function freshness(parts) {
  try {
    const stat = await fs.stat(dataPath(...parts));
    return { present: true, mtime: stat.mtime.toISOString() };
  } catch {
    return { present: false };
  }
}

async function readJson(rel) {
  try {
    return JSON.parse(await fs.readFile(dataPath(rel), "utf8"));
  } catch {
    return null;
  }
}

async function countDir(rel) {
  try {
    return (await fs.readdir(dataPath(rel))).filter(n => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const data = {};
    for (const [key, parts] of Object.entries(DATA_FILES)) {
      data[key] = await freshness(parts);
    }

    const [decks, chats, collection, watchlist, priceAlerts] = await Promise.all([
      readJson("decks.local.json"),
      readJson("chats.local.json"),
      readJson("collection.json"),
      readJson("watchlist.json"),
      readJson("price-alerts.json"),
    ]);
    const content = summarizeUserData({ decks, chats, collection, watchlist, priceAlerts });
    content.games = await countDir("games");
    content.feedback = await countDir("feedback");

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
