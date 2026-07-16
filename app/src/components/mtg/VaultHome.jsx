"use client";

/**
 * VaultHome — The Vault's front door: four LIVE door-panes (Stacks / Ledger /
 * Atlas / Forge) + the Pulse strip ("since you last looked"). Same landing →
 * door → surface architecture as ProvingHome, but every door shows real
 * at-a-glance data from the existing local endpoints. All fetches are
 * best-effort: a door renders its blurb alone until (or unless) data lands.
 */

import { useEffect, useMemo, useState } from "react";

const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
};

const fetchJson = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/* Door icons — LEYLINE greens, drawn in the ProvingHome stroke language. */
const ICONS = {
  stacks: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="13" height="18" rx="1.5" />
      <path d="M19 5.5v15a1.5 1.5 0 0 1-1.5 1.5" opacity="0.6" />
      <path d="M22 8v12a1.5 1.5 0 0 1-1.5 1.5" opacity="0.35" />
      <path d="M6.5 7h6M6.5 10.5h6" />
    </svg>
  ),
  ledger: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M6.5 15.5l4-5 3.5 3 4.5-6.5" />
      <circle cx="12" cy="7" r="2.6" opacity="0.55" />
      <path d="M12 5.8v2.4M10.9 7h2.2" opacity="0.55" />
    </svg>
  ),
  census: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4v16M9 4v16M13 4v16M17 4v16" />
      <path d="M3 17.5L20 6.5" opacity="0.7" />
    </svg>
  ),
  atlas: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z" />
    </svg>
  ),
  gallery: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="9" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="16" width="6" height="4" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  ),
  forge: (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4l6 6-9 9H5v-6l9-9z" />
      <path d="M12.5 5.5l6 6" />
      <path d="M5 19l3-3" />
    </svg>
  ),
};

function DoorStat({ big, small, color = "var(--ley-text)" }) {
  return (
    <div style={{ textAlign: "center", minHeight: 40 }}>
      {big != null && (
        <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 24, fontWeight: 700, color, lineHeight: 1.1 }}>
          {big}
        </div>
      )}
      {small && (
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-text-faint)", marginTop: 4 }}>
          {small}
        </div>
      )}
    </div>
  );
}

