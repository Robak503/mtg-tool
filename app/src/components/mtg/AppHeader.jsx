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
  pb,
  colors,
  fontFamily,
}) {
  const { BG2, LINE, GOLD } = colors;

  return (
    <div style={{padding:"9px 16px",borderBottom:`1px solid ${LINE}`,background:BG2,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
      <span style={{fontFamily,fontSize:16,fontWeight:700,color:GOLD,letterSpacing:"0.05em"}}>MTG Assistant</span>
      <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
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
            <button onClick={exportChat} style={pb(false,true)}>Export Chat</button>
            <button onClick={clearChat} style={pb(false,true)}>Clear Chat</button>
          </>
        )}
      </div>
    </div>
  );
}
