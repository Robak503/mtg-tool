/**
 * gustcloakEscape.test.js — BLITZ GC-1: the GUSTCLOAK escape (CR 506.4 / 509.3c / 510.1c-d).
 *
 * "Whenever this creature becomes blocked, you may untap it and remove it from combat." (Gustcloak Runner /
 * Sentinel / Harrier / Skirmisher; the Cavalier printing writes "untap this creature".) The becomesBlocked
 * trigger machinery exists (checkBlockTriggers, CR 509.3c once-per-combat dedup); the effect is combat-state
 * surgery via ONE new atom (untap-remove-from-combat, target:"self"):
 *   • untap the source (untapPermanent + the Mesmeric-Orb untap-trigger drain);
 *   • remove it from combat = the `removedFromCombat` flag (the CR 701.19 regeneration vehicle —
 *     combatResolution's combatant() gate skips it as damage dealer AND receiver) + dropping its record from
 *     state.combat.attackers (CR 506.4 — it stops being an ATTACKING creature, so scope reads exclude it, and
 *     the blocker-deals-back loop — which iterates combat.attackers — never lets its former blockers deal:
 *     exactly CR 510.1d). Its blocker RECORDS stay (CR 506.4 removes only THIS creature; the blockers remain
 *     blocking creatures — they just assign no combat damage).
 * The "you may" rides the house α2 optional-effect machinery: the human seat gets a real yes/no pause;
 * AI/Expert auto-take (learnSession's documented optional-effect policy). BOTH branches pinned below.
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkBlockTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RUNNER_ORACLE = "Whenever this creature becomes blocked, you may untap it and remove it from combat.";
const cr = (name, oracle, type = "Creature — Human Soldier") => ({ name, type, power: 2, toughness: 2, oracle });
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 30) st = resolveTopOfStack(st); return st; };

// A declare-blockers state: `attackers` + `blockers` combat records, both players at 40 life.
function combat(userBf, aiBf, attackers, blockers) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers",
    combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
const perm = (id, name, oracle, { controller = "user", power = 2, toughness = 2, tapped = false } = {}) => ({
  ...createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Human Soldier", power, toughness, oracle }, controller, summoningSick: false }),
  tapped,
});

describe("GC-1 parser + classify — the escape clause parses to ONE optional self atom", () => {
  it("detects the becomesBlocked descriptor and parses its effect HIGH (both pronoun printings)", () => {
    const d = detectTriggers(cr("Gustcloak Runner", RUNNER_ORACLE));
    expect(d).toEqual([expect.objectContaining({ event: "becomesBlocked", effectClause: "you may untap it and remove it from combat", optional: true })]);
    for (const clause of ["you may untap it and remove it from combat", "you may untap this creature and remove it from combat"]) {
      const p = parseEffectClause(clause, "Creature");
      expect(programConfidence(p)).toBe("high");
      expect(p.atoms).toEqual([{ op: "untap-remove-from-combat", target: "self", optional: true }]);
    }
  });
  it("classify: the whole family flips native (Runner bare / Harrier +Flying / Cavalier 3-ability)", () => {
    expect(classifyCard(cr("Gustcloak Runner", RUNNER_ORACLE))).toBe("native-trigger");
    expect(classifyCard(cr("Gustcloak Harrier", `Flying\n${RUNNER_ORACLE}`, "Creature — Bird Soldier"))).toBe("native-trigger");
    // Cavalier: Flanking (enforced keyword) + an optional TARGETED attack tap (enemy intent — the flush
    // chooser picks an opponent's creature) + the escape (the "untap this creature" pronoun printing).
    expect(classifyCard(cr("Gustcloak Cavalier",
      "Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nWhenever this creature attacks, you may tap target creature.\nWhenever this creature becomes blocked, you may untap this creature and remove it from combat.",
      "Creature — Human Knight"))).toBe("native-trigger");
  });
  it("FN guards: the group / opponent-choice / targeted / coin-flip variants stay parked", () => {
    // Gustcloak Savior — "Whenever a creature YOU CONTROL becomes blocked, you may untap THAT creature…".
    // GRADUATED (the 09-06 plan's stage ③ · 30, 2026-09-30): this pinned "no descriptor", because checkBlockTriggers
    // had no fire path for a GROUP watcher. It has one now (the watcher fan-out — cunningEvasion.test.js), so the
    // subject IS detected; the card still parks on its PAYOFF — untapping and removing the TRIGGERING creature from
    // combat is not modeled (the escape atom is self-only). The body-only guard is the one that still matters.
    const savior = cr("Gustcloak Savior", "Flying\nWhenever a creature you control becomes blocked, you may untap that creature and remove it from combat.", "Creature — Bird Soldier");
    expect(detectTriggers(savior).filter((d) => d.event === "becomesBlocked").map((d) => d.scope)).toEqual(["creatureYouControl"]);
    expect(classifyCard(savior)).toBe("body-only");
    // Shakedown Heavy — the DEFENDING PLAYER's choice compound ("defending player may have you draw a card.
    // If they do, untap this creature and remove it from combat.") is not a leading "you may" optional.
    expect(classifyCard(cr("Shakedown Heavy", "Menace\nWhenever this creature attacks, defending player may have you draw a card. If they do, untap this creature and remove it from combat.", "Creature — Ogre Warrior"))).toBe("body-only");
    // Reconnaissance — the TARGETED, reversed-order activated form ("Remove target attacking creature you
    // control from combat and untap it") fails the self anchor.
    expect(classifyCard({ name: "Reconnaissance", type: "Enchantment", oracle: "{0}: Remove target attacking creature you control from combat and untap it." })).toBe("body-only");
    // Ydwen Efreet — the blocker-side coin-flip removal with the unblocked-rewrite rider.
    expect(classifyCard(cr("Ydwen Efreet", "Whenever this creature blocks, flip a coin. If you lose the flip, remove this creature from combat and it can't block this turn. Creatures it was blocking that had become blocked by only this creature this combat become unblocked.", "Creature — Efreet"))).toBe("body-only");
  });
});

describe("GC-1 runtime — take: untap + escape; the fixed combat consequences (CR 506.4 / 510.1c-d)", () => {
  // A tapped 2/2 Gustcloak attacker blocked by a 3/3 (lethal blocker — escaping saves it).
  const setup = () => {
    const atk = perm("atk", "Gustcloak Runner", RUNNER_ORACLE, { tapped: true });
    const blk = perm("blk", "Hill Giant", "", { controller: "ai", power: 3, toughness: 3 });
    let s = combat([atk], [blk], [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "atk", blockerId: "blk" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice).toEqual(expect.objectContaining({ kind: "optional-effect", controller: "user", effectOp: "untap-remove-from-combat" }));
    return s;
  };

  it("TAKE — untapped, flagged, out of combat.attackers; blocker record stays; NOBODY deals combat damage", () => {
    let s = resolveAll(resolveOptionalChoice(setup(), true));
    const atk = s.players.user.battlefield.find((p) => p.id === "atk");
    expect(atk.tapped).toBe(false);                                   // untapped (the printed instruction)
    expect(atk.removedFromCombat).toBe(true);                         // the combatant() damage gate
    expect(s.combat.attackers).toEqual([]);                           // stops being an ATTACKING creature (CR 506.4)
    expect(s.combat.blockers).toEqual([{ attackerId: "atk", blockerId: "blk" }]); // its blockers REMAIN in combat
    // Combat damage: the escaped attacker deals/takes nothing; the orphaned blocker assigns nothing (CR 510.1d).
    s = resolveCombatDamage(s);
    expect(s.players.user.battlefield.find((p) => p.id === "atk").damageMarked || 0).toBe(0); // survived the lethal 3/3
    expect(s.players.ai.battlefield.find((p) => p.id === "blk").damageMarked || 0).toBe(0);   // took nothing back
    expect(s.players.ai.life).toBe(40);                                // no damage spilled anywhere
    expect(s.players.user.graveyard).toEqual([]);                      // the Gustcloak lived
  });

  it("DECLINE — normal combat: the 3/3 blocker kills the staying 2/2 attacker", () => {
    let s = resolveAll(resolveOptionalChoice(setup(), false));
    const atk = s.players.user.battlefield.find((p) => p.id === "atk");
    expect(atk.tapped).toBe(true);                                     // still the tapped declared attacker
    expect(atk.removedFromCombat).toBeFalsy();
    expect(s.combat.attackers).toEqual([{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }]);
    s = resolveCombatDamage(s);
    expect(s.players.user.graveyard.some((c) => c.name === "Gustcloak Runner")).toBe(true); // 3 damage ≥ 2 toughness
    expect(s.players.ai.battlefield.find((p) => p.id === "blk").damageMarked).toBe(2);      // and it dealt its 2 back
  });

  it("CR 509.3c near-miss — an UNBLOCKED Gustcloak never fires (no pause, damage goes through)", () => {
    const atk = perm("atk", "Gustcloak Runner", RUNNER_ORACLE, { tapped: true });
    let s = combat([atk], [], [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice).toBeFalsy();                               // becomesBlocked never triggered
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                                // the unblocked 2/2 connected
  });
});
