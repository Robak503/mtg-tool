"use client";

/**
 * CollectionView — top-level shell for the Collection tab.
 *
 * Owns:
 *   - data fetch via /api/collection (GET)
 *   - loading / error / recovery-warning state
 *   - filter state (search / view / finish)
 *   - selected row state (drives the right detail drawer)
 *
 * The Add / Import / Roast actions each open their own modal
 * (CollectionAddModal, CollectionImportModal, CollectionRoastModal); the grid,
 * the filters drawer, and the detail drawer are sibling components in ./
 */

import { useEffect, useMemo, useState } from "react";

import CollectionGrid from "./CollectionGrid";
import CollectionFilters, { applyFilters } from "./CollectionFilters";
import CollectionCardDetail from "./CollectionCardDetail";
import CollectionAddModal from "./CollectionAddModal";
import CollectionImportModal from "./CollectionImportModal";
import CollectionRoastModal from "./CollectionRoastModal";
import ColorTagManager from "./ColorTagManager";
import useColorTags from "../../hooks/useColorTags";

// Obsidian & Gold — matches the app shell theme (cool-neutral, rich gold).
const COLORS = {
  BG: "#090a0d",
  BG2: "#121319",
  BG3: "#181922",
  LINE: "#2b2c34",
  TEXT: "#dfe2ec",
  MUTED: "#9a9caa",
  GOLD: "#d4af37",
  RED: "#a44c45",
};

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// The Vault is gold-themed (not agent-themed); reuse the shared modal/cfg shape.
const VAULT_CFG = {
  color: COLORS.GOLD,
  border: "rgba(212,175,55,0.40)",
  dim: "rgba(212,175,55,0.12)",
  glow: "rgba(212,175,55,0.22)",
};

const DEFAULT_FILTERS = {
  search: "",
  view: "owned",
  finish: "any",
};

