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
 * the bench).
 *
 * REDUNDANCY LAW (Colton, 2026-07-19: "the rail and the square is redundant"):
 * a rail widget must never repeat what the page already shows. The landing's
 * doors say what the rooms ARE — so the Keeper's board says what's IN them
 * TODAY: games kept, the vault's worth, the trial corpus. Live numbers off the
 * same local APIs the rooms use; honest dashes before data exists.
 *
 * Persona brief seed: memory orders/keeper-hearth-persona.md (Omnath owns the
 * voice; this V1 charter holds the door).
 */
import { useEffect, useState } from "react";

import RoomRail from "./RoomRail";

const mono = { fontFamily: "var(--font-mono), monospace" };
const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function KeeperWidget({ kind, payload }) {
  if (kind !== "house") return null;
  const { house, onEnterArea } = payload || {};
  const rows = [
    {
      id: "proving",
      title: "The Crucible",
      line: house
        ? (house.games === 1 ? "1 game kept, full tail" : `${house.games ?? 0} games kept, full tails`)
        : "counting the archive…",
    },
    {
      id: "academy",
      title: "The Academy",
      line: house
        ? (house.judgeReady ? `${house.judgeCases} judge cases ready to try you` : "the trial corpus awaits a data sync")
        : "opening the corpus…",
    },
    {
      id: "vault",
      title: "The Vault",
      line: house
        ? (house.printings > 0 ? `${house.printings.toLocaleString()} printings · ${usd(house.vaultValue)} under glass` : "the shelves stand ready for your first cards")
        : "taking inventory…",
    },
  ];
  return (
    <div>
      <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>The house today</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
        {rows.map((w) => (
          <button
            key={w.id}
            onClick={() => onEnterArea?.(w.id)}
            style={{ textAlign: "left", background: "transparent", border: "1px solid var(--ley-line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ley-green)"; e.currentTarget.style.background = "var(--ley-green-faint)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ley-line)"; e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ley-text)" }}>{w.title}</div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 2 }}>{w.line}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Keeper's V1 charter: the house's steady hand — routes, never poaches a lane. */
function keeperSystem(payload) {
  const house = payload?.house || null;
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
    house
      ? `HOUSE LEDGER (live, cite honestly): ${JSON.stringify(house)}`
      : "HOUSE LEDGER: not read yet this visit — say so if asked for numbers.",
  ].join("\n");
}

export const KEEPER_GUIDE = {
  agentName: "keeper",
  name: "THE KEEPER",
  role: "of the house",
  monogram: "⌂",
  systemPrompt: keeperSystem,
  chips: [{ kind: "house", label: "The house today" }],
  defaultWidget: "house",
  widgetRouter: (lower) => {
    if (/\b(where|lost|find|map|rooms?|halls?|go|house|status)\b/.test(lower)) return "house";
    return null;
  },
  Widget: KeeperWidget,
  emptyChatHint: "Lost? Tell me what you're trying to do and I'll walk you to the right room. (Rules → the Academy · games → the Crucible · your cards → the Vault · deck building → Karn's bench.)",
  placeholder: "Where can I take you?",
};

export default function KeeperRail({ fontFamily, onEnterArea }) {
  // The Keeper reads the house ledger himself — three light local GETs, honest
  // dashes until they land. null = still reading (the widget says so per line).
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

  return <RoomRail fontFamily={fontFamily} guide={KEEPER_GUIDE} payload={{ house, onEnterArea }} />;
}
