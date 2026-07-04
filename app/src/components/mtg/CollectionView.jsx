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
import VaultBinder from "./VaultBinder";
import CollectionFilters, { applyFilters } from "./CollectionFilters";
import CollectionCardDetail from "./CollectionCardDetail";
import CollectionAddModal from "./CollectionAddModal";
import CollectionImportModal from "./CollectionImportModal";
import CollectionRoastModal from "./CollectionRoastModal";
import CollectionDecksModal from "./CollectionDecksModal";
import ColorTagManager from "./ColorTagManager";
import VaultFinanceView from "./VaultFinanceView";
import VaultStatsView from "./VaultStatsView";
import VaultSetBrowserView from "./VaultSetBrowserView";
import VaultBuildView from "./VaultBuildView";
import useColorTags from "../../hooks/useColorTags";
import useEscapeClose from "../../hooks/useEscapeClose";

// LEYLINE — token-backed shape consumed by every Collection/Vault child
// component via the `colors` prop. GOLD is a legacy field name (kept so the
// ~14 files sharing this shape don't all need a rename in one pass) but its
// value is the LEYLINE accent green, not gold.
const COLORS = {
  BG: "var(--ley-bg)",
  BG2: "var(--ley-surface-1)",
  BG3: "var(--ley-surface-2)",
  LINE: "var(--ley-line)",
  TEXT: "var(--ley-text)",
  MUTED: "var(--ley-text-dim)",
  GOLD: "var(--ley-green)",
  RED: "var(--ley-red)",
};

