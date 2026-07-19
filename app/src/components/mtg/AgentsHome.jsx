"use client";

/**
 * AgentsHome — the Agents' hall, rebuilt in the JEWEL & MACHINE register
 * (overnight rework 2026-07-19).
 *
 * The three specialists stand as machined door panes wearing their OWN CARD ART
 * (the little-artworks direction — pixel portraits stay underneath as the
 * fallback layer, so a face is never a black void while art resolves).
 * Identity colors stay per agent (the sanctioned non-green exception).
 *
 * NO RAIL in this room — the whole room IS the conversation; picking a
 * specialist drops straight into their chat.
 */
import { AGENTS } from "../../lib/agents";
import RoomHeader from "./RoomHeader";
import { JacePixel, KarnPixel, TibaltPixel } from "./areas";

const PORTRAITS = { jace: JacePixel, karn: KarnPixel, tibalt: TibaltPixel };

/* Each agent's face card — verified against the bundled oracle; art-crop resolves
   by name with the pixel portrait as the under-layer when it can't. */
const FACE_CARDS = {
  jace: "Jace, the Mind Sculptor",
  karn: "Karn Liberated",
  tibalt: "Tibalt, the Fiend-Blooded",
};

const BLURBS = {
  jace: "Rules, interactions, table questions — plain answers, Arbiter-checked.",
  karn: "Deck architecture: analyze, upgrade, and build around a commander.",
  tibalt: "Load a deck. Get roasted. Leave with a better list.",
};

export default function AgentsHome({ onPickAgent, fontFamily }) {
  const entries = Object.entries(AGENTS).filter(([, a]) => a.frontFacing !== false);
  const halls = entries.map(([key, a]) => ({ id: key, label: `${a.name} — ${a.title}` }));

  return (
    <div className="ley-stage" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, padding: "20px 22px", overflowY: "auto", fontFamily, minHeight: 0, position: "relative" }}>
      <RoomHeader title="THE AGENTS" tagline="Three specialists · one table" halls={halls} onPick={onPickAgent} />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
          {entries.map(([key, a], i) => {
            const Portrait = PORTRAITS[key];
            return (
              <button
                key={key}
                onClick={() => onPickAgent(key)}
                className="ley-glass ley-pane ley-door ley-rise"
                style={{
                  width: 290,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  cursor: "pointer",
                  border: `1px solid ${a.border}`,
                  borderRadius: "var(--r-xl)",
                  fontFamily,
                  padding: 0,
                  overflow: "hidden",
                  textAlign: "left",
                  animationDelay: `${110 + i * 80}ms`,
                  background: "var(--ley-glass)",
                }}
                title={`Talk to ${a.name}`}
              >
                {/* The face: real card art over the pixel-portrait fallback — never a void */}
                <div style={{ position: "relative", width: "100%", aspectRatio: "290 / 170", overflow: "hidden", background: "var(--ley-surface-2)", borderBottom: `1px solid ${a.border}` }}>
                  <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 10px ${a.glow})` }}>
                    {Portrait && <Portrait size={96} />}
                  </div>
                  <img
                    src={`/api/art-crop?name=${encodeURIComponent(FACE_CARDS[key])}`}
                    alt=""
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                  />
                  {/* engraved vignette so the nameplate reads over any art */}
                  <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 45%, rgba(1,2,2,0.82) 100%)" }} />
                  <div style={{ position: "absolute", left: 14, bottom: 10, right: 14 }}>
                    <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 21, fontWeight: 700, color: a.color, textShadow: "0 1px 3px #000" }}>
                      {a.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
                      {a.title}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
                  {BLURBS[key]}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
