"use client";

import { useEffect, useState } from "react";

import { AGENTS, ARBITER_PROMPT_FAST } from "../lib/agents";
import { flushChatFileSave, loadChatState, saveChatFile, scheduleChatFileSave } from "../lib/chatPersistence";
import { serializeDeck, serializeDeckMemory } from "../lib/deckMemory";
import { buildCardContext, buildCardContextForNames, buildKarnScryfallSearchContext, loadCardCatalog, postProcessKarnResponse } from "../lib/scryfall";
import { loadJson, saveJson } from "../lib/storage";

const CHAT_STORAGE_KEYS = {
  jace: "mtg-chat-jace",
  karn: "mtg-chat-karn",
  tibalt: "mtg-chat-tibalt",
  arbiter: "mtg-chat-arbiter",
};

const DECK_CONTEXT_FULL_LIMIT = 10;
const API_HISTORY_LIMIT = 8;
const DECK_LOCK_AGENTS = new Set(["jace", "karn", "tibalt", "arbiter"]);

function compact(text, limit = 420) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : clean.slice(0, limit - 3).trim() + "...";
}

function deckCommander(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Commander")
    .map(card => card.name)
    .join(" / ") || deck?.name || "No commander saved";
}

function deckMainCount(deck) {
  return (deck?.cards || [])
    .filter(card => card.section !== "Sideboard" && card.section !== "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);
}

function deckTokenCount(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);
}

function deckCommanderNames(deck) {
  return (deck?.cards || [])
    .filter(card => card.section === "Commander")
    .map(card => card.name)
    .filter(Boolean);
}

function deckOracleCardNamesFromCards(cards = []) {
  return [...new Set(
    (cards || [])
      .filter(card => card.section !== "Sideboard" && card.section !== "Tokens")
      .map(card => card.name)
      .filter(Boolean)
  )];
}

function deckOracleCardNamesFromText(deckText = "") {
  return [...new Set(
    String(deckText || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => line.replace(/^\d+\s+/, "").trim())
      .filter(line => line && !/^(commander|mainboard|sideboard|tokens)$/i.test(line))
  )];
}

function normalizeSearchText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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

