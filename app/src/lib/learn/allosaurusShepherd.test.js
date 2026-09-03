/**
 * allosaurusShepherd.test.js — SG-14 (2026-09-03): Allosaurus Shepherd — "This spell can't be countered.
 * Green spells you control can't be countered. {4}{G}{G}: Until end of turn, each Elf creature you control has
 * base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types." (the Squirrel Girl
 * deck). Two lanes: the COLOUR axis of the "…spells you control can't be countered" static family (enforced
 * where counter targets are enumerated), and a subtype-filtered literal base-P/T set with a same-turn added
 * subtype on the existing team-set atom.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, createStackObject, creaturePower, creatureToughness, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentTypes } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { setBasePtTeamClauseParser } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SHEPHERD = { id: "c-shep", name: "Allosaurus Shepherd", type: "Creature — Elf Shaman", mana: "{G}", mana_cost: "{G}", power: 1, toughness: 1, keywords: [], oracle: "This spell can't be countered.\nGreen spells you control can't be countered.\n{4}{G}{G}: Until end of turn, each Elf creature you control has base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types." };
const GREEN_SPELL = { id: "c-green", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const RED_SPELL = { id: "c-red", name: "Goblin Piker", type: "Creature — Goblin", mana: "{1}{R}", mana_cost: "{1}{R}", power: 2, toughness: 1, oracle: "" };
const COUNTERSPELL = { id: "h-cs", name: "Counterspell", type: "Instant", mana: "{U}{U}", mana_cost: "{U}{U}", oracle: "Counter target spell." };
const ELF = { id: "c-elf", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1, oracle: "" };
const BEAR = { id: "c-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

describe("the parses", () => {
  it("the colour-scoped static marker", () => {
    expect(parseStaticAbilities(SHEPHERD).some((d) => d.cantBeCountered?.scope === "youControl" && d.cantBeCountered?.color === "G")).toBe(true);
  });

  it("the Elf team set with the Dinosaur add (the printed 'other creature types' tail and the bare one); a non-subtype filter word parks", () => {
    expect(setBasePtTeamClauseParser("until end of turn, each elf creature you control has base power and toughness 5/5 and becomes a dinosaur in addition to its other creature types", {})).toEqual({ op: "set-base-pt-team", scope: "youControl", subtype: "Elf", power: 5, toughness: 5, addSubtype: "Dinosaur" });
    expect(setBasePtTeamClauseParser("until end of turn, each elf creature you control has base power and toughness 5/5 and becomes a dinosaur in addition to its other types", {})).toEqual({ op: "set-base-pt-team", scope: "youControl", subtype: "Elf", power: 5, toughness: 5, addSubtype: "Dinosaur" });
    expect(setBasePtTeamClauseParser("until end of turn, each nonland creature you control has base power and toughness 5/5 and becomes a dinosaur in addition to its other types", {})).toBeNull();
  });
});

function counterBoard({ shepherd, spell }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const stk = createStackObject({ id: "stk-spell", kind: "spell", source: spell, controller: "user", targets: [], payload: {} });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "ai", turn: 5, consecutivePasses: 0,
    stack: [stk],
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: shepherd ? [createPermanent({ id: "shep", card: SHEPHERD, controller: "user", summoningSick: false })] : [] },
      ai: { ...s0.players.ai, hand: [COUNTERSPELL], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } },
    },
  };
}
const counterOffers = (s) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === "h-cs");

describe("runtime — green spells can't be countered", () => {
  it("⭐ with the Shepherd out, the user's GREEN spell is not a legal Counterspell target; a RED one still is", () => {
    expect(counterOffers(counterBoard({ shepherd: true, spell: GREEN_SPELL }))).toHaveLength(0);
    expect(counterOffers(counterBoard({ shepherd: true, spell: RED_SPELL })).length).toBeGreaterThan(0);
  });

  it("without the Shepherd the green spell is counterable as before", () => {
    expect(counterOffers(counterBoard({ shepherd: false, spell: GREEN_SPELL })).length).toBeGreaterThan(0);
  });
});

describe("runtime — the Elf pump", () => {
  it("⭐ the Elf becomes a 5/5 Dinosaur Elf until end of turn; the Bear is untouched", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "shep", card: SHEPHERD, controller: "user", summoningSick: false }), createPermanent({ id: "elf", card: ELF, controller: "user", summoningSick: false }), createPermanent({ id: "bear", card: BEAR, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 6, C: 0 } },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "shep");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    const elf = out.players.user.battlefield.find((p) => p.id === "elf");
    const bear = out.players.user.battlefield.find((p) => p.id === "bear");
    expect([creaturePower(elf, out), creatureToughness(elf, out)]).toEqual([5, 5]);
    expect([...permanentTypes(out, "elf").subtypes].map((x) => String(x).toLowerCase())).toEqual(expect.arrayContaining(["elf", "dinosaur"]));
    expect([creaturePower(bear, out), creatureToughness(bear, out)]).toEqual([2, 2]);
    expect([...permanentTypes(out, "bear").subtypes].map((x) => String(x).toLowerCase())).not.toContain("dinosaur");
    // The Shepherd is an Elf too — it pumps itself.
    const shep = out.players.user.battlefield.find((p) => p.id === "shep");
    expect(creaturePower(shep, out)).toBe(5);
  });
});

describe("classification", () => {
  it("Allosaurus Shepherd is native; a rider on the colour static parks", () => {
    expect(classifyCard(SHEPHERD)).toMatch(/^native/);
    expect(classifyCard({ ...SHEPHERD, oracle: SHEPHERD.oracle.replace("Green spells you control can't be countered.", "Green spells you control can't be countered during your turn.") })).not.toMatch(/^native/);
  });
});
