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

import { useEffect, useMemo, useRef, useState } from "react";

import { adjustStacks, stackTotal } from "../../lib/collectionStacks";
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
  GOLD: "#a06639",
  RED: "#a44c45",
};

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// The Vault is gold-themed (not agent-themed); reuse the shared modal/cfg shape.
const VAULT_CFG = {
  color: COLORS.GOLD,
  border: "rgba(160,102,57,0.40)",
  dim: "rgba(160,102,57,0.12)",
  glow: "rgba(160,102,57,0.22)",
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

  // Refresh helpers used by the detail drawer after save/delete. Each keeps
  // collectionRef in sync synchronously (not just via the effect below) so the
  // grid stepper's next click always computes from the latest collection,
  // whatever mutated it last.
  const handleCollectionUpdate = (updated) => {
    collectionRef.current = updated;
    setState(s => ({ ...s, collection: updated }));
    // If the selected row was updated, refresh the selection from the new data
    if (selectedRow) {
      const fresh = updated.cards.find(c => c.scryfallId === selectedRow.scryfallId);
      setSelectedRow(fresh || null);
    }
  };
  const handleCollectionDelete = (updated) => {
    collectionRef.current = updated;
    setState(s => ({ ...s, collection: updated }));
    setSelectedRow(null);
  };

  // Resolve a row's colorTagId → tag definition (name/color) for the grid stripe
  // and the drawer picker. Tags live in localStorage (useColorTags); the row only
  // stores the id. Rebuilt when the tag set changes (create / recolor / delete).
  const tagMap = useMemo(() => {
    const map = {};
    for (const tag of colorTags.tags) map[tag.id] = tag;
    return map;
  }, [colorTags.tags]);

  // Assign (or clear, when tagId is null/"default") a color tag on a row, and
  // reflect the tag's BEHAVIOR onto the row's ownership state. The server only
  // stores colorTagId — behaviors live client-side (useColorTags) — so the
  // ownership change is computed here and sent in the same PATCH.
  //   collection (Have)      → owned (wishlist=false; seed a copy if none)
  //   wishlist  (Getting)    → wishlist=true  (excluded from owned value)
  //   consider  (Considering)→ wishlist=true  (excluded from owned value)
  //   swap / marker          → tag only, ownership untouched
  const assignTag = async (scryfallId, tagId) => {
    const colorTagId = tagId && tagId !== "default" ? tagId : null;
    const behavior = colorTagId ? (tagMap[colorTagId]?.behavior || "marker") : "marker";
    const row = collectionRef.current?.cards.find(c => c.scryfallId === scryfallId);

    const patch = { colorTagId };
    if (row) {
      if (behavior === "collection") {
        patch.wishlist = false;
        if (stackTotal(row.stacks) === 0) {
          // Seed one copy, preserving the finish the row already tracked (e.g.
          // a wishlist row that wanted foil) instead of forcing nonfoil.
          const finish = row.stacks?.[0]?.finish || "nonfoil";
          patch.stacks = [{ finish, quantity: 1, condition: "NM" }];
        }
      } else if (behavior === "wishlist" || behavior === "consider") {
        patch.wishlist = true;
      }
    }

    try {
      const resp = await fetch(`/api/collection/${encodeURIComponent(scryfallId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.ok && body.collection) handleCollectionUpdate(body.collection);
    } catch {
      // Best-effort; a failed tag assignment leaves the prior tag in place.
    }
  };

  // Always-current snapshot for the grid quick-stepper. The handler closes over
  // a single render's `state`, so consecutive +/- clicks would each compute from
  // the same stale snapshot and lose updates; reading the ref makes click N see
  // the optimistic result of click N-1.
  const collectionRef = useRef(state.collection);
  useEffect(() => { collectionRef.current = state.collection; }, [state.collection]);
  // Per-row request sequence so an out-of-order server response can't clobber a
  // newer optimistic value (rapid clicks fire overlapping PATCH/DELETEs).
  const adjustSeqRef = useRef(new Map());

  // Pull server truth back into view. Used when an optimistic stepper write
  // fails (5xx / 409 / offline) — without this a failed delete-at-zero would
  // leave the row hidden until a full reload.
  const reconcileCollection = async () => {
    try {
      const resp = await fetch("/api/collection");
      if (!resp.ok) return;
      const body = await resp.json();
      if (body.collection) {
        collectionRef.current = body.collection;
        setState(s => ({ ...s, collection: body.collection }));
      }
    } catch {
      // Offline: nothing to reconcile against, optimistic state stands.
    }
  };

  // Grid quick +/- — bump a row's owned count by one. Optimistic, with the
  // server response only applied when it's the latest request for that row.
  // A decrement past the last copy deletes the row (delete-at-zero).
  const adjustRowQuantity = async (scryfallId, delta) => {
    const coll = collectionRef.current;
    if (!coll) return;
    const row = coll.cards.find(c => c.scryfallId === scryfallId);
    if (!row) return;

    const nextStacks = adjustStacks(row.stacks, delta);
    const willDelete = nextStacks.length === 0;

    // Optimistic local apply (drives the badge + the next click's math).
    const optimistic = {
      ...coll,
      cards: willDelete
        ? coll.cards.filter(c => c.scryfallId !== scryfallId)
        : coll.cards.map(c => c.scryfallId === scryfallId
            ? { ...c, stacks: nextStacks, wishlist: false }
            : c),
    };
    collectionRef.current = optimistic;
    setState(s => ({ ...s, collection: optimistic }));
    setSelectedRow(prev => {
      if (prev?.scryfallId !== scryfallId) return prev;
      return willDelete ? null : { ...prev, stacks: nextStacks, wishlist: false };
    });

    const seq = (adjustSeqRef.current.get(scryfallId) || 0) + 1;
    adjustSeqRef.current.set(scryfallId, seq);

    try {
      const resp = willDelete
        ? await fetch(`/api/collection/${encodeURIComponent(scryfallId)}`, { method: "DELETE" })
        : await fetch(`/api/collection/${encodeURIComponent(scryfallId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stacks: nextStacks }),
          });
      const body = await resp.json().catch(() => ({}));
      // Only act if no newer click has superseded this one.
      if (adjustSeqRef.current.get(scryfallId) !== seq) return;
      if (resp.ok && body.collection) {
        collectionRef.current = body.collection;
        setState(s => ({ ...s, collection: body.collection }));
        setSelectedRow(prev => {
          if (prev?.scryfallId !== scryfallId) return prev;
          return body.collection.cards.find(c => c.scryfallId === scryfallId) || null;
        });
      } else if (!resp.ok) {
        // The optimistic apply (including an optimistic delete) didn't persist —
        // pull server truth back so the row can't silently vanish until reload.
        await reconcileCollection();
      }
    } catch {
      // Network error mid-flight: reconcile if this is still the latest click.
      if (adjustSeqRef.current.get(scryfallId) === seq) await reconcileCollection();
    }
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
              onQuickAdjust={adjustRowQuantity}
              selectedScryfallId={selectedRow?.scryfallId}
              conflictedOracleIds={conflictedOracleIds}
              tagMap={tagMap}
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
            tags={colorTags.tags}
            onAssignTag={assignTag}
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
    color: "#fff",
    borderColor: COLORS.GOLD,
    fontWeight: 600,
  };
}
