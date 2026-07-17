/**
 * chosenTypeCastDraw.test.js — the CHOSEN-TYPE CAST-DRAW class (TYPAL CAST-DRAW, BLITZ TC-1).
 *
 * A choose-a-creature-type artifact/enchantment (CR 614.12 — the ETB replacement chooser; resolvers.
 * autoPickCreatureType stores perm.chosenType) whose payoffs are a FLAT chosen-type anthem (the
 * parseCreatureSelector chosen-type branch, selector.chosenTypeOfSource:true) AND a chosen-type CAST trigger
 * (CR 603.2 — the detectChosenTypeCast shapes, fired by checkCastTriggers against the WATCHER's stored type):
 *
 *   • Vanquisher's Banner  — "+1/+1" anthem + "Whenever you cast a CREATURE spell of the chosen type, draw
 *                            a card." (the NEW creatureOnly filter rider — a chosen-type NONCREATURE spell,
 *                            e.g. a Kindred instant, must NOT fire it)
 *   • Chronicle of Victory — "+2/+2 and have first strike and trample" anthem + "Whenever you cast a spell
 *                            of the chosen type, draw a card." (the bare Door-shape filter — a chosen-type
 *                            noncreature spell DOES fire it)
 *
 * Mechanism (REUSED end-to-end): the ETB chooser auto-pick is the SHIPPED deterministic policy — the
 * controller's most-common creature subtype on their battlefield, else their library, else "Human"; ties
 * alphabetical (resolvers.autoPickCreatureType — there is NO interactive picker for any seat; documented
 * there). The anthem rides the same layers lane the flat-anthem class uses (subtype OR changeling,
 * CR 702.73a). The cast trigger rides checkCastTriggers → flushTriggers → EFFECT_PROGRAM (the draw parses
 * HIGH via triggerRoutesNatively — the shared metric↔runtime gate).
 *
 * CREED — the FP here is an OVER-FIRE (drawing off an off-type or noncreature cast the print excludes) or a
 * FALSE FLIP off a dropped rider. The classifier (classifyChosenTypeCastDraw) is per-LINE audited with a
 * grant-tail CONSUMPTION check: an anthem tail the static parser silently drops ("and can't be blocked")
 * fails the descriptor count → the whole card stays Arbiter. Herald's Horn (an unroutable upkeep
 * look-trigger) and Icon of Ancestry (an activated ability) stay body-only — their reducer/anthem still
 * apply at runtime; only the flip is withheld (a safe FN).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { serializeState, deserializeState } from "./serialization.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// REAL oracle text (bundled Scryfall, probed 2026-07-16) — never from memory.
const VANQUISHER = {
  name: "Vanquisher's Banner", type: "Artifact",
  oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\nWhenever you cast a creature spell of the chosen type, draw a card.",
};
const CHRONICLE = {
  name: "Chronicle of Victory", type: "Legendary Artifact",
  oracle: "As Chronicle of Victory enters, choose a creature type.\nCreatures you control of the chosen type get +2/+2 and have first strike and trample.\nWhenever you cast a spell of the chosen type, draw a card.",
};
const HERALDS_HORN = {
  name: "Herald's Horn", type: "Artifact",
  oracle: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",
};
const ICON = {
  name: "Icon of Ancestry", type: "Artifact",
  oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\n{3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order.",
};

const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

function baseState(over = {}) {
  const s = createGameState({
    userDeck: Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, type: "Instant", oracle: "" })),
    aiDeck: [{ name: "A1", type: "Instant", oracle: "" }],
  });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function creaturePerm(id, typeLine, pt = [1, 1], controller = "user", oracle = "") {
  return createPermanent({ id, card: { name: id, type: typeLine, power: pt[0], toughness: pt[1], oracle }, controller });
}
// A board with the cast-draw source (chosenType pre-set) + extra permanents. Isolates the trigger/anthem
// behavior from the ETB auto-pick (exercised in its own block below).
function withSource(card, chosenType, extra = [], over = {}) {
  const s = baseState(over);
  const src = { ...createPermanent({ id: "src", card, controller: "user" }), chosenType };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src, ...extra] } } };
}
// Fire a cast through the real chokepoint and settle the whole flush→stack path; return the new state.
function castAndSettle(s, spellCard, casterId = "user") {
  return resolveAll(flushTriggers(checkCastTriggers(s, { spellCard, casterId })));
}

describe("CHOSEN-TYPE CAST-DRAW — classification (BLITZ TC-1)", () => {
  it("Vanquisher's Banner → native-mixed (chooser + flat anthem + creature-spell cast-draw trigger)", () => {
    expect(classifyCard(VANQUISHER)).toBe("native-mixed");
  });
  it("Chronicle of Victory → native-mixed (chooser + compound anthem + bare cast-draw trigger)", () => {
    expect(classifyCard(CHRONICLE)).toBe("native-mixed");
  });

  it("CREED — Herald's Horn parks (the upkeep look-reveal trigger does not route)", () => {
    expect(classifyCard(HERALDS_HORN)).toBe("body-only");
    const d = detectTriggers(HERALDS_HORN).find((x) => x.event === "upkeep");
    expect(d && !!triggerRoutesNatively(d)).toBe(false);
  });
  it("Icon of Ancestry — this CAST-DRAW classifier declines it (0 cast triggers); LK-1 owns the flip", () => {
    // The cast-draw classifier still returns null (it requires exactly one chosen-type CAST trigger; Icon has
    // none). As of BLITZ LK-1 the activated chosen-type look-tutor IS modeled (impulse-dig chosenTypeOfSource),
    // so the WHOLE card flips native-mixed via classifyChosenTypeAnthemDig — see lookAtTopRevealTake.test.js.
    expect(classifyCard(ICON)).toBe("native-mixed");
  });
  it("CREED — an anthem grant-tail the parser silently drops fails the CONSUMPTION check (no partial flip)", () => {
    // parseStaticAbilities keeps the +1/+1 and drops "and can't be blocked" — the per-line descriptor
    // count (1 expected from the RE's have-list, 1 emitted for the P/T alone) must catch it → body-only.
    const c = { name: "Fake Banner", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1 and can't be blocked.\nWhenever you cast a creature spell of the chosen type, draw a card." };
    expect(classifyCard(c)).toBe("body-only");
  });
  it("CREED — an opponent-caster variant stays parked (the detector is you-cast only)", () => {
    const c = { name: "Fake Watcher", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\nWhenever an opponent casts a creature spell of the chosen type, draw a card." };
    expect(classifyCard(c)).toBe("body-only");
  });
  it("CREED — a second effect sentence on the trigger line can't be shed (effectClause must equal the line)", () => {
    const c = { name: "Fake Two-Step", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\nWhenever you cast a creature spell of the chosen type, draw a card. Then discard a card." };
    expect(classifyCard(c)).toBe("body-only");
  });
  it("CREED — a Banner-of-Kinship-style compound chooser line is NOT consumed (its counter sentence is residue)", () => {
    const c = { name: "Fake Kinship", type: "Artifact", oracle: "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1.\nWhenever you cast a creature spell of the chosen type, draw a card." };
    expect(classifyCard(c)).toBe("body-only");
  });

  it("neighbors are NOT regressed: Door native-mixed, Banner of Kinship native-static, Kindred Discovery native-trigger, Rally the Ranks native-static", () => {
    expect(classifyCard({ name: "Door of Destinies", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nWhenever you cast a spell of the chosen type, put a charge counter on this artifact.\nCreatures you control of the chosen type get +1/+1 for each charge counter on this artifact." })).toBe("native-mixed");
    expect(classifyCard({ name: "Banner of Kinship", type: "Artifact", oracle: "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact." })).toBe("native-static");
    expect(classifyCard({ name: "Kindred Discovery", type: "Enchantment", oracle: "As Kindred Discovery enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card." })).toBe("native-trigger");
    expect(classifyCard({ name: "Rally the Ranks", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1." })).toBe("native-static");
  });
});

describe("detection — the two cast-trigger shapes", () => {
  it("Vanquisher's carries the creatureOnly chosen-type filter and routes natively", () => {
    const ds = detectTriggers(VANQUISHER);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "cast", whose: "you", spellFilter: { kind: "chosenType", creatureOnly: true } });
    expect(!!triggerRoutesNatively(ds[0])).toBe(true);
  });
  it("Chronicle carries the bare chosen-type filter (any spell of the type) and routes natively", () => {
    const ds = detectTriggers(CHRONICLE);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "cast", whose: "you", spellFilter: { kind: "chosenType" } });
    expect(ds[0].spellFilter.creatureOnly).toBeUndefined();
    expect(!!triggerRoutesNatively(ds[0])).toBe(true);
  });
});

describe("Vanquisher's Banner — runtime cast-draw (creature spells of the chosen type only)", () => {
  it("casting a chosen-type CREATURE spell draws exactly one card", () => {
    let s = withSource(VANQUISHER, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "" });
    expect(s.players.user.hand.length).toBe(before + 1);
  });
  it("an OFF-TYPE creature spell does NOT draw", () => {
    let s = withSource(VANQUISHER, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Goblin Guide", type: "Creature — Goblin Scout", oracle: "" });
    expect(s.players.user.hand.length).toBe(before);
  });
  it("a chosen-type NONCREATURE spell (a Kindred instant) does NOT draw — the creatureOnly gate", () => {
    let s = withSource(VANQUISHER, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Elvish Fury", type: "Kindred Instant — Elf", oracle: "" });
    expect(s.players.user.hand.length).toBe(before);
  });
  it("a CHANGELING creature spell counts as the chosen type (CR 702.73a) — draws", () => {
    let s = withSource(VANQUISHER, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Mistform Sliver", type: "Creature — Shapeshifter", oracle: "Changeling (This card is every creature type.)" });
    expect(s.players.user.hand.length).toBe(before + 1);
  });
  it("CREED — an OPPONENT casting a chosen-type creature does NOT fire it (whose: you)", () => {
    let s = withSource(VANQUISHER, "Elf");
    const beforeUser = s.players.user.hand.length;
    const beforeAi = s.players.ai.hand.length;
    s = castAndSettle(s, { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "" }, "ai");
    expect(s.players.user.hand.length).toBe(beforeUser);
    expect(s.players.ai.hand.length).toBe(beforeAi);
  });
  it("CREED — an unset chosenType (malformed source) never draws (a SAFE no-op)", () => {
    let s = withSource(VANQUISHER, undefined);
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "" });
    expect(s.players.user.hand.length).toBe(before);
  });

  it("the +1/+1 anthem buffs the chosen type only (you-control scope)", () => {
    const s = withSource(VANQUISHER, "Elf", [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [2, 2]),
    ]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([2, 2]);
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([2, 2]); // untouched
  });

  it("full ETB flow: enters into a 2-Elf board → auto-picks Elf (the deterministic shipped policy)", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      creaturePerm("e1", "Creature — Elf", [1, 1]),
      creaturePerm("e2", "Creature — Elf Warrior", [1, 1]),
    ] } } };
    s = enterPermanent(s, VANQUISHER, "user");
    const src = s.players.user.battlefield.find((p) => p.card.name === "Vanquisher's Banner");
    expect(src.chosenType).toBe("Elf");
    expect([permanentPower(s, "e1"), permanentToughness(s, "e1")]).toEqual([2, 2]);
  });

  it("chosenType SERIALIZES — a save/load round-trip still draws on a chosen-type creature cast", () => {
    let s = withSource(VANQUISHER, "Elf");
    s = deserializeState(serializeState(s));
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "" });
    expect(s.players.user.hand.length).toBe(before + 1);
  });
});

describe("Chronicle of Victory — runtime (bare filter + compound anthem)", () => {
  it("a chosen-type NONCREATURE spell DOES draw (no creatureOnly on the bare Door-shape filter)", () => {
    let s = withSource(CHRONICLE, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Elvish Fury", type: "Kindred Instant — Elf", oracle: "" });
    expect(s.players.user.hand.length).toBe(before + 1);
  });
  it("a chosen-type creature spell draws; an off-type one does not", () => {
    let s = withSource(CHRONICLE, "Elf");
    const before = s.players.user.hand.length;
    s = castAndSettle(s, { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "" });
    expect(s.players.user.hand.length).toBe(before + 1);
    s = castAndSettle(s, { name: "Goblin Guide", type: "Creature — Goblin Scout", oracle: "" });
    expect(s.players.user.hand.length).toBe(before + 1); // unchanged
  });
  it("the anthem grants +2/+2 AND first strike AND trample to the chosen type only", () => {
    const s = withSource(CHRONICLE, "Elf", [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [1, 1]),
    ]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([3, 3]);
    expect(permanentHasKeyword(s, "elf", "first strike")).toBe(true);
    expect(permanentHasKeyword(s, "elf", "trample")).toBe(true);
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([1, 1]);
    expect(permanentHasKeyword(s, "gob", "first strike")).toBe(false);
    expect(permanentHasKeyword(s, "gob", "trample")).toBe(false);
  });
});
