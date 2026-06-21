/**
 * DEATH-DRAIN — the aristocrats compound self-subject dies-trigger + the "each other player" death-edict.
 *
 * "Whenever this creature or another creature [you control] dies, …" is the UNION { self } ∪ { other creatures
 * [you control] } = EXACTLY the bare "a creature [you control] dies" event (CR 603.6e). The general "or
 * another" guard routed it to the Arbiter (a partial-fire risk in the open case); the carve-out recognizes the
 * clean creature-only union and maps it to the same scope+effect path Bastion of Remembrance / Dictate of
 * Erebos already resolve (Zulaport Cutthroat, Butcher of Malakir, Warteye Witch). Plus "each other player
 * sacrifices a creature" ≡ "each opponent sacrifices" (Grave Pact / Butcher death-edict).
 *
 * CREED — deferred to a follow-up slice, must stay LOW: an extra subject type ("or planeswalker" — Cruel
 * Celebrant), a TARGETED drain ("target player loses N life" — Blood Artist), or a non-dies wording ("is put
 * into a graveyard" — Marionette). Never a partial fire.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, oracle, over = {}) => ({ id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...over });
const permObj = (card, controller, id) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
function stateWith(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}

describe("DEATH-DRAIN — the compound self-subject is the creature union", () => {
  const dies = (oracle, name = "Drainer") => detectTriggers(creature(name, oracle)).find((t) => t.event === "dies");
  it("'this creature or another creature you control dies' → creatureYouControl", () => {
    expect(dies("Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.")).toMatchObject({ event: "dies", scope: "creatureYouControl" });
  });
  it("'this creature or another creature dies' (no controller restriction) → eachCreature", () => {
    expect(dies("Whenever this creature or another creature dies, you gain 1 life.")).toMatchObject({ event: "dies", scope: "eachCreature" });
  });
  it("'<name> or another creature you control dies' → creatureYouControl", () => {
    expect(dies("Whenever Butcher or another creature you control dies, each opponent sacrifices a creature of their choice.", "Butcher")).toMatchObject({ event: "dies", scope: "creatureYouControl" });
  });
  it("CREED: an extra subject type ('or planeswalker') stays UNDETECTED → Arbiter", () => {
    expect(dies("Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life.")).toBeUndefined();
  });
  it("CREED: a mixed-type union ('or another artifact') stays UNDETECTED", () => {
    expect(dies("Whenever this creature or another artifact you control dies, each opponent loses 1 life.")).toBeUndefined();
  });
});

describe("DEATH-DRAIN — 'each other player sacrifices' edict ≡ each opponent", () => {
  it("parses to the eachOpponent sacrifice (the death-edict)", () => {
    expect(parseEffectClause("each other player sacrifices a creature of their choice").atoms).toEqual([{ op: "sacrifice", who: "eachOpponent", what: "creature" }]);
  });
  it("the existing 'each opponent sacrifices' is unchanged", () => {
    expect(parseEffectClause("each opponent sacrifices a creature of their choice").atoms).toEqual([{ op: "sacrifice", who: "eachOpponent", what: "creature" }]);
  });
});

describe("DEATH-DRAIN — coverage flips (synthetic cards, real oracle text)", () => {
  it("compound-subject drains classify native", () => {
    expect(classifyCard({ type: "Creature — Human Rogue Ally", name: "Zulaport Cutthroat", mana: "{1}{B}", oracle: "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life." })).toMatch(/^native/);
    expect(classifyCard({ type: "Creature — Human Cleric", name: "Butcher of Malakir", mana: "{6}{B}{B}", oracle: "Flying\nWhenever Butcher of Malakir or another creature you control dies, each opponent sacrifices a creature of their choice." })).toMatch(/^native/);
  });
  it("the each-other-player death-edict flips native (Grave Pact)", () => {
    expect(classifyCard({ type: "Enchantment", name: "Grave Pact", mana: "{1}{B}{B}", oracle: "Whenever a creature you control dies, each other player sacrifices a creature of their choice." })).toMatch(/^native/);
  });
  it("CREED — the targeted-drain (Blood Artist) and 'or planeswalker' (Cruel Celebrant) stay body-only (follow-up slices)", () => {
    expect(classifyCard({ type: "Creature — Vampire", name: "Blood Artist", mana: "{1}{B}", oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Vampire", name: "Cruel Celebrant", mana: "{1}{B}", oracle: "Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life." })).toBe("body-only");
  });
});

describe("DEATH-DRAIN — engine: the union scope fires correctly (CREED — proves resolution, not just classification)", () => {
  it("a controller-scoped drain (Zulaport) fires when a creature YOU control dies — and NOT when an opponent's does", () => {
    const zula = creature("Zulaport Cutthroat", "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.", { id: "card-z" });
    const state = placePerms(stateWith(), [permObj(zula, "user", "perm-z")]);
    // a different creature YOU control dies → the watcher fires
    const onMine = checkDiesTriggers(state, [{ id: "perm-x", controller: "user", name: "Bear", card: creature("Bear", "", { id: "card-b1" }) }]);
    const drain = (onMine.pendingTriggers || []).find((t) => t.controller === "user");
    expect(drain).toBeTruthy();
    expect(drain.payload.params.effect).toMatchObject({ kind: "loseLife", who: "eachOpponent", amount: 1 });
    // a creature an OPPONENT controls dies → the controller-scoped watcher does NOT fire
    const onTheirs = checkDiesTriggers(state, [{ id: "perm-y", controller: "ai1", name: "Bear", card: creature("Bear", "", { id: "card-b2" }) }]);
    expect((onTheirs.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("an uncontrolled union (eachCreature) fires on ANY creature's death", () => {
    const watcher = creature("Falkenrath", "Whenever this creature or another creature dies, you gain 1 life.", { id: "card-f" });
    const state = placePerms(stateWith(), [permObj(watcher, "user", "perm-f")]);
    const onTheirs = checkDiesTriggers(state, [{ id: "perm-y", controller: "ai1", name: "Bear", card: creature("Bear", "", { id: "card-b3" }) }]);
    const fired = (onTheirs.pendingTriggers || []).find((t) => t.controller === "user");
    expect(fired).toBeTruthy();
    expect(fired.payload.params.effect).toMatchObject({ kind: "gainLife", who: "controller" });
  });
});
