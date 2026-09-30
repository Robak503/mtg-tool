/**
 * THE ABILITY TAIL OF A SPEND RESTRICTION — "Spend this mana only to cast a Hero spell or to activate an ability of a Hero source."
 * (Avengers Tower · Jasmine Dragon Tea Shop · Base Camp · Villainous Hideout · Brotherhood Headquarters). QUARTET Phase 4
 * step 3, 2026-09-06.
 *
 * parseSpendRestriction records the tail's type words in abilityOf beside the cast types; spendRestrictionAllows matches the
 * ACTIVATING source's type line at payment (every activation site now passes activatingTypeLine). A cast spend needs a matching
 * spell; an ability spend needs a matching source; anything else is refused (never dead-then-laundered mana).
 *
 * Avengers Tower itself stayed land-partial here: its "{4}, {T}: look at the top three, reveal a Hero card" line was its own
 * blocker. It reads "land" since 2026-09-30 (shelf deck work, D1 — the tutor filter reads the printed capital and "hero" is
 * curated); that dig's runtime is pinned in tribalDigFilter.test.js.
 *
 * Mutation-checked: see the run ledger (docs-q4b).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources, canAfford, parseSpendRestriction } from "./manaModel.js";
import { parseManaCost, legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TOWER = { id: "c-tower", name: "Avengers Tower", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Hero spell or to activate an ability of a Hero source.\n{4}, {T}: Look at the top three cards of your library. You may reveal a Hero card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const TEA_SHOP = { id: "c-tea", name: "Jasmine Dragon Tea Shop", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast an Ally spell or activate an ability of an Ally source.\n{5}, {T}: Create a 1/1 white Ally creature token." };
const ALLY = { id: "c-ally", name: "Kazandu Nectarpot", type: "Creature — Elf Druid Ally", mana: "{1}{G}", power: 1, toughness: 2, keywords: [], oracle: "" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "tea", card: TEA_SHOP, controller: "user" })], hand: [ALLY, BEAR], library: [] } } };
}

describe("the parser and the classifier", () => {
  it("the tail is recorded beside the cast types (both spellings); the Tea Shop reads land, and so does the Tower now that its Hero dig parses", () => {
    const t = parseSpendRestriction(TOWER.oracle), j = parseSpendRestriction(TEA_SHOP.oracle);
    const row = { tower: { castTypes: t?.castTypes ?? null, abilityOf: t?.abilityOf ?? null }, tea: { castTypes: j?.castTypes ?? null, abilityOf: j?.abilityOf ?? null }, teaTier: classifyCard(TEA_SHOP), towerTier: classifyCard(TOWER) };
    console.log("  WITNESS abilityTail", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tower).toEqual({ castTypes: ["hero"], abilityOf: ["hero"] });
    expect(row.tea).toEqual({ castTypes: ["ally"], abilityOf: ["ally"] });
    expect(row.teaTier).toBe("land");
    expect(row.towerTier).toBe("land");
  });
});

describe("RUNTIME — the restricted record pays an Ally's spell or ability, never a Bear's", () => {
  it("cast: Ally yes, Bear no; ability: an Ally source yes, a Bear source no, no context no", () => {
    const s = board();
    const restricted = manaSources(s, "user").find((m) => m.permanentId === "tea" && m.restriction);
    expect(restricted, "the restricted record exists").toBeTruthy();
    const pool = s.players.user.manaPool;
    const one = parseManaCost("{1}");
    const row = { allyCast: canAfford(pool, [restricted], one, { castCard: ALLY }), bearCast: canAfford(pool, [restricted], one, { castCard: BEAR }),
      allyAbility: canAfford(pool, [restricted], one, { activatingIsCreature: true, activatingTypeLine: ALLY.type }),
      bearAbility: canAfford(pool, [restricted], one, { activatingIsCreature: true, activatingTypeLine: BEAR.type }),
      noContext: canAfford(pool, [restricted], one, {}) };
    console.log("  WITNESS abilityTailRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ allyCast: true, bearCast: false, allyAbility: true, bearAbility: false, noContext: false });
  });
  it("through the OFFER: an Ally's {W} ability is offered off the Tea Shop's restricted line; a Bear's identical ability is not (the sites pass the source's type line)", () => {
    const pump = (id, name, type) => createPermanent({ id, card: { id: "c-" + id, name, type, mana: "{1}{W}", power: 2, toughness: 2, keywords: [], oracle: "{W}: This creature gets +1/+0 until end of turn." }, controller: "user", summoningSick: false });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (perm) => ({ ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "tea", card: TEA_SHOP, controller: "user" }), perm], hand: [], library: [] } } });
    const offered = (perm) => legalActionsForPlayer(mk(perm), "user").filter((a) => a.kind === "activate-ability" && a.permanentId === perm.id).length;
    const row = { ally: offered(pump("ally", "Ally Pumper", "Creature — Human Ally")), bear: offered(pump("bear", "Bear Pumper", "Creature — Bear")) };
    console.log("  WITNESS abilityTailOffer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ally: 1, bear: 0 });
  });
});
