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
import { isCloneCard, parseCloneSpec, parseCloneRider, cloneCandidates, cloneMvCap, autoPickCloneCandidate, snapshotCopiedCard } from "./cloneCopy.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

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
    // A clone WITH an "except" rider isn't a PURE clone (riders === []) — but it may still be a modeled clone
    // (isCloneCard true) when every rider is modeled. Spark Double now IS a modeled clone (COPY-RIDER: pw-scope
    // + conditional counter riders), so its full coverage lives in the Spark Double describe block below; here
    // we only assert the PURE-clone shape excludes a ridered card. Vizier of Many Faces (embalm) stays non-clone.
    expect(parseCloneSpec(CLONE)?.riders).toEqual([]);   // a pure clone carries no riders
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
// keyword, set fixed P/T, conditional vanishing, the conditional enters-with-counter (Spark Double),
// the isn't-legendary no-op, and (in the head) an MV cap. Built targets: Mockingbird (Rograkh), Flesh
// Duplicate (Rograkh), Quicksilver Gargantuan (corpus), Spark Double (COPY-RIDER — creature-or-pw
// scope + conditional counter). PARKED: Auton Soldier (myriad), Phantasmal Image (becomes-target
// trigger), Phyrexian Metamorph (artifact scope), Sakashima the Impostor (granted activated ability),
// Chameleon (Mayhem GY-recast), Sakashima's Student (Ninjutsu) — each carries an unmodeled mechanic.

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
  it("recognizes the conditional enters-with-counter rider + the isn't-legendary STRIP (Spark Double)", () => {
    // ⭐ UPDATED 2026-08-05: this used to read "the legend rule is unenforced, so isn't-legendary is a
    // recognized NO-OP". sba.js implements CR 704.5j now, so the no-op had become a LIVE FALSE POSITIVE —
    // the copy kept "Legendary" and the SBA destroyed one of the pair. It is a real type-line strip now
    // (see cloneNotLegendary.test.js for the drive). The rider must still be RECOGNIZED — it must
    // NOT park the whole clone (the all-or-nothing gate accepts a no-op). The two conditional counter riders
    // each gate on the copy's resulting type (resolved at resolution by resolveCloneChoice).
    expect(parseCloneRider("it isn't legendary")).toEqual({ kind: "stripLegendary" });
    expect(parseCloneRider("it's not legendary")).toEqual({ kind: "stripLegendary" });
    expect(parseCloneRider("it enters with an additional +1/+1 counter on it if it's a creature"))
      .toEqual({ kind: "entersWithCounterIf", counterType: "+1/+1", n: 1, ifType: "creature" });
    expect(parseCloneRider("it enters with an additional loyalty counter on it if it's a planeswalker"))
      .toEqual({ kind: "entersWithCounterIf", counterType: "loyalty", n: 1, ifType: "planeswalker" });
  });
  it("parses the addable-card-type rider (Phyrexian Metamorph — 'it's an artifact in addition')", () => {
    // CR 707.9a — an ADDABLE permanent card type (artifact/enchantment) is prepended to the copy's type line by
    // snapshotCopiedCard's addCardType rider, so the copy genuinely IS that card type. Mirrors the token form.
    expect(parseCloneRider("it's an artifact in addition to its other types")).toEqual({ kind: "addCardType", cardType: "Artifact" });
    expect(parseCloneRider("it's an enchantment in addition to its other types")).toEqual({ kind: "addCardType", cardType: "Enchantment" });
  });
  it("rejects unmodeled riders → null (whole card PARKs)", () => {
    expect(parseCloneRider("it's a land in addition to its other types")).toBeNull();       // un-addable card type
    expect(parseCloneRider("it's a creature in addition to its other types")).toBeNull();   // un-addable card type (P/T implications)
    expect(parseCloneRider("it's legendary in addition to its other types")).toBeNull();   // supertype change
    expect(parseCloneRider("it has myriad")).toBeNull();                              // unmodeled keyword
    expect(parseCloneRider("it has changeling")).toBeNull();                          // unmodeled keyword
    // A granted quoted ability that ISN'T the modeled becomes-target self-sac stays unmodeled (CREED).
    expect(parseCloneRider('it has "When this creature dies, draw a card"')).toBeNull();
    expect(parseCloneRider('it has "sacrifice it unless you discard a land card"')).toBeNull();
  });
  it("GRADUATED — the keep-name rider is modelled now (CR 707.9a)", () => {
    // This sat in the rejection list above as "keep-name unmodeled", correctly, while there was no way to
    // apply it. `~` is parseCloneSpec's elision of the card's OWN name, so the marker resolves against the
    // copying card in snapshotCopiedCard — see cloneRiderVocabulary.test.js for the applier assertions.
    // ⛔ It must NOT come back as a literal name: stamping the copy "~" is the failure this shape invites.
    expect(parseCloneRider("its name is ~")).toEqual({ kind: "setName", selfName: true });
    expect(parseCloneRider("its name is ~").name).toBeUndefined();
  });
  it("parses the granted becomes-target sac trigger (Phantasmal Image — CR 707.9a + 603.2)", () => {
    // 'it has "When this creature becomes the target of a spell or ability, sacrifice it."' → a grantTrigger atom
    // carrying the canonical trigger line snapshotCopiedCard appends to the copy, so detectTriggers reads it as a
    // printed instance and the becomes-target event (checkBecomesTargetTriggers) fires it on the copy.
    expect(parseCloneRider('it has "When this creature becomes the target of a spell or ability, sacrifice it."')).toEqual({
      kind: "grantTrigger", oracle: "When this creature becomes the target of a spell or ability, sacrifice it.",
    });
    expect(parseCloneRider('it has "Whenever this creature becomes the target of a spell or ability, sacrifice it"')).toEqual({
      kind: "grantTrigger", oracle: "When this creature becomes the target of a spell or ability, sacrifice it.",
    });
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
    // (Spark Double moved OUT of this list — it's now a modeled clone; see the Spark Double describe block.)
    // Auton Soldier — myriad (unmodeled) STILL parks even though the artifact card-type rider is now modeled: the
    // "and has myriad" sub-clause is an unmodeled keyword, so the all-or-nothing rider gate fails the whole card.
    expect(isCloneCard({ name: "Auton Soldier", type: "Artifact Creature — Alien Soldier", mana: "{4}{U}{U}", oracle: "You may have this creature enter as a copy of any creature on the battlefield, except it isn't legendary, is an artifact in addition to its other types, and has myriad." })).toBe(false);
    // (Phantasmal Image moved OUT of this list — its Illusion add-type + granted becomes-target sac trigger are
    // now BOTH modeled; see the Phantasmal Image describe block.)
    // Sakashima's Student — Ninjutsu (an unmodeled pre-copy ability, not a modeled keyword).
    expect(isCloneCard({ name: "Sakashima's Student", type: "Creature — Human Ninja", mana: "{2}{U}", oracle: "Ninjutsu {1}{U}\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types." })).toBe(false);
  });
});

