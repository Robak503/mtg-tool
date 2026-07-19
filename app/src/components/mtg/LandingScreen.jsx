"use client";

/**
 * LandingScreen — the FRONT HALL (Colton's morning verdict, 2026-07-19): THREE
 * zone doors — Crucible · Academy · Vault — plus THE KEEPER's rail, so a lost
 * visitor always has someone to ask. The Agents door is gone from the landing:
 * agents live in the rails now (Karn's bench stays reachable from the bottom
 * bar until the bench itself goes rail-first).
 *
 * ONE SET OF DOORS (his follow-up: "we have 2 sets of buttons for the doors on
 * this one page"): the squares are the ONLY navigation, and they carry the live
 * house numbers themselves (games kept · judge cases · vault worth — the same
 * local APIs the rooms use, honest "…" until read). The Keeper's rail is pure
 * concierge chat; the ledger feeds his charter, not a second row of buttons.
 *
 * Material register: machined doors (ley-pane + ley-door), staggered one-shot
 * entrances, hero-face wordmark. Driven by the AREAS registry minus "agents".
 */
import { useEffect, useState } from "react";

import { AREAS } from "./areas";
import KeeperRail from "./KeeperRail";
import ProfileMenu from "./ProfileMenu";

const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The live line each door wears — honest per-state, never invented. */
function doorStatus(areaId, house) {
  if (!house) return "…";
  if (areaId === "proving") return house.games === 1 ? "1 game kept, full tail" : `${house.games ?? 0} games kept, full tails`;
  if (areaId === "academy") return house.judgeReady ? `${house.judgeCases} judge cases ready to try you` : "trial corpus awaits a data sync";
  if (areaId === "vault") return house.printings > 0 ? `${house.printings.toLocaleString()} printings · ${usd(house.vaultValue)} under glass` : "the shelves await your first cards";
  return null;
}

export default function LandingScreen({
  appVersion,
  onEnterArea,
  resume = [],
  fontFamily,
  profiles,
  activeProfile,
  activeProfileId,
  onSwitchProfile,
  onManageProfiles,
  profileColors,
}) {
  const zones = AREAS.filter((a) => a.id !== "agents");

  // The house ledger — three light local GETs; feeds the doors' status lines
  // AND the Keeper's charter. null = still reading (doors show "…").
  const [house, setHouse] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const grab = async (url) => {
        try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
      };
      const [records, quiz, dash] = await Promise.all([
        grab("/api/records"),
        grab("/api/judge-quiz"),
        grab("/api/collection/dashboard"),
      ]);
      if (!alive) return;
      setHouse({
        games: records?.records?.length ?? 0,
        judgeReady: !!quiz?.ready,
        judgeCases: quiz?.total ?? 0,
        printings: dash?.uniquePrintings ?? 0,
        vaultValue: dash?.vaultValue ?? 0,
      });
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div
      className="ley-stage"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily,
        color: "var(--ley-text)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top strip: wordmark + version / profile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px" }}>
        <span
          style={{
            fontFamily: "var(--font-hero), serif",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "0.08em",
            color: "transparent",
            backgroundImage: "linear-gradient(180deg,var(--ley-green-bright) 0%,var(--ley-green) 52%,var(--ley-green-deep) 100%)",
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

      {/* the hall: three zone doors + the Keeper */}
      <div style={{ flex: 1, display: "flex", gap: 16, padding: "0 22px 12px", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              padding: "0 10px",
              flexWrap: "wrap",
            }}
          >
            {zones.map((area, i) => {
              const Icon = area.icon;
              return (
                <button
                  key={area.id}
                  onClick={() => onEnterArea(area.id)}
                  className="ley-glass ley-pane ley-door ley-rise"
                  style={{
                    width: 280,
                    height: 330,
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
                    animationDelay: `${90 + i * 80}ms`,
                  }}
                >
                  <span aria-hidden style={{ filter: "drop-shadow(0 0 12px var(--ley-green-glow))" }}>
                    <Icon size={84} />
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-hero), serif",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "var(--ley-text)",
                    }}
                  >
                    {area.title}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ley-text-dim)", textAlign: "center", lineHeight: 1.5 }}>
                    {area.tagline}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "var(--ley-green)", textAlign: "center", minHeight: 14 }}>
                    {doorStatus(area.id, house)}
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

          {/* continue where you left off (K8) */}
          {resume.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "0 20px 14px" }}>
              {resume.map((r, i) => (
                <button
                  key={i}
                  onClick={r.onClick}
                  className="btn btn-ghost btn-sm"
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, padding: "6px 12px", textAlign: "left" }}
                >
                  <span style={{ fontSize: 12, color: "var(--ley-text)" }}>{r.label}</span>
                  <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-text-faint)", fontFamily: "var(--font-mono), monospace" }}>{r.sub}</span>
                </button>
              ))}
            </div>
          )}

          {/* footer line */}
          <div
            style={{
              textAlign: "center",
              padding: "0 0 14px",
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

        {/* the Keeper minds the front hall — pure concierge, no second set of doors */}
        <KeeperRail fontFamily={fontFamily} house={house} />
      </div>
    </div>
  );
}
