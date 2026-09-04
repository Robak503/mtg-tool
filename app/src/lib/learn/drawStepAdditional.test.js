/**
 * drawStepAdditional.test.js — ④-AY (2026-09-04 night): "At the beginning of your draw step, draw an additional card"
 * (Grafted Skullcap, Avaricious Dragon, Overbeing of Myth, Gerrard). The draw-step event already fired (checkStepTriggers
 * "draw", detected as event:"draw" scope:"you"); only the wording "an additional card" was unread. "additional" names the
 * draw's relation to the turn's own draw (CR 504.1), not a different instruction — the clause IS "draw a card" (CR 121.1),
 * so parseClauseToAtomCore normalizes the count word through. Real oracle fixtures (bundled Scryfall snapshot, 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SKULLCAP = { id: "c-gs", name: "Grafted Skullcap", type: "Artifact", mana: "{4}", cmc: 4, keywords: [], oracle: "At the beginning of your draw step, draw an additional card.\nAt the beginning of your end step, discard your hand." };
const DRAGON = { id: "c-ad", name: "Avaricious Dragon", type: "Creature — Dragon", mana: "{2}{R}{R}", cmc: 4, power: 4, toughness: 4, keywords: ["Flying"], oracle: "Flying\nAt the beginning of your draw step, draw an additional card.\nAt the beginning of your end step, discard your hand." };
const OVERBEING = { id: "c-om", name: "Overbeing of Myth", type: "Creature — Spirit Avatar", mana: "{G/U}{G/U}{G/U}{G/U}{G/U}", cmc: 5, power: 0, toughness: 0, keywords: [], oracle: "Overbeing of Myth's power and toughness are each equal to the number of cards in your hand.\nAt the beginning of your draw step, draw an additional card." };

describe("the parse", () => {
  it("⭐ 'draw an additional card' reads as the draw it is; the plural form scales; the Midnight Oil compound reads both halves", () => {
    expect(parseEffectClause("draw an additional card", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
    expect(parseEffectClause("draw two additional cards", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
    const oil = parseEffectClause("draw an additional card and remove two hour counters from this enchantment", "Instant", { sourceScoped: true });
    expect(oil.confidence).toBe("high");
    expect(oil.atoms).toHaveLength(2);
    expect(oil.atoms[0]).toEqual({ op: "draw", amount: 1, targetType: null });
    expect(oil.atoms[1].op).toMatch(/counter/);
  });
  it("the draw-step event was already detected; the tiers follow the effect", () => {
    expect(detectTriggers(SKULLCAP).map((d) => [d.event, d.scope])).toEqual([["draw", "you"], ["endStep", "you"]]);
    expect(classifyCard(SKULLCAP)).toBe("native-trigger");
    expect(classifyCard(DRAGON)).toBe("native-trigger");
    expect(classifyCard(OVERBEING)).toBe("native-mixed");
  });
});

describe("runtime — the draw step", () => {
  it("⭐ with Grafted Skullcap out, the controller's draw step yields the turn's draw AND the extra card; the opponent's draw step yields nothing extra", () => {
    const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ id: `${pid}-l${i}`, name: `Card ${pid}${i}`, type: "Instant", mana: "{U}", cmc: 1, keywords: [], oracle: "" }));
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const base = { ...s0, turn: 6, phase: "beginning", step: "upkeep", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [], library: lib("u"), battlefield: [createPermanent({ id: "cap", card: SKULLCAP, controller: "user" })] },
        ai: { ...s0.players.ai, hand: [], library: lib("a"), battlefield: [] } } };
    let s = nextStep(base);
    expect(s.step).toBe("draw");
    if (!s.stack.length) s = flushTriggers(s);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.players.user.hand).toHaveLength(2);
    expect(s.players.ai.hand).toHaveLength(0);
    // the AI's own draw step: the Skullcap belongs to the user, so nothing extra
    let t = nextStep({ ...base, activePlayer: "ai", priorityHolder: "ai" });
    if (!t.stack.length) t = flushTriggers(t);
    expect(t.stack).toHaveLength(0);
    expect(t.players.ai.hand).toHaveLength(1);
  });
});
