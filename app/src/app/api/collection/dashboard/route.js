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
 *   - grails           — the DAILY grail case (lib/showpiece.buildDailyShelf): ONE hero — the
 *                        big-dollar chase, role:"hero", rendered large — plus up to 4 supporting
 *                        picks favoring provenance (signed/alt) over price, role:"supporting".
 *                        Both rotate daily (deterministic on the UTC day). Hero first in the array.
 *   - valueSeries      — whole-collection value over time (collectionValueSeries).
 *   - rows             — the ledger: ONE LINE PER OWNED FINISH (Colton, 2026-07-19: full
 *                        provenance per line — a printing held in normal AND foil is two
 *                        lines, each priced at ITS finish). Fields: name, set (uppercase
 *                        code), setName (best-effort from the printings index, null when
 *                        absent), collectorNumber, finish, qty, unit. Sorted by line value.
 *
 * Composition only — every number comes from an existing, tested lib function
 * (collectionPrices / showpiece / enrichCollectionPrices). No new math invented here.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { loadCollection, CollectionVersionMismatch } from "../../../../lib/server/collectionStorage.js";
import { enrichCollectionPrices } from "../../../../lib/server/priceResolution.js";
import { parseHistory, computeCardMovers, collectionValueSeries } from "../../../../lib/server/collectionPrices.js";
import { buildDailyShelf, rowUnitValue, finishUnitValue } from "../../../../lib/showpiece.js";
import { finishDisplayLabel } from "../../../../lib/foilTreatments.js";
import { lookupById } from "../../../../lib/server/printingIndex.js";
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

  // ── Grail case (daily hero + supporting) + value series + table rows ─────────────────────
  const shelf = buildDailyShelf(owned);
  const grailEntry = (e, role) => ({ scryfallId: e.row.scryfallId, name: e.row.name, value: e.value, flagged: e.flagged, role });
  const grails = shelf.hero
    ? [grailEntry(shelf.hero, "hero"), ...shelf.supporting.map((e) => grailEntry(e, "supporting"))]
    : [];

  const valueSeries = collectionValueSeries(enriched, history, { maxPoints: 90 });

  // Best-effort printing lookup for display extras (full set name, special foil type);
  // the index is absent in a fresh dev tree, so degrade to null/plain — never guessed.
  const printingOf = (r) => {
    if (!r.scryfallId) return null;
    try { return lookupById(r.scryfallId) || null; } catch { return null; }
  };

  const rows = owned
    .flatMap((r) => {
      const printing = printingOf(r);
      return (r.stacks || [])
        .filter((s) => (s.quantity || 0) > 0)
        .map((s) => ({
          scryfallId: r.scryfallId,
          name: r.name,
          set: r.setCode ? String(r.setCode).toUpperCase() : null,
          setName: printing?.setName || null,
          collectorNumber: r.collectorNumber || null,
          finish: s.finish || "nonfoil",
          // "Halo Foil" / "Surge Foil" / … off the printing's foilTypes; plain "Foil" without them.
          finishLabel: finishDisplayLabel(s.finish || "nonfoil", printing?.foilTypes),
          qty: s.quantity,
          unit: finishUnitValue(r, s.finish),
        }));
    })
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
