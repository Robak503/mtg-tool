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
  knowledgeStatus,
  modelProvider,
  setModelProvider,
  unlockDeck,
  openUpdates,
  pb,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, GOLD } = colors;
  const localCalls = modelStatus?.providers?.ollama?.total || 0;
  const apiCalls = modelStatus?.providers?.anthropic?.total || 0;
  const failedCalls = (modelStatus?.providers?.ollama?.failed || 0) + (modelStatus?.providers?.anthropic?.failed || 0);
  const lastProvider = modelStatus?.last?.provider || "none";
  const lastModel = modelStatus?.last?.model || "unknown";
  const lastTier = modelStatus?.last?.modelTier || (modelStatus?.last?.fastLocal ? "fast" : "unknown");
  const activeModelTier = modelProvider === "ollama" || modelProvider === "local" ? "fast" : modelProvider;
  const providerOptions = [
    { id: "fast", label: "Fast", title: "Use the fast local Ollama model for the next messages." },
    { id: "deep", label: "Deep", title: "Use the deeper local Ollama model for the next messages." },
    { id: "anthropic", label: "API", title: "Use Anthropic API for the next messages." },
  ];

  // Build warning chips from knowledge status.
  const warnings = [];
  if (knowledgeStatus) {
    const { ollama, spellbook, salt } = knowledgeStatus;
    if (ollama && !ollama.available) {
      warnings.push({ key: "ollama-down", text: "Ollama offline", detail: "Start with: ollama serve", color: "#c2786f" });
    } else if (ollama?.missingModels?.length) {
      const missing = ollama.missingModels.join(", ");
      warnings.push({ key: "models-missing", text: `Model missing`, detail: `Run: ollama pull ${ollama.missingModels[0]}`, color: "#c2786f" });
    }
    if (spellbook?.stale) {
      warnings.push({ key: "spellbook-stale", text: `Combos ${spellbook.staleDays}d old`, detail: "Run: npm run sync:spellbook", color: "#b08a3e" });
    }
    if (salt?.stale) {
      warnings.push({ key: "salt-stale", text: `Salt ${salt.staleDays}d old`, detail: "Run: npm run sync:edhrec-salt", color: "#b08a3e" });
    }
  }

  return (
    <div style={{padding:"9px 16px",borderBottom:`1px solid ${LINE}`,background:BG2,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
      <span style={{fontFamily,fontSize:16,fontWeight:700,color:GOLD,letterSpacing:"0.05em"}}>MTG Assistant</span>
      <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
        {warnings.map(w => (
          <span
            key={w.key}
            title={w.detail}
            style={{
              border:`1px solid ${w.color}44`,
              borderRadius:5,
              color:w.color,
              fontFamily,
              fontSize:11,
              padding:"5px 8px",
              whiteSpace:"nowrap",
              cursor:"default",
            }}
          >
            ⚠ {w.text}
          </span>
        ))}
        {modelStatus&&(
          <span
            title={`Last provider: ${lastProvider} | tier: ${lastTier} | model: ${lastModel}${failedCalls ? ` | failed calls: ${failedCalls}` : ""}`}
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
              const active = activeModelTier === option.id;
              return (
                <button
                  key={option.id}
                  onClick={()=>setModelProvider(option.id)}
                  title={option.title}
                  style={{
                    border:0,
                    borderRight:option.id !== providerOptions[providerOptions.length - 1].id ? `1px solid ${LINE}` : 0,
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
            {openUpdates && (
              <button
                onClick={openUpdates}
                title="Refresh card data, combos, and salt scores from official sources"
                style={pb(false,true)}
              >
                ⟳ Updates
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
