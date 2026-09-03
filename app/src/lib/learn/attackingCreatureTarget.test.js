/**
 * attackingCreatureTarget.test.js — ④-AE (2026-09-03 night): "TARGET ATTACKING / BLOCKING CREATURE gets / gains …" —
 * Run Amok, Righteousness, Balduvian Rage, Aang's Defense, Outflank, Armed Response (instants); Most Valuable Slayer,
 * Malamet Brawler, Pegasus Courser, Sparring Regimen, Nivix Barrier (triggers); Infantry Veteran, Kithkin Shielddare,
 * Serra Advocate, Harpoon Sniper, Anointer of Champions (activated) — ~75 carriers. The same subject peel ④-AC built
 * for the counter qualifier: the role word comes off the subject, the reduced clause parses on its own merits, and the
 * role rides back as the `combat` restriction creatureSatisfiesRestrictions has read since BS-1. splitClauses'
 * keep-whole guard admits the role word so "gets +3/+3 and gains trample" survives its " and ".
 *
 * ⭐ THE COMBAT WINDOW: the runtime offered activated abilities only on the acting player's own main phase — where
 * nothing is attacking or blocking — so a combat-role activation's pool was ALWAYS empty. 28 archers (D'Avenant
 * Archer "{T}: This creature deals 1 damage to target attacking or blocking creature" and kin) had been credited
 * native on exactly that hollow pool since the damage lane learned the phrase. legalChoices.actionsActivateAbility now
 * opens a combat window — in a combat step, either player holding priority may activate the COMBAT-ROLE abilities and
 * nothing else; every other activation keeps the main-phase window. Real oracle fixtures (bundled Scryfall snapshot,
 * read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RUN_AMOK = { id: "h-ra", name: "Run Amok", type: "Instant", mana: "{1}{R}", mana_cost: "{1}{R}", cmc: 2, keywords: [],
  oracle: "Target attacking creature gets +3/+3 and gains trample until end of turn." };
const RIGHTEOUSNESS = { id: "h-ri", name: "Righteousness", type: "Instant", mana: "{W}", mana_cost: "{W}", cmc: 1, keywords: [],
  oracle: "Target blocking creature gets +7/+7 until end of turn." };
const EITHER = { id: "h-ei", name: "Advocate's Blessing", type: "Instant", mana: "{W}", mana_cost: "{W}", cmc: 1, keywords: [],
  oracle: "Target attacking or blocking creature gets +2/+2 until end of turn." }; // synthetic: Serra Advocate's text as an instant
const SLAYER = { id: "c-mvs", name: "Most Valuable Slayer", type: "Creature — Human Warrior", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "Whenever you attack, target attacking creature gets +1/+0 and gains first strike until end of turn." };
const VETERAN = { id: "c-iv", name: "Infantry Veteran", type: "Creature — Human Soldier", mana: "{W}", cmc: 1, power: 1, toughness: 1, keywords: [],
  oracle: "{T}: Target attacking creature gets +1/+1 until end of turn." };
const ARCHER = { id: "c-da", name: "D'Avenant Archer", type: "Creature — Human Archer", mana: "{2}{W}", cmc: 3, power: 1, toughness: 2, keywords: [],
  oracle: "{T}: This creature deals 1 damage to target attacking or blocking creature." };
const PUMPER = { id: "c-pm", name: "Plain Pumper", type: "Creature — Human", mana: "{W}", cmc: 1, power: 1, toughness: 1, keywords: [],
  oracle: "{T}: Target creature gets +1/+1 until end of turn." }; // synthetic: a NON-combat-role activation
const INSTRUCTOR = { id: "c-ti", name: "Tributary Instructor", type: "Creature — Merfolk Shaman", mana: "{1}{U}", cmc: 2, power: 2, toughness: 1, keywords: ["Mentor"],
  oracle: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever a creature you control with a +1/+1 counter on it dies, draw a card." };

const bear = (id, name, controller) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });

/** The AI's "atk" bear attacks the user; the user's "blk" bear blocks it; idle bears sit on both sides. The user holds
 * priority in the declare-blockers step (the defender's window) with the instants in hand. */
function blockersStep(hand, userExtra = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "declare-blockers", step: "declare-blockers", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
    combat: { attackers: [{ permanentId: "atk", defender: "user" }], blockers: [{ blockerId: "blk", attackerId: "atk" }] },
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: [...userExtra, bear("blk", "Blocking Bear", "user"), bear("idle-u", "Idle Bear", "user")], manaPool: { W: 2, U: 0, B: 0, R: 2, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: [bear("atk", "Attacking Bear", "ai"), bear("idle-a", "Their Idle Bear", "ai")] } } };
}
const castTargets = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId).map((a) => a.targets?.[0]?.id).sort();
const activations = (s, sourceId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId);

