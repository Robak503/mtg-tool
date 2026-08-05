/**
 * grantedMustAttack.test.js — an AURA or EQUIPMENT handing "attacks each combat if able" to a creature
 * whose own card says nothing: Bloodshed Fever, Furor of the Bitten, Guise of Fire, Uncontrollable Anger,
 * Mogis's Warhound, Tormentor's Trident. Ten aura/equipment carriers, 0 native before this.
 *
 * ⛔ WHY THE EXISTING READER COULD NOT BE REUSED, which is the whole reason this is a build and not a
 * one-line credit: opponentAI.selfMustAttack matches the CARD's PRINTED oracle. The enchanted creature's
 * text says nothing about attacking, so that function structurally cannot see a granted requirement — no
 * amount of widening its regex would help. The grant rides the layer-6 `mustAttack` pseudo-keyword, read
 * layer-aware beside it at the force-declare site, which also means the requirement LIFTS the instant the
 * Aura leaves. Same shape as the pacifism class's cantAttack/cantBlock, one lane above it in the parser.
 *
 * ⓘ ENFORCEMENT PARITY, STATED RATHER THAN IMPLIED. This requirement is honored in the AI's attack planner
 * only. That is exactly where the PRINTED form is honored — Juggernaut has been native on those terms since
 * subsystem 4 — so the granted form makes no broader claim than the printed one. Saying so out loud matters
 * because "native" has to mean the same thing for both, or the tier is lying about one of them.
 *
 * ⭐ GOAD WAS THIS SLICE'S REFUSAL AND HAS SINCE BEEN BUILT (goad.test.js). It was held back because
 * CR 701.38 is TWO rules — attacks each combat if able AND *attacks a player other than you if able* — and
 * this slice only had the first. Crediting it here would have been a half-credit: a creature forced to
 * attack but free to pick its victim isn't goaded. The second half now exists
 * (layers.goaderControllersOf + the planner's defender filter), and goad REUSES the `mustAttack` keyword
 * built here for its first half. The refusal boundary moved; it did not disappear — the inverted pin below
 * re-arms it on Eye of Nidhogg, which bolts goad onto a type-change this parser still can't model.
 *
 * ⓘ The "unless" release (Reckless Cohort's conditional requirement) is deliberately not consulted for the
 * granted form: no Aura in the corpus grants a CONDITIONAL requirement, and mustAttackUnlessOf reads
 * printed text anyway. If one ever prints, the predicate must be carried onto the grant — not assumed away.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the
 * layer-aware read removed from selfMustAttackNow -> the enchanted creature is no longer force-declared and
 * the runtime pin goes red while the parser pins stay green (which is precisely the split that would have
 * shipped a hollow credit).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { pickAttackPlan } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { parseAuraBonus } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const BLOODSHED_FEVER = { id: "c-bf", name: "Bloodshed Fever", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\nEnchanted creature attacks each combat if able." };
const FUROR_OF_THE_BITTEN = { id: "c-fb", name: "Furor of the Bitten", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 and attacks each combat if able." };
const GUISE_OF_FIRE = { id: "c-gf", name: "Guise of Fire", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\nEnchanted creature gets +1/-1 and attacks each combat if able." };
const TORMENTORS_TRIDENT = { id: "c-tt", name: "Tormentor's Trident", type: "Artifact — Equipment", mana: "{4}",
  oracle: "Equipped creature gets +3/+0 and attacks each combat if able.\nEquip {3}" };
const PSYCHIC_IMPETUS = { id: "c-pi", name: "Psychic Impetus", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and is goaded." };

describe("the carriers flip, and goad deliberately does not", () => {
  it("⭐ bare and combined forms, aura and equipment alike", () => {
    expect(classifyCard(BLOODSHED_FEVER)).toBe("native-aura");
    expect(classifyCard(FUROR_OF_THE_BITTEN)).toBe("native-aura");
    expect(classifyCard(GUISE_OF_FIRE)).toBe("native-aura");        // +1/-1 — the negative half must survive
    expect(classifyCard(TORMENTORS_TRIDENT)).toBe("native-equipment");
  });

  it("⭐ GOAD WAS THE REFUSAL AND IS NOW BUILT — inverted in place, guard job intact", () => {
    // This pin was the refusal boundary for the must-attack slice: goad carries a SECOND rule ("attacks a
    // player other than you if able") that the planner did not honor, so crediting it would have been a
    // half-credit. That second half now exists (layers.goaderControllersOf + the planner's defender
    // filter), so the boundary moved rather than vanished — see goad.test.js for both halves driven.
    expect((parseAuraBonus(PSYCHIC_IMPETUS) || []).map((e) => e.op?.keyword || e.op?.layerOp))
      .toContain("goaded");
    // ⛔ THE GUARD'S JOB, RE-ARMED on what genuinely still isn't modelled: Eye of Nidhogg bolts goad onto a
    // type-change + base-P/T set. All-or-nothing must still drop the WHOLE bonus rather than grant goad to
    // a creature that never becomes the 4/2 flying deathtouch Dragon the card promises.
    expect(classifyCard({ id: "c-en", name: "Eye of Nidhogg", type: "Enchantment — Aura", mana: "{3}{B}",
      oracle: "Enchant creature\nEnchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded." }))
      .toBe("body-only");
  });
});

describe("⭐ LAW 6 — the AI's attack planner honors a GRANTED requirement", () => {
  // The harness from mustAttack.test.js: an unprofitable attack (1/1 into an untapped 3/3) that the racer
  // would decline. If the creature is forced to attack, only the requirement can explain it.
  function board({ aura }) {
    const atk = createPermanent({ id: "atk", card: { id: "g", name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    const blk = createPermanent({ id: "blk", card: { id: "o", name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    const bf = [atk];
    if (aura) {
      // ⛔ BOTH SIDES OF THE LINK, SET AFTER CONSTRUCTION. createPermanent does not accept `attachedTo`
      // (it always initialises it to null), and the layer engine walks the HOST's `attachments`. Passing
      // attachedTo to the constructor silently attaches nothing — which reads as a clean negative: the
      // planner declines the attack and every row looks consistent. It cost a red run here to catch.
      const a = createPermanent({ id: "aura", card: aura, controller: "ai" });
      a.attachedTo = "atk";
      atk.attachments = ["aura"];
      bf.push(a);
    }
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers",
      players: { ...g.players, ai: { ...g.players.ai, battlefield: bf, life: 20 }, user: { ...g.players.user, battlefield: [blk], life: 20 } } };
  }
  const attacks = (s) => pickAttackPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker"))
    .some((a) => a.permanentId === "atk");

  it("⭐ unenchanted the Goblin stays home; enchanted it is FORCED to swing", () => {
    const rows = [
      { aura: null, label: "bare" },
      { aura: BLOODSHED_FEVER, label: "Bloodshed Fever" },
      { aura: FUROR_OF_THE_BITTEN, label: "Furor of the Bitten" },
    ].map(({ aura, label }) => {
      const s = board({ aura });
      return { aura: label, power: permanentPower(s, "atk"), mustAttack: permanentHasKeyword(s, "atk", "mustAttack"), declared: attacks(s) };
    });
    console.log("  WITNESS", JSON.stringify(rows)); // printed — a broken harness reads as a uniform negative
    expect(rows).toEqual([
      // ⛔ THE CONTROL. Same board, no Aura: the racer declines the unprofitable attack. Without this row
      // "declared: true" below would prove nothing — the AI might simply swing with everything.
      { aura: "bare", power: 1, mustAttack: false, declared: false },
      // ⭐ THE ROW THAT ACTUALLY PROVES ENFORCEMENT. Under the mutation that removes the layer-aware read,
      // this row reads {mustAttack: true, declared: FALSE} — the grant lands and nothing honors it, which
      // is precisely the hollow credit this slice exists to avoid. The parser pins stay green there.
      { aura: "Bloodshed Fever", power: 1, mustAttack: true, declared: true },
      // The combined form must land BOTH halves: the pump and the requirement.
      // ⛔ BUT THIS ROW DOES NOT DISCRIMINATE ON ENFORCEMENT — do not read it as if it did. +2/+2 makes the
      // 3/3-into-3/3 attack PROFITABLE, so the racer declares it on its own merits; it stays `declared:
      // true` even under the mutant. Its job is the pump half (power 1 -> 3) and nothing more.
      { aura: "Furor of the Bitten", power: 3, mustAttack: true, declared: true },
    ]);
  });

  it("⛔ the requirement LIFTS when the Aura leaves — it is a grant, not a rewrite of the card", () => {
    const s = board({ aura: BLOODSHED_FEVER });
    expect(attacks(s)).toBe(true);
    const without = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.filter((p) => p.id !== "aura") } } };
    expect(permanentHasKeyword(without, "atk", "mustAttack")).toBe(false);
    expect(attacks(without)).toBe(false);
  });
});
