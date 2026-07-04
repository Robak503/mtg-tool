"use client";

/**
 * VaultGalleryView — The Gallery (V7): the collection as an art wall, grouped
 * by the artist of the exact printing owned. Backed by /api/collection/artists
 * (V5 printings-index fields); degrades honestly when the index is missing or
 * predates the artist data.
 */

import { useEffect, useState } from "react";

export default function VaultGalleryView({ onNavigate, fontFamily }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/collection/artists");
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", data: null, error: body.error || "Failed to load the Gallery." });
        else setState({ status: "ready", data: body, error: null });
      } catch (e) {
        setState({ status: "error", data: null, error: e.message });
      }
    })();
  }, []);

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", fontFamily, color: "var(--ley-text)" };
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 16 };
  const h = { fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 12 };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      {onNavigate && (
        <button onClick={() => onNavigate("vault-home")} className="btn btn-ghost btn-sm">← Vault</button>
      )}
      <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", letterSpacing: "-0.02em" }}>
        The Gallery
      </h1>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
        your collection, by artist
      </span>
    </div>
  );

  if (state.status === "loading") {
    return <div style={wrap}>{header}<div style={{ color: "var(--ley-text-dim)", fontSize: 13 }}>Hanging the frames…</div></div>;
  }
  if (state.status === "error") {
    return <div style={wrap}>{header}<div style={{ color: "var(--ley-red)", fontSize: 13 }}>{state.error}</div></div>;
  }

  const { ready, artistsAvailable, artists = [], unmatched = 0 } = state.data || {};

  if (!ready) {
    return (
      <div style={wrap}>{header}
        <div style={card}>
          <div style={h}>No printings index yet</div>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
            The Gallery reads artists from the local printings index — sync data from the
            Updates panel and come back.
          </div>
        </div>
      </div>
    );
  }
  if (!artistsAvailable) {
    return (
      <div style={wrap}>{header}
        <div style={card}>
          <div style={h}>Index predates artist data</div>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
            Your bundled printings index was built before artist metadata was added
            (v0.90.0). Run a data sync from the Updates panel — or install the next
            release — and the Gallery fills in.
          </div>
        </div>
      </div>
    );
  }
  if (artists.length === 0) {
    return (
      <div style={wrap}>{header}
        <div style={card}>
          <div style={h}>Empty walls</div>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>
            Add cards to your Vault and they hang here, grouped by artist.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {header}
      {artists.map((a) => (
        <div key={a.artist} style={card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 17, fontWeight: 700, color: "var(--ley-text)" }}>{a.artist}</span>
            <span style={{ fontSize: 11, color: "var(--ley-green)" }}>{a.count} piece{a.count === 1 ? "" : "s"} owned</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
            {a.cards.map((c) => (
              <figure key={c.scryfallId} style={{ margin: 0, flexShrink: 0, width: 150 }}>
                <img
                  src={`/api/art-crop?id=${encodeURIComponent(c.scryfallId)}`}
                  alt={c.name}
                  width={150}
                  height={84}
                  loading="lazy"
                  style={{ objectFit: "cover", borderRadius: 6, border: "1px solid var(--ley-line)", display: "block" }}
                />
                <figcaption style={{ fontSize: 10, color: "var(--ley-text-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </figcaption>
              </figure>
            ))}
            {a.count > a.cards.length && (
              <span style={{ alignSelf: "center", fontSize: 11, color: "var(--ley-text-faint)", flexShrink: 0 }}>
                +{a.count - a.cards.length} more
              </span>
            )}
          </div>
        </div>
      ))}
      {unmatched > 0 && (
        <div style={{ fontSize: 10, color: "var(--ley-text-faint)", padding: "0 2px 16px" }}>
          {unmatched} owned card{unmatched === 1 ? "" : "s"} couldn&apos;t be matched to a printing/artist — they still count everywhere else.
        </div>
      )}
    </div>
  );
}
