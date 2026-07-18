"use client";

/**
 * MulliganRepsView — the Academy's "Mulligan Reps" hall.
 *
 * Deals a guardrailed opening 7 from the active profile's decks and banks Colton's keep/ship call as
 * one row per hand. Those rows are the teacher signal for the future pilot mulligan agent; Omnath's
 * ingest task merges them into the vault golden-hands corpus (the exe never touches git).
 *
 * Build order: memory/orders/academy-mulligan-panel-runbook.md (frozen 2026-07-17), Colton's verbatim
 * layout: a REAL fanned hand (not text tiles) · Keep/Ship primary · a visually-secondary flag control ·
 * a free-text note (no tag chips — tags are ingest-derived in v1) · Next / Submit · a done counter.
 *
 * BLIND BY DESIGN: no pilot verdict is shown or computed here. Seeing a suggestion before calling it
 * would contaminate the very judgments the corpus exists to capture.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export default function MulliganRepsView({ onBack, fontFamily }) {
  const [decks, setDecks] = useState([]);
  const [deckId, setDeckId] = useState("");        // "" = Random (the runbook's default)
  const [hand, setHand] = useState(null);
  const [verdict, setVerdict] = useState(null);    // "keep" | "ship" | "unplayable"
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);      // honest readback from a sync
  const [session, setSession] = useState(0);
  const [allTime, setAllTime] = useState(0);
  const noteRef = useRef(null);

  const post = useCallback(async (payload) => {
    const r = await fetch("/api/golden-hands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || `Request failed: ${r.status}`);
    return b;
  }, []);

  const deal = useCallback(async (useDeckId) => {
    setBusy(true); setError(null); setStatus(null);
    try {
      const b = await post({ action: "deal", deckId: useDeckId || null });
      setHand(b);
      setVerdict(null);
      setNote("");
    } catch (e) {
      setError(e.message); setHand(null);
    } finally {
      setBusy(false);
    }
  }, [post]);

  // Load the deck picker + the all-time counter, then deal the first hand.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await post({ action: "decks" });
        if (cancelled) return;
        setDecks(b.decks || []);
        setAllTime(b.allTime || 0);
        if ((b.decks || []).length === 0) { setError("No decks saved for this profile — import a deck first."); return; }
        await deal("");
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [post, deal]);

  /** Save the current call as one row, then either deal on (Next) or save+sync (Submit). */
  const save = async ({ thenSync }) => {
    if (!hand || !verdict || busy) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      const b = await post({
        action: "judge",
        judgment: {
          colton: verdict,
          note,
          deck: hand.deck,
          seed: hand.seed,
          lands: hand.lands,
          cards: (hand.cards || []).map((c) => c.name),
        },
      });
      setSession((n) => n + 1);
      setAllTime(b.allTime ?? allTime + 1);

      if (thenSync) {
        const s = await post({ action: "sync" });
        setStatus(s.message || (s.synced ? "Synced ✓" : "Saved locally."));
      }
      await deal(deckId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /** The flag control: mark the hand as one that shouldn't have been dealt, and ask why. */
  const flagUnplayable = () => {
    setVerdict("unplayable");
    setStatus(null);
    requestAnimationFrame(() => noteRef.current?.focus());
  };

  const onPickDeck = (id) => { setDeckId(id); deal(id); };

  const glass = {
    background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)",
  };
  const flagged = verdict === "unplayable";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, padding: 28, overflowY: "auto", fontFamily }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onBack} className="btn btn-secondary btn-sm">← The Academy</button>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-green)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Mulligan reps
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ley-text-dim)" }}>
          {session} this session · {allTime} all-time
        </span>
      </div>

      {/* The nudge (runbook copy) */}
      <div style={{ fontSize: 13, color: "var(--ley-text)", fontStyle: "italic" }}>
        First 7 — the mulligan is free. Be picky.
      </div>

      {error && (
        <div style={{ ...glass, padding: 12, fontSize: 12.5, color: "var(--ley-red)", borderColor: "var(--ley-red)" }}>{error}</div>
      )}

      {/* Deck picker + this hand's facts */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--ley-text-dim)" }} htmlFor="mr-deck">Deck</label>
        <select
          id="mr-deck"
          value={deckId}
          onChange={(e) => onPickDeck(e.target.value)}
          disabled={busy || decks.length === 0}
          style={{ fontFamily, fontSize: 12.5, padding: "5px 8px", background: "var(--ley-surface-2)", color: "var(--ley-text)", border: "1px solid var(--ley-line)", borderRadius: 6 }}
        >
          <option value="">Random</option>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {hand && (
          <span style={{ fontSize: 12.5, color: "var(--ley-text-dim)" }}>
            <strong style={{ color: "var(--ley-text)" }}>{hand.deck}</strong>
            {hand.landsUnknown ? " · land count unavailable" : ` · ${hand.lands} land${hand.lands === 1 ? "" : "s"}`}
          </span>
        )}
        {hand?.landsUnknown && (
          <span style={{ fontSize: 11.5, color: "var(--ley-gold)" }}>
            (card data not synced — the 2–5 guardrail can&rsquo;t run, so this hand is unfiltered)
          </span>
        )}
        {hand?.guardrailExhausted && (
          <span style={{ fontSize: 11.5, color: "var(--ley-gold)" }}>
            (this deck can&rsquo;t make a 2–5 land hand — dealt out of band)
          </span>
        )}
      </div>

      {/* THE HAND — real cards, fanned like a held hand */}
      <div style={{ ...glass, padding: "34px 20px 26px", display: "flex", justifyContent: "center", minHeight: 300 }}>
        {!hand ? (
          <div style={{ alignSelf: "center", fontSize: 12.5, color: "var(--ley-text-dim)" }}>{busy ? "Dealing…" : "No hand."}</div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", paddingLeft: 46 }}>
            {hand.cards.map((c, i) => {
              const mid = (hand.cards.length - 1) / 2;
              const off = i - mid;
              return (
                <div
                  key={`${c.name}-${i}`}
                  title={`${c.name}${c.type_line ? ` — ${c.type_line}` : ""}`}
                  style={{
                    width: 132, marginLeft: -46, transformOrigin: "bottom center",
                    transform: `rotate(${off * 4.5}deg) translateY(${Math.abs(off) * 9}px)`,
                    transition: "transform 140ms ease",
                    borderRadius: 9, overflow: "hidden",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                    background: "var(--ley-surface-2)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = `rotate(${off * 4.5}deg) translateY(${Math.abs(off) * 9 - 22}px)`; e.currentTarget.style.zIndex = "5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = `rotate(${off * 4.5}deg) translateY(${Math.abs(off) * 9}px)`; e.currentTarget.style.zIndex = "auto"; }}
                >
                  {/* The name card sits UNDERNEATH the art, always rendered. Art covers it when it loads;
                      when the image is missing (offline + uncached, or no printing index) the readable
                      card face shows through. Structural, not error-driven — an <img> that is never even
                      requested fires no onError, which would otherwise leave a blank hand. */}
                  <div style={{ position: "relative", aspectRatio: "63 / 88", border: "1px solid var(--ley-line)", borderRadius: 9 }}>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8, fontSize: 11.5, lineHeight: 1.3, color: "var(--ley-text)" }}>
                      {c.name}
                    </div>
                    <img
                      src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                      alt=""
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }}
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The call — Keep / Ship primary, flag deliberately secondary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => setVerdict("keep")}
          disabled={!hand || busy}
          className={verdict === "keep" ? "btn btn-primary" : "btn btn-secondary"}
          style={{ minWidth: 120 }}
        >
          Keep
        </button>
        <button
          onClick={() => setVerdict("ship")}
          disabled={!hand || busy}
          className={verdict === "ship" ? "btn btn-primary" : "btn btn-secondary"}
          style={{ minWidth: 120 }}
        >
          Ship
        </button>
        <button
          onClick={flagUnplayable}
          disabled={!hand || busy}
          style={{
            marginLeft: 8, fontSize: 11, padding: "4px 9px", cursor: "pointer",
            background: "transparent", borderRadius: 5,
            border: `1px solid ${flagged ? "var(--ley-gold)" : "var(--ley-line)"}`,
            color: flagged ? "var(--ley-gold)" : "var(--ley-text-dim)",
          }}
        >
          {flagged ? "⚑ flagged unplayable" : "flag unplayable"}
        </button>
      </div>

      {/* The note */}
      <textarea
        ref={noteRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={flagged ? "Why is it unplayable?" : "Thoughts on this hand? (optional)"}
        style={{
          fontFamily, fontSize: 13, padding: 10, resize: "vertical",
          background: "var(--ley-surface-2)", color: "var(--ley-text)",
          border: `1px solid ${flagged ? "var(--ley-gold)" : "var(--ley-line)"}`, borderRadius: 8,
        }}
      />

      {/* Commit */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => save({ thenSync: false })} disabled={!hand || !verdict || busy} className="btn btn-primary">
          {busy ? "…" : flagged ? "Save flag & next" : "Next"}
        </button>
        <button onClick={() => save({ thenSync: true })} disabled={!hand || !verdict || busy} className="btn btn-secondary">
          Submit &amp; sync
        </button>
        {!verdict && hand && <span style={{ fontSize: 11.5, color: "var(--ley-text-dim)" }}>Call it first — Keep or Ship.</span>}
        {status && <span style={{ fontSize: 11.5, color: "var(--ley-green)" }}>{status}</span>}
      </div>
    </div>
  );
}
