/**
 * becomesTapped.test.js — the BECOMES-TAPPED SELF event (BLITZ TR-1, CR 701.26a).
 *
 * "Whenever this creature becomes tapped, <effect>." Seams:
 *   1. gameState.tapPermanent / regeneratePermanent record pendingTapEvents for REAL untapped→tapped
 *      transitions ONLY (an already-tapped re-tap is not a transition; a permanent that ENTERS tapped
 *      passes fromEnter → no event, CR 701.26a).
 *   2. triggers.checkTapTriggers drains the queue and fires the tapped permanent's OWN self-scope watcher;
 *      gameEngine.flushTriggers drains it at every priority-grant checkpoint (a tap during dispatch converts).
 *   3. the payoff parses HIGH through the shared triggerRoutesNatively gate (self "it" pronouns bind the
 *      source), so a whole-card self "becomes tapped" carrier flips native-trigger.
 * CREED FP = a fire on an event that isn't a real transition (ETB-tapped, already-tapped re-tap), the WRONG
 * permanent (a non-self watcher scope), or a card flipped native whose payoff isn't faithfully modeled.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, tapPermanent, regeneratePermanent, findPermanent } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const preacher = (id = "wp") => ({ id, name: "Wanderbrine Preacher", type: "Creature — Merfolk Cleric", mana: "{1}{W}", power: "2", toughness: "1", oracle: "Whenever this creature becomes tapped, you gain 2 life." });
const medics = (id = "gm") => ({ id, name: "Goblin Medics", type: "Creature — Goblin Shaman", mana: "{2}{R}", power: "1", toughness: "1", oracle: "Whenever this creature becomes tapped, it deals 1 damage to any target." });
// FN guards — real oracle whose scope/payoff the SELF event must NOT claim.
const gideonsAvenger = () => ({ id: "ga", name: "Gideon's Avenger", type: "Creature — Human Soldier", mana: "{1}{W}{W}", power: "0", toughness: "0", oracle: "Whenever a creature an opponent controls becomes tapped, put a +1/+1 counter on this creature." });
const verityCircle = () => ({ id: "vc", name: "Verity Circle", type: "Enchantment", mana: "{2}{U}", oracle: "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, you may draw a card.\n{4}{U}: Tap target creature without flying." });
const surgespanner = () => ({ id: "sp", name: "Surgespanner", type: "Creature — Merfolk Wizard", mana: "{2}{U}{U}", power: "2", toughness: "2", oracle: "Whenever this creature becomes tapped, you may pay {1}{U}. If you do, return target permanent to its owner's hand." });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withField(s, pid, perms) {
  return { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: perms } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("detection + classify", () => {
  it("self 'becomes tapped' detects scope:self, routes natively; Wanderbrine Preacher → native-trigger", () => {
    const [d] = detectTriggers(preacher()).filter((t) => t.event === "becomesTapped");
    expect(d).toMatchObject({ event: "becomesTapped", scope: "self" });
    expect(d.effectClause).toBe("you gain 2 life");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(preacher())).toBe("native-trigger");
  });

  it("a self 'it deals … damage to any target' payoff routes natively (Goblin Medics → native-trigger)", () => {
    const [d] = detectTriggers(medics()).filter((t) => t.event === "becomesTapped");
    expect(d).toMatchObject({ event: "becomesTapped", scope: "self", effectClause: "it deals 1 damage to any target" });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(medics())).toBe("native-trigger");
  });

  it("FN — a NON-self watcher scope ('a creature an opponent controls becomes tapped') is never the self event", () => {
    // Gideon's Avenger / Verity Circle watch OTHER permanents; the SELF event must not detect them → Arbiter.
    expect(detectTriggers(gideonsAvenger()).some((d) => d.event === "becomesTapped")).toBe(false);
    expect(classifyCard(gideonsAvenger())).toBe("body-only");
    expect(detectTriggers(verityCircle()).some((d) => d.event === "becomesTapped")).toBe(false);
    expect(classifyCard(verityCircle())).toBe("body-only");
  });

  it("FN — a self carrier whose payoff isn't modeled stays body-only (Surgespanner: optional-pay bounce)", () => {
    // Detection is correct (self scope), but the ambiguous-target bounce fails triggerRoutesNatively → parked.
    const [d] = detectTriggers(surgespanner()).filter((t) => t.event === "becomesTapped");
    expect(d).toMatchObject({ event: "becomesTapped", scope: "self" });
    expect(triggerRoutesNatively(d)).toBe(false);
    expect(classifyCard(surgespanner())).toBe("body-only");
  });

  it("FN — a compound 'attacks or becomes tapped' parks (both halves undetected, CR 603.1 compound guard)", () => {
    const compound = { id: "cp", name: "Compound Tapper", type: "Creature — Human", power: "1", toughness: "1", oracle: "Whenever this creature attacks or becomes tapped, you gain 1 life." };
    expect(detectTriggers(compound).some((d) => d.event === "becomesTapped")).toBe(false);
    expect(classifyCard(compound)).toBe("body-only");
  });
});

describe("event recording (CREED core — transitions only)", () => {
  it("tapPermanent records a pendingTapEvent for an UNTAPPED permanent", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "wp", card: preacher(), controller: "user" })]);
    const after = tapPermanent(s, "wp");
    expect((after.pendingTapEvents || []).map((e) => e.id)).toEqual(["wp"]);
    expect(findPermanent(after, "wp").permanent.tapped).toBe(true);
  });

  it("an already-tapped re-tap records NO event (not a transition)", () => {
    const tapped = { ...createPermanent({ id: "wp", card: preacher(), controller: "user" }), tapped: true };
    let s = withField(baseState(), "user", [tapped]);
    expect(tapPermanent(s, "wp").pendingTapEvents ?? []).toHaveLength(0);
  });

  it("the ETB-tapped path (fromEnter) records NO event (CR 701.26a — entering tapped ≠ becoming tapped)", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "wp", card: preacher(), controller: "user" })]);
    const after = tapPermanent(s, "wp", { fromEnter: true });
    expect(after.pendingTapEvents ?? []).toHaveLength(0);
    expect(findPermanent(after, "wp").permanent.tapped).toBe(true); // still tapped — only the EVENT is suppressed
  });

  it("regeneratePermanent records a transition for an untapped permanent, none for an already-tapped one", () => {
    const untapped = { ...createPermanent({ id: "r1", card: preacher(), controller: "user" }), regenShields: 1 };
    let s = withField(baseState(), "user", [untapped]);
    expect((regeneratePermanent(s, "r1").pendingTapEvents || []).map((e) => e.id)).toEqual(["r1"]);
    const already = { ...createPermanent({ id: "r2", card: preacher(), controller: "user" }), tapped: true, regenShields: 1 };
    let s2 = withField(baseState(), "user", [already]);
    expect(regeneratePermanent(s2, "r2").pendingTapEvents ?? []).toHaveLength(0);
  });
});

describe("engine (the self payoff fires once per transition, for the right controller, not on ETB-tapped)", () => {
  it("tapping the carrier fires its OWN watcher: user gains 2 life exactly once", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "wp", card: preacher(), controller: "user" })]);
    const life0 = s.players.user.life;
    s = tapPermanent(s, "wp");
    s = resolveAll(s);
    expect(s.players.user.life).toBe(life0 + 2);
    expect((s.pendingTapEvents ?? [])).toHaveLength(0); // queue drained
  });

  it("self-scope: a DIFFERENT creature becoming tapped does NOT fire the carrier's watcher", () => {
    const other = createPermanent({ id: "ox", card: { id: "ox", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    let s = withField(baseState(), "user", [createPermanent({ id: "wp", card: preacher(), controller: "user" }), other]);
    const life0 = s.players.user.life;
    s = tapPermanent(s, "ox"); // tap the vanilla bear, not the Preacher
    s = resolveAll(s);
    expect(s.players.user.life).toBe(life0); // Preacher's self watcher never fired
  });

  it("a permanent that ENTERS tapped (fromEnter) never fires its becomes-tapped watcher", () => {
    let s = withField(baseState(), "user", [createPermanent({ id: "wp", card: preacher(), controller: "user" })]);
    const life0 = s.players.user.life;
    s = tapPermanent(s, "wp", { fromEnter: true });
    s = resolveAll(s);
    expect(s.players.user.life).toBe(life0);
  });
});
