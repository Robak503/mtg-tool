/**
 * arwenOthersEnterWith.test.js — SHELF-85 runbook Phase 2 · H8 (2026-09-04): Arwen, Weaver of Hope (Shalai and Hallar),
 * with the twins Bramblewood Paragon (the Warrior form) and Renata, Called to the Hunt (the fixed form; her devotion
 * CDA keeps her body-only, but the reader and the runtime honour her line).
 *
 * "Each other creature you control enters with a number of additional +1/+1 counters on it equal to Arwen's toughness."
 * A replacement effect on ANOTHER permanent's entry (CR 614.1c). The reader (staticAbilityParser.othersEnterWithCounters)
 * returns { subtype, fixed, metric }; the resolver reads every OTHER permanent's descriptor on the controller's battlefield
 * as a creature enters and adds the counters (the metric is the LIVE toughness/power through layers); coverage strips the
 * sentence only when the same reader confirms it. Master Biomancer ("… and as a Mutant …") and Metallic Mimic ("of the
 * chosen type") stay unmatched → unmodelled, FN-safe (CREED).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { othersEnterWithCounters } from "./staticAbilityParser.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARWEN = { id: "c-arwen", name: "Arwen, Weaver of Hope", type: "Legendary Creature — Elf Noble", mana: "{1}{G}{G}", keywords: [], power: 2, toughness: 1,
  oracle: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to Arwen's toughness." };
const PARAGON = { id: "c-paragon", name: "Bramblewood Paragon", type: "Creature — Elf Warrior", mana: "{1}{G}", keywords: [], power: 2, toughness: 2,
  oracle: "Each other Warrior creature you control enters with an additional +1/+1 counter on it.\nEach creature you control with a +1/+1 counter on it has trample." };
const RENATA = { id: "c-renata", name: "Renata, Called to the Hunt", type: "Legendary Enchantment Creature — Demigod", mana: "{2}{G}{G}", keywords: [], power: 0, toughness: 3,
  oracle: "Renata's power is equal to your devotion to green. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nEach other creature you control enters with an additional +1/+1 counter on it." };
const BIOMANCER = { id: "c-bio", name: "Master Biomancer", type: "Creature — Elf Wizard", mana: "{2}{G}{U}", keywords: [], power: 2, toughness: 4,
  oracle: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to this creature's power and as a Mutant in addition to its other types." };
const MIMIC = { id: "c-mimic", name: "Metallic Mimic", type: "Artifact Creature — Shapeshifter", mana: "{2}", keywords: [], power: 2, toughness: 1,
  oracle: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const WARRIOR = { id: "c-warrior", name: "Sample Warrior", type: "Creature — Human Warrior", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const ROCK = { id: "c-rock", name: "Plain Rock", type: "Artifact", mana: "{1}", oracle: "" };

const base = () => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const withPerms = (s, perms) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...perms] } } });
const countersOfCard = (s, cardId) => s.players.user.battlefield.find((p) => p.card?.id === cardId)?.counters?.["+1/+1"] || 0;

describe("reader + classifier", () => {
  it("Arwen reads as a toughness metric, Renata as fixed 1, Bramblewood as Warrior-only fixed 1; the two tails stay unread", () => {
    expect(othersEnterWithCounters(ARWEN)).toEqual({ subtype: null, fixed: 0, metric: "sourceToughness" });
    expect(othersEnterWithCounters(RENATA)).toEqual({ subtype: null, fixed: 1, metric: null });
    expect(othersEnterWithCounters(PARAGON)).toEqual({ subtype: "Warrior", fixed: 1, metric: null });
    expect(othersEnterWithCounters(BIOMANCER)).toBeNull();
    expect(othersEnterWithCounters(MIMIC)).toBeNull();
    // CREED: the "a number of" form NEEDS a metric and the "an additional" form REFUSES one
    expect(othersEnterWithCounters({ ...ARWEN, oracle: "Each other creature you control enters with a number of additional +1/+1 counters on it." })).toBeNull();
    expect(othersEnterWithCounters({ ...ARWEN, oracle: "Each other creature you control enters with an additional +1/+1 counter on it equal to Arwen's toughness." })).toBeNull();
    // a stranger's name is not this creature
    expect(othersEnterWithCounters({ ...ARWEN, oracle: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to Gimli's toughness." })).toBeNull();
    expect(classifyCard({ name: ARWEN.name, type: ARWEN.type, oracle: ARWEN.oracle, mana: ARWEN.mana, keywords: [] })).toBe("native-body");
    expect(classifyCard({ name: PARAGON.name, type: PARAGON.type, oracle: PARAGON.oracle, mana: PARAGON.mana, keywords: [] })).toBe("native-static");
    expect(classifyCard({ name: BIOMANCER.name, type: BIOMANCER.type, oracle: BIOMANCER.oracle, mana: BIOMANCER.mana, keywords: [] })).toBe("body-only");
  });
});

describe("runtime — the entering creature reads the OTHER permanents' statics", () => {
  it("Arwen (2/1) on the battlefield: a bear enters with 1 counter; with a counter on Arwen it enters with 2 (LIVE toughness)", () => {
    let s = withPerms(base(), [createPermanent({ id: "A", card: ARWEN, controller: "user" })]);
    s = enterPermanent(s, BEARS, "user");
    expect(countersOfCard(s, "c-bears")).toBe(1);
    let s2 = withPerms(base(), [{ ...createPermanent({ id: "A", card: ARWEN, controller: "user" }), counters: { "+1/+1": 1 } }]);
    s2 = enterPermanent(s2, BEARS, "user");
    expect(countersOfCard(s2, "c-bears")).toBe(2);
  });

  it("Arwen entering alone gets nothing from herself; an entering artifact gets nothing; Arwen + Renata stack (1 + 1)", () => {
    let s = enterPermanent(base(), ARWEN, "user");
    expect(countersOfCard(s, "c-arwen")).toBe(0);
    let s2 = withPerms(base(), [createPermanent({ id: "A", card: ARWEN, controller: "user" })]);
    s2 = enterPermanent(s2, ROCK, "user");
    expect(countersOfCard(s2, "c-rock")).toBe(0);
    let s3 = withPerms(base(), [createPermanent({ id: "A", card: ARWEN, controller: "user" }), createPermanent({ id: "R", card: RENATA, controller: "user" })]);
    s3 = enterPermanent(s3, BEARS, "user");
    expect(countersOfCard(s3, "c-bears")).toBe(2);
  });

  it("Bramblewood Paragon: a Warrior enters with 1, a Bear with 0; Master Biomancer on the battlefield adds nothing (unmodelled, FN-safe)", () => {
    let s = withPerms(base(), [createPermanent({ id: "P", card: PARAGON, controller: "user" })]);
    s = enterPermanent(s, WARRIOR, "user");
    expect(countersOfCard(s, "c-warrior")).toBe(1);
    s = enterPermanent(s, BEARS, "user");
    expect(countersOfCard(s, "c-bears")).toBe(0);
    let s2 = withPerms(base(), [createPermanent({ id: "B", card: BIOMANCER, controller: "user" })]);
    s2 = enterPermanent(s2, BEARS, "user");
    expect(countersOfCard(s2, "c-bears")).toBe(0);
  });

  it("an opponent's Arwen does not grow your creatures", () => {
    let s = base();
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, createPermanent({ id: "A", card: ARWEN, controller: "ai" })] } } };
    s = enterPermanent(s, BEARS, "user");
    expect(countersOfCard(s, "c-bears")).toBe(0);
  });
});
