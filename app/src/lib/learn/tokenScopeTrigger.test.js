/**
 * tokenScopeTrigger.test.js — the "a CREATURE TOKEN you control" trigger scope (CR 111.1):
 * Curiosity Crafter #1734 · Anointer Priest #11214.
 *
 * The NONTOKEN side of this qualifier has been modeled for a long time (Grim Haruspex, Guardian
 * Project, Soul of the Harvest, the whole "another nontoken creature you control" family). This is the
 * same word read the other way, and it deliberately gets its OWN flag rather than a negated one: a
 * descriptor carrying NEITHER must keep firing on both kinds, which is every unqualified "a creature
 * you control enters" on the board. One boolean can't express three states.
 *
 * ⚠️ THE COMBAT-DAMAGE SITE HAD A SUBSTRING TRAP. The bare form is detected with a plain
 * `/a creature you control/` substring test, which happily matches inside "a creature TOKEN you
 * control" — so without carving the token form out FIRST, Curiosity Crafter would have detected as the
 * unqualified trigger and drawn a card off every creature that connected. Over-fire, on a card that
 * classifies native either way. The carve-out is anchored and ordered ahead of it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANOINTER = { id: "c-ap", name: "Anointer Priest", type: "Creature — Human Cleric", mana: "{2}{W}", power: 1, toughness: 4, keywords: [],
  oracle: "Whenever a creature token you control enters, you gain 1 life." };
const CRAFTER = { id: "c-cc", name: "Curiosity Crafter", type: "Creature — Bird Wizard", mana: "{2}{U}{U}", power: 2, toughness: 4, keywords: ["Flying"],
  oracle: "Flying\nWhenever a creature token you control deals combat damage to a player, draw a card." };
const NONTOKEN_TWIN = { ...ANOINTER, id: "c-nt", name: "Nontoken Priest",
  oracle: "Whenever a nontoken creature you control enters, you gain 1 life." };
const UNQUALIFIED = { ...ANOINTER, id: "c-uq", name: "Plain Priest",
  oracle: "Whenever a creature you control enters, you gain 1 life." };

const REAL = { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const TOKEN = { id: "c-tok", name: "Soldier", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true };

/** Enter `card` under the user alongside `watcher`; count enqueued triggers. */
function entering(watcher, card) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const w = createPermanent({ id: "w", card: watcher, controller: "user", summoningSick: false });
  const perm = createPermanent({ id: "in", card, controller: "user" });
  const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [w, perm] } } };
  return (checkEnterTriggers(board, perm).pendingTriggers || []).length;
}

describe("detection — three states, not two", () => {
  it("the token form carries tokenFilter; the nontoken twin carries nontokenFilter", () => {
    expect(detectTriggers(ANOINTER)[0]).toMatchObject({ event: "etb", scope: "creatureYouControl", tokenFilter: true });
    expect(detectTriggers(NONTOKEN_TWIN)[0]).toMatchObject({ event: "etb", scope: "creatureYouControl", nontokenFilter: true });
  });

  it("THE THIRD STATE — the unqualified form carries NEITHER flag", () => {
    // This is why the two can't be one boolean: an unqualified trigger must fire on both kinds.
    const d = detectTriggers(UNQUALIFIED)[0];
    expect(d.tokenFilter).toBeUndefined();
    expect(d.nontokenFilter).toBeUndefined();
  });

  it("THE SUBSTRING TRAP — the combat-damage form keeps its qualifier", () => {
    // The bare combat-damage detection is a plain /a creature you control/ SUBSTRING test, which matches
    // inside "a creature token you control". Detected as the bare form, Curiosity Crafter draws off every
    // creature that connects.
    expect(detectTriggers(CRAFTER)[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "creatureYouControl", tokenFilter: true });
  });
});

describe("RUNTIME — the filter picks the right entrant", () => {
  it("THE LOAD-BEARING PAIR — the token watcher fires on a TOKEN and not on a real card", () => {
    expect(entering(ANOINTER, TOKEN)).toBe(1);
    expect(entering(ANOINTER, REAL)).toBe(0);
  });

  it("the nontoken twin is exactly inverted, against the same board", () => {
    expect(entering(NONTOKEN_TWIN, REAL)).toBe(1);
    expect(entering(NONTOKEN_TWIN, TOKEN)).toBe(0);
  });

  it("REGRESSION PIN — the unqualified form still fires on BOTH", () => {
    expect(entering(UNQUALIFIED, TOKEN)).toBe(1);
    expect(entering(UNQUALIFIED, REAL)).toBe(1);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Curiosity Crafter #1734 and Anointer Priest #11214 flip", () => {
    expect(classifyCard(CRAFTER)).toMatch(/^native/);
    expect(classifyCard(ANOINTER)).toBe("native-trigger");
  });
});