describe("Phantasmal Image — a clone that grants the becomes-target sac trigger (CR 707.9a + 603.2)", () => {
  const IMAGE = { name: "Phantasmal Image", type: "Creature — Illusion", mana: "{1}{U}", oracle: 'You may have this creature enter as a copy of any creature on the battlefield, except it\'s an Illusion in addition to its other types and it has "When this creature becomes the target of a spell or ability, sacrifice it."' };
  it("is a modeled clone with the Illusion add-type + granted sac-trigger riders", () => {
    expect(isCloneCard(IMAGE)).toBe(true);
    expect(parseCloneSpec(IMAGE)).toEqual({
      optional: true, scope: "any", mvLimit: false,
      riders: [
        { kind: "addType", subtype: "Illusion" },
        { kind: "grantTrigger", oracle: "When this creature becomes the target of a spell or ability, sacrifice it." },
      ],
    });
  });
  it("bakes BOTH the Illusion type and the sac trigger onto the copy (snapshotCopiedCard)", () => {
    const spec = parseCloneSpec(IMAGE);
    const source = { card: { name: "Grizzly Bears", type: "Creature — Bear", type_line: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    const copy = snapshotCopiedCard(source, { id: "clone-x" }, spec.riders);
    expect(copy.type).toBe("Creature — Bear Illusion");
    expect(copy.oracle).toContain("When this creature becomes the target of a spell or ability, sacrifice it.");
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

// ── SPARK DOUBLE (COPY-RIDER) — creature-OR-planeswalker scope + the conditional enters-with-counter ────────
// CR 707.9a + 614.1c + 122.6a: copies a creature OR planeswalker YOU CONTROL, entering with an additional
// +1/+1 counter (creature copy) or loyalty counter (planeswalker copy), and isn't legendary (an unenforced
// no-op). Both copy paths resolve genuinely: a creature copy enters as the snapshot + 1 counter; a PW copy
// enters with its starting loyalty (enterPermanent's castsAsPlaneswalker write) + 1 additional loyalty.
const SPARK = { id: "c-spark", name: "Spark Double", type: "Creature — Illusion", mana: "{3}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." };
const pwCard = (name, loyalty, over = {}) => ({ name, type: `Legendary Planeswalker — ${name}`, loyalty, oracle: over.oracle || "[+1]: Draw a card.", ...over });

describe("Spark Double — classifier + scope + the conditional counter rider", () => {
  it("is a modeled clone: youControlCreatureOrPw scope + the three riders; classifies native-clone", () => {
    expect(isCloneCard(SPARK)).toBe(true);
    expect(parseCloneSpec(SPARK)).toEqual({
      optional: true,
      scope: "youControlCreatureOrPw",
      mvLimit: false,
      riders: [
        { kind: "entersWithCounterIf", counterType: "+1/+1", n: 1, ifType: "creature" },
        { kind: "entersWithCounterIf", counterType: "loyalty", n: 1, ifType: "planeswalker" },
        { kind: "stripLegendary" },
      ],
    });
  });

  it("candidates: the controller's creatures AND planeswalkers; never an opponent's", () => {
    const s = boardState({
      user: [
        createPermanent({ id: "u-cr", card: creature("Mine", 2, 2), controller: "user", summoningSick: false }),
        createPermanent({ id: "u-pw", card: pwCard("Garruk", 3), controller: "user", summoningSick: false }),
      ],
      ai: [createPermanent({ id: "a-cr", card: creature("Theirs", 4, 4), controller: "ai", summoningSick: false })],
    });
    expect(cloneCandidates(s, "user", "youControlCreatureOrPw").map((c) => c.id).sort()).toEqual(["u-cr", "u-pw"]);
  });
});

describe("Spark Double — runtime: the copy enters with its conditional counter", () => {
  it("copying a CREATURE: enters as the copy with +1 +1/+1 counter (a 2/2 source → a 3/3 copy)", () => {
    let s = boardState({
      user: [createPermanent({ id: "u-bear", card: creature("Grizzly Bears", 2, 2, { type: "Creature — Bear" }), controller: "user", summoningSick: false })],
      hand: [SPARK], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-spark");
    expect(s.pendingChoice.kind).toBe("clone-search");
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["u-bear"]);
    s = finalizeStackResolution(resolveCloneChoice(s, "u-bear"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Grizzly Bears");
    expect(cl.counters["+1/+1"]).toBe(1);                                              // the additional counter
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([3, 3]); // 2/2 base + 1 counter
    expect(cl.counters.loyalty || 0).toBe(0);                                          // a creature copy gets no loyalty
    expect(cl.printedCard.name).toBe("Spark Double");                                  // original stashed (CR 707.2)
    expect(cl.card.token).toBeFalsy();                                                 // a clone is a real permanent, not a token
  });

  it("copying a PLANESWALKER: enters with its starting loyalty PLUS 1 additional loyalty counter", () => {
    let s = boardState({
      user: [createPermanent({ id: "u-pw", card: pwCard("Garruk, Primal Hunter", 3), controller: "user", summoningSick: false })],
      hand: [SPARK], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-spark");
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["u-pw"]);
    s = finalizeStackResolution(resolveCloneChoice(s, "u-pw"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Garruk, Primal Hunter");
    expect(cl.counters.loyalty).toBe(4);             // base 3 + 1 additional (CR 306.5b + 707.9a)
    expect(cl.counters["+1/+1"] || 0).toBe(0);       // a planeswalker copy gets no +1/+1
    expect(findPermanent(s, cl.id)).toBeTruthy();    // a real PW (NOT a dying 0/0)
  });

  it("declining (you may) / no target → Spark Double enters as a 0/0 and dies (CR 704.5f)", () => {
    let s = boardState({ hand: [SPARK], pool: { C: 9, U: 3 } });
    s = castToChoice(s, "c-spark");
    // No creature/PW to copy → no choice surfaced, the 0/0 entered and died.
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.user.battlefield).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Spark Double"]);
  });

  it("state round-trips through JSON at the choice + after the copy (plain data)", () => {
    let s = boardState({
      user: [createPermanent({ id: "u-bear", card: creature("Bear", 2, 2), controller: "user", summoningSick: false })],
      hand: [SPARK], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-spark");
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s = finalizeStackResolution(resolveCloneChoice(s, "u-bear"));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

// ── WI-2 — mandatory clones cannot be declined (CR 707.9) ────────────────────────────────────────
describe("WI-2 — mandatory-ness is parsed, threaded, and ENFORCED (CR 707.9)", () => {
  // The mandatory form: "~ enters as a copy of …" with NO "you may".
  const MANDATORY = { id: "c-mand", name: "Dupe Machine", type: "Creature — Shapeshifter", mana: "{3}{U}", power: 0, toughness: 0, oracle: "This creature enters as a copy of any creature on the battlefield." };

  it("parses the mandatory form (optional:false) and the pendingChoice carries it (top-level + resume)", () => {
    expect(parseCloneSpec(MANDATORY)).toEqual({ optional: false, scope: "any", mvLimit: false, riders: [] });
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Big", 4, 4), controller: "ai", summoningSick: false })],
      hand: [MANDATORY],
    });
    s = castToChoice(s, "c-mand");
    expect(s.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user", optional: false });
    expect(s.pendingChoice.resume.optional).toBe(false);
    // An optional ("you may") clone still flags declinable — the UI keeps its decline button.
    let o = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Big", 4, 4), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    o = castToChoice(o, "c-clone");
    expect(o.pendingChoice).toMatchObject({ kind: "clone-search", optional: true });
    expect(o.pendingChoice.resume.optional).toBe(true);
  });

  it("a null submit on a mandatory clone with live candidates AUTO-PICKS instead of misplaying a 0/0", () => {
    let s = boardState({
      ai: [
        createPermanent({ id: "a1", card: creature("Small", 1, 1), controller: "ai", summoningSick: false }),
        createPermanent({ id: "a2", card: creature("Big", 4, 4), controller: "ai", summoningSick: false }),
      ],
      hand: [MANDATORY],
    });
    s = castToChoice(s, "c-mand");
    s = finalizeStackResolution(resolveCloneChoice(s, null)); // a decline/garbage submit
    const cl = s.players.user.battlefield.find((p) => p.printedCard?.name === "Dupe Machine");
    expect(cl).toBeTruthy();                         // entered AS A COPY — never a dying 0/0
    expect(cl.card.name).toBe("Big");                // the deterministic auto-pick (highest P/T)
    expect(s.players.user.graveyard).toHaveLength(0);
  });

  it("a mandatory clone with NO candidates still enters as itself and dies (CR 707.9c — nothing to copy)", () => {
    let s = boardState({ hand: [MANDATORY] });
    s = castToChoice(s, "c-mand");
    expect(s.pendingChoice).toBeUndefined();         // no candidates → no pause
    expect(s.players.user.battlefield).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Dupe Machine"]);
  });

  it("an OPTIONAL clone's null submit still declines (enters as itself and dies) — behavior preserved", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a1", card: creature("Bear", 2, 2), controller: "ai", summoningSick: false })],
      hand: [CLONE],
    });
    s = castToChoice(s, "c-clone");
    s = finalizeStackResolution(resolveCloneChoice(s, null));
    expect(s.players.user.battlefield).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Clone"]);
  });
});

// ── SAKASHIMA OF A THOUSAND FACES (COPY-RIDER: retainOwnAbilities) ────────────────────────────────
// Real Oracle (CR 707.9): "You may have Sakashima enter as a copy of another creature you control, except it
// has Sakashima's other abilities." + the legend-rule-off static + Partner. Three modeling seams this exercises:
//   1. the SHORT-name self-reference (the card is "Sakashima of a Thousand Faces" but its own text says just
//      "Sakashima" — legendary first-word elision, mirroring triggers.js);
//   2. the "another creature you control" scope (a youControl set — the clone isn't on the battlefield yet, so
//      "another" is naturally satisfied);
//   3. the retainOwnAbilities rider — the copy ALSO keeps Sakashima's own abilities (the legend-rule-off static,
//      an unenforced no-op line, and Partner, a bare keyword), appended to the copy so it reads as printed.
const SAKASHIMA = {
  id: "c-sak",
  name: "Sakashima of a Thousand Faces",
  type: "Legendary Creature — Human Rogue",
  mana: "{3}{U}",
  power: 3,
  toughness: 1,
  keywords: ["Partner"],
  oracle: "You may have Sakashima enter as a copy of another creature you control, except it has Sakashima's other abilities.\nThe \"legend rule\" doesn't apply to permanents you control.\nPartner (You can have two commanders if both have partner.)",
};

describe("Sakashima of a Thousand Faces — classifier + short-name scope + retainOwnAbilities rider", () => {
  it("flips to native-clone: youControl scope (short-name elided) + the single retainOwnAbilities rider", () => {
    expect(classifyCard(SAKASHIMA)).toBe("native-clone");
    expect(isCloneCard(SAKASHIMA)).toBe(true);
    expect(parseCloneSpec(SAKASHIMA)).toEqual({
      optional: true,
      scope: "youControl",
      mvLimit: false,
      riders: [
        {
          kind: "retainOwnAbilities",
          oracle: "The \"legend rule\" doesn't apply to permanents you control.\nPartner (You can have two commanders if both have partner.)",
          keywords: ["Partner"],
        },
      ],
    });
  });

  it("candidates honor the youControl scope — only the caster's creatures, never an opponent's", () => {
    const s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Mine", 2, 2), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs", 4, 4), controller: "ai", summoningSick: false })],
    });
    const spec = parseCloneSpec(SAKASHIMA);
    expect(cloneCandidates(s, "user", spec.scope).map((c) => c.id)).toEqual(["u1"]);
  });

  it("runtime: enters as a copy of your creature — copied P/T + keywords PLUS Sakashima's own abilities", () => {
    let s = boardState({
      user: [createPermanent({ id: "u-angel", card: creature("Serra Angel", 4, 4, { type: "Creature — Angel", keywords: ["Flying", "Vigilance"], oracle: "" }), controller: "user", summoningSick: false })],
      hand: [SAKASHIMA], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-sak");
    expect(s.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["u-angel"]); // only your creature (not itself)

    s = finalizeStackResolution(resolveCloneChoice(s, "u-angel"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Serra Angel");                                 // copied name
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([4, 4]); // copied P/T
    expect(permanentHasKeyword(s, cl.id, "Flying")).toBe(true);              // copied keyword
    expect(permanentHasKeyword(s, cl.id, "Partner")).toBe(true);            // Sakashima's own keyword retained
    expect(cl.card.oracle).toContain("legend rule");                         // Sakashima's own static retained
    expect(cl.printedCard.name).toBe("Sakashima of a Thousand Faces");       // original stashed (CR 707.2)
    expect(cl.card.token).toBeFalsy();                                       // a real permanent, not a token
    expect(cl.card.isCommander).toBeFalsy();                                 // a copy is never a commander (CR 903.3)
  });

  it("the copied creature's ETB trigger still fires (retained own abilities don't clobber the copy's oracle)", () => {
    const copy = snapshotCopiedCard(
      { card: { name: "Elvish Visionary", type: "Creature — Elf", power: 1, toughness: 1, oracle: "When Elvish Visionary enters, draw a card." } },
      SAKASHIMA,
      parseCloneSpec(SAKASHIMA).riders,
    );
    // The copy's oracle carries BOTH the source ETB trigger AND Sakashima's own inert abilities.
    expect(detectTriggers(copy).map((t) => t.effectClause)).toEqual(["draw a card"]);
    expect(copy.oracle).toContain("Partner");
  });

  // CREED near-miss — an UNMODELED own ability on the tail must PARK the whole card (never a partial copy).
  it("PARKS a Sakashima-shaped clone whose retained tail carries an UNMODELED ability (false-positive guard)", () => {
    const FAKE = {
      ...SAKASHIMA,
      name: "Fakashima the Trickster",
      // A retained-ability tail with a real, unmodeled ETB draw ability — the retained set would be a PARTIAL
      // if we flipped it, so the whole card must PARK (CREED: whole copy or nothing).
      oracle: "You may have Fakashima enter as a copy of another creature you control, except it has Fakashima's other abilities.\nWhen Fakashima enters, draw two cards.\nPartner",
    };
    expect(parseCloneSpec(FAKE)).toBeNull();
    expect(isCloneCard(FAKE)).toBe(false);
    expect(classifyCard(FAKE)).not.toBe("native-clone");
  });
});

// ── PHYREXIAN METAMORPH (COPY-RIDER) — copies an ARTIFACT *or* creature + adds the artifact card type ─────────
// CR 707.9a + 712.4a: "You may have this creature enter as a copy of any artifact or creature on the
// battlefield, except it's an artifact in addition to its other types." Widens the copy scope to include a
// NON-creature artifact (a copied non-creature artifact enters as an artifact — no lethal SBA, doesn't die like
// a 0/0), and the addCardType rider prepends "Artifact" so the copy genuinely IS an artifact for every
// type-line read. {U/P} Phyrexian mana in the cost is already handled by the caster.
const METAMORPH = {
  id: "c-meta",
  name: "Phyrexian Metamorph",
  type: "Artifact Creature — Phyrexian Shapeshifter",
  mana: "{3}{U/P}",
  power: 0,
  toughness: 0,
  oracle: "({U/P} can be paid with either {U} or 2 life.)\nYou may have this creature enter as a copy of any artifact or creature on the battlefield, except it's an artifact in addition to its other types.",
};
// A non-creature artifact with a mana ability (a real copiable-value source — its whole card copies, so the
// ability resolves through the same runtime as the printed Sol Ring, CR 707.2).
const solRing = () => ({ name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}.", keywords: [] });

describe("Phyrexian Metamorph — classifier + artifact-or-creature scope + the addCardType rider", () => {
  it("flips to native-clone: anyArtifactOrCreature scope + the single addCardType(Artifact) rider", () => {
    expect(classifyCard(METAMORPH)).toBe("native-clone");
    expect(isCloneCard(METAMORPH)).toBe(true);
    expect(parseCloneSpec(METAMORPH)).toEqual({
      optional: true,
      scope: "anyArtifactOrCreature",
      mvLimit: false,
      riders: [{ kind: "addCardType", cardType: "Artifact" }],
    });
  });

  it("candidates under anyArtifactOrCreature offer artifacts AND creatures on ANY battlefield; an artifact-creature is offered once", () => {
    const s = boardState({
      user: [createPermanent({ id: "u-sol", card: solRing(), controller: "user", summoningSick: false })],
      ai: [
        createPermanent({ id: "a-bear", card: creature("Bear", 2, 2), controller: "ai", summoningSick: false }),
        createPermanent({ id: "a-golem", card: { name: "Golem", type: "Artifact Creature — Golem", power: 3, toughness: 3 }, controller: "ai", summoningSick: false }),
        createPermanent({ id: "a-ench", card: { name: "Aura", type: "Enchantment" }, controller: "ai", summoningSick: false }),
      ],
    });
    const spec = parseCloneSpec(METAMORPH);
    // Sol Ring (artifact, yours), Bear (creature), Golem (artifact-creature, offered ONCE) — but NOT the enchantment.
    expect(cloneCandidates(s, "user", spec.scope).map((c) => c.id).sort()).toEqual(["a-bear", "a-golem", "u-sol"]);
  });

  it("runtime: copies a NON-creature artifact (Sol Ring) — enters as an artifact, keeps its mana ability, and does NOT die", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a-sol", card: solRing(), controller: "ai", summoningSick: false })],
      hand: [METAMORPH], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-meta");
    expect(s.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["a-sol"]); // the opponent's artifact is a legal copy target

    s = finalizeStackResolution(resolveCloneChoice(s, "a-sol"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl).toBeTruthy();                                          // it survived (a non-creature artifact is NOT a 0/0)
    expect(cl.card.name).toBe("Sol Ring");                           // copied name
    expect(cl.card.type).toMatch(/Artifact/);                        // it's an artifact
    expect(cl.card.type).not.toMatch(/Creature/);                    // a copy of a NON-creature artifact is not a creature
    expect(cl.card.oracle).toContain("{T}: Add {C}{C}.");            // copied mana ability (resolves via the same runtime)
    expect(cl.printedCard.name).toBe("Phyrexian Metamorph");         // original stashed (CR 707.2)
    expect(cl.card.token).toBeFalsy();                               // a real permanent, not a token
  });

  it("the addCardType rider PREPENDS Artifact to a copied CREATURE's type line (it's a creature AND an artifact)", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a-bear", card: creature("Grizzly Bears", 2, 2, { type: "Creature — Bear" }), controller: "ai", summoningSick: false })],
      hand: [METAMORPH], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-meta");
    s = finalizeStackResolution(resolveCloneChoice(s, "a-bear"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Grizzly Bears");
    expect([permanentPower(s, cl.id), permanentToughness(s, cl.id)]).toEqual([2, 2]); // copied P/T
    expect(cl.card.type).toMatch(/Artifact Creature — Bear/);        // Artifact prepended to the LEFT of the "—" (CR 707.9a)
    expect(cl.summoningSick).toBe(true);                             // an artifact-creature copy is still summoning-sick
  });

  it("copies an ARTIFACT-CREATURE and keeps its own abilities (whole-card snapshot)", () => {
    const goDown = createPermanent({
      id: "a-servo",
      card: { name: "Ornithopter", type: "Artifact Creature — Thopter", power: 0, toughness: 2, keywords: ["Flying"], oracle: "" },
      controller: "ai", summoningSick: false,
    });
    let s = boardState({ ai: [goDown], hand: [METAMORPH], pool: { C: 9, U: 3 } });
    s = castToChoice(s, "c-meta");
    s = finalizeStackResolution(resolveCloneChoice(s, "a-servo"));
    const cl = s.players.user.battlefield.find((p) => p.printedCard);
    expect(cl.card.name).toBe("Ornithopter");
    expect(permanentHasKeyword(s, cl.id, "Flying")).toBe(true);      // copied keyword
    expect(cl.card.type).toMatch(/Artifact Creature — Thopter/);     // already an artifact; the rider is idempotent
  });

  it("round-trips through JSON (resume carries plain scope/riders; the copy is plain data)", () => {
    let s = boardState({
      ai: [createPermanent({ id: "a-sol", card: solRing(), controller: "ai", summoningSick: false })],
      hand: [METAMORPH], pool: { C: 9, U: 3 },
    });
    s = castToChoice(s, "c-meta");
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);               // resume.scope + resume.riders are plain data
    expect(s.pendingChoice.resume.scope).toBe("anyArtifactOrCreature");
    s = finalizeStackResolution(resolveCloneChoice(s, "a-sol"));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);               // the rider-modified copy is plain data
  });

  // CREED near-miss #1 — a creature-only clone (Clone) must NEVER offer a non-creature artifact as a copy target.
  it("CREED: a creature-only scope ('any') does NOT offer a non-creature artifact (scope isn't widened globally)", () => {
    const s = boardState({
      ai: [createPermanent({ id: "a-sol", card: solRing(), controller: "ai", summoningSick: false })],
    });
    expect(cloneCandidates(s, "user", "any").map((c) => c.id)).toEqual([]);            // Clone can't copy Sol Ring
    expect(cloneCandidates(s, "user", "anyArtifactOrCreature").map((c) => c.id)).toEqual(["a-sol"]); // Metamorph can
  });

  // CREED near-miss #2 — an UNMODELED extra rider (myriad) still parks the whole card even though the artifact
  // card-type rider is now modeled (all-or-nothing rider gate).
  it("CREED: an artifact-copy clone carrying an unmodeled 'has myriad' rider still PARKs (false-positive guard)", () => {
    const FAKE = {
      name: "Faux Metamorph",
      type: "Artifact Creature — Shapeshifter",
      mana: "{3}{U}",
      oracle: "You may have this creature enter as a copy of any artifact or creature on the battlefield, except it's an artifact in addition to its other types and it has myriad.",
    };
    expect(parseCloneSpec(FAKE)).toBeNull();
    expect(isCloneCard(FAKE)).toBe(false);
    expect(classifyCard(FAKE)).not.toBe("native-clone");
  });
});
