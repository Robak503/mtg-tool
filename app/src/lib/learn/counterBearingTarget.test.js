/**
 * counterBearingTarget.test.js — ④-AC (2026-09-03 night): "TARGET CREATURE WITH A [+1/+1] COUNTER ON IT" — the graft
 * cycle's activated grants (Helium Squirter, Aquastrand Spider, Cytospawn Shambler, Plaxcaster Frogling), Sporeback
 * Troll's regenerate, Vigean Graftmage's untap, Razorfin Abolisher's bounce, Tempered Veteran, Crumbling Ashes,
 * Hidden Hideout, Hog-Monkey, Liliana, Death Wielder — 29 carriers, 16 parking on the phrase alone, 12 flipped.
 * Every atom arm hard-codes its subject, so parser.js's parseClauseToAtom peels the qualifier off the subject,
 * parses the reduced clause, and rides it back as a `hasCounter` restriction that creatureSatisfiesRestrictions
 * reads straight off perm.counters. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAZORFIN = { id: "c-raz", name: "Razorfin Abolisher", type: "Creature — Merfolk Wizard", mana: "{2}{U}", cmc: 3, power: 1, toughness: 2, keywords: [],
  oracle: "{1}{U}, {T}: Return target creature with a counter on it to its owner's hand." };
const SPOREBACK = { id: "c-spb", name: "Sporeback Troll", type: "Creature — Troll Mutant", mana: "{3}{G}", cmc: 4, power: 0, toughness: 0, keywords: ["Graft"],
  oracle: "Graft 2 (This creature enters with two +1/+1 counters on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)\n{1}{G}: Regenerate target creature with a +1/+1 counter on it." };
const HIDEOUT = { id: "c-hh", name: "Hidden Hideout", type: "Land", mana: "", cmc: 0, keywords: [],
  oracle: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity.\n{2}, {T}: Target creature you control with a counter on it gains lifelink until end of turn." };
const ASHES = { id: "c-ash", name: "Crumbling Ashes", type: "Enchantment", mana: "{1}{B}", cmc: 2, keywords: [],
  oracle: "At the beginning of your upkeep, destroy target creature with a -1/-1 counter on it." };
const LILIANA = { id: "c-lil", name: "Liliana, Death Wielder", type: "Legendary Planeswalker — Liliana", mana: "{5}{B}{B}", cmc: 7, loyalty: 5, keywords: [],
  oracle: "+2: Put a -1/-1 counter on up to one target creature.\n−3: Destroy target creature with a -1/-1 counter on it.\n−10: Return all creature cards from your graveyard to the battlefield." };

const bear = (id, name, controller, counters = {}) => ({
  ...createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false }),
  counters,
});

function board(userPerms, aiPerms = [], pool = { W: 0, U: 2, B: 0, R: 0, G: 2, C: 2 }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: userPerms, manaPool: pool },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const activations = (s, sourceId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId);

describe("the parse", () => {
  it("⭐ the qualifier peels off the subject and rides back as a hasCounter restriction (typed, or any)", () => {
    const any = parseEffectClause("Return target creature with a counter on it to its owner's hand.", "Instant");
    expect(any.atoms).toHaveLength(1);
    expect(any.atoms[0]).toMatchObject({ targetType: "creature", restrictions: [{ kind: "hasCounter", counterType: null }] });
    const typed = parseEffectClause("Destroy target creature with a -1/-1 counter on it.", "Instant");
    expect(typed.atoms[0]).toMatchObject({ op: "destroy", targetType: "creature", restrictions: [{ kind: "hasCounter", counterType: "-1/-1" }] });
    // ⛔ a counter type the runtime never places (time) is REFUSED — crediting it would credit an ability that can
    // never fire; and a two-target fight pair (Mutant's Prey) is not stamped either.
    expect(parseEffectClause("Destroy target creature with a time counter on it.", "Instant")?.atoms || []).toEqual([]);
    // ⛔ the add-counter arm emits targetType "creatureYouControl", whose enumeration pool filters by controller ALONE
    // and never consults restrictions — a stamp there would be silently ignored and a bare creature offered. Refused.
    expect(parseEffectClause("Put a +1/+1 counter on target creature you control.", "Instant").atoms[0].targetType).toBe("creatureYouControl");
    expect(parseEffectClause("Put a +1/+1 counter on target creature you control with a +1/+1 counter on it.", "Instant")?.atoms || []).toEqual([]);
    expect(classifyCard({ id: "c-mp", name: "Mutant's Prey", type: "Instant", mana: "{G}", cmc: 1, keywords: [],
      oracle: "Target creature you control with a +1/+1 counter on it fights target creature an opponent controls." })).not.toMatch(/^native/);
  });

  it("the tiers — twelve cards, each on the phrase alone", () => {
    expect(classifyCard(RAZORFIN)).toBe("native-activated");
    expect(classifyCard(SPOREBACK)).toBe("native-activated");
    expect(classifyCard(HIDEOUT)).toBe("land");
    expect(classifyCard(ASHES)).toBe("native-trigger");
    expect(classifyCard(LILIANA)).toBe("native-planeswalker");
  });
});

describe("runtime — only a counter-bearing creature is a legal target", () => {
  it("⭐ Razorfin (any counter): the bear with a counter is offered, the bare bear is not; resolving bounces it", () => {
    const raz = createPermanent({ id: "raz", card: RAZORFIN, controller: "user", summoningSick: false });
    const s = board([raz, bear("b-yes", "Marked Bear", "user", { "+1/+1": 1 })], [bear("b-no", "Bare Bear", "ai"), bear("b-stun", "Stunned Bear", "ai", { stun: 1 })]);
    const acts = activations(s, "raz");
    expect(acts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["b-stun", "b-yes"]);
    const act = acts.find((a) => a.targets?.[0]?.id === "b-stun");
    const resolved = resolveTopOfStack(dispatchAction(s, act));
    expect(resolved.players.ai.battlefield.map((p) => p.id)).toEqual(["b-no"]);
    expect(resolved.players.ai.hand.map((c) => c.name)).toContain("Stunned Bear");
  });

  it("⭐ Sporeback Troll (typed +1/+1): a -1/-1 counter does not qualify", () => {
    const troll = createPermanent({ id: "troll", card: SPOREBACK, controller: "user", summoningSick: false });
    const s = board([troll, bear("b-p", "Plus Bear", "user", { "+1/+1": 2 }), bear("b-m", "Minus Bear", "user", { "-1/-1": 1 }), bear("b-0", "Zero Bear", "user", { "+1/+1": 0 })]);
    expect(activations(s, "troll").map((a) => a.targets?.[0]?.id)).toEqual(["b-p"]);
  });

  it("⭐ Hidden Hideout: 'you control' AND 'with a counter' both bind — an opponent's countered creature is out", () => {
    const hh = createPermanent({ id: "hh", card: HIDEOUT, controller: "user", summoningSick: false });
    const s = board([hh, bear("b-mine", "My Bear", "user", { "+1/+1": 1 }), bear("b-mine0", "My Bare Bear", "user")], [bear("b-theirs", "Their Bear", "ai", { "+1/+1": 3 })]);
    const acts = activations(s, "hh").filter((a) => a.targets?.length);
    expect(acts.map((a) => a.targets[0].id)).toEqual(["b-mine"]);
  });
});
