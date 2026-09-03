/**
 * boundQualifierTarget.test.js — ④-AG (2026-09-03 night): "target creature WITH POWER / TOUGHNESS / MANA VALUE N OR
 * LESS / GREATER" joins the subject peel — Mosstodon "{1}: Target creature with power 5 or greater gains trample",
 * Spearbreaker Behemoth, Bloodthorn Taunter, Goblin Smuggler ("another target creature with power 2 or less can't be
 * blocked"), Wrangle / Claim the Firstborn ("gain control of target creature with power 2 or less / mana value 3 or
 * less"), Eternal Isolation, Silkwrap, Baffling End — 21 flipped. The three kinds are the legacy parser's own
 * (power / toughness / manaValue, op "<=" / ">="), evaluated LAYER-AWARE by creatureSatisfiesRestrictions. Real oracle
 * fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MOSSTODON = { id: "c-mt", name: "Mosstodon", type: "Creature — Plant Elephant", mana: "{4}{G}", cmc: 5, power: 5, toughness: 3, keywords: [],
  oracle: "{1}: Target creature with power 5 or greater gains trample until end of turn." };
const SMUGGLER = { id: "c-gs", name: "Goblin Smuggler", type: "Creature — Goblin Rogue", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: ["Haste"],
  oracle: "Haste\n{T}: Another target creature with power 2 or less can't be blocked this turn." };
const WRANGLE = { id: "h-wr", name: "Wrangle", type: "Sorcery", mana: "{1}{R}", mana_cost: "{1}{R}", cmc: 2, keywords: [],
  oracle: "Gain control of target creature with power 4 or less until end of turn. Untap that creature. It gains haste until end of turn." };
const ETERNAL_ISOLATION = { id: "h-ei", name: "Eternal Isolation", type: "Sorcery", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Put target creature with power 4 or greater on the bottom of its owner's library." };
const KITES = { id: "c-gk", name: "Goblin Kites", type: "Enchantment", mana: "{1}{R}", cmc: 2, keywords: [],
  oracle: "{R}: Target creature you control with toughness 2 or less gains flying until end of turn. At the beginning of the next end step, flip a coin. If you lose the flip, sacrifice that creature." };

const beast = (id, name, controller, power, counters = {}) => ({
  ...createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Beast", mana: "{2}{G}", cmc: 3, power, toughness: 3, keywords: [], oracle: "" }, controller, summoningSick: false }),
  counters,
});

function mainPhase(hand, userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: userPerms, manaPool: { W: 2, U: 0, B: 0, R: 2, G: 2, C: 2 } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const activations = (s, sourceId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId);

describe("the parse", () => {
  it("⭐ the bound peels off the subject and rides back as the legacy parser's own kinds — power / toughness / manaValue, <= / >=", () => {
    expect(parseEffectClause("Target creature with power 5 or greater gains trample until end of turn.", "Creature").atoms[0])
      .toMatchObject({ op: "pump", targetType: "creature", grantKeywords: ["Trample"], restrictions: [{ kind: "power", op: ">=", value: 5 }] });
    expect(parseEffectClause("Another target creature with power 2 or less can't be blocked this turn.", "Creature").atoms[0].restrictions)
      .toEqual([{ kind: "notSource" }, { kind: "power", op: "<=", value: 2 }]);
    expect(parseEffectClause("Destroy target creature with mana value 3 or less.", "Instant").atoms[0].restrictions).toEqual([{ kind: "manaValue", op: "<=", value: 3 }]);
    expect(parseEffectClause("Target creature you control with toughness 2 or less gains flying until end of turn.", "Creature").atoms[0].restrictions)
      .toEqual([{ kind: "controller", who: "you" }, { kind: "toughness", op: "<=", value: 2 }]);
    // "or more" is the same bound as "or greater"
    expect(parseEffectClause("Destroy target creature with power 4 or more.", "Instant").atoms[0].restrictions).toEqual([{ kind: "power", op: ">=", value: 4 }]);
    // the pump-and-grant compound stays whole through splitClauses with the bound in the subject
    expect(splitClauses("Target creature with power 2 or less gets +1/+0 and gains first strike until end of turn.")).toHaveLength(1);
  });

  it("the tiers", () => {
    expect(classifyCard(MOSSTODON)).toBe("native-activated");
    expect(classifyCard(SMUGGLER)).toBe("native-activated");
    expect(classifyCard(WRANGLE)).toBe("native-spell");
    expect(classifyCard(ETERNAL_ISOLATION)).toBe("native-spell");
  });
});

describe("runtime — the bound is read LIVE, off the layered stats", () => {
  it("⭐ Mosstodon: a 5-power beast and a 4-power beast wearing a +1/+1 counter are offered; a 4-power beast is not; resolving grants trample", () => {
    const mt = createPermanent({ id: "mt", card: MOSSTODON, controller: "user", summoningSick: false });
    const s = mainPhase([], [mt, beast("big", "Big Beast", "user", 5), beast("pumped", "Pumped Beast", "user", 4, { "+1/+1": 1 }), beast("small", "Small Beast", "user", 4)]);
    const acts = activations(s, "mt");
    expect(acts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["big", "mt", "pumped"]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.targets?.[0]?.id === "pumped")));
    expect(permanentHasKeyword(resolved, "pumped", "trample")).toBe(true);
    expect(permanentHasKeyword(resolved, "small", "trample")).toBe(false);
  });

  it("⭐ Goblin Smuggler: 'another' excludes itself even though its own power is 2; only the 2-or-less others are offered", () => {
    const gs = createPermanent({ id: "gs", card: SMUGGLER, controller: "user", summoningSick: false });
    const s = mainPhase([], [gs, beast("two", "Two Beast", "user", 2), beast("three", "Three Beast", "user", 3)], [beast("their-one", "Their One", "ai", 1)]);
    expect(activations(s, "gs").map((a) => a.targets?.[0]?.id).sort()).toEqual(["their-one", "two"]);
  });

  it("⭐ Eternal Isolation: only power 4 or greater is offered; resolving tucks the chosen one", () => {
    const s = mainPhase([ETERNAL_ISOLATION], [beast("mine", "Mine", "user", 5)], [beast("their-big", "Their Big", "ai", 4), beast("their-small", "Their Small", "ai", 3)]);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-ei");
    expect(casts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["mine", "their-big"]);
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.targets?.[0]?.id === "their-big")));
    expect(resolved.players.ai.battlefield.map((p) => p.id)).toEqual(["their-small"]);
    expect(resolved.players.ai.library.at(-1)?.name).toBe("Their Big");
  });

  it("the Goblin Kites second line (a coin flip + delayed sacrifice) still parks the card — the bound alone is not a credit", () => {
    expect(classifyCard(KITES)).not.toMatch(/^native/);
  });
});