const FONT = `var(--font-body), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// The Vault leads with the LEYLINE green accent; reuse the shared cfg shape.
const VAULT_CFG = {
  color: COLORS.GOLD,
  border: "var(--ley-line-bright)",
  dim: "var(--ley-green-dim)",
  glow: "var(--ley-green-glow)",
};

const DEFAULT_FILTERS = {
  search: "",
  view: "owned",
  finish: "any",
};

const SURFACE_MODE = { collection: "collection", ledger: "ledger", sets: "sets", build: "build" };
const SURFACE_LABEL = { collection: "The Stacks", ledger: "The Ledger", sets: "The Atlas", build: "The Forge" };

export default function CollectionView({ surface = "collection", onNavigate, onClose, onBuildCommander }) {
  const [state, setState] = useState({
    status: "loading",
    collection: null,
    error: null,
    recoveryWarning: null,
  });
  const [selectedRow, setSelectedRow] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState("");
  const [decksOpen, setDecksOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState({ conflicts: [], totalDecks: 0 });
  const [roastOpen, setRoastOpen] = useState(false);
  // 30-day value delta from price-history (null until a snapshot ≥30d old exists)
  const [priceDelta, setPriceDelta] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  // Which internal surface renders. Fixed per centerView since the kiosk IA
  // (VaultHome door-panes) replaced the old 5-tab strip.
  const mode = SURFACE_MODE[surface] || "collection";
  const [gridMode, setGridMode] = useState("grid"); // "grid" | "binder" (V8)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const colorTags = useColorTags();

  // Re-pull live Scryfall prices for cards whose stored TCGPlayer price is
  // null (the Card Kingdom fallback already covers most; this catches a
  // market price that got computed since our snapshot). User-triggered.
  const handleRefreshPrices = async () => {
    setRefreshing(true);
    setRefreshMsg("Checking prices…");
    try {
      const resp = await fetch("/api/collection/refresh-prices", { method: "POST" });
      const body = await resp.json();
      if (!resp.ok) {
        setRefreshMsg(body.error || "Price refresh failed");
      } else if (body.needed === 0) {
        setRefreshMsg("Every card already has a price.");
      } else {
        const stillNull = body.stillNull ? `, ${body.stillNull} still unpriced` : "";
        setRefreshMsg(`Updated ${body.refreshed} price${body.refreshed === 1 ? "" : "s"}${stillNull}.`);
        // Reflect the fresh prices in the grid + value.
        const r = await fetch("/api/collection");
        const b = await r.json();
        if (r.ok) setState(s => ({ ...s, collection: b.collection }));
      }
    } catch (error) {
      setRefreshMsg(error.message || "Price refresh failed");
    } finally {
      setRefreshing(false);
      window.setTimeout(() => setRefreshMsg(""), 6000);
    }
  };

  // Download the collection as a Deckbox-style CSV (round-trips back through
  // Import CSV, Deckbox, and Moxfield). Reuses the app's Blob-download pattern.
  const exportCollection = async () => {
    try {
      const resp = await fetch("/api/collection/export?format=csv");
      if (!resp.ok) return;
      const text = await resp.text();
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `mtg-collection-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* export is best-effort */
    }
  };

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

  const cards = useMemo(() => state.collection?.cards || [], [state.collection]);
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
  // Build the PATCH body for assigning a color tag to one row, including the
  // behavior-driven side effects (collection → owned + seed a copy; wishlist/
  // consider → flag wishlist). Shared by single-card assign and bulk assign.
  const buildTagPatch = (row, tagId) => {
    const colorTagId = tagId && tagId !== "default" ? tagId : null;
    const behavior = colorTagId ? (tagMap[colorTagId]?.behavior || "marker") : "marker";
    const patch = { colorTagId };
    if (row) {
      if (behavior === "collection") {
        patch.wishlist = false;
        if (stackTotal(row.stacks) === 0) {
          const finish = row.stacks?.[0]?.finish || "nonfoil";
          patch.stacks = [{ finish, quantity: 1, condition: "NM" }];
        }
      } else if (behavior === "wishlist" || behavior === "consider") {
        patch.wishlist = true;
      }
    }
    return patch;
  };

  const assignTag = async (scryfallId, tagId) => {
    const row = collectionRef.current?.cards.find(c => c.scryfallId === scryfallId);
    const patch = buildTagPatch(row, tagId);

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

  // ── bulk edit (#12) ──
  const toggleSelect = (scryfallId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(scryfallId)) next.delete(scryfallId); else next.add(scryfallId);
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectAllVisible = () => setSelectedIds(new Set(filteredCards.map(c => c.scryfallId)));

  // Apply one op to every selected row by looping the existing single-card
  // endpoints, then reconcile once from server truth. Looping reuses the tested
  // PATCH/DELETE (and their behavior side effects) rather than duplicating that
  // logic in a new batch route — fine for a local single-user collection.
  const bulkAssignTag = async (tagId) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      for (const scryfallId of ids) {
        const row = collectionRef.current?.cards.find(c => c.scryfallId === scryfallId);
        const patch = buildTagPatch(row, tagId);
        try {
          await fetch(`/api/collection/${encodeURIComponent(scryfallId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
        } catch { /* best-effort per card; reconcile reflects what stuck */ }
      }
      await reconcileCollection();
    } finally {
      setBulkBusy(false);
      exitSelectMode();
    }
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} card${ids.length === 1 ? "" : "s"} from your collection? This can't be undone.`)) return;
    setBulkBusy(true);
    try {
      for (const scryfallId of ids) {
        try {
          await fetch(`/api/collection/${encodeURIComponent(scryfallId)}`, { method: "DELETE" });
        } catch { /* best-effort; reconcile reflects what stuck */ }
      }
      await reconcileCollection();
    } finally {
      setBulkBusy(false);
      exitSelectMode();
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
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 20px",
        borderBottom: `1px solid ${COLORS.LINE}`,
        background: COLORS.BG2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
          {onNavigate && (
            <button onClick={() => onNavigate("vault-home")} className="btn btn-ghost btn-sm" title="Back to the Vault">
              ← Vault
            </button>
          )}
          <h1 style={{
            margin: 0,
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.GOLD,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}>
            The Vault
          </h1>
          <span style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ley-green)",
            padding: "4px 10px",
            border: "1px solid var(--ley-line-bright)",
            borderRadius: 999,
            background: "var(--ley-green-dim)",
            whiteSpace: "nowrap",
          }}>
            {SURFACE_LABEL[surface] || "The Stacks"}
          </span>
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
                      style={{ color: priceDelta.delta > 0 ? "var(--ley-green)" : COLORS.RED, marginLeft: 5 }}
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
                    className="btn btn-ghost btn-sm"
                    style={{
                      padding: 0,
                      color: COLORS.RED,
                      textDecoration: "underline dotted",
                    }}
                  >
                    {conflicts.conflicts.length} conflict{conflicts.conflicts.length === 1 ? "" : "s"}
                  </button>
                </>
              )}
              {refreshMsg && (
                <>{" · "}<span style={{ color: COLORS.GOLD }}>{refreshMsg}</span></>
              )}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {mode === "collection" && (<>
          {cards.length > 0 && (
            <button
              onClick={() => setRoastOpen(true)}
              className="btn btn-danger btn-sm"
              title="Have Tibalt roast your collection"
            >
              Roast me
            </button>
          )}
          {cards.length > 0 && (
            <button onClick={() => setGridMode((m) => (m === "grid" ? "binder" : "grid"))} className="btn btn-secondary btn-sm" title="Toggle grid / 9-pocket binder view">
              {gridMode === "grid" ? "Binder" : "Grid"}
            </button>
          )}
          <button onClick={() => setTagsOpen(true)} className="btn btn-secondary btn-sm">Color tags</button>
          {cards.length > 0 && (
            <button
              onClick={() => { if (selectMode) { exitSelectMode(); } else { setSelectedRow(null); setSelectMode(true); } }}
              className={selectMode ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              title="Select multiple cards to tag or remove at once"
            >
              {selectMode ? "Done" : "Select"}
            </button>
          )}
          <button onClick={() => setImportOpen(true)} className="btn btn-secondary btn-sm">Import CSV</button>
          <button onClick={exportCollection} className="btn btn-secondary btn-sm">Export CSV</button>
          <button onClick={() => { setAddPrefill(""); setAddOpen(true); }} className="btn btn-primary btn-sm">+ Add card</button>
          </>)}
          {mode === "ledger" && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="btn btn-secondary btn-sm"
              title="Re-pull live prices for cards TCGPlayer can't price"
            >
              {refreshing ? "Refreshing…" : "↻ Prices"}
            </button>
          )}
          {mode === "build" && (
            <button onClick={() => setDecksOpen(true)} className="btn btn-secondary btn-sm" title="What each deck still needs, priced">
              Deck costs
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
          )}
        </div>
      </header>

      {state.recoveryWarning && (
        <div style={{
          padding: "10px 20px",
          background: "var(--ley-gold-dim)",
          color: "var(--ley-gold)",
          fontSize: 13,
          borderBottom: `1px solid ${COLORS.LINE}`,
        }}>
          ⚠ {state.recoveryWarning}
        </div>
      )}

      {mode === "ledger" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Finance + Stats merged into one scrolling dashboard. The plain
              wrapper divs neutralize each child's own flex/overflow root so
              the Ledger scrolls as a single page. */}
          <div><VaultFinanceView colors={COLORS} fontFamily={FONT} /></div>
          <div><VaultStatsView colors={COLORS} fontFamily={FONT} onGoToCollection={() => onNavigate?.("collection")} /></div>
        </div>
      )}

      {mode === "sets" && (
        <VaultSetBrowserView colors={COLORS} fontFamily={FONT} />
      )}

      {mode === "build" && (
        <VaultBuildView colors={COLORS} fontFamily={FONT} onBuildCommander={onBuildCommander} onGoToCollection={() => onNavigate?.("collection")} />
      )}

      {mode === "collection" && (<>
      {state.status === "ready" && (
        <TrophyStrip cards={cards} onPick={setSelectedRow} colors={COLORS} />
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

      {selectMode && (
        <BulkActionBar
          count={selectedIds.size}
          tags={colorTags.tags}
          busy={bulkBusy}
          onAssignTag={bulkAssignTag}
          onDelete={bulkDelete}
          onSelectAll={selectAllVisible}
          onClear={() => setSelectedIds(new Set())}
          onExit={exitSelectMode}
          visibleCount={filteredCards.length}
          colors={COLORS}
          font={FONT}
        />
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <main style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {state.status === "loading" && <CenterMessage text="Loading collection..." color={COLORS.MUTED} />}
          {state.status === "error" && <CenterMessage text={`Error: ${state.error}`} color={COLORS.RED} />}
          {state.status === "ready" && cards.length === 0 && (
            <EmptyState color={COLORS.MUTED} onAddCard={() => { setAddPrefill(""); setAddOpen(true); }} />
          )}
          {state.status === "ready" && cards.length > 0 && filteredCards.length === 0 && (
            <CenterMessage text="No cards match the current filters." color={COLORS.MUTED} />
          )}
          {state.status === "ready" && filteredCards.length > 0 && gridMode === "binder" && !selectMode && (
            <VaultBinder cards={filteredCards} onCardClick={setSelectedRow} tagMap={tagMap} />
          )}
          {state.status === "ready" && filteredCards.length > 0 && (gridMode === "grid" || selectMode) && (
            <CollectionGrid
              cards={filteredCards}
              onCardClick={setSelectedRow}
              onQuickAdjust={adjustRowQuantity}
              selectedScryfallId={selectedRow?.scryfallId}
              conflictedOracleIds={conflictedOracleIds}
              tagMap={tagMap}
              colors={COLORS}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
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
      </>)}

      {addOpen && (
        <CollectionAddModal
          onClose={() => { setAddOpen(false); setAddPrefill(""); }}
          onAdded={(updated) => setState(s => ({ ...s, collection: updated }))}
          initialQuery={addPrefill}
          colors={COLORS}
        />
      )}

      {decksOpen && (
        <CollectionDecksModal
          onClose={() => setDecksOpen(false)}
          onAddCard={(name) => { setDecksOpen(false); setAddPrefill(name); setAddOpen(true); }}
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
  useEscapeClose(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: 560,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
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
            <div style={{ fontSize: 14, color: colors.TEXT, fontWeight: 500, fontFamily: "var(--font-display)" }}>
              Cross-deck conflicts
            </div>
            <div style={{ fontSize: 11, color: colors.MUTED, marginTop: 2 }}>
              Across {totalDecks} deck{totalDecks === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">×</button>
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

function EmptyState({ color, onAddCard }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: 40, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📚</div>
      <div style={{ fontSize: 16, color: "var(--ley-text)", marginBottom: 8, fontFamily: "var(--font-display)" }}>
        Your collection is empty.
      </div>
      <div style={{ fontSize: 13, color, maxWidth: 420, lineHeight: 1.5, marginBottom: 20 }}>
        Add cards individually or import from Deckbox / Moxfield CSV. Once
        you've added cards, every agent (Karn, Tibalt, Jace) will know what
        you own and tailor suggestions to your actual collection.
      </div>
      {onAddCard && (
        <button onClick={onAddCard} className="btn btn-primary">+ Add your first card</button>
      )}
    </div>
  );
}

function BulkActionBar({ count, tags, busy, onAssignTag, onDelete, onSelectAll, onClear, onExit, visibleCount, colors, font }) {
  const has = count > 0;
  const selectStyle = {
    background: "transparent", border: `1px solid ${colors.LINE}`, color: colors.TEXT,
    padding: "5px 12px", borderRadius: 4, fontSize: 12, cursor: has ? "pointer" : "default", fontFamily: font,
    opacity: has ? 1 : 0.5,
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "8px 20px", background: colors.BG3,
      borderBottom: `1px solid ${colors.LINE}`,
    }}>
      <span style={{ fontSize: 13, color: has ? colors.GOLD : colors.MUTED, fontWeight: 600, minWidth: 90 }}>
        {has ? `${count} selected` : "Select cards…"}
      </span>
      <button onClick={onSelectAll} disabled={busy} className="btn btn-secondary btn-sm" title="Select all cards matching the current filters">
        Select all {visibleCount}
      </button>
      <button onClick={onClear} disabled={busy || !has} className="btn btn-ghost btn-sm">Clear</button>

      <div style={{ flex: 1 }} />

      <select
        defaultValue=""
        disabled={busy || !has}
        onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) onAssignTag(v === "__none" ? null : v); }}
        style={selectStyle}
        title="Assign a color tag to the selected cards"
      >
        <option value="" disabled>Assign tag ▾</option>
        {tags.filter(t => t.id !== "default" && !t.builtin).map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
        <option value="__none">— Clear tag —</option>
      </select>

      <button
        onClick={onDelete}
        disabled={busy || !has}
        className="btn btn-danger btn-sm"
        style={{ marginLeft: 4 }}
      >
        {busy ? "Working…" : `Delete${has ? ` (${count})` : ""}`}
      </button>
      <button onClick={onExit} disabled={busy} className="btn btn-primary btn-sm" style={{ marginLeft: 10 }}>
        Done
      </button>
    </div>
  );
}

// The Trophy Case (V6) — showcase-pinned rows as a hero strip at the top of
// The Stacks: art tile, name, and the provenance caption. Hidden until the
// user pins something (the ★ Showcase toggle in the card drawer).
function TrophyStrip({ cards, onPick, colors }) {
  const trophies = cards.filter((c) => c.showcase === true);
  if (trophies.length === 0) return null;
  const caption = (r) => {
    const bits = [];
    if (r.signed) {
      bits.push(`Signed${r.signed.artist ? ` — ${r.signed.artist}` : ""}${r.signed.inPerson ? " (in person)" : ""}`);
      if (r.signed.event) bits.push(r.signed.event);
      if (r.signed.date) bits.push(r.signed.date);
    }
    if (r.artistProof) bits.push("Artist proof");
    if (r.altered) bits.push("Altered");
    return bits.join(" · ") || "Showcase";
  };
  return (
    <div style={{ padding: "12px 20px 4px", borderBottom: `1px solid ${colors.LINE}` }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ley-green)", marginBottom: 8 }}>
        ★ Trophy Case
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 10 }}>
        {trophies.map((r) => (
          <button
            key={r.scryfallId}
            onClick={() => onPick(r)}
            className="ley-card"
            style={{
              flexShrink: 0,
              width: 190,
              textAlign: "left",
              cursor: "pointer",
              background: "var(--ley-glass)",
              border: "1px solid var(--ley-line-bright)",
              borderRadius: "var(--r-lg)",
              padding: 8,
              color: colors.TEXT,
            }}
            title={`${r.name} — ${caption(r)}`}
          >
            <img
              src={`/api/art-crop?id=${encodeURIComponent(r.scryfallId)}`}
              alt=""
              width={174}
              height={96}
              loading="lazy"
              style={{ objectFit: "cover", borderRadius: 6, display: "block", border: `1px solid ${colors.LINE}` }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
            <div style={{ fontSize: 10, color: "var(--ley-text-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption(r)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
