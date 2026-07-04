/**
 * MobileTabBar — the bottom tab bar shown only on the mobile breakpoint:
 * switches the active view between Chat / Sessions / Search / Stats / Decks.
 */
export default function MobileTabBar({ mobileTab, setMobileTab, onHome, colors, fontFamily }) {
  const { BG2, LINE, MUTED } = colors;
  const tabs = [
    ["home", "Home", "⌂"],
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
          style={{flex:1,padding:"10px 0",background:mobileTab===tab?"var(--ley-green-dim)":"transparent",border:"none",borderTop:mobileTab===tab?"2px solid var(--ley-green)":"2px solid transparent",color:mobileTab===tab?"var(--ley-green)":MUTED,cursor:"pointer",fontSize:11,fontFamily,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
          onClick={()=>{ if(tab==="home"){ onHome?.(); } else { setMobileTab(tab); } }}
        >
          <span aria-hidden="true">{icon}</span><span>{label}</span>
        </button>
      ))}
    </div>
  );
}
