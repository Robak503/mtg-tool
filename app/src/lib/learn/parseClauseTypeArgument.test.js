/**
 * parseClauseTypeArgument.test.js — a STRUCTURAL invariant: every parseEffectClause call passes a card type.
 *
 * ⚠️ WHY THIS EXISTS. `parseEffectClause(text)` with no type silently downgrades TYPE-GATED atoms — pump and
 * deal-damage return LOW for anything that is not an Instant/Sorcery. A gate built on that reads "this
 * ability is not modeled" when the ability is modeled perfectly well, and REFUSES it.
 *
 * That is a false NEGATIVE, which is the reason it is invisible: no coverage number moves, no behavioural
 * test fails, and the affected cards are usually parked for other reasons anyway. It shipped twice in one
 * evening in the discard-cost-hand-ability lane — three call sites fixed, and a FOURTH missed until every
 * call site in the engine was audited one by one. A bug you cannot see by running the suite needs a
 * structural test, not another behavioural one.
 *
 * ⛔ THE CORRECT ARGUMENT IS USUALLY THE LITERAL "Instant", NOT the card's own type. The atoms resolve
 * type-agnostically at runtime, so an ability on a Creature is parsed as though it were on an Instant on
 * purpose — see the load-bearing note in matchOptionalDiscardPayment, where 30 of 32 flips depend on it.
 * Passing `card.type` would re-introduce exactly the bug this guards. A call that legitimately forwards a
 * cardType variable (the spell paths inside parser.js) is fine — what is banned is passing NOTHING.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Every non-test .js under src/lib/learn. */
function engineFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...engineFiles(full)); continue; }
    if (entry.endsWith(".js") && !entry.endsWith(".test.js")) out.push(full);
  }
  return out;
}

describe("⭐ STRUCTURAL — parseEffectClause is never called without a card type", () => {
  it("every call site passes a type argument", () => {
    const offenders = [];
    let calls = 0;
    for (const file of engineFiles(HERE)) {
      const src = readFileSync(file, "utf-8");
      src.split("\n").forEach((line, i) => {
        // Skip the declaration itself and any commented-out mention.
        if (/^\s*(?:\/\/|\*)/.test(line)) return;
        if (/function parseEffectClause/.test(line)) return;
        const idx = line.indexOf("parseEffectClause(");
        if (idx === -1) return;
        calls += 1;
        const after = line.slice(idx + "parseEffectClause(".length);
        // A type argument means a comma at this call's top level before its closing paren.
        let depth = 0, hasComma = false;
        for (const ch of after) {
          if (ch === "(" || ch === "[" || ch === "{") depth += 1;
          else if (ch === ")" && depth === 0) break;
          else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
          else if (ch === "," && depth === 0) { hasComma = true; break; }
        }
        if (!hasComma) offenders.push(`${path.relative(HERE, file)}:${i + 1}`);
      });
    }
    // A sanity floor: if this drops to near zero the scan stopped finding calls and proves nothing.
    expect(calls).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
