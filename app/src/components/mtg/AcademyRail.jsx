"use client";

/**
 * AcademyRail — Jace's rail: the Academy's guide config riding the shared RoomRail
 * (Room Guides pattern; Colton's map — "need rules, Jace got you").
 *
 * LANE: rules teaching — the Comprehensive Rules, interactions, judge questions,
 * how to get better at the game. Deck building routes to Karn, collection to
 * Vihaan, game history to Teferi. Widgets are deterministic reads of the
 * judge-quiz payload: the corpus stats and TODAY'S TRIAL (a real RulesGuru case,
 * deterministic on the UTC day — the verdict is server-withheld, so the rail can
 * tease the scenario without ever spoiling the answer).
 */
import { ROOM_GUIDE_CORE, JACE_DELTA } from "../../lib/agents";
import RoomRail from "./RoomRail";

const mono = { fontFamily: "var(--font-mono), monospace" };

function JaceWidget({ kind, payload }) {
  const stats = payload?.stats || null;
  const trial = payload?.trial || null;
  if (kind === "trial") {
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>Today's trial</span>
        {trial ? (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11.5, color: "var(--ley-text)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {trial.scenario}
            </div>
            <div style={{ ...mono, fontSize: 10, color: "var(--ley-green)" }}>
              {trial.level != null ? `difficulty ${trial.level}` : ""}{trial.cardNames?.length ? ` · ${trial.cardNames.slice(0, 3).join(", ")}` : ""}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)" }}>The verdict stays sealed until you take the trial.</div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>
            The trial corpus hasn't loaded — open Judge Trials to check the bundled cases.
          </div>
        )}
      </div>
    );
  }
  if (kind === "corpus") {
    return (
      <div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-green)" }}>The corpus</span>
        {stats?.ready ? (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 12.5, color: "var(--ley-text)" }}><b>{stats.total}</b> verified judge cases, cited to the CR</div>
            {Array.isArray(stats.levels) && stats.levels.length > 0 && (
              <div style={{ ...mono, fontSize: 10.5, color: "var(--ley-text-dim)" }}>levels: {stats.levels.join(" · ")}</div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ley-text-dim)", marginTop: 8, lineHeight: 1.5 }}>The judge corpus isn't ready on this install yet.</div>
        )}
      </div>
    );
  }
  return null;
}

/** Jace's Academy charter: rules teacher, grounded in the corpus payload. */
function jaceSystem(payload) {
  const stats = payload?.stats || null;
  const trial = payload?.trial || null;
  const facts = {
    judgeCorpus: stats ? { total: stats.total, ready: stats.ready, levels: stats.levels } : null,
    todaysTrial: trial ? { id: trial.id, title: trial.title, level: trial.level, cardNames: trial.cardNames } : null,
  };
  return [
    ROOM_GUIDE_CORE,
    JACE_DELTA,
    "You are Jace, the Academy's guide — the rules teacher in a Magic: The Gathering app.",
    "Scope: how the game WORKS — rules, interactions, the stack, turn structure, judge-level questions, and how to practice (Learn to Play, Mulligan Reps, Judge Trials live in this room).",
    "Answer rules questions plainly and honestly. If you are not certain of a ruling, say so and point to Judge Trials or the Rules & Rulings hall — never invent a rule number or a ruling.",
    "NEVER reveal a trial's verdict — today's trial answer is sealed by design; encourage taking it instead.",
    "LANE RULE: deck building/cuts belong to KARN at the bench, collection value to VIHAAN (The Vault), past games/replays to TEFERI (The Crucible). Point them there in one friendly line — do not answer out of lane.",
    "Keep answers short and concrete (2-5 sentences). Plain text only.",
    `ACADEMY DATA (live): ${JSON.stringify(facts)}`,
  ].join("\n");
}

export const JACE_GUIDE = {
  agentName: "jace",
  name: "JACE",
  role: "the Academy's guide",
  artCard: "Jace, the Mind Sculptor",
  monogram: "J",
  systemPrompt: jaceSystem,
  chips: [
    { kind: "trial", label: "Today's trial" },
    { kind: "corpus", label: "The corpus" },
  ],
  defaultWidget: "trial",
  widgetRouter: (lower) => {
    if (/\b(trial|quiz|question|test me)\b/.test(lower)) return "trial";
    if (/\b(corpus|how many|cases)\b/.test(lower)) return "corpus";
    return null;
  },
  Widget: JaceWidget,
  emptyChatHint: "Ask how the game works — rules, interactions, the stack. (Deck building lives with Karn; your games with Teferi.)",
  placeholder: "Ask a rules question…",
};

export default function AcademyRail({ fontFamily, stats, trial }) {
  return <RoomRail fontFamily={fontFamily} guide={JACE_GUIDE} payload={{ stats, trial }} />;
}