describe("the parse", () => {
  it("⭐ the role word peels off the subject and rides back as the combat restriction; 'attacking or blocking' is 'either'", () => {
    expect(parseEffectClause("Target attacking creature gets +1/+1 until end of turn.", "Instant").atoms[0])
      .toMatchObject({ op: "pump", targetType: "creature", restrictions: [{ kind: "combat", value: "attacking" }] });
    expect(parseEffectClause(RIGHTEOUSNESS.oracle, "Instant").atoms[0].restrictions).toEqual([{ kind: "combat", value: "blocking" }]);
    expect(parseEffectClause(EITHER.oracle, "Instant").atoms[0].restrictions).toEqual([{ kind: "combat", value: "either" }]);
    // the pump-and-grant compound stays WHOLE through splitClauses (Run Amok) and carries both halves + the role
    expect(splitClauses(RUN_AMOK.oracle)).toHaveLength(1);
    expect(parseEffectClause(RUN_AMOK.oracle, "Instant").atoms[0]).toMatchObject({ op: "pump", grantKeywords: ["Trample"], restrictions: [{ kind: "combat", value: "attacking" }] });
  });

  it("⭐ the peel FALLS THROUGH when the reduced clause has no arm — Mentor's 'with lesser power' still parses whole", () => {
    const p = parseEffectClause("Put a +1/+1 counter on target attacking creature with lesser power.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(classifyCard(INSTRUCTOR)).toBe("native-trigger");
  });

  it("the tiers", () => {
    expect(classifyCard(RUN_AMOK)).toBe("native-spell");
    expect(classifyCard(RIGHTEOUSNESS)).toBe("native-spell");
    expect(classifyCard(SLAYER)).toBe("native-trigger");
    expect(classifyCard(VETERAN)).toBe("native-activated");
    expect(classifyCard(ARCHER)).toBe("native-activated");
  });
});

describe("runtime — instants: the pool is the combat role, nothing else", () => {
  it("⭐ Run Amok (attacking): castable in the declare-blockers step at the attacker only; resolving pumps it", () => {
    const s = blockersStep([RUN_AMOK]);
    expect(castTargets(s, "h-ra")).toEqual(["atk"]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-ra");
    const resolved = resolveTopOfStack(dispatchAction(s, act));
    expect(permanentPower(resolved, "atk")).toBe(5);
    expect(permanentPower(resolved, "blk")).toBe(2);
  });

  it("⭐ Righteousness (blocking): the blocker only; the 'either' form: the attacker AND the blocker, never the idle bears", () => {
    const s = blockersStep([RIGHTEOUSNESS, EITHER]);
    expect(castTargets(s, "h-ri")).toEqual(["blk"]);
    expect(castTargets(s, "h-ei")).toEqual(["atk", "blk"]);
  });
});

describe("runtime — the combat window for activated abilities", () => {
  it("⭐ the DEFENDER's Infantry Veteran is offered in the declare-blockers step at the attacker only; resolving pumps it", () => {
    const s = blockersStep([], [createPermanent({ id: "vet", card: VETERAN, controller: "user", summoningSick: false })]);
    const acts = activations(s, "vet");
    expect(acts.map((a) => a.targets?.[0]?.id)).toEqual(["atk"]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(permanentPower(resolved, "atk")).toBe(3);
    expect(resolved.players.user.battlefield.find((p) => p.id === "vet").tapped).toBe(true);
  });

  it("⭐ D'Avenant Archer ('either'): the attacker AND the blocker; resolving deals the damage", () => {
    const s = blockersStep([], [createPermanent({ id: "archer", card: ARCHER, controller: "user", summoningSick: false })]);
    const acts = activations(s, "archer");
    expect(acts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["atk", "blk"]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.targets?.[0]?.id === "atk")));
    expect(resolved.players.ai.battlefield.find((p) => p.id === "atk").damageMarked).toBe(1);
  });

  it("⛔ the window is for combat-role abilities ONLY — a plain pump activation still waits for its main phase; and in a main phase the Veteran has no pool", () => {
    const s = blockersStep([], [createPermanent({ id: "pm", card: PUMPER, controller: "user", summoningSick: false }), createPermanent({ id: "vet", card: VETERAN, controller: "user", summoningSick: false })]);
    expect(activations(s, "pm")).toEqual([]);
    const main = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", combat: null };
    expect(activations(main, "pm").length).toBeGreaterThan(0);
    expect(activations(main, "vet")).toEqual([]);
  });
});
