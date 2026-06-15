/**
 * MobileTabBar — the bottom tab bar shown only on the mobile breakpoint:
 * switches the active view between Chat / Sessions / Search / Stats / Decks.
 */
export default function MobileTabBar({ cfg, mobileTab, setMobileTab, colors, fontFamily }) {
  const { BG2, LINE, MUTED } = colors;
  const tabs = [
    ["chat", "Chat", "💬"],
    ["sessions", "Sessions", "🗂"],
    ["search", "Search", "🔍"],
    ["stats", "Stats", "📊"],
    ["decks", "Decks", "🃏"],
  ];

  return (
    <div role="tablist" style={{borderTop:`1px solid ${LINE}`,background:BG2,display:"flex",flexShrink:0}}>
      {tabs.map(([tab,label,icon])=>(
        <button
          key={tab}
          role="tab"
          aria-label={label}
          aria-selected={mobileTab===tab}
          style={{flex:1,padding:"8px 0",background:mobileTab===tab?cfg.dim:"transparent",border:"none",borderTop:mobileTab===tab?`2px solid ${cfg.color}`:"2px solid transparent",color:mobileTab===tab?cfg.color:MUTED,cursor:"pointer",fontSize:11,fontFamily,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
          onClick={()=>setMobileTab(tab)}
        >
          <span aria-hidden="true">{icon}</span><span>{label}</span>
        </button>
      ))}
    </div>
  );
}
