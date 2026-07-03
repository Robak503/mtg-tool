/**
 * drawTargetPower.test.js — DRAW-BY-TARGET-POWER (Soul's Majesty), the targeted draw-scaler.
 *
 * "Draw cards equal to the power|toughness of target creature[ you control]" — a CHOSEN single creature
 * target (targetType:"creature", optional controller:you restriction) whose LAYER-AWARE power/toughness AT
 * RESOLUTION (CR 608.2h) is the draw count. The count reads the chosen target via the new TARGET-STAT
 * countForSpec branch (kind:"targetCreaturePower"/"targetCreatureToughness", reading ctx.targets) — distinct
 * from the board-MAX greatestPowerYouControl (DRAW-METRIC) and the SOURCE-STAT sourcePower/triggeringPower.
 *
 * Covers: parser atom shape + HIGH confidence (you-control + bare forms; toughness variant); countForSpec
 * resolution (chosen target's power, layer-aware via counters, missing/non-creature target → 0); the CREED
 * anti-FP pins (an unmodeled scry-that-many rider stays LOW → Arbiter; a filtered "nonland" target stays
 * LOW); the cast-path target enumeration (you-control offers ONLY the caster's creatures); the live end-to-end
 * cast (Soul's Majesty draws exactly the chosen creature's power; opponent's creatures are not offered).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget, atomTargetIntent } from "../parser.js";
import { countForSpec } from "./shared.js";
import { resolveAtom } from "../effectAtoms.js";
import { expandCastChoices } from "../targeting.js";
import { classifyCard } from "../../coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { legalActionsForPlayer, filterActions } from "../../legalChoices.js";
import { dispatchAction } from "../../actionDispatcher.js";
import { resolveTopOfStack } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle) => ({ type: "Sorcery", oracle });
const atom0 = (card) => parseEffectProgram(card).atoms[0];
const conf = (card) => programConfidence(parseEffectProgram(card));

const SOULS_MAJESTY = { id: "c-souls", name: "Soul's Majesty", type: "Sorcery", mana: "{4}{G}",
  oracle: "Draw cards equal to the power of target creature you control." };

// A creature permanent with explicit P/T (default Beast) + optional counters.
function creature(id, { power = 1, toughness = 1, controller = "user", counters = {} } = {}) {
  return {
    id, controller, tapped: false, summoningSick: false, counters,
    damageMarked: 0, attachments: [], attachedTo: null,
    card: { name: `T-${id}`, type: "Creature — Beast", power, toughness },
  };
}
// State with the given user/ai battlefields + a user library so a draw never decks out.
function stateWith(userBf, aiBf = [], libCount = 20) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: libCount }, (_, i) => ({ name: `L${i}`, type: "Land" }));
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library, hand: [] },
      ai: { ...s.players.ai, battlefield: aiBf, library: [...library], hand: [] },
    },
  };
}

describe("DRAW-BY-TARGET-POWER — parser", () => {
  it("'draw cards equal to the power of target creature you control' → HIGH, targeted, targetCreaturePower", () => {
    expect(atom0(S("Draw cards equal to the power of target creature you control."))).toMatchObject({
      op: "draw", targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }],
      amountCount: { kind: "targetCreaturePower", per: 1 },
    });
    const prog = parseEffectProgram(S("Draw cards equal to the power of target creature you control."));
    expect(programConfidence(prog)).toBe("high");
    expect(programNeedsChosenTarget(prog)).toBe(true);
  });

  it("the toughness variant parses to targetCreatureToughness (HIGH)", () => {
    expect(atom0(S("Draw cards equal to the toughness of target creature you control."))).toMatchObject({
      op: "draw", targetType: "creature", amountCount: { kind: "targetCreatureToughness", per: 1 },
    });
    expect(conf(S("Draw cards equal to the toughness of target creature you control."))).toBe("high");
  });

  it("the BARE 'target creature' form (no you-control) is HIGH with no controller restriction", () => {
    const a = atom0(S("Draw cards equal to the power of target creature."));
    expect(a).toMatchObject({ op: "draw", targetType: "creature", amountCount: { kind: "targetCreaturePower", per: 1 } });
    expect(a.restrictions).toBeUndefined();
    expect(conf(S("Draw cards equal to the power of target creature."))).toBe("high");
  });

  it("atomTargetIntent is 'own' for the you-control form, 'ambiguous' for the bare form (CREED trigger gate)", () => {
    expect(atomTargetIntent(atom0(S("Draw cards equal to the power of target creature you control.")))).toBe("own");
    expect(atomTargetIntent(atom0(S("Draw cards equal to the power of target creature.")))).toBe("ambiguous");
  });
});

describe("DRAW-BY-TARGET-POWER — CREED anti-FP (an unmodeled clause keeps the WHOLE card LOW → Arbiter)", () => {
  it("an unmodeled 'scry that many' rider stays LOW (all-or-nothing — never a dropped clause)", () => {
    // NOTE: the former example here ("You gain that much life.") is now a MODELED atom (Essence Sliver's
    // combat-damage-scaled gain-that-much-life sentinel, countContext:"combatDamageAmount"), so the composed
    // PROGRAM parses HIGH. That is NOT a spell-path FP: coverage.nativeSpell's COMBAT-REFERENT SPELL GUARD
    // rejects a countContext:"combatDamageAmount" atom on the cast path (a spell never supplies the referent →
    // the card stays on the Arbiter). "Scry that many" is a genuinely-unmodeled rider that still proves the
    // parser's all-or-nothing gate here (an unmodeled follow-on drops the WHOLE program to LOW, never a partial).
    expect(conf(S("Draw cards equal to the power of target creature you control. Scry that many."))).toBe("low");
    expect(parseEffectProgram(S("Draw cards equal to the power of target creature you control. Scry that many.")).atoms).toEqual([]);
  });

  it("a filtered 'nonland creature' target stays LOW (the filter is unmodeled → Arbiter)", () => {
    expect(conf(S("Draw cards equal to the power of target nonland creature you control."))).toBe("low");
  });

  it("a clean modeled rider DOES compose (draw + discard a card → a HIGH 2-atom program, not a drop)", () => {
    // ", then discard a card" is itself a modeled atom, so the all-or-nothing gate correctly keeps the
    // program HIGH (both atoms resolve) — this is NOT an FP (no clause is silently dropped).
    const prog = parseEffectProgram(S("Draw cards equal to the power of target creature you control, then discard a card."));
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms.map((a) => a.op)).toEqual(["draw", "discard"]);
  });
});

describe("DRAW-BY-TARGET-POWER — countForSpec resolution (the chosen target's stat)", () => {
  it("reads the CHOSEN target's power (a 5/3 → 5; a different target → its own power)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 3 }), creature("b", { power: 2, toughness: 2 })]);
    expect(countForSpec(s, { controller: "user", targets: [{ type: "creature", id: "a" }] }, { kind: "targetCreaturePower" })).toBe(5);
    expect(countForSpec(s, { controller: "user", targets: [{ type: "creature", id: "b" }] }, { kind: "targetCreaturePower" })).toBe(2);
  });

  it("is LAYER-AWARE — +1/+1 counters bump the count (a 5/3 base with +2/+2 → 7)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 3, counters: { "+1/+1": 2 } })]);
    expect(countForSpec(s, { controller: "user", targets: [{ type: "creature", id: "a" }] }, { kind: "targetCreaturePower" })).toBe(7);
  });

  it("the toughness variant reads the chosen target's toughness (a 5/3 → 3)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 3 })]);
    expect(countForSpec(s, { controller: "user", targets: [{ type: "creature", id: "a" }] }, { kind: "targetCreatureToughness" })).toBe(3);
  });

  it("a target that left the battlefield → 0 (a clean no-op, never fabricated — CR 107.3)", () => {
    const s = stateWith([creature("a", { power: 5 })]);
    expect(countForSpec(s, { controller: "user", targets: [{ type: "creature", id: "GONE" }] }, { kind: "targetCreaturePower" })).toBe(0);
  });

  it("no creature in the target slot → 0", () => {
    const s = stateWith([creature("a", { power: 5 })]);
    expect(countForSpec(s, { controller: "user", targets: [] }, { kind: "targetCreaturePower" })).toBe(0);
  });
});

describe("DRAW-BY-TARGET-POWER — end-to-end (resolveAtom draws the chosen target's power)", () => {
  it("targeting a 5/3 you control → the controller draws 5 (hand grows by 5)", () => {
    const s = stateWith([creature("a", { power: 5, toughness: 3 })]);
    const atom = atom0(S("Draw cards equal to the power of target creature you control."));
    const out = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "a", controller: "user" }] });
    expect(out.players.user.hand).toHaveLength(5);
  });

  it("a 0-power target → draws 0 (hand unchanged, never a fabricated draw)", () => {
    const s = stateWith([creature("z", { power: 0, toughness: 4 })]);
    const atom = atom0(S("Draw cards equal to the power of target creature you control."));
    const out = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "z", controller: "user" }] });
    expect(out.players.user.hand).toHaveLength(0);
  });
});

describe("DRAW-BY-TARGET-POWER — cast path (you-control offers ONLY the caster's creatures)", () => {
  it("expandCastChoices enumerates only the caster's creatures, each atomIndex-tagged", () => {
    const s = stateWith(
      [creature("mine1", { power: 4 }), creature("mine2", { power: 2 })],
      [creature("theirs", { power: 9, controller: "ai" })],
    );
    const prog = parseEffectProgram(SOULS_MAJESTY);
    const choices = expandCastChoices(s, "user", prog, ["G"]);
    const ids = choices.map((c) => c.targets.map((t) => t.id)).flat().sort();
    expect(ids).toEqual(["mine1", "mine2"]);                 // the opponent's "theirs" is NOT offered
    for (const c of choices) expect(c.targets[0].atomIndex).toBe(0);
  });

  it("Soul's Majesty classifies native-spell", () => {
    expect(classifyCard(SOULS_MAJESTY)).toBe("native-spell");
  });
});

describe("DRAW-BY-TARGET-POWER — live cast resolution (Soul's Majesty draws the targeted creature's power)", () => {
  it("casting Soul's Majesty on a 6/6 you control draws 6; the opponent's creature can't be chosen", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const library = Array.from({ length: 20 }, (_, i) => ({ name: `L${i}`, type: "Land" }));
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s0.players,
        user: {
          ...s0.players.user, library, hand: [SOULS_MAJESTY],
          manaPool: { ...s0.players.user.manaPool, C: 8, G: 4 },
          battlefield: [createPermanent({ id: "big", card: { name: "Big", type: "Creature — Beast", power: 6, toughness: 6 }, controller: "user", summoningSick: false })],
        },
        ai: {
          ...s0.players.ai,
          battlefield: [createPermanent({ id: "enemy", card: { name: "Enemy", type: "Creature — Beast", power: 9, toughness: 9 }, controller: "ai", summoningSick: false })],
        },
      },
    };
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-souls");
    expect(casts.length).toBeGreaterThan(0);
    // Every legal cast targets the caster's own creature, never the opponent's.
    for (const c of casts) expect(c.targets.every((t) => t.id !== "enemy")).toBe(true);
    const onBig = casts.find((a) => a.targets.some((t) => t.id === "big"));
    expect(onBig).toBeTruthy();
    const handBefore = s.players.user.hand.length; // Soul's Majesty leaves the hand on cast
    s = resolveTopOfStack(dispatchAction(s, onBig));
    // Drew 6 (the targeted creature's power); the spell itself left the hand → net +6 minus the spell.
    expect(s.players.user.hand.length).toBe(handBefore - 1 + 6);
  });
});
