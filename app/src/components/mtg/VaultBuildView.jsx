"use client";

/**
 * VaultBuildView — the Vault's "Build From Vault" tab (#20 / G1, generation half).
 *
 * Reads /api/collection/buildable and lists the legendary creatures (and
 * commander-eligible planeswalkers) you OWN, ranked by how many other owned
 * cards are legal in each one's color identity — i.e. how much of a Commander
 * deck you could already build around it. Clicking one opens a fresh Karn chat
 * to build around it. All local: candidates + pool come from your collection
 * joined with the bundled card index.
 */

import { useEffect, useState } from "react";

// WUBRG pip swatches — match the color language used in VaultStatsView.
const PIP = {
  W: { bg: "#e9e4cf", fg: "#3a3526" },
  U: { bg: "#3b7dd8", fg: "#ffffff" },
  B: { bg: "#5b5360", fg: "#ffffff" },
  R: { bg: "#d8542f", fg: "#ffffff" },
  G: { bg: "#3f9b54", fg: "#ffffff" },
};
const PIP_ORDER = ["W", "U", "B", "R", "G"];

export default function VaultBuildView({ colors, fontFamily, onBuildCommander, onGoToCollection }) {
  const { BG, BG2, LINE, TEXT, MUTED, GOLD, RED } = colors;
  const F = fontFamily;
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/collection/buildable");
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", data: null, error: body.error || "Failed to load buildable commanders." });
        else setState({ status: "ready", data: body, error: null });
      } catch (e) {
        setState({ status: "error", data: null, error: e.message });
      }
    })();
  }, []);

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", background: BG, color: TEXT, fontFamily: F };
  const card = { background: BG2, border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, marginBottom: 16 };
  const h = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 12 };

  if (state.status === "loading") return <Centered color={MUTED}>Finding what you can build…</Centered>;
  if (state.status === "error") return <Centered color={RED}>{state.error}</Centered>;

  const commanders = state.data?.commanders || [];
  const ownedCards = state.data?.ownedCards ?? 0;

  if (commanders.length === 0) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={h}>Build from your Vault</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            No commanders found in your collection yet. Add some legendary creatures
            (and the cards in their colors) to your Vault and they&apos;ll show up here,
            ranked by how much of a deck you already own around each one.
          </div>
          {onGoToCollection && (
            <button onClick={onGoToCollection} className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
              + Add cards to your Vault
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={h}>Build from your Vault</div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 12 }}>
          Legendary commanders you own, ranked by how many of your {ownedCards} owned
          cards are legal in each one&apos;s colors. Pick one and Karn will help you build
          around it.
        </div>
        {commanders.map((c) => (
          <button
            key={c.name}
            onClick={() => onBuildCommander?.(c.name)}
            className="ley-row"
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
              padding: "10px 6px", background: "transparent", borderRadius: 6,
              cursor: "pointer", fontFamily: F, color: TEXT,
            }}
            title={`Build a Commander deck around ${c.name} with Karn`}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </span>
            <Pips ci={c.colorIdentity} />
            <span style={{ fontSize: 12, color: GOLD, minWidth: 130, textAlign: "right", flexShrink: 0 }}>
              own {c.ownedInColor} in its colors
            </span>
            <span style={{ fontSize: 16, color: MUTED, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, padding: "0 2px 16px" }}>
        Commanders and color identities come from the bundled card index; ownership from your
        collection. The count is how many other cards you own that are legal in that commander&apos;s
        color identity — a rough measure of how much of a deck is already on hand.
      </div>
    </div>
  );
}

function Pips({ ci }) {
  const list = Array.isArray(ci) ? ci : [];
  if (list.length === 0) {
    return (
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#9aa0a6", color: "#1a1a1a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }} title="Colorless">C</span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
      {PIP_ORDER.filter((c) => list.includes(c)).map((c) => (
        <span key={c} style={{ width: 18, height: 18, borderRadius: "50%", background: PIP[c].bg, color: PIP[c].fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{c}</span>
      ))}
    </span>
  );
}

function Centered({ color, children }) {
  return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color, fontSize: 13, padding: 40 }}>{children}</div>;
}
