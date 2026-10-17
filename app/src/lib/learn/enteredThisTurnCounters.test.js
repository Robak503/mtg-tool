/**
 * enteredThisTurnCounters.test.js — "Put a +1/+1 counter on each [green] creature [you control] that entered this turn."
 *
 *   Oran-Rief, the Vastwood (play-weighted #736) — "{T}: Put a +1/+1 counter on each green creature that entered this turn."
 *   Novijen, Heart of Progress                    — "{G}{U}, {T}: Put a +1/+1 counter on each creature that entered this turn."
 *   Raucous Entertainer                           — "{1}, {T}: Put a +1/+1 counter on each creature you control that entered this turn."
 *
 * The set is every creature on the battlefield that entered it this turn (the `enteredOnTurn` stamp every enter path writes),
 * under ANY player's control unless the text says "you control", narrowed by colour as the creature is now (layer-aware,
 * CR 105.2) — fixed as the ability resolves (CR 608.2h). The AI taps Oran-Rief for it only when its own creatures that would
 * get a counter outnumber its opponents'.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORAN_RIEF = { name: "Oran-Rief, the Vastwood", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "This land enters tapped.\n{T}: Add {G}.\n{T}: Put a +1/+1 counter on each green creature that entered this turn." };
const NOVIJEN = { name: "Novijen, Heart of Progress", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{G}{U}, {T}: Put a +1/+1 counter on each creature that entered this turn." };
const RAUCOUS = { name: "Raucous Entertainer", type: "Creature — Plant Bard", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "2",
  oracle: "{1}, {T}: Put a +1/+1 counter on each creature you control that entered this turn." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, colors: ["G"], keywords: [], power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "2", oracle: "" };
const PIKER = { name: "Goblin Piker", type: "Creature — Goblin Warrior", mana: "{1}{R}", cmc: 2, colors: ["R"], keywords: [], power: "2", toughness: "1", oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };

const TURN = 6;
const P = (id, c, controller, { entered = TURN - 2 } = {}) => ({ ...createPermanent({ id, controller, summoningSick: entered === TURN, card: { ...c, id: `c-${id}` } }), enteredOnTurn: entered });
function board({ mine = [], theirs = [], me = "user", active = me } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const them = me === "user" ? "ai" : "user";
  return { ...s0, turn: TURN, phase: "postcombat-main", step: "main", activePlayer: active, priorityHolder: me, consecutivePasses: 0, stack: [],
    players: { ...s0.players, [me]: { ...s0.players[me], battlefield: mine, hand: [], landsPlayedThisTurn: 1 }, [them]: { ...s0.players[them], battlefield: theirs, hand: [] } } };
}
const counters = (s, id) => (s.players.user.battlefield.concat(s.players.ai.battlefield).find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0);
const activateOn = (permId) => (a) => a.kind === "activate-ability" && a.permanentId === permId && (a.program?.atoms || []).some((x) => x.op === "add-counter");
function run(s, who, permId) {
  const act = legalActionsForPlayer(s, who).find(activateOn(permId));
  expect(act, "the counter ability is offered").toBeTruthy();
  let n = dispatchAction(s, act);
  let g = 0;
  while (n.stack?.length && g++ < 4) n = resolveTopOfStack(n);
  return n;
}

describe("classification", () => {
  it("⭐ Oran-Rief and Novijen are `land`; Raucous Entertainer is native", () => {
    expect(classifyCard(ORAN_RIEF)).toBe("land");
    expect(classifyCard(NOVIJEN)).toBe("land");
    expect(classifyCard(RAUCOUS)).toMatch(/^native-/);
  });

  it("⭐ the lines read as one untargeted counter over the entered-this-turn set", () => {
    const atomOf = (c) => parseActivatedAbilities(c).find((a) => /counter/.test(a.raw))?.program?.atoms;
    expect(atomOf(ORAN_RIEF)).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "enteredThisTurn" }, { kind: "color", color: "G" }] }]);
    expect(atomOf(NOVIJEN)).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "enteredThisTurn" }] }]);
    expect(atomOf(RAUCOUS)).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "enteredThisTurn" }, { kind: "controller", who: "you" }] }]);
  });

  it("⛔ CREED — an unread qualifier keeps the card parked", () => {
    expect(classifyCard({ ...ORAN_RIEF, oracle: ORAN_RIEF.oracle.replace("each green creature", "each green Elf creature") })).toBe("land-partial");
    expect(classifyCard({ ...ORAN_RIEF, oracle: ORAN_RIEF.oracle.replace("entered this turn.", "entered this turn. Those creatures gain trample until end of turn.") })).toBe("land-partial");
  });
});

describe("runtime", () => {
  it("⭐ Oran-Rief: every GREEN creature that entered THIS TURN gets a counter — an opponent's too; an older or a red one doesn't", () => {
    const s = board({
      mine: [P("oran", ORAN_RIEF, "user"), P("newElf", ELVES, "user", { entered: TURN }), P("oldBear", BEARS, "user"), P("newPiker", PIKER, "user", { entered: TURN })],
      theirs: [P("theirNewBear", BEARS, "ai", { entered: TURN }), P("theirOldElf", ELVES, "ai")],
    });
    const n = run(s, "user", "oran");
    const row = Object.fromEntries(["newElf", "oldBear", "newPiker", "theirNewBear", "theirOldElf"].map((id) => [id, counters(n, id)]));
    expect(row).toEqual({ newElf: 1, oldBear: 0, newPiker: 0, theirNewBear: 1, theirOldElf: 0 });
    expect(n.players.user.battlefield.find((p) => p.id === "oran").tapped).toBe(true);
  });

  it("⭐ Novijen: any colour, any controller — entered this turn only", () => {
    const s = board({
      mine: [P("nov", NOVIJEN, "user"), P("f1", FOREST, "user"), P("i1", ISLAND, "user"), P("newPiker", PIKER, "user", { entered: TURN }), P("oldBear", BEARS, "user")],
      theirs: [P("theirNewElf", ELVES, "ai", { entered: TURN })],
    });
    const n = run(s, "user", "nov");
    expect([counters(n, "newPiker"), counters(n, "oldBear"), counters(n, "theirNewElf")]).toEqual([1, 0, 1]);
  });

  it("⭐ Raucous Entertainer: only the creatures YOU control that entered this turn", () => {
    const s = board({
      mine: [P("rau", RAUCOUS, "user"), P("f1", FOREST, "user"), P("newPiker", PIKER, "user", { entered: TURN }), P("oldBear", BEARS, "user")],
      theirs: [P("theirNewElf", ELVES, "ai", { entered: TURN })],
    });
    const n = run(s, "user", "rau");
    expect([counters(n, "newPiker"), counters(n, "oldBear"), counters(n, "theirNewElf")]).toEqual([1, 0, 0]);
  });
});

describe("the AI", () => {
  const pick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));

  it("⭐ taps Oran-Rief for counters when its own new green creatures outnumber the opponents'", () => {
    const s = board({ me: "ai", mine: [P("oran", ORAN_RIEF, "ai"), P("newElf", ELVES, "ai", { entered: TURN }), P("newBear", BEARS, "ai", { entered: TURN })],
      theirs: [P("theirNewBear", BEARS, "user", { entered: TURN })] });
    const a = pick(s);
    expect(a && activateOn("oran")(a)).toBe(true);
  });

  it("⛔ holds it when nothing of its own entered this turn", () => {
    const s = board({ me: "ai", mine: [P("oran", ORAN_RIEF, "ai"), P("oldBear", BEARS, "ai")], theirs: [P("theirNewBear", BEARS, "user", { entered: TURN })] });
    const a = pick(s);
    expect(a && activateOn("oran")(a)).toBe(false);
  });

  it("⛔ holds it when the opponents would get as many counters as it would", () => {
    const s = board({ me: "ai", mine: [P("oran", ORAN_RIEF, "ai"), P("newElf", ELVES, "ai", { entered: TURN })],
      theirs: [P("theirNewBear", BEARS, "user", { entered: TURN })] });
    const a = pick(s);
    expect(a && activateOn("oran")(a)).toBe(false);
  });
});

describe("the AI waits for the set to stop growing", () => {
  it("⛔ not in its own precombat main (a creature cast later this turn would miss its counter)", () => {
    const s = { ...board({ me: "ai", mine: [P("oran", ORAN_RIEF, "ai"), P("newElf", ELVES, "ai", { entered: TURN })] }), phase: "precombat-main" };
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && activateOn("oran")(a)).toBe(false);
  });

  it("control — nor in its own combat (today the engine offers the activation on the AI's own turn only in its two main phases)", () => {
    const s = { ...board({ me: "ai", mine: [P("oran", ORAN_RIEF, "ai"), P("newElf", ELVES, "ai", { entered: TURN })] }), phase: "combat", step: "beginning-of-combat" };
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && activateOn("oran")(a)).toBe(false);
  });
});
