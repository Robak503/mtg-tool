/**
 * AgentsHome — the Agents area's front door: three big kiosk squares,
 * one per front-facing agent, pixel-art portrait + name + what they do.
 * Picking one drops straight into that agent's chat.
 */
import { AGENTS } from "../../lib/agents";
import { JacePixel, KarnPixel, TibaltPixel } from "./areas";

const PORTRAITS = { jace: JacePixel, karn: KarnPixel, tibalt: TibaltPixel };

const BLURBS = {
  jace: "Rules, interactions, table questions — plain answers, Arbiter-checked.",
  karn: "Deck architecture: analyze, upgrade, and build around a commander.",
  tibalt: "Load a deck. Get roasted. Leave with a better list.",
};

export default function AgentsHome({ onPickAgent, fontFamily }) {
  const entries = Object.entries(AGENTS).filter(([, a]) => a.frontFacing !== false);
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        padding: 32,
        overflowY: "auto",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 30,
            margin: 0,
            color: "var(--ley-text)",
          }}
        >
          Who do you need?
        </h1>
        <div style={{ fontSize: 13, color: "var(--ley-text-dim)", marginTop: 6 }}>
          Three specialists. One table.
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {entries.map(([key, a]) => {
          const Portrait = PORTRAITS[key];
          return (
            <button
              key={key}
              onClick={() => onPickAgent(key)}
              className="ley-card"
              style={{
                width: 250,
                height: 300,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                cursor: "pointer",
                background: "var(--ley-glass)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: `1px solid ${a.border}`,
                borderRadius: "var(--r-xl)",
                fontFamily,
                padding: 20,
              }}
            >
              {Portrait && (
                <span aria-hidden style={{ filter: `drop-shadow(0 0 10px ${a.glow})` }}>
                  <Portrait size={96} />
                </span>
              )}
              <span
                style={{
                  fontFamily: "var(--font-display), sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: a.color,
                }}
              >
                {a.name}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--ley-text-faint)",
                }}
              >
                {a.title}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ley-text-dim)",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {BLURBS[key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
