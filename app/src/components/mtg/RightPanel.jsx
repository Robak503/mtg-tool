/**
 * RightPanel — the right-hand panel: card search results / preview and the
 * deck-stat charts (e.g. the mana CurveChart and color breakdown defined below).
 */
const MANA_COLORS = {
  W: { fill: "#f5f0cc", stroke: "#9a8a30", text: "#6a5a10" },
  U: { fill: "#9ec4e8", stroke: "#1a5a9a", text: "#0a3060" },
  B: { fill: "#888", stroke: "#444", text: "#111" },
  R: { fill: "#f07050", stroke: "#902010", text: "#601008" },
  G: { fill: "#68b868", stroke: "#206020", text: "#0e3a0e" },
};

function CurveChart({ curve }) {
  const labels = ["0", "1", "2", "3", "4", "5", "6", "7+"];
  const values = labels.map((_, index) => curve[String(index === 7 ? 7 : index)] || 0);
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 88 }}>
      {labels.map((label, index) => {
        const value = values[index];
        const height = Math.round((value / max) * 70);

        return (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {value > 0 && <span style={{ fontSize: 9, color: "var(--on-surface-variant)", lineHeight: 1 }}>{value}</span>}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: height || 0,
                  background: "var(--primary-fixed-dim)",
                  borderRadius: "2px 2px 0 0",
                  minHeight: value > 0 ? 3 : 0,
                }}
              />
            </div>
            <span style={{ fontSize: 9, color: "var(--on-surface-variant)" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ColorPie({ colors }) {
  const total = Object.values(colors).reduce((sum, value) => sum + value, 0) || 1;
  const active = Object.entries(colors).filter(([, value]) => value > 0);

  if (!active.length) {
    return <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>No colored mana symbols found.</div>;
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {active.map(([symbol, value]) => (
        <div key={symbol} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            title={symbol}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: MANA_COLORS[symbol].fill,
              border: `2px solid ${MANA_COLORS[symbol].stroke}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: MANA_COLORS[symbol].text,
            }}
          >
            {symbol}
          </div>
          <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{Math.round((value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function RightPanel({
  bodyRef,
  cfg,
  commanderArtName,
  colorBreakdown,
  colorIssues,
  comboData,
  comboLoad,
  deckCards,
  deckDataLoad,
  hasData,
  handleSearch,
  legalIssues,
  loadCombos,
  loadDeckData,
  mobile,
  pb,
  previewCard,
  priceInfo,
  rightTab,
  searchLoad,
  searchQ,
  searchRes,
  setPreviewCard,
  setRightOpen,
  setRightTab,
  setTooltip,
  showRight,
  colors,
  fontFamily,
}) {
  const { BG2, BG3, LINE, TEXT, MUTED, GOLD } = colors;
  const F = fontFamily;
  const curve = colorBreakdown.curve;
  const manaColors = colorBreakdown.colors;

  if (!showRight) return null;

  return (
    <div style={{width:mobile?"100%":262,flexShrink:0,borderLeft:mobile?"none":`1px solid ${LINE}`,background:BG2,backdropFilter:"blur(16px) saturate(1.2)",WebkitBackdropFilter:"blur(16px) saturate(1.2)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
                {commanderArtName && (
                  <div style={{padding:"12px 14px",flexShrink:0,borderBottom:`1px solid ${LINE}`}}>
                    <div style={{fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:GOLD,marginBottom:3}}>Commander</div>
                    <div style={{fontSize:14,fontWeight:600,color:TEXT,lineHeight:1.2}}>{commanderArtName}</div>
                  </div>
                )}
                <div style={{display:"flex",borderBottom:`1px solid ${LINE}`,flexShrink:0}}>
                  {[["search","Search"],["stats","Stats"],["legal","Legal"],["combos","Combos"]].map(([key,label])=>(
                    <button key={key} style={{flex:1,padding:"9px 2px",background:rightTab===key?cfg.dim:"transparent",border:"none",borderBottom:rightTab===key?`2px solid ${cfg.color}`:"2px solid transparent",color:rightTab===key?cfg.color:MUTED,cursor:"pointer",fontSize:11,fontFamily:F}}
                      onClick={()=>{setRightTab(key);if(key==="combos")loadCombos();else if(key!=="search")loadDeckData();}}>
                      {label}
                    </button>
                  ))}
                  {!mobile&&<button onClick={()=>setRightOpen(false)} style={{padding:"9px 10px",background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:14,flexShrink:0}}>x</button>}
                </div>
                <div style={{flex:1,overflowY:"auto",padding:14}}>
    
                  {rightTab==="search"&&(
                    <div>
                      <input value={searchQ} onChange={e=>handleSearch(e.target.value)} placeholder="Search MTG cards..."
                        style={{width:"100%",padding:"8px 10px",background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:12,fontFamily:F,marginBottom:10}}/>
                      {searchLoad&&<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:8}}>Searching...</div>}
                      {previewCard&&(
                        <div style={{marginBottom:12,textAlign:"center"}}>
                          <img src={previewCard.normal} alt={previewCard.name} style={{width:"100%",maxWidth:210,borderRadius:8}}/>
                          <div style={{fontSize:10,color:MUTED,marginTop:4}}>{previewCard.name}</div>
                          <button onClick={()=>setPreviewCard(null)} style={{fontSize:10,color:MUTED,background:"none",border:"none",cursor:"pointer"}}>x close</button>
                        </div>
                      )}
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {searchRes.map((c,i)=>(
                          <div key={i} style={{padding:"6px 9px",borderRadius:5,border:`1px solid ${LINE}`,background:BG3,cursor:"pointer"}}
                            onMouseEnter={e=>{if(c.normal&&bodyRef.current){const br=bodyRef.current.getBoundingClientRect(),er=e.currentTarget.getBoundingClientRect();setTooltip({name:c.name,image:c.normal,x:Math.max(0,er.left-br.left-225),y:Math.max(0,er.top-br.top)});}}}
                            onMouseLeave={()=>setTooltip(null)}
                            onClick={()=>setPreviewCard(c)}>
                            <div style={{fontSize:12,color:TEXT}}>{c.name}</div>
                            <div style={{fontSize:10,color:MUTED,display:"flex",justifyContent:"space-between",marginTop:2}}>
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70%"}}>{c.type}</span>
                              <span style={{color:GOLD,flexShrink:0}}>{c.price}</span>
                            </div>
                          </div>
                        ))}
                        {!searchLoad&&!searchRes.length&&searchQ&&<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:10}}>No results found.</div>}
                      </div>
                    </div>
                  )}
    
                  {rightTab==="stats"&&(
                    <div>
                      {!deckCards.length?(
                        <div style={{textAlign:"center",color:MUTED,fontSize:12,padding:20}}>Import a deck to see analytics.</div>
                      ):!hasData?(
                        <div style={{textAlign:"center",padding:20}}>
                          <button onClick={loadDeckData} disabled={deckDataLoad} style={{...pb(true),opacity:deckDataLoad?.5:1}}>{deckDataLoad?"Loading...":"Load Analytics"}</button>
                          {deckDataLoad&&<div style={{fontSize:11,color:MUTED,marginTop:8}}>Fetching card data from Scryfall...</div>}
                        </div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:18}}>
                          <div>
                            <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Mana Curve</div>
                            <CurveChart curve={curve}/>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Color Distribution</div>
                            <ColorPie colors={manaColors}/>
                          </div>
                          {priceInfo&&(
                            <div>
                              <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Estimated Price</div>
                              <div style={{fontSize:22,color:GOLD,fontFamily:F,marginBottom:2}}>${priceInfo.total}</div>
                              <div style={{fontSize:10,color:MUTED,marginBottom:10}}>via Scryfall - TCGPlayer market</div>
                              {priceInfo.list.slice(0,6).map((c,i)=>(
                                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:11,borderBottom:`1px solid ${LINE}`}}>
                                  <span style={{color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"74%"}}>{c.name}</span>
                                  <span style={{color:GOLD,flexShrink:0}}>${c.price.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
    
                  {rightTab==="legal"&&(
                    <div>
                      <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>Commander Legality</div>
                      {!deckCards.length?(
                        <div style={{color:MUTED,fontSize:12}}>Import a deck to check legality.</div>
                      ):!hasData?(
                        <div style={{textAlign:"center"}}>
                          <button onClick={loadDeckData} disabled={deckDataLoad} style={{...pb(true),opacity:deckDataLoad?.5:1}}>{deckDataLoad?"Checking...":"Check Legality"}</button>
                        </div>
                      ):legalIssues.length===0?(
                        <div style={{padding:"10px 12px",borderRadius:6,background:"rgba(74,155,106,0.1)",border:"1px solid rgba(74,155,106,0.3)",color:"#4a9b6a",fontSize:13}}>
                          All cards appear Commander legal.
                        </div>
                      ):(
                        <div>
                          <div style={{padding:"8px 12px",borderRadius:6,background:"rgba(190,50,40,0.1)",border:"1px solid rgba(190,50,40,0.3)",color:"#c84848",fontSize:12,marginBottom:12}}>
                            {legalIssues.length} card{legalIssues.length>1?"s":""} flagged
                          </div>
                          {legalIssues.map((c,i)=>(
                            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:12,borderBottom:`1px solid ${LINE}`}}>
                              <span style={{color:TEXT}}>{c.name}</span>
                              <span style={{color:"#c84848",textTransform:"capitalize"}}>{c.status?.replace("_"," ")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {hasData&&deckCards.length>0&&(
                        <div style={{marginTop:18}}>
                          <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>Color Identity</div>
                          {!commanderArtName?(
                            <div style={{fontSize:12,color:MUTED}}>Set a commander to check color identity.</div>
                          ):colorIssues.length===0?(
                            <div style={{padding:"10px 12px",borderRadius:6,background:"rgba(74,155,106,0.1)",border:"1px solid rgba(74,155,106,0.3)",color:"#4a9b6a",fontSize:13}}>
                              Every card fits the commander's color identity.
                            </div>
                          ):(
                            <div>
                              <div style={{padding:"8px 12px",borderRadius:6,background:"rgba(190,50,40,0.1)",border:"1px solid rgba(190,50,40,0.3)",color:"#c84848",fontSize:12,marginBottom:12}}>
                                {colorIssues.length} off-color card{colorIssues.length>1?"s":""} (illegal in this deck)
                              </div>
                              {colorIssues.map((c,i)=>(
                                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:12,borderBottom:`1px solid ${LINE}`}}>
                                  <span style={{color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"74%"}}>{c.name}</span>
                                  <span style={{color:"#c84848",flexShrink:0}}>off: {c.offColors.join("")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{fontSize:10,color:MUTED,marginTop:14,lineHeight:1.55}}>Based on Scryfall data. Verify bans before tournaments.</div>
                    </div>
                  )}

                  {rightTab==="combos"&&(
                    <div>
                      {!deckCards.length?(
                        <div style={{textAlign:"center",color:MUTED,fontSize:12,padding:20}}>Import a deck to find combos.</div>
                      ):!comboData?(
                        <div style={{textAlign:"center",padding:20}}>
                          <button onClick={loadCombos} disabled={comboLoad} style={{...pb(true),opacity:comboLoad?.5:1}}>{comboLoad?"Finding...":"Find Combos"}</button>
                          <div style={{fontSize:11,color:MUTED,marginTop:8}}>Searches your local Commander Spellbook data.</div>
                        </div>
                      ):comboData.ready===false?(
                        <div style={{padding:"10px 12px",borderRadius:6,background:"rgba(190,50,40,0.08)",border:`1px solid ${LINE}`,color:MUTED,fontSize:12,lineHeight:1.5}}>
                          Combo data isn't synced yet. Open the Updates panel and sync Commander Spellbook.
                        </div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:18}}>
                          <div>
                            <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>In deck ({comboData.included.length})</div>
                            {comboData.included.length===0?(
                              <div style={{fontSize:12,color:MUTED}}>No complete combos detected.</div>
                            ):comboData.included.map((c,i)=>(
                              <div key={i} style={{padding:"7px 0",borderBottom:`1px solid ${LINE}`}}>
                                <div style={{fontSize:12,color:TEXT,lineHeight:1.4}}>{c.cards.join(" + ")}</div>
                                {c.produces?.length>0&&<div style={{fontSize:10,color:GOLD,marginTop:2}}>{c.produces.slice(0,2).join(" · ")}</div>}
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>One card away ({comboData.almostIncluded.length})</div>
                            {comboData.almostIncluded.length===0?(
                              <div style={{fontSize:12,color:MUTED}}>Nothing one card away.</div>
                            ):comboData.almostIncluded.map((c,i)=>(
                              <div key={i} style={{padding:"7px 0",borderBottom:`1px solid ${LINE}`}}>
                                <div style={{fontSize:12,color:TEXT,lineHeight:1.4}}>
                                  {c.cards.filter(n=>n!==c.missingCard).join(" + ")}
                                  {" + "}
                                  <span style={{color:GOLD,fontWeight:600}}>{c.missingCard}</span>
                                </div>
                                {c.produces?.length>0&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>{c.produces.slice(0,1).join(" · ")}</div>}
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:10,color:MUTED,lineHeight:1.55}}>
                            From your local Commander Spellbook snapshot. <span style={{color:GOLD,cursor:"pointer"}} onClick={loadCombos}>Refresh</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
  );
}
