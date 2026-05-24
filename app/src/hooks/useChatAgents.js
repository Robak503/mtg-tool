"use client";

import { useEffect, useState } from "react";

import { AGENTS, ARBITER_PROMPT_FAST } from "../lib/agents";
import { flushChatFileSave, loadChatState, saveChatFile, scheduleChatFileSave } from "../lib/chatPersistence";
import { serializeDeck, serializeDeckMemory } from "../lib/deckMemory";
import { buildCardContext, buildCardContextForNames, loadCardCatalog, postProcessKarnResponse } from "../lib/scryfall";
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

async function fetchArbiterTrace({ question, cardContext, context, fast }) {
  try {
    const response = await fetch("/api/arbiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        cardContext,
        context,
        fast,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    return data.trace || "";
  } catch {
    return "";
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

function createDeckLock(deck) {
  if (!deck) return null;
  return {
    id: deck.id,
    name: deck.name || "Unnamed deck",
    owner: deck.memory?.owner || "Colton",
    commander: deckCommander(deck),
    mainCount: deckMainCount(deck),
    tokenCount: deckTokenCount(deck),
    lockedAt: new Date().toISOString(),
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
    confirmLock ? `On your next reply, briefly confirm that ${lock.name} is locked for this conversation before answering the user's request.` : "",
    `Deck: ${lock.name}`,
    `Owner: ${lock.owner}`,
    `Commander: ${lock.commander}`,
    `Locked At: ${lock.lockedAt}`,
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
  savedDecks,
  setAgent,
  tokenEntries,
}) {
  const [histories, setHistories] = useState(emptyHistories());
  const [deckLocks, setDeckLocks] = useState(emptyLocks());
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

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

  const send = async (text, agentOverride, retryDepth = 0) => {
    const targetAgent = agentOverride || agent;
    const targetConfig = AGENTS[targetAgent];
    const prompt = (text || input).trim();

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
        deckLock = createDeckLock(activeDeck);
        deckLockJustCreated = true;
        activeLocks = { ...activeLocks, [targetAgent]: deckLock };
        setDeckLocks(activeLocks);
      }
      let systemPrompt = targetAgent === "arbiter" && fastMode
        ? ARBITER_PROMPT_FAST
        : targetConfig.prompt;

      const conversationText = baseHistory.slice(-8).map(message => message.content).join("\n");
      const savedDeckContext = buildSavedDeckContext(savedDecks, targetAgent, conversationText, activeDeck?.id);
      if (savedDeckContext.context) systemPrompt += `\n\n${savedDeckContext.context}`;

      if (locksDeckContext && deckLock) {
        systemPrompt += `\n\n${lockContext(deckLock, targetAgent, deckLockJustCreated)}`;
      } else if ((targetAgent === "karn" || targetAgent === "tibalt") && deckCards.length) {
        systemPrompt += `\n\n## Active Deck: "${activeDeck?.name || "Unnamed"}"\n${serializeDeck(deckCards)}`;
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
      let engineContext = "";
      let responseMeta = {};

      const rulingsForAgent = targetAgent === "karn"
        ? { includeRulings: false }
        : { includeRulings: true, maxRulingsPerCard: targetAgent === "arbiter" ? 5 : 3 };

      const deckOracleNames = locksDeckContext && deckLock
        ? (deckLock.cardNames?.length ? deckLock.cardNames : deckOracleCardNamesFromText(deckLock.deckText))
        : (locksDeckContext && activeDeck ? deckOracleCardNamesFromCards(activeDeck.cards || deckCards) : []);

      try {
        if (deckOracleNames.length) {
          deckOracleContext = await buildCardContextForNames(deckOracleNames, {
            includeRulings: false,
            maxRulingsPerCard: 0,
            heading: "## CARDS REFERENCED (loaded deck Oracle text - authoritative; use ONLY this text for card behavior)",
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

      if (deckOracleContext || cardContext) {
        augmentedContent = `${deckOracleContext || ""}${cardContext || ""}## USER QUESTION\n\n${prompt}`;
      }

      if (shouldUseEngineContext(targetAgent, prompt)) {
        const engineQuery = `${prompt}\n${deckLock ? `Deck: ${deckLock.name}\nCommander: ${deckLock.commander}` : ""}`;
        engineContext = await fetchEngineContext({ query: engineQuery, limit: targetAgent === "karn" ? 5 : 4 });
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
        const arbiterTrace = await fetchArbiterTrace({
          question: prompt,
          cardContext: `${deckOracleContext || ""}${cardContext || ""}`,
          context: `${engineContext || ""}${activeDeckContext}`,
          fast: fastMode,
        });

        if (arbiterTrace) {
          responseMeta.arbiterTrace = arbiterTrace;
          augmentedContent = `${engineContext || ""}${deckOracleContext || ""}${cardContext || ""}## ARBITER TRACE\nThis trace was produced by the backend Arbiter rules engine. Use it as the formal source of truth, but answer the user as Jace in plain table language.\n\n${arbiterTrace}\n\n## USER QUESTION\n\n${prompt}`;
        }
      }

      const apiMessages = retryDepth === 0
        ? trimApiHistory([...histories[targetAgent], { role: "user", content: augmentedContent }])
        : trimApiHistory(baseHistory);

      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2500,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      let reply = data.content?.[0]?.text || data.error?.message || data.error || "No response received.";

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

      setHistories(previous => ({
        ...previous,
        [targetAgent]: [...baseHistory, { role: "assistant", content: reply, ...responseMeta }],
      }));
    } catch {
      setHistories(previous => ({
        ...previous,
        [targetAgent]: [...baseHistory, { role: "assistant", content: "Connection error. Please try again." }],
      }));
    }

    setSending(false);
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
    send,
    sending,
    setInput,
    unlockAllDecks,
    unlockDeck,
  };
}
