/**
 * selfDamageRiderSplit.test.js — "<source> deals N damage to any target AND M damage to you." was severed
 * at its internal " and " by the clause splitter, orphaning "M damage to you" into a fragment that parses
 * as nothing and dropping the whole spell to the Arbiter (Orcish Cannonade).
 *
 * ⭐ IDENTIFIED BY SIBLING ASYMMETRY, the cheapest signal in the runbook: 20 corpus carriers of the shape
 * and ELEVEN already native — all the ACTIVATED carriers (Fireslinger, Orcish Cannoneers, Goblin
 * Artillery, Granger Guildmage), whose sentence reaches the clause parser intact and never meets the
 * splitter, carrying the rider as `selfDamage`. The same words, modeled on one path and not the other.
 *
 * TWO changes, both required, and the second is the one this file mostly exists to defend:
 *   ① the splitter keeps the sentence whole (the keep-whole pattern it already uses a dozen times);
 *   ② `matchSelfHitDamage` is reachable PER-CLAUSE. Without ②, keeping the sentence whole only moves the
 *      problem: the clause reaches the ordinary damage parser, which matches the leading half and
 *      SILENTLY DROPS the rider — native, and strictly better than printed. Third instance today of one
 *      shape (a whole-oracle matcher that only fires when its sentence IS the entire card), after
 *      impulse-exile and optional-discard-payment.
 *
 * ⛔ THE ANCHORS ARE NARROWER THAN THE ENGLISH, AND BOTH NARROWINGS ARE MEASURED FP REFUSALS:
 *   • "to you", never "to ITSELF" — the parser emits NO selfDamage field for the itself form, and
 *     stack.js applies selfDamage to the CONTROLLER anyway, which is wrong for it (CR 119.3: the creature
 *     damages itself). Psionic Entity / Reckless Embermage / Psionic Sliver stay parked.
 *   • "to ANY TARGET", never a restricted target — Fire and Brimstone ("…to target player who attacked
 *     this turn and 4 damage to you") is outside what matchSelfHitDamage consumes, so keeping it whole
 *     classified it native-spell with the rider dropped. It splits and parks instead.
 * Both were caught by the per-row whole-card audit. The tier diff read +5, then +2, and was clean at
 * every step; only reading each gained row's ATOMS showed the dropped halves.
 *
 * Mutation-checked (2026-08-04, each verified applied): the splitter guard removed -> the flip pin goes
 * red; the per-clause matcher removed -> the flip pin goes red AND the rider pin goes red (the card would
 * classify native with no selfDamage, which is exactly the FP).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORCISH_CANNONADE = { id: "c-oc", name: "Orcish Cannonade", type: "Instant", mana: "{1}{R}",
  oracle: "Orcish Cannonade deals 2 damage to any target and 3 damage to you.\nDraw a card." };

describe("the sentence survives the splitter, and the rider survives the parse", () => {
  it("⭐ it splits into TWO clauses, not three (the orphan fragment is gone)", () => {
    expect(splitClauses(ORCISH_CANNONADE.oracle)).toEqual([
      "Orcish Cannonade deals 2 damage to any target and 3 damage to you",
      "Draw a card",
    ]);
  });

  it("Orcish Cannonade flips, and the program KEEPS selfDamage beside the draw", () => {
    expect(classifyCard(ORCISH_CANNONADE)).toBe("native-spell");
    const p = parseEffectProgram(ORCISH_CANNONADE);
    expect(programConfidence(p)).toBe("high");
    expect((p.atoms || []).map((a) => a.op)).toEqual(["deal-damage", "draw"]);
    expect(p.atoms[0]).toMatchObject({ amount: 2, selfDamage: 3 });   // ⭐ the rider is carried, not dropped
  });
});

describe("⛔ THE TWO FP REFUSALS, both measured before they were written", () => {
  it("'and N damage to ITSELF' parses with NO selfDamage, so its carriers stay parked", () => {
    const you = parseEffectClause("This creature deals 2 damage to any target and 3 damage to you", "Instant");
    const itself = parseEffectClause("This creature deals 2 damage to any target and 3 damage to itself", "Instant");
    expect(you.atoms[0]).toMatchObject({ selfDamage: 3 });
    // The "itself" form yields NO usable damage atom carrying the rider — it produces no atoms at all
    // here, which is the safe direction (the card parks). Asserted as "no atom with selfDamage" rather
    // than pinning the exact empty shape, so a future parser that returns a rider-less atom still fails.
    expect((itself.atoms || []).some((a) => a.selfDamage != null)).toBe(false);
    expect(classifyCard({ id: "c-pe", name: "Psionic Entity", type: "Creature — Illusion", mana: "{2}{U}{U}", power: "2", toughness: "2",
      oracle: "{T}: This creature deals 2 damage to any target and 3 damage to itself." })).toBe("body-only");
  });

  it("a RESTRICTED target is outside the matcher, so Fire and Brimstone stays parked", () => {
    // Kept whole it read native-spell with the rider dropped; the "any target" anchor is what stops that.
    expect(classifyCard({ id: "c-fb", name: "Fire and Brimstone", type: "Instant", mana: "{2}{W}",
      oracle: "Fire and Brimstone deals 4 damage to target player who attacked this turn and 4 damage to you." })).toBe("arbiter-spell");
  });

  it("⛔ a two-TARGET damage sentence is not captured either", () => {
    expect(splitClauses("Bolt deals 2 damage to target creature and 2 damage to target player.").length).toBeGreaterThan(1);
  });
});

describe("⭐ RUNTIME (law 6) — the rider actually lands on the controller", () => {
  it("resolving the damage atom deals 3 to its own controller and 2 to the target", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const startUser = s0.players.user.life;
    const startAi = s0.players.ai1.life;
    const prog = { atoms: [parseEffectProgram(ORCISH_CANNONADE).atoms[0]] };
    const obj = { source: { name: "Orcish Cannonade" }, payload: { params: { program: prog, controller: "user", targets: [{ type: "player", id: "ai1" }] } } };
    const s = runEffectProgram(s0, obj);
    expect(s.players.user.life).toBe(startUser - 3);   // ⭐ the printed drawback really happens
    expect(s.players.ai1.life).toBe(startAi - 2);
  });
});
