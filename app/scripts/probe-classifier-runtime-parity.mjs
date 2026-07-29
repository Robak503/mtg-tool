#!/usr/bin/env node
/**
 * probe-classifier-runtime-parity.mjs — does the RUNTIME read the same oracle the CLASSIFIER decided on?
 *
 * ⭐ WHY. coverage.js transforms a card's oracle before classifying it — it strips cost-only keywords, plot,
 * cascade, kicker text, reminder text, and more. Every transform the runtime does NOT also apply is a
 * divergence: the metric counts a card native while the engine routes it to the Arbiter, or the reverse.
 *
 * This asks one question corpus-wide: for every card classified `native-spell`, does the program the RUNTIME
 * parses — parseEffectProgram over stripCostOnlyKeywordLines, exactly what actionDispatcher and legalChoices
 * feed it — come back HIGH? It found eight on its first run (2 plot, 6 cascade), all since fixed by moving
 * the strips into the shared helper.
 *
 * ⚠️ A ROW HERE IS NOT AUTOMATICALLY A BUG IN THE RUNTIME. It means the two sides disagree; the fix belongs
 * wherever the disagreement is wrong. Decide per case, and prefer fixing the SHARED reader over patching one
 * caller — a per-caller fix leaves the next caller free to repeat it.
 *
 * ⛔ AND VERIFY WITH THE TIER DIFF AFTER FIXING. Making the runtime match by widening a strip can silently
 * strip a REAL ability: the first cascade fix reused coverage's reminder-sentence matcher and credited 9
 * cascade-GRANTING cards (Bloodbraid Marauder, Maelstrom Nexus) as native with the granting ability gone.
 * A parity fix should move ZERO cards; if the tier moves, the strip is too wide.
 *
 * Local-only (needs the bundled oracle); not in CI. The per-card regressions are pinned hermetically in
 * src/lib/learn/classifierRuntimeParity.test.js.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-classifier-runtime-parity.mjs
 */
import { allCards } from "../src/lib/server/cardIndex.js";
import "../src/lib/learn/coverage.js";
import { classifyCard } from "../src/lib/learn/coverage.js";
import { parseEffectProgram, programConfidence } from "../src/lib/learn/effects/parser.js";
import { stripCostOnlyKeywordLines } from "../src/lib/learn/effects/parseHelpers.js";
import { parseActivatedAbilities, parseGrantedActivatedAbilities, parseGraveyardSelfRecursion, parseGraveyardExileAbility } from "../src/lib/learn/effects/abilities.js";

const asCard = (c) => ({ name: c.name, type: c.type_line, mana: c.mana_cost, oracle: c.oracle_text || "" });
const report = (label, checked, offenders) => {
  console.log(`\n${label}: ${checked} checked · ${offenders.length} divergent`);
  for (const o of offenders.slice(0, 20)) console.log("  ", o);
  if (!offenders.length) console.log("   (parity holds)");
};

// ── SPELLS: does the program the runtime parses come back HIGH?
{
  const offenders = []; let checked = 0;
  for (const c of allCards()) {
    if (!/Instant|Sorcery/.test(c.type_line || "")) continue;
    const card = asCard(c);
    if (classifyCard(card) !== "native-spell") continue;
    checked++;
    const conf = programConfidence(parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card.oracle) }));
    if (conf !== "high") offenders.push(`${c.name} (runtime: ${conf})`);
  }
  report("native-spell", checked, offenders);
}

// ── ACTIVATED PERMANENTS: can ANY runtime entry point find an ability to offer?
//
// ⚠️ ALL THREE PATHS ARE REQUIRED, and leaving any out is a false alarm rather than a find. Checking only
// the PRINTED abilities reported 71 "divergences" that were nothing of the sort:
//   • GRANTED — an Aura's quoted ability lives on the HOST (Dragon Mantle, Hot Springs); legalChoices reads
//     it via grantedActivatedQuotedFor, not off the Aura's own card;
//   • GRAVEYARD — "{4}{B}: Return this card from your graveyard…" (Tunnel Rats, Stitchwing Skaab) is
//     activated from the graveyard, which is a separate offer path entirely.
{
  const offenders = []; let checked = 0;
  for (const c of allCards()) {
    const card = asCard(c);
    if (classifyCard(card) !== "native-activated") continue;
    checked++;
    const printed = parseActivatedAbilities(card).some((a) => a.modeled);
    const granted = (parseGrantedActivatedAbilities?.(card) || []).length > 0;
    const graveyard = !!(parseGraveyardSelfRecursion?.(card) || parseGraveyardExileAbility?.(card));
    if (!printed && !granted && !graveyard) offenders.push(c.name);
  }
  report("native-activated", checked, offenders);
}

// ── EQUIPMENT: can the runtime find the Equip ability on the RAW card? (coverage strips trigger sentences
// before its own check, so this is exactly the transform-divergence question.)
{
  const offenders = []; let checked = 0;
  for (const c of allCards()) {
    if (!/\bEquipment\b/i.test(c.type_line || "")) continue;
    const card = asCard(c);
    if (classifyCard(card) !== "native-equipment") continue;
    checked++;
    if (!parseActivatedAbilities(card).some((a) => a.isEquipAbility && a.modeled)) offenders.push(c.name);
  }
  report("native-equipment", checked, offenders);
}
