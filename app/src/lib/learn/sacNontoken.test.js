/**
 * sacNontoken.test.js — SAC-NONTOKEN: "Sacrifice a/another NONTOKEN <type>" as an activated-ability cost.
 * Thopter Foundry, Infernal Tribute, Knight of the Last Breath, Korozda Guildmage.
 *
 * ⭐ ALL FOUR CARRIERS LIVE ON THE ACTIVATED GRAMMAR — the cast-cost lane has ZERO, measured, so per the
 * TF-1 criterion (at least one carrier before adding surface) SAC_COST_RE stays untouched. The `nontoken`
 * flag rides sacOther and the victim gather enforces it with the same `!v.card?.token` read the alt-cost
 * sacrificeCreature lane (Flare cycle) already uses.
 *
 * ⛔⛔ THE NAMED FAILURE IS THE THOPTER FOUNDRY LOOP. The card sacrifices a NONTOKEN artifact to mint a
 * Thopter TOKEN; offering a token victim would let it sacrifice its own product forever — an infinite,
 * illegal engine the printed word exists to forbid. The Law-6 row below puts a token and a nontoken
 * artifact on the same board and asserts only the nontoken one is offered.
 *
 * ⛔ ADDING THE GROUP RENUMBERED THE CAPTURES (the CV-3 lesson): the noun moved from [2] to [3]. Every
 * incumbent form is pinned byte-identical below — in particular `another` still reads group [1] and the
 * union canon still fires on the noun.
 *
 * Mutation-checked (2026-08-07, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the `(nontoken )?` group removed -> all four park (the anchored match fails on the qualifier).
 *   · the victim-filter check dropped -> Thopter Foundry STILL classifies native while a TOKEN artifact is
 *     offered as the victim — the loop, live. The tier cannot see it; only the pool row can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-07).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THOPTER_FOUNDRY = { id: "c-tf", name: "Thopter Foundry", type: "Artifact", mana: "{1}{W/U}",
  oracle: "{1}, Sacrifice a nontoken artifact: Create a 1/1 blue Thopter artifact creature token with flying. You gain 1 life." };
const INFERNAL_TRIBUTE = { id: "c-it", name: "Infernal Tribute", type: "Enchantment", mana: "{2}{B}{B}",
  oracle: "{2}, Sacrifice a nontoken permanent: Draw a card." };
const KNIGHT_LAST_BREATH = { id: "c-kb", name: "Knight of the Last Breath", type: "Creature — Giant Knight", mana: "{5}{W/B}", power: "4", toughness: "4",
  oracle: "{3}, Sacrifice another nontoken creature: Create a 1/1 white and black Spirit creature token with flying.\nAfterlife 3 (When this creature dies, create three 1/1 white and black Spirit creature tokens with flying.)" };

describe("the carriers", () => {
  it("⭐ all three shapes flip — a/another, artifact/permanent/creature", () => {
    for (const c of [THOPTER_FOUNDRY, INFERNAL_TRIBUTE, KNIGHT_LAST_BREATH]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ the parsed cost — and the INCUMBENTS are byte-identical across the group renumber", () => {
    const p = (o) => parseActivatedAbilities({ name: "X", type: "Artifact", oracle: o })?.[0]?.sacOther || null;
    const row = {
      nontoken: p("{1}, Sacrifice a nontoken artifact: Draw a card."),
      anotherNontoken: p("{3}, Sacrifice another nontoken creature: Draw a card."),
      // ⛔ THE RENUMBER GUARDS — `another` reads [1], the noun reads [3] now, the union canon must still fire.
      plain: p("{1}, Sacrifice a creature: Draw a card."),
      another: p("{1}, Sacrifice another creature: Draw a card."),
      union: p("{1}, Sacrifice a creature or enchantment: Draw a card."),
    };
    console.log("  WITNESS sacNontokenParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.nontoken).toEqual({ type: "artifact", another: false, nontoken: true });
    expect(row.anotherNontoken).toEqual({ type: "creature", another: true, nontoken: true });
    expect(row.plain).toEqual({ type: "creature", another: false });
    expect(row.another).toEqual({ type: "creature", another: true });
    expect(row.union).toEqual({ type: "creatureOrEnchantment", another: false });
  });
});

describe("⭐⭐ LAW 6 — the Thopter Foundry loop, forbidden by name", () => {
  it("⭐⭐ a TOKEN artifact is never offered as the victim; the nontoken one is", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, card) => createPermanent({ id, controller: "user", summoningSick: false, card });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user,
        manaPool: { ...s.players.user.manaPool, C: 2 },
        battlefield: [
          mk("FOUNDRY", THOPTER_FOUNDRY),
          mk("REAL_ARTIFACT", { id: "c-ra", name: "Signet", type: "Artifact", oracle: "" }),
          // ⛔ the loop victim — a minted Thopter. `token: true` is how tokens.js marks its mints.
          mk("TOKEN_ARTIFACT", { id: "c-ta", name: "Thopter", type: "Token Artifact Creature — Thopter", token: true, power: 1, toughness: 1, oracle: "" }),
        ] } } };
    const offers = filterActions(legalActionsForPlayer(st, "user"), "activate-ability")
      .filter((a) => a.permanentId === "FOUNDRY");
    const victims = offers.map((a) => a.sacId || a.sacCreatureId || JSON.stringify(a).match(/REAL_ARTIFACT|TOKEN_ARTIFACT|FOUNDRY/)?.[0]);
    const joined = JSON.stringify(offers);
    console.log("  WITNESS thopterVictims", JSON.stringify(victims)); // vitest 4 needs --disable-console-intercept
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(joined).toContain("REAL_ARTIFACT");
    expect(joined, "a TOKEN must never pay a nontoken cost").not.toContain("TOKEN_ARTIFACT");
  });
});
