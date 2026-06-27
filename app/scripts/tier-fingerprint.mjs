/**
 * tier-fingerprint.mjs — the committed flip-diff (classifyCard tier per card).
 *
 * Promotes the per-cycle throwaway `_flipdump.mjs` into a versioned, orchestrator-
 * invoked tool. Dumps `{name -> classifyCard tier}` over every real card, sorted by
 * name. Diff a baseline-tree dump against the candidate to see what flipped tier — the
 * standard per-slice "what did this change" gate (audit every body-only -> native flip;
 * out-of-native flips are FP removals = good).
 *
 * SCOPE: this is the NECESSARY but NOT SUFFICIENT gate. The tier collapses a rich
 * program to a coarse label, so it cannot see a same-tier op-rebind — that is what
 * program-fingerprint.mjs (the seam gate) and a resolver-output diff cover. Use this
 * for ordinary coverage slices; use program-fingerprint for the parser.js seam.
 *
 * USAGE (headless): MTG_APP_ROOT=<main-tree>/app node scripts/tier-fingerprint.mjs > candidate.tsv
 * Pure builtins + local imports; corpus loads via MTG_APP_ROOT.
 */
import { publicCard, allCards } from "../src/lib/server/cardIndex.js";
import { classifyCard } from "../src/lib/learn/coverage.js";

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

const out = [];
for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  out.push(`${c.name}\t${classifyCard(c)}`);
}
out.sort();
process.stdout.write(out.join("\n") + "\n");
