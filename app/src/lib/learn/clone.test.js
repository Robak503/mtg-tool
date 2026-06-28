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
import { createGameState, createPermanent, _resetIdsForTests, moveCardToZone, findPermanent } from "./gameState.js";
import { parseFadingVanishing, applyFadeVanishUpkeep } from "./fading.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { resolveCloneChoice } from "./resolvers.js";
import { isCloneCard, parseCloneSpec, parseCloneRider, cloneCandidates, cloneMvCap, autoPickCloneCandidate } from "./cloneCopy.js";

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
    expect(parseCloneSpec(CLONE)).toEqual({ optional: true, scope: "any", mvLimit: false, riders: [] });
    expect(parseCloneSpec(MIRROR)).toEqual({ optional: true, scope: "youControl", mvLimit: false, riders: [] });
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

// ── CLONE "except …" RIDERS (CR 707.9) — copy modifications the engine models end-to-end ──────────
//
// A clone with an "except …" rider flips native ONLY when EVERY rider sub-clause is a modeled atom
// (CREED: the whole copy, or body-only/Arbiter). Modeled atoms: add-subtype, grant a modeled
// keyword, set fixed P/T, conditional vanishing, and (in the head) an MV cap. Built targets:
// Mockingbird (Rograkh), Flesh Duplicate (Rograkh), Quicksilver Gargantuan (corpus). PARKED: Spark
// Double (planeswalker scope), Auton Soldier (myriad), Phantasmal Image (becomes-target trigger),
// Phyrexian Metamorph (artifact scope), Sakashima of a Thousand Faces (other-abilities), Chameleon
// (Mayhem), Sakashima's Student (Ninjutsu) — each carries an unmodeled mechanic.

// Real Oracle text (reminder text included — the parser strips it).
const MOCKINGBIRD = { id: "c-mock", name: "Mockingbird", type: "Creature — Bird Bard", mana: "{X}{U}", power: 1, toughness: 1, oracle: "Flying\nYou may have this creature enter as a copy of any creature on the battlefield with mana value less than or equal to the amount of mana spent to cast this creature, except it's a Bird in addition to its other types and it has flying." };
const FLESH_DUPLICATE = { id: "c-flesh", name: "Flesh Duplicate", type: "Creature — Shapeshifter Rebel", mana: "{U}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any creature on the battlefield, except it has vanishing 3 if that creature doesn't have vanishing. (A permanent with vanishing 3 enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)" };
const QUICKSILVER = { id: "c-quick", name: "Quicksilver Gargantuan", type: "Creature — Shapeshifter", mana: "{5}{U}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any creature on the battlefield, except it's 7/7." };

describe("rider parser (parseCloneRider) — exact modeled atoms only", () => {
  it("recognizes set-P/T, conditional vanishing, add-subtype, grant-keyword", () => {
    expect(parseCloneRider("it's 7/7")).toEqual({ kind: "setPT", power: 7, toughness: 7 });
    expect(parseCloneRider("it has vanishing 3 if that creature doesn't have vanishing")).toEqual({ kind: "grantVanishing", n: 3 });
    expect(parseCloneRider("it's a Bird in addition to its other types")).toEqual({ kind: "addType", subtype: "Bird" });
    expect(parseCloneRider("it has flying")).toEqual({ kind: "addKeyword", keywords: ["flying"] });
    expect(parseCloneRider("it has flying and vigilance")).toEqual({ kind: "addKeyword", keywords: ["flying", "vigilance"] });
  });
  it("rejects unmodeled riders → null (whole card PARKs)", () => {
    expect(parseCloneRider("it isn't legendary")).toBeNull();                         // legend-rule unmodeled
    expect(parseCloneRider("it's an artifact in addition to its other types")).toBeNull(); // card-type change
    expect(parseCloneRider("it's legendary in addition to its other types")).toBeNull();   // supertype change
    expect(parseCloneRider("it has myriad")).toBeNull();                              // unmodeled keyword
    expect(parseCloneRider("it has changeling")).toBeNull();                          // unmodeled keyword
    expect(parseCloneRider('it has "When this creature becomes the target of a spell or ability, sacrifice it"')).toBeNull();
    expect(parseCloneRider("its name is ~")).toBeNull();                              // keep-name unmodeled
  });
});

