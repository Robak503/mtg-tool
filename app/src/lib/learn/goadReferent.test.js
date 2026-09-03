/**
 * goadReferent.test.js — ④-AJ (2026-09-03 night): the BOUND-PRONOUN goad — "Tap target creature an opponent controls.
 * Goad it." (Oceanus Dragon), "… can't block this turn. Goad it." (Insufferable Balladeer), "deals 1 damage to target
 * creature. Goad that creature." (Bjorna). The referent shape the "Untap it" chain established (CR 608.2): the goad atom
 * carries no target of its own and the runner hands it the nearest preceding atom's chosen target. Real oracle fixtures
 * (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { goaderControllersOf, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OCEANUS = { id: "c-od", name: "Oceanus Dragon", type: "Creature — Dragon", mana: "{4}{U}{U}", cmc: 6, power: 4, toughness: 4, keywords: ["Flying"],
  oracle: "Flying\nWhen this creature enters, tap target creature an opponent controls. Goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const BALLADEER = { id: "c-ib", name: "Insufferable Balladeer", type: "Creature — Dwarf Bard", mana: "{1}{R}", cmc: 2, power: 2, toughness: 1, keywords: [],
  oracle: "Vicious Mockery — When this creature enters, target creature an opponent controls can't block this turn. Goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const BJORNA = { id: "c-bj", name: "Bjorna, Nightfall Alchemist", type: "Legendary Creature — Human", mana: "{U}{R}", cmc: 2, power: 1, toughness: 3, keywords: ["Partner"],
  oracle: "{T}, Sacrifice an artifact: Bjorna, Nightfall Alchemist deals 1 damage to target creature. Goad that creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)\nPartner—Friends forever (You can have two commanders if both have this ability.)" };
// synthetic, named as such: Oceanus Dragon's body as an instant, so the whole chain resolves from the stack
const TAP_TAUNT = { id: "h-tg", name: "Synthetic Tap-and-Goad", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [],
  oracle: "Tap target creature an opponent controls. Goad it." };

describe("the parse", () => {
  it("⭐ 'Goad it' binds to the preceding target — one chosen target, two atoms; a bare 'goad it' with no antecedent stays LOW", () => {
    const p = parseEffectClause("Tap target creature an opponent controls. Goad it.", "Instant");
    expect(p.atoms).toEqual([
      { op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] },
      { op: "goad", bindPreviousTargets: true },
    ]);
    expect(parseEffectClause("Goad it.", "Instant")?.atoms || []).toEqual([]);
    expect(parseEffectClause("Draw a card. Goad it.", "Instant")?.atoms || []).toEqual([]);
  });

  it("the tiers — Oceanus Dragon and Bjorna flip; Insufferable Balladeer parks on its ABILITY WORD, not on goad", () => {
    expect(classifyCard(OCEANUS)).toBe("native-trigger");
    expect(classifyCard(BJORNA)).toBe("native-activated");
    // "Vicious Mockery — When this creature enters, …": the trigger detector never sees past the ability word (its
    // clause parses HIGH on its own — pinned above). An ability-word peel in triggers.js is its own slice.
    expect(classifyCard(BALLADEER)).not.toMatch(/^native/);
    expect(parseEffectClause("target creature an opponent controls can't block this turn. goad it", "Instant").atoms.map((a) => a.op)).toEqual(["cant-block", "goad"]);
  });
});

describe("runtime — the goad lands on the SAME creature the first clause chose", () => {
  it("⭐ one target offered per opponent creature; resolving taps it AND goads it, the caster as goader", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = (id, controller) => createPermanent({ id, card: { id: `card-${id}`, name: id, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
    const players = { ...g.players };
    for (const seat of ["user", "ai1", "ai2", "ai3"]) players[seat] = { ...g.players[seat], battlefield: [], life: 20 };
    players.ai1 = { ...players.ai1, battlefield: [bear("gd", "ai1")] };
    players.ai2 = { ...players.ai2, battlefield: [bear("other", "ai2")] };
    players.user = { ...players.user, hand: [TAP_TAUNT], battlefield: [bear("mine", "user")], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } };
    const s = { ...g, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 5, consecutivePasses: 0, players };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-tg");
    expect(casts.map((a) => a.targets.map((t) => t.id).join("+")).sort()).toEqual(["gd", "other"]); // ONE target each — the goad rides it, never a second pick
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.targets[0].id === "gd")));
    expect(resolved.players.ai1.battlefield.find((p) => p.id === "gd").tapped).toBe(true);
    expect(permanentHasKeyword(resolved, "gd", "goaded")).toBe(true);
    expect(permanentHasKeyword(resolved, "gd", "mustAttack")).toBe(true);
    expect([...goaderControllersOf(resolved, "gd")]).toEqual(["user"]);
    expect(permanentHasKeyword(resolved, "other", "goaded")).toBe(false);
  });
});
