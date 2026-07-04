"use client";

/**
 * CollectionFilters — top drawer with search + view + finish filters.
 *
 * v1 filters:
 *   - search (case-insensitive substring on card name)
 *   - view: "owned" | "wishlist" | "all"
 *   - finish: "any" | "nonfoil" | "foil" | "etched"
 *
 * Color identity filter is deferred until the printings-index includes
 * color_identity (currently oracle-level data not bundled in the slim
 * per-printing index). Type/CMC/rarity follow in v1.1.
 */

const VIEW_OPTIONS = [
  { value: "owned",    label: "Owned" },
  { value: "wishlist", label: "Wishlist" },
  { value: "all",      label: "All" },
];

const FINISH_OPTIONS = [
  { value: "any",     label: "Any finish" },
  { value: "nonfoil", label: "Nonfoil" },
  { value: "foil",    label: "Foil" },
  { value: "etched",  label: "Etched" },
];

export default function CollectionFilters({ filters, onChange, colors, totalCount, visibleCount }) {
  const update = (patch) => onChange({ ...filters, ...patch });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 20px",
      borderBottom: `1px solid ${colors.LINE}`,
      background: colors.BG2,
      flexWrap: "wrap",
    }}>
      <input
        type="search"
        placeholder="Search collection..."
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
        style={{
          background: colors.BG,
          border: `1px solid ${colors.LINE}`,
          color: colors.TEXT,
          padding: "6px 10px",
          borderRadius: 4,
          fontSize: 13,
          fontFamily: "inherit",
          flex: "1 1 240px",
          maxWidth: 360,
        }}
      />

      <SegmentedControl
        options={VIEW_OPTIONS}
        value={filters.view}
        onChange={(value) => update({ view: value })}
        colors={colors}
      />

      <select
        value={filters.finish}
        onChange={(e) => update({ finish: e.target.value })}
        style={{
          background: colors.BG,
          border: `1px solid ${colors.LINE}`,
          color: colors.TEXT,
          padding: "6px 10px",
          borderRadius: 4,
          fontSize: 13,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {FINISH_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <div style={{
        marginLeft: "auto",
        fontSize: 12,
        color: colors.MUTED,
        whiteSpace: "nowrap",
      }}>
        Showing {visibleCount} of {totalCount}
      </div>
    </div>
  );
}

function SegmentedControl({ options, value, onChange, colors }) {
  return (
    <div style={{
      display: "inline-flex",
      border: `1px solid ${colors.LINE}`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? "var(--ley-green-dim)" : "transparent",
            color: value === opt.value ? "var(--ley-green)" : colors.TEXT,
            border: "none",
            borderLeft: i > 0 ? `1px solid ${colors.LINE}` : "none",
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: value === opt.value ? 700 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pure helper — applies the filters to a collection's cards array.
 * Exported so CollectionView can compute visibleCount and pass the
 * filtered array straight to the grid.
 */
export function applyFilters(cards, filters) {
  const search = filters.search?.trim().toLowerCase() || "";

  return cards.filter(row => {
    // View filter
    const isWishlist = !!row.wishlist;
    if (filters.view === "owned" && isWishlist) return false;
    if (filters.view === "wishlist" && !isWishlist) return false;

    // Search filter
    if (search && !(row.name || "").toLowerCase().includes(search)) return false;

    // Finish filter — row must have at least one stack of the chosen finish
    // with quantity > 0 (or quantity 0 for wishlist rows where the stack
    // indicates the wanted finish).
    if (filters.finish !== "any") {
      const stacks = row.stacks || [];
      const hasFinish = stacks.some(s => {
        if (s.finish !== filters.finish) return false;
        return isWishlist ? true : (s.quantity || 0) > 0;
      });
      if (!hasFinish) return false;
    }

    return true;
  });
}
