/**
 * RUNIC ARMASAUR (EDHREC #2461) — "Whenever an opponent activates an ability of a creature or land that isn't a mana ability, you
 * may draw a card."
 *
 * The ability-activated event the engine already fires (checkAbilityActivatedTriggers — the activated-ability and loyalty push sites,
 * CAP-BRACERS), read for an OPPONENT of the watcher's controller. Mana abilities never use the stack (CR 605.3b) and never reach the
 * push sites. "A creature or land" is a permanent on the battlefield (CR 109.2) with that card type as it is when the ability is
 * activated — the types it has then (CR 613.1d): an animated land is a creature, a God below its devotion is not one. A permanent
 * that leaves as its own cost is paid (Mogg Fanatic) is read as it was before the cost (CR 602.2b — the ability is announced and its
 * costs paid as one activation).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const RUNIC_ARMASAUR = {"name":"Runic Armasaur","type":"Creature — Dinosaur","mana":"{1}{G}{G}","cmc":3,"power":"2","toughness":"5","keywords":[],"colors":["G"],"oracle":"Whenever an opponent activates an ability of a creature or land that isn't a mana ability, you may draw a card."};
const HARSH_MENTOR = {"name":"Harsh Mentor","type":"Creature — Human Cleric","mana":"{1}{R}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"Whenever an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability, this creature deals 2 damage to that player."};
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
const MOGG_FANATIC = {"name":"Mogg Fanatic","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"Sacrifice this creature: It deals 1 damage to any target."};
const ROGUES_PASSAGE = {"name":"Rogue's Passage","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn."};
const PURPHOROS = {"name":"Purphoros, God of the Forge","type":"Legendary Enchantment Creature — God","mana":"{3}{R}","cmc":4,"power":"6","toughness":"5","keywords":["Indestructible"],"colors":["R"],"oracle":"Indestructible\nAs long as your devotion to red is less than five, Purphoros isn't a creature.\nWhenever another creature you control enters, Purphoros deals 2 damage to each opponent.\n{2}{R}: Creatures you control get +1/+0 until end of turn."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `L-${pid}-${i}` }));
/** ai1's precombat main: ai1 activates; ai2 holds the Armasaur (an AI seat takes its "may"). */
function pod({ ai1 = [], ai2 = [P("rune", RUNIC_ARMASAUR, "ai2")], pool = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s0.players[pid], battlefield, hand: [], library: lib(pid), ...extra });
  return { ...s0, turn: 6, activePlayer: "ai1", priorityHolder: "ai1", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players, user: seat("user", [P("ubear", GRIZZLY_BEARS, "user")]),
      ai1: seat("ai1", ai1, { manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }), ai2: seat("ai2", ai2), ai3: seat("ai3", []) } };
}
/** Resolve the stack, taking every "you may" (the Armasaur's draw) — the AI seat's default. */
function settle(state) {
  let s = flushTriggers(state);
  for (let i = 0; i < 8 && (s.stack.length || s.pendingChoice); i++) {
    s = s.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(s, true) : flushTriggers(resolveTopOfStack(s));
  }
  return s;
}
/** ai1 activates `permanentId`'s ability (the first offer, or the one aimed at `targetId`); every trigger and the ability resolve. */
function activate(s0, permanentId, targetId = null) {
  const a = legalActionsForPlayer(s0, "ai1").find((x) => x.kind === "activate-ability" && x.permanentId === permanentId && (!targetId || x.targets?.[0]?.id === targetId));
  expect(a, `ai1 activates ${permanentId}`).toBeTruthy();
  return settle(dispatchAction(s0, a));
}
const hand = (s, pid) => s.players[pid].hand.length;

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(RUNIC_ARMASAUR)).toBe("native-trigger");
  });
  it("⭐ the watcher: an opponent's activation, a creature or land by the types it has as it is activated", () => {
    expect(detectTriggers(RUNIC_ARMASAUR).map((t) => ({ event: t.event, whose: t.whose, filter: t.activatedTypesNow, optional: t.optional, effect: t.effectClause })))
      .toEqual([{ event: "abilityActivated", whose: "opponent", filter: ["creature", "land"], optional: true, effect: "you may draw a card" }]);
  });
  it("CONTROL — Harsh Mentor stays parked: its damage to the activating player has no referent the engine reads", () => {
    expect(classifyCard(HARSH_MENTOR)).toBe("body-only");
  });
});

