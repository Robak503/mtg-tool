"use client";

/**
 * PodBalanceView — the full "Pod Balance" surface in The Proving Grounds
 * (replaces the old PodBalanceModal). Sees EVERY deck in the tool across all
 * profiles, lets the user pick up to 4 (a pod), and runs the deterministic
 * local power ranker over them — power level, official-WotC bracket (1-5),
 * CRISPI axes, Game Changers, and a balance verdict. All local: the picker
 * list comes from GET /api/self-play, the comparison from POST /api/pod-balance
 * with { deckIds, allProfiles:true } (deck bodies load server-side), and
 * single-deck ratings from POST /api/power-rank. Zero network, zero AI.
 *
 * PROPS (the orchestrator wires these in MTGAssistant):
 *   savedDecks   — the ACTIVE profile's deck array from useDeckStore. Supplies
 *                  cards for the per-row "Rate" action and stored
 *                  memory.powerRank ratings for active-profile rows.
 *   onSaveRating — (deckId, powerRank) => void. Persist a fresh machine rating
 *                  into the ACTIVE profile deck's memory (powerRank shape:
 *                  { powerLevel, bracket, bracketLabel, ratedAt }). Optional —
 *                  when absent, ratings still display for the session.
 *   onAddDeck    — () => void. Navigate to the deck import view.
 *   cfg          — active agent color config (cfg.color = accent); optional.
 *   fontFamily   — the active font.
 *
 * HONESTY NOTE on other-profile ratings: stored ratings live in each profile's
 * own decks.local.json, and this client only holds the ACTIVE profile's decks
 * (savedDecks). Other profiles' rows therefore show "unrated" until they appear
 * in a comparison result this session — there is no Rate button on them, and
 * their session rating is NOT persisted to their profile (no cross-profile
 * write path exists client-side, by design).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

const MAX_POD = 4;

const AXES = [
  ["speed", "Speed"],
  ["consistency", "Consist."],
  ["interaction", "Interact."],
  ["resilience", "Resil."],
  ["manaQuality", "Mana"],
];

// Token-composed semantic colors (styleguide: never hand-hex).
const bracketColor = (bracket) =>
  bracket >= 4 ? "var(--ley-red)" : bracket === 3 ? "var(--ley-gold)" : "var(--ley-green)";
const severityColor = (severity) =>
  severity === "lopsided" ? "var(--ley-red)" : severity === "balanced" ? "var(--ley-green)" : "var(--ley-gold)";

/** Group the flat picker list [{id,name,profile}] by profile, alphabetical. */
function groupDecksByProfile(decks) {
  const groups = new Map();
  for (const d of decks) {
    const key = d.profile || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()]
    .map(([profile, list]) => ({ profile, decks: list }))
    .sort((a, b) => a.profile.localeCompare(b.profile));
}

/** "6.8 · Bracket 3" from a powerRank object, or null when unrated. */
function ratingText(powerRank) {
  if (!powerRank || !Number.isFinite(powerRank.powerLevel)) return null;
  const bracket = Number.isFinite(powerRank.bracket) ? ` · Bracket ${powerRank.bracket}` : "";
  return `${powerRank.powerLevel}${bracket}`;
}

function AxisBars({ axes }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
      {AXES.map(([key, label]) => {
        const value = axes?.[key] ?? 0;
        return (
          <div key={key} style={{ fontSize: 9, color: "var(--ley-text-faint)", textAlign: "center" }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{ width: 9, height: 9, borderRadius: 2, background: i < value ? "var(--ley-gold)" : "var(--ley-line)" }}
                />
              ))}
            </div>
            {label}
          </div>
        );
      })}
    </div>
  );
}

