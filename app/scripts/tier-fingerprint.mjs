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
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

// Dedupe to ONE deterministic tier per card NAME. classifyCard is deterministic for a fixed card
// object, BUT a few names carry MULTIPLE printings whose oracle text differs and therefore classify
// to different tiers (Everythingamajig, Red Herring, Unquenchable Fury). Emitting one line per
// printing made a name's tier depend on index iteration order, which polluted flip-diffs with
// phantom GAINED/LOST. Collapse each name to a single tier: native-wins (a name counts native if
// ANY printing plays natively), ties broken by sorted tier name — fully order-independent, so two
// runs (and a baseline-vs-candidate flip-diff) always agree on a name's tier.
const tiersByName = new Map();
for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  let set = tiersByName.get(c.name);
  if (!set) { set = new Set(); tiersByName.set(c.name, set); }
  set.add(classifyCard(c));
}
function pickTier(tiers) {
  const all = [...tiers].sort();
  const native = all.filter(isNativeTier);
  return (native.length ? native : all)[0];
}
const out = [];
for (const [name, tiers] of tiersByName) out.push(`${name}\t${pickTier(tiers)}`);
out.sort();
process.stdout.write(out.join("\n") + "\n");
