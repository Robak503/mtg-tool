/**
 * /api/collection/dashboard — the Vault dashboard's single composed payload.
 *
 * One GET returns everything the V1 dashboard renders (spec:
 * memory/orders/vault-dashboard-rework-spec.md, Colton's taste answers 2026-07-18/19):
 *
 *   - uniquePrintings  — COUNT OF DISTINCT OWNED PRINTINGS (distinct scryfallId with any owned
 *                        qty). His exact tile spec: not raw quantity, not distinct names.
 *   - totalQuantity    — raw copies, shown as the tile's small subline.
 *   - vaultValue       — total owned value at current stored/enriched prices.
 *   - movers           — biggest WINNER + LOSER by % over a 7-day window, OWNED cards only.
 *                        HOLLOW-GATE LAW: when history can't support the window the payload says
 *                        `status:"insufficient-history"` with a reason — a fabricated 0-delta and
 *                        "no data" must never look alike.
 *   - grails           — the showpiece shelf (lib/showpiece.buildShelf: provenance-flagged rows
 *                        first, then top value picks ≥ $50).
 *   - valueSeries      — whole-collection value over time (collectionValueSeries).
 *   - rows             — the table: owned rows sorted by value, name/qty/unit price.
 *
 * Composition only — every number comes from an existing, tested lib function
 * (collectionPrices / showpiece / enrichCollectionPrices). No new math invented here.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { loadCollection, CollectionVersionMismatch } from "../../../../lib/server/collectionStorage.js";
import { enrichCollectionPrices } from "../../../../lib/server/priceResolution.js";
import { parseHistory, computeCardMovers, collectionValueSeries } from "../../../../lib/server/collectionPrices.js";
import { buildShelf, rowUnitValue } from "../../../../lib/showpiece.js";
import { profilePath, dataPath } from "../../../../lib/server/paths.js";

const WEEK = 7;

/** Owned quantity across a row's stacks (wishlist rows excluded by the callers). */
function ownedQty(row) {
  return (row?.stacks || []).reduce((a, s) => a + (s.quantity || 0), 0);
}

/** Read the profile's price history; fall back to the bundled seed like /api/collection/prices does. */
async function readHistoryRaw() {
  try {
    return await fs.readFile(profilePath("collection-prices.jsonl"), "utf8");
  } catch {
    try {
      return await fs.readFile(dataPath("collection-prices.seed.jsonl"), "utf8");
    } catch {
      return "";
    }
  }
}

export async function GET() {
  let collection;
  try {
    ({ collection } = await loadCollection());
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error.message || "Could not load collection." }, { status: 500 });
  }

  const enriched = enrichCollectionPrices(collection);
  const owned = (enriched.cards || []).filter((r) => !r.wishlist && ownedQty(r) > 0);

  // ── Tiles ────────────────────────────────────────────────────────────────────────────────
  const uniquePrintings = new Set(owned.map((r) => r.scryfallId)).size;
  const totalQuantity = owned.reduce((a, r) => a + ownedQty(r), 0);
  const vaultValue = owned.reduce((a, r) => a + rowUnitValue(r) * ownedQty(r), 0);

  // ── Weekly movers (honest about missing history) ─────────────────────────────────────────
  const history = parseHistory(await readHistoryRaw());
  const ownedIds = new Set(owned.map((r) => r.scryfallId).filter(Boolean));
  // History is ONE LINE PER CARD PER DAY ({snappedAt, scryfallId, usd…}) — raw line count says
  // nothing, so insufficiency is judged on DISTINCT snapshot DATES (two cards on one day ≠ a delta).
  const snapshotDates = new Set(history.map((e) => e.snappedAt).filter(Boolean));
  let movers;
  if (snapshotDates.size < 2) {
    movers = { status: "insufficient-history", reason: `price history covers ${snapshotDates.size} day${snapshotDates.size === 1 ? "" : "s"} — the weekly delta needs snapshots ~a week apart`, window: WEEK };
  } else {
    const all = computeCardMovers(history, ownedIds, new Date(), WEEK);
    if (all.length === 0) {
      // Distinguish "no data spanning the window" from "prices genuinely flat" (hollow-gate law):
      // computeCardMovers only emits rows with a valid past price inside the window.
      movers = { status: "insufficient-history", reason: "nothing measurable across the 7-day window yet — history may not span it, or prices held flat", window: WEEK };
    } else {
      const byId = new Map(owned.map((r) => [r.scryfallId, r]));
      const decorate = (m) => ({ ...m, name: byId.get(m.scryfallId)?.name ?? m.scryfallId });
      movers = {
        status: "ok",
        window: WEEK,
        winner: decorate(all[0]),
        loser: decorate(all[all.length - 1]),
      };
    }
  }

  // ── Grails shelf + value series + table rows ─────────────────────────────────────────────
  const grails = buildShelf(owned).slice(0, 5).map(({ row, value, flagged }) => ({
    scryfallId: row.scryfallId, name: row.name, value, flagged,
  }));

  const valueSeries = collectionValueSeries(enriched, history, { maxPoints: 90 });

  const rows = owned
    .map((r) => ({ scryfallId: r.scryfallId, name: r.name, qty: ownedQty(r), unit: rowUnitValue(r) }))
    .sort((a, b) => b.unit * b.qty - a.unit * a.qty);

  return Response.json({
    uniquePrintings,
    totalQuantity,
    vaultValue: Math.round(vaultValue * 100) / 100,
    movers,
    grails,
    valueSeries,
    rows,
  });
}