export default function CollectionView({ onClose }) {
  const [state, setState] = useState({
    status: "loading",
    collection: null,
    error: null,
    recoveryWarning: null,
  });
  const [selectedRow, setSelectedRow] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState({ conflicts: [], totalDecks: 0 });
  const [roastOpen, setRoastOpen] = useState(false);
  // 30-day value delta from price-history (null until a snapshot ≥30d old exists)
  const [priceDelta, setPriceDelta] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const colorTags = useColorTags();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/collection");
        const body = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setState({ status: "error", collection: null, error: body.error || "Failed to load collection", recoveryWarning: null });
          return;
        }
        setState({
          status: "ready",
          collection: body.collection,
          error: null,
          recoveryWarning: body.recoveryWarning,
        });
      } catch (error) {
        if (!cancelled) setState({ status: "error", collection: null, error: error.message, recoveryWarning: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cross-deck conflicts — refetch whenever the collection changes
  // (collection.updatedAt is bumped on every atomic write). The decks
  // file can change out-of-band, so this is best-effort; users see
  // freshly-computed conflicts on every collection write.
  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/collection/conflicts");
        if (!resp.ok) return;
        const body = await resp.json();
        if (!cancelled) setConflicts(body);
      } catch {
        // Conflicts are advisory; don't block the view.
      }
    })();
    return () => { cancelled = true; };
  }, [state.status, state.collection?.updatedAt]);

  // Price history — ensure today's snapshot exists (idempotent per day),
  // then pull stats for the 30-day value delta. Fire-and-forget: the
  // value-over-time line is a bonus, never blocks the grid.
  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/collection/prices", { method: "POST" });
        const resp = await fetch("/api/collection/stats");
        if (!resp.ok) return;
        const body = await resp.json();
        if (!cancelled) setPriceDelta(body.value?.deltas?.d30 || null);
      } catch {
        // Price history is advisory.
      }
    })();
    return () => { cancelled = true; };
  }, [state.status, state.collection?.updatedAt]);

  const cards = state.collection?.cards || [];
  const filteredCards = useMemo(() => applyFilters(cards, filters), [cards, filters]);

  const totalCardCount = useMemo(() => {
    return cards.reduce((sum, row) => {
      if (row.wishlist) return sum;
      const rowTotal = (row.stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);
      return sum + rowTotal;
    }, 0);
  }, [cards]);

  const uniqueCount = cards.filter(c => !c.wishlist).length;

  const conflictedOracleIds = useMemo(
    () => new Set((conflicts.conflicts || []).map(c => c.oracleId)),
    [conflicts.conflicts],
  );

  // Collection value — sum of (qty × per-finish price) across all owned
  // (non-wishlist) rows. Cheap to compute inline; avoids a stats-route
  // round-trip on every render. The /api/collection/stats route is
  // available for historical deltas once the price-history file is
  // populated (Step 13.1 follow-up).
  const collectionValue = useMemo(() => {
    let total = 0;
    for (const row of cards) {
      if (row.wishlist) continue;
      for (const stack of row.stacks || []) {
        const qty = stack.quantity || 0;
        if (qty <= 0) continue;
        const key = stack.finish === "foil"
          ? "usdFoil"
          : stack.finish === "etched"
            ? "usdEtched"
            : "usd";
        const price = parseFloat(row.prices?.[key] || 0);
        if (Number.isFinite(price)) total += price * qty;
      }
    }
    return Math.round(total * 100) / 100;
  }, [cards]);

  // Wishlist total cost — only computed when the wishlist view is
  // active so we don't waste cycles on the typical browse path.
  const wishlistStats = useMemo(() => {
    if (filters.view !== "wishlist") return { count: 0, cost: 0 };
    let count = 0;
    let cost = 0;
    for (const row of cards) {
      if (!row.wishlist) continue;
      count += 1;
      for (const stack of row.stacks || []) {
        const key = stack.finish === "foil"
          ? "usdFoil"
          : stack.finish === "etched"
            ? "usdEtched"
            : "usd";
        const price = parseFloat(row.prices?.[key] || 0);
        if (Number.isFinite(price)) cost += price;
      }
    }
    return { count, cost: Math.round(cost * 100) / 100 };
  }, [cards, filters.view]);

  // Refresh helpers used by the detail drawer after save/delete
  const handleCollectionUpdate = (updated) => {
    setState(s => ({ ...s, collection: updated }));
    // If the selected row was updated, refresh the selection from the new data
    if (selectedRow) {
      const fresh = updated.cards.find(c => c.scryfallId === selectedRow.scryfallId);
      setSelectedRow(fresh || null);
    }
  };
  const handleCollectionDelete = (updated) => {
    setState(s => ({ ...s, collection: updated }));
    setSelectedRow(null);
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: COLORS.BG,
      color: COLORS.TEXT,
      fontFamily: FONT,
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: `1px solid ${COLORS.LINE}`,
        background: COLORS.BG2,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.GOLD,
            letterSpacing: "0.04em",
          }}>
            The Vault
          </h1>
          {state.status === "ready" && (
            <span style={{ fontSize: 12, color: COLORS.MUTED }}>
              <strong style={{ color: COLORS.TEXT }}>{totalCardCount}</strong> cards cataloged · {uniqueCount} unique
              {collectionValue > 0 && (
                <>
                  {" · owned value "}
                  <span style={{ color: COLORS.GOLD, fontWeight: 700 }}>
                    ${collectionValue.toFixed(2)}
                  </span>
                  {priceDelta && priceDelta.delta !== 0 && (
                    <span
                      title={`Price movement of your current cards since ${priceDelta.asOf}`}
                      style={{ color: priceDelta.delta > 0 ? "#6fbf73" : COLORS.RED, marginLeft: 5 }}
                    >
                      {priceDelta.delta > 0 ? "▲" : "▼"} ${Math.abs(priceDelta.delta).toFixed(2)} 30d
                    </span>
                  )}
                </>
              )}
              {conflicts.conflicts?.length > 0 && (
                <>
                  {" · "}
                  <button
                    onClick={() => setConflictsOpen(true)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: COLORS.RED,
                      cursor: "pointer",
                      fontFamily: FONT,
                      fontSize: 12,
                      textDecoration: "underline dotted",
                    }}
                  >
                    {conflicts.conflicts.length} conflict{conflicts.conflicts.length === 1 ? "" : "s"}
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {cards.length > 0 && (
            <button
              onClick={() => setRoastOpen(true)}
              style={{ ...btn(), borderColor: "#c4534e", color: "#c4534e" }}
              title="Have Tibalt roast your collection"
            >
              Roast me
            </button>
          )}
          <button onClick={() => setTagsOpen(true)} style={btn()}>Color tags</button>
          <button onClick={() => setImportOpen(true)} style={btn()}>Import CSV</button>
          <button onClick={() => setAddOpen(true)} style={primaryHeaderBtn()}>+ Add card</button>
          {onClose && (
            <button onClick={onClose} style={btn()}>Close</button>
          )}
        </div>
      </header>

      {state.recoveryWarning && (
        <div style={{
          padding: "10px 20px",
          background: "#3a2820",
          color: "#f4d2a1",
          fontSize: 13,
          borderBottom: `1px solid ${COLORS.LINE}`,
        }}>
          ⚠ {state.recoveryWarning}
        </div>
      )}

      {state.status === "ready" && cards.length > 0 && (
        <CollectionFilters
          filters={filters}
          onChange={setFilters}
          colors={COLORS}
          totalCount={cards.length}
          visibleCount={filteredCards.length}
        />
      )}

      {filters.view === "wishlist" && wishlistStats.count > 0 && (
        <div style={{
          padding: "8px 20px",
          background: COLORS.BG3,
          color: COLORS.GOLD,
          fontSize: 12,
          borderBottom: `1px solid ${COLORS.LINE}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>
            {wishlistStats.count} card{wishlistStats.count === 1 ? "" : "s"} on wishlist
          </span>
          <span style={{ fontWeight: 600 }}>
            Would cost ~${wishlistStats.cost.toFixed(2)} to acquire at current prices
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <main style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {state.status === "loading" && <CenterMessage text="Loading collection..." color={COLORS.MUTED} />}
          {state.status === "error" && <CenterMessage text={`Error: ${state.error}`} color={COLORS.RED} />}
          {state.status === "ready" && cards.length === 0 && <EmptyState color={COLORS.MUTED} gold={COLORS.GOLD} />}
          {state.status === "ready" && cards.length > 0 && filteredCards.length === 0 && (
            <CenterMessage text="No cards match the current filters." color={COLORS.MUTED} />
          )}
          {state.status === "ready" && filteredCards.length > 0 && (
            <CollectionGrid
              cards={filteredCards}
              onCardClick={setSelectedRow}
              selectedScryfallId={selectedRow?.scryfallId}
              conflictedOracleIds={conflictedOracleIds}
              colors={COLORS}
            />
          )}
        </main>

        {selectedRow && (
          <CollectionCardDetail
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            onSave={handleCollectionUpdate}
            onDelete={handleCollectionDelete}
            colors={COLORS}
          />
        )}
      </div>

      {addOpen && (
        <CollectionAddModal
          onClose={() => setAddOpen(false)}
          onAdded={(updated) => setState(s => ({ ...s, collection: updated }))}
          colors={COLORS}
        />
      )}

      {importOpen && (
        <CollectionImportModal
          onClose={() => setImportOpen(false)}
          onAdded={(updated) => setState(s => ({ ...s, collection: updated }))}
          colors={COLORS}
        />
      )}

      {conflictsOpen && (
        <ConflictsModal
          conflicts={conflicts.conflicts}
          totalDecks={conflicts.totalDecks}
          onClose={() => setConflictsOpen(false)}
          colors={COLORS}
        />
      )}

      {roastOpen && (
        <CollectionRoastModal
          onClose={() => setRoastOpen(false)}
          colors={COLORS}
        />
      )}

      {tagsOpen && (
        <ColorTagManager
          tags={colorTags.tags}
          addTag={colorTags.addTag}
          updateTag={colorTags.updateTag}
          deleteTag={colorTags.deleteTag}
          onClose={() => setTagsOpen(false)}
          cfg={VAULT_CFG}
          colors={COLORS}
          fontFamily={FONT}
        />
      )}
    </div>
  );
}

function ConflictsModal({ conflicts, totalDecks, onClose, colors }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
          background: colors.BG2,
          border: `1px solid ${colors.LINE}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          color: colors.TEXT,
        }}
      >
        <header style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${colors.LINE}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500 }}>
              Cross-deck conflicts
            </div>
            <div style={{ fontSize: 11, color: colors.MUTED, marginTop: 2 }}>
              Across {totalDecks} deck{totalDecks === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: colors.MUTED, cursor: "pointer",
            fontSize: 20, width: 24, height: 24, lineHeight: 1,
          }}>×</button>
        </header>
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {conflicts.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: colors.MUTED, fontSize: 13 }}>
              No conflicts. Every deck card has enough physical copies.
            </div>
          )}
          {conflicts.map(c => (
            <div key={c.oracleId} style={{
              padding: "10px 18px",
              borderBottom: `1px solid ${colors.LINE}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: colors.TEXT, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: colors.RED }}>
                  short {c.overflow} cop{c.overflow === 1 ? "y" : "ies"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.MUTED, marginTop: 3 }}>
                Owned {c.ownedQty} · used {c.usedQty} in: {c.deckNames.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CenterMessage({ text, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color, fontSize: 14,
    }}>
      {text}
    </div>
  );
}

function EmptyState({ color, gold }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: 40, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📚</div>
      <div style={{ fontSize: 16, color: "#cec8e0", marginBottom: 8 }}>
        Your collection is empty.
      </div>
      <div style={{ fontSize: 13, color, maxWidth: 420, lineHeight: 1.5 }}>
        Add cards individually or import from Deckbox / Moxfield CSV. Once
        you've added cards, every agent (Karn, Tibalt, Jace) will know what
        you own and tailor suggestions to your actual collection.
      </div>
    </div>
  );
}

function btn() {
  return {
    background: "transparent",
    border: `1px solid ${COLORS.LINE}`,
    color: COLORS.TEXT,
    padding: "6px 14px",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
  };
}

function primaryHeaderBtn() {
  return {
    ...btn(),
    background: COLORS.GOLD,
    color: COLORS.BG,
    borderColor: COLORS.GOLD,
    fontWeight: 600,
  };
}
