/**
 * collectionContextBuilder.js
 *
 * Pure functions that render a Collection into a prompt block injected
 * into agent system prompts at request time. Lives outside lib/server/
 * because the chat hook (client-side) imports it.
 *
 * Gating rules (per design doc Step 8):
 *   - Karn: inject whenever the user has ≥10 non-wishlist cards. Karn
 *     is the deckbuilder; he benefits from collection context on every
 *     deck-analysis turn.
 *   - Jace: inject only when the user's prompt has a collection intent
 *     ("my collection", "do I own", "what do I have"). Jace mostly
 *     answers rules questions; bloating his context every turn is wasteful.
 *   - Tibalt: skipped in chat-stream. The dedicated
 *     /api/tibalt/roast-collection endpoint (Step 14) handles collection
 *     roasting separately with full outlier data.
 *
 * Token budget: rendered block targets ≤400 tokens (~1600 chars). The
 * top-by-count list is capped at 20 entries; long names get implicit
 * truncation only if grouped quantity creates pathological strings.
 */

import { collectionSummary } from "./server/collectionContext.js";

const COLLECTION_INTENT_RE =
  /\b(my collection|do i own|what do i have|what i own|own this|own these|collection|owned cards|wishlist)\b/i;

const BUILD_FROM_COLLECTION_RE =
  /\b(build.*from\s+(?:my\s+)?collection|build.*using\s+(?:cards\s+)?(?:from\s+)?my\s+collection|from\s+what\s+i\s+own|out of\s+(?:my\s+)?collection)\b/i;

/**
 * Returns true when the user is asking Karn to build a deck out of their
 * collection. Exported so the hook can also use it for UI affordances
 * later (e.g. highlighting the active "build from collection" mode).
 */
export function isBuildFromCollectionPrompt(prompt) {
  return BUILD_FROM_COLLECTION_RE.test(String(prompt || ""));
}

/**
 * Decide whether to inject the COLLECTION SUMMARY block for the given
 * agent + prompt + collection state. Returns boolean.
 */
export function shouldInjectCollectionContext(targetAgent, prompt, collection) {
  if (!collection || !Array.isArray(collection.cards) || collection.cards.length === 0) {
    return false;
  }
  const nonWishlistCount = collection.cards.reduce((acc, row) => {
    if (row.wishlist) return acc;
    const owned = (row.stacks || []).some(s => (s.quantity || 0) > 0);
    return owned ? acc + 1 : acc;
  }, 0);
  if (nonWishlistCount === 0) return false;

  if (targetAgent === "karn") return nonWishlistCount >= 10;
  if (targetAgent === "jace") return COLLECTION_INTENT_RE.test(String(prompt || ""));
  return false;
}

/**
 * Render a Collection into a prompt block. Returns "" if there's nothing
 * meaningful to render.
 *
 * lookupOracleColors(oracleId) — optional callback returning color
 * identity letters. When omitted, the color breakdown line is skipped.
 */
