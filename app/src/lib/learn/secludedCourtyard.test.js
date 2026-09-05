/**
 * SECLUDED COURTYARD — "As this land enters, choose a creature type. / {T}: Add one mana of any color. Spend this mana only to
 * cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type." QUARTET Phase 4
 * step 3 (the chosen-type form WITH the ability tail), 2026-09-06. A Cap America and Jurassic Ramp card.
 *
 * The chosen-type cast form was live (Cavern of Souls, Unclaimed Territory); the ability tail was refused. The parse carries an
 * "@chosenType" placeholder in abilityOf; resolveSourceRestriction swaps it for the land's chosen word, so the activation branch
 * matches the activating source's type line; an unresolved choice pays nothing.
 *
 * Mutation-checked: see the run ledger (docs-q4d).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources, canAfford, parseSpendRestriction } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COURTYARD = { id: "c-sc", name: "Secluded Courtyard", type: "Land", mana: "", keywords: [],
  oracle: "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type." };
const DINO = { id: "c-dino", name: "Raptor Hatchling", type: "Creature — Dinosaur", mana: "{1}{G}", power: 1, toughness: 1, keywords: [], oracle: "" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };

function board(chosenType) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const land = { ...createPermanent({ id: "sc", card: COURTYARD, controller: "user" }), ...(chosenType ? { chosenType } : {}) };
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [land], hand: [DINO, BEAR], library: [] } } };
}

describe("the parser and the classifier", () => {
  it("the chosen-type form carries the ability placeholder; Secluded Courtyard reads land", () => {
    const r = parseSpendRestriction(COURTYARD.oracle);
    const row = { castTypes: r?.castTypes ?? null, abilityOf: r?.abilityOf ?? null, chosen: !!r?.chosenType, tier: classifyCard(COURTYARD) };
    console.log("  WITNESS secludedCourtyard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ castTypes: ["creature"], abilityOf: ["@chosenType"], chosen: true, tier: "land" });
  });
});

describe("RUNTIME — the chosen word resolves both purposes", () => {
  it("chosen Dinosaur: pays a Dinosaur creature spell and a Dinosaur source's ability, never a Bear's; unchosen: pays nothing", () => {
    const s = board("Dinosaur");
    const rec = manaSources(s, "user").find((m) => m.permanentId === "sc" && m.restriction);
    const u = board(null);
    const urec = manaSources(u, "user").find((m) => m.permanentId === "sc" && m.restriction);
    const pool = s.players.user.manaPool;
    const one = parseManaCost("{1}");
    const row = { castTypes: rec?.restriction?.castTypes ?? null, abilityOf: rec?.restriction?.abilityOf ?? null,
      dinoCast: canAfford(pool, [rec], one, { castCard: DINO }), bearCast: canAfford(pool, [rec], one, { castCard: BEAR }),
      dinoAbility: canAfford(pool, [rec], one, { activatingIsCreature: true, activatingTypeLine: DINO.type }), bearAbility: canAfford(pool, [rec], one, { activatingIsCreature: true, activatingTypeLine: BEAR.type }),
      unchosenCast: urec ? canAfford(pool, [urec], one, { castCard: DINO }) : "no-record", unchosenAbility: urec ? canAfford(pool, [urec], one, { activatingIsCreature: true, activatingTypeLine: DINO.type }) : "no-record" };
    console.log("  WITNESS secludedCourtyardRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.castTypes).toEqual(["dinosaur creature"]);
    expect(row.abilityOf).toEqual(["dinosaur"]);
    expect([row.dinoCast, row.bearCast, row.dinoAbility, row.bearAbility]).toEqual([true, false, true, false]);
    expect(row.unchosenCast === false || row.unchosenCast === "no-record").toBe(true);
    expect(row.unchosenAbility === false || row.unchosenAbility === "no-record").toBe(true);
  });
});
