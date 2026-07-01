"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildColors, buildCurve, calcPrice, checkLegal, colorIdentityIssues } from "../lib/deck/deckAnalytics";
import {
  defaultDeckMemory,
  loadCardNameCatalog,
  loadTokenCatalog,
  normalizeDeck,
  parseDeck,
  serializeDeck,
  suspiciousDeckEntries,
} from "../lib/deck/deckMemory";
import {
  cancelScheduledDeckFileSave,
  createDeckBackup,
  flushDeckFileSave,
  loadDeckFile,
  saveDeckFile,
  scheduleDeckFileSave,
} from "../lib/deck/deckPersistence";
import { fetchDeckData } from "../lib/scryfall";
import { loadJson, saveJson } from "../lib/storage";

export default function useDeckStore(activeProfileName) {
  const [savedDecks, setSavedDecks] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [deckRaw, setDeckRaw] = useState("");
  const [deckName, setDeckName] = useState("My Deck");
  // The import-form owner defaults to the active profile. Start empty and fill
  // it once the profile name resolves (profiles load async after mount) so a
  // deck imported by Joe is attributed to Joe, not the old hardcoded "Colton".
  const [deckOwner, setDeckOwner] = useState("");
  const [gameResult, setGameResult] = useState("Win");
  const [gameOpponents, setGameOpponents] = useState("");
  const [gameNotes, setGameNotes] = useState("");
  const [tokenCatalogReady, setTokenCatalogReady] = useState(false);
  const [deckData, setDeckData] = useState({});
  const [deckDataLoad, setDeckDataLoad] = useState(false);
  const [comboData, setComboData] = useState(null);
  const [comboLoad, setComboLoad] = useState(false);

  useEffect(() => {
    (async () => {
      const tokenReady = await loadTokenCatalog();
      await loadCardNameCatalog();
      setTokenCatalogReady(tokenReady);

      // The server's per-profile deck file is authoritative. Use it as-is — no
      // seed re-merge, which would re-pollute the active profile with the
      // bundled deck library and clobber a freshly-migrated per-owner split.
      // localStorage is only a fallback for when the file can't be read; in that
      // case we migrate the cache to the file so the file becomes the source.
      const fileDecks = await loadDeckFile();
      if (fileDecks) {
        const normalized = fileDecks.map(normalizeDeck);
        setSavedDecks(normalized);
        saveJson("mtg-decks-v3", normalized);
      } else {
        const cached = (await loadJson("mtg-decks-v3")) || (await loadJson("mtg-decks-v2")) || [];
        const normalized = cached.map(normalizeDeck);
        setSavedDecks(normalized);
        saveJson("mtg-decks-v3", normalized);
        if (normalized.length) saveDeckFile(normalized);
      }
      // Start every session with NO active deck pre-loaded. Decks load into the
      // library, but the user picks one explicitly (and the chat's deck-confirm
      // flow verifies it) rather than the tool silently restoring a deck.
    })();
  }, []);

  useEffect(() => {
    const flushPendingSave = () => {
      flushDeckFileSave({ useBeacon: true });
    };

    window.addEventListener("pagehide", flushPendingSave);
    window.addEventListener("beforeunload", flushPendingSave);

    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      window.removeEventListener("beforeunload", flushPendingSave);
      flushDeckFileSave();
    };
  }, []);

  // Default the import-form owner to the active profile name once it loads.
  // Only fills a still-empty value so a manual edit in the form is never
  // clobbered. Switching profiles is a full reload, so this fires once.
  useEffect(() => {
    if (activeProfileName) setDeckOwner(prev => prev || activeProfileName);
  }, [activeProfileName]);

  // Everything deck-scoped clears when the active deck changes, in ONE place
  // (U-F2). Previously only comboData was dropped here while deckData relied on
  // callers remembering a manual setDeckData({}) — the deck-confirm modal path
  // didn't, so deck B's analytics (curve/legality/goldfish) could be computed
  // against deck A's hydration map. The epoch ref also invalidates any
  // in-flight loadDeckData fetch so a slow response for the previous deck
  // can't land as the new deck's data.
  const deckDataEpoch = useRef(0);
  useEffect(() => {
    deckDataEpoch.current += 1;
    setComboData(null);
    setDeckData({});
  }, [activeDeckId]);

  const activeDeck = useMemo(
    () => savedDecks.find(deck => deck.id === activeDeckId),
    [activeDeckId, savedDecks]
  );
  const deckCards = useMemo(() => activeDeck?.cards || [], [activeDeck]);
  const deckMemory = activeDeck?.memory || defaultDeckMemory();
  const tokenEntries = useMemo(() => suspiciousDeckEntries(deckCards), [deckCards]);
  const hasData = Object.keys(deckData).length > 0;
  const curve = useMemo(() => hasData ? buildCurve(deckCards, deckData) : {}, [deckCards, deckData, hasData]);
  const colors = useMemo(() => hasData ? buildColors(deckCards, deckData) : {}, [deckCards, deckData, hasData]);
  const priceInfo = useMemo(() => hasData ? calcPrice(deckCards, deckData) : null, [deckCards, deckData, hasData]);
  const legalIssues = useMemo(() => hasData ? checkLegal(deckCards, deckData) : [], [deckCards, deckData, hasData]);
  const colorIssues = useMemo(() => hasData ? colorIdentityIssues(deckCards, deckData) : [], [deckCards, deckData, hasData]);
  const mainCount = useMemo(
    () => deckCards.filter(card => card.section !== "Sideboard" && card.section !== "Tokens").reduce((sum, card) => sum + card.qty, 0),
    [deckCards]
  );
  const commanderText = useMemo(
    () => deckCards.filter(card => card.section === "Commander").map(card => card.name).join(" / ") || activeDeck?.name || "No commander saved",
    [activeDeck?.name, deckCards]
  );
  const tokenCount = useMemo(
    () => deckCards.filter(card => card.section === "Tokens").reduce((sum, card) => sum + card.qty, 0),
    [deckCards]
  );
  const gameCount = (deckMemory.games || []).length;
  const agentNotes = deckMemory.agentNotes || defaultDeckMemory().agentNotes;

  const loadDeckData = async () => {
    if (!deckCards.length) return {};
    if (hasData) return deckData;
    if (deckDataLoad) return deckData;
    const epoch = deckDataEpoch.current;
    setDeckDataLoad(true);
    try {
      const loaded = await fetchDeckData(deckCards);
      // The active deck changed while this fetch was in flight — drop the
      // now-stale result instead of installing it as the new deck's data.
      if (epoch === deckDataEpoch.current) setDeckData(loaded);
      return loaded;
    } finally {
      // try/finally (U-F10): a throw in fetchDeckData must not leave
      // deckDataLoad latched true (it disables the goldfish/stats buttons).
      setDeckDataLoad(false);
    }
  };

  // Find Commander Spellbook combos in the deck (and ones a single card away).
  // Names only — no Scryfall fetch needed — so this is independent of deckData.
  const loadCombos = async () => {
    if (!deckCards.length) return null;
    if (comboLoad) return comboData;
    setComboLoad(true);
    try {
      const cardNames = deckCards
        .filter(card => card.section !== "Tokens" && card.section !== "Sideboard")
        .map(card => card.name);
      const response = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNames }),
      });
      const data = await response.json();
      setComboData(data);
      return data;
    } catch (error) {
      const failed = { ready: false, error: error.message, included: [], almostIncluded: [] };
      setComboData(failed);
      return failed;
    } finally {
      setComboLoad(false);
    }
  };

  const persistDecks = (decks, options = {}) => {
    const normalized = decks.map(normalizeDeck);
    setSavedDecks(normalized);
    saveJson("mtg-decks-v3", normalized);

    if (options.fileSave === "immediate") {
      cancelScheduledDeckFileSave();
      saveDeckFile(normalized);
    } else {
      scheduleDeckFileSave(normalized);
    }
  };

  const updateActiveDeck = (updater) => {
    if (!activeDeckId) return;
    const updated = savedDecks.map(deck =>
      deck.id === activeDeckId ? normalizeDeck(updater(normalizeDeck(deck))) : deck
    );
    persistDecks(updated);
  };

  // Mutate a deck by id (not necessarily the active one) — used by "Karn applies
  // a cut/add" so an apply targets the chat's LOCKED deck even when the sidebar's
  // active deck differs. Returns the updated deck, or null if the id is unknown.
  const updateDeckById = (id, updater, options = {}) => {
    if (!id) return null;
    let next = null;
    const updated = savedDecks.map(deck => {
      if (deck.id !== id) return deck;
      next = normalizeDeck(updater(normalizeDeck(deck)));
      return next;
    });
    if (!next) return null;
    persistDecks(updated, options);
    return next;
  };

  const updateActiveMemory = (patch) => {
    updateActiveDeck(deck => ({
      ...deck,
      memory: {
        ...defaultDeckMemory(),
        ...(deck.memory || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const updateAgentNote = (key, value) => {
    updateActiveMemory({
      agentNotes: {
        ...agentNotes,
        [key]: value,
      },
    });
  };

  const recordGame = () => {
    if (!activeDeckId || (!gameOpponents.trim() && !gameNotes.trim())) return;
    const entry = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      result: gameResult,
      opponents: gameOpponents.trim(),
      notes: gameNotes.trim(),
    };

    updateActiveMemory({ games: [entry, ...(deckMemory.games || [])].slice(0, 50) });
    setGameOpponents("");
    setGameNotes("");
  };

  const deleteGame = (id) => {
    updateActiveMemory({ games: (deckMemory.games || []).filter(game => game.id !== id) });
  };

  const importDeck = () => {
    let raw = deckRaw;
    const sentinelMatch = raw.match(/<<<DECK_BEGIN(?::\s*([^>]+))?>>>([\s\S]*?)<<<DECK_END>>>/);

    if (sentinelMatch) {
      raw = sentinelMatch[2].trim();
      if (sentinelMatch[1] && deckName === "My Deck") {
        setDeckName(sentinelMatch[1].trim());
      }
    }

    const cards = parseDeck(raw);
    if (!cards.length) return null;

    const name = deckName.trim() || "My Deck";
    const deck = normalizeDeck({
      id: Date.now().toString(),
      name,
      cards,
      memory: {
        ...defaultDeckMemory(),
        owner: deckOwner.trim() || activeProfileName || "Colton",
      },
    });

    persistDecks([...savedDecks, deck], { fileSave: "immediate" });
    setActiveDeckId(deck.id);
    setDeckData({});
    setDeckRaw("");
    setDeckName("My Deck");

    return deck;
  };

  // Save a deck fetched from a Moxfield/Archidekt URL (already resolved by
  // /api/decks/import-url) into the local library and make it active.
  const importDeckFromUrl = (importedDeck, ownerName) => {
    if (!importedDeck || !Array.isArray(importedDeck.cards) || !importedDeck.cards.length) {
      return null;
    }
    const cards = importedDeck.cards.map(c => ({
      qty: c.qty || 1,
      name: c.name,
      section: c.section || "Mainboard",
    }));
    const deck = normalizeDeck({
      // Collision-safe id: two URL imports in the same millisecond must not
      // share an id (Date.now() alone can collide on a fast double-save).
      id: globalThis.crypto?.randomUUID?.() || `deck-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: (importedDeck.name || "").trim() || "Imported deck",
      cards,
      memory: {
        ...defaultDeckMemory(),
        owner: (ownerName || "").trim() || activeProfileName || "Colton",
        notes: importedDeck.source ? `Imported from ${importedDeck.source}.` : "",
      },
    });
    persistDecks([...savedDecks, deck], { fileSave: "immediate" });
    setActiveDeckId(deck.id);
    setDeckData({});
    return deck;
  };

  const deleteDeck = (id) => {
    const updated = savedDecks.filter(deck => deck.id !== id);
    persistDecks(updated, { fileSave: "immediate" });

    if (activeDeckId === id) {
      setActiveDeckId(null);
      setDeckData({});
    }
  };

  const backupDeckLibrary = async () => {
    cancelScheduledDeckFileSave();
    const result = await createDeckBackup(savedDecks);
    return result;
  };

  const exportDeckLibrary = () => {
    if (!savedDecks.length) return;

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: savedDecks,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mtg-deck-library-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importDeckLibrary = async (file) => {
    if (!file) return null;

    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const importedDecks = Array.isArray(parsed) ? parsed : parsed.decks;

    if (!Array.isArray(importedDecks) || !importedDecks.length) {
      throw new Error("Library JSON must contain a decks array.");
    }

    const merged = new Map();
    for (const deck of savedDecks) {
      const owner = deck.memory?.owner || "Colton";
      merged.set(deck.id || `${owner}:${deck.name}`, deck);
    }
    for (const deck of importedDecks.map(normalizeDeck)) {
      const owner = deck.memory?.owner || "Colton";
      merged.set(deck.id || `${owner}:${deck.name}`, deck);
    }

    const nextDecks = [...merged.values()];
    persistDecks(nextDecks, { fileSave: "immediate" });
    setDeckData({});
    if (!activeDeckId && nextDecks[0]?.id) setActiveDeckId(nextDecks[0].id);

    return { imported: importedDecks.length, total: nextDecks.length };
  };

  const exportDeck = () => {
    if (!deckCards.length) return;
    const url = URL.createObjectURL(new Blob([serializeDeck(deckCards)], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeDeck?.name || "deck"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return {
    activeDeck,
    activeDeckId,
    agentNotes,
    backupDeckLibrary,
    colors,
    colorIssues,
    comboData,
    comboLoad,
    commanderText,
    curve,
    deckCards,
    deckData,
    deckDataLoad,
    deckMemory,
    deckName,
    deckOwner,
    deckRaw,
    deleteDeck,
    deleteGame,
    exportDeck,
    exportDeckLibrary,
    gameCount,
    gameNotes,
    gameOpponents,
    gameResult,
    hasData,
    importDeck,
    importDeckFromUrl,
    importDeckLibrary,
    legalIssues,
    loadCombos,
    loadDeckData,
    mainCount,
    persistDecks,
    priceInfo,
    recordGame,
    savedDecks,
    setActiveDeckId,
    setDeckData,
    setDeckName,
    setDeckOwner,
    setDeckRaw,
    setGameNotes,
    setGameOpponents,
    setGameResult,
    tokenCatalogReady,
    tokenCount,
    tokenEntries,
    updateActiveDeck,
    updateDeckById,
    updateActiveMemory,
    updateAgentNote,
  };
}