describe("classifier — riders flip ONLY when every clause is modeled", () => {
  it("Mockingbird / Flesh Duplicate / Quicksilver Gargantuan are native with the right atoms", () => {
    expect(isCloneCard(MOCKINGBIRD)).toBe(true);
    expect(parseCloneSpec(MOCKINGBIRD)).toEqual({ optional: true, scope: "any", mvLimit: true, riders: [{ kind: "addType", subtype: "Bird" }, { kind: "addKeyword", keywords: ["flying"] }] });
    expect(isCloneCard(FLESH_DUPLICATE)).toBe(true);
    expect(parseCloneSpec(FLESH_DUPLICATE)).toEqual({ optional: true, scope: "any", mvLimit: false, riders: [{ kind: "grantVanishing", n: 3 }] });
    expect(isCloneCard(QUICKSILVER)).toBe(true);
    expect(parseCloneSpec(QUICKSILVER)).toEqual({ optional: true, scope: "any", mvLimit: false, riders: [{ kind: "setPT", power: 7, toughness: 7 }] });
  });
  it("PARKs every clone carrying an unmodeled rider / scope (real Oracle text)", () => {
    // Spark Double — copies a creature OR planeswalker (pw-copy unmodeled) + loyalty rider.
    expect(isCloneCard({ name: "Spark Double", type: "Creature — Illusion", mana: "{3}{U}", oracle: "You may have this creature enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." })).toBe(false);
    // Auton Soldier — myriad (unmodeled) + artifact scope rider.
    expect(isCloneCard({ name: "Auton Soldier", type: "Artifact Creature — Alien Soldier", mana: "{4}{U}{U}", oracle: "You may have this creature enter as a copy of any creature on the battlefield, except it isn't legendary, is an artifact in addition to its other types, and has myriad." })).toBe(false);
    // Phyrexian Metamorph — copies an ARTIFACT or creature (artifact-copy scope unmodeled).
    expect(isCloneCard({ name: "Phyrexian Metamorph", type: "Artifact Creature — Phyrexian Shapeshifter", mana: "{3}{U/P}", oracle: "You may have this creature enter as a copy of any artifact or creature on the battlefield, except it's an artifact in addition to its other types." })).toBe(false);
    // Phantasmal Image — granted becomes-target sacrifice trigger (unmodeled event).
    expect(isCloneCard({ name: "Phantasmal Image", type: "Creature — Illusion", mana: "{1}{U}", oracle: 'You may have this creature enter as a copy of any creature on the battlefield, except it\'s an Illusion in addition to its other types and it has "When this creature becomes the target of a spell or ability, sacrifice it."' })).toBe(false);
    // Sakashima's Student — Ninjutsu (an unmodeled pre-copy ability, not a modeled keyword).
    expect(isCloneCard({ name: "Sakashima's Student", type: "Creature — Human Ninja", mana: "{2}{U}", oracle: "Ninjutsu {1}{U}\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types." })).toBe(false);
  });
});

describe("MV-cap head (Mockingbird) — candidates honor mana value ≤ mana spent", () => {
  it("cloneMvCap = fixed pips + X paid; cloneCandidates filters by it", () => {
    expect(cloneMvCap(MOCKINGBIRD, parseCloneSpec(MOCKINGBIRD), 0)).toBe(1); // {U} only
    expect(cloneMvCap(MOCKINGBIRD, parseCloneSpec(MOCKINGBIRD), 3)).toBe(4); // {U} + X=3
    expect(cloneMvCap({ mana: "{3}{U}" }, { mvLimit: false }, 5)).toBeNull(); // no MV limit
    const s = boardState({
      ai: [
        createPermanent({ id: "cheap", card: { ...creature("Cheap", 2, 2), mana: "{1}{U}" }, controller: "ai", summoningSick: false }),
        createPermanent({ id: "pricey", card: { ...creature("Pricey", 8, 8), mana: "{6}{U}{U}" }, controller: "ai", summoningSick: false }),
      ],
    });
    // cap=2 → only the MV-2 creature is offered; the MV-8 one is filtered out.
    expect(cloneCandidates(s, "user", "any", 2).map((c) => c.id)).toEqual(["cheap"]);
    expect(cloneCandidates(s, "user", "any", null).map((c) => c.id).sort()).toEqual(["cheap", "pricey"]);
  });

  it("end-to-end: Mockingbird cast for X=1 (cap MV 2) can copy a 2-drop, not an 8-drop", () => {
    let s = boardState({
      ai: [
        createPermanent({ id: "cheap", card: { ...creature("Watchwolf", 3, 3, { keywords: [] }), mana: "{G}{W}" }, controller: "ai", summoningSick: false }),
        createPermanent({ id: "pricey", card: { ...creature("Colossus", 9, 9), mana: "{8}{U}" }, controller: "ai", summoningSick: false }),
      ],
      hand: [MOCKINGBIRD], pool: { C: 9, U: 3, G: 1, W: 1 },
    });
    // Pick the cast action for X=1 (mana spent = X + {U} = 2 → cap MV 2).
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-mock" && a.xValue === 1);
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.pendingChoice.kind).toBe("clone-search");
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["cheap"]); // only MV-2 Watchwolf
  });
});