export function buildCollectionContextBlock(collection, lookupOracleColors = null) {
  const summary = collectionSummary(collection, lookupOracleColors);
  if (summary.totalCards === 0) return "";

  const lines = [];
  lines.push("## COLLECTION SUMMARY");
  lines.push(
    "The user has a local card collection. When suggesting cards, prefer cards they already own when " +
    "reasonable. For each suggested add, mark it \"owned\" or \"$X to acquire\" so they know the cost. " +
    "Do not invent cards that aren't in this summary as definitively owned — when uncertain, treat them as " +
    "needing to be acquired.",
  );
  lines.push("");
  lines.push(`Total owned: ${summary.totalCards} cards across ${summary.uniqueOracles} unique cards`);
  if (summary.totalValueUsd > 0) {
    lines.push(`Estimated value: $${summary.totalValueUsd.toFixed(2)} USD`);
  }

  const hasAnyColorData = Object.values(summary.colorBreakdown).some(v => v > 0);
  if (hasAnyColorData) {
    const pct = key => {
      const v = summary.colorBreakdown[key] || 0;
      if (summary.totalCards === 0) return "0%";
      return `${Math.round((v / summary.totalCards) * 100)}%`;
    };
    lines.push(`Color breakdown: W ${pct("W")} · U ${pct("U")} · B ${pct("B")} · R ${pct("R")} · G ${pct("G")} · C ${pct("C")}`);
  }

  if (summary.topByCount.length > 0) {
    lines.push("");
    lines.push("Top owned cards (by total count):");
    for (const entry of summary.topByCount) {
      lines.push(`- ${entry.name} x${entry.qty}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render a fuller owned-card list for Karn's "build from collection"
 * mode. Caps at the top `limit` cards by total count so a 5,000-card
 * collection doesn't blow the Ollama context window.
 *
 * When this block ships, it sits ADJACENT to the standard summary
 * (so Karn gets both a high-level rollup + the concrete card list).
 */
export function buildOwnedListBlock(collection, limit = 200) {
  if (!collection || !Array.isArray(collection.cards)) return "";

  const oracleCounts = new Map();
  const namesByOracle = new Map();
  for (const row of collection.cards) {
    if (row.wishlist) continue;
    if (!row.oracleId) continue;
    let rowQty = 0;
    for (const stack of row.stacks || []) rowQty += stack.quantity || 0;
    if (rowQty <= 0) continue;
    oracleCounts.set(row.oracleId, (oracleCounts.get(row.oracleId) || 0) + rowQty);
    if (row.name && !namesByOracle.has(row.oracleId)) namesByOracle.set(row.oracleId, row.name);
  }
  if (oracleCounts.size === 0) return "";

  const sorted = Array.from(oracleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const lines = [];
  lines.push("## BUILD FROM COLLECTION MODE");
  lines.push(
    "The user is asking you to build a deck from cards they already own. Treat the owned list " +
    "below as your primary suggestion pool. Cards NOT on the list go in a separate \"STRETCH GOALS\" " +
    "section with prices and clear \"$X to acquire\" labels. Do not silently invent ownership. " +
    "When picking commanders, you MAY use any commander — but the 99 should lean heavily on owned cards.",
  );
  lines.push("");
  lines.push(`Owned cards (top ${sorted.length} by count${oracleCounts.size > limit ? `, of ${oracleCounts.size} total` : ""}):`);
  for (const [oracleId, qty] of sorted) {
    const name = namesByOracle.get(oracleId) || "Unknown";
    lines.push(`- ${name} x${qty}`);
  }
  return lines.join("\n");
}

/**
 * Render the cards the user has flagged "Swap" (a color tag whose behavior is
 * swap) so Karn can propose replacements. swapTagIds are the ids of the user's
 * swap-behavior tags (resolved client-side from the localStorage tag set, since
 * the server stores only colorTagId, not the behavior). Returns "" when nothing
 * is flagged.
 */
export function buildSwapCandidatesBlock(collection, swapTagIds) {
  if (!collection || !Array.isArray(collection.cards)) return "";
  const ids = new Set(swapTagIds || []);
  if (ids.size === 0) return "";

  const names = [];
  const seen = new Set();
  for (const row of collection.cards) {
    if (!row || !row.colorTagId || !ids.has(row.colorTagId)) continue;
    const key = row.oracleId || row.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (row.name) names.push(row.name);
  }
  if (names.length === 0) return "";

  const lines = [];
  lines.push("## SWAP CANDIDATES");
  lines.push(
    "The user has flagged these owned cards as ones they want to REPLACE. For each, suggest 1-2 " +
    "stronger or better-fitting replacements that match the deck's strategy and color identity, with a " +
    "one-line reason. Prefer cards the user already owns when reasonable; otherwise label \"$X to acquire\".",
  );
  lines.push("");
  for (const name of names) lines.push(`- ${name}`);
  return lines.join("\n");
}

/**
 * Convenience: fetch + check + render. Returns "" if anything is missing
 * or the gating refuses injection. Used by the chat hook to keep the
 * happy path inline. Detects build-from-collection intent and emits the
 * fuller block when present.
 *
 * swapTagIds: ids of the user's swap-behavior color tags (Karn only); when any
 * owned card carries one, a SWAP CANDIDATES block is appended.
 */
export async function fetchCollectionContextBlock(targetAgent, prompt, swapTagIds = []) {
  try {
    const resp = await fetch("/api/collection");
    if (!resp.ok) return "";
    const body = await resp.json();
    const collection = body.collection;
    if (!shouldInjectCollectionContext(targetAgent, prompt, collection)) return "";

    let block = buildCollectionContextBlock(collection);

    // Build-from-collection: Karn-only. Adds a long card list so Karn
    // can pick concrete cards rather than guessing.
    if (targetAgent === "karn" && isBuildFromCollectionPrompt(prompt)) {
      const ownedList = buildOwnedListBlock(collection);
      if (ownedList) block = `${block}\n\n${ownedList}`;
    }

    // Swap candidates: Karn-only. Lists cards the user tagged for replacement.
    if (targetAgent === "karn") {
      const swapBlock = buildSwapCandidatesBlock(collection, swapTagIds);
      if (swapBlock) block = `${block}\n\n${swapBlock}`;
    }

    return block;
  } catch {
    return "";
  }
}
