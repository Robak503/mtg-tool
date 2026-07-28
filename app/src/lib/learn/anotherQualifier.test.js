/**
 * anotherQualifier.test.js — the "ANOTHER" qualifier (CR 109.5), in the two places it was missing:
 *
 *   BOUNCE TARGET   "Return ANOTHER target nonland permanent to its owner's hand."   Aether Channeler #1526
 *   ETB SCOPE       "Whenever ANOTHER creature you control with power 4 or greater
 *                    enters, draw a card."                                            Garruk's Packleader #2014
 *
 * Both were one word from a shape the engine already read, and both fail in the OVER-fire direction if
 * the word is dropped: Packleader would draw for its own entry, and the Channeler could bounce itself.
 * Neither is visible in the coverage tier — the cards classify native either way.
 *
 * ⚠️ THE ETB PAIR IS OPPOSITE READINGS OF NEIGHBOURING TEMPLATING, which is why they can't share a
 * descriptor. "This creature OR another creature you control with power N or greater" deliberately
 * INCLUDES the self (the qualifier gates both halves of the union). "Another creature you control with
 * power N or greater" excludes it. Both are pinned here against the same board.
 *
 * ⚠️ AND THE BOUNCE RESTRICTION FAILS CLOSED. `notSource` returns an EMPTY pool when ctx.sourceId is
 * unknown, rather than wrongly including the source — the right default, but it means the qualifier is
 * only safe where the source id genuinely reaches target enumeration. The runtime pin below exercises
 * the real ETB-trigger path for that reason; a parse-only test would have proved nothing about whether
 * the mode has any legal target at all.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atom = (clause) => parseEffectClause(clause).atoms[0];

const PACKLEADER = { id: "c-pl", name: "Garruk's Packleader", type: "Creature — Beast", mana: "{4}{G}", power: 3, toughness: 3, keywords: [],
  oracle: "Whenever another creature you control with power 3 or greater enters, you may draw a card." };
const CHANNELER = { id: "c-ac", name: "Aether Channeler", type: "Creature — Human Wizard", mana: "{2}{U}", power: 2, toughness: 2, keywords: [],
  oracle: "When this creature enters, choose one —\n• Create a 1/1 white Bird creature token with flying.\n• Return another target nonland permanent to its owner's hand.\n• Draw a card." };
const BIG = { id: "c-big", name: "Big Bear", type: "Creature — Bear", power: 4, toughness: 4, oracle: "" };

describe("BOUNCE — 'another target …' carries notSource", () => {
  it("the nonland-permanent and creature forms both pick it up", () => {
    expect(atom("return another target nonland permanent to its owner's hand"))
      .toEqual({ op: "bounce", targetType: "nonlandPermanent", restrictions: [{ kind: "notSource" }] });
    expect(atom("return another target creature to its owner's hand"))
      .toEqual({ op: "bounce", targetType: "creature", restrictions: [{ kind: "notSource" }] });
  });

  it("it COMPOSES with a controller restriction, not replacing it", () => {
    expect(atom("return another target permanent you control to its owner's hand").restrictions)
      .toEqual([{ kind: "controller", who: "you" }, { kind: "notSource" }]);
  });

  it("REGRESSION PIN — the bare forms are byte-identical", () => {
    expect(atom("return target creature to its owner's hand")).toEqual({ op: "bounce", targetType: "creature" });
    expect(atom("return target nonland permanent to its owner's hand"))
      .toEqual({ op: "bounce", targetType: "nonlandPermanent", restrictions: [] });
  });

  it("THE FAIL-CLOSED PIN — with no source id the pool is EMPTY, never the source", () => {
    // notSource is deliberately fail-closed. Pinning it here so the behaviour is a documented choice
    // rather than a surprise the next time a caller forgets to thread ctx.sourceId.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const withPerm = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: [createPermanent({ id: "p1", card: BIG, controller: "user" })] } } };
    const spec = atom("return another target creature to its owner's hand");
    expect(enumerateTargets(withPerm, "user", spec, [], {})).toEqual([]);
    expect(enumerateTargets(withPerm, "user", spec, [], { sourceId: "other" }).map((t) => t.id)).toEqual(["p1"]);
  });

  it("Aether Channeler #1526 flips (all three modes)", () => {
    expect(classifyCard(CHANNELER)).toMatch(/^native/);
  });
});

describe("ETB SCOPE — 'another creature you control with power N or greater'", () => {
  it("detects with the exclude flag; the UNION form deliberately does not carry it", () => {
    const [a] = detectTriggers(PACKLEADER);
    expect(a).toMatchObject({ event: "etb", scope: "creatureYouControlPower", powerThreshold: 3, etbExcludeSelf: true });
    const [u] = detectTriggers({ ...PACKLEADER, oracle: "Whenever this creature or another creature you control with power 3 or greater enters, you may draw a card." });
    expect(u.etbExcludeSelf).toBeUndefined();
  });

  it("THE LOAD-BEARING ONE — Packleader does NOT fire on its own entry", () => {
    // Power 3, threshold 3: without the exclusion it draws for itself, every time it's cast.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const self = createPermanent({ id: "pl", card: PACKLEADER, controller: "user", summoningSick: true });
    const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self] } } };
    expect((checkEnterTriggers(board, self).pendingTriggers || []).length).toBe(0);
  });

  it("…and DOES fire on another big creature entering", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const self = createPermanent({ id: "pl", card: PACKLEADER, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "big", card: BIG, controller: "user" });
    const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self, other] } } };
    expect((checkEnterTriggers(board, other).pendingTriggers || []).length).toBe(1);
  });

  it("the power threshold still bites (a 2/2 entering fires nothing)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const self = createPermanent({ id: "pl", card: PACKLEADER, controller: "user", summoningSick: false });
    const small = createPermanent({ id: "sm", card: { id: "c-sm", name: "Cat", type: "Creature — Cat", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self, small] } } };
    expect((checkEnterTriggers(board, small).pendingTriggers || []).length).toBe(0);
  });

  it("REGRESSION PIN — the UNION form still fires on the source's own entry", () => {
    // The two templates are one word apart and mean opposite things. This is the half that must keep
    // firing; the pin above is the half that must not.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const union = { ...PACKLEADER, id: "c-un", name: "Union Beast",
      oracle: "Whenever this creature or another creature you control with power 3 or greater enters, you may draw a card." };
    const self = createPermanent({ id: "un", card: union, controller: "user", summoningSick: true });
    const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self] } } };
    expect((checkEnterTriggers(board, self).pendingTriggers || []).length).toBe(1);
  });

  it("Garruk's Packleader #2014 flips", () => {
    expect(classifyCard(PACKLEADER)).toBe("native-trigger");
  });
});
