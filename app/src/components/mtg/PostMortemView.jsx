"use client";

/**
 * PostMortemView — "The Reflecting Pool" (Crucible dream feature A-EVOLVED, 2026-07-15). The per-deck
 * review dossier: pick a deck, see its record, the dossier facts row, and the two honest mirrors — what
 * WINS it games and what LOSES it games — each mined by lift from the real grind history
 * (/api/why-you-lost → lossMiner). The internal `postmortem` view id + file name stay (lineage, like
 * `proving` = "The Crucible"); the user-facing surface is The Reflecting Pool.
 *
 * HONEST framing (CREED) is carried straight through from the miner: these are games where the SIM AI
 * pilots the deck (a proxy that sharpens as the model trains), and every reason shown is genuinely more
 * common on its side than the other (lift), with BOTH rates on the bar. A column with no clear pattern
 * says so.
 *
 * Split: PostMortemView owns the fetch + load/empty/error states; PostMortemBoard is pure-initial
 * (props decks + totalGames; deck selection is plain useState) so it renders under renderToStaticMarkup
 * for tests.
 */

import { useEffect, useState } from "react";

// Plain-English coaching, keyed by the miner's pattern key. UI copy (not persona) — kept honest
// and actionable. Falls back to the pattern's own label when a key has no line yet.
const LOSS_COACHING = {
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

// Win-framed coaching — the lines worth leaning into (R1, "why you win").
const WIN_COACHING = {
  "commander-early": "Your best games start with the commander down early. Mulligan and ramp toward that line — it's the deck's real opening.",
  "mana-healthy": "When the mana behaves — no screw, no flood — this deck wins. Consistency is the engine; protect it when you tune.",
  "kept-seven": "Keeping a full seven is a winning tell. The deck rewards its average hand — don't dig unless you have to.",
  "closed-fast": "Your wins come quick — this deck wants to race, not grind. Take the aggressive line while the table is still setting up.",
  "won-combat": "Combat damage is how your wins end. Keep the pressure units coming and clear the blockers out of the way.",
  "won-commander-damage": "Commander damage seals your wins. Suit the commander up and keep it swinging — 21 comes fast.",
  "won-burn": "Your wins end in burn — noncombat damage that ignores the board. Keep the reach effects flowing.",
  "won-poison": "Poison closes your games — ten counters comes quicker than forty life. Stay on that plan.",
  "won-decking": "Your wins end by decking. The mill plan works — keep the engine pieces protected.",
  "won-effect": "Your wins end on a win-the-game effect. Protect the combo pieces and the table can't stop the finish.",
};

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const commas = (n) => (n ?? 0).toLocaleString("en-US");

/**
 * One mined pattern: coaching headline + the honest two-rate bar + lift chip.
 * tone "loss": fill = share of LOSSES (red), tick = share of wins, chip "+Npt vs wins".
 * tone "win":  fill = share of WINS (green), tick = share of losses, chip "+Npt vs losses".
 */
function PatternRow({ p, tone }) {
  const isWin = tone === "win";
  const share = isWin ? p.winShare : p.lossShare;
  const baseShare = isWin ? p.lossShare : p.winShare;
  const fillColor = isWin ? "var(--ley-green)" : "var(--ley-red)";
  const fillGlow = isWin ? "0 0 8px var(--ley-green-glow)" : "none";
  const chipColor = isWin ? "var(--ley-green)" : "var(--ley-red)";
  const chipBg = isWin ? "var(--ley-green-dim)" : "var(--ley-red-dim)";
  const fillW = Math.max(0, Math.min(100, (share ?? 0) * 100));
  const tickW = baseShare == null ? null : Math.max(0, Math.min(100, baseShare * 100));
  const coaching = (isWin ? WIN_COACHING : LOSS_COACHING)[p.key] || p.label;
  return (
    <div style={{ padding: "11px 0", borderTop: "1px solid var(--ley-line)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ley-text)" }}>{p.label}</span>
        {p.lift != null && (
          <span
            title={isWin ? "How much more this shows up in wins than losses" : "How much more this shows up in losses than wins"}
            style={{ fontSize: 10.5, fontWeight: 700, color: chipColor, background: chipBg, border: `1px solid ${chipColor}`, borderRadius: 999, padding: "1px 8px", fontVariantNumeric: "tabular-nums" }}
          >
            +{Math.round(p.lift * 100)}pt vs {isWin ? "losses" : "wins"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ley-text-dim)", lineHeight: 1.5, marginBottom: 9 }}>
        {coaching}
      </div>
      {/* honest bar: filled = this side's share; the tick = the OTHER side's rate (why it's a real reason) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flex: 1, height: 8, background: "var(--ley-line)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fillW}%`, background: fillColor, boxShadow: fillGlow, opacity: isWin ? 1 : 0.75 }} />
          {tickW != null && (
            <div title={`${pct(baseShare)} of ${isWin ? "losses" : "wins"}`} style={{ position: "absolute", left: `calc(${tickW}% - 1px)`, top: -1, bottom: -1, width: 2, background: "var(--ley-text)" }} />
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <b style={{ color: "var(--ley-text)" }}>{pct(share)}</b> of {isWin ? "wins" : "losses"}
          {baseShare != null && <> · {pct(baseShare)} of {isWin ? "losses" : "wins"}</>}
        </span>
      </div>
    </div>
  );
}

// One dossier facts cell: tiny mono label over the value. Rendered only when the fact is real.
function FactCell({ label, value }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-text-faint)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ley-text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// The key-facts strip: avg game length, win/loss turns, how the wins end, commander-online rate.
// Every cell is null-guarded — a fact below the miner's honesty floor simply doesn't render.
function FactsRow({ deck }) {
  const f = deck.facts || {};
  const cells = [];
  if (f.avgGameTurns != null) cells.push(["Typical game", `${Math.round(f.avgGameTurns)} turns`]);
  if (f.avgWinTurn != null) cells.push(["Wins end by", `turn ${Math.round(f.avgWinTurn)}`]);
  if (deck.avgLossTurn != null) cells.push(["Dies around", `turn ${Math.round(deck.avgLossTurn)}`]);
  if (f.winConMix && f.winConMix[0]) cells.push(["Usually closes by", `${f.winConMix[0].label} · ${pct(f.winConMix[0].share)} of wins`]);
  if (f.commanderOnline != null) {
    const co = f.commanderOnline;
    cells.push(["Commander online", `${pct(co.rate)} of games${co.avgTurn != null ? ` · avg turn ${co.avgTurn.toFixed(1)}` : ""}`]);
  }
  if (!cells.length) return null;
  return (
    <div style={{ display: "flex", gap: 26, flexWrap: "wrap", padding: "12px 14px", marginBottom: 14, background: "var(--ley-glass)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)" }}>
      {cells.map(([label, value]) => <FactCell key={label} label={label} value={value} />)}
    </div>
  );
}

// One mirror column ("what wins you games" / "what loses you games") with its honest empty state.
function MirrorColumn({ title, tone, patterns, minerNote, emptyLine }) {
  const color = tone === "win" ? "var(--ley-green)" : "var(--ley-red)";
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color, marginBottom: 4 }}>{title}</div>
      {patterns && patterns.length > 0 ? (
        patterns.map((p) => <PatternRow key={p.key} p={p} tone={tone} />)
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--ley-text-faint)", lineHeight: 1.5, paddingTop: 8, borderTop: "1px solid var(--ley-line)" }}>
          {/* a too-few-games note from the miner is more honest than the generic line — surface it */}
          {minerNote && /^Only \d/.test(minerNote) ? minerNote : emptyLine}
        </div>
      )}
    </div>
  );
}

// The full dossier for ONE deck: record header, facts strip, and the two mirrors side by side.
function DeckDossier({ deck, card }) {
  const wr = deck.games ? deck.winRate ?? deck.wins / deck.games : 0;
  return (
    <div className="ley-card" style={card}>
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 21, fontWeight: 700, color: "var(--ley-text)" }}>{deck.deckName || deck.deckId || "Unknown deck"}</span>
        <span style={{ fontSize: 12.5, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums" }}>
          <b style={{ color: "var(--ley-green)" }}>{commas(deck.wins)}W</b> · <b style={{ color: "var(--ley-red)" }}>{commas(deck.losses)}L</b> · {pct(wr)} win rate · {commas(deck.games)} games
        </span>
      </div>
      <FactsRow deck={deck} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22 }}>
        <MirrorColumn
          title="What wins you games"
          tone="win"
          patterns={deck.winPatterns}
          minerNote={deck.winNote}
          emptyLine="No single winning line stands out yet — nothing shows up enough more in wins than losses to call out. As the games accrue, this sharpens."
        />
        <MirrorColumn
          title="What loses you games"
          tone="loss"
          patterns={deck.patterns}
          minerNote={deck.note}
          emptyLine="No single loss pattern stands out for this deck yet — nothing shows up enough more in losses than wins to call it out. As the model trains and the deeper signals come online, this sharpens."
        />
      </div>
    </div>
  );
}

