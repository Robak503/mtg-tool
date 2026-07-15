"use client";

/**
 * PostMortemView — "Why you lost" (Crucible dream feature A, the passive surface). Reads
 * /api/why-you-lost (the lossMiner) and shows, per deck, the loss patterns that show up MORE
 * in its losses than its wins — with a plain-English coaching line for each. Passive-first: the
 * interactive coach (blended chat) rides the Academy learn route and lands once that's un-broken.
 *
 * HONEST framing (CREED) is carried straight through from the miner: these are losses when the
 * SIM AI pilots the deck (a proxy that sharpens as the model trains), and every reason shown is
 * genuinely more common in losses than wins (lift). A deck with no clear pattern says so.
 *
 * Split: PostMortemView owns the fetch + load/empty/error states; PostMortemBoard is pure (props
 * decks + totalGames) so it renders under renderToStaticMarkup for tests.
 */

import { useEffect, useState } from "react";

// Plain-English coaching, keyed by the miner's pattern key. UI copy (not persona) — kept honest
// and actionable. Falls back to the pattern's own label when a key has no line yet.
const COACHING = {
  "no-commander": "Your commander is carrying this deck — when it never lands, the whole plan stalls. Lean on ramp to cast it sooner and protection to keep it on the table.",
  "mulligan-tax": "You're digging deep for a keeper and starting the game down cards. Tighten the curve and consistency so more opening hands are worth keeping.",
  "mana-screw": "Too few lands, too often. Add a land or two, or more cheap ramp and card draw to smooth the early draws.",
  "flood": "Too many lands and not enough action. Trim a land or add card advantage that turns the extra lands into gas.",
  "died-fast": "You're getting knocked out early — the deck is slow to defend itself. Add cheap interaction and blockers, or lower the curve.",
  "killed-commander-damage": "A voltron commander is connecting for lethal. Hold up removal or a blocker for the big threat before it gets there.",
  "killed-combat": "You're losing the damage race on the board. More blockers, a timely board wipe, or a faster clock of your own.",
  "killed-burn-drain": "Non-combat damage — burn and drains — is closing you out. Pressure the table to end it sooner, or pick up some lifegain.",
  "killed-poison": "Infect and toxic are racing you to ten counters. Kill the poison source fast — you won't get those turns back.",
  "killed-decking": "You're milling yourself out. Ease off the self-mill loops, or add a way to shuffle a graveyard back in.",
};

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const commas = (n) => (n ?? 0).toLocaleString("en-US");

// One loss pattern: coaching headline + the honest loss-vs-win bar + lift chip.
function PatternRow({ p }) {
  const lossW = Math.max(0, Math.min(100, (p.lossShare ?? 0) * 100));
  const winW = p.winShare == null ? null : Math.max(0, Math.min(100, p.winShare * 100));
  return (
    <div style={{ padding: "11px 0", borderTop: "1px solid var(--ley-line)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ley-text)" }}>{p.label}</span>
        {p.lift != null && (
          <span
            title="How much more this shows up in losses than wins"
            style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ley-green)", background: "var(--ley-green-dim)", border: "1px solid var(--ley-green)", borderRadius: 999, padding: "1px 8px", fontVariantNumeric: "tabular-nums" }}
          >
            +{Math.round(p.lift * 100)}pt vs wins
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ley-text-dim)", lineHeight: 1.5, marginBottom: 9 }}>
        {COACHING[p.key] || p.label}
      </div>
      {/* honest bar: filled = share of LOSSES; the tick = share of WINS (why it's a real reason) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flex: 1, height: 8, background: "var(--ley-line)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${lossW}%`, background: "var(--ley-green)", boxShadow: "0 0 8px var(--ley-green-glow)" }} />
          {winW != null && (
            <div title={`${pct(p.winShare)} of wins`} style={{ position: "absolute", left: `calc(${winW}% - 1px)`, top: -1, bottom: -1, width: 2, background: "var(--ley-text)" }} />
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <b style={{ color: "var(--ley-text)" }}>{pct(p.lossShare)}</b> of losses
          {p.winShare != null && <> · {pct(p.winShare)} of wins</>}
        </span>
      </div>
    </div>
  );
}

// One deck's post-mortem card: record line + its patterns (or an honest "nothing stands out").
function DeckCard({ deck, card }) {
  const wr = deck.games ? deck.winRate ?? deck.wins / deck.games : 0;
  return (
    <div className="ley-card" style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ley-text)" }}>{deck.deckName || deck.deckId || "Unknown deck"}</span>
        <span style={{ fontSize: 11.5, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums" }}>
          {commas(deck.wins)}W · {commas(deck.losses)}L · {pct(wr)} win
          {deck.avgLossTurn != null && <> · avg loss turn {deck.avgLossTurn.toFixed(0)}</>}
        </span>
      </div>
      {deck.patterns && deck.patterns.length > 0 ? (
        deck.patterns.map((p) => <PatternRow key={p.key} p={p} />)
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--ley-text-faint)", lineHeight: 1.5, paddingTop: 8, borderTop: "1px solid var(--ley-line)" }}>
          No single loss pattern stands out for this deck yet — nothing shows up enough more in losses
          than wins to call it out. As the model trains and the deeper signals come online, this sharpens.
        </div>
      )}
    </div>
  );
}

/**
 * PostMortemBoard — PURE. Renders the caveat + a deck card per summary (already most-lost-first
 * from the route). Exported for the SSR render test. `decks` = mineDeckLosses summaries.
 */
export function PostMortemBoard({ decks, totalGames }) {
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 14 };
  const withData = (decks || []).filter((d) => d && d.games > 0);
  if (withData.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.6 }}>
          No graded games yet for your decks. Run a grind in the Sim Center and your decks&rsquo; loss
          patterns will show up here — the more games, the sharper the read.
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={{ ...card, borderColor: "var(--ley-green)", background: "var(--ley-green-dim)" }}>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.6 }}>
          These are the patterns that show up <b>more in your losses than your wins</b> when the sim AI
          pilots each deck — a proxy for how the deck loses that sharpens as the model trains. Mined from{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{commas(totalGames)}</b> recorded games.
        </div>
      </div>
      {withData.map((d) => (
        <DeckCard key={d.deckId || d.deckName} deck={d} card={card} />
      ))}
    </>
  );
}

export default function PostMortemView({ onBack, fontFamily }) {
  const [state, setState] = useState({ status: "loading", decks: [], totalGames: 0, error: null });

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/why-you-lost", { cache: "no-store" });
        const body = await resp.json();
        if (!resp.ok) setState({ status: "error", decks: [], totalGames: 0, error: body.error || "Couldn't read your loss history." });
        else setState({ status: "ready", decks: body.decks || [], totalGames: body.totalGames || 0, error: null });
      } catch (e) {
        setState({ status: "error", decks: [], totalGames: 0, error: e.message });
      }
    })();
  }, []);

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", fontFamily, color: "var(--ley-text)" };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      {onBack && <button onClick={onBack} className="btn btn-ghost btn-sm">← The Crucible</button>}
      <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", letterSpacing: "-0.02em" }}>
        The Post-Mortem
      </h1>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
        how your decks lose — and how to stop
      </span>
    </div>
  );

  if (state.status === "loading") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Reading the loss history…</div></div>;
  if (state.status === "error") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-red)" }}>{state.error}</div></div>;

  return (
    <div style={wrap}>
      {header}
      <PostMortemBoard decks={state.decks} totalGames={state.totalGames} />
    </div>
  );
}
