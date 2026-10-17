/**
 * nextTypedSpellUncounterable.test.js — the TYPED "next spell can't be countered" shields (Veyran Cantrips shelf, 2026-10-17).
 *
 *   Overmaster: "The next instant or sorcery spell you cast this turn can't be countered. / Draw a card."
 *   Insist:     "The next creature spell you cast this turn can't be countered. / Draw a card."
 *
 * THE SEAM: the untyped shield (Mistrise Village, nextSpellUncounterable.test.js) is a per-player, per-turn flag consumed
 * by the very next cast at the cast chokepoint. A TYPED shield is a separate effect that waits for the next spell OF ITS
 * TYPE: a creature cast first leaves Overmaster's shield armed, and the next instant or sorcery takes it. The shields are
 * kept as a list of filters on the player (`nextTypedSpellUncounterable`); a cast consumes every armed filter it matches
 * and its stack object is stamped `uncounterable` — the mark the counter-target enumeration skips (CR 701.6a: a spell that
 * can't be countered stays on the stack). Arming the same type twice is one shield: both effects name the same next spell.
 * The list clears for every seat at untap with the other per-turn spell counters ("this turn").
 *
 * Real oracle fixtures (bundled Scryfall snapshot, generated in-session 2026-10-17 — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, resetSpellsCastAllPlayers } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram } from "./effects/parser.js";
import { nextSpellUncounterableClauseParser } from "./effects/atoms/stack.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OVERMASTER = {"name":"Overmaster","type":"Sorcery","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"The next instant or sorcery spell you cast this turn can't be countered.\nDraw a card."};
const INSIST = {"name":"Insist","type":"Sorcery","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"The next creature spell you cast this turn can't be countered.\nDraw a card."};
const THINK_TWICE = {"name":"Think Twice","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":["Flashback"],"colors":["U"],"oracle":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"power":"2","toughness":"2","oracle":""};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

const library = (n) => Array.from({ length: n }, (_, i) => ({ ...ISLAND, id: `lib-${i}` }));

function board(hand) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, library: library(10), manaPool: { W: 0, U: 10, B: 0, R: 10, G: 10, C: 0 } } },
  };
}
const cast = (s, cardId) => {
  const act = legalActionsForPlayer({ ...s, priorityHolder: "user", consecutivePasses: 0 }, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  if (!act) throw new Error(`no cast action for ${cardId}`);
  return dispatchAction({ ...s, priorityHolder: "user", consecutivePasses: 0 }, act);
};
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 10) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const top = (s) => s.stack[s.stack.length - 1];
const counterable = (s, id) => enumerateTargets(s, "ai1", { targetType: "spell", spellFilter: "any" }).some((t) => t.type === "spell" && t.id === id);

describe("the parser", () => {
  it("reads the two typed sentences as the flag atom with its filter; the untyped one is unchanged", () => {
    expect(nextSpellUncounterableClauseParser("The next instant or sorcery spell you cast this turn can't be countered.")).toEqual({ op: "next-spell-uncounterable", spellFilter: "instantSorcery" });
    expect(nextSpellUncounterableClauseParser("The next creature spell you cast this turn can't be countered.")).toEqual({ op: "next-spell-uncounterable", spellFilter: "creature" });
    expect(nextSpellUncounterableClauseParser("The next spell you cast this turn can't be countered.")).toEqual({ op: "next-spell-uncounterable" });
  });
  it("⛔ another type stays unread", () => {
    expect(nextSpellUncounterableClauseParser("The next artifact spell you cast this turn can't be countered.")).toBeNull();
    expect(nextSpellUncounterableClauseParser("The next noncreature spell you cast this turn can't be countered.")).toBeNull();
  });
  it("Overmaster: the shield, then the draw; native-spell. Insist the same with the creature shield", () => {
    expect(parseEffectProgram(OVERMASTER).atoms).toEqual([{ op: "next-spell-uncounterable", spellFilter: "instantSorcery" }, { op: "draw", amount: 1, targetType: null }]);
    expect(classifyCard(OVERMASTER)).toBe("native-spell");
    expect(parseEffectProgram(INSIST).atoms).toEqual([{ op: "next-spell-uncounterable", spellFilter: "creature" }, { op: "draw", amount: 1, targetType: null }]);
    expect(classifyCard(INSIST)).toBe("native-spell");
  });
});

describe("runtime — Overmaster", () => {
  it("⭐ resolving it draws a card and arms the instant-or-sorcery shield; the next instant is uncounterable, the one after is not", () => {
    let s = settle(cast(board([{ ...OVERMASTER, id: "om" }, { ...THINK_TWICE, id: "tt1" }, { ...THINK_TWICE, id: "tt2" }]), "om"));
    expect(s.players.user.hand.filter((c) => c.name === "Island")).toHaveLength(1); // "Draw a card."
    expect(s.players.user.nextTypedSpellUncounterable).toEqual(["instantSorcery"]);

    const c1 = cast(s, "tt1");
    expect(top(c1).uncounterable).toBe(true);
    expect(counterable(c1, top(c1).id)).toBe(false);
    expect(c1.players.user.nextTypedSpellUncounterable).toEqual([]);

    const c2 = cast(settle(c1), "tt2");
    expect(top(c2).uncounterable).toBeFalsy();
    expect(counterable(c2, top(c2).id)).toBe(true);
  });

  it("⭐ a creature cast first does NOT take Overmaster's shield; the sorcery after it does", () => {
    let s = settle(cast(board([{ ...OVERMASTER, id: "om" }, { ...GRIZZLY_BEARS, id: "bears" }, { ...DIVINATION, id: "div" }]), "om"));
    const cBears = cast(s, "bears");
    expect(top(cBears).uncounterable).toBeFalsy();
    expect(cBears.players.user.nextTypedSpellUncounterable).toEqual(["instantSorcery"]);
    const cDiv = cast(settle(cBears), "div");
    expect(top(cDiv).uncounterable).toBe(true);
    expect(cDiv.players.user.nextTypedSpellUncounterable).toEqual([]);
  });

  it("control: without Overmaster an instant is a normal counter target", () => {
    const c = cast(board([{ ...THINK_TWICE, id: "tt1" }]), "tt1");
    expect(top(c).uncounterable).toBeFalsy();
    expect(counterable(c, top(c).id)).toBe(true);
  });
});

describe("runtime — Insist", () => {
  it("⭐ an instant cast first leaves Insist's shield armed; the creature after it is uncounterable", () => {
    let s = settle(cast(board([{ ...INSIST, id: "in" }, { ...THINK_TWICE, id: "tt1" }, { ...GRIZZLY_BEARS, id: "bears" }]), "in"));
    expect(s.players.user.nextTypedSpellUncounterable).toEqual(["creature"]);
    const cTT = cast(s, "tt1");
    expect(top(cTT).uncounterable).toBeFalsy();
    const cBears = cast(settle(cTT), "bears");
    expect(top(cBears).uncounterable).toBe(true);
    expect(cBears.players.user.nextTypedSpellUncounterable).toEqual([]);
  });

  it("⛔ the shields do not survive the turn: the untap reset clears them for every seat", () => {
    const s = board([]);
    const armed = { ...s, players: { ...s.players, user: { ...s.players.user, nextTypedSpellUncounterable: ["creature", "instantSorcery"] } } };
    expect(resetSpellsCastAllPlayers(armed).players.user.nextTypedSpellUncounterable).toEqual([]);
  });
});
