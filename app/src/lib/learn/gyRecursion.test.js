/**
 * Graveyard recursion (CR 608) — "Return target [creature] card from your graveyard to your
 * hand" (Raise Dead / Cemetery Recruitment / Regrowth). A new `return-from-graveyard` atom + a
 * `graveyardCard` targetType: the target is a card in the CASTER'S OWN graveyard (a public zone),
 * chosen at cast time, so it flows through the normal cast-time target enumeration — no
 * resolution-time picker. Covers: the parser (creature/any filter; other filters/zones/cardinality
 * route to Arbiter), enumeration scoped to the caster's graveyard, resolution graveyard->hand, the
 * CR 608.2b illegal-target no-op, native-spell coverage, and the AI holding recursion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const RAISE_DEAD = { id: "c-raise", name: "Raise Dead", type: SORCERY, mana: "{B}", oracle: "Return target creature card from your graveyard to your hand." };
const REGROWTH = { id: "c-regrowth", name: "Regrowth", type: SORCERY, mana: "{1}{G}", oracle: "Return target card from your graveyard to your hand." };
const gyCreature = (id, name) => ({ id, name, type: "Creature — Beast", power: 2, toughness: 2, oracle: "" });
const gyLand = (id, name) => ({ id, name, type: "Land", oracle: "" });
const gyInstant = (id, name) => ({ id, name, type: "Instant", oracle: "Deal 3 damage to any target." });
const gyToken = (id, name) => ({ id, name, type: "Token Creature — Beast", power: 2, toughness: 2, oracle: "", token: true });

function boardState({ userGy = [], aiGy = [], hand = [], pool = { C: 6, B: 1, G: 1 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, graveyard: aiGy },
    },
  };
}

describe("parser — graveyard recursion is HIGH for modeled type filters; subtypes/colors route to Arbiter", () => {
  it("creature-card + unfiltered-card parse high with the right cardFilter", () => {
    expect(parseEffectProgram(RAISE_DEAD).atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" }]);
    expect(parseEffectProgram(REGROWTH).atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any" }]);
  });
  // REG-1 — the widened type-filter set (single types, " or " unions, "permanent"). Each flips HIGH with a
  // canonical sorted, pipe-joined cardFilter token. (instant-or-sorcery + artifact were LOW pre-REG-1.)
  it("REG-1: parses the widened card-type filters HIGH with canonical cardFilter tokens", () => {
    const f = (oracle) => parseEffectProgram({ type: SORCERY, oracle }).atoms;
    expect(f("Return target artifact card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact" }]);
    expect(f("Return target enchantment card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "enchantment" }]);
    expect(f("Return target land card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "land" }]);
    expect(f("Return target permanent card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "permanent" }]);
    expect(f("Return target instant or sorcery card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "instant|sorcery" }]);
    expect(f("Return target artifact or enchantment card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact|enchantment" }]);
    // union is order-independent (canonical sort): "artifact or creature" === "creature or artifact"
    expect(f("Return target artifact or creature card from your graveyard to your hand.")).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact|creature" }]);
  });
  it("a non-type filter / zone / cardinality / destination is low (Arbiter)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    // GRADUATED 2026-08-15 (atzocanSeer.test.js): a single creature SUBTYPE ("goblin", "dinosaur") parses
    // HIGH now via the CR_CREATURE_TYPES-validated {subtype} structured filter. The guard class lives on:
    low("Return target green card from your graveyard to your hand.");               // color — unmodeled
    low("Return target historic card from your graveyard to your hand.");            // "historic" (artifact/legendary/Saga) — unmodeled
    low("Return target nonland permanent card from your graveyard to your hand.");   // negation — unmodeled
    low("Return target artifact creature card from your graveyard to your hand.");   // INTERSECTION (both), not a union — unmodeled
    low("Return target creature card from a graveyard to your hand.");               // any graveyard, not "your"
    // NOTE: "Return up to two target creature cards …" is now NATIVE (MULTI-COUNT slice A — real runtime via
    // targeting.expandAtoms subset enumeration). Pinned HIGH in effects/multiCountTarget.test.js.
    // ⚠️ GRADUATED 2026-08-06 (RT-1) — the TAPPED rider is modeled. applyReanimate already threaded
    // atom.entersTapped into enterCardFromZone (built for Tato Farmer) and the MASS form already emitted
    // it; only this single-target matcher was anchored with nowhere for the rider to go. Verified at
    // RUNTIME before graduating — see reanimateTapped.test.js. A DIFFERENT rider still parks:
    low("Return target creature card from your graveyard to the battlefield with a +1/+1 counter on it.");
  });
  it("GRADUATED — non-creature reanimation is modelled now (CR 608)", () => {
    // This pinned an absent VOCABULARY: the bare reanimate arm was hardcoded to "creature" while its own
    // MV-capped twin already ran every word through parseGraveyardFilter. It is permanent-compatible
    // filters only — see reanimateFilterVocabulary.test.js for the instant/sorcery refusals.
    //
    // ⛔ VERIFIED ON A BOARD BEFORE GRADUATING, not merely re-parsed: resolving the atom against a graveyard
    // holding a Sol Ring and a Lightning Bolt puts the Sol Ring onto the battlefield and leaves the Bolt in
    // the yard. The runtime reanimator is genuinely type-agnostic, so crediting this is honest.
    const high = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("high");
    high("Return target artifact card from your graveyard to the battlefield.");
    high("Return target permanent card from your graveyard to the battlefield.");
  });
  it("composes in a multi-clause spell (recursion + draw)", () => {
    const p = parseEffectProgram({ type: SORCERY, oracle: "Return target creature card from your graveyard to your hand. Draw a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
});

const ZOMBIFY = { id: "c-zombify", name: "Zombify", type: SORCERY, mana: "{2}{B}", oracle: "Return target creature card from your graveyard to the battlefield." };
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("β-3b — reanimation (Return target creature card from your graveyard to the battlefield)", () => {
  it("parses the reanimate atom + classifies native-spell", () => {
    expect(parseEffectProgram(ZOMBIFY).atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" }]);
    expect(classifyCard(ZOMBIFY)).toBe("native-spell");
  });
  it("offers only a CREATURE card in the caster's graveyard (creature filter; land + token excluded)", () => {
    const s = boardState({ userGy: [gyCreature("gc", "Beast"), gyLand("gl", "Forest"), gyToken("gt", "Token")] });
    expect(enumerateTargets(s, "user", parseEffectProgram(ZOMBIFY).atoms[0]).map((t) => t.id)).toEqual(["gc"]);
  });
  it("reanimates the chosen creature: it ENTERS the battlefield (gone from the graveyard) and fires its ETB", () => {
    const visionary = { id: "vis", name: "Visionary", type: "Creature — Elf", power: 1, toughness: 1, oracle: "When this creature enters, draw a card." };
    let s = boardState({ userGy: [visionary], hand: [{ ...ZOMBIFY, id: "z" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "lib-1", name: "Card" }] } } };
    const cast = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "z");
    expect(cast.flatMap((a) => (a.targets || []).map((t) => t.id))).toEqual(["vis"]); // the live cast path enumerates the gy creature
    s = resolveAll(dispatchAction(s, cast[0]));
    expect(s.players.user.battlefield.some((p) => p.card?.id === "vis")).toBe(true);  // entered as a permanent under the caster's control
    expect(s.players.user.graveyard.some((c) => c.id === "vis")).toBe(false);          // left the graveyard
    expect(s.players.user.hand.some((c) => c.id === "lib-1")).toBe(true);              // its ETB "draw a card" FIRED
  });
  it("a reanimation TRIGGER routes natively (own-graveyard intent, not the Arbiter)", () => {
    // β-3b review fix: atomTargetIntent(reanimate) = "own" (the target is the caster's own graveyard), so
    // a "When this enters, reanimate" trigger is native-trigger, not gated to the Arbiter like ambiguous ops.
    expect(classifyCard({ type: "Creature — Cleric", name: "Reanimator", oracle: "When this creature enters, return target creature card from your graveyard to the battlefield." })).toBe("native-trigger");
  });
  it("a target that left the graveyard is a clean no-op (CR 608.2b — no throw, nothing enters)", () => {
    let s = boardState({ userGy: [] }); // empty gy
    // resolve the atom directly against a stale target id
    const after = resolveAll({ ...s, stack: [{ id: "stk", kind: "spell", source: ZOMBIFY, controller: "user",
      payload: { resolver: "effect-program", params: { program: parseEffectProgram(ZOMBIFY), controller: "user", targets: [{ type: "graveyardCard", id: "gone" }] } } }] });
    expect(after.players.user.battlefield).toHaveLength(0);
  });
});

// REANIMATE-FROM-ANY (CR 608) — the Reanimate-family phrasing "put target creature card from a/an opponent's
// graveyard onto the battlefield under your control". UNLIKE the own-graveyard reanimate above the card may
// live in ANOTHER player's graveyard, yet always enters under the CASTER's control.
const HYMN_OF_REBIRTH = { id: "c-hymn", name: "Hymn of Rebirth", type: SORCERY, mana: "{3}{G}{W}", oracle: "Put target creature card from a graveyard onto the battlefield under your control." };
const ASHEN_POWDER = { id: "c-ashen", name: "Ashen Powder", type: SORCERY, mana: "{3}{B}{B}", oracle: "Put target creature card from an opponent's graveyard onto the battlefield under your control." };

describe("REANIMATE-FROM-ANY — \"put target creature card from a / an opponent's graveyard onto the battlefield under your control\"", () => {
  it("parses the any-graveyard + opponent-graveyard reanimate atoms; both classify native-spell", () => {
    expect(parseEffectProgram(HYMN_OF_REBIRTH).atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true }]);
    expect(parseEffectProgram(ASHEN_POWDER).atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true }]);
    expect(classifyCard(HYMN_OF_REBIRTH)).toBe("native-spell");
    expect(classifyCard(ASHEN_POWDER)).toBe("native-spell");
  });

  it("Endless Obedience (Convoke + the put clause) is native-spell — the cost-only keyword is stripped", () => {
    // Convoke is a cost-only keyword (the runtime hard-casts at full cost), so the bare put clause parses HIGH.
    const endless = { type: SORCERY, name: "Endless Obedience", mana: "{4}{B}", oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nPut target creature card from a graveyard onto the battlefield under your control." };
    expect(classifyCard(endless)).toBe("native-spell");
  });

  it("any-graveyard enumeration offers creature cards from EVERY player's graveyard (tokens/lands excluded)", () => {
    const s = boardState({
      userGy: [gyCreature("u-bear", "Bear"), gyLand("u-forest", "Forest"), gyToken("u-tok", "Token")],
      aiGy: [gyCreature("a-bear", "Enemy Bear"), gyLand("a-mtn", "Mountain")],
    });
    const t = enumerateTargets(s, "user", parseEffectProgram(HYMN_OF_REBIRTH).atoms[0]);
    expect(t.map((x) => x.id).sort()).toEqual(["a-bear", "u-bear"].sort());     // both players' creature CARDS
    expect(t.find((x) => x.id === "a-bear").controller).toBe("ai");             // stamped with its GY owner
    expect(t.find((x) => x.id === "u-bear").controller).toBe("user");
  });

  it("opponent-graveyard enumeration offers ONLY the opponent's creature cards (never the caster's own)", () => {
    const s = boardState({
      userGy: [gyCreature("u-bear", "Bear")],
      aiGy: [gyCreature("a-bear", "Enemy Bear"), gyLand("a-mtn", "Mountain")],
    });
    const t = enumerateTargets(s, "user", parseEffectProgram(ASHEN_POWDER).atoms[0]);
    expect(t.map((x) => x.id)).toEqual(["a-bear"]);                              // only the opponent's creature card
    expect(t.every((x) => x.controller === "ai")).toBe(true);
  });

  it("RUNTIME — reanimates a creature from the OPPONENT's graveyard: it enters under the CASTER's control + fires its ETB", () => {
    const visionary = { id: "vis", name: "Visionary", type: "Creature — Elf", power: 1, toughness: 1, oracle: "When this creature enters, draw a card." };
    let s = boardState({ aiGy: [visionary], hand: [{ ...ASHEN_POWDER, id: "ap" }], pool: { C: 6, B: 2 } });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "lib-1", name: "Card" }] } } };
    const cast = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ap");
    expect(cast.flatMap((a) => (a.targets || []).map((t) => t.id))).toEqual(["vis"]);  // the live cast path enumerates the opponent's gy creature
    s = resolveAll(dispatchAction(s, cast[0]));
    expect(s.players.user.battlefield.some((p) => p.card?.id === "vis")).toBe(true);   // entered under the CASTER's control
    expect(s.players.ai.graveyard.some((c) => c.id === "vis")).toBe(false);             // removed from the OPPONENT's graveyard
    expect(s.players.user.hand.some((c) => c.id === "lib-1")).toBe(true);              // its ETB "draw a card" FIRED for the caster
  });

  it("RUNTIME — reanimates a creature from the CASTER's OWN graveyard via the any-graveyard form (Hymn of Rebirth)", () => {
    const bear = gyCreature("u-bear", "Grizzly Bears");
    let s = boardState({ userGy: [bear], hand: [{ ...HYMN_OF_REBIRTH, id: "h" }], pool: { C: 6, G: 1, W: 1 } });
    const cast = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h");
    expect(cast.flatMap((a) => (a.targets || []).map((t) => t.id))).toEqual(["u-bear"]);
    s = resolveAll(dispatchAction(s, cast[0]));
    expect(s.players.user.battlefield.some((p) => p.card?.id === "u-bear")).toBe(true);
    expect(s.players.user.graveyard.some((c) => c.id === "u-bear")).toBe(false);        // left the caster's own graveyard
  });

  it("a target that left the graveyard is a clean no-op (CR 608.2b — no throw, nothing enters)", () => {
    let s = boardState({ aiGy: [] });
    const prog = parseEffectProgram(ASHEN_POWDER);
    const after = resolveAll({ ...s, stack: [{ id: "stk", kind: "spell", source: ASHEN_POWDER, controller: "user",
      payload: { resolver: "effect-program", params: { program: prog, controller: "user", targets: [{ type: "graveyardCard", id: "gone", controller: "ai" }] } } }] });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.ai.battlefield).toHaveLength(0);
  });

  // CREED anti-FP pins — every RIDER beyond the bare put clause must keep the WHOLE card on the Arbiter.
  it("CREED: a put-from-graveyard with a RIDER stays arbiter-spell (whole-card or PARK)", () => {
    const low = (oracle) => expect(classifyCard({ type: SORCERY, name: "X", mana: "{2}{B}", oracle })).toBe("arbiter-spell");
    // NOTE: "Reanimate" (reanimate + "you lose life equal to that card's mana value") now parses HIGH — the
    // REANIMATE-DRAIN matcher models the life-loss-by-reanimated-MV rider; positive pin in reanimateDrain.test.js.
    low("Put target creature card from a graveyard onto the battlefield under your control. It gains indestructible. If it's your turn, scry 2.");      // Fated Return
    low("Put target creature card from a graveyard onto the battlefield under your control. That creature is a black Zombie in addition to its other colors and types."); // Rise from the Grave — type-change rider
    low("Put target creature card from a graveyard onto the battlefield under your control tapped.");                                                   // "tapped" rider
    low("Put target creature card from a graveyard onto the battlefield under your control with a corpse counter on it.");                              // counter rider
    low("Put target artifact card from a graveyard onto the battlefield under your control.");                                                          // non-creature filter
    low("Put target creature card from your graveyard onto the battlefield under your control.");                                                       // "your graveyard" + this phrasing is NOT a modeled own-gy shape (the modeled own form is "return … to the battlefield")
  });

  it("CREED: a reanimate-from-ANY TRIGGER routes to the Arbiter (ambiguous side — a safe FN), unlike own-gy reanimate", () => {
    // The any/opponent-graveyard scope can't promise the trigger-flush chooser a provably-correct side, so a
    // permanent with such a trigger stays arbiter-trigger (never a confident mis-target). Own-gy reanimate is unchanged (native).
    expect(classifyCard({ type: "Creature — Demon", name: "AnyReanimator", oracle: "When this creature enters, put target creature card from a graveyard onto the battlefield under your control." })).not.toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Cleric", name: "OwnReanimator", oracle: "When this creature enters, return target creature card from your graveyard to the battlefield." })).toBe("native-trigger");
  });
});

describe("coverage — clean graveyard recursion is native-spell", () => {
  it("Raise Dead + Regrowth + a widened type filter classify native-spell; a subtype filter is arbiter-spell", () => {
    expect(classifyCard(RAISE_DEAD)).toBe("native-spell");
    expect(classifyCard(REGROWTH)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "X", oracle: "Return target artifact card from your graveyard to your hand." })).toBe("native-spell"); // REG-1 — now modeled
    // GRADUATED 2026-08-15 (atzocanSeer.test.js): a creature-subtype filter is native now ({subtype},
    // CR-vocabulary-gated); a COLOR filter keeps the arbiter park (the guard class).
    expect(classifyCard({ type: SORCERY, name: "Y", oracle: "Return target goblin card from your graveyard to your hand." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Z", oracle: "Return target green card from your graveyard to your hand." })).toBe("arbiter-spell");
  });
});

describe("enumeration — only the CASTER'S graveyard, filtered by card type", () => {
  it("creature filter surfaces only the caster's creature cards; opponent's graveyard is never offered", () => {
    const s = boardState({
      userGy: [gyCreature("u-bear", "Grizzly Bears"), gyLand("u-forest", "Forest"), gyInstant("u-bolt", "Lightning Bolt"), gyToken("u-tok", "Bear Token")],
      aiGy: [gyCreature("a-bear", "Enemy Bear")],
    });
    const t = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "creature" });
    expect(t.map((x) => x.id)).toEqual(["u-bear"]);                  // only the user's creature CARD (token excluded — not a card)
    const any = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "any" });
    expect(any.map((x) => x.id).sort()).toEqual(["u-bolt", "u-forest", "u-bear"].sort()); // every user CARD (token excluded)
    expect(any.every((x) => x.controller === "user")).toBe(true);   // never the opponent's graveyard
    expect(any.some((x) => x.id === "u-tok")).toBe(false);          // a token is not a card
  });

  it("CR 712.4a — a transform card whose FRONT is non-creature is not a creature-card target", () => {
    // "Westvale Abbey // Ormendahl, Profane Prince" is a LAND in the graveyard (front face only).
    const dfc = { id: "u-abbey", name: "Westvale Abbey", type: "Land // Legendary Creature — Demon", oracle: "" };
    const s = boardState({ userGy: [dfc, gyCreature("u-bear", "Grizzly Bears")] });
    const creatures = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "creature" });
    expect(creatures.map((x) => x.id)).toEqual(["u-bear"]);          // the DFC's front is a Land — excluded
    const any = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "any" });
    expect(any.some((x) => x.id === "u-abbey")).toBe(true);          // but it IS a card (any filter offers it)
  });

  it("REG-1: a widened filter offers only matching cards (artifact / instant|sorcery / permanent)", () => {
    const s = boardState({
      userGy: [gyCreature("u-bear", "Bear"), gyLand("u-forest", "Forest"), gyInstant("u-bolt", "Bolt"),
        { id: "u-sol", name: "Sol Ring", type: "Artifact", oracle: "" }, { id: "u-rite", name: "Dark Ritual", type: "Sorcery", oracle: "" }],
    });
    const f = (cardFilter) => enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter }).map((x) => x.id).sort();
    expect(f("artifact")).toEqual(["u-sol"]);                          // only the artifact card
    expect(f("instant|sorcery")).toEqual(["u-bolt", "u-rite"].sort()); // instant + sorcery, not creature/land/artifact
    expect(f("permanent")).toEqual(["u-bear", "u-forest", "u-sol"].sort()); // permanent-type cards; instant + sorcery excluded
  });
});

describe("resolution — the chosen card moves graveyard -> hand", () => {
  const cast = (s, cardId, targetId) => {
    const action = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === cardId && a.targets?.[0]?.id === targetId);
    expect(action).toBeTruthy();
    expect(action.needsTargets).toBe(true);
    return resolveTopOfStack(dispatchAction(s, action));
  };

  it("Raise Dead returns the chosen creature card to hand, leaving others in the graveyard", () => {
    let s = boardState({
      userGy: [gyCreature("u-bear", "Grizzly Bears"), gyCreature("u-elf", "Llanowar Elves")],
      aiGy: [gyCreature("a-bear", "Enemy Bear")],
      hand: [RAISE_DEAD],
    });
    s = cast(s, "c-raise", "u-bear");
    expect(s.players.user.hand.some((c) => c.id === "u-bear")).toBe(true);          // returned to hand
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["u-elf", "c-raise"]); // the other stays + the resolved spell (CR 608.2m)
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bear"]);            // opponent untouched
  });

  it("Regrowth can return a noncreature card (a land) to hand", () => {
    let s = boardState({ userGy: [gyLand("u-forest", "Forest")], hand: [REGROWTH] });
    s = cast(s, "c-regrowth", "u-forest");
    expect(s.players.user.hand.some((c) => c.id === "u-forest")).toBe(true);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["c-regrowth"]); // Regrowth itself lands in GY (CR 608.2m)
  });

  it("a target that already left the graveyard is a clean no-op (CR 608.2b), not a throw", () => {
    // Build a stack object by hand to simulate the targeted card vanishing before resolution.
    let s = boardState({ userGy: [gyCreature("u-bear", "Grizzly Bears")], hand: [RAISE_DEAD] });
    const action = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-raise");
    s = dispatchAction(s, action);
    // Remove the targeted card from the graveyard while the spell is on the stack.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [] } } };
    expect(() => { s = resolveTopOfStack(s); }).not.toThrow();
    expect(s.players.user.hand.some((c) => c.id === "u-bear")).toBe(false);
  });

  it("a creature-filter recursion offers no cast when the graveyard has no creature card", () => {
    const s = boardState({ userGy: [gyLand("u-forest", "Forest")], hand: [RAISE_DEAD] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-raise");
    expect(casts).toHaveLength(0); // no legal target -> uncastable (CR 601.2c)
  });
});

describe("AI — holds graveyard recursion (deferred seam)", () => {
  it("the AI does not cast a graveyard-return spell (effect null -> no target -> holds)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: {
        ...base.players,
        ai: { ...base.players.ai, hand: [RAISE_DEAD], graveyard: [gyCreature("a-bear", "Enemy Bear")], manaPool: { C: 6, B: 1 } },
      },
    };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell").toBe(false);
  });
});
