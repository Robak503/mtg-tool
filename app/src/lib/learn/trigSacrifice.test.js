/**
 * TRIG-SACRIFICE — "Whenever you sacrifice a <permanent|creature|artifact>, <effect>." The sac'd thing is
 * always the controller's own, so the scope is an EXACT type-predicate on the sacrificed permanent (NOT a
 * scopeMatches scope): permanent=any, creature=isCreaturePerm, artifact=/Artifact/. Subtype subjects
 * (Clue/Food/Treasure) and restrictions stay UNDETECTED → Arbiter. Fired at the two sac chokepoints (the
 * effect/edict sac + the cost sac) for the sacrificing player's surviving watchers. "another" excludes the source.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkSacrificeTriggers } from "./triggers.js";
import { sacrificeCreatureEffect } from "./effects/effectAtoms.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (id, name, type, oracle) => ({ id, name, type, power: 1, toughness: 1, oracle });
const ABOM = () => card("card-abom", "Smothering Abomination", "Creature — Eldrazi", "Whenever you sacrifice a creature, draw a card.");
const GIXIAN = () => card("card-gix", "Gixian Infiltrator", "Creature — Phyrexian", "Whenever you sacrifice another permanent, put a +1/+1 counter on this creature.");
const GEARDRAKE = () => card("card-gear", "Gleaming Geardrake", "Artifact Creature — Drake", "Whenever you sacrifice an artifact, put a +1/+1 counter on this creature.");

const sacCreature = (id = "sac-c") => ({ id, controller: "user", card: { name: "Doomed Bear", type: "Creature — Bear" } });
const sacArtifact = (id = "sac-a") => ({ id, controller: "user", card: { name: "Trinket", type: "Artifact" } });

function board(userBf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf } } };
}
const watcher = (id, c) => createPermanent({ id, card: c, controller: "user", summoningSick: false });
const nFired = (s) => (s.pendingTriggers || []).length;

describe("TRIG-SACRIFICE — detection (scope mapping)", () => {
  it("maps the three type-checkable subjects, with the 'another' flag", () => {
    expect(detectTriggers(ABOM())[0]).toMatchObject({ event: "sacrifice", sacScope: "creature", sacAnother: false });
    expect(detectTriggers(GIXIAN())[0]).toMatchObject({ event: "sacrifice", sacScope: "permanent", sacAnother: true });
    expect(detectTriggers(GEARDRAKE())[0]).toMatchObject({ event: "sacrifice", sacScope: "artifact", sacAnother: false });
  });

  it("DOES detect a SUBTYPE subject (Clue/Treasure) as a sacSubtype scope (TRIG-SACRIFICE SUBTYPE slice)", () => {
    // The Treasure-economy slice added subtype sac scopes — "sacrifice a Clue/Treasure" now classifies with
    // sacSubtype (the sac'd permanent's type line is matched), so Graf Mole / Captain Lannery Storm flip native.
    expect(detectTriggers(card("x", "Tracker", "Creature", "Whenever you sacrifice a Clue, draw a card.")).find(d => d.event === "sacrifice")).toMatchObject({ sacSubtype: "Clue" });
    expect(detectTriggers(card("x", "Y", "Creature", "Whenever you sacrifice a Treasure, you gain 1 life.")).find(d => d.event === "sacrifice")).toMatchObject({ sacSubtype: "Treasure" });
  });
  it("does NOT detect a RESTRICTED subject ('a creature you control') — residue past the anchor → Arbiter", () => {
    // a trailing restriction leaves residue past the anchor → undetected (the engine can't scope it exactly)
    expect(detectTriggers(card("x", "Z", "Creature", "Whenever you sacrifice a creature you control, draw a card.")).some(d => d.event === "sacrifice")).toBe(false);
    // "a token" is NOT a sac SUBTYPE — it's the dedicated tokenChange event (denylisted in the subtype matcher)
    expect(detectTriggers(card("x", "T", "Creature", "Whenever you sacrifice a token, draw a card.")).some(d => d.event === "sacrifice")).toBe(false);
  });
});

describe("TRIG-SACRIFICE — scope correctness (the key false-positive guard)", () => {
  it("a CREATURE-scope watcher fires on a creature sac but NOT on an artifact sac", () => {
    const s = board([watcher("w", ABOM())]);
    expect(nFired(checkSacrificeTriggers(s, "user", sacCreature()))).toBe(1);
    expect(nFired(checkSacrificeTriggers(s, "user", sacArtifact()))).toBe(0); // creature-scope must NOT fire on an artifact
  });

  it("an ARTIFACT-scope watcher fires on an artifact sac but NOT on a creature sac", () => {
    const s = board([watcher("w", GEARDRAKE())]);
    expect(nFired(checkSacrificeTriggers(s, "user", sacArtifact()))).toBe(1);
    expect(nFired(checkSacrificeTriggers(s, "user", sacCreature()))).toBe(0); // artifact-scope must NOT fire on a creature
  });

  it("a PERMANENT-scope ('another') watcher fires on any sac, but 'another' excludes the source itself", () => {
    const s = board([watcher("gix", GIXIAN())]);
    expect(nFired(checkSacrificeTriggers(s, "user", sacCreature()))).toBe(1);   // any permanent
    expect(nFired(checkSacrificeTriggers(s, "user", sacArtifact()))).toBe(1);   // any permanent
    expect(nFired(checkSacrificeTriggers(s, "user", { id: "gix", controller: "user", card: GIXIAN() }))).toBe(0); // "another" excludes saccing itself
  });

  it("fires for the SACRIFICING player only — not on another player's sacrifice", () => {
    const s = board([watcher("w", ABOM())]);
    expect(nFired(checkSacrificeTriggers(s, "ai", sacCreature()))).toBe(0);
  });
});

/**
 * TRIG-SACRIFICE ANY-PLAYER (2026-07-24) — "Whenever A PLAYER sacrifices a <X>", the Mayhem Devil family (8
 * real corpus carriers: Mayhem Devil, Carmen/Mazirek/Zodiark/Thraximundar/Mortician Beetle/Fumulus/Merchant
 * of Venom). Contrast with the "fires for the SACRIFICING player only" test above — that pins the "you"
 * scope's exclusivity; these pin the opposite: an anyPlayerSac watcher fires on EVERY player's sacrifice,
 * including a player who doesn't control it.
 */
