/**
 * cantBlockSource.test.js — ④-BA (2026-09-04 night): "{R}: Target creature can't block THIS CREATURE this turn" (Spin Engine,
 * Screeching Griffin, Duct Crawler, Kozilek's Pathfinder; Fearsome Temper's granted copy). A PAIRWISE block restriction:
 * a layer-6 endOfTurn keyword grant keyed to the source's id (`cantBlockSource:<id>`), read by canBlockAttacker against the
 * attacker being blocked — the target keeps every other block. Source-scoped by construction: without ctx.sourceId the
 * resolver grants nothing. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { applyCantBlockSource } from "./effects/atoms/combat.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPIN = { id: "c-se", name: "Spin Engine", type: "Artifact Creature — Construct", mana: "{3}", cmc: 3, power: 3, toughness: 1, keywords: [], oracle: "{R}: Target creature can't block this creature this turn." };
const GRIFFIN = { id: "c-sg", name: "Screeching Griffin", type: "Creature — Griffin", mana: "{3}{W}", cmc: 4, power: 2, toughness: 2, keywords: ["Flying"], oracle: "Flying\n{R}: Target creature can't block this creature this turn." };
const CRAWLER = { id: "c-dc", name: "Duct Crawler", type: "Creature — Insect", mana: "{R}", cmc: 1, power: 1, toughness: 1, keywords: [], oracle: "{1}{R}: Target creature can't block this creature this turn." };
const PATHFINDER = { id: "c-kp", name: "Kozilek's Pathfinder", type: "Creature — Eldrazi", mana: "{6}", cmc: 6, power: 6, toughness: 5, keywords: [], oracle: "{C}: Target creature can't block this creature this turn. ({C} represents colorless mana.)" };
const TEMPER = { id: "c-ft", name: "Fearsome Temper", type: "Enchantment — Aura", mana: "{2}{R}", cmc: 3, keywords: [], oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has \"{2}{R}: Target creature can't block this creature this turn.\"" };
const HATCHLING = { id: "c-sh", name: "Shrewd Hatchling", type: "Creature — Elemental", mana: "{3}{U/R}", cmc: 4, power: 6, toughness: 6, keywords: [], oracle: "This creature enters with four -1/-1 counters on it.\n{U/R}: Target creature can't block this creature this turn.\nWhenever you cast a blue spell, remove a -1/-1 counter from this creature.\nWhenever you cast a red spell, remove a -1/-1 counter from this creature." };

const bear = (id, controller) => ({ ...createPermanent({ id, card: { id: `card-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller }), summoningSick: false });

describe("the parse and the classifier", () => {
  it("⭐ 'target creature can't block this creature this turn' → the pairwise atom, enemy-facing; the blanket form keeps its own op", () => {
    expect(parseEffectClause("target creature can't block this creature this turn", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "cant-block-source", targetType: "creature" }]);
    expect(parseEffectClause("target creature can't block this turn", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "cant-block", targetType: "creature" }]);
    expect(atomTargetIntent({ op: "cant-block-source", targetType: "creature" })).toBe("enemy");
  });
  it("the tiers", () => {
    for (const c of [SPIN, GRIFFIN, CRAWLER, PATHFINDER]) expect(classifyCard(c), c.name).toBe("native-activated");
    expect(classifyCard(TEMPER)).toBe("native-aura");
    expect(classifyCard(HATCHLING)).toBe("body-only"); // the -1/-1 counter entry + the colour-cast watchers still park
  });
});

describe("runtime", () => {
  function activated() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [], battlefield: [{ ...createPermanent({ id: "spin", card: SPIN, controller: "user" }), summoningSick: false }, bear("mine", "user")], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } },
        ai: { ...s0.players.ai, hand: [], battlefield: [bear("blk", "ai")] } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "spin" && (a.targets || []).some((t) => t.id === "blk"));
    expect(act).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, act));
  }
  const combat = (s) => ({ ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "spin", defender: "ai" }, { permanentId: "mine", defender: "ai" }], blockers: [] } });
  it("⭐ the targeted bear may not block Spin Engine but may still block the other attacker; the restriction is a pair, not a blanket", () => {
    const s = combat(activated());
    expect(permanentHasKeyword(s, "blk", "cantBlockSource:spin")).toBe(true);
    expect(permanentHasKeyword(s, "blk", "cantBlock")).toBe(false);
    expect(canBlockAttacker(s, "blk", "spin", "ai")).toBe(false);
    expect(canBlockAttacker(s, "blk", "mine", "ai")).toBe(true);
  });
  it("'this turn': the grant is gone after this turn's cleanup", () => {
    const s = activated();
    const later = expireContinuousEffects({ ...s, activePlayer: "user" }, { atCleanupOfTurn: 6 });
    expect(permanentHasKeyword(later, "blk", "cantBlockSource:spin")).toBe(false);
    expect(canBlockAttacker(combat(later), "blk", "spin", "ai")).toBe(true);
  });
  it("CREED — without a source in context the resolver grants nothing (a spell could never over-restrict)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 6, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [bear("blk", "ai")] } } };
    const out = applyCantBlockSource(s, { op: "cant-block-source", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "blk" }] });
    expect(out).toBe(s);
  });
});