export default function VaultHome({ onPick, fontFamily }) {
  const [stats, setStats] = useState(null);        // /api/collection/stats
  const [sets, setSets] = useState(null);          // /api/collection/sets
  const [buildable, setBuildable] = useState(null);// /api/collection/buildable
  const [finance, setFinance] = useState(null);    // /api/finance
  const [collection, setCollection] = useState(null); // /api/collection (recent adds + pulse)
  const [conflicts, setConflicts] = useState(null);   // /api/collection/conflicts
  const [gallery, setGallery] = useState(null);       // /api/collection/artists (V7)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [st, se, bu, fi, co, cf, ga] = await Promise.all([
        fetchJson("/api/collection/stats"),
        fetchJson("/api/collection/sets"),
        fetchJson("/api/collection/buildable"),
        fetchJson("/api/finance"),
        fetchJson("/api/collection"),
        fetchJson("/api/collection/conflicts"),
        fetchJson("/api/collection/artists"),
      ]);
      if (cancelled) return;
      setStats(st); setSets(se); setBuildable(bu); setFinance(fi);
      setCollection(co?.collection || null); setConflicts(cf); setGallery(ga);
    })();
    return () => { cancelled = true; };
  }, []);

  // Recent adds — newest addedAt owned rows, for the Stacks door's art strip.
  const recentAdds = useMemo(() => {
    const rows = (collection?.cards || []).filter((r) => !r.wishlist && r.addedAt);
    rows.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    return rows.slice(0, 4);
  }, [collection]);

  // Closest-to-complete set with real progress (needs owned>0 and total>0).
  const closestSet = useMemo(() => {
    const list = sets?.sets || [];
    let best = null;
    for (const s of list) {
      const total = s.total ?? s.cardCount ?? 0;
      const owned = s.owned ?? 0;
      if (!total || !owned || owned >= total) continue;
      const pct = owned / total;
      if (!best || pct > best.pct) best = { ...s, total, pct };
    }
    return best;
  }, [sets]);

  const addedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return (collection?.cards || []).filter((r) => {
      if (r.wishlist || !r.addedAt) return false;
      const t = Date.parse(r.addedAt);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
  }, [collection]);

  // C5-P2.3 — the Census door's at-a-glance: the collection's biggest color
  // share (owned rows by color, from the stats route the door already pulls).
  const topColor = useMemo(() => {
    const byColor = stats?.breakdowns?.byColor;
    if (!byColor) return null;
    let total = 0;
    let best = null;
    for (const [key, count] of Object.entries(byColor)) {
      total += count;
      if (!best || count > best.count) best = { key, count };
    }
    if (!best || !total) return null;
    const names = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
    return { label: names[best.key] || best.key, pct: Math.round((best.count / total) * 100) };
  }, [stats]);

  const topMover = finance?.owned?.risers?.[0] || null;
  const alertsMet = Array.isArray(finance?.alerts) ? finance.alerts.length : 0;
  const conflictCount = conflicts?.conflicts?.length || 0;
  const d30 = stats?.value?.deltas?.d30 || null;
  const currentUsd = stats?.value?.currentUsd;
  const totalCards = stats?.counts?.totalCards;
  const uniqueRows = stats?.breakdowns?.ownedRows;
  const commanders = buildable?.commanders || [];

  const DOORS = [
    {
      id: "collection",
      title: "The Stacks",
      blurb: "Browse and manage every card you own.",
      icon: ICONS.stacks,
      body: (
        <>
          <DoorStat
            big={totalCards != null ? totalCards : null}
            small={uniqueRows != null ? `cards · ${uniqueRows} unique` : null}
          />
          {recentAdds.length > 0 && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 2 }}>
              {recentAdds.map((r) => (
                <img
                  key={r.scryfallId}
                  src={`/api/card-image?id=${encodeURIComponent(r.scryfallId)}`}
                  alt=""
                  width={34}
                  height={48}
                  loading="lazy"
                  style={{ objectFit: "cover", borderRadius: 3, border: "1px solid var(--ley-line)", opacity: 0.9 }}
                />
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      id: "vault-ledger",
      title: "The Ledger",
      blurb: "Value, movement, movers, and alerts.",
      icon: ICONS.ledger,
      body: (
        <DoorStat
          big={money(currentUsd)}
          color="var(--ley-green)"
          small={
            d30 && d30.delta !== 0
              ? `${d30.delta > 0 ? "▲" : "▼"} $${Math.abs(d30.delta).toFixed(2)} · 30d`
              : currentUsd != null ? "owned value" : null
          }
        />
      ),
    },
    {
      // C5-P2.3 — the Ledger split: stats get their own door. Pure IA — the
      // dashboard itself is unchanged, it just stops sharing a page with finance.
      id: "vault-census",
      title: "The Census",
      blurb: "Your collection, counted — composition, curve, rarity.",
      icon: ICONS.census,
      body: (
        <DoorStat
          big={topColor ? `${topColor.pct}% ${topColor.label}` : null}
          small={
            topColor
              ? uniqueRows != null ? `biggest share · ${uniqueRows} unique` : "biggest color share"
              : uniqueRows != null ? `${uniqueRows} unique cards` : null
          }
        />
      ),
    },
    {
      id: "vault-atlas",
      title: "The Atlas",
      blurb: "Every set you've touched, mapped.",
      icon: ICONS.atlas,
      body: (
        <>
          <DoorStat
            big={stats?.breakdowns?.setCount ?? null}
            small={stats?.breakdowns?.setCount != null ? "sets represented" : null}
          />
          {closestSet && (
            <div style={{ width: "100%", marginTop: 2 }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ley-text-faint)", marginBottom: 3, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {closestSet.setName} · {closestSet.owned}/{closestSet.total}
              </div>
              <div style={{ height: 4, background: "var(--ley-surface-2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(closestSet.pct * 100)}%`, height: "100%", background: "var(--ley-green)", boxShadow: "0 0 6px var(--ley-green-glow)" }} />
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      id: "vault-gallery",
      title: "The Gallery",
      blurb: "Your collection as an art wall — by artist.",
      icon: ICONS.gallery,
      body: (
        <DoorStat
          big={gallery?.ready && gallery?.artistsAvailable ? (gallery.artists?.length ?? null) : null}
          small={
            gallery?.ready && gallery?.artistsAvailable && gallery.artists?.length
              ? `artists · top: ${gallery.artists[0].artist}`
              : gallery?.ready === false ? "sync data to unlock" : gallery && !gallery.artistsAvailable ? "resync for artist data" : null
          }
        />
      ),
    },
    {
      id: "vault-forge",
      title: "The Forge",
      blurb: "What you can build — and what it costs to finish.",
      icon: ICONS.forge,
      body: (
        <DoorStat
          big={commanders.length ? commanders.length : null}
          small={
            commanders.length
              ? `buildable · top: ${commanders[0]?.name || "—"}`
              : buildable ? "add legends to unlock" : null
          }
        />
      ),
    },
  ];

  const pulse = [
    addedThisWeek > 0 && { label: `+${addedThisWeek} added this week`, view: "collection" },
    topMover && Number.isFinite(Number(topMover.delta)) && {
      label: `${topMover.name} ▲ $${Math.abs(Number(topMover.delta)).toFixed(2)}`,
      view: "vault-ledger",
    },
    alertsMet > 0 && { label: `${alertsMet} price alert${alertsMet === 1 ? "" : "s"} hit`, view: "vault-ledger" },
    conflictCount > 0 && { label: `${conflictCount} cross-deck conflict${conflictCount === 1 ? "" : "s"}`, view: "collection" },
  ].filter(Boolean);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: 32,
        overflowY: "auto",
        fontFamily,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 30, margin: 0, color: "var(--ley-text)" }}>
          The Vault
        </h1>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginTop: 6 }}>
          Your treasure, cataloged.
        </div>
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center", maxWidth: 1180 }}>
        {DOORS.map((d) => (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className="ley-card"
            style={{
              width: 250,
              height: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              cursor: "pointer",
              background: "var(--ley-glass)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid var(--ley-line)",
              borderRadius: "var(--r-xl)",
              color: "var(--ley-green)",
              fontFamily,
              padding: 18,
            }}
          >
            <span aria-hidden style={{ filter: "drop-shadow(0 0 10px var(--ley-green-glow))" }}>
              {d.icon}
            </span>
            <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 21, fontWeight: 700, color: "var(--ley-text)" }}>
              {d.title}
            </span>
            <span style={{ fontSize: 12, color: "var(--ley-text-dim)", textAlign: "center", lineHeight: 1.45 }}>
              {d.blurb}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
              {d.body}
            </div>
          </button>
        ))}
      </div>

      {pulse.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
          {pulse.map((p) => (
            <button
              key={p.label}
              onClick={() => onPick(p.view)}
              className="btn btn-ghost btn-sm"
              style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.05em" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
