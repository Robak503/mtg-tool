export default function AppHeader({
  agent,
  cfg,
  fastMode,
  mobile,
  rightOpen,
  setFastMode,
  setRightOpen,
  exportChat,
  clearChat,
  deckLock,
  modelStatus,
  modelProvider,
  setModelProvider,
  unlockDeck,
  pb,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, GOLD } = colors;
  const localCalls = modelStatus?.providers?.ollama?.total || 0;
  const apiCalls = modelStatus?.providers?.anthropic?.total || 0;
  const failedCalls = (modelStatus?.providers?.ollama?.failed || 0) + (modelStatus?.providers?.anthropic?.failed || 0);
  const lastProvider = modelStatus?.last?.provider || "none";
  const providerOptions = [
    { id: "ollama", label: "Local" },
    { id: "anthropic", label: "API" },
  ];

  return (
    <div style={{padding:"9px 16px",borderBottom:`1px solid ${LINE}`,background:BG2,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
      <span style={{fontFamily,fontSize:16,fontWeight:700,color:GOLD,letterSpacing:"0.05em"}}>MTG Assistant</span>
      <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
        {modelStatus&&(
          <span
            title={`Last provider: ${lastProvider}${failedCalls ? ` | failed calls: ${failedCalls}` : ""}`}
            style={{
              border:`1px solid ${LINE}`,
              borderRadius:5,
              color:failedCalls?"#c2786f":"#7f8aa3",
              fontFamily,
              fontSize:11,
              padding:"5px 8px",
              whiteSpace:"nowrap",
            }}
          >
            Local {localCalls} | API {apiCalls}
          </span>
        )}
        {!mobile&&(
          <div style={{display:"flex",border:`1px solid ${LINE}`,borderRadius:5,overflow:"hidden"}}>
            {providerOptions.map(option => {
              const active = modelProvider === option.id || (modelProvider === "local" && option.id === "ollama");
              return (
                <button
                  key={option.id}
                  onClick={()=>setModelProvider(option.id)}
                  title={option.id === "ollama" ? "Use local Ollama for the next messages." : "Use Anthropic API for the next messages."}
                  style={{
                    border:0,
                    borderRight:option.id === "ollama" ? `1px solid ${LINE}` : 0,
                    background:active?cfg.dim:"transparent",
                    color:active?cfg.color:"#7f8aa3",
                    cursor:"pointer",
                    fontFamily,
                    fontSize:11,
                    padding:"5px 8px",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
        {!mobile&&!rightOpen&&<button onClick={()=>setRightOpen(true)} style={pb(false,true)}>Show Panel</button>}
        {agent==="arbiter"&&(
          <button
            onClick={()=>setFastMode(!fastMode)}
            title={fastMode?"Fast: compressed prompt, lower cost, slight accuracy drop":"Full: complete engine prompt, max accuracy"}
            style={{...pb(false,true),background:fastMode?cfg.dim:"transparent",borderColor:cfg.border,color:cfg.color}}
          >
            {fastMode?"Fast":"Full"}
          </button>
        )}
        {!mobile&&(
          <>
            {deckLock&&<button onClick={unlockDeck} style={pb(false,true)}>Unlock Deck</button>}
            <button onClick={exportChat} style={pb(false,true)}>Export Chat</button>
            <button onClick={clearChat} style={pb(false,true)}>Clear Chat</button>
          </>
        )}
      </div>
    </div>
  );
}
