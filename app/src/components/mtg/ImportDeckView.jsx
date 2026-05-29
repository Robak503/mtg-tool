export default function ImportDeckView({
  cfg,
  pb,
  colors,
  fontFamily,
  projectSearch,
  setProjectSearch,
  projectRequested,
  setProjectRequested,
  loadFromProject,
  deckName,
  setDeckName,
  deckOwner,
  setDeckOwner,
  tokenCatalogReady,
  deckRaw,
  setDeckRaw,
  importDeck,
  setCenterView,
}) {
  const { BG, BG3, LINE, TEXT, MUTED, GOLD } = colors;

  return (
    <div style={{flex:1,overflowY:"auto",padding:20}}>
      <div style={{maxWidth:520,margin:"0 auto"}}>
        <div style={{fontFamily,fontSize:18,color:"#cec8e0",marginBottom:14}}>Import Deck</div>

        <div style={{background:BG3,border:`1px solid ${cfg.border}`,borderRadius:8,padding:14,marginBottom:18}}>
          <div style={{fontSize:13,fontWeight:700,color:cfg.color,fontFamily,marginBottom:4}}>Load from Project</div>
          <div style={{fontSize:11,color:MUTED,marginBottom:10,lineHeight:1.65}}>
            If you've uploaded deck files to this project named by commander, enter the commander name and Claude will retrieve it automatically.
          </div>
          <div style={{display:"flex",gap:8,marginBottom: projectRequested?10:0}}>
            <input
              value={projectSearch}
              onChange={e=>{setProjectSearch(e.target.value);setProjectRequested(false);}}
              onKeyDown={e=>{if(e.key==="Enter")loadFromProject();}}
              placeholder="e.g. Atraxa, Praetors' Voice"
              style={{flex:1,padding:"7px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily}}
            />
            <button
              onClick={loadFromProject}
              disabled={!projectSearch.trim()}
              style={{...pb(true,true),opacity:projectSearch.trim()?1:.45,whiteSpace:"nowrap"}}
            >
              Request Deck
            </button>
          </div>
          {projectRequested&&(
            <div style={{padding:"10px 12px",borderRadius:6,background:cfg.dim,border:`1px solid ${cfg.border}`,fontSize:12,color:cfg.color,lineHeight:1.6}}>
              Sent to chat. Copy Claude's full response and paste it below, then click Import.
            </div>
          )}
        </div>

        <div style={{fontSize:11,color:MUTED,marginBottom:6,fontFamily}}>Or paste a deck list manually:</div>
        <input
          value={deckName}
          onChange={e=>setDeckName(e.target.value)}
          placeholder="Deck name..."
          style={{width:"100%",padding:"8px 12px",marginBottom:10,background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:14,fontFamily}}
        />
        <input
          value={deckOwner}
          onChange={e=>setDeckOwner(e.target.value)}
          placeholder="Owner..."
          style={{width:"100%",padding:"8px 12px",marginBottom:10,background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:14,fontFamily}}
        />
        <div style={{fontSize:11,color:MUTED,marginBottom:8,lineHeight:1.6}}>
          Formats: <code style={{fontFamily:"monospace",color:cfg.color}}>4 Lightning Bolt</code> | <code style={{fontFamily:"monospace",color:cfg.color}}>SB: 2 Negate</code> | use <code style={{fontFamily:"monospace",color:cfg.color}}>Commander</code>, <code style={{fontFamily:"monospace",color:cfg.color}}>Mainboard</code>, <code style={{fontFamily:"monospace",color:cfg.color}}>Sideboard</code>, or <code style={{fontFamily:"monospace",color:cfg.color}}>Tokens</code>.
        </div>
        <div style={{fontSize:11,color:tokenCatalogReady?MUTED:GOLD,marginBottom:8,lineHeight:1.5}}>
          Supports text lists and CSV rows like <code style={{fontFamily:"monospace",color:cfg.color}}>1,"Zaxara, the Exemplary"</code>.
          <br/>
          {tokenCatalogReady?"Scryfall token catalog loaded. Token rows will be saved in their own section.":"Token catalog not loaded yet; common tokens still separate."}
        </div>
        <textarea
          value={deckRaw}
          onChange={e=>setDeckRaw(e.target.value)}
          placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nMainboard\n38 lands...\n60 spells...\n\nSideboard\n2 Tormod's Crypt\n\nTokens\n1 Treasure"}
          style={{width:"100%",minHeight:220,padding:"10px 12px",background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:12,fontFamily:"monospace",resize:"vertical",lineHeight:1.65}}
        />
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={importDeck} disabled={!deckRaw.trim()} style={{...pb(true),opacity:deckRaw.trim()?1:.45}}>Import Deck</button>
          <button onClick={()=>{setCenterView("chat");setProjectRequested(false);}} style={pb(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
