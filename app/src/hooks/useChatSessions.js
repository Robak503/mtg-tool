"use client";

import { useEffect, useRef, useState } from "react";

import { AGENTS, ARBITER_PROMPT_FAST } from "../lib/agents";
import { fetchArbiterTrace, shouldUseArbiterTrace, summarizeArbiterMetadata } from "../lib/arbiterUtils";
import { bracketKnownCardNames, countContextCards, countContextRulings, localJaceRulesPrimer } from "../lib/chatPostProcess";
import { flushChatFileSave, loadChatState, scheduleChatSessionsSave } from "../lib/chatPersistence";
import {
  buildSavedDeckContext,
  createDeckLock,
  deckCommander,
  deckCommanderNames,
  deckLockNeedsConfirmation,
  deckOracleCardNamesFromCards,
  deckOracleCardNamesFromText,
  DECK_REQUIRED_AGENTS,
  fetchEngineContext,
  fetchGoldfishInsightsBlock,
  lockContext,
  shouldUseDeckScopedContext,
  shouldUseEngineContext,
} from "../lib/deckContextBuilder";
import { fetchCollectionContextBlock } from "../lib/collectionContextBuilder";
import { swapBehaviorTagIds } from "./useColorTags";
import { serializeDeck, serializeDeckMemory } from "../lib/deckMemory";
import {
  buildCardContext,
  buildCardContextForNames,
  buildKarnScryfallSearchContext,
  loadCardCatalog,
  postProcessKarnResponse,
} from "../lib/scryfall";

const API_HISTORY_LIMIT = 8;
const DECK_LOCK_AGENTS = new Set(["jace", "karn", "tibalt", "arbiter"]);
// Last-active session ID per agent — stored in localStorage so the user
// returns to whichever conversation they last viewed when reopening the app.
const ACTIVE_SESSION_STORAGE_KEY = "mtg-active-session-ids";

// ─── Pure helpers ────────────────────────────────────────────────────────────

function generateSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `s-${globalThis.crypto.randomUUID()}`;
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function autoNameFromPrompt(prompt) {
  const trimmed = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "Untitled chat";
  return trimmed.length > 60 ? trimmed.slice(0, 57) + "…" : trimmed;
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

function loadActiveSessionIds() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistActiveSessionIds(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage failure must not block chat.
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export default function useChatSessions({
  activeDeck,
  activeProfileName,
  agent,
  deckCards,
  fastMode,
  modelProvider = "fast",
  savedDecks,
  setAgent,
  tokenEntries,
}) {
  const [sessions, setSessions] = useState([]);
  const [activeSessionIds, setActiveSessionIds] = useState(() => loadActiveSessionIds());
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  // A prefill staged to survive the imminent agent-switch input-clear (below):
  // callers that switch agent *and* want a starting draft (e.g. Build-From-Vault)
  // set this just before changing `agent`; the clear effect restores it instead
  // of wiping. Consumed (reset to null) on the first agent change after priming.
  const pendingInputRef = useRef(null);
  const primeInput = (text) => { pendingInputRef.current = String(text ?? ""); };
  const [sending, setSending] = useState(false);
  const [knowledgeStatus, setKnowledgeStatus] = useState(null);

  // ─── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const state = await loadChatState();
      if (state?.sessions) {
        setSessions(state.sessions);
      }
      setChatLoaded(true);
    })();
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
        // version metadata should not block chat
      }
    })();
    return () => { active = false; };
  }, []);

  // ─── Persist on changes ────────────────────────────────────────────────────
  useEffect(() => {
    const flush = () => flushChatFileSave({ useBeacon: true });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flushChatFileSave();
    };
  }, []);

  useEffect(() => {
    if (!chatLoaded) return;
    // Skip persistence writes while any session has a streaming message.
    const isStreaming = sessions.some(session =>
      session.messages.some(m => m.streaming === true)
    );
    if (isStreaming) return;
    scheduleChatSessionsSave(sessions);
  }, [chatLoaded, sessions]);

  useEffect(() => {
    persistActiveSessionIds(activeSessionIds);
  }, [activeSessionIds]);

  // Clear typed-but-unsent input when the user switches agents so a draft
  // intended for one agent doesn't bleed into a different agent's chat — unless
  // a prefill was primed for the new agent (Build-From-Vault), in which case
  // restore that instead of clearing.
  useEffect(() => {
    if (pendingInputRef.current !== null) {
      setInput(pendingInputRef.current);
      pendingInputRef.current = null;
    } else {
      setInput("");
    }
  }, [agent]);

  // ─── Session derivations ────────────────────────────────────────────────────
  const activeSessionId = activeSessionIds[agent] || null;
  const activeSessions = sessions.filter(s => !s.archived);
  const archivedSessions = sessions.filter(s => s.archived);

  // Resolve the currently visible session for the active agent. If the stored
  // active-id is stale (session was archived/deleted), fall back to the most
  // recent non-archived session for that agent.
  const currentSession = (() => {
    const byId = activeSessionId ? sessions.find(s => s.id === activeSessionId) : null;
    if (byId && byId.agent === agent && !byId.archived) return byId;
    const candidates = sessions
      .filter(s => s.agent === agent && !s.archived)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return candidates[0] || null;
  })();

  // ─── Pending-lock ⇄ active-deck sync ──────────────────────────────────────
  // While a chat's deck lock is still PENDING (unconfirmed), keep it pointed at
  // the active deck. This is what makes the confirm bar's "Swap deck" work:
  // changing the active deck (there or in the sidebar) re-targets the pending
  // lock, and we rebuild it from the fully-loaded activeDeck so card context is
  // complete. Once the lock is confirmed this stops — a locked chat must not
  // follow later sidebar changes.
  const pendingLockId = currentSession?.lockedDeck?.confirmed === false
    ? currentSession.lockedDeck.id
    : null;
  useEffect(() => {
    if (!currentSession?.id || !activeDeck) return;
    if (pendingLockId === null || pendingLockId === activeDeck.id) return;
    if (!DECK_LOCK_AGENTS.has(currentSession.agent)) return;
    updateSession(currentSession.id, s => (
      s.lockedDeck && s.lockedDeck.confirmed === false
        ? { ...s, lockedDeck: createDeckLock(activeDeck, knowledgeStatus) }
        : s
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck?.id, pendingLockId, currentSession?.id, currentSession?.agent]);

  // ─── Deck-required agents: bind to a deck once one is available ─────────────
  // Karn/Tibalt must talk about a specific deck. When such a chat has no lock
  // yet (and the user hasn't opted out) and an active deck becomes available —
  // e.g. they just picked one in the deck-selection pop-out, or imported one and
  // returned — create a PENDING lock so the confirm flow takes over. This is
  // what advances the pop-out from "pick a deck" to "confirm <deck>".
  useEffect(() => {
    if (!currentSession?.id || !activeDeck) return;
    if (!DECK_REQUIRED_AGENTS.has(currentSession.agent)) return;
    if (currentSession.lockedDeck || currentSession.deckDeclined) return;
    updateSession(currentSession.id, s => (
      !s.lockedDeck && !s.deckDeclined
        ? { ...s, lockedDeck: createDeckLock(activeDeck, knowledgeStatus) }
        : s
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck?.id, currentSession?.id, currentSession?.agent, currentSession?.lockedDeck, currentSession?.deckDeclined]);

  // ─── Session mutators ──────────────────────────────────────────────────────

  const updateSession = (sessionId, updater) => {
    setSessions(previous => previous.map(s => (s.id === sessionId ? updater(s) : s)));
  };

  const createSession = (targetAgent = agent, options = {}) => {
    const now = new Date().toISOString();
    const lockedDeck = options.lockedDeck !== undefined
      ? options.lockedDeck
      : (activeDeck && DECK_LOCK_AGENTS.has(targetAgent)
          ? createDeckLock(activeDeck, knowledgeStatus)
          : null);
    const newSession = {
      id: generateSessionId(),
      agent: targetAgent,
      name: options.name || "New chat",
      lockedDeck,
      messages: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    setSessions(previous => [...previous, newSession]);
    setActiveSessionIds(previous => ({ ...previous, [targetAgent]: newSession.id }));
    return newSession;
  };

  const switchSession = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    setActiveSessionIds(previous => ({ ...previous, [session.agent]: session.id }));
    if (session.agent !== agent && typeof setAgent === "function") {
      setAgent(session.agent);
    }
  };

  const archiveSession = (sessionId) => {
    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;
    updateSession(sessionId, s => ({ ...s, archived: true, updatedAt: new Date().toISOString() }));
    if (activeSessionIds[target.agent] === sessionId) {
      // Pick the most recent non-archived session for that agent (if any).
      const candidates = sessions
        .filter(s => s.agent === target.agent && !s.archived && s.id !== sessionId)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const next = candidates[0]?.id || null;
      setActiveSessionIds(previous => ({ ...previous, [target.agent]: next }));
    }
  };

  const unarchiveSession = (sessionId) => {
    updateSession(sessionId, s => ({ ...s, archived: false, updatedAt: new Date().toISOString() }));
  };

  const renameSession = (sessionId, name) => {
    const trimmed = String(name || "").trim().slice(0, 200);
    if (!trimmed) return;
    updateSession(sessionId, s => ({ ...s, name: trimmed, updatedAt: new Date().toISOString() }));
  };

  // Unlock = this chat becomes deck-less. We also set `deckDeclined` so the
  // first-send auto-lock (below) doesn't immediately re-lock the active deck
  // and re-prompt — the user explicitly chose no deck for this conversation.
  const unlockSessionDeck = (sessionId = currentSession?.id) => {
    if (!sessionId) return;
    updateSession(sessionId, s => ({ ...s, lockedDeck: null, deckDeclined: true, updatedAt: new Date().toISOString() }));
  };

  // Finalize a pending (unconfirmed) deck lock — the user verified the deck via
  // the confirm bar. Sending unblocks once confirmed.
  const confirmSessionDeck = (sessionId = currentSession?.id) => {
    if (!sessionId) return;
    updateSession(sessionId, s => (
      s.lockedDeck
        ? { ...s, lockedDeck: { ...s.lockedDeck, confirmed: true }, updatedAt: new Date().toISOString() }
        : s
    ));
  };

  // ─── Send (the big one) ────────────────────────────────────────────────────

  const send = async (text, agentOverride, retryDepth = 0, forceProvider = null, opts = {}) => {
    const targetAgent = agentOverride || agent;
    const targetConfig = AGENTS[targetAgent];
    // Explicit deck-view actions (e.g. the deck-command-center briefings) pass
    // autoConfirmDeck: there the deck is unambiguous, so we skip the confirm gate.
    const autoConfirmDeck = Boolean(opts.autoConfirmDeck);
    const prompt = (text || input).trim();
    const requestedTier = normalizeModelTier(forceProvider || modelProvider);
    const effectiveProvider = providerForModelTier(requestedTier);
    const isLocalProvider = effectiveProvider === "ollama";
    const isPureKarnCutRequest = targetAgent === "karn" &&
      /\b(cut|cuts|remove|trim)\b/i.test(prompt) &&
      !/\b(add|adds|upgrade|upgrades|replace|swap|alternative|alternatives|budget)\b/i.test(prompt);
    const localMaxTokens = 2500;

    if (!prompt || sending) return;

    // Resolve which session this send writes to. Prefer the active session
    // for the target agent; create one on-demand if none exists. Capture the
    // id NOW so streaming tokens always land in the originating session even
    // if the user switches sessions mid-stream.
    let originSessionId = activeSessionIds[targetAgent]
      || sessions
        .filter(s => s.agent === targetAgent && !s.archived)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id
      || null;

    let originSession = originSessionId ? sessions.find(s => s.id === originSessionId) : null;
    if (!originSession || originSession.archived || originSession.agent !== targetAgent) {
      originSession = createSession(targetAgent, {
        name: autoNameFromPrompt(prompt),
      });
      originSessionId = originSession.id;
    }

    const lockingAgent = DECK_LOCK_AGENTS.has(targetAgent);
    const deckRequiredAgent = DECK_REQUIRED_AGENTS.has(targetAgent);
    let deckLock = lockingAgent ? originSession.lockedDeck : null;
    let deckLockJustCreated = false;
    if (lockingAgent && !deckLock && activeDeck && !originSession.deckDeclined) {
      deckLock = createDeckLock(activeDeck, knowledgeStatus);
      deckLockJustCreated = true;
      updateSession(originSessionId, s => ({ ...s, lockedDeck: deckLock }));
    }

    // Deck-required gate. Karn/Tibalt must bind to a deck — or the user must
    // explicitly opt out — before any message. With no deck loaded and no prior
    // opt-out, block the send (the prompt stays in the box); ChatPanel's
    // deck-selection pop-out is already showing so the user resolves it there.
    // autoConfirmDeck (deck-view briefings) always targets the active deck, so
    // it bypasses this gate.
    if (deckRequiredAgent && !deckLock && !originSession.deckDeclined && !autoConfirmDeck) {
      return;
    }

    // Deck confirmation gate. A pending (unconfirmed) lock means the user hasn't
    // verified which deck this chat is bound to — block the send so ChatPanel's
    // confirm bar can resolve it (the prompt stays in the box; nothing is sent).
    // autoConfirmDeck finalizes the lock and proceeds for explicit deck actions.
    if (lockingAgent && deckLockNeedsConfirmation(deckLock)) {
      if (autoConfirmDeck) {
        deckLock = { ...deckLock, confirmed: true };
        updateSession(originSessionId, s => ({ ...s, lockedDeck: deckLock }));
      } else {
        return;
      }
    }

    const baseMessages = retryDepth === 0
      ? [...originSession.messages, { role: "user", content: prompt }]
      : [...originSession.messages];

    if (retryDepth === 0) {
      // Name newly-empty sessions from their first user message.
      const shouldRename = originSession.messages.length === 0 && originSession.name === "New chat";
      updateSession(originSessionId, s => ({
        ...s,
        messages: baseMessages,
        name: shouldRename ? autoNameFromPrompt(prompt) : s.name,
        updatedAt: new Date().toISOString(),
      }));
      if (agentOverride && typeof setAgent === "function") setAgent(agentOverride);
      setInput("");
    }

    setSending(true);

    try {
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

      const conversationText = baseMessages.slice(-8).map(m => m.content).join("\n");
      const savedDeckContext = buildSavedDeckContext(savedDecks, targetAgent, conversationText, activeDeck?.id, activeProfileName);
      if (savedDeckContext.context) systemPrompt += `\n\n${savedDeckContext.context}`;

      if (lockingAgent && deckLock) {
        systemPrompt += `\n\n${lockContext(deckLock, targetAgent, deckLockJustCreated)}`;
      } else if ((targetAgent === "karn" || targetAgent === "tibalt") && deckCards.length) {
        systemPrompt += `\n\n## Active Deck: "${activeDeck?.name || "Unnamed"}"\n${serializeDeck(deckCards)}`;
      }

      // Pull goldfish-history insights for the locked deck. Karn and Tibalt
      // benefit most — they're the agents that opine on deck quality. Jace
      // can use them when answering deck-scoped rules questions about pacing.
      // Skipped for Arbiter since it focuses on rules, not deck dynamics.
      if (deckLock?.id && ["jace", "karn", "tibalt"].includes(targetAgent)) {
        try {
          const insightsBlock = await fetchGoldfishInsightsBlock(deckLock.id);
          if (insightsBlock) systemPrompt += `\n\n${insightsBlock}`;
        } catch {
          // Insights are advisory; never block the chat request.
        }
      }

      // Inject COLLECTION SUMMARY for Karn (deck-analysis) and Jace (on
      // collection-intent prompts). Gated inside collectionContextBuilder
      // to keep token usage under control (≤400 token target). Tibalt
      // gets the dedicated /api/tibalt/roast-collection endpoint instead
      // of generic chat injection — collection roasts need outlier data
      // that doesn't belong in every chat turn.
      if (["karn", "jace"].includes(targetAgent)) {
        // Karn also gets a SWAP CANDIDATES block for cards the user tagged for
        // replacement; resolve the swap-tag ids from the local tag set.
        const swapTagIds = targetAgent === "karn" ? swapBehaviorTagIds() : [];
        const collectionBlock = await fetchCollectionContextBlock(targetAgent, prompt, swapTagIds);
        if (collectionBlock) systemPrompt += `\n\n${collectionBlock}`;
      }

      // Deck-scoped owned signal for Karn (G1): how many of THIS deck the user
      // owns + the in-color upgrade pool they already own, so Karn prefers
      // suggesting cards the user can apply at no cost. Advisory + bounded.
      if (targetAgent === "karn") {
        const overlapNames = (
          deckLock?.cardNames?.length ? deckLock.cardNames
          : deckLock?.deckText ? deckOracleCardNamesFromText(deckLock.deckText)
          : (deckCards || []).map(c => c.name)
        ) || [];
        const overlapCommanders = (
          deckLock?.commanderNames?.length ? deckLock.commanderNames
          : (deckCards || []).filter(c => c.section === "Commander").map(c => c.name)
        ) || [];
        if (overlapNames.length) {
          try {
            const resp = await fetch("/api/collection/deck-overlap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardNames: overlapNames, commanderNames: overlapCommanders }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.block) systemPrompt += `\n\n${data.block}`;
            }
          } catch { /* owned-pool hint is advisory; never block the send */ }
        }
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

      const deckOracleNames = lockingAgent && deckLock
        ? (useDeckScopedContext ? (deckLock.cardNames?.length ? deckLock.cardNames : deckOracleCardNamesFromText(deckLock.deckText)) : [])
        : (lockingAgent && activeDeck ? deckOracleCardNamesFromCards(activeDeck.cards || deckCards) : []);

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
      } catch { /* deck oracle attachment never blocks */ }

      try { cardContext = await buildCardContext(prompt, rulingsForAgent); }
      catch { /* fall back to plain prompt */ }

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
      } catch { /* karn local search context optional */ }

      let powerRankContext = "";
      try {
        if ((targetAgent === "karn" || targetAgent === "tibalt") && deckOracleNames.length >= 2 && !isPureKarnCutRequest) {
          if (deckLock?.powerRankFormatted) {
            powerRankContext = `${deckLock.powerRankFormatted}\n\n`;
          } else {
            const commanderNames = deckLock?.commanderNames?.length
              ? deckLock.commanderNames
              : deckLock?.commander
                ? deckLock.commander.split(" / ").map(n => n.trim()).filter(Boolean)
                : (activeDeck ? deckCommanderNames(activeDeck) : []);
            const powerRes = await fetch("/api/power-rank", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                deckText: deckLock?.deckText || (activeDeck ? serializeDeck(activeDeck.cards || deckCards) : ""),
                cardNames: deckOracleNames,
                commanderNames,
                maxAlmost: 10,
              }),
            });
            if (powerRes.ok) {
              const powerData = await powerRes.json();
              if (powerData.ready && powerData.formatted) {
                powerRankContext = `${powerData.formatted}\n\n`;
                if (deckLock) {
                  const updatedLock = { ...deckLock, powerRankFormatted: powerData.formatted };
                  updateSession(originSessionId, s => ({ ...s, lockedDeck: updatedLock }));
                  deckLock = updatedLock;
                }
              }
            }
          }
        }
      } catch { /* power ranking is supplemental */ }

      if (deckOracleContext || karnScryfallContext || powerRankContext || cardContext) {
        augmentedContent = `${deckOracleContext || ""}${karnScryfallContext || ""}${powerRankContext}${cardContext || ""}## USER QUESTION\n\n${prompt}`;
      }

      if (isPureKarnCutRequest && deckOracleNames.length) {
        augmentedContent = `${deckOracleContext || ""}## VALID CUT TARGETS\nOnly these exact locked-deck card names may be recommended as cuts:\n${deckOracleNames.map(name => `- [[${name}]]`).join("\n")}\n\n## USER QUESTION\n\n${prompt}`;
      }

      const lockedDeckNeedsEngineContext = Boolean(
        deckLock && lockingAgent && useDeckScopedContext && !isPureKarnCutRequest
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
        responseMeta.factReceipt = buildFactReceipt({
          provider: "ollama", model: "local-primer", modelTier: "local-primer", fallbackUsed: false,
          deckLock, cardContext, deckOracleContext, karnScryfallContext, engineContext, responseMeta,
        });

        updateSession(originSessionId, s => ({
          ...s,
          messages: [...baseMessages, { role: "assistant", content: primerReply, ...responseMeta }],
          updatedAt: new Date().toISOString(),
        }));
        setSending(false);
        return;
      }

      const apiMessages = retryDepth === 0
        ? trimApiHistory([...originSession.messages, { role: "user", content: augmentedContent }])
        : trimApiHistory(baseMessages);
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
        updateSession(originSessionId, s => ({
          ...s,
          messages: [...baseMessages, {
            role: "assistant",
            content: "Could not connect to the model endpoint.",
            isError: true,
            fallbackAvailable: true,
            originalPrompt: prompt,
            errorProvider: effectiveProvider,
          }],
          updatedAt: new Date().toISOString(),
        }));
        setSending(false);
        return;
      }

      const streamingMsgId = `streaming-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      updateSession(originSessionId, s => ({
        ...s,
        messages: [...baseMessages, { id: streamingMsgId, role: "assistant", content: "", streaming: true }],
      }));

      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let streamedText = "";
      let streamDoneEvent = null;
      let streamError = null;
      let streamNotice = null; // e.g. graceful model-too-big fallback (B3)

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
              setSessions(previous => previous.map(s => {
                if (s.id !== originSessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === streamingMsgId ? { ...m, content: streamedText } : m
                  ),
                };
              }));
            } else if (event.type === "done") {
              streamDoneEvent = event;
            } else if (event.type === "error") {
              streamError = event;
            } else if (event.type === "notice") {
              streamNotice = event.notice;
            }
          } catch { /* malformed line */ }
        }
      }

      if (streamError) {
        setSessions(previous => previous.map(s => {
          if (s.id !== originSessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === streamingMsgId ? {
                role: "assistant",
                content: streamError.error || "Model returned an error.",
                isError: true,
                fallbackAvailable: streamError.fallbackAvailable ?? true,
                originalPrompt: prompt,
                errorProvider: streamError.provider || effectiveProvider,
              } : m
            ),
            updatedAt: new Date().toISOString(),
          };
        }));
        setSending(false);
        return;
      }

      const data = {
        content: [{ type: "text", text: streamedText }],
        provider: streamDoneEvent?.provider || effectiveProvider,
        model: streamDoneEvent?.model || null,
        modelTier: streamDoneEvent?.modelTier || requestedTier,
        usage: streamDoneEvent?.usage || null,
      };

      let reply = streamedText || "No response received.";
      const localPrimer = targetAgent === "jace" ? localJaceRulesPrimer(prompt) : "";
      if (localPrimer) reply = localPrimer;

      if (["karn", "tibalt"].includes(targetAgent) && deckOracleNames.length) {
        reply = bracketKnownCardNames(reply, deckOracleNames);
      }

      if (targetAgent === "arbiter" && retryDepth === 0 && /^UNRESOLVED/m.test(reply)) {
        const needsCards = /Oracle text|card text|isn't provided|not provided/i.test(reply);
        if (needsCards) {
          const replyCards = [...reply.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1]);
          if (replyCards.length) {
            const enrichedText = prompt + "\n\n[Auto-retry: include Oracle text for " + replyCards.join(", ") + "]";
            updateSession(originSessionId, s => ({
              ...s,
              messages: [
                ...baseMessages,
                { role: "assistant", content: reply + "\n\nAuto-retrying with explicit card context." },
              ],
              updatedAt: new Date().toISOString(),
            }));
            return send(enrichedText, targetAgent, 1);
          }
        }
      }

      if (targetAgent === "karn") {
        try {
          const processed = await postProcessKarnResponse(reply);
          reply = processed.text;
        } catch { /* deliver unmodified reply */ }
      }

      if (streamNotice) responseMeta.fallbackNotice = streamNotice;

      responseMeta.factReceipt = buildFactReceipt({
        provider: data.provider || effectiveProvider,
        model: data.model,
        modelTier: data.modelTier || requestedTier,
        fallbackUsed: !forceProvider && requestedTier !== "anthropic" && data.provider === "anthropic",
        deckLock, cardContext, deckOracleContext, karnScryfallContext, engineContext, responseMeta,
      });

      setSessions(previous => previous.map(s => {
        if (s.id !== originSessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m =>
            m.id === streamingMsgId ? { role: "assistant", content: reply, ...responseMeta } : m
          ),
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      updateSession(originSessionId, s => ({
        ...s,
        messages: [...baseMessages, {
          role: "assistant",
          content: isTimeout
            ? "Request timed out. The local model may be overloaded."
            : "Connection error. Could not reach the model.",
          isError: true,
          fallbackAvailable: true,
          originalPrompt: prompt,
          errorProvider: effectiveProvider,
        }],
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setSending(false);
    }
  };

  // ─── Reply utilities ───────────────────────────────────────────────────────

  const retryWithFallback = (originalPrompt, targetAgentKey = null) => {
    const key = targetAgentKey || agent;
    const targetSession = sessions.find(s => s.agent === key && !s.archived && s.id === activeSessionIds[key]);
    if (targetSession) {
      updateSession(targetSession.id, s => ({ ...s, messages: s.messages.slice(0, -1) }));
    }
    send(originalPrompt, key, 0, "anthropic");
  };

  const exportChat = () => {
    if (!currentSession) return;
    const config = AGENTS[currentSession.agent];
    const lines = currentSession.messages
      .map(message => {
        const trace = message.arbiterTrace ? `\n\n[Arbiter Trace]\n${message.arbiterTrace}` : "";
        return `[${message.role === "user" ? "You" : config.name}]\n${message.content}${trace}`;
      })
      .join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mtg-chat-${currentSession.agent}-${currentSession.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => {
    // Archives the current session and creates a fresh empty one for the
    // same agent. Old session remains accessible via the archived toggle.
    if (currentSession) archiveSession(currentSession.id);
    createSession(agent);
  };

  return {
    // Session state
    sessions,
    activeSessions,
    archivedSessions,
    currentSession,
    activeSessionIds,
    // Session mutators
    createSession,
    switchSession,
    archiveSession,
    unarchiveSession,
    renameSession,
    unlockSessionDeck,
    confirmSessionDeck,
    // Chat I/O
    input, setInput, primeInput, sending,
    send, retryWithFallback,
    exportChat, clearChat,
    // Knowledge
    knowledgeStatus,
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function buildFactReceipt({
  provider, model, modelTier, fallbackUsed,
  deckLock, cardContext, deckOracleContext, karnScryfallContext, engineContext, responseMeta,
}) {
  return {
    provider,
    fallbackUsed,
    modelTier,
    model,
    deckLocked: Boolean(deckLock),
    deckName: deckLock?.name || null,
    cardsProvided: countContextCards((cardContext || "") + (deckOracleContext || "") + (karnScryfallContext || "")),
    rulingsProvided: countContextRulings((cardContext || "") + (deckOracleContext || "")),
    engineContextProvided: Boolean(engineContext),
    arbiterTraceProvided: Boolean(responseMeta.arbiterTrace),
    arbiterStatus: responseMeta.arbiterStatus || null,
    arbiterRulesRetrieved: responseMeta.arbiterSources?.ruleNumbers?.length || 0,
    arbiterCardsRetrieved: responseMeta.arbiterSources?.cards?.length || 0,
    arbiterRulesGuruPrecedents: responseMeta.arbiterSources?.rulesGuruPrecedents?.length || 0,
    arbiterHallucinations: responseMeta.arbiterSources?.hallucinations?.length || 0,
    arbiterConfidence: responseMeta.arbiterSources?.confidence || null,
  };
}
