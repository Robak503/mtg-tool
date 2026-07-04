"use client";

/**
 * VaultStatsView — the Vault's collection stats dashboard (#10).
 *
 * Reads /api/collection/stats and renders composition breakdowns (type, color,
 * rarity), a mana curve, top sets, and the most-valuable cards. All local —
 * type/color/rarity come from the bundled card index, value from stored prices.
 */

import { useEffect, useState } from "react";

import Sparkline from "./Sparkline";

const COLOR_META = {
  W: { label: "White", swatch: "#e9e4cf" },
  U: { label: "Blue", swatch: "#3b7dd8" },
  B: { label: "Black", swatch: "#7a6f86" },
  R: { label: "Red", swatch: "#d8542f" },
  G: { label: "Green", swatch: "#3f9b54" },
  Multicolor: { label: "Multicolor", swatch: "#d9a531" },
  Colorless: { label: "Colorless", swatch: "#9aa0a6" },
};
const COLOR_ORDER = ["W", "U", "B", "R", "G", "Multicolor", "Colorless"];
const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land", "Other"];
const RARITY_ORDER = ["mythic", "rare", "uncommon", "common", "special", "bonus", "unknown"];
const RARITY_COLOR = { mythic: "#d8542f", rare: "#d9a531", uncommon: "#b6c2cc", common: "#7d8590", special: "#a06fd8", bonus: "#a06fd8", unknown: "var(--ley-text-faint)" };

const money = (v) => (v == null || Number.isNaN(v) ? "—" : `$${Number(v).toFixed(2)}`);

