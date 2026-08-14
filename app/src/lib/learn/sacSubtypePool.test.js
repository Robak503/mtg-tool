/**
 * sacSubtypePool.test.js — the CREATURE-SUBTYPE sac pool (2026-08-12, Palani's Hatcher: "…if you control
 * one or more Eggs, sacrifice an Egg, then create a 3/3 green Dinosaur creature token.").
 *
 * ⭐ ONE curated set (SAC_SUBTYPE_NOUNS, one entry per measured carrier — TF-1) keys BOTH the parser arm
 * and sacrificePoolMatch, so the offer and the charge can never disagree about what "an Egg" means. The
 * pool is word-anchored on the LIVE type line: Palani's own minted 0/1 "Creature — Dinosaur Egg" tokens
 * qualify; a non-Egg Dinosaur never does.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · "egg" removed from SAC_SUBTYPE_NOUNS -> Palani parks AND the runtime row dies (one set, two gates).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PALANI = { id: "c-ph", name: "Palani's Hatcher", type: "Legendary Creature — Bird Dinosaur", mana: "{3}{R}{G}", power: "4", toughness: "4",
  oracle: "Other Dinosaurs you control have haste.\nWhen this creature enters, create two 0/1 green Dinosaur Egg creature tokens.\nAt the beginning of combat on your turn, if you control one or more Eggs, sacrifice an Egg, then create a 3/3 green Dinosaur creature token." };

describe("the carrier and the shape", () => {
  it("⭐ Palani flips; the arm parses; an uncurated subtype refuses", () => {
    expect(classifyCard(PALANI)).toMatch(/^native/);
    expect(parseEffectClause("sacrifice an Egg", "Creature").atoms[0]).toMatchObject({ op: "sacrifice", what: "subtype:Egg" });
    expect(parseEffectClause("sacrifice a Wombat", "Creature")?.confidence ?? "low").toBe("low"); // no carrier → no pool
  });
});

describe("⭐⭐ LAW 6 — the Egg dies, the Dinosaur beside it does not", () => {
  it("⭐⭐ pool honesty at resolution", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const egg = createPermanent({ id: "EGG", controller: "user", summoningSick: false,
      card: { id: "c-egg", name: "Dinosaur Egg", type: "Creature — Dinosaur Egg", power: "0", toughness: "1", oracle: "", token: true } });
    const dino = createPermanent({ id: "DINO", controller: "user", summoningSick: false,
      card: { id: "c-dino", name: "Raptor", type: "Creature — Dinosaur", power: "3", toughness: "3", oracle: "" } });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [egg, dino] } } };
    const atom = parseEffectClause("sacrifice an Egg", "Creature").atoms[0];
    const after = ATOM_RESOLVERS.sacrifice(s, atom, { controller: "user", sourceId: null, targets: [] });
    const row = {
      eggOnBoard: after.players.user.battlefield.some((p) => p.id === "EGG"),
      dinoOnBoard: after.players.user.battlefield.some((p) => p.id === "DINO"),
    };
    console.log("  WITNESS eggPoolHonesty", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ eggOnBoard: false, dinoOnBoard: true });
  });
});
