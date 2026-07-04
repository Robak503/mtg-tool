/**
 * /api/judge-quiz — Judge Trials (wave K2): serves verified judge Q&A from the
 * bundled RulesGuru corpus (knowledge/mtg-judge/META_test_cases_rulesguru.md,
 * ~500 cases with cited answers, difficulty levels, and CR citations).
 *
 *   GET                       → { total, levels: [..], ready }
 *   GET ?action=question      → one case: { id, title, scenario, cardNames,
 *                                 level, complexity } (verdict withheld)
 *       &level=0|1|2|3|Corner Case   optional difficulty filter
 *       &seed=<n>                    deterministic pick (else pseudo-rotating)
 *   GET ?action=answer&id=RGnn → { id, expectedVerdict, requiredCitations }
 *
 * Fully local: the file is bundled + parsed by the existing precedent loader.
 * The question and answer are separate calls so the client can't peek.
 */

export const runtime = "nodejs";

import { loadRulesGuruPrecedents } from "../../../lib/server/rulesGuruRetrieval.js";

function pick(list, seedParam) {
  if (!list.length) return null;
  const seed = Number(seedParam);
  if (Number.isFinite(seed)) return list[((seed % list.length) + list.length) % list.length];
  // No Date/Math.random at module scope concerns here (request handler); a
  // per-request rotating index keeps successive draws varied without a seed.
  return list[Math.floor(Math.random() * list.length)];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const all = loadRulesGuruPrecedents();

    if (action === "answer") {
      const id = url.searchParams.get("id");
      const found = all.find((p) => p.id === id);
      if (!found) return Response.json({ error: "No such question." }, { status: 404 });
      return Response.json({
        id: found.id,
        expectedVerdict: found.expectedVerdict,
        requiredCitations: found.requiredCitations || [],
      });
    }

    if (action === "question") {
      const level = url.searchParams.get("level");
      const pool = level ? all.filter((p) => String(p.level) === String(level)) : all;
      const q = pick(pool.length ? pool : all, url.searchParams.get("seed"));
      if (!q) return Response.json({ error: "No questions available." }, { status: 404 });
      return Response.json({
        id: q.id,
        title: q.title,
        scenario: q.scenario,
        cardNames: q.cardNames || [],
        level: q.level ?? null,
        complexity: q.complexity ?? null,
      });
    }

    // Default: the index — total + available difficulty levels.
    const levels = [...new Set(all.map((p) => p.level).filter((l) => l != null))]
      .sort((a, b) => String(a).localeCompare(String(b)));
    return Response.json({ ready: all.length > 0, total: all.length, levels });
  } catch (error) {
    return Response.json({ error: error.message || "Judge quiz failed." }, { status: 500 });
  }
}
