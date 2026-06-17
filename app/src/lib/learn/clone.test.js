/**
 * Clone / copy (CR 707) — a permanent that "enters the battlefield as a copy of a creature".
 * The clone suspends on a resolution-time copy-choice (pendingChoice "clone-search"), then enters
 * as a snapshot of the chosen creature's copiable values (its original card stashed as
 * `printedCard`, restored on leave). Covers: the classifier (pure clones only; "except" routes
 * away), the choice candidates + scope, the copy snapshot (P/T, types, keywords, abilities),
 * ETB triggers of the copy firing, the "you may"/no-target 0/0-dies path, printedCard restore in
 * the graveyard, and the deterministic AI auto-pick.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { resolveCloneChoice } from "./resolvers.js";
import { isCloneCard, parseCloneSpec, cloneCandidates, autoPickCloneCandidate } from "./cloneCopy.js";

beforeEach(() => _resetIdsForTests());

// Real Oracle text — modern templating ("this creature enter as a copy", no "the battlefield").
const CLONE = { id: "c-clone", name: "Clone", type: "Creature — Shapeshifter", mana: "{3}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any creature on the battlefield." };
const MIRROR = { id: "c-mirror", name: "Mirror Image", type: "Creature — Shapeshifter", mana: "{1}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of a creature you control." };
const creature = (name, p, t, extra = {}) => ({ name, type: "Creature — Beast", power: p, toughness: t, oracle: "", ...extra });

function boardState({ user = [], ai = [], hand = [], pool = { C: 9, U: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

// Cast the clone, resolve it to the suspend point, and return the state holding a clone-search choice.
function castToChoice(s, cardId) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, cast));
}

describe("classifier — pure creature clones only", () => {
  it("recognizes Clone / Mirror Image and reads optional + scope; rejects 'except'/filter/non-clones", () => {
    expect(isCloneCard(CLONE)).toBe(true);
    expect(parseCloneSpec(CLONE)).toEqual({ optional: true, scope: "any" });
    expect(parseCloneSpec(MIRROR)).toEqual({ optional: true, scope: "youControl" });
    // An "except" rider (Spark Double / Vizier of Many Faces) is NOT a pure clone (real text).
    expect(isCloneCard({ name: "Spark Double", type: "Creature — Shapeshifter", oracle: "You may have this creature enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." })).toBe(false);
    // A SUBTYPE filter ("any Ally creature") is deferred — not a pure clone.
    expect(isCloneCard({ name: "Jwari Shapeshifter", type: "Creature — Shapeshifter Ally", oracle: "You may have this creature enter as a copy of any Ally creature on the battlefield." })).toBe(false);
    // A non-creature copy (Copy Enchantment) and a vanilla creature are not clones.
    expect(isCloneCard({ name: "Copy Enchantment", type: "Enchantment", oracle: "You may have this creature enter as a copy of any enchantment on the battlefield." })).toBe(false);
    expect(isCloneCard(creature("Grizzly Bears", 2, 2))).toBe(false);
  });
});

describe("copy choice — candidates honor scope", () => {
  it("any-scope offers every creature; you-control offers only the caster's", () => {
    const s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Mine", 2, 2), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs", 4, 4), controller: "ai", summoningSick: false })],
    });
    expect(cloneCandidates(s, "user", "any").map((c) => c.id).sort()).toEqual(["a1", "u1"]);
    expect(cloneCandidates(s, "user", "youControl").map((c) => c.id)).toEqual(["u1"]);
  });
});

describe("resolution — the clone enters as a copy of the chosen creature", () => {
  it("Clone copies a creature's P/T, keywords, and type, keeping its own permanent identity", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Serra Angel", 4, 4, { keywords: ["Flying", "Vigilance"], type: "Creature — Angel" }), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    s = castToChoice(s, "c-clone");
    expect(s.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["a1"]);

    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    const clones = s.players.user.battlefield;
    expect(clones).toHaveLength(1);
    const cl = clones[0];
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([4, 4]);   // copied P/T
    expect(permanentHasKeyword(s, cl.id, "Flying")).toBe(true);                          // copied keyword
    expect(cl.card.name).toBe("Serra Angel");                                            // copied name
    expect(cl.printedCard.name).toBe("Clone");                                           // original stashed
    expect(cl.summoningSick).toBe(true);                                                 // it just entered
    expect(s.players.ai.battlefield.find((p) => p.id === "a1")).toBeTruthy();            // source untouched
  });

  it("a copied creature's ETB trigger fires (the clone IS that creature as it enters)", () => {
    const handBefore = 3;
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Elvish Visionary", 1, 1, { oracle: "When Elvish Visionary enters the battlefield, draw a card." }), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [creature("Top", 1, 1), creature("Top2", 1, 1)], hand: [CLONE, creature("filler", 1, 1), creature("filler2", 1, 1)] } } };
    expect(s.players.user.hand).toHaveLength(handBefore);
    s = castToChoice(s, "c-clone");
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    // The copy's ETB "draw a card" trigger went on the stack — resolve it (the session loop does
    // this at the next priority pass). Clone entered as Elvish Visionary → hand net: -Clone +draw.
    while (s.stack.length) s = resolveTopOfStack(s);
    expect(s.players.user.hand.length).toBe(handBefore - 1 + 1);
  });

  it("declining (you may) enters a 0/0 that dies; the graveyard card is the ORIGINAL Clone", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Bear", 2, 2), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    s = castToChoice(s, "c-clone");
    s = finalizeStackResolution(resolveCloneChoice(s, null));   // decline
    expect(s.players.user.battlefield).toHaveLength(0);          // 0/0 Clone died (CR 704.5f)
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Clone"]); // reverts to printed card
  });

  it("a copy that dies reverts to the original Clone card in the graveyard (CR 707.2)", () => {
    let s = boardState({
      user: [createPermanent({ id: "u-bear", card: creature("Grizzly Bears", 2, 2), controller: "user", summoningSick: false })],
      hand: [CLONE],
    });
    s = castToChoice(s, "c-clone");
    s = finalizeStackResolution(resolveCloneChoice(s, "u-bear"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard); // the clone-copy
    expect(cl.card.name).toBe("Grizzly Bears"); // a copy on the battlefield
    // Move the clone-copy to the graveyard via the real zone move — printedCard restore runs.
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: cl.id });
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Clone");          // reverts to Clone
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Grizzly Bears"); // NOT the copy
  });

  it("no creature to copy → the clone enters as itself and dies, no choice surfaced", () => {
    let s = boardState({ hand: [CLONE] });
    s = castToChoice(s, "c-clone");
    expect(s.pendingChoice).toBeUndefined();                    // no candidates → no pause
    expect(s.players.user.battlefield).toHaveLength(0);          // entered 0/0 → died
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Clone"]);
  });
});

describe("serialization — the clone choice + copy are plain JSON (no closures)", () => {
  it("a state paused on a clone-choice and a state holding a clone-copy round-trip through JSON", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Bear", 2, 2), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    s = castToChoice(s, "c-clone");
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);           // pendingChoice + resume are plain data
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);           // card + printedCard are plain objects
  });
});

describe("AI auto-pick — the biggest creature, deterministically", () => {
  it("picks the highest power+toughness candidate", () => {
    const s = boardState({
      user: [createPermanent({ id: "small", card: creature("Small", 1, 1), controller: "user", summoningSick: false }),
             createPermanent({ id: "big", card: creature("Big", 5, 5), controller: "user", summoningSick: false })],
    });
    const pc = { candidates: cloneCandidates(s, "user", "any") };
    expect(autoPickCloneCandidate(s, pc)).toBe("big");
  });
});
