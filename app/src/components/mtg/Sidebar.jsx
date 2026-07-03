/**
 * Sidebar — the left sidebar: the agent selector and the saved-deck library
 * (pick a deck to make it active and jump to its view). Collapses on mobile.
 * LEYLINE: nav shows where you ARE (green active states); agent rows carry
 * each agent's identity color; everything else is system green/grey.
 */
import { AGENTS } from "../../lib/agents";
import { useMemo, useRef, useState } from "react";
import StabilityBadge from "./StabilityBadge";

export default function Sidebar({
  agent,
  activeDeckId,
  centerView,
  mobile,
  sending,
  savedDecks,
  setAgent,
  setCenterView,
  setActiveDeckId,
  setMobileTab,
  deleteDeck,
  exportDeck,
  backupDeckLibrary,
  exportDeckLibrary,
  importDeckLibrary,
  exportChat,
  clearChat,
  unloadActiveDeck,
  openPodBalance,
  sb,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, MUTED, TEXT, GOLD } = colors;
  const [libraryQuery, setLibraryQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [libraryStatus, setLibraryStatus] = useState("");
  // The saved-deck list starts collapsed — deck selection now happens in the
  // chat's deck-confirm modal, so the always-on sidebar list isn't needed.
  const [decksOpen, setDecksOpen] = useState(false);
  const libraryImportRef = useRef(null);
  const owners = useMemo(
    () => ["All", ...new Set(savedDecks.map(deck => deck.memory?.owner || "Colton"))],
    [savedDecks]
  );
  const filteredDecks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return savedDecks.filter(deck => {
      const owner = deck.memory?.owner || "Colton";
      if (ownerFilter !== "All" && owner !== ownerFilter) return false;
      if (!query) return true;
      const commander = (deck.cards || []).filter(card => card.section === "Commander").map(card => card.name).join(" ");
      const haystack = [deck.name, owner, deck.memory?.tags, deck.memory?.powerLevel, commander]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [libraryQuery, ownerFilter, savedDecks]);
  const setTemporaryStatus = (message) => {
    setLibraryStatus(message);
    window.setTimeout(() => setLibraryStatus(""), 4000);
  };
  const backupLibrary = async () => {
    setLibraryStatus("Backing up library...");
    const result = await backupDeckLibrary();
    setTemporaryStatus(result?.backupPath ? "Backup saved locally." : "Library saved; no prior file to back up.");
  };
  const importLibrary = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importDeckLibrary(file);
      setTemporaryStatus(`Imported ${result.imported} decks. Library now has ${result.total}.`);
    } catch (error) {
      setTemporaryStatus(error.message || "Could not import that library file.");
    } finally {
      event.target.value = "";
    }
  };

  // LEYLINE nav vocabulary
  const sectionLabel = {fontFamily:"var(--font-mono), Consolas, monospace",fontSize:10,color:"var(--ley-text-faint)",textTransform:"uppercase",letterSpacing:"0.18em",marginBottom:7};
  // A nav row that knows whether you're ON its surface (green = you are here).
  const navRow = (active) => ({
    width:"100%",padding:"10px 10px",marginBottom:5,borderRadius:8,
    border:`1px solid ${active?"var(--ley-line-bright)":LINE}`,
    background:active?"var(--ley-green-dim)":"transparent",
    color:active?GOLD:MUTED,
    cursor:"pointer",textAlign:"left",fontFamily,display:"flex",alignItems:"center",gap:9,
    boxShadow:active?"0 0 10px var(--ley-green-glow)":"none",
    transition:"border-color .1s,background .1s,color .1s,box-shadow .16s",
  });

  return (
    <div style={{width:mobile?"100%":176,flexShrink:0,borderRight:mobile?"none":`1px solid ${LINE}`,background:BG2,backdropFilter:"blur(16px) saturate(1.2)",WebkitBackdropFilter:"blur(16px) saturate(1.2)",padding:12,display:"flex",flexDirection:"column",gap:16,overflowY:"auto"}}>
      <div>
        <div style={sectionLabel}>Agent</div>
        {Object.entries(AGENTS).filter(([, a]) => a.frontFacing !== false).map(([key,a])=>{
          const active = key===agent && centerView==="chat";
          return (
          <button
            key={key}
            style={{width:"100%",padding:"10px 10px",marginBottom:5,borderRadius:8,border:`1px solid ${active?a.border:LINE}`,background:active?a.dim:"transparent",color:active?a.color:MUTED,cursor:"pointer",textAlign:"left",fontFamily,display:"flex",alignItems:"center",gap:9,boxShadow:active?`0 0 10px ${a.glow}`:"none",transition:"border-color .1s,background .1s,color .1s,box-shadow .16s"}}
            onClick={()=>{setAgent(key);setCenterView("chat");if(mobile)setMobileTab("chat");}}
          >
            <span style={{fontSize:16}}>{a.icon}</span>
            <div><div style={{fontSize:13,fontWeight:700}}>{a.name}</div><div style={{fontSize:10,opacity:.65}}>{a.title}</div></div>
            {key===agent && sending && (
              <span title={`${a.name} is working…`} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:9,opacity:.8}}>thinking</span>
                <span style={{width:7,height:7,borderRadius:"50%",background:a.color,animation:"thinkpulse 1s ease-in-out infinite"}} />
              </span>
            )}
          </button>
        );})}
        <style>{"@keyframes thinkpulse{0%,100%{opacity:.25}50%{opacity:1}}"}</style>
      </div>

      {/* The Academy — Learn-to-Play is its own section (like the Vault), a
          multi-format training area: Standard 1v1 + Commander 4P FFA. */}
      <div>
        <div style={sectionLabel}>Train</div>
        <button
          style={navRow(centerView==="learn")}
          onClick={()=>{setCenterView("learn");if(mobile)setMobileTab("chat");}}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}} aria-hidden="true"><path d="M12 3 1 8.5 12 14l9-4.5V15h2V8.5L12 3zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.5-7-3.5z"/></svg>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700}}>The Academy</div><div style={{fontSize:10,opacity:.65}}>Learn to play · 1v1 &amp; 4P</div></div>
          <StabilityBadge level="preview" />
        </button>
        <button
          style={navRow(centerView==="sim")}
          onClick={()=>{setCenterView("sim");if(mobile)setMobileTab("chat");}}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="7" r="1"/></svg>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700}}>Sim Center</div><div style={{fontSize:10,opacity:.65}}>Self-play · stress test · data</div></div>
          <StabilityBadge level="beta" />
        </button>
      </div>

      <div>
        <div style={sectionLabel}>Library</div>
        <button
          style={navRow(centerView==="collection")}
          onClick={()=>{setCenterView("collection");if(mobile)setMobileTab("chat");}}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z"/></svg>
          <div><div style={{fontSize:13,fontWeight:700}}>The Vault</div><div style={{fontSize:10,opacity:.65}}>Decks · cards · value</div></div>
        </button>
        <button
          style={navRow(false)}
          onClick={()=>openPodBalance?.()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z"/></svg>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700}}>Pod Balance</div><div style={{fontSize:10,opacity:.65}}>Compare deck brackets</div></div>
          <StabilityBadge level="beta" />
        </button>
      </div>

      <div>
        <button
          onClick={()=>setDecksOpen(open=>!open)}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"none",border:"none",cursor:"pointer",padding:"4px 0",marginBottom:decksOpen?6:0,fontFamily}}
        >
          <span style={{...sectionLabel,marginBottom:0}}>Saved Decks ({savedDecks.length})</span>
          <span style={{fontSize:10,color:"var(--ley-text-faint)",lineHeight:1}}>{decksOpen?"▾":"▸"}</span>
        </button>
        {decksOpen && (<>
        <input
          value={libraryQuery}
          onChange={event => setLibraryQuery(event.target.value)}
          placeholder="Search decks"
          style={{width:"100%",padding:"7px 8px",marginBottom:6,borderRadius:5,border:`1px solid ${LINE}`,background:"transparent",color:TEXT,fontSize:11,fontFamily}}
        />
        <select
          value={ownerFilter}
          onChange={event => setOwnerFilter(event.target.value)}
          style={{width:"100%",padding:"7px 8px",marginBottom:8,borderRadius:5,border:`1px solid ${LINE}`,background:BG2,color:TEXT,fontSize:11,fontFamily}}
        >
          {owners.map(owner => <option key={owner}>{owner}</option>)}
        </select>
        {filteredDecks.map(d=>(
          <div key={d.id} style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
            <button
              style={{flex:1,padding:"6px 8px",borderRadius:5,border:`1px solid ${d.id===activeDeckId?"var(--ley-line-bright)":LINE}`,background:d.id===activeDeckId?"var(--ley-green-dim)":"transparent",color:d.id===activeDeckId?GOLD:TEXT,cursor:"pointer",fontSize:11,fontFamily,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
              onClick={()=>{setActiveDeckId(d.id);if(mobile)setMobileTab("chat");}}
            >
              <span style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
              <span style={{display:"block",fontSize:9,color:d.id===activeDeckId?GOLD:MUTED,marginTop:2}}>{d.memory?.owner || "Colton"}</span>
              <span style={{display:"block",fontSize:9,color:MUTED,marginTop:2}}>
                {(d.cards||[]).filter(c=>c.section!=="Sideboard"&&c.section!=="Tokens").reduce((s,c)=>s+c.qty,0)} cards | {(d.cards||[]).filter(c=>c.section==="Tokens").reduce((s,c)=>s+c.qty,0)} tokens | {(d.memory?.games||[]).length} games
                {((d.memory?.karnPlans||[]).length || (d.memory?.tibaltRoasts||[]).length) ? ` | ${(d.memory?.karnPlans||[]).length} plans/${(d.memory?.tibaltRoasts||[]).length} roasts` : ""}
              </span>
            </button>
            <button aria-label={`Delete ${d.name}`} title={`Delete ${d.name}`} onClick={()=>deleteDeck(d.id)} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 3px",flexShrink:0}}>×</button>
          </div>
        ))}
        {!filteredDecks.length&&(
          <div style={{fontSize:11,color:MUTED,lineHeight:1.4,padding:"4px 0 8px"}}>No saved decks match that filter.</div>
        )}
        <button style={sb(false)} onClick={()=>{setCenterView("import");if(mobile)setMobileTab("chat");}}>+ Import Deck</button>
        <button style={sb(true)} onClick={exportDeckLibrary}>Export Library</button>
        <button style={sb(true)} onClick={backupLibrary}>Backup Library</button>
        <button style={sb(true)} onClick={()=>libraryImportRef.current?.click()}>Import Library</button>
        <input ref={libraryImportRef} type="file" accept="application/json,.json" onChange={importLibrary} style={{display:"none"}} />
        {libraryStatus&&(
          <div style={{fontSize:10,color:MUTED,lineHeight:1.35,padding:"2px 0 6px"}}>{libraryStatus}</div>
        )}
        {activeDeckId&&(
          <>
            <button style={sb(true)} onClick={()=>{setCenterView("deck");if(mobile)setMobileTab("chat");}}>View Deck</button>
            <button style={sb(true)} onClick={exportDeck}>Export .txt</button>
            <button style={sb(true)} onClick={unloadActiveDeck}>Unload Deck</button>
          </>
        )}
        </>)}
      </div>

      {mobile&&(
        <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:5}}>
          <button style={sb(true)} onClick={exportChat}>Export Chat</button>
          <button style={sb(true)} onClick={clearChat}>Clear Chat</button>
        </div>
      )}
    </div>
  );
}
