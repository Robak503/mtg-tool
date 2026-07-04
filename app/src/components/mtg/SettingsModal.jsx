"use client";

/**
 * SettingsModal — the Vault-era Central Settings screen (D1) + Privacy/Legal/
 * About (D2). One place that gathers the settings that were scattered across the
 * header and the Updates panel: the AI model tier, display info, a plain-English
 * privacy summary ("what leaves your machine"), a launcher into the full Data &
 * Updates panel, and the source-available license + Unofficial Fan Content
 * disclaimer.
 *
 * It deliberately does NOT duplicate the large Data/Updates/Backup UI — that
 * lives in UpdatesModal and is reachable from the Data & Updates section here.
 * Model tier mirrors the header control (both write the same `modelProvider`).
 */

import { useState } from "react";

const REPO_URL = "https://github.com/Robak503/mtg-tool";

const SECTIONS = [
  ["models", "Models"],
  ["display", "Display"],
  ["privacy", "Privacy"],
  ["data", "Data & Updates"],
  ["about", "About & Legal"],
];

const TIERS = [
  { id: "fast", label: "Fast (local)", desc: "The fast local Ollama model. Runs entirely on your machine — no data leaves the PC, no API cost." },
  { id: "deep", label: "Deep (local)", desc: "The deeper local Ollama model — slower, more thorough. Still fully local." },
  { id: "anthropic", label: "API (Anthropic)", desc: "Sends your prompt (and deck/rules context) to the Anthropic API. Costs credits and leaves your machine — used only while this tier is selected." },
];

