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

  it("does NOT detect a SUBTYPE subject (Clue/Food/Treasure) nor a restriction — they route to the Arbiter", () => {
    expect(detectTriggers(card("x", "Tracker", "Creature", "Whenever you sacrifice a Clue, draw a card.")).some(d => d.event === "sacrifice")).toBe(false);
    expect(detectTriggers(card("x", "Y", "Creature", "Whenever you sacrifice a Treasure, you gain 1 life.")).some(d => d.event === "sacrifice")).toBe(false);
    // a trailing restriction ("…a creature you control") leaves residue past the anchor → undetected
    expect(detectTriggers(card("x", "Z", "Creature", "Whenever you sacrifice a creature you control, draw a card.")).some(d => d.event === "sacrifice")).toBe(false);
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
