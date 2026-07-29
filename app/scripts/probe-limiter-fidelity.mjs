#!/usr/bin/env node
/**
 * probe-limiter-fidelity.mjs — does the engine carry the LIMITER the card prints?
 *
 * ⭐ WHY THIS CLASS EXISTS, and why no other instrument covers it. Aurelia, the Warleader printed "attacks
 * FOR THE FIRST TIME EACH TURN" and her descriptor carried no once-per-turn latch, so she granted more
 * combats than the card prints. Consider what every instrument saw:
 *     coverage %          → native-trigger. Green.
 *     playability sweep   → games complete, decisions sane. Green.
 *     the full suite      → 12,000+ tests. Green.
 * **Nothing about the OUTCOME was wrong. Only the rules-fidelity was**, and outcome-shaped instruments are
 * blind to that by construction. She was caught by a human reading the card against the descriptor.
 *
 * This automates exactly that reading, for the one thing that can be checked mechanically: a printed
 * LIMITER must appear as a flag on the thing it limits. It does not check semantics — only presence.
 *
 * ⭐ IT HAS A DETERMINISTIC WITNESS, which is why it is shippable where the turn-termination detector was
 * not. Re-break the latch (drop the `firstTimeEachTurn` stamp in triggers.js) and this probe must flag
 * Aurelia; restore it and the flag must clear. No board, no preconditions, no rigging — the descriptor is
 * the whole input. Run the witness before believing a clean result (hollow-gate rule 1b).
 *
 * ⛔ SOUNDNESS. Only phrase families whose flag is UNAMBIGUOUS are checked. "for the first time each turn"
 * and the printed "This ability triggers only once each turn." both map to descriptor.oncePerTurnTrigger;
 * an ACTIVATED "Activate only once each turn" maps to ability.activationLimit instead and is checked on its
 * own lane. A card whose limiter phrase sits on a line the engine never detected as a trigger at all is
 * reported separately as `undetected` — that is a coverage gap, not an infidelity, and conflating the two
 * is how a probe starts reporting ghosts.
 *
 * ⭐ WITNESS RESULT (2026-07-29): re-breaking the latch makes this flag **28 cards with Aurelia at the
 * top** (Scourge of the Throne, Godo, the whole Valiant mouse cycle, Vanguard Seraph …); restoring it
 * returns **1**. The clean result is a measurement, not a silence.
 *
 * ⛔ CURRENT STATE: 28 trigger-limiter cards checked, **1 flagged and that one is a VERIFIED FALSE
 * POSITIVE** — Mighty Servant of Leuk-o. Its descriptor is the GRANTED INNER trigger ("Whenever this
 * creature deals combat damage to a player, draw two cards") while the limiter belongs to the OUTER crew
 * trigger that wraps it; the sourceText match cannot tell those apart. Left visible rather than suppressed,
 * because a special-case would also hide a real regression on that card later.
 *
 * ⚠️ THE GHOST TAXONOMY, because the first draft reported 23 and the first FIVE checked were all false.
 * Three distinct ways a limiter looks unmodelled and isn't:
 *   1. **The limited LINE is undetected while a DIFFERENT line is** (Tataru Taru's ETB, Exemplar of Light's
 *      lifegain, Fear of Missing Out's ETB). A coverage gap — an ability the engine never detected cannot
 *      over-fire. Fixed by matching per-DESCRIPTOR on sourceText rather than card-wide.
 *   2. **The descriptor is a granted INNER ability** and the limiter wraps it (Mighty Servant, above).
 *   3. **The ability is parked anyway** — Skinshifter / Groundling Pouncer / Chronatog Totem print
 *      "Activate only once each turn AND ONLY IF <cond>", which the end-anchored limiter matcher misses, so
 *      activationLimit is null. Measured: all three offer ZERO activations, so nothing over-fires. A real
 *      infidelity requires the ability to actually BE OFFERED — check that before believing this lane.
 *
 * Read-only / local-only (needs MTG_APP_ROOT). Not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";
import { parseActivatedAbilities } from "../src/lib/learn/effects/abilities.js";

const LIMIT = Number(process.argv.find((a) => a.startsWith("--top="))?.slice("--top=".length)) || 99999;

const TRIGGER_LIMITER = /for the first time each turn|this ability triggers only once each turn/i;
const ACTIVATED_LIMITER = /activate (?:this ability )?only once each turn|activate (?:this ability )?no more than \w+ times each turn/i;

const cs = await allCards();
let trigChecked = 0, actChecked = 0;
const infidelTrigger = [], infidelActivated = [], undetected = [];

for (const c of cs) {
  if (Number.isInteger(c.edhrec_rank) && c.edhrec_rank > LIMIT) continue;
  const t = c.type_line || c.type || "";
  if (/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction)\b/.test(t)) continue;
  const pc = publicCard(c);
  const oracle = pc.oracle || "";
  const rank = c.edhrec_rank ?? 999999;

  // ── TRIGGER lane ──────────────────────────────────────────────────────────
  if (TRIGGER_LIMITER.test(oracle)) {
    let ds;
    try { ds = detectTriggers(pc) || []; } catch { ds = []; }
    // ⛔ MATCH PER-DESCRIPTOR, NOT CARD-WIDE. The first draft asked "does ANY descriptor carry the latch?"
    // and produced 23 flags of which the first five checked were all FALSE — every one a card where the
    // LIMITED line is undetected while a DIFFERENT, unlimited line is (Tataru Taru's ETB, Exemplar of
    // Light's lifegain, Fear of Missing Out's ETB, Crawling Sensation's upkeep, Danny Pink's Mentor). That
    // is a coverage gap, not an infidelity: an ability the engine never detected cannot over-fire.
    // The sound question is narrower — the descriptor whose OWN sourceText carries the limiter phrase must
    // carry the latch. detectTriggers hands us sourceText for exactly this kind of check.
    const limited = ds.filter((d) => TRIGGER_LIMITER.test(String(d.sourceText || "")));
    if (!limited.length) {
      undetected.push([rank, pc.name, "trigger"]);   // the limited LINE was never detected → coverage gap
    } else {
      trigChecked++;
      const bad = limited.filter((d) => !d.oncePerTurnTrigger);
      if (bad.length) infidelTrigger.push([rank, pc.name, bad.map((d) => d.event).join(",")]);
    }
  }

  // ── ACTIVATED lane ────────────────────────────────────────────────────────
  if (ACTIVATED_LIMITER.test(oracle)) {
    let abs;
    try { abs = parseActivatedAbilities(pc) || []; } catch { abs = []; }
    if (!abs.length) {
      undetected.push([rank, pc.name, "activated"]);
    } else {
      actChecked++;
      if (!abs.some((a) => a.activationLimit)) {
        infidelActivated.push([rank, pc.name, abs.map((a) => a.costStr).join(" | ").slice(0, 40)]);
      }
    }
  }
}

const byRank = (a, b) => a[0] - b[0];
infidelTrigger.sort(byRank); infidelActivated.sort(byRank); undetected.sort(byRank);

console.log(`checked — trigger-limiter cards: ${trigChecked} · activated-limiter cards: ${actChecked}`);
console.log(`(not checked: ${undetected.length} cards whose limiter line was never detected at all — a COVERAGE gap, reported separately, never counted as infidelity)`);

console.log(`\n⛔ TRIGGER LIMITER PRINTED BUT NO LATCH ON ANY DESCRIPTOR: ${infidelTrigger.length}`);
for (const [r, n, ev] of infidelTrigger.slice(0, 25)) console.log(String(r).padStart(6), n, "|", ev);

console.log(`\n⛔ ACTIVATED LIMITER PRINTED BUT NO activationLimit: ${infidelActivated.length}`);
for (const [r, n, cost] of infidelActivated.slice(0, 25)) console.log(String(r).padStart(6), n, "|", cost);

if (!infidelTrigger.length && !infidelActivated.length) {
  console.log("\n   (fidelity holds on both lanes — run the Aurelia witness before believing it)");
}
