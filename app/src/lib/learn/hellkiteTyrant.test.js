/**
 * hellkiteTyrant.test.js — the play-weighted program, #745 Hellkite Tyrant.
 *
 *   "Flying, trample
 *    Whenever this creature deals combat damage to a player, gain control of all artifacts that player controls.
 *    At the beginning of your upkeep, if you control twenty or more artifacts, you win the game."
 *
 * The combat-damage trigger was detected; its effect was not read. On the combat-damage-to-a-player event, detectTriggers now
 * rewrites "gain control of all artifacts that player controls" to the sentinel "… the damaged player controls" (the referent the
 * event binds, ctx.damagedPlayerId), and control.js reads it as a MASS indefinite control change: every permanent that player
 * controls that is an artifact as it resolves (the set is fixed then, CR 611.2c; the type as it is now, the layers' read) moves to
 * the trigger's controller through the one control move (controlMove.moveControl — it never leaves the battlefield, keeps its
 * counters, tapped state and attachments; an artifact creature is summoning-sick under its new controller, CR 302.6). An
 * Equipment taken stays on the creature it equips: control of the two is separate (CR 301.5d), and only its new controller can
 * activate its equip ability. The upkeep win was already read (CR 603.4 — checked at the trigger and on resolution).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The combat runs resolveCombatDamage on a four-seat commander pod; passPriority resolves the trigger.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { passPriority } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const TYRANT = {"name":"Hellkite Tyrant","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"5","keywords":["Flying","Trample"],"colors":["R"],"oracle":"Flying, trample\nWhenever this creature deals combat damage to a player, gain control of all artifacts that player controls.\nAt the beginning of your upkeep, if you control twenty or more artifacts, you win the game."}; // body-only #745
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const DYNAMO = {"name":"Thran Dynamo","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}{C}."}; // native-mana
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"}; // native-body
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const CITADEL = {"name":"Darksteel Citadel","type":"Artifact Land","mana":"","cmc":0,"keywords":["Indestructible"],"colors":[],"oracle":"Indestructible\n{T}: Add {C}."}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", token: true, oracle: "{T}, Sacrifice this artifact: Add one mana of any color." };

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

/** A four-seat commander pod (user, ai1, ai2, ai3), the user attacking ai1 with Hellkite Tyrant, unblocked. */
function pod({ user = [], ai1 = [], ai2 = [], attackers = ["tyrant"], defender = "ai1" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 40 };
  players.user = { ...players.user, battlefield: user };
  players.ai1 = { ...players.ai1, battlefield: ai1 };
  players.ai2 = { ...players.ai2, battlefield: ai2 };
  return { ...s0, players, turn: 6, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender })), blockers: [] } };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 100) s = passPriority(s);
  return s;
}
const controllerOf = (s, id) => Object.keys(s.players).find((pid) => s.players[pid].battlefield.some((p) => p.id === id)) ?? null;
const permOf = (s, id) => s.players[controllerOf(s, id)]?.battlefield.find((p) => p.id === id);

describe("detection + classification", () => {
  it("the combat-damage trigger reads the damaged player's artifacts and routes natively; the card classifies native", () => {
    const d = detectTriggers(TYRANT).find((x) => x.event === "combatDamageToPlayer");
    expect(d.effectClause).toBe("gain control of all artifacts the damaged player controls");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(isNativeTier(classifyCard(TYRANT))).toBe(true);
  });

  it("CREED — the mass control sentinel is not read off any other event (\"that player\" names no damaged player there)", () => {
    const d = detectTriggers({ name: "Probe", type: "Creature — Dragon", oracle: "Whenever this creature attacks, gain control of all artifacts that player controls." });
    expect(d.every((x) => !/the damaged player/.test(x.effectClause || ""))).toBe(true);
    expect(d.every((x) => !triggerRoutesNatively(x))).toBe(true);
  });
});

