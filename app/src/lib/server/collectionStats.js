/**
 * collectionStats.js — composition breakdowns for the collection stats
 * dashboard (Vault #10): by type, rarity, color, mana curve, top sets, and
 * most-valuable cards.
 *
 * Pure: the route resolves each row's oracle metadata (type line, cmc, colors,
 * rarity) via the local card index and injects it through `getMeta(row)`, so
 * this module has no I/O and is fully unit-testable. Counts are over owned,
 * non-wishlist rows (one per distinct printing) — a "library composition" view,
 * not a physical-copy count, so a playset of basics doesn't swamp the picture.
 *
 * Value figures use each row's stored prices (the same source the Overview
 * value uses), summing price × quantity across the row's finishes.
 */

const WUBRG = ["W", "U", "B", "R", "G"];

/** The card's headline type for bucketing (front face; creature beats artifact, etc.). */
export function primaryType(typeLine) {
  if (!typeLine) return "Other";
  const t = String(typeLine).split("//")[0].toLowerCase();
  if (t.includes("land")) return "Land";
  if (t.includes("creature")) return "Creature";
  if (t.includes("planeswalker")) return "Planeswalker";
  if (t.includes("battle")) return "Battle";
  if (t.includes("instant")) return "Instant";
  if (t.includes("sorcery")) return "Sorcery";
  if (t.includes("enchantment")) return "Enchantment";
  if (t.includes("artifact")) return "Artifact";
  return "Other";
}

/** Color bucket from a card's color array: mono → that color, 0 → Colorless, 2+ → Multicolor. */
export function colorBucket(colors) {
  const c = Array.isArray(colors) ? colors.filter((x) => WUBRG.includes(x)) : [];
  if (c.length === 0) return "Colorless";
  if (c.length >= 2) return "Multicolor";
  return c[0];
}

function rowQuantity(row) {
  return (row.stacks || []).reduce((sum, s) => sum + (s.quantity > 0 ? s.quantity : 0), 0);
}

function rowValueUsd(row) {
  let total = 0;
  for (const stack of row.stacks || []) {
    const qty = stack.quantity || 0;
    if (qty <= 0) continue;
    const key = stack.finish === "foil" ? "usdFoil" : stack.finish === "etched" ? "usdEtched" : "usd";
    const price = parseFloat(row.prices?.[key] || 0);
    if (Number.isFinite(price)) total += price * qty;
  }
  return Math.round(total * 100) / 100;
}

/**
 * @param getMeta (row) => { typeLine, cmc, colors, rarity } | null
 * @returns { byType, byRarity, byColor, manaCurve, topSets, mostValuable,
 *            ownedRows, pricedRows }
 */
export function computeCollectionBreakdowns(collection, getMeta, { topSets = 8, topValuable = 10 } = {}) {
  const byType = {};
  const byRarity = {};
  const byColor = { W: 0, U: 0, B: 0, R: 0, G: 0, Colorless: 0, Multicolor: 0 };
  const manaCurve = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0 };
  const setCounts = new Map();
  const setNames = new Map();
  const valuable = [];
  let ownedRows = 0;
  let pricedRows = 0;

  for (const row of collection?.cards || []) {
    if (row.wishlist) continue;
    if (rowQuantity(row) <= 0) continue;
    ownedRows += 1;

    const meta = getMeta ? getMeta(row) : null;

    const type = primaryType(meta?.typeLine);
    byType[type] = (byType[type] || 0) + 1;

    const rarity = (meta?.rarity || "unknown").toLowerCase();
    byRarity[rarity] = (byRarity[rarity] || 0) + 1;

    byColor[colorBucket(meta?.colors)] += 1;

    if (type !== "Land" && Number.isFinite(meta?.cmc)) {
      const bucket = meta.cmc >= 7 ? "7+" : String(Math.floor(meta.cmc));
      if (bucket in manaCurve) manaCurve[bucket] += 1;
    }

    if (row.setCode) {
      const code = String(row.setCode).toLowerCase();
      setCounts.set(code, (setCounts.get(code) || 0) + 1);
      if (meta?.setName && !setNames.has(code)) setNames.set(code, meta.setName);
    }

    const lineValue = rowValueUsd(row);
    if (lineValue > 0) {
      pricedRows += 1;
      valuable.push({
        scryfallId: row.scryfallId || null,
        name: row.name || "Unknown card",
        setCode: row.setCode || null,
        collectorNumber: row.collectorNumber || null,
        quantity: rowQuantity(row),
        unitUsd: parseFloat(row.prices?.usd) || null,
        lineValue,
      });
    }
  }

  const topSetList = [...setCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topSets)
    .map(([code, count]) => ({ setCode: code.toUpperCase(), setName: setNames.get(code) || null, count }));

  const mostValuable = valuable
    .sort((a, b) => b.lineValue - a.lineValue || a.name.localeCompare(b.name))
    .slice(0, topValuable);

  return { byType, byRarity, byColor, manaCurve, topSets: topSetList, mostValuable, ownedRows, pricedRows, setCount: setCounts.size };
}
