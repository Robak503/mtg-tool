/**
 * spellMastery.test.js — SPELL MASTERY additive riders (CR 207.2c ability word): "<base>.\nSpell
 * mastery — If there are two or more instant and/or sorcery cards in your graveyard, <rider>."
 * Flip-diff +3/0/0 — Unholy Hunger (+ gain 2 life), Dark Petition (+ add {B}{B}{B}), Gideon's Phalanx
 * (+ group indestructible EOT).
 *
 * ⭐ NO NEW MACHINE: the parser collapses base + rider into base atoms + ONE `conditional` atom
 * { ifTrue: rider, ifFalse: [] } — the SAME applyConditional the CR 608.2 replacement arm feeds — and
 * evaluateInterveningIf gained the instant-and/or-sorcery UNION count arm (the same word-anchored
 * Instant|Sorcery read library.js's bespoke Animist's Awakening arm uses).
 *
 * ⛔ THE FREE-SPELL DIRECTION IS THE GUARD: with the condition UNMET the rider must do NOTHING — a gain
 * of 2 life / three black mana / an indestructible blanket on a one-instant graveyard is credit without
 * charge. Both outcomes run to completion below.
 *
 * ⛔ Parked honestly: Calculated Dismissal (its scry rider PAUSES, and `conditional` is not in the
 * PAUSING registry — admitting it would drop the pause contract), Dark Dabbling ("regenerate each other
 * creature you control" doesn't parse as a rider), Fiery Impulse's "instead" replacement class, and the
 * machine riders (Swift Reckoning's flash grant, Exquisite Firecraft's can't-be-countered).
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the union condition arm removed from interveningIf -> all three park (the condition is no longer
 *     decidable, the parser arm's gate refuses).
 *   · ifTrue/ifFalse swapped in the SM parser arm -> the unmet-condition row GAINS the rider (the
 *     free-spell inversion) and the met row loses it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HUNGER = { id: "c-uh", name: "Unholy Hunger", type: "Instant", mana: "{3}{B}{B}",
  oracle: "Destroy target creature.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, you gain 2 life." };
const PETITION = { id: "c-dp", name: "Dark Petition", type: "Sorcery", mana: "{3}{B}{B}",
  oracle: "Search your library for a card, put that card into your hand, then shuffle.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, add {B}{B}{B}." };
const PHALANX = { id: "c-gp", name: "Gideon's Phalanx", type: "Instant", mana: "{5}{W}{W}",
  oracle: "Create four 2/2 white Knight creature tokens with vigilance.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, creatures you control gain indestructible until end of turn." };

describe("the carriers and the refusals", () => {
  it("⭐ the trio flips native-spell; the pausing/unparsed riders stay parked", () => {
    for (const c of [HUNGER, PETITION, PHALANX]) expect(classifyCard(c), c.name).toMatch(/^native/);
    const row = {
      calculatedDismissal: classifyCard({ id: "c-cd", name: "Calculated Dismissal", type: "Instant", mana: "{2}{U}",
        oracle: "Counter target spell unless its controller pays {3}.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, scry 2." }),
      fieryImpulse: classifyCard({ id: "c-fi", name: "Fiery Impulse", type: "Instant", mana: "{R}",
        oracle: "Fiery Impulse deals 2 damage to target creature.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, Fiery Impulse deals 4 damage to that creature instead." }),
    };
    console.log("  WITNESS spellMasteryRefusals", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.calculatedDismissal).toBe("arbiter-spell");
    expect(row.fieryImpulse).toBe("arbiter-spell");
  });

  it("⭐ the program shape: base atoms + one conditional with an EMPTY ifFalse", () => {
    const p = parseEffectClause(HUNGER.oracle, "Instant");
    const row = { ops: p.atoms.map((a) => a.op), ifTrue: p.atoms.at(-1).ifTrue.map((a) => a.op), ifFalse: p.atoms.at(-1).ifFalse };
    console.log("  WITNESS spellMasteryProgram", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ops).toEqual(["destroy", "conditional"]);
    expect(row.ifTrue).toEqual(["gain-life"]);
    expect(row.ifFalse).toEqual([]);
  });
});

describe("⭐⭐ LAW 6 — both outcomes of the condition, run to completion", () => {
  function stateWithGraveyard(instantCount) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const gy = [
      ...Array.from({ length: instantCount }, (_, i) => ({ id: "gi" + i, name: "Old Bolt " + i, type: "Instant", oracle: "" })),
      { id: "gcr", name: "Dead Bear", type: "Creature — Bear", oracle: "" }, // a non-IS card that must NOT count
    ];
    return { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: gy } } };
  }
  const smAtom = (rider) => ({ op: "conditional", branchOn: "there are two or more instant and/or sorcery cards in your graveyard", ifTrue: rider, ifFalse: [], targetType: null });

  it("⭐⭐ TWO instants in the graveyard: the rider runs (gain 2 → 42)", () => {
    const s = stateWithGraveyard(2);
    const after = ATOM_RESOLVERS.conditional(s, smAtom([{ op: "gain-life", amount: 2, targetType: null }]), { controller: "user", targets: [] });
    const row = { life: after.players.user.life };
    console.log("  WITNESS spellMasteryMet", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ life: 42 });
  });

  it("⛔⛔ ONE instant (plus a creature card that must not count): the rider does NOTHING", () => {
    const s = stateWithGraveyard(1);
    const after = ATOM_RESOLVERS.conditional(s, smAtom([{ op: "gain-life", amount: 2, targetType: null }]), { controller: "user", targets: [] });
    const row = { life: after.players.user.life };
    console.log("  WITNESS spellMasteryUnmet", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ life: 40 });
  });
});