describe("rider resolution — the copy enters as the WHOLE modified card", () => {
  it("Mockingbird copies P/T but the rider re-grants flying and adds the Bird subtype", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Grizzly Bears", 2, 2, { type: "Creature — Bear" }), controller: "ai", summoningSick: false })],
      hand: [MOCKINGBIRD], pool: { C: 9, U: 3 },
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-mock" && a.xValue === 3);
    s = resolveTopOfStack(dispatchAction(s, cast));
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([2, 2]); // copied P/T
    expect(permanentHasKeyword(s, cl.id, "Flying")).toBe(true);                        // rider re-grants flying
    expect(cl.card.type).toMatch(/Bear/);                                              // copied type kept
    expect(cl.card.type).toMatch(/Bird/);                                              // + Bird added (CR 707.9)
    expect(cl.card.name).toBe("Grizzly Bears");
    expect(cl.printedCard.name).toBe("Mockingbird");
  });

  it("Quicksilver Gargantuan's 'it's 7/7' overrides the copied creature's P/T (CR 707.9)", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Mouse", 1, 1), controller: "ai", summoningSick: false })],
      hand: [QUICKSILVER], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-quick");
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([7, 7]); // 7/7, not 1/1
    expect(cl.card.name).toBe("Mouse");
  });

  it("Flesh Duplicate grants vanishing 3 when the copy lacks it: enters with 3 time counters, dies after 3 upkeeps", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Ox", 2, 4), controller: "ai", summoningSick: false })],
      hand: [FLESH_DUPLICATE], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-flesh");
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Ox");
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([2, 4]); // copied P/T (alive)
    expect(cl.counters.time).toBe(3);                                                 // entered with 3 time counters
    expect(parseFadingVanishing(cl.card)).toEqual({ kind: "vanishing", n: 3, counterType: "time" });
    // Three of the controller's upkeeps remove a counter each; the last removal sacrifices it (CR 702.63a).
    // boardState already has activePlayer "user", so applyFadeVanishUpkeep processes the clone's controller.
    const cid = cl.id;
    s = applyFadeVanishUpkeep(s);
    expect(findPermanent(s, cid).permanent.counters.time).toBe(2);
    s = applyFadeVanishUpkeep(s);
    expect(findPermanent(s, cid).permanent.counters.time).toBe(1);
    s = applyFadeVanishUpkeep(s);
    expect(findPermanent(s, cid)).toBeFalsy();                                        // last counter → sacrificed
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Flesh Duplicate"); // reverts to the original
  });

  it("Flesh Duplicate does NOT grant vanishing when the copied creature ALREADY has vanishing (conditional)", () => {
    const faded = creature("Shieldmage Elder", 1, 1, { oracle: "Vanishing 5", keywords: [] });
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: faded, controller: "ai", summoningSick: false, counters: { time: 5 } })],
      hand: [FLESH_DUPLICATE], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-flesh");
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    // The copy has the source's OWN vanishing 5 (copiable, CR 707.2) — the rider added nothing extra.
    expect(parseFadingVanishing(cl.card)).toEqual({ kind: "vanishing", n: 5, counterType: "time" });
    expect(cl.card.oracle).not.toMatch(/Vanishing 3/);   // the conditional did not append vanishing 3
    expect(cl.counters.time).toBe(5);                    // entered with the copied vanishing's 5
  });

  it("riders round-trip through JSON (plain data: resume.riders + the modified card)", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Bear", 2, 2), controller: "ai", summoningSick: false })],
      hand: [QUICKSILVER], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-quick");
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);   // resume.riders is plain data
    s = finalizeStackResolution(resolveCloneChoice(s, "a1"));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);   // the rider-modified card is plain data
  });
});
