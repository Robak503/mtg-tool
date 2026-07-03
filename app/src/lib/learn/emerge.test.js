/**
 * EMERGE (CR 702.97) — Eldrazi ALTERNATIVE cast cost: sacrifice a creature (or an artifact, for "Emerge
 * from artifact") and pay the emerge cost reduced by that permanent's mana value.
 *
 * Scope (this slice): a creature with a clean "Emerge {cost}" line whose BODY — the keyword line stripped —
 * is ALREADY a native tier (a keyword-only body, or a body whose only non-keyword text is a modeled self-cast
 * / ETB trigger). Emerge changes ONLY how/what you pay, never the printed text — the SAME shape the engine
 * models for Plot / Warp / Bestow. End-to-end the engine GENUINELY runs it:
 *   parser           → parseEmergeCard (emerge.js) gates the whole card (body must re-classify native)
 *   coverage         → the body's own tier (native-trigger here) via the additive seam classifier
 *   legalChoices     → the normal hard-cast AND an emerge cast per legal sacrifice victim (cost reduced by MV)
 *   actionDispatcher → sacrifices the victim (excluded from the mana sources) + pays the reduced mana
 *   triggers         → the body's self-cast / ETB trigger fires through the normal checkCastTriggers path
 *
 * The CREED-critical assertions: the emerge cast ACTUALLY works (the victim hits the graveyard, the reduced
 * cost is paid, the Eldrazi enters, its cast-trigger resolves), the cost is reduced by EXACTLY the victim's
 * MV (floored at the colored pips), a sacrificed mana dork can't double-pay, and every Emerge card with an
 * UNMODELED body stays body-only (Arbiter) — never a fabricated native credit. Real Scryfall oracle text.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEmergeCost, stripEmergeLine, parseEmergeCard } from "./emerge.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text, verified vs the bundled local index) ────────────────
// NATIVE-body Emerge (the body re-classifies native once the Emerge line is stripped):
const WRETCHED_GRYFF = { name: "Wretched Gryff", type: "Creature — Eldrazi Hippogriff", mana: "{7}", power: 3, toughness: 4,
  oracle: "Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, draw a card.\nFlying" };
const IT_OF_THE_HORRID_SWARM = { name: "It of the Horrid Swarm", type: "Creature — Eldrazi Insect", mana: "{8}", power: 4, toughness: 4,
  oracle: "Emerge {6}{G} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, create two 1/1 green Insect creature tokens." };
const ABUNDANT_MAW = { name: "Abundant Maw", type: "Creature — Eldrazi Leech", mana: "{8}", power: 6, toughness: 4,
  oracle: "Emerge {6}{B} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, target opponent loses 3 life and you gain 3 life." };
const MOCKERY_OF_NATURE = { name: "Mockery of Nature", type: "Creature — Eldrazi Beast", mana: "{9}", power: 6, toughness: 5,
  oracle: "Emerge {7}{G} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, you may destroy target artifact or enchantment." };
const VEXING_SCUTTLER = { name: "Vexing Scuttler", type: "Creature — Eldrazi Crab", mana: "{8}", power: 5, toughness: 5,
  oracle: "Emerge {6}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, you may return target instant or sorcery card from your graveyard to your hand." };
const LASHWEED_LURKER = { name: "Lashweed Lurker", type: "Creature — Eldrazi Horror", mana: "{8}", power: 4, toughness: 5,
  oracle: "Emerge {5}{G}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, you may put target nonland permanent on top of its owner's library." };
const DECIMATOR_OF_THE_PROVINCES = { name: "Decimator of the Provinces", type: "Creature — Eldrazi Boar", mana: "{10}", power: 7, toughness: 7,
  oracle: "Emerge {6}{G}{G}{G} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, creatures you control get +2/+2 and gain trample until end of turn.\nTrample, haste" };

// Elder Deep-Fiend's "tap up to four target permanents" body is now MODELED (MULTI-COUNT slice B — tap up-to-N),
// so it correctly classifies native-trigger like the other cast-trigger Emerge bodies.
const ELDER_DEEP_FIEND = { name: "Elder Deep-Fiend", type: "Creature — Eldrazi Octopus", mana: "{8}", power: 5, toughness: 6,
  oracle: "Flash\nEmerge {5}{U}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, tap up to four target permanents." };
const NATIVE_EMERGE = [WRETCHED_GRYFF, IT_OF_THE_HORRID_SWARM, ABUNDANT_MAW, MOCKERY_OF_NATURE, VEXING_SCUTTLER, LASHWEED_LURKER, DECIMATOR_OF_THE_PROVINCES, ELDER_DEEP_FIEND];

// PARKED Emerge (the body carries an UNMODELED clause → stays body-only even with Emerge modeled):
const ADIPOSE_OFFSPRING = { name: "Adipose Offspring", type: "Creature — Alien", mana: "{3}{W}", power: 0, toughness: 0,
  oracle: "Emerge {5}{W} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen this creature enters, create a 2/2 white Alien creature token. If this creature's emerge cost was paid, instead create X of those tokens, where X is the sacrificed creature's toughness." };
const DISTENDED_MINDBENDER = { name: "Distended Mindbender", type: "Creature — Eldrazi Insect", mana: "{8}", power: 5, toughness: 5,
  oracle: "Emerge {5}{B}{B} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, target opponent reveals their hand. You choose from it a nonland card with mana value 3 or less and a card with mana value 4 or greater. That player discards those cards." };

const PARKED_EMERGE = [ADIPOSE_OFFSPRING, DISTENDED_MINDBENDER];

// ── Parser units ────────────────────────────────────────────────────────────────────────────────────
describe("EMERGE parser — parseEmergeCost", () => {
  it("reads a clean creature-sac emerge cost (pips + sacType creature)", () => {
    expect(parseEmergeCost(WRETCHED_GRYFF)).toEqual({ pips: "{5}{U}", sacType: "creature" });
    expect(parseEmergeCost(DECIMATOR_OF_THE_PROVINCES)).toEqual({ pips: "{6}{G}{G}{G}", sacType: "creature" });
  });
  it("reads the \"Emerge from artifact\" variant (sacType artifact)", () => {
    const crabomination = { name: "Crabomination", type: "Creature — Crab Demon", mana: "{4}{B}{B}",
      oracle: "Emerge from artifact {5}{B}{B} (You may cast this spell by sacrificing an artifact and paying the emerge cost reduced by that artifact's mana value.)\nWhen this creature enters, target opponent exiles the top card of their library." };
    expect(parseEmergeCost(crabomination)).toEqual({ pips: "{5}{B}{B}", sacType: "artifact" });
  });
  it("returns null for a card with no Emerge line", () => {
    expect(parseEmergeCost({ name: "Grizzly Bears", type: "Creature — Bear", oracle: "" })).toBeNull();
    expect(parseEmergeCost({ name: "X", type: "Creature", oracle: "When you cast this spell, draw a card." })).toBeNull();
  });
  it("returns null for an {X} emerge cost (defer — a magnitude the cost path can't bound)", () => {
    expect(parseEmergeCost({ name: "X", type: "Creature — Eldrazi", oracle: "Emerge {X}{U} (reminder)" })).toBeNull();
  });
  it("does NOT match a mid-text \"emerge\" mention (line-anchored)", () => {
    // Herigast grants emerge to other spells — its own printed line is a normal emerge, but the GRANT
    // sentence ("Each creature spell you cast has emerge…") is not a cost line and must not be parsed.
    const grantOnly = { name: "X", type: "Creature — Eldrazi", oracle: "Each creature spell you cast has emerge. The emerge cost is equal to its mana cost." };
    expect(parseEmergeCost(grantOnly)).toBeNull();
  });
});

describe("EMERGE parser — stripEmergeLine", () => {
  it("removes the whole Emerge line (reminder and all), leaving the bare body", () => {
    expect(stripEmergeLine(WRETCHED_GRYFF.oracle)).toBe("When you cast this spell, draw a card.\nFlying");
    expect(stripEmergeLine(IT_OF_THE_HORRID_SWARM.oracle)).toBe("When you cast this spell, create two 1/1 green Insect creature tokens.");
  });
  it("leaves a card with no Emerge line unchanged", () => {
    expect(stripEmergeLine("Flying\nVigilance")).toBe("Flying\nVigilance");
  });
});

describe("EMERGE parser — parseEmergeCard (whole-card gate)", () => {
  it("returns the spec (pips, sacType, native bodyTier) for a native-body Emerge creature", () => {
    expect(parseEmergeCard(WRETCHED_GRYFF, classifyCard, isNativeTier)).toEqual({ pips: "{5}{U}", sacType: "creature", bodyTier: "native-trigger" });
  });
  it("returns null when the stripped body is UNMODELED (Distended Mindbender's reveal-and-choose-discard)", () => {
    expect(parseEmergeCard(DISTENDED_MINDBENDER, classifyCard, isNativeTier)).toBeNull();
  });
  it("returns null for a non-creature (Emerge cards are creatures, CR 702.97a)", () => {
    const fake = { name: "X", type: "Artifact", oracle: "Emerge {5}{U} (reminder)\nFlying" };
    expect(parseEmergeCard(fake, classifyCard, isNativeTier)).toBeNull();
  });
  it("returns null without the injected predicates (leaf-module safety)", () => {
    expect(parseEmergeCard(WRETCHED_GRYFF, null, null)).toBeNull();
  });
});

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────────
describe("EMERGE coverage — a native-body Emerge creature classifies as its body's tier", () => {
  for (const card of NATIVE_EMERGE) {
    it(`${card.name} → native-trigger (the body's self-cast / cast trigger, Emerge line stripped)`, () => {
      expect(classifyCard(card)).toBe("native-trigger");
    });
  }
});

// ── CREED anti-FP pins ──────────────────────────────────────────────────────────────────────────────
describe("EMERGE CREED — an Emerge card with an UNMODELED body stays body-only (never a fabricated credit)", () => {
  for (const card of PARKED_EMERGE) {
    it(`${card.name} stays body-only`, () => {
      expect(classifyCard(card)).toBe("body-only");
    });
  }
});

// ── Runtime helpers ─────────────────────────────────────────────────────────────────────────────────
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
// hand + battlefield (sacrifice victims) + a library to draw from + a mana pool.
function setup({ hand = [], battlefield = [], library = [], mana = {} } = {}) {
  const s = mainState();
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, battlefield, library, graveyard: [], manaPool: { ...s.players.user.manaPool, ...mana } } } };
}
const casts = (state, pid = "user") => legalActionsForPlayer(state, pid).filter((a) => a.kind === "cast-spell");
const perm = (card, id, over = {}) => ({ id, card: { id, ...card }, summoningSick: false, tapped: false, ...over });
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" }; // MV 2
const LAND = (id, name) => ({ id, name, type: "Basic Land — Forest", oracle: "" });

// ── Runtime: the emerge cast genuinely works ──────────────────────────────────────────────────────────
describe("EMERGE runtime — casting via emerge sacrifices the victim, pays the reduced cost, enters + triggers", () => {
  it("Wretched Gryff: emerge {5}{U} − bear MV2 = {3}{U} → bear hits the GY, Gryff enters, draw fires", () => {
    const s = setup({
      hand: [{ ...WRETCHED_GRYFF, id: "gryff" }],
      battlefield: [perm(BEAR, "bear")],
      library: [LAND("L1", "Forest"), LAND("L2", "Island")],
      mana: { U: 1, C: 3 }, // exactly the reduced {3}{U}; the normal {7} is UNaffordable
    });
    const all = casts(s);
    const emerge = all.find((a) => a.cardId === "gryff" && a.emerge);
    expect(emerge, "an emerge cast is offered even though the normal {7} is unaffordable").toBeTruthy();
    expect(all.some((a) => a.cardId === "gryff" && !a.emerge), "the normal cast is NOT offered (can't afford {7})").toBe(false);
    // The reduced cost: {3}{U} (generic 5 − MV 2 = 3; the colored {U} stays).
    expect(emerge.cost.generic).toBe(3);
    expect(emerge.cost.U).toBe(1);
    expect(emerge.cmc).toBe(7); // MV reads the PRINTED cost, unaffected by the alt-cast (CR 202.3b)
    expect(emerge.sacCreatureId).toBe("bear");

    let after = dispatchAction(s, emerge);
    // The sacrifice was paid: the bear is in the graveyard, off the battlefield.
    expect(after.players.user.battlefield.some((p) => p.id === "bear")).toBe(false);
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    // The reduced mana was paid (pool emptied).
    expect(Object.values(after.players.user.manaPool).reduce((a, b) => a + b, 0)).toBe(0);
    // Spell + its self-cast trigger are both on the stack.
    expect(after.stack.length).toBe(2);

    // Resolve the self-cast draw trigger (on top, CR 603.3b) — a card is drawn.
    after = resolveTopOfStack(after);
    expect(after.players.user.hand.length).toBe(1);
    expect(after.players.user.library.length).toBe(1);
    // Resolve the creature — Wretched Gryff enters the battlefield.
    after = resolveTopOfStack(after);
    expect(after.players.user.battlefield.some((p) => p.card.name === "Wretched Gryff")).toBe(true);
  });

  it("It of the Horrid Swarm: emerge creates two 1/1 Insect tokens (the ETB-cast trigger fires)", () => {
    const s = setup({
      hand: [{ ...IT_OF_THE_HORRID_SWARM, id: "it" }],
      battlefield: [perm(BEAR, "bear")],
      mana: { G: 1, C: 4 }, // {6}{G} − MV2 = {4}{G}
    });
    const emerge = casts(s).find((a) => a.cardId === "it" && a.emerge);
    expect(emerge).toBeTruthy();
    expect(emerge.cost.generic).toBe(4);
    expect(emerge.cost.G).toBe(1);
    let after = dispatchAction(s, emerge);
    after = resolveTopOfStack(after); // the create-two-tokens cast trigger
    const tokens = after.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(2);
    after = resolveTopOfStack(after); // the creature itself
    expect(after.players.user.battlefield.some((p) => p.card.name === "It of the Horrid Swarm")).toBe(true);
  });

  it("when BOTH are affordable, the normal hard-cast AND the emerge cast are offered (alternative, not replacement)", () => {
    const s = setup({
      hand: [{ ...WRETCHED_GRYFF, id: "gryff" }],
      battlefield: [perm(BEAR, "bear")],
      mana: { U: 1, C: 7 }, // {7} normal AND {3}{U} emerge both payable
    });
    const all = casts(s).filter((a) => a.cardId === "gryff");
    expect(all.some((a) => a.emerge)).toBe(true);
    expect(all.some((a) => !a.emerge)).toBe(true);
  });

  it("no legal sacrifice victim → no emerge cast offered (no fabricated free cast)", () => {
    const s = setup({
      hand: [{ ...WRETCHED_GRYFF, id: "gryff" }],
      battlefield: [], // nothing to sacrifice
      mana: { U: 1, C: 3 }, // only enough for the reduced cost
    });
    expect(casts(s).length).toBe(0); // can't afford normal {7}, no victim for emerge → uncastable
  });

  it("the cost reduction FLOORS at the colored pips — a high-MV sacrifice never underpays (CR 702.97a)", () => {
    const dragon = { name: "Big Dragon", type: "Creature — Dragon", mana: "{5}{R}", power: 5, toughness: 5, oracle: "" }; // MV 6
    const s = setup({
      hand: [{ ...WRETCHED_GRYFF, id: "gryff" }],
      battlefield: [perm(dragon, "drag")],
      mana: { U: 1 }, // ONLY {U} — if the floor failed (generic went negative), this would wrongly afford
    });
    const emerge = casts(s).find((a) => a.cardId === "gryff" && a.emerge);
    expect(emerge).toBeTruthy();
    expect(emerge.cost.generic).toBe(0); // 5 − 6 = −1 → floored at 0
    expect(emerge.cost.U).toBe(1);       // the colored pip is NEVER reduced
    // And it pays cleanly: sacrifice the dragon, pay just {U}.
    const after = dispatchAction(s, emerge);
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Big Dragon");
    expect(after.stack.length).toBe(2);
  });

  it("a sacrificed MANA DORK can't ALSO tap to pay the emerge cost (the γ1 double-spend guard)", () => {
    // The ONLY mana source is the dork being sacrificed. After it's sacrificed for the cost, it can't tap —
    // so with no other mana, the reduced {3}{U} (dork MV 1 → {4}{U}) is UNpayable → no emerge offered.
    const dork = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1, oracle: "{T}: Add {G}." }; // MV 1
    const s = setup({
      hand: [{ ...WRETCHED_GRYFF, id: "gryff" }],
      battlefield: [perm(dork, "dork")],
      mana: {}, // empty pool — the dork is the only would-be source
    });
    const emerge = casts(s).find((a) => a.cardId === "gryff" && a.emerge);
    // {5}{U} − MV1 = {4}{U}; with the dork excluded from sources (it's the sacrifice) there's no mana → not offered.
    expect(emerge, "emerge is NOT offered: the sacrificed dork can't double-pay and there's no other mana").toBeFalsy();
  });
});
