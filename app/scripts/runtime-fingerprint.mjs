/**
 * runtime-fingerprint.mjs — the resolver-output guard (guard-kit piece 3).
 *
 * The tier diff (tier-fingerprint) and the program diff (program-fingerprint) both key
 * off the parse pipeline. But the project's "shared-system lesson" (earned 7x: doublers,
 * Pir, Mowu, Innkeeper's, Hosting, attacks-alone, phantom-mana) is that some RUNTIME
 * functions consult a card REGARDLESS of its classification or even its parse program —
 * `manaProduction` read a triggered "Add {G}{G}" as a standing source (the phantom-mana
 * FP) on cards that never flipped tier. classifyCard/program-fingerprint are BLIND to
 * those: the change is in a separate runtime function, on cards that don't flip.
 *
 * This dumps a canonical fingerprint of the card-PURE shared runtime functions — the
 * exact surfaces that lesson names — so a slice touching manaModel.js / replacementEffects.js
 * can be diffed corpus-wide for an unintended reading change:
 *   - manaProduction(card)  — the standing-mana reader (phantom-mana FP lived here)
 *   - doublerProfile(card)  — the replacement-doubler reading (counter/token doubling)
 *   - isPureDoubler(card)   — the pure-doubler classification
 * (manaSources/planPayment/applyCounterDoubling need game state, so they are not
 * corpus-pure and are out of scope for a static fingerprint — probe those with a
 * synthetic board when a slice touches them.)
 *
 * USAGE (headless): MTG_APP_ROOT=<main-tree>/app node scripts/runtime-fingerprint.mjs > candidate.tsv
 * then diff against a baseline-tree dump. A non-empty diff on a slice that did NOT intend
 * to change mana/doubler behavior = an over-fire FP on the shared runtime path — audit it.
 * Pure builtins + local imports; corpus loads via MTG_APP_ROOT.
 */
import { publicCard, allCards } from "../src/lib/server/cardIndex.js";
import { manaProduction } from "../src/lib/learn/manaModel.js";
import { doublerProfile, isPureDoubler } from "../src/lib/learn/replacementEffects.js";

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

function probe(fn, card) {
  try { return fn(card); } catch (e) { return { err: String(e && e.message || e) }; }
}

function fingerprint(card) {
  return canonical({
    mana: probe(manaProduction, card),
    doubler: probe(doublerProfile, card),
    pureDoubler: probe(isPureDoubler, card),
  });
}

const out = [];
for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  out.push(`${c.name}\t${fingerprint(c)}`);
}
out.sort();
process.stdout.write(out.join("\n") + "\n");
