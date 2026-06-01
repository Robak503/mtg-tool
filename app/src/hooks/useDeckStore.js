"use client";

import { useEffect, useMemo, useState } from "react";

import { DECK_SEEDS } from "../data/deckSeeds";
import { buildColors, buildCurve, calcPrice, checkLegal, colorIdentityIssues } from "../lib/deckAnalytics";
import {
  buildSeedDeck,
  defaultDeckMemory,
  loadCardNameCatalog,
  loadTokenCatalog,
  normalizeDeck,
  parseDeck,
  serializeDeck,
  suspiciousDeckEntries,
} from "../lib/deckMemory";
import {
  cancelScheduledDeckFileSave,
  createDeckBackup,
  flushDeckFileSave,
  loadDeckFile,
  saveDeckFile,
  scheduleDeckFileSave,
} from "../lib/deckPersistence";
import { fetchDeckData } from "../lib/scryfall";
import { loadJson, saveJson } from "../lib/storage";

function mergeSeedDecks(decks, seedDecks) {
  const merged = [...decks];

  for (const seed of seedDecks) {
    const index = merged.findIndex(deck =>
      (deck.memory?.owner || "Colton") === seed.memory.owner && deck.name === seed.name
    );

    if (index === -1) {
      merged.push(seed);
      continue;
    }

    const existingCommanderCount = (merged[index].cards || [])
      .filter(card => card.section === "Commander")
      .reduce((sum, card) => sum + card.qty, 0);
    const seedCommanderCount = (seed.cards || [])
      .filter(card => card.section === "Commander")
      .reduce((sum, card) => sum + card.qty, 0);

    if (existingCommanderCount > seedCommanderCount + 2 && seedCommanderCount > 0) {
      merged[index] = normalizeDeck({
        ...merged[index],
        cards: seed.cards,
        memory: {
          ...seed.memory,
          ...(merged[index].memory || {}),
        },
      });
    }
  }

  return merged;
}

export default function useDeckStore() {
  const [savedDecks, setSavedDecks] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [deckRaw, setDeckRaw] = useState("");
  const [deckName, setDeckName] = useState("My Deck");
  const [deckOwner, setDeckOwner] = useState("Colton");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectRequested, setProjectRequested] = useState(false);
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

      const fileDecks = await loadDeckFile();
      const saved = fileDecks || await loadJson("mtg-decks-v3") || await loadJson("mtg-decks-v2");
      const seedDecks = DECK_SEEDS.map(buildSeedDeck);

      if (saved?.length) {
        const normalized = mergeSeedDecks(saved.map(normalizeDeck), seedDecks);
        setSavedDecks(normalized);
        saveJson("mtg-decks-v3", normalized);
        saveDeckFile(normalized);
      } else {
        setSavedDecks(seedDecks);
        saveJson("mtg-decks-v3", seedDecks);
        saveDeckFile(seedDecks);
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

  // Combos are deck-specific and fetched on demand; drop the cached result when
  // the active deck changes so the Combos tab never shows the previous deck's
  // combos before a reload.
  useEffect(() => { setComboData(null); }, [activeDeckId]);

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
    setDeckDataLoad(true);
    const loaded = await fetchDeckData(deckCards);
    setDeckData(loaded);
    setDeckDataLoad(false);
    return loaded;
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

    const name = deckName.trim() || projectSearch.trim() || "My Deck";
    const deck = normalizeDeck({
      id: Date.now().toString(),
      name,
      cards,
      memory: {
        ...defaultDeckMemory(),
        owner: deckOwner.trim() || "Colton",
      },
    });

    persistDecks([...savedDecks, deck], { fileSave: "immediate" });
    setActiveDeckId(deck.id);
    setDeckData({});
    setDeckRaw("");
    setDeckName("My Deck");
    setProjectSearch("");
    setProjectRequested(false);

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
        owner: (ownerName || "").trim() || "Colton",
        notes: importedDeck.source ? `Imported from ${importedDeck.source}.` : "",
      },
    });
    persistDecks([...savedDecks, deck], { fileSave: "immediate" });
    setActiveDeckId(deck.id);
    setDeckData({});
    return deck;
  };

  const loadFromProject = () => {
    const name = projectSearch.trim();
    if (!name) return;

    const prompt = `[DECK_REQUEST] ${name}

Retrieve the deck file from this project's knowledge matching the commander name above. Return the deck contents wrapped in sentinel markers per META_deck_format.md:

<<<DECK_BEGIN: ${name}>>>
[raw decklist content verbatim from the file]
<<<DECK_END>>>

If no matching file exists, list the available deck files. If multiple variants exist, ask which to load.`;

    if (typeof window.sendPrompt === "function") window.sendPrompt(prompt);
    setProjectRequested(true);
    setDeckName(name);
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
    loadFromProject,
    mainCount,
    persistDecks,
    priceInfo,
    projectRequested,
    projectSearch,
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
    setProjectRequested,
    setProjectSearch,
    tokenCatalogReady,
    tokenCount,
    tokenEntries,
    updateActiveDeck,
    updateActiveMemory,
    updateAgentNote,
  };
}