describe("the game", () => {
  it("⭐ an opponent's creature ability (Prodigal Pyromancer): the Armasaur's controller draws", () => {
    const s0 = pod({ ai1: [P("pyro", PRODIGAL_PYROMANCER, "ai1")] });
    const s = activate(s0, "pyro", "ubear");
    expect({ ai2Drew: hand(s, "ai2") - hand(s0, "ai2"), bearDamaged: s.players.user.battlefield.find((p) => p.id === "ubear")?.damageMarked }).toEqual({ ai2Drew: 1, bearDamaged: 1 });
  });

  it("⭐ an opponent's land ability (Rogue's Passage) triggers it; an artifact's (Mind Stone) does not", () => {
    const land = pod({ ai1: [P("passage", ROGUES_PASSAGE, "ai1"), P("abear", GRIZZLY_BEARS, "ai1")], pool: { C: 4 } });
    const art = pod({ ai1: [P("stone", MIND_STONE, "ai1")], pool: { C: 1 } });
    expect({ land: hand(activate(land, "passage"), "ai2") - hand(land, "ai2"), artifact: hand(activate(art, "stone"), "ai2") - hand(art, "ai2") }).toEqual({ land: 1, artifact: 0 });
  });

  it("⭐ the creature it was as the cost was paid: Mogg Fanatic sacrificed to its own ability still triggers it", () => {
    const s0 = pod({ ai1: [P("fanatic", MOGG_FANATIC, "ai1")] });
    expect(hand(activate(s0, "fanatic", "ubear"), "ai2") - hand(s0, "ai2")).toBe(1);
  });

  it("⭐ the types it has now: Purphoros below its devotion is no creature — its ability does not trigger it", () => {
    const s0 = pod({ ai1: [P("purph", PURPHOROS, "ai1"), P("abear", GRIZZLY_BEARS, "ai1")], pool: { R: 1, C: 2 } });
    expect(hand(activate(s0, "purph"), "ai2") - hand(s0, "ai2")).toBe(0);
  });

  it("⭐ its own controller's activation, and a mana ability, trigger nothing", () => {
    const own = pod({ ai1: [], ai2: [P("rune", RUNIC_ARMASAUR, "ai2"), P("pyro2", PRODIGAL_PYROMANCER, "ai2")] });
    const ownActivated = (() => {
      const a = legalActionsForPlayer({ ...own, activePlayer: "ai2", priorityHolder: "ai2" }, "ai2").find((x) => x.kind === "activate-ability" && x.permanentId === "pyro2");
      const s = settle(dispatchAction({ ...own, activePlayer: "ai2", priorityHolder: "ai2" }, a));
      return hand(s, "ai2") - hand(own, "ai2");
    })();
    const elves = pod({ ai1: [P("elf", LLANOWAR_ELVES, "ai1")] });
    const tap = legalActionsForPlayer(elves, "ai1").find((x) => x.kind === "tap-for-mana" && x.permanentId === "elf");
    expect(tap, "the Elves' mana ability").toBeTruthy();
    const afterTap = flushTriggers(dispatchAction(elves, tap));
    expect({ ownActivated, manaAbility: { stack: afterTap.stack.length, pending: (afterTap.pendingTriggers || []).length, drew: hand(afterTap, "ai2") - hand(elves, "ai2") } })
      .toEqual({ ownActivated: 0, manaAbility: { stack: 0, pending: 0, drew: 0 } });
  });
});
