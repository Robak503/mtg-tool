/**
 * TOKEN ETB (Dex, real-deck lane) — a CREATED token ENTERS (CR 603.6a), so it fires "enters" triggers:
 * every watcher (Soul Warden, Impact Tremors, Cathars' Crusade) AND the subtype-ETB scopes (Pantlaza off
 * a created Dinosaur token). applyCreateToken previously minted tokens WITHOUT firing checkEnterTriggers,
 * so token creation silently bypassed every creature-ETB trigger — a core gap (issue #345).
 *
 * Fired per token, BEFORE the lethal SBA (the token entered before a 0/0 dies). Loop-safe: no real card
 * loops, and the session 1000-tick cap backstops any pathological case; checkEnterTriggers only enqueues.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "./effects/effectAtoms.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function stateWith(battlefield, over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield, life: 40 }, ai: { ...s.players.ai, battlefield: over.aiBf || [], life: 40 } } };
}
function resolveAll(s) { let g = 0; s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; }
const watcher = (id, oracle, controller = "user", type = "Creature — Human") => createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: 1, toughness: 1, oracle }, controller, summoningSick: false });
const makeToken = (s, over = {}) => resolveAtom(s, { op: "create-token", descriptor: over.descriptor || "white soldier", power: over.power ?? "1", toughness: over.toughness ?? "1", count: over.count ?? 1 }, { controller: over.controller || "user", targets: [] });
const makeNamed = (s, over = {}) => resolveAtom(s, { op: "create-named-token", token: over.token || "treasure", count: over.count ?? 1 }, { controller: over.controller || "user", targets: [] });

describe("TOKEN ETB fires creature-enters triggers", () => {
  it("Soul Warden gains 1 per created token (fires per token)", () => {
    let s = stateWith([watcher("sw", "Whenever a creature you control enters, you gain 1 life.")]);
    s = resolveAll(makeToken(s, { count: 3 }));
    expect(s.players.user.life).toBe(43); // 3 tokens → 3 life
  });

  it("a 0/0 token still fires its ETB before dying to the lethal SBA (ordering)", () => {
    // Impact-Tremors-style: damage each opponent when a creature enters. A 0/0 token enters (triggers),
    // then dies to the SBA — but the trigger already fired.
    let s = stateWith([watcher("it", "Whenever a creature you control enters, this creature deals 1 damage to each opponent.")]);
    s = resolveAll(makeToken(s, { power: "0", toughness: "0", count: 1 }));
    expect(s.players.ai.life).toBe(39);                                          // ETB fired (1 dmg) despite the 0/0 dying
    expect(s.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(0); // the 0/0 token died to the SBA
  });

  it("the subtype-ETB scope fires off a created token of that subtype (Pantlaza-form watcher)", () => {
    // The modeled subtype-ETB shape is "NAME or another SUBTYPE you control enters" (the Pantlaza carve-out;
    // plain "a Dinosaur you control enters" is a separate, deferred gap). A created Dinosaur token matches
    // the subtypeYouControl scope, so the watcher fires now that token-ETB is enqueued.
    const raptorLord = createPermanent({ id: "rl", card: { id: "c-rl", name: "Raptor Lord", type: "Legendary Creature — Dinosaur", power: 2, toughness: 2, oracle: "Whenever Raptor Lord or another Dinosaur you control enters, you gain 2 life." }, controller: "user", summoningSick: false });
    let s = stateWith([raptorLord]);
    s = resolveAll(makeToken(s, { descriptor: "green dinosaur", power: "3", toughness: "3", count: 1 }));
    expect(s.players.user.life).toBe(42); // the Dinosaur token triggered the subtype-ETB watcher
  });

  it("an opponent's token does NOT fire my 'creature you control' watcher (controller-gated)", () => {
    let s = stateWith([watcher("sw", "Whenever a creature you control enters, you gain 1 life.")]);
    s = resolveAll(makeToken(s, { controller: "ai", count: 2 })); // AI makes 2 tokens
    expect(s.players.user.life).toBe(40); // my Soul Warden doesn't fire off the opponent's tokens
  });

  it("a LIVING WEAPON Germ token fires creature-ETB watchers too (enterPermanent path)", () => {
    // A living-weapon equipment makes a 0/0 Germ token on entry; the Germ ENTERED, so it fires watchers.
    let s = stateWith([watcher("sw", "Whenever a creature you control enters, you gain 1 life.")]);
    const lwEquip = { id: "lw", name: "Batterskull-ish", type: "Artifact — Equipment", oracle: "Living weapon", mana: "{5}" };
    s = enterPermanent(s, lwEquip, "user"); // equipment enters → mints + attaches the Germ
    s = resolveAll(s);
    expect(s.players.user.life).toBe(41); // the Germ token triggered Soul Warden (was 0 before the fix)
  });
});

// MTG-002 — a created token ENTERS (CR 603.6a), so it fires artifact-ETB watchers ("whenever an artifact you
// control enters" — Reckless Fireweaver) the same way the canonical enterPermanent path does. This covers
// BOTH the named artifact tokens (Treasure/Clue/Food/Gold) and an artifact-creature token (Servo/Thopter).
// The artifact-ETB effect here is the Fireweaver shape: 1 damage to each opponent per artifact entering.
describe("TOKEN ETB fires artifact-enters triggers (MTG-002)", () => {
  const fireweaver = (id = "fw") =>
    watcher(id, "Whenever an artifact you control enters, this creature deals 1 damage to each opponent.", "user", "Creature — Human Artificer");

  it("a created Treasure token fires an artifact-ETB watcher (1 damage to each opponent)", () => {
    let s = stateWith([fireweaver()]);
    s = resolveAll(makeNamed(s, { token: "treasure", count: 1 }));
    expect(s.players.ai.life).toBe(39); // the Treasure (an artifact) entered → Fireweaver fired once
  });

  it("multiple named tokens produce the correct number of trigger events (3 Clues → 3 fires)", () => {
    let s = stateWith([fireweaver()]);
    s = resolveAll(makeNamed(s, { token: "clue", count: 3 }));
    expect(s.players.ai.life).toBe(37); // 3 artifact ETBs → 3 damage
  });

  it("an artifact-CREATURE token fires the artifact-ETB watcher too (create-token path)", () => {
    // "colorless thopter artifact" mints a "Token Artifact Creature — Thopter"; its type-line contains
    // "Artifact", so it matches the artifactYouControl scope (CR 205.2 substring) — the gap applyCreateToken
    // had before (it fired creature-ETB only). One token → one artifact-ETB fire.
    let s = stateWith([fireweaver()]);
    s = resolveAll(makeToken(s, { descriptor: "colorless thopter artifact", power: "1", toughness: "1", count: 1 }));
    expect(s.players.ai.life).toBe(39);
  });

  it("a PLAIN creature token does NOT fire the artifact-ETB watcher (no over-fire)", () => {
    let s = stateWith([fireweaver()]);
    s = resolveAll(makeToken(s, { descriptor: "white soldier", power: "1", toughness: "1", count: 2 }));
    expect(s.players.ai.life).toBe(40); // soldiers aren't artifacts → the artifact watcher stays silent
  });

  it("a named artifact token does NOT fire a creature-ETB watcher (Soul Warden — scope gate)", () => {
    let s = stateWith([watcher("sw", "Whenever a creature you control enters, you gain 1 life.")]);
    s = resolveAll(makeNamed(s, { token: "treasure", count: 2 }));
    expect(s.players.user.life).toBe(40); // a Treasure is not a creature → no creature-ETB fire (no FP)
  });

  it("an opponent's Treasure does NOT fire MY artifact-ETB watcher (controller-gated)", () => {
    let s = stateWith([fireweaver()]);
    s = resolveAll(makeNamed(s, { token: "treasure", count: 1, controller: "ai" }));
    expect(s.players.ai.life).toBe(40); // my Fireweaver doesn't fire off the opponent's artifact
  });
});
