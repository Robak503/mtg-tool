"use client";

/**
 * KeeperRail — the front hall's guide: THE KEEPER (working title until Colton +
 * Omnath christen him), the stately gentleman of the house.
 *
 * He is the HEARTH persona of Hearth-and-Roil — deliberately NOT a Magic
 * character: no card art, no rules opinions, no deck takes. He is the
 * housekeeper of the whole exe: he knows every wing and hall, he helps a lost
 * visitor find the right door, and he routes every Magic question to the guide
 * whose lane it is (Jace/Academy · Teferi/Crucible · Vihaan/Vault · Karn at
 * the bench). Warm, unhurried, dignified — the house's steady hand.
 *
 * Persona brief seed: memory orders/keeper-hearth-persona.md (Omnath owns the
 * voice work; this V1 charter is the placeholder that holds the door).
 */
import RoomRail from "./RoomRail";

const mono = { fontFamily: "var(--font-mono), monospace" };

/* The house map — compile-time truth, mirrors the AREAS registry + halls. */
const WINGS = [
  {
    id: "proving",
    title: "The Crucible",
    line: "Run your decks, rank them, keep every game.",
    halls: "Sim Center · Pod Balance · Table Records · The Reflecting Pool",
  },
  {
    id: "academy",
    title: "The Academy",
    line: "Learn the game, sharpen your rules.",
    halls: "Learn to Play · Mulligan Reps · Judge Trials · Rules & Rulings",
  },
  {
    id: "vault",
    title: "The Vault",
    line: "Your collection, under glass.",
    halls: "The Stacks · Ledger · Census · Atlas · Gallery · Forge",
  },
];

function KeeperWidget({ kind, payload }) {
  if (kind === "map") {
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>The house</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {WINGS.map((w) => (
            <button
              key={w.id}
              onClick={() => payload?.onEnterArea?.(w.id)}
              style={{ textAlign: "left", background: "transparent", border: "1px solid var(--ley-line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ley-green)"; e.currentTarget.style.background = "var(--ley-green-faint)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ley-line)"; e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ley-text)" }}>{w.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 1 }}>{w.line}</div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ley-text-faint)", marginTop: 3, letterSpacing: "0.04em" }}>{w.halls}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

/** The Keeper's V1 charter: the house's steady hand — routes, never poaches a lane. */
function keeperSystem() {
  return [
    "You are the Keeper of this house — the stately gentleman who minds the front hall of a Magic: The Gathering desktop app called MTG Tool. You are NOT a Magic character and you do not pretend to be one.",
    "Voice: warm, unhurried, dignified — an old-fashioned housekeeper's courtesy. Address the visitor kindly; never rush them.",
    "Scope: THE HOUSE ITSELF. You know the three wings and what lives in each:",
    "- THE CRUCIBLE: playing and measuring — Sim Center (self-play batches), Pod Balance (deck power comparison), Table Records (every finished game), The Reflecting Pool (per-deck dossiers). Its guide is Teferi.",
    "- THE ACADEMY: learning — Learn to Play (play vs the engine), Mulligan Reps (opening-hand judgment), Judge Trials (rules quiz), Rules & Rulings. Its guide is Jace.",
    "- THE VAULT: the collection — The Stacks (the cards), Ledger (value/prices), Census, Atlas (sets), Gallery (showpieces), Forge (build from collection). Its guide is Vihaan.",
    "- Deck building and imports live at the bench with KARN (The Agents in the bottom bar).",
    "When a visitor is lost, ask what they're trying to DO, then point them to the right wing — one or two sentences, then let them go.",
    "LANE RULE: you never answer Magic questions yourself — no rules, no deck advice, no prices. Route to the wing whose guide owns it, by name, courteously.",
    "Keep answers short (1-4 sentences). Plain text only.",
  ].join("\n");
}

export const KEEPER_GUIDE = {
  agentName: "keeper",
  name: "THE KEEPER",
  role: "of the house",
  monogram: "⌂",
  systemPrompt: keeperSystem,
  chips: [{ kind: "map", label: "Map of the house" }],
  defaultWidget: "map",
  widgetRouter: (lower) => {
    if (/\b(where|lost|find|map|rooms?|halls?|go)\b/.test(lower)) return "map";
    return null;
  },
  Widget: KeeperWidget,
  emptyChatHint: "Lost? Tell me what you're trying to do and I'll walk you to the right room. (Rules → the Academy · games → the Crucible · your cards → the Vault · deck building → Karn's bench.)",
  placeholder: "Where can I take you?",
};

export default function KeeperRail({ fontFamily, onEnterArea }) {
  return <RoomRail fontFamily={fontFamily} guide={KEEPER_GUIDE} payload={{ onEnterArea }} />;
}
