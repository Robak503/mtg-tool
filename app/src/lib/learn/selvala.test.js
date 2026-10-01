/**
 * SELVALA, HEART OF THE WILDS — the play-weighted program, P·32 (EDHREC #438).
 *   "Whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power.
 *    {G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control."
 *
 * The trigger's effect is one draw for the ENTERING creature's controller (the Fate Foretold referent), optional — and the "may"
 * is THAT player's (`optionalDecider`, the Partner-with override's sibling in runProgram), only when the entering creature's
 * layer-aware power is strictly greater than every other creature's on the battlefield as it resolves (interveningIf; CR 608.2 —
 * the "if" sits inside the effect, so it is checked on resolution). A tie is not greater; a creature that left first can't be
 * confirmed (FN-safe skip).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); the enter trigger runs from the engine's own checkEnterTriggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SELVALA = { name: "Selvala, Heart of the Wilds", type: "Legendary Creature — Elf Scout", mana: "{1}{G}{G}", cmc: 3, power: "2", toughness: "3", keywords: [], oracle: "Whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power.\n{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control." };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], oracle: "" };
const SKYSOVEREIGN = { name: "Skysovereign, Consul Flagship", type: "Legendary Artifact — Vehicle", mana: "{5}", cmc: 5, power: "6", toughness: "5", keywords: ["Flying", "Crew"], oracle: "Flying\nWhenever Skysovereign enters or attacks, it deals 3 damage to target creature or planeswalker an opponent controls.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false });
const LIB = (who) => [1, 2, 3].map((i) => ({ ...BEARS, id: `${who}-l${i}` }));
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand: [], library: LIB("u") }, ai: { ...s.players.ai, battlefield: ai, hand: [], library: LIB("a") } } };
}
/** `who`'s creature `perm` enters under the user's Selvala: the enter trigger goes on the stack and resolves (to a pause or not). */
const enters = (s, who, perm) => {
  const entered = { ...s, players: { ...s.players, [who]: { ...s.players[who], battlefield: [...s.players[who].battlefield, perm] } } };
  return resolveTopOfStack(flushTriggers(checkEnterTriggers(entered, perm), { chooseTargets: chooseTriggerTargets }));
};
const hands = (s) => ({ user: s.players.user.hand.length, ai: s.players.ai.hand.length });

describe("parse + classify", () => {
  it("the trigger routes natively; Selvala classifies native-mana", () => {
    expect(detectTriggers(SELVALA).map(triggerRoutesNatively)).toEqual([true]);
    expect(classifyCard(SELVALA)).toBe("native-mana");
  });
});

describe("its controller may draw a card if its power is greater than each other creature's power", () => {
  it("⭐ an opponent's Craw Wurm, the biggest creature out: THEY decide, and draw", () => {
    const paused = enters(board({ user: [P("selvala", "user", SELVALA)], ai: [P("bears", "ai", BEARS)] }), "ai", P("wurm", "ai", WURM));
    const s = resolveOptionalChoice(paused, true);
    const row = { decider: paused.pendingChoice?.controller ?? null, drew: hands(s) };
    console.log("  WITNESS selvala", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ decider: "ai", drew: { user: 0, ai: 1 } });
  });

  it("your own: you decide — and may decline", () => {
    const paused = enters(board({ user: [P("selvala", "user", SELVALA)] }), "user", P("wurm", "user", WURM));
    expect({ decider: paused.pendingChoice?.controller ?? null, declined: hands(resolveOptionalChoice(paused, false)) }).toEqual({ decider: "user", declined: { user: 0, ai: 0 } });
  });

  it("a tie is not greater: a Bears entering beside 2-power Selvala draws nothing and asks nobody", () => {
    const s = enters(board({ user: [P("selvala", "user", SELVALA)] }), "ai", P("bears", "ai", BEARS));
    expect({ pause: s.pendingChoice ?? null, hands: hands(s) }).toEqual({ pause: null, hands: { user: 0, ai: 0 } });
  });

  it("another creature as big, anywhere on the battlefield (any player's), means no draw", () => {
    const s = enters(board({ user: [P("selvala", "user", SELVALA), P("bigger", "user", WURM)] }), "ai", P("wurm2", "ai", WURM));
    expect({ pause: s.pendingChoice ?? null, hands: hands(s) }).toEqual({ pause: null, hands: { user: 0, ai: 0 } });
  });

  it("only CREATURES compare: an uncrewed 6-power Vehicle (an artifact, not a creature) doesn't stop the draw", () => {
    const paused = enters(board({ user: [P("selvala", "user", SELVALA), P("sky", "user", SKYSOVEREIGN)] }), "ai", P("wurm", "ai", WURM));
    expect({ decider: paused.pendingChoice?.controller ?? null, drew: hands(resolveOptionalChoice(paused, true)) }).toEqual({ decider: "ai", drew: { user: 0, ai: 1 } });
  });

  it("the choice is never handed to Selvala's controller: a decider who left the game means the draw is skipped (synthetic)", () => {
    // Synthetic (CR 800.4a normally takes the creature along): the Wurm stays, on your side, while its triggering controller is gone.
    const s0 = board({ user: [P("selvala", "user", SELVALA)] });
    const wurm = P("wurm", "ai", WURM);
    const stacked = flushTriggers(checkEnterTriggers({ ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [wurm] } } }, wurm), { chooseTargets: chooseTriggerTargets });
    const { ai: _gone, ...rest } = stacked.players;
    const s = resolveTopOfStack({ ...stacked, turnOrder: ["user"], players: { ...rest, user: { ...rest.user, battlefield: [...rest.user.battlefield, wurm] } } });
    expect({ pause: s.pendingChoice ?? null, hand: s.players.user.hand.length }).toEqual({ pause: null, hand: 0 });
  });

  it("the entering creature left before the trigger resolved: nothing (its power can't be read)", () => {
    const s0 = board({ user: [P("selvala", "user", SELVALA)] });
    const wurm = P("wurm", "ai", WURM);
    const entered = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [wurm] } } };
    const stacked = flushTriggers(checkEnterTriggers(entered, wurm), { chooseTargets: chooseTriggerTargets });
    const gone = { ...stacked, players: { ...stacked.players, ai: { ...stacked.players.ai, battlefield: [] } } };
    const s = resolveTopOfStack(gone);
    expect({ pause: s.pendingChoice ?? null, hands: hands(s) }).toEqual({ pause: null, hands: { user: 0, ai: 0 } });
  });
});
