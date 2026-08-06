/**
 * damagedPlayerTargetScope.test.js — DT-2: "target creature THAT PLAYER controls" on a combat-damage
 * trigger. Snapping Thragg, Skirk Commando, Spark Mage.
 *
 * ⭐⭐ THE REFUSAL THIS CLEARS IS DELIBERATE, NOT A BUG — that diagnosis is the slice. parser.js's
 * UNMODELED_MARKERS lists `that (player|creature|deals|has|was|spell)` and `its (owner|controller)`, and
 * the damage/destroy fold requires `isCleanClause(cleanedOracle)` ON TOP of the restriction parse. So a
 * leftover bare ANAPHOR is rejected on purpose. "Defending player controls" parses precisely because it is
 * an unambiguous PRINTED phrase and is not in that list. The narrowing that found it: EVERY other scope
 * already parsed on this lane — you control, you don't control, an opponent controls, defending player
 * controls, and a tapped qualifier — so the blocker was phrase-specific, not scope-specific.
 * ⛔ The one-line "fix" of loosening UNMODELED_MARKERS is FORBIDDEN: that list is what keeps unresolved
 * anaphors off the native path, and this run has twice caught cards silently doing nothing — or hitting
 * the wrong seat — from exactly that class.
 *
 * ⛔⛔ THE ANCHOR IS AS NARROW AS IT IS BECAUSE THREE WIDENINGS WERE MEASURED AND EACH BROKE A DIFFERENT
 * LITERAL READER OF THIS PHRASE:
 *   · a global swap of "that player controls"  -> +4 / **8 LOST** (removal.js's permanent lane, 3 sites:
 *     Joven and Chandler, Trygon Predator, Caustic Wasps, Cavern-Hoard Dragon, Soltari Visionary …)
 *   · "target creature that player controls"   -> +3 / 0, and only after the BOUNCE matcher (zones.js) was
 *     taught the second spelling — Arm with Aether grants a quoted combat-damage trigger carrying it
 *   · "creature that player controls"          -> +4 / **1 LOST** (Balefire Dragon's dedicated
 *     CDMG-MASS-TO-DAMAGED-PLAYER matcher in stack.js)
 * **A rewrite is a rename, and this clause has at least SIX literal readers.** Widening further is
 * whack-a-mole; Throat Slitter ("target NONBLACK creature that player controls") is the known, accepted
 * cost — a safe false-negative.
 *
 * Mutation-checked (2026-08-06, grep-verified as applied AND verified to reach the guarded case):
 *   · the sentinel rewrite disabled -> the clause keeps the raw anaphor and all three carriers park.
 * ⚠️ A SECOND MUTANT SURVIVED AND THE CLAIM WAS MINE, NOT THE PIN'S. I also added the sentinel to
 *   MODELED_RESTRICTION_RES and wrote that it was load-bearing — "cleanedOracle must strip it or
 *   isCleanClause refuses". FALSE: the sentinel passes isCleanClause anyway, because UNMODELED_MARKERS
 *   lists the ANAPHOR ("that player") and not the sentinel. The entry was dead code justified by a
 *   confident comment, and it was REMOVED rather than kept. **The gate that actually clears is the anaphor
 *   leaving the text — nothing needs stripping afterwards.**
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THRAGG = { id: "c-st", name: "Snapping Thragg", type: "Creature — Beast", mana: "{5}{R}", power: "3", toughness: "3",
  oracle: ["Whenever this creature deals combat damage to a player, you may have it deal 3 damage to target creature that player controls.", "Morph {4}{R}{R}"].join("\n") };
const SPARK_MAGE = { id: "c-sm", name: "Spark Mage", type: "Creature — Dwarf Wizard", mana: "{2}{R}", power: "1", toughness: "1",
  oracle: "Whenever this creature deals combat damage to a player, you may have this creature deal 1 damage to target creature that player controls." };

describe("the carriers", () => {
  it("⭐ all three flip", () => {
    const COMMANDO = { id: "c-sk", name: "Skirk Commando", type: "Creature — Goblin", mana: "{2}{R}", power: "1", toughness: "1",
      oracle: ["Whenever this creature deals combat damage to a player, you may have it deal 2 damage to target creature that player controls.", "Morph {2}{R}"].join("\n") };
    for (const c of [THRAGG, COMMANDO, SPARK_MAGE]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the sentinel replaces the anaphor, and ONLY in the target-creature position", () => {
    const t = detectTriggers(THRAGG).find((d) => d.event === "combatDamageToPlayer");
    console.log("  WITNESS damagedPlayerTargetClause", JSON.stringify(t?.effectClause)); // vitest 4 needs --disable-console-intercept
    expect(String(t?.effectClause)).toContain("the damaged player controls");
    // ⛔ THE PERMANENT LANE MUST KEEP THE RAW PHRASE — this is the 8-card regression, pinned by shape.
    const artifact = detectTriggers({ name: "P", type: "Creature — Bear", mana: "{2}", power: "2", toughness: "2",
      oracle: "Whenever this creature deals combat damage to a player, destroy target artifact that player controls." })
      .find((d) => d.event === "combatDamageToPlayer");
    expect(String(artifact?.effectClause)).toContain("that player controls");
    expect(String(artifact?.effectClause)).not.toContain("the damaged player");
    // ⛔ AND THE EACH-CREATURE LANE TOO — Balefire Dragon's dedicated matcher reads the raw phrase.
    const each = detectTriggers({ name: "Q", type: "Creature — Dragon", mana: "{6}{R}", power: "6", toughness: "6",
      oracle: "Whenever this creature deals combat damage to a player, it deals that much damage to each creature that player controls." })
      .find((d) => d.event === "combatDamageToPlayer");
    expect(String(each?.effectClause)).toContain("each creature that player controls");
  });

  it("⛔⛔ THE TWO-GATE STRUCTURE: the restriction parses AND cleanedOracle must be clean", () => {
    // The raw anaphor produces a CORRECT restriction and is still refused, because isCleanClause sees the
    // leftover "that player". The sentinel is what satisfies both gates at once. This fact took a full
    // investigation to establish, so it is asserted rather than described.
    const sentinel = parseEffectClause("it deals 3 damage to target creature the damaged player controls", "Instant", { sourceScoped: true })?.atoms;
    const anaphor = parseEffectClause("it deals 3 damage to target creature that player controls", "Instant", { sourceScoped: true })?.atoms;
    console.log("  WITNESS damagedPlayerTwoGate", JSON.stringify({ sentinel, anaphor })); // vitest 4 needs --disable-console-intercept
    expect(sentinel).toEqual([{ op: "deal-damage", amount: 3, targetType: "creature", restrictions: [{ kind: "controller", who: "damagedPlayer" }] }]);
    expect(anaphor).toEqual([]);   // refused by isCleanClause, by design
  });

  it("⛔ the regression cards from the widening attempts are all still native", () => {
    // Named individually because each one cost a measured flip-diff to discover.
    const ARM = { id: "c-aa", name: "Arm with Aether", type: "Sorcery", mana: "{2}{U}",
      oracle: 'Until end of turn, creatures you control gain "Whenever this creature deals damage to an opponent, you may return target creature that player controls to its owner\'s hand."' };
    const BALEFIRE = { id: "c-bd", name: "Balefire Dragon", type: "Creature — Dragon", mana: "{6}{R}{R}", power: "6", toughness: "6",
      oracle: ["Flying", "Whenever this creature deals combat damage to a player, it deals that much damage to each creature that player controls."].join("\n") };
    const TRYGON = { id: "c-tp", name: "Trygon Predator", type: "Creature — Beast", mana: "{1}{G}{U}", power: "2", toughness: "3",
      oracle: ["Flying", "Whenever this creature deals combat damage to a player, you may destroy target artifact or enchantment that player controls."].join("\n") };
    for (const c of [ARM, BALEFIRE, TRYGON]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });
});
