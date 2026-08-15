/**
 * kodama.test.js — the MODIFIED combat-damage watcher (Kodama of the West Tree, SHELF-TAIL W3 — CR 700.9).
 *
 * "Whenever a MODIFIED creature you control deals combat damage to a player, search your library for a
 * basic land card, put it onto the battlefield tapped, then shuffle." The subject qualifier becomes a
 * pre-switch scopeMatches gate (requiresModified) delegating to layers.isModifiedPermanent — the SAME
 * one-place CR 700.9 definition the modified-anthem selector already uses ("has one or more counters, is
 * equipped, or is enchanted by an Aura its controller controls"), so the watcher and Kodama's own
 * "Modified creatures you control have trample" grant can never disagree. The fetch payoff already parsed
 * HIGH (tutor → battlefield tapped); this slice is the subject arm + the gate. Flips Kodama (Wolverine +
 * Thrun, cross-deck) AND SP//dr, Piloted by Peni (the same watcher wording, a draw payoff — whole-card
 * audited: Vigilance + a targeted-counter ETB + this watcher, all three modeled).
 *
 * Mutation-checked: disabling the detect arm kills the route/tier pins; `false &&` on the scopeMatches
 * requiresModified gate kills "an UNMODIFIED attacker must NOT fire" — the over-fire direction, the gate's
 * whole job (and an unlisted descriptor field fails the same test, so the registration is covered too).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, triggersForEvent } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KODAMA = {
  name: "Kodama of the West Tree", type: "Legendary Creature — Spirit", mana: "{2}{G}", power: 3, toughness: 3,
  oracle: "Reach\nModified creatures you control have trample. (Equipment, Auras you control, and counters are modifications.)\nWhenever a modified creature you control deals combat damage to a player, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
};

const perm = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, controller, card }), ...extra });
const kodamaPerm = () => perm("kod", { id: "c-kod", name: KODAMA.name, type: KODAMA.type, oracle: KODAMA.oracle });
const attacker = (extra = {}) => perm("atk", { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, "user", extra);
function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const kodamaFires = (state, trig) =>
  triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: state.players.user.battlefield.find((p) => p.id === "kod"), triggeringPermanent: trig }).length;

describe("Kodama — detection + routing + the whole-card flip", () => {
  it("MUST STAY ROUTED: the modified watcher detects with requiresModified and routes; the card is native-mixed", () => {
    const ds = detectTriggers(KODAMA);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "creatureYouControl", requiresModified: true });
    expect(triggerRoutesNatively(ds[0])).toBe(true);
    expect(classifyCard(KODAMA)).toBe("native-mixed"); // the trample grant (modified-anthem lane) + this watcher
  });
  it("RIDER (whole-card audited): SP//dr's same-wording watcher routes with its draw payoff", () => {
    const spdr = { name: "SP//dr, Piloted by Peni", type: "Legendary Artifact Creature — Spider Hero", power: 4, toughness: 4,
      oracle: "Vigilance\nWhen SP//dr enters, put a +1/+1 counter on target creature.\nWhenever a modified creature you control deals combat damage to a player, draw a card." };
    const ds = detectTriggers(spdr);
    expect(ds.some((d) => d.requiresModified && d.effectClause === "draw a card")).toBe(true);
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
  });
  it("CREED near-misses: no 'you control' / the batch form stay undetected", () => {
    expect(detectTriggers({ name: "Wide", type: "Creature — Spirit", oracle: "Whenever a modified creature deals combat damage to a player, draw a card." })).toHaveLength(0);
    expect(detectTriggers({ name: "Batch", type: "Creature — Spirit", oracle: "Whenever one or more modified creatures you control deal combat damage to a player, draw a card." })).toHaveLength(0);
  });
});

describe("Kodama — the requiresModified gate (CR 700.9, all three clauses + the controller carve)", () => {
  it("a counter makes it fire; bare makes it NOT fire (the over-fire guard — mutation-check line)", () => {
    const withCounter = attacker({ counters: { "+1/+1": 1 } });
    expect(kodamaFires(stateWith([kodamaPerm(), withCounter]), withCounter)).toBe(1);
    const bare = attacker();
    expect(kodamaFires(stateWith([kodamaPerm(), bare]), bare)).toBe(0);
  });
  it("equipped fires — ANY controller's Equipment (CR 301.5b has no controller clause)", () => {
    const atk = attacker();
    const enemySword = perm("sw", { id: "c-sw", name: "Sword", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1." }, "ai", { attachedTo: "atk" });
    const s = { ...stateWith([kodamaPerm(), atk], [enemySword]) };
    expect(kodamaFires(s, atk)).toBe(1);
  });
  it("an Aura counts ONLY when the creature's own controller controls it (the CR 700.9 carve)", () => {
    const atk = attacker();
    const ownAura = perm("au", { id: "c-au", name: "Growth", type: "Enchantment — Aura", oracle: "Enchanted creature gets +1/+1." }, "user", { attachedTo: "atk" });
    expect(kodamaFires(stateWith([kodamaPerm(), atk, ownAura]), atk)).toBe(1);
    const atk2 = attacker();
    const enemyAura = perm("pa", { id: "c-pa", name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchanted creature can't attack or block." }, "ai", { attachedTo: "atk" });
    expect(kodamaFires(stateWith([kodamaPerm(), atk2], [enemyAura]), atk2)).toBe(0); // an opponent's Pacifism does NOT modify
  });
  it("an OPPONENT's modified creature never fires the you-control scope", () => {
    const theirs = perm("thr", { id: "c-thr", name: "Theirs", type: "Creature — Bear", power: 2, toughness: 2 }, "ai", { counters: { "+1/+1": 2 } });
    expect(kodamaFires(stateWith([kodamaPerm()], [theirs]), theirs)).toBe(0);
  });
});
