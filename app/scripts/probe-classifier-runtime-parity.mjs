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

const offenders = [];
let checked = 0;
for (const c of allCards()) {
  if (!/Instant|Sorcery/.test(c.type_line || "")) continue;
  const card = { name: c.name, type: c.type_line, mana: c.mana_cost, oracle: c.oracle_text || "" };
  if (classifyCard(card) !== "native-spell") continue;
  checked++;
  const conf = programConfidence(parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card.oracle) }));
  if (conf !== "high") offenders.push(`${c.name} (runtime: ${conf})`);
}

console.log(`native-spell cards checked: ${checked}`);
console.log(`⚠️ classifier NATIVE but runtime program NOT high: ${offenders.length}`);
for (const o of offenders) console.log("  ", o);
if (!offenders.length) console.log("  (parity holds)");
