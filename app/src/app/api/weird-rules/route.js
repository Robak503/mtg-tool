/**
 * /api/weird-rules — three genuinely odd Comprehensive Rules per day, for the
 * Academy's showpiece carousel (Colton, 2026-07-19: "3 weird rules of the day").
 *
 * HONESTY CONTRACT: the POOL below is a hand-curated list of rule NUMBERS —
 * every one was verified against the bundled corpus when curated, and at
 * runtime an entry only ships if it exists in cr_current.json TODAY. The text
 * rendered is ALWAYS the corpus's own ruleText — never paraphrased, never from
 * memory (CLAUDE.md §1.2). A future CR sync that renumbers simply shrinks the
 * day's draw; nothing is invented to fill the gap.
 *
 * Deterministic on the UTC day (same trio all day, rotating window over the
 * pool) — same pattern as the Academy's daily trial.
 */

export const runtime = "nodejs";

import fs from "node:fs";

import { mtgJudgePath } from "../../../lib/server/paths.js";

/* Curated 2026-07-19 by reading the corpus (each number seen in cr_current.json
   with its real text): stickers, dungeons, Shahrazad subgames, banding, chaos,
   vanguard — the corners of the rules where Magic gets wonderfully strange. */
const POOL = [
  "100.7",   // casual cards the rules don't cover
  "103.7",   // Planechase: the game starts by planeswalking
  "123.3",   // stickers: choosing one not currently on anything
  "123.9",   // art stickers do nothing except be seen
  "211.1",   // vanguard hand modifiers
  "300.1",   // the FULL card-type list (dungeon, phenomenon, conspiracy…)
  "309.3",   // one dungeon per player, no swapping mid-delve
  "311.7",   // "Whenever chaos ensues."
  "312.5",   // "When you encounter [this phenomenon]"
  "313.2",   // vanguard cards can't be cast
  "702.22a", // banding modifies the rules for combat
  "729.1",   // one card (Shahrazad) creates a game within the game
  "729.2c",  // your commander follows you INTO the subgame
  "729.6",   // a subgame can be created within a subgame
];

let cache = null; // { rules: Map, mtimeMs } — reload only when the corpus changes

function loadCr() {
  const file = mtgJudgePath("data", "cr", "cr_current.json");
  const { mtimeMs } = fs.statSync(file);
  if (cache && cache.mtimeMs === mtimeMs) return cache.rules;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  cache = { rules: parsed, mtimeMs };
  return parsed;
}

export async function GET() {
  let cr;
  try {
    cr = loadCr();
  } catch (error) {
    return Response.json({ ready: false, error: `Rules corpus unavailable: ${error.message}`, rules: [] });
  }

  const present = POOL.filter((n) => cr[n]?.ruleText);
  if (present.length === 0) {
    return Response.json({ ready: false, error: "No curated rules found in the current corpus.", rules: [] });
  }

  const day = Math.floor(Date.now() / 86400000);
  const rules = [0, 1, 2].map((i) => {
    const entry = cr[present[(day * 3 + i) % present.length]];
    return { ruleNumber: entry.ruleNumber, ruleText: entry.ruleText, examples: entry.examples || null };
  });
  // A tiny pool could repeat within the trio when (day*3 + i) wraps — dedupe honestly.
  const seen = new Set();
  const unique = rules.filter((r) => !seen.has(r.ruleNumber) && seen.add(r.ruleNumber));

  return Response.json({ ready: true, rules: unique });
}
