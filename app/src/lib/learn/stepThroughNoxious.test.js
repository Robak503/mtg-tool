/**
 * stepThroughNoxious.test.js — THE RASHMI PAIR + RIDERS (2026-08-14): Step Through, Undo, Essence
 * Fracture (exact-two bounce), Noxious Revival (any-graveyard card → its owner's library top),
 * Lórien Revealed (typecycling strip rider).
 *
 * ⭐ THREE SMALL ARMS: (1) the multi-bounce matcher's "up to " became OPTIONAL — without it,
 * minTargets = maxTargets = N (CR 601.2c, the Ghostly Flicker discipline: ONE legal creature ⇒
 * UNCASTABLE, never a half-cast); (2) the Noxious arm — applyReturnFromGraveyard ALREADY routes an
 * anyGraveyard target to the zone holder's library, so the whole card is one arm ("its owner's" =
 * the holder, CR 404.1); (3) CAST_KEYWORD_LINE's cycling entry generalized to `[a-z]+cycling` —
 * wizardcycling/islandcycling are the same vacuous cast-alternative plain cycling always was.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · exact-N minTargets reverted to 0 -> the one-creature board becomes castable (⭐⭐ dies).
 *   · the Noxious arm disabled -> Noxious Revival parks.
 *   · the typecycling generalization reverted -> Step Through + Lórien Revealed park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STEP_THROUGH = { id: "c-st", name: "Step Through", type: "Sorcery", mana: "{3}{U}{U}",
  oracle: "Return two target creatures to their owners' hands.\nWizardcycling {2}" };
const NOXIOUS = { id: "c-nr", name: "Noxious Revival", type: "Instant", mana: "{G/P}",
  oracle: "Put target card from a graveyard on top of its owner's library." };

const mkBear = (id, controller) => createPermanent({ id, controller, summoningSick: false,
  card: { id: "card-" + id, name: "Bear " + id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });

describe("the carriers", () => {
  it("⭐ all five flip native", () => {
    expect(classifyCard(STEP_THROUGH)).toBe("native-spell");
    expect(classifyCard(NOXIOUS)).toBe("native-spell");
    expect(classifyCard({ name: "Undo", type: "Sorcery", mana: "{1}{U}{U}", oracle: "Return two target creatures to their owners' hands." })).toBe("native-spell");
    expect(classifyCard({ name: "Essence Fracture", type: "Sorcery", mana: "{3}{U}{U}", oracle: "Return two target creatures to their owners' hands.\nCycling {2}{U}" })).toBe("native-spell");
    expect(classifyCard({ name: "Lórien Revealed", type: "Sorcery", mana: "{3}{U}{U}", oracle: "Draw three cards.\nIslandcycling {1}" })).toBe("native-spell");
  });

  it("⛔ a typecycling LINE never promotes an unmodeled body (the strip is line-anchored, vacuous-only)", () => {
    expect(classifyCard({ name: "Fake Whale", type: "Sorcery", mana: "{1}{U}",
      oracle: "Each opponent glorbulates at dawn.\nWizardcycling {2}" })).not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — exact-two is exact, and the graveyard card goes to ITS owner's library", () => {
  const program = parseEffectClause("Return two target creatures to their owners' hands", "Sorcery");

  it("⭐⭐ ONE creature on the board ⇒ UNCASTABLE (CR 601.2c); three ⇒ every choice is exactly 2", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const one = { ...g, players: { ...g.players, ai1: { ...g.players.ai1, battlefield: [mkBear("A", "ai1")] } } };
    const three = { ...g, players: { ...g.players, ai1: { ...g.players.ai1, battlefield: [mkBear("A", "ai1"), mkBear("B", "ai1"), mkBear("C", "ai1")] } } };
    const sizes = (s) => expandCastChoices(s, "user", program, [], {}).map((c) => (c.targets || []).length);
    const row = { oneCreature: sizes(one).length, threeCreatureSizes: [...new Set(sizes(three))] };
    console.log("  WITNESS exactTwoBounce", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ oneCreature: 0, threeCreatureSizes: [2] });
  });

  it("⭐ the up-to form is untouched (minTargets 0 — the byte-identical pin)", () => {
    const p = parseEffectClause("Return up to two target creatures to their owners' hands", "Sorcery");
    expect(p.atoms[0]).toMatchObject({ op: "bounce", maxTargets: 2, minTargets: 0 });
  });

  it("⭐⭐ Noxious Revival: an ENEMY graveyard card lands on the ENEMY's library top — never yours", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const dead = { id: "gy1", name: "Mulldrifter", type: "Creature — Elemental", oracle: "" };
    const s = { ...g, players: { ...g.players,
      ai1: { ...g.players.ai1, graveyard: [dead], library: [{ id: "aL", name: "Island", type: "Basic Land — Island" }] },
      user: { ...g.players.user, library: [{ id: "uL", name: "Forest", type: "Basic Land — Forest" }] } } };
    const atom = parseEffectClause(NOXIOUS.oracle, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["return-from-graveyard"](s, atom, { controller: "user", targets: [{ type: "graveyardCard", id: "gy1", controller: "ai1" }] });
    const row = { enemyTop: after.players.ai1.library[0]?.id, enemyGy: after.players.ai1.graveyard.length, yourTop: after.players.user.library[0]?.id };
    console.log("  WITNESS noxiousOwnerTop", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ enemyTop: "gy1", enemyGy: 0, yourTop: "uL" });
  });
});
