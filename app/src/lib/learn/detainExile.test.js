/**
 * detainExile.test.js — BLITZ DT-1 (CR 610.3): the DETAIN frame — "When this <enchantment|creature|
 * artifact> enters, exile target <X> an opponent controls until this <word> leaves the battlefield"
 * (Banishing Light / Banisher Priest / Seal Away / Glass Casket / Trapjaw Tyrant's enrage).
 *
 * The exile is LINKED: zones.applyExileUntilLeaves stamps {cardId, ownerId} onto the SOURCE permanent's
 * `detainedExile`; gameState.recordLeaveEvent carries the links onto the leave look-back; triggers.
 * checkLeavesTriggers synthesizes the [detain-return] one-shot on ANY exit (bounce included — unlike
 * earthbend's dies-or-exiled rider); zones.applyDetainReturn re-enters each card from its owner's exile
 * under that owner's control (a fresh permanent — its own ETBs fire, CR 400.7).
 *
 * CR guards pinned: 610.3b (source already left → no exile at all) · 111.7 (a token vanishes, never
 * linked, never returns) · the v1 aura exclusion (typeNeg at ENUMERATION — a detained Aura would need
 * attach-on-return modeling, so it is never offered; a documented narrow FN, not a resolver skip).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkLeavesTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BANISHING_LIGHT = { id: "bl", name: "Banishing Light", type: "Enchantment", mana: "{2}{W}",
  oracle: "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield." };
const BANISHER_PRIEST = { id: "bp", name: "Banisher Priest", type: "Creature — Human Cleric", power: "2", toughness: "2", mana: "{1}{W}{W}",
  oracle: "When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield." };
const SEAL_AWAY = { id: "sa", name: "Seal Away", type: "Enchantment", mana: "{1}{W}",
  oracle: "Flash\nWhen this enchantment enters, exile target tapped creature an opponent controls until this enchantment leaves the battlefield." };
// CREED near-misses:
const OBLIVION_RING = { id: "or", name: "Oblivion Ring", type: "Enchantment", mana: "{2}{W}",
  oracle: "When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control." };
const ANGEL_OF_SANCTIONS = { id: "as", name: "Angel of Sanctions", type: "Creature — Angel", power: "3", toughness: "4", mana: "{3}{W}{W}",
  oracle: "Flying\nWhen this creature enters, you may exile target nonland permanent an opponent controls until this creature leaves the battlefield.\nEmbalm {5}{W}" };

describe("parse + classify", () => {
  it("the detain clause parses HIGH with the link flag + the v1 aura exclusion", () => {
    const p = parseEffectClause("exile target nonland permanent an opponent controls until this enchantment leaves the battlefield");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "exile", targetType: "nonlandPermanent", untilSourceLeaves: true });
    expect(p.atoms[0].restrictions).toContainEqual({ kind: "typeNeg", type: "aura" });
    // The normalized qualifiers: tapped (Seal Away) and the controller+MV combination (Portable Hole).
    const tapped = parseEffectClause("exile target tapped creature an opponent controls until this enchantment leaves the battlefield");
    expect(tapped.atoms[0].restrictions).toContainEqual({ kind: "tapped", value: true });
    const mv = parseEffectClause("exile target nonland permanent an opponent controls with mana value 2 or less until this artifact leaves the battlefield");
    expect(mv.atoms[0].restrictions).toContainEqual({ kind: "manaValue", op: "<=", value: 2 });
  });
  it("the frame flips across carrier types (enchantment / creature / flash+tapped)", () => {
    expect(classifyCard(BANISHING_LIGHT)).toBe("native-trigger");
    expect(classifyCard(BANISHER_PRIEST)).toBe("native-trigger");
    expect(classifyCard(SEAL_AWAY)).toBe("native-trigger");
  });
  it("the old two-trigger O-Ring wording NOW FOLDS onto this frame; up-to-one stays LOW; Angel of Sanctions FLIPS once embalm is credited", () => {
    // ⭐ INVERTED IN PLACE 2026-08-04. This pin called the two-trigger wording "a different frame" and parked
    // it. It is the same frame in older printing: an enters-exile plus a leaves-return is exactly what
    // "until this permanent leaves the battlefield" means (CR 610.3). detectTriggers now FOLDS the pair into
    // the one-sentence form before detection, so this very mechanism claims it — no new resolver, and the
    // leaves-clause is spliced out because THIS file's mechanism already synthesizes that return (keeping it
    // would return the card twice). See twoTriggerDetainFold.test.js.
    expect(classifyCard(OBLIVION_RING)).toBe("native-trigger");
    // …and the CREED guard this line carried still stands, on a pair that genuinely must not fold: an
    // OPTIONAL exile ("you may") is a different effect and is deliberately excluded.
    expect(classifyCard({ id: "c-fh", name: "Fiend Hunter", type: "Creature — Human Cleric", mana: "{1}{W}{W}",
      power: 1, toughness: 3, oracle: "When this creature enters, you may exile another target creature.\nWhen this creature leaves the battlefield, return that card to the battlefield under its owner's control." })).toBe("body-only");
    // NOTE (zone-option family, 2026-07-24): embalm is now a credited GY zone-option
    // (coverage.js reGyZoneOptionCost), so Angel of Sanctions' O-Ring-frame exile trigger — modeled
    // by THIS file's slice all along — is the whole remaining card. The park reason was embalm alone.
    expect(classifyCard(ANGEL_OF_SANCTIONS)).toBe("native-trigger");
    expect(parseEffectClause("exile up to one target nonland permanent an opponent controls until this enchantment leaves the battlefield").confidence).toBe("low");
  });
});

describe("runtime — the full detain loop", () => {
  function board() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "gbc", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [bear] } } };
  }
  function resolveAll(s) { while ((s.stack || []).length) s = resolveTopOfStack(s); return s; }

  it("ETB exiles + links; the detainer dying returns the card under its owner's control", () => {
    let s = enterPermanent(board(), BANISHING_LIGHT, "user", {});
    s = resolveAll(flushTriggers(s, "user"));
    expect(s.players.ai1.battlefield).toHaveLength(0);
    expect((s.players.ai1.exile || []).map((c) => c.name)).toEqual(["Grizzly Bears"]);
    const bl = s.players.user.battlefield.find((p) => p.card.name === "Banishing Light");
    expect(bl.detainedExile).toEqual([{ cardId: "gbc", ownerId: "ai1" }]);
    // The detainer dies → the linked card returns to ITS OWNER's battlefield, exile empties.
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: bl.id });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.descriptor?.event === "detainReturn")).toBe(true);
    s = resolveAll(flushTriggers(s, "user"));
    expect(s.players.ai1.battlefield.map((p) => p.card.name)).toEqual(["Grizzly Bears"]);
    expect(s.players.ai1.exile || []).toHaveLength(0);
  });

  it("a detained TOKEN vanishes (CR 111.7) — never linked, never returns", () => {
    let s = board();
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [
      createPermanent({ id: "tok", card: { id: "tokc", name: "Soldier Token", type: "Creature — Soldier", power: "1", toughness: "1", oracle: "", token: true }, controller: "ai1", summoningSick: false }),
    ] } } };
    s = enterPermanent(s, BANISHER_PRIEST, "user", {});
    s = resolveAll(flushTriggers(s, "user"));
    expect(s.players.ai1.battlefield).toHaveLength(0);
    expect(s.players.ai1.exile || []).toHaveLength(0); // ceased to exist — not sitting in exile
    const bp = s.players.user.battlefield.find((p) => p.card.name === "Banisher Priest");
    expect(bp.detainedExile || []).toHaveLength(0);    // nothing linked
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: bp.id });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.descriptor?.event === "detainReturn")).toBe(false);
  });

  it("CR 610.3b — the source already left when the ETB resolves → the exile does not happen at all", () => {
    let s = enterPermanent(board(), BANISHING_LIGHT, "user", {});
    s = flushTriggers(s, "user"); // trigger on the stack, targeting the bear
    const bl = s.players.user.battlefield.find((p) => p.card.name === "Banishing Light");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: bl.id });
    s = resolveAll(s);
    expect(s.players.ai1.battlefield.map((p) => p.card.name)).toEqual(["Grizzly Bears"]); // untouched
    expect(s.players.ai1.exile || []).toHaveLength(0);
  });

  it("v1 aura exclusion — an opposing AURA is never offered: with only an aura available the trigger drops", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    // ai1's only nonland permanent is an Aura enchanting the USER's own bear.
    const myBear = createPermanent({ id: "mb", card: { id: "mbc", name: "My Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const pacifism = createPermanent({ id: "pac", card: { id: "pacc", name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", oracle: "Enchant creature\nEnchanted creature can't attack or block." }, controller: "ai1", summoningSick: false });
    pacifism.attachedTo = "mb"; myBear.attachments = ["pac"];
    s = { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [myBear] }, ai1: { ...s.players.ai1, battlefield: [pacifism] } } };
    s = enterPermanent(s, BANISHING_LIGHT, "user", {});
    let after = flushTriggers(s, "user");
    while ((after.stack || []).length) after = resolveTopOfStack(after);
    expect(after.players.ai1.battlefield.map((p) => p.card.name)).toEqual(["Pacifism"]); // still there
    expect(after.players.ai1.exile || []).toHaveLength(0);
  });
});
