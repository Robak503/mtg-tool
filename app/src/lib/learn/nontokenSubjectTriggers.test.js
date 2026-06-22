/**
 * NONTOKEN-SUBJECT trigger detection (wave3b) — "a nontoken creature/<Subtype> you control dies/enters".
 *
 * classifyCondition didn't recognize the "nontoken" qualifier on a dies/enters subject, so Lazotep Sliver
 * ("Whenever a nontoken Sliver you control dies, amass Slivers 2") was UNDETECTED (the amass effect itself
 * is already modeled — Wave 1). This slice adds the detection on BOTH the dies and the enters paths:
 *   - "a nontoken creature you control dies/enters"   → creatureYouControl + nontokenFilter
 *   - "a nontoken <Subtype> you control dies/enters"  → subtypeYouControl + subtypeFilter + nontokenFilter
 *
 * CREED (CR 111.1) — the "nontoken" qualifier must GATE firing: a TOKEN of the matching kind dying/entering
 * must NOT fire. The load-bearing FP is Lazotep's OWN amass-minted Sliver Army token (a Sliver) dying →
 * without the gate it would re-fire the amass. Equally, Sosuke's Summons mints a Snake token on a nontoken
 * Snake entering — without the gate that token entry would re-fire (an infinite loop). The detection stays
 * controller-scoped only: a no-controller form ("a nontoken creature dies", Mimic Vat) stays UNDETECTED →
 * Arbiter (a SAFE false-negative), since its scope can't cleanly carry the controller-agnostic nontoken check.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers, checkEnterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, oracle) => ({ id: `card-${name}`, name, type, oracle });
const dies = (oracle, name = "Watcher", type = "Creature — Zombie Sliver") =>
  detectTriggers(card(name, type, oracle)).find((t) => t.event === "dies");
const etb = (oracle, name = "Watcher", type = "Enchantment") =>
  detectTriggers(card(name, type, oracle)).find((t) => t.event === "etb");

describe("NONTOKEN-SUBJECT — detection (classifyCondition)", () => {
  it("Lazotep Sliver: 'a nontoken Sliver you control dies' → subtypeYouControl + nontokenFilter", () => {
    expect(dies("Whenever a nontoken Sliver you control dies, amass Slivers 2.", "Lazotep Sliver"))
      .toMatchObject({ event: "dies", scope: "subtypeYouControl", subtypeFilter: "Sliver", nontokenFilter: true });
  });
  it("'a nontoken creature you control dies' → creatureYouControl + nontokenFilter (Remembrance/Open the Graves)", () => {
    expect(dies("Whenever a nontoken creature you control dies, draw a card.", "Open the Graves", "Enchantment"))
      .toMatchObject({ event: "dies", scope: "creatureYouControl", nontokenFilter: true });
  });
  it("'a nontoken creature you control enters' → creatureYouControl + nontokenFilter (Guardian Project)", () => {
    expect(etb("Whenever a nontoken creature you control enters, draw a card.", "Guardian Project"))
      .toMatchObject({ event: "etb", scope: "creatureYouControl", nontokenFilter: true });
  });
  it("'a nontoken Snake you control enters' → subtypeYouControl + nontokenFilter (Sosuke's Summons)", () => {
    expect(etb("Whenever a nontoken Snake you control enters, create a 1/1 green Snake creature token.", "Sosuke's Summons"))
      .toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Snake", nontokenFilter: true });
  });
});

describe("NONTOKEN-SUBJECT — CREED (only the scope-enforceable forms classify)", () => {
  it("a no-controller 'a nontoken creature dies' stays UNDETECTED → Arbiter", () => {
    expect(dies("Whenever a nontoken creature dies, draw a card.", "Mimic Vat", "Artifact")).toBeUndefined();
  });
  it("a no-controller 'a nontoken creature enters' stays UNDETECTED → Arbiter", () => {
    expect(etb("Whenever a nontoken creature enters, create a token.", "Genesis Chamber", "Artifact")).toBeUndefined();
  });
  it("a no-controller 'a nontoken artifact enters' stays UNDETECTED (not a scope we gate here)", () => {
    expect(etb("Whenever a nontoken artifact enters, draw a card.", "Junkyard Scrapper", "Creature — Goblin Artificer")).toBeUndefined();
  });
  it("a meta-word subject ('a nontoken permanent you control dies') stays UNDETECTED (do-nothing-native FP guard)", () => {
    // "Permanent" never appears in a type line, so the subtypeYouControl scope check would never fire —
    // claiming native on a do-nothing trigger is a forbidden FP. The NON_SUBTYPE_ETB_WORDS denylist rejects it.
    expect(dies("Whenever a nontoken permanent you control dies, draw a card.", "Hypothetical", "Enchantment")).toBeUndefined();
  });
  it("a two-word subtype ('a nontoken Eldrazi Scion you control dies') stays UNDETECTED (single-word anchor)", () => {
    expect(dies("Whenever a nontoken Eldrazi Scion you control dies, draw a card.", "Hypothetical", "Enchantment")).toBeUndefined();
  });
  it("a real type-line token ('a nontoken artifact you control enters') IS detected (Replication Specialist)", () => {
    // "artifact"/"enchantment" are NOT denylisted — they appear literally in type lines (CR 205.2).
    expect(etb("Whenever a nontoken artifact you control enters, draw a card.", "Replication Specialist", "Creature — Moonfolk Artificer"))
      .toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Artifact", nontokenFilter: true });
  });
});

describe("NONTOKEN-SUBJECT — dies runtime gate (the FP landmine)", () => {
  const lazotep = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Lazotep Sliver", type: "Creature — Zombie Sliver", power: 2, toughness: 2, oracle: "Whenever a nontoken Sliver you control dies, amass Slivers 2." }, controller: "user", summoningSick: false });
  const dead = (perm) => ({ id: perm.id, controller: perm.controller, card: perm.card });
  const withWatcher = (w, extra = []) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [w, ...extra] } } };
  };
  const diesFired = (s, deadPerm) => (checkDiesTriggers(s, [dead(deadPerm)]).pendingTriggers || []).filter((t) => t.event === "dies");

  it("a real (nontoken) Sliver you control dying FIRES the amass", () => {
    const w = lazotep("laz1");
    const sliver = createPermanent({ id: "sv", card: { id: "csv", name: "Sidewinder Sliver", type: "Creature — Sliver", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    expect(diesFired(withWatcher(w, [sliver]), sliver)).toHaveLength(1);
  });
  it("a TOKEN Sliver Army you control dying does NOT fire (CR 111.1 — the #1 FP, Lazotep's own amass token)", () => {
    const w = lazotep("laz2");
    const army = createPermanent({ id: "ta", card: { id: "cta", name: "Sliver Army", type: "Token Creature — Sliver Army", power: 2, toughness: 2, token: true }, controller: "user", summoningSick: false });
    expect(diesFired(withWatcher(w, [army]), army)).toHaveLength(0);
  });
  it("a real Sliver an OPPONENT controls dying does NOT fire (you-control gate)", () => {
    const w = lazotep("laz3");
    const opp = createPermanent({ id: "os", card: { id: "cos", name: "Opp Sliver", type: "Creature — Sliver", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    expect(diesFired(withWatcher(w), opp)).toHaveLength(0);
  });
  it("a non-Sliver you control dying does NOT fire (subtype gate)", () => {
    const w = lazotep("laz4");
    const bear = createPermanent({ id: "br", card: { id: "cbr", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    expect(diesFired(withWatcher(w, [bear]), bear)).toHaveLength(0);
  });
});

describe("NONTOKEN-SUBJECT — enters runtime gate (no infinite-loop FP)", () => {
  const guardianProject = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Guardian Project", type: "Enchantment", oracle: "Whenever a nontoken creature you control enters, draw a card." }, controller: "user", summoningSick: false });
  const sosuke = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Sosuke's Summons", type: "Enchantment", oracle: "Whenever a nontoken Snake you control enters, create a 1/1 green Snake creature token." }, controller: "user", summoningSick: false });
  const place = (watcher, enterPerm) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [watcher, enterPerm] } } };
  };
  const etbFired = (watcher, enterPerm) => (checkEnterTriggers(place(watcher, enterPerm), enterPerm).pendingTriggers || []).filter((t) => t.event === "etb").length;

  it("a real (nontoken) creature you control entering FIRES the watcher", () => {
    const w = guardianProject("gp1");
    const bear = createPermanent({ id: "rc", card: { id: "crc", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    expect(etbFired(w, bear)).toBe(1);
  });
  it("a TOKEN creature you control entering does NOT fire (CR 111.1)", () => {
    const w = guardianProject("gp2");
    const tok = createPermanent({ id: "tc", card: { id: "ctc", name: "Beast", type: "Token Creature — Beast", power: 3, toughness: 3, token: true }, controller: "user", summoningSick: false });
    expect(etbFired(w, tok)).toBe(0);
  });
  it("Sosuke's Summons: a TOKEN Snake entering does NOT fire (would otherwise loop — it mints a Snake token)", () => {
    const w = sosuke("ss1");
    const tokSnake = createPermanent({ id: "tsn", card: { id: "ctsn", name: "Snake", type: "Token Creature — Snake", power: 1, toughness: 1, token: true }, controller: "user", summoningSick: false });
    expect(etbFired(w, tokSnake)).toBe(0);
  });
  it("Sosuke's Summons: a real Snake entering FIRES the watcher", () => {
    const w = sosuke("ss2");
    const realSnake = createPermanent({ id: "rsn", card: { id: "crsn", name: "Snake", type: "Creature — Snake", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    expect(etbFired(w, realSnake)).toBe(1);
  });
});
