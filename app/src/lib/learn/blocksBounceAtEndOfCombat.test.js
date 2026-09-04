/**
 * blocksBounceAtEndOfCombat.test.js — ④-BB (2026-09-04 night): "Whenever this creature blocks a creature, return THAT
 * creature to its owner's hand at end of combat" (Wall of Tears, Aether Membrane, Kaijin of the Vanishing Touch). The
 * blocksCreature flush threads the blocked ATTACKER as the triggering permanent (the blocker is the source); the detector
 * rewrites the anaphor to the sentinel removal.js's bounce-at-end-of-combat arm reads (target:"thatCreature"), whose
 * resolver enqueues the ④-AX bounce entry on the end-of-combat queue. Real oracle fixtures (bundled Scryfall snapshot,
 * read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TEARS = { id: "c-wt", name: "Wall of Tears", type: "Creature — Wall", mana: "{1}{U}", cmc: 2, power: 0, toughness: 4, keywords: ["Defender"], oracle: "Defender (This creature can't attack.)\nWhenever this creature blocks a creature, return that creature to its owner's hand at end of combat." };
const MEMBRANE = { id: "c-am", name: "Aether Membrane", type: "Creature — Wall", mana: "{1}{R}{R}", cmc: 3, power: 0, toughness: 5, keywords: ["Defender", "Reach"], oracle: "Defender; reach (This creature can block creatures with flying.)\nWhenever this creature blocks a creature, return that creature to its owner's hand at end of combat." };
const KAIJIN = { id: "c-kv", name: "Kaijin of the Vanishing Touch", type: "Creature — Spirit", mana: "{1}{U}", cmc: 2, power: 0, toughness: 3, keywords: ["Defender"], oracle: "Defender (This creature can't attack.)\nWhenever this creature blocks a creature, return that creature to its owner's hand at end of combat. (Return it only if it's on the battlefield.)" };

const bear = (id, controller, power = 2, toughness = 2) => ({ ...createPermanent({ id, card: { id: `card-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power, toughness, keywords: [], oracle: "" }, controller }), summoningSick: false });

describe("the detector, the parse and the classifier", () => {
  it("⭐ the blocks-a-creature anaphor is rewritten to the triggering-creature sentinel, which parses to the end-of-combat bounce", () => {
    const d = detectTriggers(TEARS);
    expect(d.map((x) => [x.event, x.scope, x.effectClause])).toEqual([["blocksCreature", "blocksCreature", "return the triggering creature to its owner's hand at end of combat"]]);
    expect(parseEffectClause(d[0].effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "bounce-at-end-of-combat", target: "thatCreature" }]);
    // the raw anaphor never parses on its own (a spell could never reach the referent)
    expect(parseEffectClause("return that creature to its owner's hand at end of combat", "Instant", { sourceScoped: true }).confidence).toBe("low");
  });
  it("the tiers", () => {
    for (const c of [TEARS, MEMBRANE, KAIJIN]) expect(classifyCard(c), c.name).toBe("native-trigger");
  });
});

describe("runtime", () => {
  it("⭐ the AI's bear attacks into Wall of Tears: after combat damage the BEAR is in the AI's hand and the Wall stays", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 7, phase: "combat", step: "declare-blockers", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
      combat: { attackers: [{ permanentId: "atk", defender: "user" }], blockers: [{ blockerId: "wall", attackerId: "atk" }] },
      players: { ...s0.players,
        ai: { ...s0.players.ai, hand: [], battlefield: [bear("atk", "ai")] },
        user: { ...s0.players.user, hand: [], battlefield: [{ ...createPermanent({ id: "wall", card: TEARS, controller: "user" }), summoningSick: false }] } } };
    s = nextStep(s);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.endOfCombatEffects).toHaveLength(1);
    expect(s.endOfCombatEffects[0]).toMatchObject({ op: "bounce", permanentId: "atk", turn: 7 });
    expect(findPermanent(s, "atk")).toBeTruthy(); // nothing moves at resolution
    const after = resolveCombatDamage(s);
    expect(findPermanent(after, "wall").permanent.damageMarked).toBe(2); // the bear hit the Wall first
    expect(findPermanent(after, "atk")).toBeNull();
    expect(after.players.ai.hand.map((c) => c.name)).toContain("Bear atk");
    expect(findPermanent(after, "wall")).toBeTruthy();
    expect(after.players.user.hand).toHaveLength(0);
  });
});
