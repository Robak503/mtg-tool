/**
 * AppHeader — the top header bar: the active-agent indicator, the Arbiter
 * Fast vs Full toggle, model tier / status + knowledge status, export/clear
 * chat, the right-panel show/hide toggle, and the profile switcher. Style props
 * (cfg, ...) follow the vocabulary documented in MTGAssistant.jsx.
 */
import ProfileMenu from "./ProfileMenu";

export default function AppHeader({
  agent,
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
  openSettings,
  appVersion,
  pb,
  colors,
  fontFamily,
  profiles,
  activeProfile,
  activeProfileId,
  onSwitchProfile,
  onManageProfiles,
  profileColors,
}) {
  const { BG2, LINE } = colors;
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

  // Build warning chips from knowledge status. Data-freshness chips set
  // `sync: true` so they become click-to-open-the-Updates-panel buttons (B5);
  // the Ollama ones stay informational.
  const warnings = [];
  if (knowledgeStatus) {
    const { ollama, spellbook, salt, cardData, rulesFreshness } = knowledgeStatus;
    if (ollama && !ollama.available) {
      warnings.push({ key: "ollama-down", text: "Ollama offline", detail: "Start with: ollama serve", color: "var(--ley-red)" });
    } else if (ollama?.missingModels?.length) {
      warnings.push({ key: "models-missing", text: `Model missing`, detail: `Run: ollama pull ${ollama.missingModels[0]}`, color: "var(--ley-red)" });
    }
    if (cardData?.stale) {
      warnings.push({ key: "carddata-stale", text: `Card data ${cardData.staleDays}d old`, detail: "Open Data & Updates to refresh card data from Scryfall", color: "var(--ley-gold)", sync: true });
    }
    if (spellbook?.stale) {
      warnings.push({ key: "spellbook-stale", text: `Combos ${spellbook.staleDays}d old`, detail: "Open Data & Updates to refresh combos", color: "var(--ley-gold)", sync: true });
    }
    if (salt?.stale) {
      warnings.push({ key: "salt-stale", text: `Salt ${salt.staleDays}d old`, detail: "Open Data & Updates to refresh EDHREC salt", color: "var(--ley-gold)", sync: true });
    }
    if (rulesFreshness?.stale) {
      warnings.push({ key: "rules-stale", text: `Rules ${rulesFreshness.staleDays}d old`, detail: "Open Data & Updates to refresh the Comprehensive Rules", color: "var(--ley-gold)", sync: true });
    }
  }

  return (
    <div style={{padding:"9px 16px",borderBottom:`1px solid ${LINE}`,background:BG2,backdropFilter:"blur(16px) saturate(1.2)",WebkitBackdropFilter:"blur(16px) saturate(1.2)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
      <span style={{fontFamily:"var(--font-display), Georgia, serif",fontSize:18,fontWeight:700,letterSpacing:"-0.01em",color:"transparent",background:"linear-gradient(180deg,#74ff86 0%,#56d65d 52%,#2e9a3f 100%)",WebkitBackgroundClip:"text",backgroundClip:"text",filter:"drop-shadow(0 0 9px rgba(86,214,93,.40))"}}>
        MTG Assistant
        {appVersion && (
          <span style={{
            marginLeft:8,fontSize:11,fontWeight:400,color:"var(--on-surface-variant)",letterSpacing:"normal",fontFamily:"var(--font-mono), Consolas, monospace"
          }}>v{appVersion}</span>
        )}
      </span>
      <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
        {!mobile && profiles?.length > 0 && onSwitchProfile && (
          <ProfileMenu
            activeProfile={activeProfile}
            profiles={profiles}
            activeId={activeProfileId}
            onSwitch={onSwitchProfile}
            onManage={onManageProfiles}
            colors={profileColors}
            fontFamily={fontFamily}
          />
        )}
        {warnings.map(w => {
          const chipStyle = {
            // color-mix keeps the border a soft 30% tint of the (token) chip color
            border:`1px solid color-mix(in srgb, ${w.color} 30%, transparent)`,
            borderRadius:5,
            color:w.color,
            fontFamily,
            fontSize:11,
            padding:"5px 8px",
            whiteSpace:"nowrap",
            background:"transparent",
          };
          return (w.sync && openUpdates) ? (
            <button key={w.key} title={w.detail} onClick={openUpdates} style={{...chipStyle, cursor:"pointer"}}>
              ⚠ {w.text} ↻
            </button>
          ) : (
            <span key={w.key} title={w.detail} style={{...chipStyle, cursor:"default"}}>
              ⚠ {w.text}
            </span>
          );
        })}
        {modelStatus&&(
          <span
            title={`Last provider: ${lastProvider} | tier: ${lastTier} | model: ${lastModel}${failedCalls ? ` | failed calls: ${failedCalls}` : ""}`}
            style={{
              border:`1px solid ${LINE}`,
              borderRadius:5,
              color:failedCalls?"#c2786f":"var(--on-surface-variant)",
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
                    background:active?"var(--ley-green-dim)":"transparent",
                    color:active?"var(--ley-green)":"var(--on-surface-variant)",
                    fontWeight:active?700:400,
                    cursor:"pointer",
                    fontFamily,
                    fontSize:11,
                    padding:"5px 9px",
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
            style={{...pb(false,true),background:fastMode?"var(--ley-green-dim)":"transparent"}}
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
            {openSettings && (
              <button
                onClick={openSettings}
                title="Settings — models, privacy, data, and about"
                style={pb(false,true)}
              >
                ⚙ Settings
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
