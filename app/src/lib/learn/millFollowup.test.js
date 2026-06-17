/**
 * Mill (CR 701.13) + the trigger FOLLOW-UP fix. Mill: "you mill N" / "each opponent mills N" (top N
 * → graveyard, non-targeted). The follow-up fix: detectTriggers now captures a trigger's follow-up
 * sentences into the effectClause, so a trigger with an UNMODELED follow-up ("mill a card. If a land
 * card was milled this way, you gain 2 life") parses LOW → routes to Arbiter (a safe no-op) instead
 * of firing its first effect natively and silently dropping the rest (a forbidden partial). The fix
 * is atom-agnostic (it protects draw / gain-life / etc. too).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { triggersForEvent, detectTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Sorcery", oracle });
const lib = (...names) => names.map((n) => ({ id: n.toLowerCase(), name: n, type: "Sorcery", oracle: "" }));
const land = (id, name) => ({ id, name, type: "Land", oracle: "" });
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("parser — mill (non-targeted); targeted deferred", () => {
  it("you-mill / each-opponent-mill parse; target-player stays low", () => {
    expect(parseEffectProgram(I("You mill three cards.")).atoms).toEqual([{ op: "mill", amount: 3, who: "controller", targetType: null }]);
    expect(parseEffectProgram(I("Each opponent mills two cards.")).atoms).toEqual([{ op: "mill", amount: 2, who: "eachOpponent", targetType: null }]);
    expect(programConfidence(parseEffectProgram(I("Target player mills ten cards.")))).toBe("low");
  });
});

describe("trigger follow-up fix — an unmodeled follow-up makes the WHOLE trigger route to Arbiter", () => {
  const C = (oracle) => ({ type: "Creature — Beast", name: "Probe", oracle });
  it("captures the follow-up into the effectClause", () => {
    const t = detectTriggers(C("Whenever this creature attacks, mill a card. If a land card was milled this way, you gain 2 life."));
    expect(t[0].effectClause).toMatch(/if a land card was milled this way/i); // follow-up appended
  });
  it("a clean single-sentence mill trigger is native; a mill-with-rider is body-only (no partial)", () => {
    expect(classifyCard(C("When this creature enters, mill three cards."))).toBe("native-trigger");
    expect(classifyCard(C("When this creature enters, mill a card. If a land card was milled this way, you gain 2 life."))).toBe("body-only");
    expect(classifyCard(C("When this creature enters, mill three cards. You may put a land card from among them into your hand."))).toBe("body-only");
    // A MANDATORY plain-imperative follow-up that back-references the milled cards (Patient
    // Naturalist) must also route to Arbiter — caught by the "among"/"milled cards" reference.
    expect(classifyCard(C("When this creature enters, mill four cards. Put a land card from among the milled cards into your hand."))).toBe("body-only");
  });
  it("the fix is atom-agnostic — a draw + unmodeled follow-up is body-only too", () => {
    expect(classifyCard(C("When this creature enters, draw a card. You may discard a card."))).toBe("body-only");
  });
  it("a SEPARATE activated ability is NOT treated as a follow-up (the trigger still routes)", () => {
    // The ETB mill routes; the {T} ability is residue → the CARD is body-only (composite), but the
    // trigger's effectClause is just the mill (the {T} line is not swallowed as a follow-up).
    const t = detectTriggers(C("When this creature enters, mill three cards.\n{T}: This creature deals 1 damage to any target."));
    expect(t[0].effectClause.trim()).toBe("mill three cards");
  });
});

describe("plain-imperative follow-up (no marker / no back-reference) — the dominant real shape", () => {
  const C = (oracle) => ({ type: "Creature — Beast", name: "Probe", oracle });
  it("captures a same-line plain-imperative second sentence into the effectClause", () => {
    // Shroudstomper: the rider is a bare imperative, no 'if/then/this way' marker.
    const t = detectTriggers(C("Whenever this creature enters, each opponent loses 2 life. You gain 2 life and draw a card."));
    expect(t[0].effectClause).toMatch(/you gain 2 life and draw a card/i);
  });
  it("a fully-modeled multi-sentence trigger fires its WHOLE effect (all atoms), not just the first", () => {
    const prog = parseEffectProgram(I("Each opponent loses 2 life. You gain 2 life and draw a card."));
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms.map((a) => a.op)).toEqual(["lose-life", "gain-life", "draw"]); // Shroudstomper, in full
  });
  it("an UNMODELED plain-imperative follow-up drops the WHOLE trigger to Arbiter (no partial)", () => {
    // Recon Craft Theta: makes a 0/0 token then a +1/+1 counter rider — firing only the token would
    // leave a 0/0 that dies to SBA. The whole trigger must route, not half-fire.
    expect(classifyCard(C("When this creature enters, create a 0/0 blue Alien creature token. Put a +1/+1 counter on it."))).toBe("body-only");
    // Voldaren Epicure: damage + an unmodeled Blood token.
    expect(classifyCard(C("When this creature enters, it deals 1 damage to each opponent. Create a Blood token."))).toBe("body-only");
  });
  it("a follow-up on a SEPARATE line is NOT absorbed (one ability per line)", () => {
    const t = detectTriggers(C("When this creature enters, draw a card.\nThis creature gets +1/+1 for each card in your hand."));
    expect(t[0].effectClause.trim()).toBe("draw a card"); // the next-line static is not swallowed
  });
  it("a SECOND same-line trigger is not swallowed into the first's effect", () => {
    const t = detectTriggers(C("When this creature enters, draw a card. Whenever this creature attacks, you gain 1 life."));
    expect(t[0].effectClause.trim()).toBe("draw a card");  // the 2nd trigger's gain-life is NOT absorbed
    expect(t[0].effectClause).not.toMatch(/gain 1 life/i); // (a safe under-fire if the 2nd isn't separately detected)
  });
});

describe("runtime — clean mill triggers fire; a rider trigger no-ops (safe)", () => {
  function board(perm, libCards) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, life: 20, battlefield: perm ? [perm] : [], library: libCards } } };
  }
  it("an ETB 'mill three cards' mills the caster's top 3", () => {
    let s = board(null, lib("A", "B", "C", "D"));
    s = resolveAll(flushTriggers(enterPermanent(s, { name: "Miller", type: "Creature — Beast", power: 1, toughness: 1, oracle: "When this creature enters, mill three cards." }, "user")));
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("Loafing Giant (mill + mandatory rider) no-ops — no mill, no life (no partial)", () => {
    const lg = createPermanent({ id: "lg", card: { name: "Loafing Giant", type: "Creature — Giant", power: 5, toughness: 5, oracle: "Whenever this creature attacks, mill a card. If a land card was milled this way, you gain 2 life." }, controller: "user", summoningSick: false });
    let s = board(lg, [land("l1", "Forest"), { id: "l2", name: "Top2", type: "Sorcery" }]);
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: lg, triggeringPermanent: lg });
    s = resolveAll(flushTriggers({ ...s, pendingTriggers: fired }));
    expect(s.players.user.graveyard).toHaveLength(0); // did NOT mill (whole trigger routed to Arbiter)
    expect(s.players.user.life).toBe(20);             // and did NOT gain life — no partial
  });
});

describe("mill spell resolution", () => {
  const MILL3 = { id: "c-m", name: "Mill", type: "Sorcery", mana: "{B}", oracle: "You mill three cards." };
  const MILLOPP = { id: "c-mo", name: "MillOpp", type: "Sorcery", mana: "{B}", oracle: "Each opponent mills two cards." };
  function bs(hand, userLib, aiLib = []) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand, library: userLib, manaPool: { C: 6, B: 3 } }, ai: { ...s.players.ai, library: aiLib } } };
  }
  const cast = (s, id) => { const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((x) => x.cardId === id); return resolveTopOfStack(dispatchAction(s, a)); };
  it("you mill 3 → top 3 to your graveyard; each opponent mills 2 → opponent only", () => {
    let s = cast(bs([MILL3], lib("A", "B", "C", "D")), "c-m");
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["a", "b", "c"]);
    s = cast(bs([MILLOPP], lib("U1"), lib("X", "Y", "Z")), "c-mo");
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["x", "y"]);
    expect(s.players.user.graveyard).toHaveLength(0);
  });
});