export default function PodBalanceView({ savedDecks = [], onSaveRating, onAddDeck, cfg, fontFamily }) {
  const accent = cfg?.color || "var(--ley-green)";

  // ── Cross-profile picker list ──
  const [pickerDecks, setPickerDecks] = useState([]);
  const [pickerLoad, setPickerLoad] = useState(true);
  const [pickerError, setPickerError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Ratings learned THIS session (Rate button + comparison results) — covers
  // other-profile rows, whose stored ratings this client can't read.
  const [sessionRatings, setSessionRatings] = useState({});
  const [ratingBusy, setRatingBusy] = useState(() => new Set());
  const [rateError, setRateError] = useState(null);

  // ── Comparison state ──
  const [compare, setCompare] = useState({ status: "idle", decks: [], comparison: null, error: null });

  const savedById = useMemo(() => new Map(savedDecks.map((d) => [d.id, d])), [savedDecks]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => groupDecksByProfile(pickerDecks), [pickerDecks]);
  const podFull = selectedIds.length >= MAX_POD;

  const loadPicker = useCallback(async () => {
    setPickerLoad(true);
    setPickerError(null);
    try {
      const resp = await fetch("/api/self-play", { cache: "no-store" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setPickerError(data?.error || `Could not load decks (status ${resp.status}).`);
      } else {
        const list = Array.isArray(data?.decks) ? data.decks : [];
        setPickerDecks(list);
        // Drop selections for decks that no longer exist.
        const ids = new Set(list.map((d) => d.id));
        setSelectedIds((prev) => prev.filter((id) => ids.has(id)));
      }
    } catch (e) {
      setPickerError(e?.message || "Could not load decks.");
    } finally {
      setPickerLoad(false);
    }
  }, []);

  useEffect(() => { loadPicker(); }, [loadPicker]);

  const toggleDeck = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_POD ? prev : [...prev, id]
    );

  /** Best-known rating for a picker row: stored (active profile) → session → null. */
  const ratingFor = (id) => {
    const stored = savedById.get(id)?.memory?.powerRank;
    if (stored && Number.isFinite(stored.powerLevel)) return stored;
    return sessionRatings[id] || null;
  };

  /** Remember a fresh rating for the session and persist it when the deck is ours. */
  const recordRating = useCallback((deckId, powerRank) => {
    setSessionRatings((prev) => ({ ...prev, [deckId]: powerRank }));
    if (typeof onSaveRating === "function" && savedById.has(deckId)) {
      onSaveRating(deckId, powerRank);
    }
  }, [onSaveRating, savedById]);

  // Rate ONE active-profile deck via the local power ranker.
  const rateDeck = async (deckId) => {
    const deck = savedById.get(deckId);
    if (!deck || ratingBusy.has(deckId)) return;
    const cards = (deck.cards || []).filter((c) => c.section !== "Tokens" && c.section !== "Sideboard");
    if (!cards.length) {
      setRateError(`"${deck.name}" has no cards to rate.`);
      return;
    }
    setRateError(null);
    setRatingBusy((prev) => new Set(prev).add(deckId));
    try {
      const resp = await fetch("/api/power-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards, maxAlmost: 0 }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || !Number.isFinite(result?.powerLevel)) {
        throw new Error(result?.error || `Power ranking failed (status ${resp.status}).`);
      }
      recordRating(deckId, {
        powerLevel: result.powerLevel,
        bracket: result.bracket,
        bracketLabel: result.bracketLabel || "",
        ratedAt: new Date().toISOString(),
      });
    } catch (e) {
      setRateError(`Rating "${deck.name}" failed: ${e?.message || e}`);
    } finally {
      setRatingBusy((prev) => {
        const next = new Set(prev);
        next.delete(deckId);
        return next;
      });
    }
  };

  // Compare the selected pod — deck bodies resolve server-side across profiles.
  const runCompare = async () => {
    if (!selectedIds.length || compare.status === "loading") return;
    setCompare({ status: "loading", decks: [], comparison: null, error: null });
    try {
      const resp = await fetch("/api/pod-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds: selectedIds, allProfiles: true }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || body.ready === false) {
        setCompare({ status: "error", decks: [], comparison: null, error: body.error || "Pod balance failed." });
        return;
      }
      const ranked = Array.isArray(body.decks) ? body.decks : [];
      setCompare({ status: "ready", decks: ranked, comparison: body.comparison || null, error: null });
      // Every comparison is a fresh rating — remember it for the session and
      // persist it for ACTIVE-profile decks (recordRating skips the rest).
      const ratedAt = new Date().toISOString();
      for (const d of ranked) {
        if (d.id && Number.isFinite(d.powerLevel)) {
          recordRating(d.id, { powerLevel: d.powerLevel, bracket: d.bracket, bracketLabel: d.bracketLabel || "", ratedAt });
        }
      }
    } catch (e) {
      setCompare({ status: "error", decks: [], comparison: null, error: e?.message || "Pod balance request failed." });
    }
  };

  // ── Shared style helpers (modeled on SimCenter) ──
  const label = (text) => (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{text}</span>
  );

  const empty = !pickerLoad && !pickerError && pickerDecks.length === 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily, position: "relative" }}>
      {/* Header */}
      <header
        className="ley-glass"
        style={{ padding: "12px 20px", borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--ley-text)", display: "inline-flex", alignItems: "center", gap: 9 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v18" /><path d="M5 7h14" /><path d="M5 7l-2.5 6a3.5 3.5 0 0 0 5 0L5 7z" /><path d="M19 7l-2.5 6a3.5 3.5 0 0 0 5 0L19 7z" /><path d="M8 21h8" />
          </svg>
          Pod Balance
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <button type="button" onClick={loadPicker} disabled={pickerLoad} className="btn btn-ghost btn-sm">
            ↻ Refresh decks
          </button>
          {typeof onAddDeck === "function" && (
            <button type="button" onClick={onAddDeck} className="btn btn-secondary btn-sm">
              + Add a deck
            </button>
          )}
        </span>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ fontSize: 13.5, color: "var(--ley-text)", lineHeight: 1.55, margin: 0 }}>
            Pick up to 4 decks from anywhere in the tool and see how the table stacks up: each
            deck&rsquo;s power level, official bracket, and Game Changers, plus a fairness verdict.
            Everything runs locally off the bundled data — no network, no AI.
          </p>

          {/* ── Empty state ── */}
          {empty && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0" }}>
              <span style={{ fontSize: 13, color: "var(--ley-text-faint)" }}>
                No decks anywhere in the tool yet — add one and it gets a power rating automatically.
              </span>
              {typeof onAddDeck === "function" && (
                <button type="button" onClick={onAddDeck} className="btn btn-primary">+ Add a deck</button>
              )}
            </div>
          )}

          {/* ── Deck picker (cross-profile, grouped) ── */}
          {!empty && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                {label(`Decks (${selectedIds.length}/${MAX_POD} selected, across all profiles)`)}
                {podFull && (
                  <span style={{ fontSize: 11, color: "var(--ley-gold)" }}>Pod is full — deselect a deck to swap.</span>
                )}
              </div>

              {pickerLoad ? (
                <div style={mutedBox()}>Loading decks from every profile…</div>
              ) : pickerError ? (
                <div style={errorBox()}>⚠ {pickerError}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {groups.map((g) => (
                    <div key={g.profile} style={{ border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                      <div style={{ padding: "7px 12px", background: "var(--ley-surface-1)", borderBottom: "1px solid var(--ley-line)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ley-text)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          {g.profile} <span style={{ color: "var(--ley-text-faint)", fontWeight: 400 }}>· {g.decks.length} deck{g.decks.length === 1 ? "" : "s"}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
                        {g.decks.map((d) => {
                          const on = selectedSet.has(d.id);
                          const mine = savedById.has(d.id);
                          const rating = ratingFor(d.id);
                          const ratingLabel = ratingText(rating);
                          const busy = ratingBusy.has(d.id);
                          return (
                            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => toggleDeck(d.id)}
                                disabled={!on && podFull}
                                className="ley-row"
                                style={{
                                  flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                                  borderRadius: "var(--r-md)", borderColor: on ? "var(--ley-green)" : "transparent",
                                  background: on ? "var(--ley-green-dim)" : "transparent", color: "var(--ley-text)",
                                  cursor: !on && podFull ? "default" : "pointer", textAlign: "left", fontFamily: "inherit",
                                  opacity: !on && podFull ? 0.45 : 1,
                                }}
                              >
                                <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${on ? "var(--ley-green)" : "var(--ley-text-faint)"}`, background: on ? "var(--ley-green)" : "transparent", color: "var(--ley-on-green)", fontSize: 11, lineHeight: "13px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                                <span style={{ flexShrink: 0, fontSize: 11, color: ratingLabel ? "var(--ley-text-dim)" : "var(--ley-text-faint)" }}>
                                  {d.profile} · {ratingLabel || "unrated"}
                                </span>
                              </button>
                              {/* Rate = active-profile rows only: we hold their cards + a persist
                                  path. Other profiles' ratings appear via comparison results. */}
                              {mine && !ratingLabel && (
                                <button
                                  type="button"
                                  onClick={() => rateDeck(d.id)}
                                  disabled={busy}
                                  className={`btn btn-secondary btn-sm${busy ? " btn-loading" : ""}`}
                                  style={{ flexShrink: 0 }}
                                >
                                  {busy ? "Rating…" : "Rate"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {rateError && <div style={errorBox()}>⚠ {rateError}</div>}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={runCompare}
                  disabled={selectedIds.length < 1 || compare.status === "loading"}
                  className={`btn btn-primary${compare.status === "loading" ? " btn-loading" : ""}`}
                >
                  {compare.status === "loading"
                    ? "Ranking…"
                    : selectedIds.length
                    ? `Compare ${selectedIds.length} deck${selectedIds.length === 1 ? "" : "s"}`
                    : "Compare decks"}
                </button>
                {selectedIds.length === 1 && (
                  <span style={{ fontSize: 11, color: "var(--ley-text-faint)" }}>
                    One deck shows its solo bracket breakdown — pick 2+ for a fairness verdict.
                  </span>
                )}
              </div>
            </section>
          )}

          {/* ── Results ── */}
          {compare.status === "error" && <div style={errorBox()}>⚠ {compare.error}</div>}

          {compare.status === "ready" && (
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {compare.comparison && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--ley-surface-2)", border: `1px solid ${severityColor(compare.comparison.severity)}`, fontSize: 12.5, lineHeight: 1.55 }}>
                  <span style={{ color: severityColor(compare.comparison.severity), fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
                    {compare.comparison.severity}
                  </span>
                  <div style={{ marginTop: 4, color: "var(--ley-text)" }}>{compare.comparison.verdict}</div>
                  <div style={{ marginTop: 4, fontSize: 10, color: "var(--ley-text-faint)" }}>
                    Bracket spread {compare.comparison.bracketSpread} · power spread {compare.comparison.powerSpread}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {compare.decks.map((deck, i) => (
                  <div key={deck.id || i} style={{ border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)", background: "var(--ley-surface-2)", padding: "12px 14px", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</span>
                        {deck.profile && (
                          <span style={{ display: "block", fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{deck.profile}</span>
                        )}
                      </span>
                      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--ley-text-faint)" }}>power {deck.powerLevel}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ley-on-green)", background: bracketColor(deck.bracket), borderRadius: 4, padding: "2px 7px" }}>
                          B{deck.bracket} · {deck.bracketLabel}
                        </span>
                      </span>
                    </div>
                    <AxisBars axes={deck.axes} />
                    <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--ley-text-faint)" }}>Game Changers ({deck.gameChangers?.length ?? 0}): </span>
                      <span style={{ color: deck.gameChangers?.length ? "var(--ley-text)" : "var(--ley-text-faint)" }}>
                        {deck.gameChangers?.length ? deck.gameChangers.join(", ") : "none"}
                      </span>
                    </div>
                    {deck.massLandDenial?.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--ley-red)", marginTop: 3 }}>Mass land denial: {deck.massLandDenial.join(", ")}</div>
                    )}
                    {deck.extraTurns?.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--ley-gold)", marginTop: 3 }}>Extra turns: {deck.extraTurns.join(", ")}</div>
                    )}
                    {deck.confidence === "low" && (
                      <div style={{ fontSize: 10, color: "var(--ley-text-faint)", marginTop: 4 }}>
                        Low confidence — {deck.unresolvedCount} card{deck.unresolvedCount === 1 ? "" : "s"} didn&apos;t resolve locally{deck.totalCards ? ` of ${deck.totalCards}` : ""}.
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--ley-text-faint)", marginTop: "auto", paddingTop: 8, lineHeight: 1.4 }}>{deck.bracketReason}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Local style helpers (kept module-scoped so the JSX stays readable) ──
function mutedBox() {
  return {
    fontSize: 12, color: "var(--ley-text-faint)", fontStyle: "italic", padding: "8px 10px",
    background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-md)",
  };
}
function errorBox() {
  return {
    padding: "10px 12px", background: "var(--ley-red-dim)", border: "1px solid var(--ley-red)",
    color: "var(--ley-red)", borderRadius: "var(--r-md)", fontSize: 12.5, lineHeight: 1.5,
  };
}