describe("TRIG-SACRIFICE ANY-PLAYER — detection", () => {
  it("maps 'a player sacrifices' to scope:anyPlayerSac, distinct from the you-scope", () => {
    const devil = card("card-devil", "Mayhem Devil", "Creature — Devil", "Whenever a player sacrifices a permanent, this creature deals 1 damage to any target.");
    expect(detectTriggers(devil).find(d => d.event === "sacrifice")).toMatchObject({ scope: "anyPlayerSac", sacScope: "permanent", sacAnother: false });
  });

  it("maps 'another' + a bare creature subject (Zodiark, Mazirek)", () => {
    const zodiark = card("card-zod", "Zodiark, Umbral God", "Legendary Creature — God", "Whenever a player sacrifices another creature, put a +1/+1 counter on Zodiark.");
    expect(detectTriggers(zodiark).find(d => d.event === "sacrifice")).toMatchObject({ scope: "anyPlayerSac", sacScope: "creature", sacAnother: true });
  });

  it("maps the 'nontoken' filter (Fumulus, the Infestation)", () => {
    const fumulus = card("card-fum", "Fumulus, the Infestation", "Legendary Creature — Vampire Insect", "Whenever a player sacrifices a nontoken creature, create a 1/1 black Insect creature token with flying.");
    expect(detectTriggers(fumulus).find(d => d.event === "sacrifice")).toMatchObject({ scope: "anyPlayerSac", sacScope: "creature", nontokenFilter: true });
  });
});

describe("TRIG-SACRIFICE ANY-PLAYER — scope correctness (the key new behavior)", () => {
  const MAYHEM = () => card("card-devil", "Mayhem Devil", "Creature — Devil", "Whenever a player sacrifices a permanent, this creature deals 1 damage to any target.");

  it("fires when a DIFFERENT player sacrifices — the opposite of the you-scope exclusivity above", () => {
    const s = board([watcher("w", MAYHEM())]);
    expect(nFired(checkSacrificeTriggers(s, "ai", sacCreature()))).toBe(1);
    expect(nFired(checkSacrificeTriggers(s, "user", sacCreature()))).toBe(1); // also fires on its own controller's sac
  });

  it("'another' excludes the source seeing its own sacrifice, same as the you-scope's GIXIAN case above", () => {
    // Zodiark's own text uses "another creature" (unlike Mayhem Devil's bare "a permanent"), so sacAnother's
    // id-check applies here regardless of board state — mirrors the GIXIAN "another" test's exact structure.
    const zodiark = () => card("card-zod", "Zodiark, Umbral God", "Legendary Creature — God", "Whenever a player sacrifices another creature, put a +1/+1 counter on Zodiark.");
    const s = board([watcher("card-zod", zodiark())]);
    expect(nFired(checkSacrificeTriggers(s, "user", sacCreature()))).toBe(1); // a different creature
    expect(nFired(checkSacrificeTriggers(s, "user", { id: "card-zod", controller: "user", card: zodiark() }))).toBe(0); // "another" excludes saccing itself
  });

  it("the nontoken filter excludes a token sacrifice but allows a nontoken one", () => {
    const fumulus = () => card("card-fum", "Fumulus, the Infestation", "Legendary Creature — Vampire Insect", "Whenever a player sacrifices a nontoken creature, create a 1/1 black Insect creature token with flying.");
    const s = board([watcher("w", fumulus())]);
    const tokenCreature = { id: "sac-tok", controller: "ai", card: { name: "Squirrel", type: "Token Creature — Squirrel", token: true } };
    expect(nFired(checkSacrificeTriggers(s, "ai", sacCreature()))).toBe(1); // nontoken creature
    expect(nFired(checkSacrificeTriggers(s, "ai", tokenCreature))).toBe(0); // token creature — filtered out
  });
});

describe("TRIG-SACRIFICE — end to end through the effect/edict sac site", () => {
  it("sacrificing a creature with a Smothering Abomination out draws a card (the sacrifice trigger fires + resolves)", () => {
    const victim = watcher("victim", card("card-victim", "Doomed Traveler", "Creature — Human", ""));
    let s = board([watcher("w", ABOM()), victim]);
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, battlefield: [watcher("w", ABOM()), victim], library: [{ id: "lib-1", name: "Card", type: "Instant" }] } } };
    s = sacrificeCreatureEffect(s, "user", "victim"); // the edict/effect sac path
    expect(s.players.user.battlefield.some(p => p.id === "victim")).toBe(false); // sacrificed
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.hand.map(c => c.id)).toContain("lib-1"); // Abomination drew
  });
});

const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
