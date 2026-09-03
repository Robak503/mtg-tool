/**
 * anotherKeywordTarget.test.js — ④-AF (2026-09-03 night): "ANOTHER target … creature" and "target creature WITH / WITHOUT
 * <keyword>" join the subject peel — the Pegasus cycle (Pegasus Courser "Whenever this creature attacks, another target
 * attacking creature gains flying until end of turn", Trusted Pegasus / Appa / Phyrexian Pegasus "… without flying"),
 * Herald of the Sun "put a +1/+1 counter on another target creature with flying", Forced Landing "put target creature
 * with flying on the bottom of its owner's library", Stinging Shot, Quicksand, Dauthi Cutthroat ("with shadow") — 26
 * flipped. "another" rides back as `notSource` (fails closed without a source id), the keyword as `hasKeyword` over the
 * legacy parser's curated vocabulary. "another" ALONE never fires the peel. Real oracle fixtures (bundled Scryfall
 * snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HERALD = { id: "c-hs", name: "Herald of the Sun", type: "Creature — Angel", mana: "{3}{W}", cmc: 4, power: 3, toughness: 4, keywords: ["Flying"],
  oracle: "Flying\n{3}{W}: Put a +1/+1 counter on another target creature with flying." };
const FORCED_LANDING = { id: "h-fl", name: "Forced Landing", type: "Instant", mana: "{2}{G}", mana_cost: "{2}{G}", cmc: 3, keywords: [],
  oracle: "Put target creature with flying on the bottom of its owner's library." };
const COURSER = { id: "c-pc", name: "Pegasus Courser", type: "Creature — Pegasus", mana: "{2}{W}", cmc: 3, power: 1, toughness: 2, keywords: ["Flying"],
  oracle: "Flying\nWhenever this creature attacks, another target attacking creature gains flying until end of turn." };
const TRUSTED = { id: "c-tp", name: "Trusted Pegasus", type: "Creature — Pegasus", mana: "{2}{W}", cmc: 3, power: 2, toughness: 2, keywords: ["Flying"],
  oracle: "Flying\nWhenever this creature attacks, target attacking creature without flying gains flying until end of turn." };
const QUICKSAND = { id: "c-qs", name: "Quicksand", type: "Land", mana: "", cmc: 0, keywords: [],
  oracle: "{T}: Add {C}.\n{T}, Sacrifice this land: Target attacking creature without flying gets -1/-2 until end of turn." };
const CUTTHROAT = { id: "c-dc", name: "Dauthi Cutthroat", type: "Creature — Dauthi Minion", mana: "{1}{B}", cmc: 2, power: 1, toughness: 1, keywords: ["Shadow"],
  oracle: "Shadow\n{1}{B}, {T}: Destroy target creature with shadow." };

const critter = (id, name, controller, keywords = []) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bird", mana: "{1}{W}", cmc: 2, power: 2, toughness: 2, keywords, oracle: keywords.join(", ") }, controller, summoningSick: false });

function mainPhase(hand, userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: userPerms, manaPool: { W: 3, U: 0, B: 0, R: 0, G: 3, C: 3 } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}

describe("the parse", () => {
  it("⭐ 'another' rides back as notSource, 'with / without <keyword>' as hasKeyword — stacked with the role and counter qualifiers", () => {
    expect(parseEffectClause("Another target attacking creature gains flying until end of turn.", "Creature").atoms[0])
      .toMatchObject({ op: "pump", targetType: "creature", grantKeywords: ["Flying"], restrictions: [{ kind: "notSource" }, { kind: "combat", value: "attacking" }] });
    expect(parseEffectClause("Target attacking creature without flying gains flying until end of turn.", "Creature").atoms[0].restrictions)
      .toEqual([{ kind: "combat", value: "attacking" }, { kind: "hasKeyword", keyword: "flying", negate: true }]);
    expect(parseEffectClause("Put a +1/+1 counter on another target creature with flying.", "Creature").atoms[0])
      .toMatchObject({ op: "add-counter", targetType: "creature", restrictions: [{ kind: "notSource" }, { kind: "hasKeyword", keyword: "flying", negate: false }] });
    expect(parseEffectClause("Target creature with shadow gets -1/-1 until end of turn.", "Instant").atoms[0].restrictions)
      .toEqual([{ kind: "hasKeyword", keyword: "shadow", negate: false }]);
    // ⛔ "another" ALONE does not fire the peel — the bare arm keeps its own shape (excludeSource, not notSource)
    const bare = parseEffectClause("Another target creature you control gets +1/+1 until end of turn.", "Instant").atoms[0];
    expect(bare).toMatchObject({ op: "pump", excludeSource: true });
    expect((bare.restrictions || []).some((r) => r.kind === "notSource")).toBe(false);
    // ⛔ a keyword outside the curated vocabulary is not a restriction (it would fail OPEN on "without") → parked
    expect(parseEffectClause("Target creature without ward gains flying until end of turn.", "Instant")?.atoms || []).toEqual([]);
  });

  it("the tiers", () => {
    expect(classifyCard(HERALD)).toBe("native-activated");
    expect(classifyCard(FORCED_LANDING)).toBe("native-spell");
    expect(classifyCard(COURSER)).toBe("native-trigger");
    expect(classifyCard(TRUSTED)).toBe("native-trigger");
    expect(classifyCard(CUTTHROAT)).toBe("native-activated");
    expect(classifyCard(QUICKSAND)).toBe("land");
  });
});

describe("runtime — the pool honors 'another' and the keyword", () => {
  it("⭐ Herald of the Sun: the OTHER flyer only — never itself (another), never the walker (with flying); the counter lands", () => {
    const herald = createPermanent({ id: "herald", card: HERALD, controller: "user", summoningSick: false });
    const s = mainPhase([], [herald, critter("bird", "Bird", "user", ["Flying"]), critter("walker", "Walker", "user")], [critter("their-bird", "Their Bird", "ai", ["Flying"])]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "herald");
    expect(acts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["bird", "their-bird"]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.targets?.[0]?.id === "bird")));
    expect(resolved.players.user.battlefield.find((p) => p.id === "bird").counters["+1/+1"]).toBe(1);
  });

  it("⭐ Forced Landing: only creatures with flying are offered; resolving tucks the chosen flyer to the library bottom", () => {
    const s = mainPhase([FORCED_LANDING], [critter("walker", "Walker", "user")], [critter("their-bird", "Their Bird", "ai", ["Flying"]), critter("their-walker", "Their Walker", "ai")]);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-fl");
    expect(casts.map((a) => a.targets?.[0]?.id)).toEqual(["their-bird"]);
    const resolved = resolveTopOfStack(dispatchAction(s, casts[0]));
    expect(resolved.players.ai.battlefield.map((p) => p.id)).toEqual(["their-walker"]);
    expect(resolved.players.ai.library.at(-1)?.name).toBe("Their Bird");
  });

  it("⭐ Quicksand (a LAND's combat-role sacrifice ability) is offered in the combat window at the non-flying attacker only", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const qs = createPermanent({ id: "qs", card: QUICKSAND, controller: "user", summoningSick: false });
    const s = { ...s0, turn: 6, phase: "declare-blockers", step: "declare-blockers", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
      combat: { attackers: [{ permanentId: "atk-walk", defender: "user" }, { permanentId: "atk-bird", defender: "user" }], blockers: [] },
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [qs], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
        ai: { ...s0.players.ai, battlefield: [critter("atk-walk", "Attacking Walker", "ai"), critter("atk-bird", "Attacking Bird", "ai", ["Flying"]), critter("idle", "Idle Walker", "ai")] } } };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "qs");
    expect(acts.map((a) => a.targets?.[0]?.id)).toEqual(["atk-walk"]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(resolved.players.user.battlefield.find((p) => p.id === "qs")).toBeUndefined();
    expect(resolved.players.user.graveyard.map((c) => c.name)).toContain("Quicksand");
  });
});
