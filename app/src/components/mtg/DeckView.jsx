/**
 * DeckView — the center "deck" view (rendered by MTGAssistant when
 * centerView === "deck"): the commander + 99 list, deck stats, the agent deck
 * notes, the Garfield goldfish (solo playtest) controls, and game recording.
 *
 * Aether redesign: a glass-panel dashboard — a Playfair ribbon header, stat
 * cards, a 12-col grid (deck identity + decklist), then glass module panels.
 * All handlers, props, and API calls are unchanged from the prior version;
 * only the layout/visual treatment differs.
 *
 * The terse style props are the shared vocabulary documented in
 * MTGAssistant.jsx:
 *   bg / bg3   background shades        cfg          active agent theme object
 *   colors     palette object          fontFamily   body font-family (Inter)
 *   pb         primary-button style fn  setTooltip   card hover-preview setter
 */
import { AGENTS } from "../../lib/agents";
import { useMemo, useState, useEffect } from "react";
import GarfieldPanel from "./GarfieldPanel";
import { restoreDeckCards, isRestorable, createSnapshotEntry, relabelSnapshot, diffDeckCards, cardsFromEntry } from "../../lib/deckApply";

export default function DeckView({
  activeDeck,
  agentNotes,
  askDeckAgent,
  bg,
  bg3,
  cfg,
  colors,
  commanderText,
  deckActionPrompts,
  deckCards,
  deckMemory,
  deleteGame,
  exportDeck,
  ownerName,
  fontFamily,
  gameCount,
  gameNotes,
  gameOpponents,
  gameResult,
  goldfishResult,
  goldfishRunning,
  handleChipHover,
  hasData,
  histories,
  loadDeckData,
  mainCount,
  mobile,
  pb,
  prepArbiterQuestion,
  recordGame,
  runGoldfish,
  saveLatestAgentReply,
  saveLatestAgentArtifact,
  sending,
  setCenterView,
  setGameNotes,
  setGameOpponents,
  setGameResult,
  setTooltip,
  tokenCount,
  tokenEntries,
  updateActiveDeck,
  updateActiveMemory,
  updateAgentNote,
}) {
  const { LINE, TEXT, MUTED, GOLD } = colors;
  const BG = bg;
  const BG3 = bg3;
  const F = fontFamily;
  // Aether type + accent. GOLD token resolves to the cyan hero (#00dbe7).
  const FD = "var(--font-display), Georgia, 'Palatino Linotype', serif";
  const FM = "var(--font-mono), 'Consolas', monospace";
  const CY = GOLD;
  // shared visual helpers
  const glass = { background: "var(--glass)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid var(--hairline)", borderRadius: 10 };
  const panel = { ...glass, padding: 14, marginBottom: 16 };
  const dlabel = { fontFamily: FM, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED };
  const stitle = { fontFamily: FD, fontSize: 18, fontWeight: 600, color: TEXT, margin: 0 };
  const fieldStyle = { padding: "8px 10px", background: "var(--surface-container-lowest)", border: `1px solid var(--hairline)`, borderRadius: 6, color: TEXT, fontSize: 13, fontFamily: F, textTransform: "none", letterSpacing: 0 };
  const labelWrap = { display: "flex", flexDirection: "column", gap: 5, ...dlabel };

  const currentDriftCards = useMemo(
    () => new Set(deckCards.filter(card => card.section !== "Tokens").map(card => `${card.qty} ${card.name}`)),
    [deckCards]
  );
  const artifactDrift = (entry) => {
    if (!entry?.snapshot?.cardNames) return null;
    const saved = new Set(entry.snapshot.cardNames);
    const added = [...currentDriftCards].filter(card => !saved.has(card));
    const removed = [...saved].filter(card => !currentDriftCards.has(card));
    return { added, removed };
  };

  const snapshots = deckMemory.snapshots || [];
  // Capture a full, lossless version of the deck (the whole cards array), so
  // every manual snapshot is restorable — not just Karn-apply ones. An optional
  // label names the version ("after game night"); blank = unlabeled.
  const saveSnapshot = () => {
    const label = (typeof window !== "undefined" ? window.prompt("Name this version (optional):", "") : "") || "";
    const entry = createSnapshotEntry(activeDeck, {
      id: globalThis.crypto?.randomUUID?.() || `snap-${Date.now()}`,
      date: new Date().toLocaleString(),
      label,
    });
    updateActiveMemory({ snapshots: [entry, ...snapshots].slice(0, 20) });
  };
  const deleteSnapshot = (id) => {
    updateActiveMemory({ snapshots: snapshots.filter(entry => entry.id !== id) });
  };
  const relabel = (entry) => {
    if (typeof window === "undefined") return;
    const next = window.prompt("Rename this version:", entry.label || "");
    if (next === null) return; // cancelled
    updateActiveMemory({ snapshots: relabelSnapshot(snapshots, entry.id, next) });
  };
  // Restore the deck's cards from an apply-snapshot (lossless — undoes a Karn
  // apply). Only available for snapshots that captured the full cards array.
  const restoreSnapshot = (entry) => {
    if (!isRestorable(entry)) return;
    if (!confirm(`Restore the deck to this snapshot? Current card list will be replaced.${entry.reason ? `\n\n(${entry.reason})` : ""}`)) return;
    updateActiveDeck(deck => restoreDeckCards(deck, entry));
  };

  // ── Compare any two versions (H2) ──
  // "current" is a sentinel for the live deck; otherwise a snapshot id. Default
  // From = newest saved version, To = current deck (i.e. "what changed since").
  const [compareOpen, setCompareOpen] = useState(false);
  const [cmpFrom, setCmpFrom] = useState("");
  const [cmpTo, setCmpTo] = useState("current");
  const versionLabel = (entry) => entry.label || entry.reason || entry.date || "version";
  const cardsForSel = (sel) =>
    sel === "current" ? (activeDeck?.cards || []) : cardsFromEntry(snapshots.find(s => s.id === sel));
  const compareDiff = useMemo(() => {
    if (!compareOpen) return null;
    const from = cmpFrom || snapshots[snapshots.length - 1]?.id;
    if (!from) return null;
    return diffDeckCards(cardsForSel(from), cardsForSel(cmpTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareOpen, cmpFrom, cmpTo, snapshots, activeDeck]);

  const [recs, setRecs] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const loadRecs = async () => {
    if (!deckCards.length || recsLoading) return;
    setRecsLoading(true);
    try {
      const resp = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: deckCards }),
      });
      const data = await resp.json();
      setRecs(resp.ok ? data : { ready: false, error: data.error || "Recommendations failed." });
    } catch (e) {
      setRecs({ ready: false, error: e.message });
    } finally {
      setRecsLoading(false);
    }
  };

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMode, setReportMode] = useState("full"); // "full" | "rule0"

  // Cost-to-finish for THIS deck from the collection (E3). Advisory; refetches
  // when the deck changes (so an applied Karn add updates the "own X/Y" line).
  const [deckCost, setDeckCost] = useState(null);
  // Signature of the card list (name+qty+section), so the cost refetches on ANY
  // content change — including a qty-only edit that leaves the array length the
  // same (e.g. applying a Karn add/cut of a card already in the deck).
  const deckSig = useMemo(
    () => (deckCards || []).map(c => `${c.name}:${c.qty}:${c.section}`).join("|"),
    [deckCards],
  );
  useEffect(() => {
    let cancelled = false;
    setDeckCost(null);
    if (!activeDeck?.id) return;
    (async () => {
      try {
        const resp = await fetch(`/api/collection/deck-costs?deckId=${encodeURIComponent(activeDeck.id)}`);
        if (!resp.ok) return;
        const body = await resp.json();
        if (!cancelled) setDeckCost(body.summary || null);
      } catch { /* advisory — collection cost is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [activeDeck?.id, deckSig]);
  const loadReport = async () => {
    if (!deckCards.length || reportLoading) return;
    setReportLoading(true);
    try {
      const resp = await fetch("/api/deck-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: deckCards, deckName: activeDeck?.name }),
      });
      const data = await resp.json();
      setReport(resp.ok ? data : { ready: false, error: data.error || "Deck report failed." });
    } catch (e) {
      setReport({ ready: false, error: e.message });
    } finally {
      setReportLoading(false);
    }
  };
  const copyReport = () => {
    const text = report?.ready ? (reportMode === "rule0" ? report.rule0 : report.markdown) : "";
    if (text && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  // Section header: mono data-label + optional "local · free" tag + action slot.
  const SectionHead = ({ title, tag, children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ ...dlabel, color: CY }}>{title}</span>
      {tag && <span style={{ fontFamily: FM, fontSize: 10, color: MUTED }}>{tag}</span>}
      {children}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mobile ? "16px 14px" : "20px 28px" }}>
      {/* ── Ribbon header ── */}
      <div style={{ paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid var(--hairline-10)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: FD, fontSize: mobile ? 30 : 44, fontWeight: 700, letterSpacing: "-0.02em", color: CY, margin: 0, lineHeight: 1.1 }}>
              {activeDeck?.name || "No deck loaded"}
            </h1>
            <div style={{ ...dlabel, marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              {commanderText && <span>{commanderText}</span>}
              <span style={{ opacity: 0.7 }}>
                {deckMemory.owner || ownerName || "Colton"}
                {deckMemory.updatedAt ? ` · Updated ${new Date(deckMemory.updatedAt).toLocaleDateString()}` : ""}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {activeDeck && (
              <>
                <button onClick={() => askDeckAgent("karn", deckActionPrompts.karn)} disabled={sending} style={{ ...pb(true, true), background: AGENTS.karn.color, color: "#0c0b0a" }}>Karn Upgrade Plan</button>
                <button onClick={() => askDeckAgent("tibalt", deckActionPrompts.tibalt)} disabled={sending} style={{ ...pb(true, true), background: AGENTS.tibalt.color, color: "#0c0b0a" }}>Tibalt Roast</button>
                <button onClick={() => askDeckAgent("jace", deckActionPrompts.jace)} disabled={sending} style={{ ...pb(true, true), background: AGENTS.jace.color, color: "#0c0b0a" }}>Jace Table Briefing</button>
                <button onClick={prepArbiterQuestion} style={pb(false, true)}>Prep Arbiter Question</button>
              </>
            )}
            <button onClick={() => setCenterView("chat")} style={pb(true, true)}>Chat</button>
            <button onClick={exportDeck} style={pb(false, true)}>Export</button>
          </div>
        </div>
      </div>

      {activeDeck && (
        <>
          {/* ── Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {[
              ["Cards", mainCount],
              ["Tokens", tokenCount],
              ["Games", gameCount],
              ["Power", deckMemory.powerLevel || "Unset"],
            ].map(([label, value]) => (
              <div key={label} className="aether-glass-hover" style={{ ...glass, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div style={dlabel}>{label}</div>
                <div style={{ fontFamily: FD, fontSize: 30, fontWeight: 600, color: CY, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {deckCost && (
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
              {deckCost.complete
                ? <span style={{ color: "#6fbf73" }}>✓ You own every card in this deck ({deckCost.ownedCards}/{deckCost.totalCards}).</span>
                : <>From your collection: own <strong style={{ color: TEXT }}>{deckCost.ownedCards}/{deckCost.totalCards}</strong> ({deckCost.ownedPct}%) · <strong style={{ color: CY }}>${deckCost.costToFinish.toFixed(2)}</strong> to finish{deckCost.unpricedCount > 0 ? ` (+${deckCost.unpricedCount} unpriced)` : ""}</>}
            </div>
          )}

          {tokenEntries.length > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(254,216,58,0.08)", border: "1px solid rgba(254,216,58,0.25)", color: "var(--tertiary-container)", fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
              Tokens saved separately: {tokenEntries.join(", ")}. Karn and Tibalt will ignore these for Commander deck size, curve, legality, and normal card counts.
            </div>
          )}

          {/* ── Row: deck identity (left) + decklist (right) ── */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.35fr) minmax(0,1fr)", gap: 16, marginBottom: 16 }}>
            {/* Deck identity panel */}
            <div style={panel}>
              <SectionHead title="Deck Identity" />
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.2fr .8fr .7fr", gap: 10, marginBottom: 10 }}>
                <label style={labelWrap}>
                  Deck Name
                  <input value={activeDeck.name} onChange={e => updateActiveDeck(d => ({ ...d, name: e.target.value }))} style={fieldStyle} />
                </label>
                <label style={labelWrap}>
                  Owner
                  <input value={deckMemory.owner} onChange={e => updateActiveMemory({ owner: e.target.value })} placeholder={ownerName || "Colton"} style={fieldStyle} />
                </label>
                <label style={labelWrap}>
                  Tags
                  <input value={deckMemory.tags} onChange={e => updateActiveMemory({ tags: e.target.value })} placeholder="tokens, aristocrats, casual" style={fieldStyle} />
                </label>
                <label style={labelWrap}>
                  Power
                  <input value={deckMemory.powerLevel} onChange={e => updateActiveMemory({ powerLevel: e.target.value })} placeholder="7, casual, cEDH" style={fieldStyle} />
                </label>
              </div>
              <label style={{ ...labelWrap, marginBottom: 12 }}>
                Deck Memory
                <textarea value={deckMemory.notes} onChange={e => updateActiveMemory({ notes: e.target.value })}
                  placeholder="Game plan, common problems, cards to test, meta notes, changes you want Karn/Tibalt/Jace to remember..."
                  style={{ ...fieldStyle, minHeight: 84, fontSize: 12, resize: "vertical", lineHeight: 1.55 }} />
              </label>
              <label style={labelWrap}>
                Board / Rules Snapshot
                <textarea value={deckMemory.boardSnapshot || ""} onChange={e => updateActiveMemory({ boardSnapshot: e.target.value })}
                  placeholder="Current battlefield, graveyards, exile, stack, active player, turn/phase, commander tax, counters, and any rule-sensitive state..."
                  style={{ ...fieldStyle, minHeight: 70, fontSize: 12, resize: "vertical", lineHeight: 1.55 }} />
              </label>
            </div>

            {/* Decklist panel (art-bleed rows) */}
            <div style={{ ...panel, padding: 0, display: "flex", flexDirection: "column", maxHeight: mobile ? "none" : 620 }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid var(--hairline-10)`, background: "var(--surface-dim)", borderRadius: "10px 10px 0 0" }}>
                <h3 style={stitle}>Decklist <span style={{ fontFamily: F, fontSize: 13, color: MUTED, fontWeight: 400 }}>({mainCount})</span></h3>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                {["Commander", "Mainboard", "Sideboard", "Tokens"].map(g => {
                  const grp = deckCards.filter(c => c.section === g); if (!grp.length) return null;
                  return (
                    <div key={g} style={{ marginBottom: 10 }}>
                      <div style={{ ...dlabel, color: CY, padding: "4px 8px", marginBottom: 4, borderBottom: `1px solid rgba(0,242,255,0.2)` }}>
                        {g} ({grp.reduce((s, c) => s + c.qty, 0)})
                      </div>
                      {grp.map((c, i) => (
                        <div key={i} className="aether-row" style={{ display: "flex", gap: 10, padding: "0 10px", height: 38, alignItems: "center", borderRadius: 6, cursor: "pointer" }}
                          onMouseEnter={e => handleChipHover(c.name, e)} onMouseLeave={() => setTooltip(null)}
                          onClick={() => window.open(`https://scryfall.com/search?q=${encodeURIComponent('"' + c.name + '"')}`, "_blank")}>
                          <span style={{ fontFamily: FM, color: MUTED, fontSize: 12, width: 22, textAlign: "center", flexShrink: 0 }}>{c.qty}</span>
                          <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {!deckCards.length && <div style={{ fontSize: 12, color: MUTED, textAlign: "center", padding: 20 }}>No cards in this deck yet.</div>}
              </div>
            </div>
          </div>

          {/* ── Agent action prompts moved to ribbon; Saved Agent Notes panel ── */}
          <div style={panel}>
            <SectionHead title="Saved Agent Notes" />
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              {[
                ["karn", "Upgrade notes, cuts, adds, testing plan"],
                ["tibalt", "Roast takeaways and identity problems"],
                ["jace", "Table briefing and sequencing reminders"],
                ["arbiter", "Rules interactions to investigate"],
              ].map(([ak, placeholder]) => (
                <div key={ak} style={{ background: "var(--surface-container-lowest)", border: `1px solid var(--hairline)`, borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontFamily: FM, fontSize: 12, color: AGENTS[ak].color, fontWeight: 600 }}>{AGENTS[ak].name}</span>
                    <button onClick={() => saveLatestAgentReply(ak)} disabled={!histories[ak]?.some(m => m.role === "assistant")}
                      style={{ ...pb(false, true), marginLeft: "auto", fontSize: 10, padding: "4px 7px", opacity: histories[ak]?.some(m => m.role === "assistant") ? 1 : 0.45 }}>
                      Save Latest
                    </button>
                    {(ak === "karn" || ak === "tibalt") && (
                      <button onClick={() => saveLatestAgentArtifact(ak)} disabled={!histories[ak]?.some(m => m.role === "assistant")}
                        style={{ ...pb(false, true), fontSize: 10, padding: "4px 7px", opacity: histories[ak]?.some(m => m.role === "assistant") ? 1 : 0.45 }}>
                        Save {ak === "karn" ? "Plan" : "Roast"}
                      </button>
                    )}
                    <button onClick={() => updateAgentNote(ak, "")} style={{ ...pb(false, true), fontSize: 10, padding: "4px 7px" }}>Clear</button>
                  </div>
                  <textarea value={agentNotes[ak] || ""} onChange={e => updateAgentNote(ak, e.target.value)}
                    placeholder={placeholder}
                    style={{ width: "100%", minHeight: 92, padding: "8px 9px", background: "var(--glass)", border: `1px solid var(--hairline)`, borderRadius: 5, color: TEXT, fontSize: 11, fontFamily: F, resize: "vertical", lineHeight: 1.5 }} />
                </div>
              ))}
            </div>
          </div>

          {((deckMemory.karnPlans || []).length > 0 || (deckMemory.tibaltRoasts || []).length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[
                ["Karn Plan History", deckMemory.karnPlans || [], AGENTS.karn.color],
                ["Tibalt Roast History", deckMemory.tibaltRoasts || [], AGENTS.tibalt.color],
              ].map(([title, entries, color]) => (
                <div key={title} style={{ ...panel, marginBottom: 0 }}>
                  <div style={{ ...dlabel, marginBottom: 7 }}>{title}</div>
                  {!entries.length && <div style={{ fontSize: 11, color: MUTED }}>Nothing saved yet.</div>}
                  {entries.slice(0, 3).map(entry => {
                    const drift = artifactDrift(entry);

                    return (
                      <details key={entry.id} style={{ borderTop: `1px solid var(--hairline-10)`, padding: "7px 0" }}>
                        <summary style={{ cursor: "pointer", color: TEXT, fontSize: 11, lineHeight: 1.35 }}>
                          <span style={{ color, fontWeight: 700 }}>{entry.date}</span> - {entry.summary}
                        </summary>
                        {entry.snapshot && (
                          <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4, marginTop: 7 }}>
                            Snapshot: {entry.snapshot.commander} | {entry.snapshot.mainCount} cards | {entry.snapshot.tokenCount} tokens
                          </div>
                        )}
                        {drift && (
                          <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4, marginTop: 5 }}>
                            Since saved: {drift.added.length} added / {drift.removed.length} removed
                            {(drift.added.length > 0 || drift.removed.length > 0) && (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: "pointer", color }}>View deck drift</summary>
                                {drift.added.length > 0 && <div>Added: {drift.added.slice(0, 12).join(", ")}</div>}
                                {drift.removed.length > 0 && <div>Removed: {drift.removed.slice(0, 12).join(", ")}</div>}
                              </details>
                            )}
                          </div>
                        )}
                        {entry.parsed && (
                          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                            {[
                              ["Cuts", entry.parsed.cuts],
                              ["Adds", entry.parsed.adds],
                              ["Maybe", entry.parsed.maybeBoard],
                              ["Testing", entry.parsed.testingPlan],
                            ].filter(([, items]) => items?.length).map(([label, items]) => (
                              <div key={label} style={{ fontSize: 11, lineHeight: 1.45 }}>
                                <span style={{ color, fontWeight: 700 }}>{label}: </span>
                                <span style={{ color: MUTED }}>{items.slice(0, 10).join(", ")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ whiteSpace: "pre-wrap", fontSize: 11, color: MUTED, lineHeight: 1.45, marginTop: 7, maxHeight: 220, overflowY: "auto" }}>
                          {entry.content}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Version History ── */}
          <div style={panel}>
            <SectionHead title="Version History">
              {snapshots.length > 0 && (
                <button onClick={() => setCompareOpen(o => !o)} style={{ ...pb(false, true), marginLeft: "auto", fontSize: 10, padding: "4px 8px", ...(compareOpen ? { borderColor: CY, color: CY } : {}) }}>{compareOpen ? "Hide compare" : "Compare"}</button>
              )}
              <button onClick={saveSnapshot} style={{ ...pb(false, true), marginLeft: snapshots.length > 0 ? 0 : "auto", fontSize: 10, padding: "4px 8px" }}>Save version</button>
            </SectionHead>
            {compareOpen && snapshots.length > 0 && (
              <div style={{ border: `1px solid var(--hairline)`, borderRadius: 6, padding: 8, marginBottom: 10, background: "var(--surface-container-lowest)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 10, color: MUTED }}>
                  <span>From</span>
                  <select value={cmpFrom || snapshots[snapshots.length - 1]?.id || ""} onChange={e => setCmpFrom(e.target.value)} style={{ background: BG, color: TEXT, border: `1px solid var(--hairline)`, borderRadius: 4, fontSize: 10, padding: "3px 5px", fontFamily: F, maxWidth: 150 }}>
                    {snapshots.map(s => (<option key={s.id} value={s.id}>{versionLabel(s)}</option>))}
                  </select>
                  <span>→</span>
                  <select value={cmpTo} onChange={e => setCmpTo(e.target.value)} style={{ background: BG, color: TEXT, border: `1px solid var(--hairline)`, borderRadius: 4, fontSize: 10, padding: "3px 5px", fontFamily: F, maxWidth: 150 }}>
                    <option value="current">Current deck</option>
                    {snapshots.map(s => (<option key={s.id} value={s.id}>{versionLabel(s)}</option>))}
                  </select>
                </div>
                {compareDiff && (
                  (compareDiff.added.length + compareDiff.removed.length + compareDiff.changed.length === 0)
                    ? <div style={{ fontSize: 10, color: "#4a9b6a", marginTop: 7 }}>Identical — no card differences.</div>
                    : <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5, marginTop: 7 }}>
                      {compareDiff.added.length > 0 && <div><span style={{ color: "#4a9b6a" }}>Added:</span> {compareDiff.added.map(c => `${c.qty}× ${c.name}`).join(", ")}</div>}
                      {compareDiff.removed.length > 0 && <div><span style={{ color: "#c84848" }}>Removed:</span> {compareDiff.removed.map(c => `${c.qty}× ${c.name}`).join(", ")}</div>}
                      {compareDiff.changed.length > 0 && <div><span style={{ color: CY }}>Qty changed:</span> {compareDiff.changed.map(c => `${c.name} ${c.from}→${c.to}`).join(", ")}</div>}
                    </div>
                )}
              </div>
            )}
            {!snapshots.length && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.45 }}>No saved versions yet. Save one to track what you add and cut over time — and restore the deck to any saved version later.</div>}
            {snapshots.slice(0, 12).map(entry => {
              const drift = artifactDrift(entry);
              const changed = drift && (drift.added.length > 0 || drift.removed.length > 0);
              return (
                <details key={entry.id} style={{ borderTop: `1px solid var(--hairline-10)`, padding: "7px 0" }}>
                  <summary style={{ cursor: "pointer", color: TEXT, fontSize: 11, lineHeight: 1.35, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: CY, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{entry.label || entry.reason || entry.date}</span>
                    <span style={{ color: MUTED }}>{entry.snapshot?.mainCount} cards</span>
                    {drift && (changed
                      ? <span style={{ color: MUTED, marginLeft: "auto" }}>+{drift.added.length} / −{drift.removed.length} since</span>
                      : <span style={{ color: "#4a9b6a", marginLeft: "auto" }}>unchanged</span>)}
                  </summary>
                  <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4, marginTop: 7 }}>
                    {entry.label && entry.reason && <div style={{ color: CY, marginBottom: 3 }}>{entry.reason}</div>}
                    <div style={{ marginBottom: 3 }}>{entry.date}</div>
                    {entry.snapshot?.commander} | {entry.snapshot?.mainCount} cards | {entry.snapshot?.tokenCount} tokens
                  </div>
                  {changed && (
                    <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.45, marginTop: 5 }}>
                      {drift.added.length > 0 && <div><span style={{ color: "#4a9b6a" }}>Added:</span> {drift.added.slice(0, 16).join(", ")}{drift.added.length > 16 ? ` +${drift.added.length - 16} more` : ""}</div>}
                      {drift.removed.length > 0 && <div><span style={{ color: "#c84848" }}>Removed:</span> {drift.removed.slice(0, 16).join(", ")}{drift.removed.length > 16 ? ` +${drift.removed.length - 16} more` : ""}</div>}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    {isRestorable(entry)
                      ? <button onClick={() => restoreSnapshot(entry)} style={{ ...pb(false, true), fontSize: 10, padding: "3px 7px", borderColor: "#6fbf73", color: "#6fbf73" }}>Restore</button>
                      : <span style={{ fontSize: 9, color: MUTED, alignSelf: "center" }} title="This older snapshot only stored a summary, not the full card list.">view-only</span>}
                    <button onClick={() => relabel(entry)} style={{ ...pb(false, true), fontSize: 10, padding: "3px 7px" }}>Rename</button>
                    <button onClick={() => deleteSnapshot(entry.id)} style={{ ...pb(false, true), fontSize: 10, padding: "3px 7px" }}>Delete</button>
                  </div>
                </details>
              );
            })}
          </div>

          {/* ── Recommendations ── */}
          <div style={panel}>
            <SectionHead title="Recommendations" tag="local · free">
              <button onClick={loadRecs} disabled={recsLoading || !deckCards.length} style={{ ...pb(false, true), marginLeft: "auto", fontSize: 10, padding: "4px 8px", opacity: (recsLoading || !deckCards.length) ? 0.5 : 1 }}>{recsLoading ? "Analyzing…" : (recs ? "Refresh" : "Get recommendations")}</button>
            </SectionHead>
            {!recs && !recsLoading && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.45 }}>Deterministic add/cut suggestions from your local data — role gaps filled with color-legal staples, one-card-away combos, and weak/salty cut candidates. No API cost.</div>}
            {recs && recs.ready === false && <div style={{ fontSize: 11, color: "#c84848", lineHeight: 1.45 }}>{recs.error}</div>}
            {recs && recs.ready && (
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ fontSize: 11, color: MUTED }}>Bracket {recs.bracket} · power {recs.powerLevel}{recs.colors?.length ? ` · ${recs.colors.join("")}` : ""}{recs.confidence === "low" ? " · low confidence (unresolved cards)" : ""}</div>
                {recs.notes?.length > 0 && (
                  <div style={{ fontSize: 11, color: CY, lineHeight: 1.45 }}>{recs.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
                )}
                {recs.adds?.length > 0 && (
                  <div>
                    <div style={{ ...dlabel, fontSize: 10, marginBottom: 5 }}>Fill these gaps</div>
                    {recs.adds.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 5 }}>
                        <span style={{ color: TEXT, fontWeight: 700 }}>{a.role}</span> <span style={{ color: MUTED }}>({a.have}/{a.target})</span>
                        {a.suggestions.length > 0 ? (
                          <div>{a.suggestions.map((s, j) => (
                            <span key={j}
                              onMouseEnter={e => handleChipHover(s, e)} onMouseLeave={() => setTooltip(null)}
                              style={{ color: cfg.color, cursor: "pointer", marginRight: 8, borderBottom: `1px dotted ${cfg.border}` }}>{s}</span>
                          ))}</div>
                        ) : <div style={{ color: MUTED }}>No local color-legal staples found for this role.</div>}
                      </div>
                    ))}
                  </div>
                )}
                {recs.completions?.length > 0 && (
                  <div>
                    <div style={{ ...dlabel, fontSize: 10, marginBottom: 5 }}>Finish a combo</div>
                    {recs.completions.map((c, i) => (
                      <div key={i} style={{ fontSize: 11, lineHeight: 1.5, color: MUTED }}>
                        Add <span onMouseEnter={e => handleChipHover(c.missingCard, e)} onMouseLeave={() => setTooltip(null)} style={{ color: CY, fontWeight: 700, cursor: "pointer" }}>{c.missingCard}</span> with {c.pieces.join(" + ")}{c.produces?.length ? ` → ${c.produces[0]}` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {recs.cuts?.length > 0 && (
                  <div>
                    <div style={{ ...dlabel, fontSize: 10, marginBottom: 5 }}>Consider cutting</div>
                    {recs.cuts.map((c, i) => (
                      <div key={i} style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <span onMouseEnter={e => handleChipHover(c.name, e)} onMouseLeave={() => setTooltip(null)} style={{ color: TEXT, cursor: "pointer" }}>{c.name}</span> <span style={{ color: MUTED }}>— {c.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4 }}>Heuristic, not gospel — Karn&apos;s Upgrade Plan reasons about your specific list.</div>
              </div>
            )}
          </div>

          {/* ── Deck Report ── */}
          <div style={panel}>
            <SectionHead title="Deck Report" tag="local · free">
              {report?.ready && (
                <>
                  <button onClick={() => setReportMode(reportMode === "full" ? "rule0" : "full")} style={{ ...pb(false, true), fontSize: 10, padding: "4px 8px" }}>{reportMode === "full" ? "Rule 0 card" : "Full report"}</button>
                  <button onClick={copyReport} style={{ ...pb(false, true), fontSize: 10, padding: "4px 8px" }}>Copy</button>
                </>
              )}
              <button onClick={loadReport} disabled={reportLoading || !deckCards.length} style={{ ...pb(false, true), marginLeft: "auto", fontSize: 10, padding: "4px 8px", opacity: (reportLoading || !deckCards.length) ? 0.5 : 1 }}>{reportLoading ? "Building…" : (report ? "Refresh" : "Generate report")}</button>
            </SectionHead>
            {!report && !reportLoading && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.45 }}>One complete local report — power &amp; bracket, roles, legality, combos, salt, cost-to-finish — plus a copy-paste Rule 0 pitch. No API cost.</div>}
            {report && report.ready === false && <div style={{ fontSize: 11, color: "#c84848", lineHeight: 1.45 }}>{report.error}</div>}
            {report && report.ready && (
              <pre style={{ fontSize: 11, color: TEXT, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: FM, maxHeight: 360, overflowY: "auto", margin: 0 }}>{reportMode === "rule0" ? report.rule0 : report.markdown}</pre>
            )}
          </div>

          {/* ── Game Log ── */}
          <div style={panel}>
            <SectionHead title="Game Log" />
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "90px 1fr", gap: 8, marginBottom: 8 }}>
              <select value={gameResult} onChange={e => setGameResult(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }}>
                <option>Win</option>
                <option>Loss</option>
                <option>Draw</option>
                <option>Goldfish</option>
              </select>
              <input value={gameOpponents} onChange={e => setGameOpponents(e.target.value)} placeholder="Opposing decks or matchup" style={{ ...fieldStyle, fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: (deckMemory.games || []).length ? 12 : 0 }}>
              <textarea value={gameNotes} onChange={e => setGameNotes(e.target.value)} placeholder="What happened? Mana issues, key turns, cards that over/underperformed..."
                style={{ ...fieldStyle, flex: 1, minHeight: 54, fontSize: 12, resize: "vertical", lineHeight: 1.45 }} />
              <button onClick={recordGame} disabled={!gameOpponents.trim() && !gameNotes.trim()}
                style={{ ...pb(true, true), opacity: (!gameOpponents.trim() && !gameNotes.trim()) ? 0.45 : 1, whiteSpace: "nowrap" }}>Log Game</button>
            </div>
            {(deckMemory.games || []).slice(0, 5).map(g => (
              <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderTop: `1px solid var(--hairline-10)` }}>
                <div style={{ width: 58, flexShrink: 0, color: g.result === "Win" ? "#4a9b6a" : g.result === "Loss" ? "#c84848" : CY, fontSize: 11, fontWeight: 700, fontFamily: FM }}>{g.result}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opponents || "Unspecified matchup"} <span style={{ color: MUTED }}>- {g.date}</span></div>
                  {g.notes && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.45, marginTop: 2, whiteSpace: "pre-wrap" }}>{g.notes}</div>}
                </div>
                <button onClick={() => deleteGame(g.id)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>x</button>
              </div>
            ))}
          </div>

          <GarfieldPanel
            activeDeckId={activeDeck?.id}
            bg={BG}
            bg3={BG3}
            colors={{ LINE, TEXT, MUTED, GOLD }}
            deckMemory={deckMemory}
            fontFamily={F}
            goldfishResult={goldfishResult}
            goldfishRunning={goldfishRunning}
            hasData={hasData}
            loadDeckData={loadDeckData}
            pb={pb}
            runGoldfish={runGoldfish}
          />
        </>
      )}

      {/* Decklist when there's no active deck loaded (raw groups) */}
      {!activeDeck && deckCards.length > 0 && (
        ["Commander", "Mainboard", "Sideboard", "Tokens"].map(g => {
          const grp = deckCards.filter(c => c.section === g); if (!grp.length) return null;
          return (
            <div key={g} style={{ marginBottom: 16 }}>
              <div style={{ ...dlabel, color: CY, marginBottom: 5, paddingBottom: 4, borderBottom: `1px solid var(--hairline)` }}>
                {g} ({grp.reduce((s, c) => s + c.qty, 0)})
              </div>
              {grp.map((c, i) => (
                <div key={i} className="aether-row" style={{ display: "flex", gap: 10, padding: "0 10px", height: 38, alignItems: "center", borderRadius: 6, cursor: "pointer" }}
                  onMouseEnter={e => handleChipHover(c.name, e)} onMouseLeave={() => setTooltip(null)}
                  onClick={() => window.open(`https://scryfall.com/search?q=${encodeURIComponent('"' + c.name + '"')}`, "_blank")}>
                  <span style={{ fontFamily: FM, color: MUTED, fontSize: 12, width: 22, textAlign: "center", flexShrink: 0 }}>{c.qty}</span>
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{c.name}</span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