describe("RUNTIME — the theft", () => {
  it("⭐ connecting with ai1: the user takes every artifact ai1 controls — Sol Ring, Ornithopter, the Treasure, the artifact land and the Equipment — and nothing else", () => {
    let s = pod({
      user: [P("tyrant", TYRANT, "user")],
      ai1: [P("ring", SOL_RING, "ai1"), P("thopter", ORNITHOPTER, "ai1"), P("tre", TREASURE, "ai1"), P("cit", CITADEL, "ai1"), P("bear", BEARS, "ai1"), P("bone", BONESPLITTER, "ai1", { attachedTo: "bear" })],
      ai2: [P("dyn", DYNAMO, "ai2")],
    });
    s = resolveCombatDamage(s);
    expect(s.players.ai1.life).toBe(34);
    s = resolveStack(s);
    for (const id of ["ring", "thopter", "tre", "cit", "bone"]) expect([id, controllerOf(s, id)]).toEqual([id, "user"]);
    expect(controllerOf(s, "bear")).toBe("ai1");
    expect(controllerOf(s, "dyn")).toBe("ai2");
  });

  it("a taken artifact creature is summoning-sick under its new controller (CR 302.6)", () => {
    let s = pod({ user: [P("tyrant", TYRANT, "user")], ai1: [P("thopter", ORNITHOPTER, "ai1")] });
    s = resolveStack(resolveCombatDamage(s));
    expect(permOf(s, "thopter").summoningSick).toBe(true);
  });

  it("the Equipment taken stays on ai1's Grizzly Bears (CR 301.5d) and still pumps it; only the user may now pay its equip", () => {
    let s = pod({ user: [P("tyrant", TYRANT, "user"), P("m1", MOUNTAIN, "user")], ai1: [P("bear", BEARS, "ai1"), P("bone", BONESPLITTER, "ai1", { attachedTo: "bear" })] });
    s = resolveStack(resolveCombatDamage(s));
    expect(controllerOf(s, "bone")).toBe("user");
    expect(permOf(s, "bone").attachedTo).toBe("bear");
    expect(permanentPower(s, "bear")).toBe(4);
    const main = { ...s, phase: "postcombat-main", step: "main", combat: null, priorityHolder: "user" };
    expect(legalActionsForPlayer(main, "user").some((a) => a.kind === "activate-ability" && a.permanentId === "bone" && a.isEquipAbility)).toBe(true);
    expect(legalActionsForPlayer({ ...main, activePlayer: "ai1", priorityHolder: "ai1" }, "ai1").some((a) => a.permanentId === "bone")).toBe(false);
  });

  it("control — no combat damage to a player, no theft (Hellkite Tyrant doesn't attack)", () => {
    let s = pod({ user: [P("tyrant", TYRANT, "user"), P("bear-u", BEARS, "user")], ai1: [P("ring", SOL_RING, "ai1")], attackers: ["bear-u"] });
    s = resolveStack(resolveCombatDamage(s));
    expect(controllerOf(s, "ring")).toBe("ai1");
  });
});

describe("RUNTIME — the upkeep win (already modeled; pinned here)", () => {
  const upkeep = (n) => {
    const arts = Array.from({ length: n }, (_, i) => P(`a${i}`, SOL_RING, "user"));
    const s = pod({ user: [P("tyrant", TYRANT, "user"), ...arts], attackers: [] });
    return { ...s, phase: "beginning", step: "upkeep", combat: null };
  };
  it("twenty artifacts at the beginning of the upkeep → the user wins the game", () => {
    const s = resolveStack(checkStepTriggers(upkeep(20), "upkeep"));
    expect(s.players.user.wonGame).toBe(true);
  });
  it("nineteen → nothing (the condition fails as the trigger is put on the stack)", () => {
    const s = resolveStack(checkStepTriggers(upkeep(19), "upkeep"));
    expect(s.players.user.wonGame).toBeFalsy();
  });
});
