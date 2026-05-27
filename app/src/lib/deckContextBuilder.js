/**
 * deckContextBuilder.js
 *
 * Pure utility functions for building deck context strings and deck lock objects.
 * No React state. No side effects. Safe to call from hooks, server routes, or scripts.
 *
 * Extracted from useChatAgents.js (PR0) — keep in sync with that file's imports.
 */

import { AGENTS } from "./agents";
import { serializeDeck, serializeDeckMemory } from "./deckMemory";

// Maximum number of matched decks to expand into full context per request.
const DECK_CONTEXT_FULL_LIMIT = 10;

// ─── Text helpers ────────────────────────────────────────────────────────────

export function compact(text, limit = 420) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : clean.slice(0, limit - 3).trim() + "...";
}

export function normalizeSearchText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Deck introspection helpers ───────────────────────────────────────────────

export function deckCommander(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Commander")
    .map(card => card.name)
    .join(" / ") || deck?.name || "No commander saved";
}

export function deckMainCount(deck) {
  return (deck?.cards || [])
    .filter(card => card.section !== "Sideboard" && card.section !== "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);
}

export function deckTokenCount(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);
}

export function deckCommanderNames(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Commander")
    .map(card => card.name)
    .filter(Boolean);
}

export function deckOracleCardNamesFromCards(cards = []) {
  return [...new Set(
    (cards || [])
      .filter(card => card.section !== "Sideboard" && card.section !== "Tokens")
      .map(card => card.name)
      .filter(Boolean)
  )];
}

export function deckOracleCardNamesFromText(deckText = "") {
  return [...new Set(
    String(deckText || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => line.replace(/^\d+\s+/, "").trim())
      .filter(line => line && !/^(commander|mainboard|sideboard|tokens)$/i.test(line))
  )];
}

function deckMatchesText(deck, normalizedText) {
  if (!normalizedText) return false;
  const names = [
    deck?.name,
    deckCommander(deck),
    ...(deck?.cards || []).filter(card => card.section === "Commander").map(card => card.name),
  ].filter(Boolean);

  return names.some(name => {
    const normalizedName = normalizeSearchText(name);
    if (!normalizedName) return false;
    return normalizedText.includes(normalizedName) ||
      normalizedName.split(" ").filter(part => part.length > 3).some(part => normalizedText.includes(part));
  });
}

// ─── Saved-deck context builder ───────────────────────────────────────────────

/**
 * Build a system-prompt context block for the saved deck library.
 * Returns { context: string, hasDeckReference: boolean, hasFullDeckContext: boolean }.
 */
export function buildSavedDeckContext(savedDecks, targetAgent, conversationText, activeDeckId) {
  if (!["jace", "karn", "tibalt"].includes(targetAgent) || !savedDecks?.length) {
    return { context: "", hasDeckReference: false, hasFullDeckContext: false };
  }

  const normalizedText = normalizeSearchText(conversationText);
  const owners = [...new Set(savedDecks.map(deck => deck.memory?.owner || "Colton"))];
  const mentionedOwners = owners.filter(owner => {
    const normalizedOwner = normalizeSearchText(owner);
    if (!normalizedOwner) return false;
    if (normalizedText.includes(normalizedOwner)) return true;
    return normalizedOwner === "colton" && /\b(my|mine|personal)\b/.test(normalizedText);
  });

  const asksForSavedDecks = /\b(saved|database|library|deck file|deck files|all decks|all of the decks|their decks|his decks|her decks)\b/.test(normalizedText);
  const asksForRoastSet = targetAgent === "tibalt" && /\b(why|explain|roast|suck|bad|terrible|trash|awful|weak)\b/.test(normalizedText);

  const summaryLines = savedDecks.map(deck => {
    const memory = deck.memory || {};
    return [
      `- ${memory.owner || "Colton"} :: ${deck.name || "Unnamed"}`,
      `Commander: ${deckCommander(deck)}`,
      `${deckMainCount(deck)} deck cards${deckTokenCount(deck) ? `, ${deckTokenCount(deck)} token entries saved separately` : ""}`,
      memory.tags ? `Tags: ${memory.tags}` : "",
      memory.notes ? `Notes: ${compact(memory.notes, targetAgent === "tibalt" ? 520 : 280)}` : "",
    ].filter(Boolean).join(" | ");
  });

  let matchedDecks = savedDecks.filter(deck => deckMatchesText(deck, normalizedText));
  if (mentionedOwners.length) {
    const ownerSet = new Set(mentionedOwners.map(owner => normalizeSearchText(owner)));
    matchedDecks = savedDecks.filter(deck => ownerSet.has(normalizeSearchText(deck.memory?.owner || "Colton")));
  }

  if (!matchedDecks.length && asksForSavedDecks && asksForRoastSet && mentionedOwners.length === 0) {
    matchedDecks = savedDecks.filter(deck => deck.id !== activeDeckId);
  }

  const fullDecks = matchedDecks.slice(0, DECK_CONTEXT_FULL_LIMIT);
  const omitted = matchedDecks.length - fullDecks.length;

  const lines = [
    "## Saved Deck Library",
    "These decks are already saved in the local deck database. If the user references an owner, commander, deck name, saved deck, database, or deck file, use this library instead of asking them to paste the list.",
    ...summaryLines,
  ];

  if (fullDecks.length) {
    lines.push("");
    lines.push("## Referenced Saved Decks");
    lines.push("Use these full saved deck lists as concrete deck context for this conversation. Token sections are not normal Commander deck slots.");
    for (const deck of fullDecks) {
      lines.push("");
      lines.push(`### ${deck.memory?.owner || "Colton"} :: ${deck.name || "Unnamed"}`);
      lines.push(serializeDeckMemory(deck));
      lines.push("");
      lines.push(serializeDeck(deck.cards || []));
    }
    if (omitted > 0) lines.push(`\n${omitted} additional matching saved deck(s) omitted to keep context bounded.`);
  }

  return {
    context: lines.join("\n"),
    hasDeckReference: Boolean(asksForSavedDecks || mentionedOwners.length || matchedDecks.length),
    hasFullDeckContext: fullDecks.length > 0,
  };
}

