import { AGENTS } from "../../lib/agents";
import { useMemo, useRef, useState } from "react";

export default function Sidebar({
  agent,
  activeDeckId,
  cfg,
  mobile,
  savedDecks,
  setAgent,
  setCenterView,
  setDeckData,
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
  sb,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, MUTED, TEXT } = colors;
  const [libraryQuery, setLibraryQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [libraryStatus, setLibraryStatus] = useState("");
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

  return (
    <div style={{width:mobile?"100%":172,flexShrink:0,borderRight:mobile?"none":`1px solid ${LINE}`,background:BG2,padding:12,display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
      <div>
        <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Agent</div>
        {Object.entries(AGENTS).filter(([, a]) => a.frontFacing !== false).map(([key,a])=>(
          <button
            key={key}
            style={{width:"100%",padding:"8px 10px",marginBottom:5,borderRadius:6,border:`1px solid ${key===agent?a.border:LINE}`,background:key===agent?a.dim:"transparent",color:key===agent?a.color:MUTED,cursor:"pointer",textAlign:"left",fontFamily,display:"flex",alignItems:"center",gap:8,boxShadow:key===agent?`0 0 8px ${a.glow}`:"none"}}
            onClick={()=>{setAgent(key);setCenterView("chat");if(mobile)setMobileTab("chat");}}
          >
            <span style={{fontSize:16}}>{a.icon}</span>
            <div><div style={{fontSize:13,fontWeight:700}}>{a.name}</div><div style={{fontSize:10,opacity:.65}}>{a.title}</div></div>
          </button>
        ))}
      </div>

      <div>
        <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Saved Decks</div>
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
              style={{flex:1,padding:"6px 8px",borderRadius:5,border:`1px solid ${d.id===activeDeckId?cfg.border:LINE}`,background:d.id===activeDeckId?cfg.dim:"transparent",color:d.id===activeDeckId?cfg.color:TEXT,cursor:"pointer",fontSize:11,fontFamily,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
              onClick={()=>{setActiveDeckId(d.id);setDeckData({});if(mobile)setMobileTab("chat");}}
            >
              <span style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
              <span style={{display:"block",fontSize:9,color:cfg.color,marginTop:2}}>{d.memory?.owner || "Colton"}</span>
              <span style={{display:"block",fontSize:9,color:MUTED,marginTop:2}}>
                {(d.cards||[]).filter(c=>c.section!=="Sideboard"&&c.section!=="Tokens").reduce((s,c)=>s+c.qty,0)} cards | {(d.cards||[]).filter(c=>c.section==="Tokens").reduce((s,c)=>s+c.qty,0)} tokens | {(d.memory?.games||[]).length} games
                {((d.memory?.karnPlans||[]).length || (d.memory?.tibaltRoasts||[]).length) ? ` | ${(d.memory?.karnPlans||[]).length} plans/${(d.memory?.tibaltRoasts||[]).length} roasts` : ""}
              </span>
            </button>
            <button onClick={()=>deleteDeck(d.id)} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 3px",flexShrink:0}}>x</button>
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
