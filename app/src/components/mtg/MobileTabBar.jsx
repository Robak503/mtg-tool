/**
 * MobileTabBar — the bottom tab bar shown only on the mobile breakpoint:
 * switches the active view between Chat / Sessions / Search / Stats / Decks.
 */
// Inline SVG icons (stroke = currentColor), matching the sidebar's Aether icon
// treatment. Replaces the old setup where the "icon" slot held the label text,
// which rendered every label twice.
const ICONS = {
  chat: <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" />,
  sessions: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  decks: <><rect x="3" y="5" width="13" height="15" rx="2" /><path d="M8 5V3h13v15h-2" /></>,
};

export default function MobileTabBar({ cfg, mobileTab, setMobileTab, colors, fontFamily }) {
  const { BG2, LINE, MUTED } = colors;
  const tabs = [
    ["chat", "Chat"],
    ["sessions", "Sessions"],
    ["search", "Search"],
    ["stats", "Stats"],
    ["decks", "Decks"],
  ];

  return (
    <div style={{borderTop:`1px solid ${LINE}`,background:BG2,display:"flex",flexShrink:0}}>
      {tabs.map(([tab,label])=>(
        <button
          key={tab}
          style={{flex:1,padding:"8px 0",background:mobileTab===tab?cfg.dim:"transparent",border:"none",borderTop:mobileTab===tab?`2px solid ${cfg.color}`:"2px solid transparent",color:mobileTab===tab?cfg.color:MUTED,cursor:"pointer",fontSize:11,fontFamily,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}
          onClick={()=>setMobileTab(tab)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[tab]}</svg>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
