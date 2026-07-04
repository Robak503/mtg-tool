/**
 * LandingScreen — the kiosk HOME. First thing after the profile gate:
 * one big card per area (driven by the AREAS registry in areas.jsx —
 * adding an entry there automatically adds a card here). No other chrome:
 * wordmark + version top-left, profile chip top-right, cards center.
 */
import { AREAS } from "./areas";
import ProfileMenu from "./ProfileMenu";

export default function LandingScreen({
  appVersion,
  onEnterArea,
  fontFamily,
  profiles,
  activeProfile,
  activeProfileId,
  onSwitchProfile,
  onManageProfiles,
  profileColors,
}) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily,
        color: "var(--ley-text)",
        background:
          "radial-gradient(ellipse 100% 70% at 50% -10%, rgba(86,214,93,0.08) 0%, rgba(86,214,93,0.015) 36%, transparent 62%), var(--ley-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top strip: wordmark + version / profile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px" }}>
        <span
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: "transparent",
            background: "linear-gradient(180deg,#74ff86 0%,#56d65d 52%,#2e9a3f 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 9px rgba(86,214,93,.40))",
          }}
        >
          MTG Tool
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 400,
              color: "var(--ley-text-faint)",
              fontFamily: "var(--font-mono), monospace",
              WebkitBackgroundClip: "initial",
              backgroundClip: "initial",
              background: "none",
            }}
          >
            v{appVersion}
          </span>
        </span>
        {profiles?.length > 0 && onSwitchProfile && (
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
      </div>

      {/* the three doors */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "0 32px 60px",
          flexWrap: "wrap",
        }}
      >
        {AREAS.map((area) => {
          const Icon = area.icon;
          return (
            <button
              key={area.id}
              onClick={() => onEnterArea(area.id)}
              className="ley-card ley-glass"
              style={{
                width: 300,
                height: 340,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 20,
                cursor: "pointer",
                background: "var(--ley-glass)",
                border: "1px solid var(--ley-line)",
                borderRadius: "var(--r-xl)",
                color: "var(--ley-text)",
                fontFamily,
                padding: 24,
              }}
            >
              <span
                aria-hidden
                style={{ filter: "drop-shadow(0 0 12px var(--ley-green-glow))" }}
              >
                <Icon size={84} />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display), sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--ley-text)",
                }}
              >
                {area.title}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--ley-text-dim)",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {area.tagline}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--ley-green)",
                }}
              >
                Enter ▸
              </span>
            </button>
          );
        })}
      </div>

      {/* footer line */}
      <div
        style={{
          textAlign: "center",
          padding: "0 0 18px",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--ley-text-faint)",
        }}
      >
        Local-first · your table, your data
      </div>
    </div>
  );
}