export default function SettingsModal({
  open,
  onClose,
  modelProvider,
  setModelProvider,
  fastMode,
  setFastMode,
  appVersion,
  onOpenUpdates,
  colors,
  fontFamily,
}) {
  const [section, setSection] = useState("models");
  if (!open) return null;

  const { BG, BG3, LINE, TEXT, MUTED, GOLD } = colors;
  const F = fontFamily;
  const activeTier = modelProvider === "ollama" || modelProvider === "local" ? "fast"
    : modelProvider === "api" || modelProvider === "cloud" ? "anthropic"
    : modelProvider;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: 760, maxWidth: "calc(100vw - 40px)", height: 580, maxHeight: "calc(100vh - 60px)",
          display: "flex", flexDirection: "column", color: TEXT, fontFamily: F, overflow: "hidden",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: "-0.01em" }}>Settings</span>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon">×</button>
        </header>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Section nav */}
          <nav style={{ width: 168, flexShrink: 0, borderRight: `1px solid ${LINE}`, background: BG, padding: "10px 8px", overflowY: "auto" }}>
            {SECTIONS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSection(k)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 10px", marginBottom: 2, borderRadius: 6,
                  background: section === k ? "var(--ley-green-dim)" : "transparent",
                  color: section === k ? "var(--ley-green)" : MUTED,
                  fontWeight: section === k ? 700 : 400,
                  border: "none", cursor: "pointer", fontFamily: F, fontSize: 13,
                }}
              >{label}</button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
            {section === "models" && (
              <Section title="AI model tier">
                <P muted={MUTED}>
                  Pick which model answers your messages. The local tiers run on your machine via
                  Ollama; the API tier uses the Anthropic cloud. The Arbiter rules engine is always
                  local, regardless of this choice.
                </P>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {TIERS.map((t) => {
                    const on = activeTier === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setModelProvider(t.id)}
                        className={on ? "ley-glass" : undefined}
                        style={{
                          textAlign: "left", padding: "11px 13px", borderRadius: 8, cursor: "pointer",
                          background: on ? "var(--ley-green-dim)" : BG3,
                          border: `1px solid ${on ? "var(--ley-green)" : LINE}`, color: TEXT, fontFamily: F,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: on ? "var(--ley-green)" : TEXT }}>{t.label}</span>
                          {on && <span style={{ fontSize: 10, color: "var(--ley-green)", border: "1px solid var(--ley-green)", borderRadius: 3, padding: "1px 6px" }}>active</span>}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 }}>{t.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Arbiter prompt depth</div>
                  <P muted={MUTED}>
                    Controls only the hidden Arbiter rules engine. <strong>Full</strong> sends the
                    complete engine prompt (most accurate); <strong>Fast</strong> uses a compressed
                    prompt (quicker, slightly less precise). This is a per-session choice.
                  </P>
                  <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden", marginTop: 8 }}>
                    {[["full", "Full"], ["fast", "Fast"]].map(([id, label]) => {
                      const on = (id === "fast") === Boolean(fastMode);
                      return (
                        <button key={id} onClick={() => setFastMode(id === "fast")}
                          className="btn btn-sm"
                          style={{ borderRadius: 0, border: 0, background: on ? "var(--ley-green-dim)" : "transparent", color: on ? "var(--ley-green)" : MUTED, fontWeight: on ? 700 : 400 }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>
            )}

            {section === "display" && (
              <Section title="Display">
                <P muted={MUTED}>
                  MTG Tool uses a single hand-tuned theme — <strong>Leyline</strong>: true-black
                  surfaces with a phosphor-green accent, frosted-glass panels, and a
                  Playfair Display / Inter / JetBrains Mono type system.
                </P>
                <P muted={MUTED}>
                  Theme and font customization isn&apos;t available yet. The layout adapts automatically
                  to narrow windows (a compact mobile layout under ~660px wide).
                </P>
              </Section>
            )}

            {section === "privacy" && (
              <Section title="Privacy — what leaves your machine">
                <P muted={MUTED}>
                  MTG Tool is local-first. In normal use, your data stays on this PC.
                </P>
                <Bullets muted={MUTED} text={TEXT} items={[
                  ["Your data is local.", " Decks, collection, chats, games, and feedback are stored only on this machine, in your AppData folder."],
                  ["Chat runs locally by default.", " The Fast and Deep tiers run on your own Ollama install — prompts never leave the PC."],
                  ["Card & rules data is bundled.", " Fresh data is fetched only when you trigger a sync (Scryfall, Commander Spellbook, EDHREC) from Data & Updates."],
                  ["The API tier is opt-in.", " Only when you select the API (Anthropic) model tier is your prompt — with deck and rules context — sent to Anthropic."],
                  ["Update check.", " The app asks GitHub once a day whether a newer version exists. No personal data is sent."],
                  ["Feedback is local + opt-in.", " 👍/👎 feedback is stored on your PC; chat content is attached only if you choose to include it when submitting."],
                ]} />
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Export or delete your data</div>
                  <P muted={MUTED}>
                    Export a full backup (or restore one) from <strong>Data &amp; Updates</strong>. To
                    erase everything, quit the app and delete its data folder:
                    <code style={{ display: "block", marginTop: 6, padding: "6px 8px", background: BG3, borderRadius: 5, fontSize: 11, color: TEXT, fontFamily: "Consolas, Menlo, monospace" }}>
                      %APPDATA%\com.colton.mtg-tool\data
                    </code>
                  </P>
                  <button onClick={onOpenUpdates} className="btn btn-secondary btn-sm">Open Data &amp; Updates →</button>
                </div>
              </Section>
            )}

            {section === "data" && (
              <Section title="Data & Updates">
                <P muted={MUTED}>
                  The Data &amp; Updates panel is home to everything that keeps the app current and
                  your data safe:
                </P>
                <Bullets muted={MUTED} text={TEXT} items={[
                  ["Data sync.", " Refresh card data, combos, salt scores, and prices from official sources — individually or all at once."],
                  ["App updates.", " Check for and install a newer signed release."],
                  ["Backup & restore.", " Export all your data to one file and restore it on another machine."],
                  ["Support bundle.", " Copy a redacted diagnostics summary for bug reports (no secrets, no chat content)."],
                  ["Start with Windows.", " Toggle launching MTG Tool at sign-in."],
                ]} />
                <button onClick={onOpenUpdates} className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>Open Data &amp; Updates →</button>
              </Section>
            )}

            {section === "about" && (
              <Section title="About & Legal">
                <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>MTG Tool</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Version <strong style={{ color: TEXT }}>{appVersion || "dev"}</strong> · a local-first
                  Commander assistant for Windows.
                </div>

                <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>License</div>
                <P muted={MUTED}>
                  Source-available, <strong>not open source</strong>. You may view, study, and build it
                  for your own personal, non-commercial use, and submit contributions. You may not
                  redistribute it, offer it as a hosted service, or create derivative works without
                  written permission. Provided &quot;as is,&quot; without warranty.
                </P>

                <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>Unofficial Fan Content</div>
                <P muted={MUTED}>
                  Magic: The Gathering, card names, card text, and the Comprehensive Rules are the
                  property of Wizards of the Coast LLC. This project is unofficial Fan Content and is
                  not affiliated with, endorsed, or sponsored by Wizards of the Coast. Third-party
                  data and dependencies retain their own licenses and terms.
                </P>

                <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", textDecoration: "none", marginTop: 14 }}>
                  View source on GitHub →
                </a>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ley-text-faint)", margin: "0 0 12px", fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );
}

function P({ children, muted }) {
  return <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: "0 0 8px" }}>{children}</p>;
}

function Bullets({ items, muted, text }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
      {items.map(([lead, rest], i) => (
        <li key={i} style={{ fontSize: 13, color: muted, lineHeight: 1.5, marginBottom: 9, paddingLeft: 16, position: "relative" }}>
          <span style={{ position: "absolute", left: 0, color: "var(--ley-green)" }}>•</span>
          <strong style={{ color: text }}>{lead}</strong>{rest}
        </li>
      ))}
    </ul>
  );
}
