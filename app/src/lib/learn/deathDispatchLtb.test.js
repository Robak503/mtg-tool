/**
 * DEATH-DISPATCH — planeswalker-death feed + LTB/PiG watcher triggers (the aristocrats death-trigger subsystem).
 *
 * Two runtime gaps closed (both were latent: the CARDS classified as having a trigger, but the trigger never
 * fired at runtime — a CREED FP in the live engine):
 *
 *  (1) PLANESWALKER-DIES (Cruel Celebrant) — "a creature OR PLANESWALKER you control dies" was rejected by the
 *      DEATH-DRAIN creature-only carve-out, AND a dead planeswalker was never fed to the dies dispatch. Now
 *      classifyCondition detects the creature-OR-planeswalker union → the creatureOrPwYouControl scope, and
 *      every PW-death site (combat, loyalty self-kill, spell damage, destroy spell) feeds the deadPw look-back
 *      to checkPlaneswalkerDiesTriggers.
 *
 *  (2) LTB / PiG WATCHER (Nadier's Nightblade, Marionette Apprentice/Master) — "a <filter> you control is put
 *      into a graveyard from the battlefield" / "a token you control leaves the battlefield" was UNDETECTED.
 *      checkLeavesTriggers now fires a watcher-scoped permanentLeaves event off the gameState leave-event
 *      look-back, gated by type / controller / token-ness / graveyard-ness.
 *
 * CREED — death dispatch is high-collateral: every test proves the trigger fires for the RIGHT event, exactly
 * once, and NOT on a wrong event (opponent's death, creature-only scope on a PW, a bounce on a PiG watcher, a
 * non-token on a token watcher, the source's own death on an "another" watcher).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkLeavesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, moveCardToZone, destroyZeroLoyaltyPlaneswalkers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, oracle, over = {}) => ({ id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...over });
const permObj = (card, controller, id, over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
function stateWith(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}

// ─── (1) PLANESWALKER-DIES ──────────────────────────────────────────────────────────────────────

describe("PW-DEATH — Cruel Celebrant detection + classification", () => {
  it("'creature or planeswalker you control dies' → creatureOrPwYouControl, native-trigger", () => {
    const card = { type: "Creature — Vampire", name: "Cruel Celebrant", mana: "{1}{B}", oracle: "Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life." };
    expect(detectTriggers(card).map((t) => t.scope)).toEqual(["creatureOrPwYouControl"]);
    expect(classifyCard(card)).toMatch(/^native/);
  });
});

describe("PW-DEATH — engine: a planeswalker death fires the creature-or-PW drain (CREED — right event, once)", () => {
  const cruelCard = creature("Cruel Celebrant", "Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life.", { type: "Creature — Vampire", id: "card-cc" });
  const walker = { id: "card-pw", name: "Test Walker", type: "Legendary Planeswalker — Test", oracle: "+1: Do nothing." };

  it("a PLANESWALKER you control dies → Cruel Celebrant drains, exactly once", () => {
    const state = placePerms(stateWith(), [permObj(cruelCard, "user", "perm-cc"), permObj(walker, "user", "perm-pw", { counters: { loyalty: 0 } })]);
    const sba = destroyZeroLoyaltyPlaneswalkers(state);
    expect(sba.dead.map((d) => d.id)).toEqual(["perm-pw"]);
    const next = checkPlaneswalkerDiesTriggers(sba.state, sba.dead);
    const fired = (next.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/each opponent loses 1 life/i); // W4: the clause is what the flush stage parses
  });

  it("CREED: an OPPONENT's planeswalker dying does NOT fire your Cruel Celebrant (controller gate)", () => {
    const state = placePerms(stateWith({ activePlayer: "ai1" }), [permObj(cruelCard, "user", "perm-cc"), permObj(walker, "ai1", "perm-pw", { counters: { loyalty: 0 } })]);
    const sba = destroyZeroLoyaltyPlaneswalkers(state);
    const next = checkPlaneswalkerDiesTriggers(sba.state, sba.dead);
    expect((next.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });

  it("CREED: a creature-ONLY drain (Bastion) does NOT fire on a planeswalker death (creature scope skips a PW)", () => {
    const bastion = { id: "card-bast", name: "Bastion of Remembrance", type: "Enchantment", oracle: "Whenever a creature you control dies, each opponent loses 1 life and you gain 1 life." };
    const state = placePerms(stateWith(), [permObj(bastion, "user", "perm-bast"), permObj(walker, "user", "perm-pw", { counters: { loyalty: 0 } })]);
    const sba = destroyZeroLoyaltyPlaneswalkers(state);
    const next = checkPlaneswalkerDiesTriggers(sba.state, sba.dead);
    expect((next.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });

  it("a CREATURE death ALSO fires Cruel Celebrant via the same creatureOrPwYouControl scope (creature half of the union)", () => {
    const state = placePerms(stateWith(), [permObj(cruelCard, "user", "perm-cc")]);
    const next = checkDiesTriggers(state, [{ id: "perm-x", controller: "user", name: "Bear", card: creature("Bear", "", { id: "card-bx" }), power: 2 }]);
    const fired = (next.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/each opponent loses 1 life/i); // W4: the clause is what the flush stage parses
  });
});

// ─── (2) LTB / PiG WATCHER ──────────────────────────────────────────────────────────────────────

describe("LTB/PiG — detection + classification", () => {
  it("Nadier's Nightblade ('a token you control leaves the battlefield') → tokenYouControlLeaves, native-trigger", () => {
    const card = { type: "Creature — Elf Warrior", name: "Nadier's Nightblade", mana: "{2}{B}", oracle: "Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life." };
    expect(detectTriggers(card).map((t) => t.scope)).toEqual(["tokenYouControlLeaves"]);
    expect(classifyCard(card)).toMatch(/^native/);
  });
  it("the creature-or-artifact PiG watcher ('another creature or artifact you control is put into a graveyard') is DETECTED", () => {
    // (Marionette Apprentice's full card ALSO carries Fabricate 1 — now a modeled ETB keyword (fabricate.js), so
    //  the FULL card flips native-trigger; see fabricate.test.js. This isolated-trigger card proves the LTB
    //  trigger itself is modeled independent of the keyword.)
    const card = { type: "Creature — Human Artificer", name: "MarApprentice", mana: "{2}{B}", oracle: "Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life." };
    expect(detectTriggers(card).map((t) => t.scope)).toEqual(["creatureOrArtifactYouControlPiG"]);
    expect(classifyCard(card)).toMatch(/^native/);
  });
  it("SELF-LTB now detects as leavesSelf (BLITZ LV-1 graduation — the engine fires it on ANY exit)", () => {
    // (City Pigeon sat here as the never-fires-LTB pin until LV-1 added the leavesSelf event, fired by
    // checkLeavesTriggers off the leave look-back for every exit — pinned end-to-end in leavesSelf.test.js.)
    const d = detectTriggers(creature("City Pigeon", "When this creature leaves the battlefield, create a Food token."));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "leavesSelf", scope: "self" });
  });
  it("CREED: an OPPONENT-controlled / un-scoped PiG stays UNDETECTED", () => {
    expect(detectTriggers(creature("X", "Whenever a creature an opponent controls is put into a graveyard from the battlefield, draw a card."))).toHaveLength(0);
    expect(detectTriggers(creature("Y", "Whenever a permanent you control leaves the battlefield, draw a card."))).toHaveLength(0);
  });
});

describe("LTB/PiG — engine: the watcher fires for the right exit (CREED — proves resolution)", () => {
  const nadier = creature("Nadier", "Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life.", { id: "card-nad", type: "Creature — Elf Warrior" });
  const marApp = creature("MarApp", "Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.", { id: "card-mar", type: "Creature — Human Artificer" });
  const servoTok = { id: "card-servo", name: "Servo", type: "Artifact Creature — Servo", token: true };
  const bauble = { id: "card-bauble", name: "Bauble", type: "Artifact" };

  function withWatchers(extra = []) {
    return placePerms(stateWith(), [permObj(nadier, "user", "perm-nad"), permObj(marApp, "user", "perm-mar"), ...extra]);
  }

  it("a CREATURE TOKEN → graveyard fires BOTH Nadier (token-leaves) and the creature/artifact PiG watcher", () => {
    let s = withWatchers([permObj(servoTok, "user", "perm-servo")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-servo" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.controller === "user")).toHaveLength(2);
  });

  it("a NONTOKEN artifact → graveyard fires the PiG watcher but NOT Nadier (not a token)", () => {
    let s = withWatchers([permObj(bauble, "user", "perm-bauble")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-bauble" });
    s = checkLeavesTriggers(s);
    const fired = (s.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/each opponent loses 1 life/i); // W4: the clause is what the flush stage parses
  });

  it("CREED: a token BOUNCED to hand fires Nadier (any leave) but NOT the PiG watcher (PiG requires a graveyard exit)", () => {
    let s = withWatchers([permObj(servoTok, "user", "perm-servo")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "perm-servo" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.controller === "user")).toHaveLength(1);
  });

  it("CREED: the 'another' PiG watcher does NOT fire on its OWN death (self-exclusion)", () => {
    // marApp is a creature; without the 'another' id-exclusion its own death would match the creature half.
    let s = withWatchers();
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-mar" });
    s = checkLeavesTriggers(s);
    // Only Nadier could care — but marApp is NOT a token, so neither fires. The point: marApp didn't self-fire.
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });

  it("CREED: an OPPONENT's token leaving does NOT fire your Nadier (controller gate)", () => {
    let s = withWatchers([permObj({ ...servoTok }, "ai1", "perm-servo-opp")]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-servo-opp" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
});
