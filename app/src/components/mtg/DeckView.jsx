/**
 * DeckView — the center "deck" view (rendered by MTGAssistant when
 * centerView === "deck"): the commander + 99 list, deck stats, the Karn deck
 * notes, the Garfield goldfish (solo playtest) controls, and game recording.
 *
 * It takes a large prop bag from the shell. The terse style props are the
 * shared vocabulary documented in MTGAssistant.jsx (search "Inline style
 * vocabulary"):
 *   bg / bg3   background shades        cfg          active agent theme object
 *   colors     palette object          fontFamily   serif font-family stack
 *   pb         primary-button style fn  setTooltip   card hover-preview setter
 */
import { AGENTS } from "../../lib/agents";
import { useMemo, useState, useEffect } from "react";
import GarfieldPanel from "./GarfieldPanel";
import { restoreDeckCards, isRestorable, createSnapshotEntry, relabelSnapshot } from "../../lib/deckApply";

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

  return (
    <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${LINE}`}}>
                      <span style={{fontFamily:F,fontSize:17,color:"#d8d2e8"}}>{activeDeck?.name}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setCenterView("chat")} style={pb(true,true)}>Chat</button>
                        <button onClick={exportDeck} style={pb(false,true)}>Export</button>
                      </div>
                    </div>
                    {activeDeck&&(
                      <div style={{background:BG3,border:`1px solid ${LINE}`,borderRadius:8,padding:14,marginBottom:18}}>
                        <div style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${LINE}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:12}}>
                            <div>
                              <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Deck Command Center</div>
                              <div style={{fontSize:18,color:"#d8d2e8",fontFamily:F,lineHeight:1.25}}>{commanderText}</div>
                            </div>
                            <div style={{fontSize:11,color:MUTED,textAlign:"right",lineHeight:1.5}}>
                              {deckMemory.owner || "Colton"}<br/>
                              {deckMemory.updatedAt ? `Updated ${new Date(deckMemory.updatedAt).toLocaleDateString()}` : "Local memory"}
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:12}}>
                            {[
                              ["Cards", mainCount],
                              ["Tokens", tokenCount],
                              ["Games", gameCount],
                              ["Power", deckMemory.powerLevel || "Unset"],
                            ].map(([label,value])=>(
                              <div key={label} style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:"9px 10px"}}>
                                <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{label}</div>
                                <div style={{fontSize:15,color:TEXT,fontWeight:700}}>{value}</div>
                              </div>
                            ))}
                          </div>
                          {deckCost&&(
                            <div style={{fontSize:11,color:MUTED,marginBottom:12,lineHeight:1.5}}>
                              {deckCost.complete
                                ? <span style={{color:"#6fbf73"}}>✓ You own every card in this deck ({deckCost.ownedCards}/{deckCost.totalCards}).</span>
                                : <>From your collection: own <strong style={{color:TEXT}}>{deckCost.ownedCards}/{deckCost.totalCards}</strong> ({deckCost.ownedPct}%) · <strong style={{color:GOLD}}>${deckCost.costToFinish.toFixed(2)}</strong> to finish{deckCost.unpricedCount>0?` (+${deckCost.unpricedCount} unpriced)`:""}</>}
                            </div>
                          )}
                          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                            <button onClick={()=>askDeckAgent("karn",deckActionPrompts.karn)} disabled={sending} style={{...pb(true,true),background:AGENTS.karn.color}}>Karn Upgrade Plan</button>
                            <button onClick={()=>askDeckAgent("tibalt",deckActionPrompts.tibalt)} disabled={sending} style={{...pb(true,true),background:AGENTS.tibalt.color}}>Tibalt Roast</button>
                            <button onClick={()=>askDeckAgent("jace",deckActionPrompts.jace)} disabled={sending} style={{...pb(true,true),background:AGENTS.jace.color}}>Jace Table Briefing</button>
                            <button onClick={prepArbiterQuestion} style={pb(false,true)}>Prep Arbiter Question</button>
                          </div>
                        </div>
                        {tokenEntries.length>0&&(
                          <div style={{padding:"9px 11px",borderRadius:6,background:"rgba(184,116,42,0.10)",border:"1px solid rgba(184,116,42,0.35)",color:GOLD,fontSize:12,lineHeight:1.5,marginBottom:12}}>
                            Tokens saved separately: {tokenEntries.join(", ")}. Karn and Tibalt will ignore these for Commander deck size, curve, legality, and normal card counts.
                          </div>
                        )}
                        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1.2fr .8fr .7fr",gap:10,marginBottom:10}}>
                          <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                            Deck Name
                            <input value={activeDeck.name} onChange={e=>updateActiveDeck(d=>({...d,name:e.target.value}))}
                              style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily:F,textTransform:"none",letterSpacing:0}}/>
                          </label>
                          <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                            Owner
                            <input value={deckMemory.owner} onChange={e=>updateActiveMemory({owner:e.target.value})} placeholder="Colton"
                              style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily:F,textTransform:"none",letterSpacing:0}}/>
                          </label>
                          <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                            Tags
                            <input value={deckMemory.tags} onChange={e=>updateActiveMemory({tags:e.target.value})} placeholder="tokens, aristocrats, casual"
                              style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily:F,textTransform:"none",letterSpacing:0}}/>
                          </label>
                          <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                            Power
                            <input value={deckMemory.powerLevel} onChange={e=>updateActiveMemory({powerLevel:e.target.value})} placeholder="7, casual, cEDH"
                              style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily:F,textTransform:"none",letterSpacing:0}}/>
                          </label>
                        </div>
                        <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
                          Deck Memory
                          <textarea value={deckMemory.notes} onChange={e=>updateActiveMemory({notes:e.target.value})}
                            placeholder="Game plan, common problems, cards to test, meta notes, changes you want Karn/Tibalt/Jace to remember..."
                            style={{width:"100%",minHeight:84,padding:"9px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:12,fontFamily:F,resize:"vertical",lineHeight:1.55,textTransform:"none",letterSpacing:0}}/>
                        </label>
                        <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
                          Board / Rules Snapshot
                          <textarea value={deckMemory.boardSnapshot || ""} onChange={e=>updateActiveMemory({boardSnapshot:e.target.value})}
                            placeholder="Current battlefield, graveyards, exile, stack, active player, turn/phase, commander tax, counters, and any rule-sensitive state..."
                            style={{width:"100%",minHeight:70,padding:"9px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:12,fontFamily:F,resize:"vertical",lineHeight:1.55,textTransform:"none",letterSpacing:0}}/>
                        </label>
                        <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Saved Agent Notes</div>
                        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:10,marginBottom:14}}>
                          {[
                            ["karn","Upgrade notes, cuts, adds, testing plan"],
                            ["tibalt","Roast takeaways and identity problems"],
                            ["jace","Table briefing and sequencing reminders"],
                            ["arbiter","Rules interactions to investigate"],
                          ].map(([ak,placeholder])=>(
                            <div key={ak} style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:10}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                                <span style={{fontSize:12,color:AGENTS[ak].color,fontWeight:700}}>{AGENTS[ak].name}</span>
                                <button onClick={()=>saveLatestAgentReply(ak)} disabled={!histories[ak]?.some(m=>m.role==="assistant")}
                                  style={{...pb(false,true),marginLeft:"auto",fontSize:10,padding:"4px 7px",opacity:histories[ak]?.some(m=>m.role==="assistant")?1:.45}}>
                                  Save Latest
                                </button>
                                {(ak==="karn"||ak==="tibalt")&&(
                                  <button onClick={()=>saveLatestAgentArtifact(ak)} disabled={!histories[ak]?.some(m=>m.role==="assistant")}
                                    style={{...pb(false,true),fontSize:10,padding:"4px 7px",opacity:histories[ak]?.some(m=>m.role==="assistant")?1:.45}}>
                                    Save {ak==="karn"?"Plan":"Roast"}
                                  </button>
                                )}
                                <button onClick={()=>updateAgentNote(ak,"")} style={{...pb(false,true),fontSize:10,padding:"4px 7px"}}>Clear</button>
                              </div>
                              <textarea value={agentNotes[ak] || ""} onChange={e=>updateAgentNote(ak,e.target.value)}
                                placeholder={placeholder}
                                style={{width:"100%",minHeight:92,padding:"8px 9px",background:BG3,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:11,fontFamily:F,resize:"vertical",lineHeight:1.5}}/>
                            </div>
                          ))}
                        </div>
                        {((deckMemory.karnPlans||[]).length>0||(deckMemory.tibaltRoasts||[]).length>0)&&(
                          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:10,marginBottom:14}}>
                            {[
                              ["Karn Plan History", deckMemory.karnPlans || [], AGENTS.karn.color],
                              ["Tibalt Roast History", deckMemory.tibaltRoasts || [], AGENTS.tibalt.color],
                            ].map(([title, entries, color])=>(
                              <div key={title} style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:10}}>
                                <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>{title}</div>
                                {!entries.length&&<div style={{fontSize:11,color:MUTED}}>Nothing saved yet.</div>}
                                {entries.slice(0,3).map(entry=>{
                                  const drift = artifactDrift(entry);

                                  return (
                                  <details key={entry.id} style={{borderTop:`1px solid ${LINE}`,padding:"7px 0"}}>
                                    <summary style={{cursor:"pointer",color:TEXT,fontSize:11,lineHeight:1.35}}>
                                      <span style={{color,fontWeight:700}}>{entry.date}</span> - {entry.summary}
                                    </summary>
                                    {entry.snapshot&&(
                                      <div style={{fontSize:10,color:MUTED,lineHeight:1.4,marginTop:7}}>
                                        Snapshot: {entry.snapshot.commander} | {entry.snapshot.mainCount} cards | {entry.snapshot.tokenCount} tokens
                                      </div>
                                    )}
                                    {drift&&(
                                      <div style={{fontSize:10,color:MUTED,lineHeight:1.4,marginTop:5}}>
                                        Since saved: {drift.added.length} added / {drift.removed.length} removed
                                        {(drift.added.length>0||drift.removed.length>0)&&(
                                          <details style={{marginTop:4}}>
                                            <summary style={{cursor:"pointer",color}}>View deck drift</summary>
                                            {drift.added.length>0&&<div>Added: {drift.added.slice(0,12).join(", ")}</div>}
                                            {drift.removed.length>0&&<div>Removed: {drift.removed.slice(0,12).join(", ")}</div>}
                                          </details>
                                        )}
                                      </div>
                                    )}
                                    {entry.parsed&&(
                                      <div style={{display:"grid",gap:6,marginTop:8}}>
                                        {[
                                          ["Cuts", entry.parsed.cuts],
                                          ["Adds", entry.parsed.adds],
                                          ["Maybe", entry.parsed.maybeBoard],
                                          ["Testing", entry.parsed.testingPlan],
                                        ].filter(([,items])=>items?.length).map(([label,items])=>(
                                          <div key={label} style={{fontSize:11,lineHeight:1.45}}>
                                            <span style={{color,fontWeight:700}}>{label}: </span>
                                            <span style={{color:MUTED}}>{items.slice(0,10).join(", ")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <div style={{whiteSpace:"pre-wrap",fontSize:11,color:MUTED,lineHeight:1.45,marginTop:7,maxHeight:220,overflowY:"auto"}}>
                                      {entry.content}
                                    </div>
                                  </details>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:10,marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>Version History</span>
                            <button onClick={saveSnapshot} style={{...pb(false,true),marginLeft:"auto",fontSize:10,padding:"4px 8px"}}>Save version</button>
                          </div>
                          {!snapshots.length&&<div style={{fontSize:11,color:MUTED,lineHeight:1.45}}>No saved versions yet. Save one to track what you add and cut over time — and restore the deck to any saved version later.</div>}
                          {snapshots.slice(0,12).map(entry=>{
                            const drift = artifactDrift(entry);
                            const changed = drift&&(drift.added.length>0||drift.removed.length>0);
                            return (
                              <details key={entry.id} style={{borderTop:`1px solid ${LINE}`,padding:"7px 0"}}>
                                <summary style={{cursor:"pointer",color:TEXT,fontSize:11,lineHeight:1.35,display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{color:GOLD,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{entry.label || entry.reason || entry.date}</span>
                                  <span style={{color:MUTED}}>{entry.snapshot?.mainCount} cards</span>
                                  {drift&&(changed
                                    ?<span style={{color:MUTED,marginLeft:"auto"}}>+{drift.added.length} / −{drift.removed.length} since</span>
                                    :<span style={{color:"#4a9b6a",marginLeft:"auto"}}>unchanged</span>)}
                                </summary>
                                <div style={{fontSize:10,color:MUTED,lineHeight:1.4,marginTop:7}}>
                                  {entry.label && entry.reason && <div style={{color:GOLD,marginBottom:3}}>{entry.reason}</div>}
                                  <div style={{marginBottom:3}}>{entry.date}</div>
                                  {entry.snapshot?.commander} | {entry.snapshot?.mainCount} cards | {entry.snapshot?.tokenCount} tokens
                                </div>
                                {changed&&(
                                  <div style={{fontSize:10,color:MUTED,lineHeight:1.45,marginTop:5}}>
                                    {drift.added.length>0&&<div><span style={{color:"#4a9b6a"}}>Added:</span> {drift.added.slice(0,16).join(", ")}{drift.added.length>16?` +${drift.added.length-16} more`:""}</div>}
                                    {drift.removed.length>0&&<div><span style={{color:"#c84848"}}>Removed:</span> {drift.removed.slice(0,16).join(", ")}{drift.removed.length>16?` +${drift.removed.length-16} more`:""}</div>}
                                  </div>
                                )}
                                <div style={{display:"flex",gap:6,marginTop:7}}>
                                  {isRestorable(entry)
                                    ?<button onClick={()=>restoreSnapshot(entry)} style={{...pb(false,true),fontSize:10,padding:"3px 7px",borderColor:"#6fbf73",color:"#6fbf73"}}>Restore</button>
                                    :<span style={{fontSize:9,color:MUTED,alignSelf:"center"}} title="This older snapshot only stored a summary, not the full card list.">view-only</span>}
                                  <button onClick={()=>relabel(entry)} style={{...pb(false,true),fontSize:10,padding:"3px 7px"}}>Rename</button>
                                  <button onClick={()=>deleteSnapshot(entry.id)} style={{...pb(false,true),fontSize:10,padding:"3px 7px"}}>Delete</button>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                        <div style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:10,marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>Recommendations</span>
                            <span style={{fontSize:9,color:MUTED}}>local · free</span>
                            <button onClick={loadRecs} disabled={recsLoading||!deckCards.length} style={{...pb(false,true),marginLeft:"auto",fontSize:10,padding:"4px 8px",opacity:(recsLoading||!deckCards.length)?.5:1}}>{recsLoading?"Analyzing…":(recs?"Refresh":"Get recommendations")}</button>
                          </div>
                          {!recs&&!recsLoading&&<div style={{fontSize:11,color:MUTED,lineHeight:1.45}}>Deterministic add/cut suggestions from your local data — role gaps filled with color-legal staples, one-card-away combos, and weak/salty cut candidates. No API cost.</div>}
                          {recs&&recs.ready===false&&<div style={{fontSize:11,color:"#c84848",lineHeight:1.45}}>{recs.error}</div>}
                          {recs&&recs.ready&&(
                            <div style={{display:"flex",flexDirection:"column",gap:11}}>
                              <div style={{fontSize:11,color:MUTED}}>Bracket {recs.bracket} · power {recs.powerLevel}{recs.colors?.length?` · ${recs.colors.join("")}`:""}{recs.confidence==="low"?" · low confidence (unresolved cards)":""}</div>
                              {recs.notes?.length>0&&(
                                <div style={{fontSize:11,color:GOLD,lineHeight:1.45}}>{recs.notes.map((n,i)=><div key={i}>• {n}</div>)}</div>
                              )}
                              {recs.adds?.length>0&&(
                                <div>
                                  <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Fill these gaps</div>
                                  {recs.adds.map((a,i)=>(
                                    <div key={i} style={{fontSize:11,lineHeight:1.6,marginBottom:5}}>
                                      <span style={{color:TEXT,fontWeight:700}}>{a.role}</span> <span style={{color:MUTED}}>({a.have}/{a.target})</span>
                                      {a.suggestions.length>0?(
                                        <div>{a.suggestions.map((s,j)=>(
                                          <span key={j}
                                            onMouseEnter={e=>handleChipHover(s,e)} onMouseLeave={()=>setTooltip(null)}
                                            style={{color:cfg.color,cursor:"pointer",marginRight:8,borderBottom:`1px dotted ${cfg.border}`}}>{s}</span>
                                        ))}</div>
                                      ):<div style={{color:MUTED}}>No local color-legal staples found for this role.</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {recs.completions?.length>0&&(
                                <div>
                                  <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Finish a combo</div>
                                  {recs.completions.map((c,i)=>(
                                    <div key={i} style={{fontSize:11,lineHeight:1.5,color:MUTED}}>
                                      Add <span onMouseEnter={e=>handleChipHover(c.missingCard,e)} onMouseLeave={()=>setTooltip(null)} style={{color:GOLD,fontWeight:700,cursor:"pointer"}}>{c.missingCard}</span> with {c.pieces.join(" + ")}{c.produces?.length?` → ${c.produces[0]}`:""}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {recs.cuts?.length>0&&(
                                <div>
                                  <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Consider cutting</div>
                                  {recs.cuts.map((c,i)=>(
                                    <div key={i} style={{fontSize:11,lineHeight:1.5}}>
                                      <span onMouseEnter={e=>handleChipHover(c.name,e)} onMouseLeave={()=>setTooltip(null)} style={{color:TEXT,cursor:"pointer"}}>{c.name}</span> <span style={{color:MUTED}}>— {c.reason}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div style={{fontSize:10,color:MUTED,lineHeight:1.4}}>Heuristic, not gospel — Karn&apos;s Upgrade Plan reasons about your specific list.</div>
                            </div>
                          )}
                        </div>
                        <div style={{background:BG,border:`1px solid ${LINE}`,borderRadius:6,padding:10,marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>Deck Report</span>
                            <span style={{fontSize:9,color:MUTED}}>local · free</span>
                            {report?.ready&&(
                              <>
                                <button onClick={()=>setReportMode(reportMode==="full"?"rule0":"full")} style={{...pb(false,true),fontSize:10,padding:"4px 8px"}}>{reportMode==="full"?"Rule 0 card":"Full report"}</button>
                                <button onClick={copyReport} style={{...pb(false,true),fontSize:10,padding:"4px 8px"}}>Copy</button>
                              </>
                            )}
                            <button onClick={loadReport} disabled={reportLoading||!deckCards.length} style={{...pb(false,true),marginLeft:"auto",fontSize:10,padding:"4px 8px",opacity:(reportLoading||!deckCards.length)?.5:1}}>{reportLoading?"Building…":(report?"Refresh":"Generate report")}</button>
                          </div>
                          {!report&&!reportLoading&&<div style={{fontSize:11,color:MUTED,lineHeight:1.45}}>One complete local report — power &amp; bracket, roles, legality, combos, salt, cost-to-finish — plus a copy-paste Rule 0 pitch. No API cost.</div>}
                          {report&&report.ready===false&&<div style={{fontSize:11,color:"#c84848",lineHeight:1.45}}>{report.error}</div>}
                          {report&&report.ready&&(
                            <pre style={{fontSize:11,color:TEXT,lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-word",fontFamily:"ui-monospace, SFMono-Regular, monospace",maxHeight:360,overflowY:"auto",margin:0}}>{reportMode==="rule0"?report.rule0:report.markdown}</pre>
                          )}
                        </div>
                        <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>Game Log</div>
                        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"90px 1fr",gap:8,marginBottom:8}}>
                          <select value={gameResult} onChange={e=>setGameResult(e.target.value)}
                            style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:12,fontFamily:F}}>
                            <option>Win</option>
                            <option>Loss</option>
                            <option>Draw</option>
                            <option>Goldfish</option>
                          </select>
                          <input value={gameOpponents} onChange={e=>setGameOpponents(e.target.value)} placeholder="Opposing decks or matchup"
                            style={{padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:12,fontFamily:F}}/>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:(deckMemory.games||[]).length?12:0}}>
                          <textarea value={gameNotes} onChange={e=>setGameNotes(e.target.value)} placeholder="What happened? Mana issues, key turns, cards that over/underperformed..."
                            style={{flex:1,minHeight:54,padding:"8px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:12,fontFamily:F,resize:"vertical",lineHeight:1.45}}/>
                          <button onClick={recordGame} disabled={!gameOpponents.trim()&&!gameNotes.trim()}
                            style={{...pb(true,true),opacity:(!gameOpponents.trim()&&!gameNotes.trim())?.45:1,whiteSpace:"nowrap"}}>Log Game</button>
                        </div>
                        {(deckMemory.games||[]).slice(0,5).map(g=>(
                          <div key={g.id} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"7px 0",borderTop:`1px solid ${LINE}`}}>
                            <div style={{width:58,flexShrink:0,color:g.result==="Win"?"#4a9b6a":g.result==="Loss"?"#c84848":GOLD,fontSize:11,fontWeight:700}}>{g.result}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:11,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.opponents||"Unspecified matchup"} <span style={{color:MUTED}}>- {g.date}</span></div>
                              {g.notes&&<div style={{fontSize:11,color:MUTED,lineHeight:1.45,marginTop:2,whiteSpace:"pre-wrap"}}>{g.notes}</div>}
                            </div>
                            <button onClick={()=>deleteGame(g.id)} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:14,lineHeight:1}}>x</button>
                          </div>
                        ))}
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
                      </div>
                    )}
                    {["Commander","Mainboard","Sideboard","Tokens"].map(g=>{
                      const grp=deckCards.filter(c=>c.section===g); if(!grp.length) return null;
                      return (
                        <div key={g} style={{marginBottom:16}}>
                          <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5,paddingBottom:4,borderBottom:`1px solid ${LINE}`}}>
                            {g} ({grp.reduce((s,c)=>s+c.qty,0)})
                          </div>
                          {grp.map((c,i)=>(
                            <div key={i} style={{display:"flex",gap:8,padding:"3px 0",alignItems:"center"}}>
                              <span style={{color:MUTED,fontSize:12,width:24,textAlign:"right",flexShrink:0}}>{c.qty}x</span>
                              <span style={{fontSize:13,color:TEXT,cursor:"pointer",borderBottom:`1px dotted ${cfg.border}`}}
                                onMouseEnter={e=>handleChipHover(c.name,e)} onMouseLeave={()=>setTooltip(null)}
                                onClick={()=>window.open(`https://scryfall.com/search?q=${encodeURIComponent('"'+c.name+'"')}`,"_blank")}>
                                {c.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
  );
}