/**
 * PostMortemBoard — pure-initial (selection is plain useState so renderToStaticMarkup shows the first
 * deck's dossier). `decks` = mineDeckLosses summaries, already most-lost-first from the route.
 */
export function PostMortemBoard({ decks, totalGames }) {
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 14 };
  const withData = (decks || []).filter((d) => d && d.games > 0);
  const [pickedId, setPickedId] = useState(null);
  const selected = withData.find((d) => (d.deckId || d.deckName) === pickedId) || withData[0];
  if (withData.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.6 }}>
          No graded games yet for your decks. Run a grind in the Sim Center and each deck&rsquo;s dossier —
          what wins it games and what loses them — will build up here. The more games, the sharper the read.
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={{ ...card, borderColor: "var(--ley-green)", background: "var(--ley-green-dim)" }}>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.6 }}>
          Each deck&rsquo;s dossier: the patterns that <b>separate its wins from its losses</b> when the sim
          AI pilots it — a proxy for how the deck plays that sharpens as the model trains. Mined from{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{commas(totalGames)}</b> recorded games.
        </div>
      </div>
      {/* the deck shelf — browse one dossier at a time (most-lost first) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {withData.map((d) => {
          const id = d.deckId || d.deckName;
          const isSel = selected && (selected.deckId || selected.deckName) === id;
          return (
            <button
              key={id}
              onClick={() => setPickedId(id)}
              className="btn btn-sm"
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, padding: "7px 12px",
                background: isSel ? "var(--ley-green-dim)" : "var(--ley-glass)",
                border: `1px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: "var(--r-md)", cursor: "pointer",
                boxShadow: isSel ? "0 0 10px var(--ley-green-glow)" : "none",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isSel ? "var(--ley-green)" : "var(--ley-text)" }}>{d.deckName || d.deckId}</span>
              <span style={{ fontSize: 10, color: "var(--ley-text-dim)", fontVariantNumeric: "tabular-nums" }}>{commas(d.wins)}W · {commas(d.losses)}L</span>
            </button>
          );
        })}
      </div>
      {selected && <DeckDossier deck={selected} card={card} />}
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
        if (!resp.ok) setState({ status: "error", decks: [], totalGames: 0, error: body.error || "Couldn't read your game history." });
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
        The Reflecting Pool
      </h1>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
        every deck, reflected — what wins, what loses, and why
      </span>
    </div>
  );

  if (state.status === "loading") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Reading the game history…</div></div>;
  if (state.status === "error") return <div style={wrap}>{header}<div style={{ fontSize: 13, color: "var(--ley-red)" }}>{state.error}</div></div>;

  return (
    <div style={wrap}>
      {header}
      <PostMortemBoard decks={state.decks} totalGames={state.totalGames} />
    </div>
  );
}
