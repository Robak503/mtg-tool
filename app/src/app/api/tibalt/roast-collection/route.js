/**
 * /api/tibalt/roast-collection — dedicated Tibalt endpoint for roasting
 * the user's local collection.
 *
 * Differs from the regular chat-stream Tibalt path:
 *   - Server-side computes outliers (most-owned, single-copy chase rares,
 *     most-expensive-unused) so the LLM doesn't have to pick them from
 *     a 200-line summary block.
 *   - Returns a single non-streamed response. Roasts are short (~200
 *     words) so streaming adds complexity without real UX benefit.
 *   - Appends every roast to collection-roasts.json for drift
 *     comparison ("six months ago you had 23 Sol Rings, now 31").
 *
 * Provider defaults to Ollama. Anthropic fallback only if the user has
 * configured ALLOW_ANTHROPIC_AUTO_FALLBACK.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { TIBALT_PROMPT } from "../../../../lib/agents.js";
import { profilePath } from "../../../../lib/server/paths.js";
import { ensureMigrated } from "../../../../lib/server/profiles.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { collectionSummary } from "../../../../lib/server/collectionContext.js";
import { callModelMessages } from "../../../../lib/server/modelProvider.js";

const ROAST_LOG_FILE = "collection-roasts.json";

function computeOutliers(collection) {
  const cards = (collection.cards || []).filter(c => !c.wishlist);
  if (cards.length === 0) return null;

  // Most-owned by total quantity
  let mostOwned = null;
  let mostOwnedQty = 0;
  // Most expensive single card (highest individual usd, not totaled)
  let mostExpensive = null;
  let mostExpensivePrice = 0;
  // Highest-value single-copy "chase rare you bought but don't play"
  // Heuristic: rows with total qty 1 and highest price.
  let chaseSingle = null;
  let chaseSinglePrice = 0;

  const oracleCounts = new Map();
  for (const row of cards) {
    const stacks = row.stacks || [];
    let qty = 0;
    for (const s of stacks) qty += s.quantity || 0;
    if (qty <= 0) continue;
    if (qty > mostOwnedQty) {
      mostOwnedQty = qty;
      mostOwned = { name: row.name, qty };
    }
    const usd = parseFloat(row.prices?.usd || 0) || 0;
    if (usd > mostExpensivePrice) {
      mostExpensivePrice = usd;
      mostExpensive = { name: row.name, usd };
    }
    if (qty === 1 && usd > chaseSinglePrice) {
      chaseSinglePrice = usd;
      chaseSingle = { name: row.name, usd };
    }
    if (row.oracleId) oracleCounts.set(row.oracleId, (oracleCounts.get(row.oracleId) || 0) + qty);
  }

  return {
    mostOwned,
    mostExpensive,
    chaseSingle,
  };
}

function buildRoastPrompt(summary, outliers) {
  const lines = [];
  lines.push("Roast my MTG collection. Use the data below — it's all real.");
  lines.push("");
  lines.push(`Total: ${summary.totalCards} cards across ${summary.uniqueOracles} unique cards.`);
  if (summary.totalValueUsd > 0) {
    lines.push(`Estimated value: $${summary.totalValueUsd.toFixed(2)} USD.`);
  }
  if (outliers?.mostOwned) {
    lines.push(`Most-owned card: ${outliers.mostOwned.name} (${outliers.mostOwned.qty} copies).`);
  }
  if (outliers?.mostExpensive) {
    lines.push(`Most expensive card: ${outliers.mostExpensive.name} ($${outliers.mostExpensive.usd}).`);
  }
  if (outliers?.chaseSingle) {
    lines.push(`Most expensive single-copy: ${outliers.chaseSingle.name} ($${outliers.chaseSingle.usd}) — owned once, possibly never played.`);
  }
  if (summary.topByCount?.length > 0) {
    lines.push("");
    lines.push("Top owned by count:");
    for (const t of summary.topByCount.slice(0, 8)) {
      lines.push(`- ${t.name} x${t.qty}`);
    }
  }
  lines.push("");
  lines.push("Roast: focus on bloat (too many of one thing), weirdest single-copy inclusions, the expensive cards I clearly don't use, and any obvious gaps. Keep it ~200 words. Land a verdict at the end.");

  return lines.join("\n");
}

async function appendRoastLog(entry) {
  try {
    // The roast log belongs to the profile whose collection was roasted —
    // each profile has its own collection, so its drift history is private too.
    const target = profilePath(ROAST_LOG_FILE);
    await fs.mkdir(path.dirname(target), { recursive: true });
    let history = [];
    try {
      const raw = await fs.readFile(target, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) history = parsed;
      else if (Array.isArray(parsed.roasts)) history = parsed.roasts;
    } catch {
      // No file yet, start fresh.
    }
    history.push(entry);
    // Keep history bounded — most-recent 200 roasts.
    const trimmed = history.slice(-200);
    const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify({ roasts: trimmed }, null, 2), "utf8");
    await fs.rename(tmp, target);
  } catch {
    // Persistence is advisory; never block the response.
  }
}

export async function POST() {
  try {
    ensureMigrated();
    const { collection } = await loadCollection();
    const cards = (collection.cards || []).filter(c => !c.wishlist);
    if (cards.length === 0) {
      return Response.json(
        { error: "Your collection is empty. Add some cards before asking Tibalt for a roast." },
        { status: 400 },
      );
    }

    const summary = collectionSummary(collection);
    const outliers = computeOutliers(collection);
    const userPrompt = buildRoastPrompt(summary, outliers);

    const result = await callModelMessages({
      system: TIBALT_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      agentName: "tibalt",
      provider: "ollama",
      max_tokens: 1500,
    });

    if (!result.ok) {
      // Provider failures carry their message at result.data.error (see
      // providerError in modelProvider.js) — there is no top-level
      // result.error on that shape, so reading it first masked every real
      // reason (model not pulled, timeout, ...) behind the generic line.
      return Response.json(
        {
          error: result.data?.error || "Tibalt is unreachable. Is Ollama running?",
          provider: result.data?.provider || result.provider,
        },
        { status: 503 },
      );
    }

    const roast = result.data?.content?.[0]?.text || "";
    if (!roast.trim()) {
      return Response.json({ error: "Tibalt produced an empty roast." }, { status: 502 });
    }

    const entry = {
      roastedAt: new Date().toISOString(),
      stats: {
        totalCards: summary.totalCards,
        uniqueOracles: summary.uniqueOracles,
        totalValueUsd: summary.totalValueUsd,
      },
      outliers,
      roast,
    };
    await appendRoastLog(entry);

    return Response.json({
      roast,
      outliers,
      stats: entry.stats,
      timestamp: entry.roastedAt,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to roast collection." }, { status: 500 });
  }
}
