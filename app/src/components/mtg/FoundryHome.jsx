"use client";

/**
 * FoundryHome — THE FOUNDRY: Karn's zone (Colton, 2026-07-19: "a zone specific
 * to building decks and theory crafting… a place to save decks we're working on…
 * decks are to be worked on and crafted, not just static finance").
 *
 * The room is THE BENCH: a LEDGER of works in progress (Colton's spec, second
 * pass — "not cards but a list of decks we're working on: the name of the
 * commander and the color pie and x/100 of locked-in cards"). Each row: color
 * pips (the deck's identity = its COMMANDER's, per CR 903.4, read from the
 * bundled oracle — never guessed), deck name, commander, and the lock count
 * toward 100. The commander is always lock #1 — a deck with only its commander
 * reads 1/100; a deck with NO commander says so instead of inventing a floor.
 * A START A NEW DECK button lives in the bench itself, both states.
 *
 * The Vault keeps the FINANCE view of the same cards; this room is the CRAFT
 * view. (The Vault's "Forge" hall — build-from-collection — is kin; whether it
 * folds into the Foundry is an open call with Colton.)
 */
import { useEffect, useState } from "react";

import useCountUp from "../../hooks/useCountUp";
import FoundryRail from "./FoundryRail";
import RoomHeader from "./RoomHeader";

const HALLS = [
  { id: "import", label: "New deck / Import" },
];

/* Mana-identity pip colors — identity data, the sanctioned non-green exception. */
const PIP = {
  W: { fill: "#e9e3c9", name: "White" },
  U: { fill: "#4a90d9", name: "Blue" },
  B: { fill: "#8d7f9c", name: "Black" },
  R: { fill: "#d4553d", name: "Red" },
  G: { fill: "#57b06e", name: "Green" },
};
const PIP_ORDER = ["W", "U", "B", "R", "G"];

/** A deck's commanders + locked count (main list INCLUDING the commander), off its real rows. */
function deckFacts(deck) {
  const cards = deck?.cards || [];
  const commanders = cards.filter((c) => c.section === "Commander").map((c) => c.name);
  const locked = cards.filter((c) => c.section !== "Sideboard" && c.section !== "Tokens").reduce((s, c) => s + (c.qty || 0), 0);
  return { commanders, locked };
}

function ColorPie({ identity }) {
  if (!identity) return null; // unknown (oracle unreadable) — show nothing, never guess
  const pips = PIP_ORDER.filter((c) => identity.includes(c));
  if (pips.length === 0) {
    return <span title="Colorless" aria-label="Colorless" style={{ width: 9, height: 9, borderRadius: "50%", background: "#b8b3a9", border: "1px solid rgba(0,0,0,0.5)", display: "inline-block", flexShrink: 0 }} />;
  }
  return (
    <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }} aria-label={pips.map((p) => PIP[p].name).join(" ")}>
      {pips.map((p) => (
        <span key={p} title={PIP[p].name} style={{ width: 9, height: 9, borderRadius: "50%", background: PIP[p].fill, border: "1px solid rgba(0,0,0,0.55)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.25)" }} />
      ))}
    </span>
  );
}

export default function FoundryHome({ savedDecks = [], onOpenDeck, onImport, fontFamily }) {
  const countDecks = useCountUp(savedDecks.length);

  // The color pie per deck = its COMMANDER's identity, read from the bundled oracle.
  // Unknown (no commander / oracle unreadable) stays null → the row shows no pips.
  const [identities, setIdentities] = useState({}); // commanderName -> ["W","U",...]
  useEffect(() => {
    let alive = true;
    const names = [...new Set(savedDecks.flatMap((d) => deckFacts(d).commanders))].filter(Boolean);
    if (!names.length) return;
    (async () => {
      const pairs = await Promise.all(names.map(async (n) => {
        try {
          const r = await fetch(`/api/cards?name=${encodeURIComponent(n)}`);
          if (!r.ok) return [n, null];
          const b = await r.json();
          return [n, Array.isArray(b?.card?.colorIdentity) ? b.card.colorIdentity : null];
        } catch { return [n, null]; }
      }));
      if (alive) setIdentities(Object.fromEntries(pairs));
    })();
    return () => { alive = false; };
  }, [savedDecks]);

  return (
    <div className="ley-stage" style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0, position: "relative" }}>
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        <RoomHeader
          title="THE FOUNDRY"
          tagline="Build it · tune it · roast it"
          halls={HALLS}
          onPick={(id) => { if (id === "import") onImport?.(); }}
        />

        {/* ── The bench: the works-in-progress ledger (the tile row was cut — Colton:
              "cut those squares all together and just add the deck count into the deck
              list section"; ONE start button, the green one) ── */}
        <div className="ley-glass ley-pane ley-rise" style={{ padding: "14px 16px", animationDelay: "120ms", flex: 1, minHeight: 340 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ley-lab" style={{ flex: 1 }}>The bench</div>
            <span className="ley-qty" style={{ fontSize: 11, padding: "3px 10px" }}>
              {Math.round(countDecks)} deck{savedDecks.length === 1 ? "" : "s"}
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => onImport?.()}>＋ Start a new deck</button>
          </div>
          {savedDecks.length ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {savedDecks.map((d) => {
                const { commanders, locked } = deckFacts(d);
                const identity = commanders.length
                  ? PIP_ORDER.filter((c) => commanders.some((n) => (identities[n] || []).includes(c)))
                  : null;
                const pct = Math.min(100, Math.round((locked / 100) * 100));
                return (
                  <button
                    key={d.id || d.name}
                    onClick={() => onOpenDeck?.(d.id)}
                    className="ley-ledger-row"
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid var(--ley-line)", padding: "10px 8px", color: "var(--ley-text)" }}
                    title={`Open ${d.name} at the bench`}
                  >
                    <ColorPie identity={commanders.length ? identity : null} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 11.5, color: commanders.length ? "var(--ley-text-dim)" : "var(--ley-red)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {commanders.length ? commanders.join(" / ") : "no commander locked"}
                    </span>
                    {/* the lock count toward 100 — the commander is always lock #1 */}
                    <span aria-hidden style={{ width: 72, height: 3, borderRadius: 2, background: "rgba(0,0,0,0.55)", boxShadow: "inset 0 1px 1px rgba(0,0,0,0.7), 0 1px 0 rgba(167,243,208,0.08)", flexShrink: 0, overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #1d9e54, var(--ley-green))", boxShadow: "0 0 6px var(--ley-green-glow)" }} />
                    </span>
                    <span className="ley-qty" style={{ flexShrink: 0, minWidth: 52, textAlign: "center" }}>{locked}/100</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 12, lineHeight: 1.6 }}>
              The bench is empty — hit <b style={{ color: "var(--ley-green)" }}>the green button above</b>.
              Paste a list or import from a URL, and it lives here as a work in progress: Karn at your
              shoulder, Tibalt on call for the roast.
            </div>
          )}
        </div>
      </div>

      {/* ── Right rail: Karn ───────────────────────────────────────────────────── */}
      <FoundryRail fontFamily={fontFamily} decks={savedDecks} />
    </div>
  );
}