export default function VaultStatsView({ colors, fontFamily, onGoToCollection }) {
  const { BG, BG2, LINE, TEXT, MUTED, GOLD } = colors;
  const F = fontFamily;
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/collection/stats");
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", data: null, error: body.error || "Failed to load stats." });
        else setState({ status: "ready", data: body, error: null });
      } catch (e) {
        setState({ status: "error", data: null, error: e.message });
      }
    })();
  }, []);

  if (state.status === "loading") return <Centered color={MUTED}>Loading stats…</Centered>;
  if (state.status === "error") return <Centered color={colors.RED}>{state.error}</Centered>;

  const data = state.data;
  const b = data?.breakdowns;
  const card = { background: BG2, border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, marginBottom: 16 };
  const h = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 12 };

  if (!b || b.ownedRows === 0) {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: BG, color: TEXT, fontFamily: F }}>
        <div style={card}>
          <div style={h}>Collection stats</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            {b ? "No owned cards yet — add cards to your Vault and the breakdowns will appear here."
               : "Card data isn't synced yet, so type/color/rarity breakdowns are unavailable. Sync from the Updates panel, then reopen this tab."}
          </div>
          {b && onGoToCollection && (
            <button onClick={onGoToCollection} className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
              + Add cards to your Vault
            </button>
          )}
        </div>
      </div>
    );
  }

  const typeRows = TYPE_ORDER.filter((t) => b.byType[t]).map((t) => ({ key: t, label: t, count: b.byType[t] }));
  const colorRows = COLOR_ORDER.filter((c) => b.byColor[c]).map((c) => ({ key: c, label: COLOR_META[c].label, count: b.byColor[c], swatch: COLOR_META[c].swatch }));
  const rarityRows = RARITY_ORDER.filter((r) => b.byRarity[r]).map((r) => ({ key: r, label: r[0].toUpperCase() + r.slice(1), count: b.byRarity[r], swatch: RARITY_COLOR[r] || "var(--ley-text-faint)" }));
  // Rarity comes from the printings index; older bundles don't carry it, so
  // hide the card entirely rather than show a meaningless all-"Unknown" bar.
  const hasRealRarity = rarityRows.some((r) => r.key !== "unknown");
  const curveMax = Math.max(1, ...Object.values(b.manaCurve));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: BG, color: TEXT, fontFamily: F }}>
      {/* Overview */}
      <div style={card}>
        <div style={h}>Overview</div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Stat label="Distinct cards" value={b.ownedRows} color={TEXT} />
          <Stat label="Total copies" value={data?.counts?.totalCards ?? "—"} color={TEXT} />
          <Stat label="Owned value" value={money(data?.value?.currentUsd)} color={GOLD} />
          <Stat label="Sets represented" value={b.setCount ?? 0} color={TEXT} />
        </div>
        {(() => {
          const series = data?.value?.series || [];
          if (series.length < 2) return null;
          const first = series[0].value;
          const last = series[series.length - 1].value;
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                Value over time · {money(first)} → {money(last)}
              </div>
              <Sparkline points={series.map((p) => p.value)} width={420} height={56} strokeWidth={2} />
            </div>
          );
        })()}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* By type */}
        <div style={card}>
          <div style={h}>By type</div>
          <BarList rows={typeRows} colors={colors} accent={GOLD} />
        </div>
        {/* By color */}
        <div style={card}>
          <div style={h}>By color</div>
          <BarList rows={colorRows} colors={colors} useSwatch />
        </div>
        {/* By rarity — only when the index carries rarity */}
        {hasRealRarity && (
          <div style={card}>
            <div style={h}>By rarity</div>
            <BarList rows={rarityRows.filter((r) => r.key !== "unknown")} colors={colors} useSwatch />
          </div>
        )}
        {/* Mana curve */}
        <div style={card}>
          <div style={h}>Mana curve (non-land)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110, paddingTop: 6 }}>
            {Object.entries(b.manaCurve).map(([cmc, n]) => (
              <div key={cmc} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 10, color: MUTED }}>{n || ""}</span>
                <div title={`CMC ${cmc}: ${n}`} style={{ width: "100%", height: `${(n / curveMax) * 100}%`, minHeight: n ? 3 : 0, background: GOLD, borderRadius: "3px 3px 0 0" }} />
                <span style={{ fontSize: 10, color: MUTED }}>{cmc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top sets */}
      <div style={card}>
        <div style={h}>Top sets</div>
        {(b.topSets || []).map((s) => (
          <div key={s.setCode} style={rowStyle(LINE)}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.setName || s.setCode} <span style={{ color: MUTED }}>· {s.setCode}</span>
            </span>
            <span style={{ fontSize: 13, color: GOLD, minWidth: 56, textAlign: "right" }}>{s.count}</span>
          </div>
        ))}
      </div>

      {/* Most valuable */}
      <div style={card}>
        <div style={h}>Most valuable</div>
        {(b.mostValuable || []).length === 0 && (
          <div style={{ fontSize: 12, color: MUTED }}>No priced cards yet — sync prices from the Updates panel.</div>
        )}
        {(b.mostValuable || []).map((c) => (
          <div key={c.scryfallId || c.name} style={rowStyle(LINE)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: TEXT, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 10, color: MUTED }}>
                {c.setCode ? String(c.setCode).toUpperCase() : ""}{c.quantity > 1 ? ` · ×${c.quantity}` : ""}
              </span>
            </span>
            <span style={{ fontSize: 13, color: GOLD, minWidth: 72, textAlign: "right" }}>{money(c.lineValue)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, padding: "0 2px 16px" }}>
        Composition counts distinct printings you own (wishlist excluded). Type, color, and rarity come from the bundled card index; value uses stored prices (price × quantity).
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function BarList({ rows, colors, accent, useSwatch }) {
  const { TEXT, MUTED, LINE } = colors;
  if (!rows.length) return <div style={{ fontSize: 12, color: MUTED }}>No data.</div>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => (
    <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span style={{ width: 92, fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
      <div style={{ flex: 1, height: 10, background: LINE, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: useSwatch ? r.swatch : accent, borderRadius: 3 }} />
      </div>
      <span style={{ width: 32, textAlign: "right", fontSize: 12, color: MUTED }}>{r.count}</span>
    </div>
  ));
}

function rowStyle(line) {
  return { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${line}` };
}

function Centered({ color, children }) {
  return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color, fontSize: 13, padding: 40 }}>{children}</div>;
}
