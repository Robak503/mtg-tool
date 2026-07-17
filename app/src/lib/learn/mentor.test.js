/**
 * mentor.test.js — MENTOR (BLITZ MN-1, CR 702.134): the keyword→trigger synthesis with a DYNAMIC target
 * restriction, end to end.
 * "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser
 * power.)" — synthesized in detectTriggers off the printed keyword (battle cry's attacks-event precedent);
 * the effectClause parses to an add-counter atom with restrictions [combat:"attacking", powerVsSource:"<"].
 * powerVsSource is the CR 702.134a comparison — target power STRICTLY below the SOURCE's, layer-aware,
 * enforced at flush enumeration (creatureSatisfiesRestrictions reads ctx.sourceId's current power and
 * fail-closes when the source is unresolvable). The +1/+1 counter is own-intent, so the enemy/own flush
 * chooser only ever picks the controller's own attacking creature of lesser power; a mentor attacking ALONE
 * (or with only equal/greater-power creatures) fires nothing (CR 603.3c no-legal-target drop). Real oracle
 * fixtures (bundled Scryfall, verified 2026-07-16); synthetic P/T per the persist.test Wisp Probe idiom.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers, mentorKeywordCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MENTOR_REMINDER = "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)";
// Real printed oracles (bundled Scryfall).
const BLADE_INSTRUCTOR = { id: "bi-card", name: "Blade Instructor", type: "Creature — Human Soldier", power: "2", toughness: "1", mana: "{2}{W}", oracle: MENTOR_REMINDER };
const SUNHOME_STALWART = { id: "ss-card", name: "Sunhome Stalwart", type: "Creature — Human Soldier", power: "2", toughness: "2", mana: "{1}{R}{W}",
  oracle: "First strike (This creature deals combat damage before creatures without first strike.)\n" + MENTOR_REMINDER };
// GRANTS (must NOT self-synthesize): "has mentor" on an equipped/enchanted creature line.
const AEGIS = { id: "aeg-card", name: "Aegis of the Legion", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature gets +1/+1 and has mentor. (Whenever it attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever equipped creature mentors a creature, put a shield counter on that creature.\nEquip {3}" };
const NYXBORN_UNICORN = { id: "nu-card", name: "Nyxborn Unicorn", type: "Enchantment Creature — Unicorn", power: "3", toughness: "3", mana: "{2}{W}",
  oracle: "Bestow {3}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature.)\n" + MENTOR_REMINDER + "\nEnchanted creature gets +2/+2 and has mentor." };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(perms, over = {}) {
  const base = { ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }),
    activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", ...over };
  const byPlayer = {};
  for (const p of perms) (byPlayer[p.controller] ??= []).push(p);
  const players = { ...base.players };
  for (const pid of Object.keys(byPlayer)) players[pid] = { ...base.players[pid], battlefield: byPlayer[pid] };
  return { ...base, players };
}
// Declare the given permanent ids as attackers for `user` (all hitting ai1), then fire + flush + resolve.
function attackAndResolve(state, attackerIds) {
  const s = { ...state, combat: { attackers: attackerIds.map((permanentId) => ({ permanentId, attackingPlayer: "user", defender: "ai1" })) } };
  const fired = checkAttackTriggers(s);
  let out = flushTriggers(fired, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while ((out.stack || []).length && guard++ < 20) out = resolveTopOfStack(out);
  return out;
}
const counterOn = (state, pid, id) => state.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;

describe("MENTOR — structural counter (grants never self-synthesize)", () => {
  it("the printed keyword counts; a grant '…and has mentor' never does", () => {
    expect(mentorKeywordCount(BLADE_INSTRUCTOR.oracle)).toBe(1);
    expect(mentorKeywordCount(SUNHOME_STALWART.oracle)).toBe(1);
    expect(mentorKeywordCount(AEGIS.oracle)).toBe(0);            // "and has mentor" — a grant segment
    expect(mentorKeywordCount(NYXBORN_UNICORN.oracle)).toBe(1);  // the keyword line counts; the aura grant line does NOT double it
  });
});

describe("MENTOR — synthesis + routing + classify", () => {
  it("synthesizes an attacks descriptor whose clause parses HIGH, own-intent, target-resolvable", () => {
    const [d] = detectTriggers(BLADE_INSTRUCTOR).filter((t) => t.event === "attacks");
    expect(d).toMatchObject({ event: "attacks", scope: "self", whose: "any", optional: false, sourceText: "Mentor" });
    expect(d.effectClause).toBe("put a +1/+1 counter on target attacking creature with lesser power");
    expect(triggerRoutesNatively(d)).toBe(true);
    const p = parseEffectClause(d.effectClause, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toMatchObject([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature",
      restrictions: [{ kind: "combat", value: "attacking" }, { kind: "powerVsSource", op: "<" }] }]);
    expect(atomTargetIntent(p.atoms[0])).toBe("own");
  });
  it("classify: Blade Instructor (pure Mentor) + Sunhome Stalwart (First strike + Mentor) flip native", () => {
    expect(classifyCard(BLADE_INSTRUCTOR).startsWith("native")).toBe(true);
    expect(classifyCard(SUNHOME_STALWART).startsWith("native")).toBe(true);
  });
  it("FN/CREED: grant-only carriers do NOT flip native (Aegis equip, Nyxborn bestow+aura line)", () => {
    expect(classifyCard(AEGIS)).not.toMatch(/^native/);
    expect(classifyCard(NYXBORN_UNICORN)).not.toMatch(/^native/);
  });
});

describe("MENTOR — runtime (CREED core): the dynamic 'lesser power' restriction", () => {
  it("mentor + a SMALLER attacker → the counter lands on the smaller creature", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const small = permObj({ name: "Squire", type: "Creature — Human Soldier", power: "1", toughness: "1", oracle: "" }, "user", "small");
    const s = attackAndResolve(stateWith([mentor, small]), ["mentor", "small"]);
    expect(counterOn(s, "user", "small")).toBe(1);
    expect(permanentPower(s, "small")).toBe(2);
    expect(counterOn(s, "user", "mentor")).toBe(0); // never itself (equal power is not lesser)
  });

  it("mentor attacking ALONE → no legal target → fires nothing (stack empties, no counter)", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const s = attackAndResolve(stateWith([mentor]), ["mentor"]);
    expect(counterOn(s, "user", "mentor")).toBe(0);
    expect((s.stack || []).length).toBe(0);
  });

  it("FP GUARD: an EQUAL-power co-attacker is NOT a legal target (CR 702.134a — equal is not lesser)", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const equal = permObj({ name: "Peer", type: "Creature — Human Soldier", power: "3", toughness: "3", oracle: "" }, "user", "equal");
    const s = attackAndResolve(stateWith([mentor, equal]), ["mentor", "equal"]);
    expect(counterOn(s, "user", "equal")).toBe(0);
    expect(counterOn(s, "user", "mentor")).toBe(0);
  });

  it("FP GUARD: a GREATER-power co-attacker is NOT a legal target", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const bigger = permObj({ name: "Giant", type: "Creature — Giant", power: "5", toughness: "5", oracle: "" }, "user", "bigger");
    const s = attackAndResolve(stateWith([mentor, bigger]), ["mentor", "bigger"]);
    expect(counterOn(s, "user", "bigger")).toBe(0);
  });

  it("FP GUARD: a smaller creature that is NOT attacking is not a legal target", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const benchSmall = permObj({ name: "Reserve", type: "Creature — Human Soldier", power: "1", toughness: "1", oracle: "" }, "user", "bench");
    // only the mentor is declared as an attacker; the smaller creature stays back
    const s = attackAndResolve(stateWith([mentor, benchSmall]), ["mentor"]);
    expect(counterOn(s, "user", "bench")).toBe(0);
    expect(counterOn(s, "user", "mentor")).toBe(0);
  });

  it("FP GUARD: an OPPONENT's smaller attacker is never buffed (own-intent chooser); the own attacker is", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "3", toughness: "3" }, "user", "mentor");
    const ownSmall = permObj({ name: "Squire", type: "Creature — Human Soldier", power: "1", toughness: "1", oracle: "" }, "user", "own");
    const foeSmall = permObj({ name: "Goblin", type: "Creature — Goblin", power: "1", toughness: "1", oracle: "" }, "ai1", "foe");
    // Both the user's mentor+own attack ai1; the opponent's creature is also flagged "attacking" (defensively,
    // the enemy-side never gets the buff because a +1/+1 counter is own-intent).
    const st = { ...stateWith([mentor, ownSmall, foeSmall]),
      combat: { attackers: [
        { permanentId: "mentor", attackingPlayer: "user", defender: "ai1" },
        { permanentId: "own", attackingPlayer: "user", defender: "ai1" },
        { permanentId: "foe", attackingPlayer: "ai1", defender: "user" },
      ] } };
    const fired = checkAttackTriggers(st);
    let s = flushTriggers(fired, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(counterOn(s, "user", "own")).toBe(1);
    expect(counterOn(s, "ai1", "foe")).toBe(0);
  });

  it("layer-aware: the comparison uses CURRENT power — a +1/+1 counter already on the smaller creature still leaves it lesser", () => {
    const mentor = permObj({ ...BLADE_INSTRUCTOR, power: "4", toughness: "4" }, "user", "mentor");
    // starts 1/1, already carrying a +1/+1 counter → current power 2 (< 4, still legal)
    const small = permObj({ name: "Squire", type: "Creature — Human Soldier", power: "1", toughness: "1", oracle: "" }, "user", "small", { counters: { "+1/+1": 1 } });
    const s = attackAndResolve(stateWith([mentor, small]), ["mentor", "small"]);
    expect(counterOn(s, "user", "small")).toBe(2); // 1 pre-existing + 1 from mentor
    expect(permanentPower(s, "small")).toBe(3);
  });
});