function buildSavedDeckContext(savedDecks, targetAgent, conversationText, activeDeckId) {
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

function shouldUseArbiterTrace(targetAgent, prompt) {
  if (targetAgent !== "jace") return false;
  const text = normalizeSearchText(prompt);
  return /\b(arbiter|rule|rules|ruling|judge|trigger|triggers|stack|priority|state based|sba|replacement|prevention|layer|timestamp|dies|died|death|exile|graveyard|copy|token|combat damage|commander damage|commander tax|deathtouch|trample|lifelink|first strike|double strike|resolve|resolves|cast|activate|etb|leave the battlefield|enter the battlefield|can i|can they|what happens|who has priority|does this|does it)\b/.test(text);
}

async function fetchArbiterTrace({ question, cardContext, context, fast, provider }) {
  try {
    const isLocal = provider === "ollama" || provider === "local";
    const response = await fetch("/api/arbiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        cardContext,
        context,
        fast,
        provider,
        fastLocal: isLocal,
        max_tokens: fast || isLocal ? 900 : undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { trace: "", status: "unresolved", retrievalMetadata: null };
    return {
      trace: data.trace || "",
      status: data.status || "unresolved",
      retrievalMetadata: data.retrievalMetadata || null,
    };
  } catch {
    return { trace: "", status: "unresolved", retrievalMetadata: null };
  }
}

function toApiMessages(messages) {
  return messages.map(message => ({
    role: message.role,
    content: message.content || "",
  }));
}

function trimApiHistory(messages) {
  return toApiMessages(messages.slice(-API_HISTORY_LIMIT));
}

function emptyHistories() {
  return { jace: [], karn: [], tibalt: [], arbiter: [] };
}

function emptyLocks() {
  return { jace: null, karn: null, tibalt: null, arbiter: null };
}

function countContextCards(text) {
  return (String(text || "").match(/^\[/gm) || []).length;
}

function countContextRulings(text) {
  return (String(text || "").match(/WOTC RULINGS:/g) || []).length;
}

function normalizeModelTier(value) {
  const tier = String(value || "fast").trim().toLowerCase();
  if (["anthropic", "api", "cloud"].includes(tier)) return "anthropic";
  if (["deep", "local-deep", "ollama-deep"].includes(tier)) return "deep";
  if (["fast", "local-fast", "ollama-fast", "ollama", "local"].includes(tier)) return "fast";
  return "fast";
}

function providerForModelTier(tier) {
  return tier === "anthropic" ? "anthropic" : "ollama";
}

function summarizeArbiterMetadata(metadata) {
  if (!metadata) return null;
  return {
    ruleNumbers: (metadata.rulesRetrieved || [])
      .map(rule => String(rule.ruleNumber || "").trim())
      .filter(Boolean),
    cards: (metadata.cardsRetrieved || [])
      .map(card => String(card || "").trim())
      .filter(Boolean),
    rulesGuruPrecedents: (metadata.rulesGuruPrecedents || [])
      .map(precedent => ({
        id: precedent.id,
        title: precedent.title,
        requiredCitations: precedent.requiredCitations || [],
      })),
    hallucinations: metadata.hallucinations || [],
    confidence: metadata.confidence || null,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bracketKnownCardNames(text, cardNames = []) {
  let output = String(text || "");
  const names = [...new Set(cardNames.filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    const escaped = escapeRegExp(name);
    const pattern = new RegExp(`(?<!\\[\\[)\\b${escaped}\\b(?!\\]\\])`, "g");
    output = output.replace(pattern, `[[${name}]]`);
  }

  return output;
}

function localJaceRulesPrimer(prompt) {
  const text = normalizeSearchText(prompt);
  if (!/\bhow does the stack work\b/.test(text)) return "";

  return [
    "The stack is the waiting line for spells and non-mana abilities: the newest object goes on top, and the top object resolves first after every player passes priority in order.",
    "",
    "Key points:",
    "- Casting a spell or activating a non-mana activated ability puts that object on the stack.",
    "- Triggered abilities trigger when their event happens, then are put onto the stack at the next trigger insertion checkpoint.",
    "- Lands do not use the stack.",
    "- Most mana abilities do not use the stack; they resolve immediately.",
    "- After each object resolves, state-based actions are checked, waiting triggers are put on the stack, then the active player gets priority again.",
    "- A phase or step only advances when the stack is empty and all players pass priority in succession.",
    "",
    "Rules anchors: priority is rule 117, resolving spells and abilities is rule 608, triggered abilities are rule 603, and state-based actions are rule 704.",
  ].join("\n");
}

function createDeckLock(deck, knowledgeStatus = null) {
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

function lockContext(lock, agentId = "karn", confirmLock = false) {
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

function shouldUseEngineContext(targetAgent, prompt) {
  if (!["jace", "karn", "arbiter"].includes(targetAgent)) return false;
  const text = normalizeSearchText(prompt);
  return /\b(rule|rules|ruling|judge|trigger|stack|priority|state based|sba|replacement|prevention|layer|timestamp|copy|token|combat|commander damage|commander tax|cast|activate|resolve|dies|graveyard|exile|legal|can i|can they|what happens|oracle|interaction)\b/.test(text);
}

function shouldUseDeckScopedContext(targetAgent, prompt) {
  if (["karn", "tibalt", "arbiter"].includes(targetAgent)) return true;
  if (targetAgent !== "jace") return false;
  const text = normalizeSearchText(prompt);
  return /\b(deck|commander|loaded deck|my deck|this deck|our deck|card|cards|oracle|ruling|interaction|synergy|play line|sequencing|battlefield|hand|graveyard|exile|sliver|mana base|win condition)\b/.test(text);
}

async function fetchEngineContext({ query, limit = 4 }) {
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

export default function useChatAgents({
  activeDeck,
  agent,
  deckCards,
  fastMode,
  modelProvider = "fast",
  savedDecks,
  setAgent,
  tokenEntries,
}) {
  const [histories, setHistories] = useState(emptyHistories());
  const [deckLocks, setDeckLocks] = useState(emptyLocks());
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [knowledgeStatus, setKnowledgeStatus] = useState(null);

  useEffect(() => {
    (async () => {
      const fileState = await loadChatState();
      if (fileState?.histories) {
        setHistories({ ...emptyHistories(), ...fileState.histories });
        setDeckLocks({ ...emptyLocks(), ...(fileState.locks || {}) });
      } else {
        const jace = await loadJson(CHAT_STORAGE_KEYS.jace) || await loadJson("mtg-chat-nissa");
        const karn = await loadJson(CHAT_STORAGE_KEYS.karn);
        const tibalt = await loadJson(CHAT_STORAGE_KEYS.tibalt);
        const arbiter = await loadJson(CHAT_STORAGE_KEYS.arbiter);

        setHistories({
          jace: jace || [],
          karn: karn || [],
          tibalt: tibalt || [],
          arbiter: arbiter || [],
        });
      }
      setChatLoaded(true);
    })();

    // Warm the Scryfall card name catalog so first agent call does not pay the latency.
    loadCardCatalog();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/knowledge-status", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setKnowledgeStatus(data);
      } catch {
        // Version metadata should not block chat.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const flushPendingSave = () => {
      flushChatFileSave({ useBeacon: true });
    };

    window.addEventListener("pagehide", flushPendingSave);
    window.addEventListener("beforeunload", flushPendingSave);

    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      window.removeEventListener("beforeunload", flushPendingSave);
      flushChatFileSave();
    };
  }, []);

  useEffect(() => {
    if (!chatLoaded) return;
    saveJson(CHAT_STORAGE_KEYS.jace, histories.jace);
    saveJson(CHAT_STORAGE_KEYS.karn, histories.karn);
    saveJson(CHAT_STORAGE_KEYS.tibalt, histories.tibalt);
    saveJson(CHAT_STORAGE_KEYS.arbiter, histories.arbiter);
    scheduleChatFileSave(histories, deckLocks);
  }, [chatLoaded, histories, deckLocks]);

  const send = async (text, agentOverride, retryDepth = 0, forceProvider = null) => {
    const targetAgent = agentOverride || agent;
    const targetConfig = AGENTS[targetAgent];
    const prompt = (text || input).trim();
    const requestedTier = normalizeModelTier(forceProvider || modelProvider);
    const effectiveProvider = providerForModelTier(requestedTier);
    const isLocalProvider = effectiveProvider === "ollama";
    const wantsDeepAnswer = /\b(full|deep|detailed|comprehensive|exhaustive|complete breakdown)\b/i.test(prompt);
    const isPureKarnCutRequest = targetAgent === "karn" &&
      /\b(cut|cuts|remove|trim)\b/i.test(prompt) &&
      !/\b(add|adds|upgrade|upgrades|replace|swap|alternative|alternatives|budget)\b/i.test(prompt);
    const localMaxTokens = 2500;

    if (!prompt || sending) return;

    const userMessage = { role: "user", content: prompt };
    const baseHistory = retryDepth === 0
      ? [...histories[targetAgent], userMessage]
      : [...histories[targetAgent]];

    if (retryDepth === 0) {
      setHistories(previous => ({ ...previous, [targetAgent]: baseHistory }));
      if (agentOverride) setAgent(agentOverride);
      setInput("");
    }

    setSending(true);

    try {
      let activeLocks = deckLocks;
      const locksDeckContext = DECK_LOCK_AGENTS.has(targetAgent);
      let deckLock = locksDeckContext ? activeLocks[targetAgent] : null;
      let deckLockJustCreated = false;

      if (locksDeckContext && !deckLock && activeDeck) {
        deckLock = createDeckLock(activeDeck, knowledgeStatus);
        deckLockJustCreated = true;
        activeLocks = { ...activeLocks, [targetAgent]: deckLock };
        setDeckLocks(activeLocks);
      }
      const useDeckScopedContext = Boolean(deckLock && shouldUseDeckScopedContext(targetAgent, prompt));
      let systemPrompt = targetAgent === "arbiter" && fastMode
        ? ARBITER_PROMPT_FAST
        : targetConfig.prompt;
      if (isLocalProvider) {
        let budgetHint;
        if (isPureKarnCutRequest) {
          budgetHint = "You are in CUT MODE. Provide the requested number of cuts — one per bullet, card name in [[brackets]], one-line reason. Do NOT include an Additions or Recommendations section. Stop after the last cut bullet.";
        } else if (targetAgent === "tibalt") {
          budgetHint = "You are writing a deck roast. Complete every section you start. Do not truncate mid-section.";
        } else if (targetAgent === "karn") {
          budgetHint = "Prefer compact, complete answers. Finish within 400-500 words unless the user asked for a full report.";
        } else {
          budgetHint = "Prefer compact, complete answers. Finish within 300-400 words and stop cleanly.";
        }
        systemPrompt += `\n\n## LOCAL MODEL RESPONSE BUDGET\nYou are running on a local model. ${budgetHint}`;
      }

      const conversationText = baseHistory.slice(-8).map(message => message.content).join("\n");
      const savedDeckContext = buildSavedDeckContext(savedDecks, targetAgent, conversationText, activeDeck?.id);
      if (savedDeckContext.context) systemPrompt += `\n\n${savedDeckContext.context}`;

      if (locksDeckContext && deckLock) {
        systemPrompt += `\n\n${lockContext(deckLock, targetAgent, deckLockJustCreated)}`;
      } else if ((targetAgent === "karn" || targetAgent === "tibalt") && deckCards.length) {
        systemPrompt += `\n\n## Active Deck: "${activeDeck?.name || "Unnamed"}"\n${serializeDeck(deckCards)}`;
      }

      if (targetAgent === "karn" && /\b(cut|cuts|remove|trim)\b/i.test(prompt)) {
        systemPrompt += "\n\n## KARN CUT MODE\nThe user is asking for cuts only. Rules:\n1. Every cut MUST be an exact card name from the locked or active deck list — no invented cards, no search results, no training-memory cards.\n2. Do NOT include an Additions section, Recommendations section, or any suggested replacements. Cuts only.\n3. Format: bullet list, [[Card Name]] — one-line reason.\n4. If a card name is not visible in the deck list, it cannot be a cut.";
      }

      if ((targetAgent === "karn" || targetAgent === "tibalt") && tokenEntries.length) {
        systemPrompt += `\n\n## Token Section\nThese entries are saved in the deck's Tokens section and should not be counted as normal Commander deck slots: ${tokenEntries.join(", ")}. You may mention them only when token production or token support matters.`;
      }

      if (activeDeck && !deckLock && ["jace", "tibalt"].includes(targetAgent)) {
        const memoryContext = serializeDeckMemory(activeDeck);
        if (memoryContext) systemPrompt += `\n\n## Active Deck Memory\n${memoryContext}`;
      }

      let augmentedContent = prompt;
      let cardContext = "";
      let deckOracleContext = "";
      let karnScryfallContext = "";
      let engineContext = "";
      let responseMeta = {};

      const rulingsForAgent = targetAgent === "karn"
        ? { includeRulings: false, allowLiveFallback: true }
        : {
            includeRulings: true,
            allowLiveFallback: true,
            allowLiveRulingsFallback: true,
            maxRulingsPerCard: targetAgent === "arbiter" ? 5 : 3,
          };

      const deckOracleNames = locksDeckContext && deckLock
        ? (useDeckScopedContext ? (deckLock.cardNames?.length ? deckLock.cardNames : deckOracleCardNamesFromText(deckLock.deckText)) : [])
        : (locksDeckContext && activeDeck ? deckOracleCardNamesFromCards(activeDeck.cards || deckCards) : []);

      try {
        if (deckOracleNames.length) {
          deckOracleContext = await buildCardContextForNames(deckOracleNames, {
            allowLiveFallback: true,
            allowLiveRulingsFallback: true,
            includeRulings: !isPureKarnCutRequest,
            maxRulingsPerCard: isPureKarnCutRequest ? 0 : 2,
            heading: isPureKarnCutRequest
              ? "## CARDS REFERENCED - LOCKED DECK CARD DATA (local Oracle text first; rulings omitted for cut-request speed; use ONLY this text for card behavior)"
              : "## CARDS REFERENCED - LOCKED DECK CARD DATA (local Oracle text + local rulings first; use ONLY this text for card behavior)",
          });
        }
      } catch {
        // Deck Oracle attachment should never block the chat request.
      }

      try {
        cardContext = await buildCardContext(prompt, rulingsForAgent);
      } catch {
        // Fall back to the original user prompt if context building fails.
      }

      try {
        if (targetAgent === "karn") {
          const commanderNames = deckLock?.commanderNames?.length
            ? deckLock.commanderNames
            : deckLock?.commander
              ? deckLock.commander.split(" / ").map(name => name.trim()).filter(Boolean)
            : (activeDeck ? deckCommanderNames(activeDeck) : []);
          karnScryfallContext = await buildKarnScryfallSearchContext(prompt, {
            commanderNames,
            deckOracleText: deckOracleContext,
            limitPerRole: 5,
          });
        }
      } catch {
        // Karn can still answer from the loaded deck Oracle context if local search context fails.
      }

      // ── Commander Spellbook local combo lookup (Karn only) ─────────────────
      let spellbookContext = "";
      try {
        if (targetAgent === "karn" && deckOracleNames.length >= 2 && !isPureKarnCutRequest) {
          const commanderNames = deckLock?.commanderNames?.length
            ? deckLock.commanderNames
            : deckLock?.commander
              ? deckLock.commander.split(" / ").map(n => n.trim()).filter(Boolean)
              : (activeDeck ? deckCommanderNames(activeDeck) : []);
          const sbRes = await fetch("/api/spellbook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cardNames: deckOracleNames,
              commanderNames,
              type: "full",
              maxIncluded: 6,
              maxAlmost: 10,
            }),
          });
          if (sbRes.ok) {
            const sbData = await sbRes.json();
            if (sbData.ready) {
              const parts = [];
              if (sbData.combos?.formatted) parts.push(sbData.combos.formatted);
              if (sbData.bracket?.formatted) parts.push(sbData.bracket.formatted);
              if (parts.length) {
                spellbookContext = `## COMMANDER SPELLBOOK DATA (local — zero network calls)\n${parts.join("\n\n")}\n\n`;
              }
            }
          }
        }
      } catch {
        // Spellbook context is supplemental — never block the request.
      }

      if (deckOracleContext || karnScryfallContext || spellbookContext || cardContext) {
        augmentedContent = `${deckOracleContext || ""}${karnScryfallContext || ""}${spellbookContext}${cardContext || ""}## USER QUESTION\n\n${prompt}`;
      }

      if (isPureKarnCutRequest && deckOracleNames.length) {
        augmentedContent = `${deckOracleContext || ""}## VALID CUT TARGETS\nOnly these exact locked-deck card names may be recommended as cuts:\n${deckOracleNames.map(name => `- [[${name}]]`).join("\n")}\n\n## USER QUESTION\n\n${prompt}`;
      }

      const lockedDeckNeedsEngineContext = Boolean(
        deckLock &&
        locksDeckContext &&
        ["jace", "karn", "tibalt", "arbiter"].includes(targetAgent) &&
        useDeckScopedContext &&
        !isPureKarnCutRequest
      );

      if (shouldUseEngineContext(targetAgent, prompt) || lockedDeckNeedsEngineContext) {
        const deckFacts = deckLock && useDeckScopedContext ? [
          `Deck: ${deckLock.name}`,
          `Commander: ${deckLock.commander}`,
          deckOracleNames.length ? `Deck cards: ${deckOracleNames.slice(0, 60).join(", ")}` : "",
          "Retrieve local rules, RulesGuru examples, and edge-case/fringe interaction notes relevant to this locked deck.",
        ].filter(Boolean).join("\n") : "";
        const engineQuery = `${prompt}\n${deckFacts}`;
        engineContext = await fetchEngineContext({ query: engineQuery, limit: targetAgent === "karn" ? 6 : 5 });
        if (engineContext) {
          augmentedContent = `${engineContext}\n${augmentedContent}`;
        }
      }

      if (retryDepth === 0 && shouldUseArbiterTrace(targetAgent, prompt)) {
        const activeDeckContext = deckLock
          ? `## LOCKED DECK CONTEXT\nDeck: ${deckLock.name}\nCommander: ${deckLock.commander}\n\n`
          : activeDeck
            ? `## ACTIVE DECK CONTEXT\nDeck: ${activeDeck.name || "Unnamed"}\nCommander: ${deckCommander(activeDeck)}\n\n`
          : "";
        const arbiterResult = await fetchArbiterTrace({
          question: prompt,
          cardContext: `${deckOracleContext || ""}${cardContext || ""}`,
          context: `${engineContext || ""}${activeDeckContext}`,
          fast: fastMode,
          provider: effectiveProvider,
        });

        if (arbiterResult.trace) {
          responseMeta.arbiterTrace = arbiterResult.trace;
          responseMeta.arbiterStatus = arbiterResult.status;
          responseMeta.arbiterSources = summarizeArbiterMetadata(arbiterResult.retrievalMetadata);
          const arbiterInstruction = arbiterResult.status === "resolved"
            ? "This trace was produced by the backend Arbiter rules engine. Use it as the formal source of truth, but answer the user as Jace in plain table language."
            : "This Arbiter trace did not resolve cleanly from local rules retrieval. Do not present a confident ruling. Explain what is unresolved and ask for a narrower board state or exact card names if needed.";
          augmentedContent = `${engineContext || ""}${deckOracleContext || ""}${karnScryfallContext || ""}${cardContext || ""}## ARBITER TRACE\n${arbiterInstruction}\n\n${arbiterResult.trace}\n\n## USER QUESTION\n\n${prompt}`;
        }
      }

      const primerReply = targetAgent === "jace" ? localJaceRulesPrimer(prompt) : "";
      if (primerReply) {
        responseMeta.factReceipt = {
          provider: "ollama",
          fallbackUsed: false,
          modelTier: "local-primer",
          model: "local-primer",
          deckLocked: Boolean(deckLock),
          deckName: deckLock?.name || null,
          cardsProvided: countContextCards(cardContext + deckOracleContext + karnScryfallContext),
          rulingsProvided: countContextRulings(cardContext + deckOracleContext),
          engineContextProvided: Boolean(engineContext),
          arbiterTraceProvided: Boolean(responseMeta.arbiterTrace),
          arbiterStatus: responseMeta.arbiterStatus || null,
          arbiterRulesRetrieved: responseMeta.arbiterSources?.ruleNumbers?.length || 0,
          arbiterCardsRetrieved: responseMeta.arbiterSources?.cards?.length || 0,
          arbiterRulesGuruPrecedents: responseMeta.arbiterSources?.rulesGuruPrecedents?.length || 0,
          arbiterHallucinations: responseMeta.arbiterSources?.hallucinations?.length || 0,
          arbiterConfidence: responseMeta.arbiterSources?.confidence || null,
        };

        setHistories(previous => ({
          ...previous,
          [targetAgent]: [...baseHistory, { role: "assistant", content: primerReply, ...responseMeta }],
        }));
        setSending(false);
        return;
      }

      const apiMessages = retryDepth === 0
        ? trimApiHistory([...histories[targetAgent], { role: "user", content: augmentedContent }])
        : trimApiHistory(baseHistory);

      const useFastLocalModel = Boolean(isLocalProvider && requestedTier === "fast");

      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          provider: effectiveProvider,
          modelTier: requestedTier,
          fastLocal: useFastLocalModel,
          agentName: targetAgent,
          max_tokens: isLocalProvider ? localMaxTokens : 2500,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      if (!response.ok || !response.body) {
        const errorMsg = "Could not connect to the model endpoint.";
        setHistories(previous => ({
          ...previous,
          [targetAgent]: [...baseHistory, {
            role: "assistant",
            content: errorMsg,
            isError: true,
            fallbackAvailable: true,
            originalPrompt: prompt,
            errorProvider: effectiveProvider,
          }],
        }));
        setSending(false);
        return;
      }

      // Streaming: add a placeholder that updates token-by-token
      const streamingIdx = baseHistory.length;
      setHistories(previous => ({
        ...previous,
        [targetAgent]: [...baseHistory, { role: "assistant", content: "", streaming: true }],
      }));

      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let streamedText = "";
      let streamDoneEvent = null;
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text_delta") {
              streamedText += event.text;
              setHistories(previous => {
                const msgs = [...(previous[targetAgent] || [])];
                msgs[streamingIdx] = { ...msgs[streamingIdx], content: streamedText };
                return { ...previous, [targetAgent]: msgs };
              });
            } else if (event.type === "done") {
              streamDoneEvent = event;
            } else if (event.type === "error") {
              streamError = event;
            }
          } catch { /* skip malformed line */ }
        }
      }

      // Handle streaming error
      if (streamError) {
        setHistories(previous => {
          const msgs = [...(previous[targetAgent] || [])];
          msgs[streamingIdx] = {
            role: "assistant",
            content: streamError.error || "Model returned an error.",
            isError: true,
            fallbackAvailable: streamError.fallbackAvailable ?? true,
            originalPrompt: prompt,
            errorProvider: streamError.provider || (effectiveProvider),
          };
          return { ...previous, [targetAgent]: msgs };
        });
        setSending(false);
        return;
      }

      // Streaming complete — build a data object compatible with existing post-processing
      const data = {
        content: [{ type: "text", text: streamedText }],
        provider: streamDoneEvent?.provider || (effectiveProvider),
        model: streamDoneEvent?.model || null,
        modelTier: streamDoneEvent?.modelTier || requestedTier,
        usage: streamDoneEvent?.usage || null,
      };

      let reply = streamedText || "No response received.";

      const localPrimer = targetAgent === "jace" ? localJaceRulesPrimer(prompt) : "";
      if (localPrimer) {
        reply = localPrimer;
      }

      if (["karn", "tibalt"].includes(targetAgent) && deckOracleNames.length) {
        reply = bracketKnownCardNames(reply, deckOracleNames);
      }

      if (targetAgent === "arbiter" && retryDepth === 0 && /^UNRESOLVED/m.test(reply)) {
        const needsCards = /Oracle text|card text|isn't provided|not provided/i.test(reply);

        if (needsCards) {
          const replyCards = [...reply.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1]);

          if (replyCards.length) {
            const enrichedText = prompt + "\n\n[Auto-retry: include Oracle text for " + replyCards.join(", ") + "]";
            setHistories(previous => ({
              ...previous,
              [targetAgent]: [
                ...baseHistory,
                { role: "assistant", content: reply + "\n\nAuto-retrying with explicit card context." },
              ],
            }));

            return send(enrichedText, targetAgent, 1);
          }
        }
      }

      if (targetAgent === "karn") {
        try {
          const processed = await postProcessKarnResponse(reply);
          reply = processed.text;
        } catch {
          // If banlist post-processing fails, deliver the unmodified reply.
        }
      }

      responseMeta.factReceipt = {
        provider: data.provider || (effectiveProvider),
        fallbackUsed: !forceProvider && requestedTier !== "anthropic" && data.provider === "anthropic",
        modelTier: data.modelTier || requestedTier,
        model: data.model,
        deckLocked: Boolean(deckLock),
        deckName: deckLock?.name || null,
        cardsProvided: countContextCards(cardContext + deckOracleContext + karnScryfallContext),
        rulingsProvided: countContextRulings(cardContext + deckOracleContext),
        engineContextProvided: Boolean(engineContext),
        arbiterTraceProvided: Boolean(responseMeta.arbiterTrace),
        arbiterStatus: responseMeta.arbiterStatus || null,
        arbiterRulesRetrieved: responseMeta.arbiterSources?.ruleNumbers?.length || 0,
        arbiterCardsRetrieved: responseMeta.arbiterSources?.cards?.length || 0,
        arbiterRulesGuruPrecedents: responseMeta.arbiterSources?.rulesGuruPrecedents?.length || 0,
        arbiterHallucinations: responseMeta.arbiterSources?.hallucinations?.length || 0,
        arbiterConfidence: responseMeta.arbiterSources?.confidence || null,
      };

      setHistories(previous => {
        const msgs = [...(previous[targetAgent] || [])];
        msgs[streamingIdx] = { role: "assistant", content: reply, ...responseMeta };
        return { ...previous, [targetAgent]: msgs };
      });
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      setHistories(previous => ({
        ...previous,
        [targetAgent]: [...baseHistory, {
          role: "assistant",
          content: isTimeout
            ? "Request timed out. The local model may be overloaded."
            : "Connection error. Could not reach the model.",
          isError: true,
          fallbackAvailable: true,
          originalPrompt: prompt,
          errorProvider: effectiveProvider,
        }],
      }));
    }

    setSending(false);
  };

  const retryWithFallback = (originalPrompt, targetAgentKey = null) => {
    const key = targetAgentKey || agent;
    setHistories(previous => ({
      ...previous,
      [key]: previous[key].slice(0, -1),
    }));
    send(originalPrompt, key, 0, "anthropic");
  };

  const exportChat = () => {
    const config = AGENTS[agent];
    const lines = histories[agent]
      .map(message => {
        const trace = message.arbiterTrace ? `\n\n[Arbiter Trace]\n${message.arbiterTrace}` : "";
        return `[${message.role === "user" ? "You" : config.name}]\n${message.content}${trace}`;
      })
      .join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mtg-chat-${agent}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => {
    const nextHistories = { ...histories, [agent]: [] };
    const nextLocks = { ...deckLocks, [agent]: null };
    setHistories(nextHistories);
    setDeckLocks(nextLocks);
    saveJson(CHAT_STORAGE_KEYS[agent], []);
    saveChatFile(nextHistories, nextLocks);
  };

  const unlockDeck = (agentOverride = agent) => {
    const nextLocks = { ...deckLocks, [agentOverride]: null };
    setDeckLocks(nextLocks);
    saveChatFile(histories, nextLocks);
  };

  const unlockAllDecks = () => {
    const nextLocks = emptyLocks();
    setDeckLocks(nextLocks);
    saveChatFile(histories, nextLocks);
  };

  return {
    clearChat,
    exportChat,
    deckLocks,
    histories,
    input,
    retryWithFallback,
    send,
    sending,
    setInput,
    unlockAllDecks,
    unlockDeck,
  };
}
