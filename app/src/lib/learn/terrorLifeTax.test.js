/**
 * terrorLifeTax.test.js — TERROR OF THE PEAKS (2026-08-14), the TARGET-LIFE-TAX static. "Spells your
 * opponents cast that target this creature cost an additional 3 life to cast." (The Dragon's enters-
 * damage trigger already routed — the tax static was the whole park.)
 *
 * ⭐ A MANDATORY cast cost (CR 601.2f), deliberately NOT modeled as ward: ward's pay-or-be-countered
 * lets a caster cast-then-decline (spell dies, mana spent); the tax makes the cast ILLEGAL when the
 * life can't be paid. Two chokes off ONE descriptor (targetLifeTax): legalChoices' post-filter over the
 * assembled action list (stamps the summed tax per chosen-target set; DROPS an unpayable cast) and the
 * dispatcher's cast payment (loseLife with the other cost items).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the static arm dropped → Terror parks (the line becomes residue) AND the stamp vanishes.
 *   · the unpayable drop removed (life gate) → a 2-life caster is OFFERED the illegal cast.
 *   · the dispatcher charge dropped → the cast resolves with NO life paid (the free-tax FP).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TERROR = { name: "Terror of the Peaks", type: "Creature — Dragon", mana: "{3}{R}{R}", keywords: [],
  power: "5", toughness: "4",
  oracle: "Flying\nSpells your opponents cast that target this creature cost an additional 3 life to cast.\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target." };
const MURDER = { id: "murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", colors: ["B"], cmc: 3,
  oracle: "Destroy target creature." };

function board({ aiLife = 40 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const terror = createPermanent({ id: "TER", controller: "user", summoningSick: false, card: { id: "c-TER", ...TERROR } });
  const bear = createPermanent({ id: "BEAR", controller: "user", summoningSick: false,
    card: { id: "c-BEAR", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai",
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [terror, bear] },
      ai: { ...g.players.ai, life: aiLife, hand: [MURDER], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 1 } } } };
}
const murderCasts = (s) => (legalActionsForPlayer(s, "ai") || []).filter((a) => a.kind === "cast-spell" && a.cardId === "murder");
const targeting = (casts, id) => casts.find((a) => (a.targets || []).some((t) => t.id === id));

describe("the carrier and the descriptor", () => {
  it("⭐ Terror flips native-mixed; the static parses to the targetLifeTax descriptor", () => {
    expect(classifyCard(TERROR)).toBe("native-mixed");
    const ds = parseStaticAbilities(TERROR);
    expect(ds.some((d) => d.targetLifeTax?.amount === 3)).toBe(true);
  });
});

describe("⭐⭐ LAW 6 — the tax binds at the offer AND is paid at the cast", () => {
  it("⭐⭐ the Terror-targeting cast carries the stamp; the bystander-targeting cast does not", () => {
    const casts = murderCasts(board());
    const atTerror = targeting(casts, "TER");
    const atBear = targeting(casts, "BEAR");
    const row = { terrorTax: atTerror?.targetLifeTax ?? null, bearTax: atBear?.targetLifeTax ?? null };
    console.log("  WITNESS terrorLifeTax", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ terrorTax: 3, bearTax: null });
  });

  it("⭐⭐ at 2 life the Terror-targeting cast is NOT offered; the bystander cast still is (CR 119.4)", () => {
    const casts = murderCasts(board({ aiLife: 2 }));
    expect(targeting(casts, "TER")).toBeFalsy();
    expect(targeting(casts, "BEAR")).toBeTruthy();
  });

  it("⭐⭐ dispatching the taxed cast charges EXACTLY 3 life", () => {
    const s = board();
    const action = targeting(murderCasts(s), "TER");
    const next = dispatchAction(s, action);
    expect(next.players.ai.life).toBe(37); // 40 − the printed 3, no more, no less
  });

  it("⛔ the caster's OWN Terror never taxes them (an opponent-scoped static)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const ownTerror = createPermanent({ id: "TER", controller: "ai", summoningSick: false, card: { id: "c-TER", ...TERROR } });
    const s = { ...g, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai",
      players: { ...g.players, ai: { ...g.players.ai, battlefield: [ownTerror], hand: [MURDER], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 1 } } } };
    const cast = targeting(murderCasts(s), "TER");
    expect(cast).toBeTruthy();
    expect(cast.targetLifeTax).toBeUndefined();
  });
});
