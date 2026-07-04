"use client";

/**
 * JudgeTrialsView — Judge Trials (wave K2): a self-graded rules quiz over the
 * bundled RulesGuru corpus. Pick a difficulty, read the scenario, reveal the
 * cited answer, grade yourself, and the streak ticks. Fully local.
 */

import { useCallback, useEffect, useState } from "react";

const LEVEL_LABEL = (l) => (l === "Corner Case" ? "Corner Case" : `Level ${l}`);

export default function JudgeTrialsView({ onBack, fontFamily }) {
  const [meta, setMeta] = useState(null);
  const [level, setLevel] = useState("");
  const [q, setQ] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/judge-quiz");
        setMeta(await r.json());
      } catch {
        setMeta({ ready: false, total: 0, levels: [] });
      }
    })();
  }, []);

  const nextQuestion = useCallback(async () => {
    setLoading(true);
    setAnswer(null);
    try {
      const url = level ? `/api/judge-quiz?action=question&level=${encodeURIComponent(level)}` : "/api/judge-quiz?action=question";
      const r = await fetch(url, { cache: "no-store" });
      setQ(r.ok ? await r.json() : null);
    } finally {
      setLoading(false);
    }
  }, [level]);

  const reveal = async () => {
    if (!q) return;
    const r = await fetch(`/api/judge-quiz?action=answer&id=${encodeURIComponent(q.id)}`);
    if (r.ok) setAnswer(await r.json());
  };

  const grade = (correct) => {
    setStreak((s) => (correct ? s + 1 : 0));
    setSeen((n) => n + 1);
    nextQuestion();
  };

  const wrap = { flex: 1, overflowY: "auto", padding: "16px 20px", fontFamily, color: "var(--ley-text)" };
  const card = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 18, marginBottom: 16 };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      {onBack && <button onClick={onBack} className="btn btn-ghost btn-sm">← Proving Grounds</button>}
      <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", letterSpacing: "-0.02em" }}>
        Judge Trials
      </h1>
      {meta?.total ? (
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
          {meta.total} verified questions
        </span>
      ) : null}
      <span style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 12, color: "var(--ley-text-dim)" }}>
        <span>Streak <strong style={{ color: "var(--ley-green)" }}>{streak}</strong></span>
        <span>Seen <strong style={{ color: "var(--ley-text)" }}>{seen}</strong></span>
      </span>
    </div>
  );

  if (meta && !meta.ready) {
    return (
      <div style={wrap}>{header}
        <div style={card}>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.6 }}>
            The RulesGuru question corpus isn&apos;t bundled in this build. It ships with the
            installed app under the knowledge layer — this only shows empty in a bare dev tree.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {header}

      {!q && (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 12 }}>
            Pick your difficulty
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button onClick={() => setLevel("")} className={level === "" ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}>Any</button>
            {(meta?.levels || []).map((l) => (
              <button key={l} onClick={() => setLevel(String(l))} className={level === String(l) ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}>
                {LEVEL_LABEL(l)}
              </button>
            ))}
          </div>
          <button onClick={nextQuestion} disabled={loading} className="btn btn-primary">
            {loading ? "Dealing…" : "Start the trial"}
          </button>
        </div>
      )}

      {q && (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-green)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                {q.level != null ? LEVEL_LABEL(q.level) : "Question"}{q.complexity ? ` · ${q.complexity}` : ""}
              </span>
              <span style={{ fontSize: 10, color: "var(--ley-text-faint)" }}>{q.id}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ley-text)", whiteSpace: "pre-wrap" }}>
              {q.scenario}
            </div>
          </div>

          {!answer ? (
            <button onClick={reveal} className="btn btn-primary">Reveal the ruling</button>
          ) : (
            <div style={card}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
                The ruling
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--ley-text)" }}>
                {answer.expectedVerdict}
              </div>
              {answer.requiredCitations?.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--ley-text-dim)", marginTop: 10 }}>
                  CR: {answer.requiredCitations.join(", ")}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button onClick={() => grade(true)} className="btn btn-secondary btn-sm">I got it ✓</button>
                <button onClick={() => grade(false)} className="btn btn-ghost btn-sm">Missed it</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
