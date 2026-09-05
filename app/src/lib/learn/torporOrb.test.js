/**
 * TORPOR ORB — "Creatures entering don't cause abilities to trigger." (Torpor Orb · Hushwing Gryff · Tocatli Honor Guard).
 * Residue census 2026-09-05 (RG-2): a 3-sole-blocker family, one sentence, EDHREC-popular.
 *
 * CR 603.2 read at the two enters-event dispatchers (checkEnterTriggers — the "etb" event every ETB and "whenever a creature
 * enters" watcher rides — and checkPermanentEntersTriggers): while any battlefield permanent prints the line, a CREATURE
 * entering raises no enters events at all — its own ETB and every watcher's. A noncreature entering still triggers. The
 * scan is live (the carrier leaving lifts it) and symmetric (any player's carrier, CR 109.2), and the carrier's own arrival
 * counts (Hushwing Gryff silences its own entrance — the published ruling).
 *
 * Mutation-checked: see the run ledger (docs-rg2).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkEnterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORB = { id: "c-orb", name: "Torpor Orb", type: "Artifact", mana: "{2}", keywords: [], oracle: "Creatures entering don't cause abilities to trigger." };
const GRYFF = { id: "c-gryff", name: "Hushwing Gryff", type: "Creature — Hippogriff", mana: "{2}{W}", power: 2, toughness: 1, keywords: ["Flash", "Flying"], oracle: "Flash\nFlying\nCreatures entering don't cause abilities to trigger." };
const GUARD = { id: "c-guard", name: "Tocatli Honor Guard", type: "Creature — Human Soldier", mana: "{1}{W}", power: 1, toughness: 3, keywords: [], oracle: "Creatures entering don't cause abilities to trigger." };
const ETB_CREATURE = { id: "c-etb", name: "Healer of the Glade", type: "Creature — Elemental", mana: "{G}", power: 1, toughness: 2, keywords: [], oracle: "When this creature enters, you gain 3 life." };
const ETB_ARTIFACT = { id: "c-art", name: "Ichor Wellspring", type: "Artifact", mana: "{2}", keywords: [], oracle: "When this artifact enters, draw a card." };
const WARDEN = { id: "c-warden", name: "Soul Warden", type: "Creature — Human Cleric", mana: "{W}", power: 1, toughness: 1, keywords: [], oracle: "Whenever another creature enters, you gain 1 life." };

function board(userCards, aiCards) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (owner) => (c, i) => createPermanent({ id: `${owner}${i}-${c.id}`, card: c, controller: owner, summoningSick: false });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: userCards.map(mk("user")) }, ai: { ...s0.players.ai, battlefield: aiCards.map(mk("ai")) } } };
}
const fired = (s, enteredId) => (checkEnterTriggers(s, s.players.user.battlefield.concat(s.players.ai.battlefield).find((p) => p.id === enteredId)).pendingTriggers || []).length;

describe("the classifier", () => {
  it("the three carriers read native", () => {
    const row = { orb: classifyCard(ORB), gryff: classifyCard(GRYFF), guard: classifyCard(GUARD) };
    console.log("  WITNESS torporOrb", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the enters events", () => {
  it("with the Orb out a creature's ETB and a Soul Warden watcher stay silent; without it both fire; an artifact's ETB still fires under the Orb", () => {
    const withOrb = board([ORB, WARDEN], [ETB_CREATURE, ETB_ARTIFACT]);
    const noOrb = board([WARDEN], [ETB_CREATURE]);
    const row = { creatureUnderOrb: fired(withOrb, "ai0-c-etb"), artifactUnderOrb: fired(withOrb, "ai1-c-art"), creatureNoOrb: fired(noOrb, "ai0-c-etb") };
    console.log("  WITNESS torporOrbRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ creatureUnderOrb: 0, artifactUnderOrb: 1, creatureNoOrb: 2 });
  });
});