// ─── Deck lock builders ───────────────────────────────────────────────────────

/**
 * Create a deck lock snapshot from a live deck object.
 * The snapshot is stored per-session and used for the lifetime of that conversation.
 */
export function createDeckLock(deck, knowledgeStatus = null) {
  if (!deck) return null;
  return {
    id: deck.id,
    name: deck.name || "Unnamed deck",
    owner: deck.memory?.owner || "Colton",
    commander: deckCommander(deck),
    commanderNames: deckCommanderNames(deck),
    mainCount: deckMainCount(deck),
    tokenCount: deckTokenCount(deck),
    lockedAt: new Date().toISOString(),
    schemaVersion: 1,
    cardDataVersion: knowledgeStatus?.cardDataVersion || null,
    rulesVersion: knowledgeStatus?.rulesVersion || null,
    cardNames: deckOracleCardNamesFromCards(deck.cards || []),
    deckText: serializeDeck(deck.cards || []),
    memoryText: serializeDeckMemory(deck),
  };
}

/**
 * Render a deck lock as a system-prompt context block for an agent.
 */
export function lockContext(lock, agentId = "karn", confirmLock = false) {
  if (!lock) return "";
  const agentName = AGENTS[agentId]?.name || "This agent";
  return [
    `## LOCKED ${agentName.toUpperCase()} DECK CONTEXT`,
    `${agentName}'s current conversation is locked to this deck snapshot. Do not silently switch to another active deck unless the user clears ${agentName}'s chat or explicitly asks to start a new deck conversation.`,
    confirmLock ? `On your next reply, briefly confirm that ${lock.name} is locked for this conversation and that local card/rules context has been loaded before answering the user's request.` : "",
    `Deck: ${lock.name}`,
    `Owner: ${lock.owner}`,
    `Commander: ${lock.commander}`,
    `Locked At: ${lock.lockedAt}`,
    lock.cardDataVersion ? `Card Data Version: ${lock.cardDataVersion}` : "",
    lock.rulesVersion ? `Rules Version: ${lock.rulesVersion}` : "",
    `Cards: ${lock.mainCount} non-token cards, ${lock.tokenCount} token entries saved separately`,
    lock.memoryText ? `\n## LOCKED DECK MEMORY\n${lock.memoryText}` : "",
    `\n## LOCKED DECK LIST\n${lock.deckText}`,
  ].filter(Boolean).join("\n");
}

// ─── Context routing predicates ───────────────────────────────────────────────

export function shouldUseEngineContext(targetAgent, prompt) {
  if (!["jace", "karn", "arbiter"].includes(targetAgent)) return false;
  const text = normalizeSearchText(prompt);
  return /\b(rule|rules|ruling|judge|trigger|stack|priority|state based|sba|replacement|prevention|layer|timestamp|copy|token|combat|commander damage|commander tax|cast|activate|resolve|dies|graveyard|exile|legal|can i|can they|what happens|oracle|interaction)\b/.test(text);
}

export function shouldUseDeckScopedContext(targetAgent, prompt) {
  if (["karn", "tibalt", "arbiter"].includes(targetAgent)) return true;
  if (targetAgent !== "jace") return false;
  const text = normalizeSearchText(prompt);
  return /\b(deck|commander|loaded deck|my deck|this deck|our deck|card|cards|oracle|ruling|interaction|synergy|play line|sequencing|battlefield|hand|graveyard|exile|sliver|mana base|win condition)\b/.test(text);
}

// ─── Engine context fetcher ───────────────────────────────────────────────────

export async function fetchEngineContext({ query, limit = 4 }) {
  try {
    const response = await fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.context || "";
  } catch {
    return "";
  }
}

// ─── Goldfish history fetcher ─────────────────────────────────────────────────

/**
 * Pull goldfish-history insights for the locked deck and format them as a
 * plain-text block for inclusion in an agent's system prompt. Returns an
 * empty string when there's no deck id, no history, or the route fails —
 * the caller can safely concatenate without checking.
 */
export async function fetchGoldfishInsightsBlock(deckId) {
  if (!deckId) return "";
  try {
    const response = await fetch(`/api/games-summary?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    if (!response.ok) return "";
    const insights = await response.json();
    if (!insights || (insights.count || 0) < 2) return "";
    const { formatInsightsForAgent } = await import("./gameInsights");
    return formatInsightsForAgent(insights);
  } catch {
    return "";
  }
}
