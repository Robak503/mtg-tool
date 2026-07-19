"use client";

/**
 * CrucibleRail — Teferi's rail: the Crucible's guide config riding the shared
 * RoomRail (Room Guides pattern; Colton's map — "wanna look at old game, Teferi
 * is there to turn back time").
 *
 * LANE: games played, records, replays, sim results — what HAPPENED at the table.
 * Deck building routes to Karn, collection/prices to Vihaan, rules teaching to
 * the Academy. The widgets are deterministic reads of the records payload —
 * nothing invented, honest empty states before the first game finishes.
 */
import RoomRail from "./RoomRail";
import { seatLine } from "./RecordsView";

const mono = { fontFamily: "var(--font-mono), monospace" };
const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");
const statusLabel = (s) =>
  s === "user-wins" ? "You won" : s === "ai-wins" ? "The engine won" : s === "draw" ? "Draw" : "Unknown result";
const statusColor = (s) =>
  s === "user-wins" ? "var(--ley-green)" : s === "ai-wins" ? "var(--ley-red)" : "var(--ley-text-dim)";

function TeferiWidget({ kind, payload }) {
  const records = payload?.records || [];
  if (kind === "latest") {
    const r = records[0];
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>The latest table</span>
        {r ? (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ley-text)" }}>{seatLine(r.meta)}</div>
            <div style={{ fontSize: 12, color: statusColor(r.status), fontWeight: 600 }}>{statusLabel(r.status)}</div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)" }}>
              turn {r.turns ?? "—"} · {r.difficulty || "—"} · {when(r.endedAt)} · {r.logLines ?? 0} log lines kept
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>
            No games recorded yet — finish a game in the Academy or run the Sim Center, and it lands here forever.
          </div>
        )}
      </div>
    );
  }
  if (kind === "ledger") {
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>The ledger</span>
        {records.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {records.slice(0, 6).map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
                <span style={{ color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seatLine(r.meta)}</span>
                <span style={{ ...mono, color: statusColor(r.status), flexShrink: 0 }}>{r.status === "user-wins" ? "W" : r.status === "ai-wins" ? "L" : "—"} · T{r.turns ?? "—"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>The ledger is empty until the first game ends.</div>
        )}
      </div>
    );
  }
  return null;
}

/** Teferi's V1 charter: the table's historian, grounded in the records payload. */
function teferiSystem(payload) {
  const records = payload?.records || [];
  const facts = {
    gamesRecorded: records.length,
    latest: records[0] ? { seats: seatLine(records[0].meta), status: records[0].status, turns: records[0].turns, endedAt: records[0].endedAt } : null,
    recent: records.slice(0, 5).map((r) => ({ seats: seatLine(r.meta), status: r.status, turns: r.turns })),
  };
  return [
    "You are Teferi, the Crucible's guide — the keeper of this table's history in a Magic: The Gathering app.",
    "Scope: games PLAYED here — the records archive, replays, results, turn counts, sim outcomes. You help the user look back at what happened and what it says about how they play.",
    "Ground every claim in the RECORDS DATA below. If no games are recorded, say exactly that — never invent a game, a result, or a statistic.",
    "LANE RULE: deck building/cuts belong to KARN (The Agents), collection value/prices to VIHAAN (The Vault), rules teaching to the Academy. If asked, point them there in one friendly line — do not answer out of lane.",
    "Voice: composed, patient, a touch of time-mage warmth. Keep answers short and concrete (2-5 sentences). Plain text only.",
    `RECORDS DATA (live): ${JSON.stringify(facts)}`,
  ].join("\n");
}

export const TEFERI_GUIDE = {
  agentName: "teferi",
  name: "TEFERI",
  role: "keeper of the records",
  artCard: "Teferi, Hero of Dominaria",
  monogram: "T",
  systemPrompt: teferiSystem,
  chips: [
    { kind: "latest", label: "Latest table" },
    { kind: "ledger", label: "The ledger" },
  ],
  defaultWidget: "latest",
  widgetRouter: (lower) => {
    if (/\b(last|latest|recent).*(game|table|match)|replay/.test(lower)) return "latest";
    if (/\b(record|ledger|history|archive|games)\b/.test(lower)) return "ledger";
    return null;
  },
  Widget: TeferiWidget,
  emptyChatHint: "Ask about the games you've played — results, replays, what the records say. (Deck building lives with Karn; your collection with Vihaan.)",
  placeholder: "Ask about your games…",
};

export default function CrucibleRail({ fontFamily, records }) {
  return <RoomRail fontFamily={fontFamily} guide={TEFERI_GUIDE} payload={{ records }} />;
}
