/**
 * manaTierHonesty.test.js — a mana source is credited as fully modelled only when the runtime makes what its text says
 * (2026-10-17, the false-positive honesty slice).
 *
 *   A · "INSTEAD" RIDERS ON NONLANDS. "{T}: Add {G}. If you control four or more creatures, add {G}{G} instead." The 10-17 Tron
 *       slice read the rider's condition for lands and refused a land whose rider it could not read (A-Town), but the
 *       native-mana tier never looked: Leafkin Druid, Raucous Audience, Ilysian Caryatid and Tower Worker were credited native
 *       while the runtime made their base mana whatever the board. Now the condition is read as the ability resolves (CR
 *       605.3b): a condition the intervening-if evaluator decides ("you control four or more creatures", "you control a
 *       creature with power 4 or greater" — the reader Fanatic of Rhonas's activation gate uses, layer-aware power) and Tower
 *       Worker's "creatures named Mine Worker and Power Plant Worker" (its ruling: at least one creature of each name). A
 *       condition still unread (a dungeon, the initiative, a Planet's counters) keeps the base and the card is refused the
 *       native-mana tier.
 *   B · RHYSTIC CAVE. "{T}: Choose a color. Add one mana of that color unless any player pays {1}. Activate only as an instant."
 *       "Unless" is a choice another player makes as the ability resolves (CR 118.12a) — no mana record holds it. The line used
 *       to parse to nothing and take the land's colourless fallback: {C}, a type it can never make, every time, credited
 *       `land`. The line is refused now; the land makes nothing (an under-offer) and is land-partial.
 *
 * Every card text is the bundled oracle index's (read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, manaSources, canAfford } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── The cards under test (bundled oracle index) ──
const LEAFKIN = { name: "Leafkin Druid", type: "Creature — Elemental Druid", mana: "{1}{G}", mana_cost: "{1}{G}", power: "0", toughness: "3", colors: ["G"],
  oracle: "{T}: Add {G}. If you control four or more creatures, add {G}{G} instead." };
const AUDIENCE = { name: "Raucous Audience", type: "Creature — Human Citizen", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "1", colors: ["G"],
  oracle: "{T}: Add {G}. If you control a creature with power 4 or greater, add {G}{G} instead." };
const CARYATID = { name: "Ilysian Caryatid", type: "Creature — Plant", mana: "{1}{G}", mana_cost: "{1}{G}", power: "1", toughness: "1", colors: ["G"],
  oracle: "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead." };
const TOWER_WORKER = { name: "Tower Worker", type: "Artifact Creature — Assembly-Worker", mana: "{3}", mana_cost: "{3}", power: "1", toughness: "3", colors: [],
  oracle: "Reach\n{T}: Add {C}. If you control creatures named Mine Worker and Power Plant Worker, add {C}{C}{C} instead." };
const MINE_WORKER = { name: "Mine Worker", type: "Artifact Creature — Assembly-Worker", mana: "{2}", mana_cost: "{2}", power: "2", toughness: "1", colors: [],
  oracle: "{T}: You gain 1 life. If you control creatures named Power Plant Worker and Tower Worker, you gain 3 life instead." };
const POWER_PLANT_WORKER = { name: "Power Plant Worker", type: "Artifact Creature — Assembly-Worker", mana: "{5}", mana_cost: "{5}", power: "4", toughness: "4", colors: [],
  oracle: "{3}: This creature gets +2/+2 until end of turn. If you control creatures named Mine Worker and Tower Worker, put two +1/+1 counters on this creature instead. Activate only once each turn." };
const BROOD = { name: "Brood Astronomer", type: "Creature — Insect Scientist", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2", colors: ["G"],
  oracle: "When this creature enters, you may sacrifice a land. If you do, draft a card from the Planets Spellbook and put it onto the battlefield tapped.\n{T}: Add one mana of any color. If you control a Planet with twelve or more charge counters on it, add three mana of any one color instead." };
const TOME = { name: "Sarevok's Tome", type: "Artifact — Book", mana: "{4}", mana_cost: "{4}", colors: [],
  oracle: "When this artifact enters, you take the initiative.\n{T}: Add {C}. If you have the initiative, add {C}{C} instead.\n{3}, {T}: Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost. Activate only if you've completed a dungeon." };
const ADVENTURER = { name: "Undermountain Adventurer", type: "Creature — Giant Warrior", mana: "{3}{G}", mana_cost: "{3}{G}", power: "3", toughness: "4", colors: ["G"],
  oracle: "Vigilance\nWhen this creature enters, you take the initiative.\n{T}: Add {G}{G}. If you've completed a dungeon, add six {G} instead." };
const RHYSTIC_CAVE = { name: "Rhystic Cave", type: "Land", mana: "", mana_cost: "", colors: [],
  oracle: "{T}: Choose a color. Add one mana of that color unless any player pays {1}. Activate only as an instant." };
const UGINS_LABYRINTH = { name: "Ugin's Labyrinth", type: "Land", mana: "", mana_cost: "", colors: [],
  oracle: "Imprint — When this land enters, you may exile a colorless card with mana value 7 or greater from your hand.\n{T}: Add {C}. If a card is exiled with this land, add {C}{C} instead.\n{T}: Return the exiled card to its owner's hand." };
// ── Board pieces ──
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", colors: ["G"], oracle: "" };
const HILL_GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", colors: ["R"], oracle: "" };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", power: "6", toughness: "4", colors: ["G"], oracle: "" };
// ── Spells cast from hand ──
const BEARS_CARD = { id: "h-bears", ...BEAR, mana_cost: "{1}{G}", cmc: 2 };

const on = (id, card, { tapped = false, sick = false, controller = "user", counters = null } = {}) => {
  const p = { ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: sick }), tapped };
  return counters ? { ...p, counters: { ...(p.counters || {}), ...counters } } : p;
};
function table(userBattlefield, { aiBattlefield = [], hand = [BEARS_CARD] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: userBattlefield, hand, life: 20, library: [], graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiBattlefield },
    },
  };
}
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });
const actions = (s) => legalActionsForPlayer(s, "user");
const castFrom = (s, cardId) => actions(s).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const tapFor = (s, id, color) => actions(s).find((a) => a.kind === "tap-for-mana" && a.permanentId === id && a.color === color);
const taps = (s, id) => actions(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const records = (s, id) => manaSources(s, "user").filter((r) => r.permanentId === id);
const ANY = ["W", "U", "B", "R", "G"];

describe("A · the parse: the four riders are read", () => {
  it("Leafkin Druid and Raucous Audience: {G}, upgraded to {G}{G} on a board condition the evaluator decides", () => {
    for (const card of [LEAFKIN, AUDIENCE]) {
      const p = manaProduction(card);
      expect(p.insteadUnread).toBeUndefined();
      expect(p).toMatchObject({ colors: ["G"], amount: 1, insteadUpgrade: { condition: { kind: "interveningIf" }, product: { colors: ["G"], amount: 2 } } });
    }
  });

  it("Ilysian Caryatid: any colour, upgraded to two of any ONE colour", () => {
    const p = manaProduction(CARYATID);
    expect(p.insteadUnread).toBeUndefined();
    expect(p).toMatchObject({ colors: ANY, amount: 1, insteadUpgrade: { product: { colors: ANY, amount: 2 } } });
  });

  it("Tower Worker: {C}, upgraded to {C}{C}{C} beside a creature named Mine Worker and one named Power Plant Worker", () => {
    const p = manaProduction(TOWER_WORKER);
    expect(p.insteadUnread).toBeUndefined();
    expect(p.insteadUpgrade).toEqual({
      condition: { kind: "controlsEach", of: [{ name: "Mine Worker", cardType: "Creature" }, { name: "Power Plant Worker", cardType: "Creature" }] },
      product: { colors: ["C"], amount: 3 },
    });
  });

  it("⛔ control: a condition still unread keeps its flag (a Planet's counters, the initiative, a dungeon, an exiled card)", () => {
    for (const card of [BROOD, TOME, ADVENTURER, UGINS_LABYRINTH]) expect(manaProduction(card).insteadUnread).toBe(true);
  });
});

describe("A · the runtime: the upgrade while its condition holds, the base otherwise", () => {
  it("Leafkin Druid: {G} beside two Bears (three creatures), {G}{G} beside three (four, itself counted)", () => {
    expect(records(table([on("leaf", LEAFKIN), on("b1", BEAR), on("b2", BEAR)]), "leaf")).toMatchObject([{ colors: ["G"], amount: 1 }]);
    expect(records(table([on("leaf", LEAFKIN), on("b1", BEAR), on("b2", BEAR), on("b3", BEAR)]), "leaf")).toMatchObject([{ colors: ["G"], amount: 2 }]);
  });

  it("Leafkin Druid with four creatures casts Grizzly Bears alone; with three it can't", () => {
    expect(castFrom(table([on("leaf", LEAFKIN), on("b1", BEAR), on("b2", BEAR), on("b3", BEAR)]), "h-bears")).toBeDefined();
    expect(castFrom(table([on("leaf", LEAFKIN), on("b1", BEAR), on("b2", BEAR)]), "h-bears")).toBeUndefined();
  });

  it("⛔ control: an opponent's creatures don't count toward Leafkin Druid's four", () => {
    const s = table([on("leaf", LEAFKIN), on("b1", BEAR)], { aiBattlefield: [on("a1", BEAR, { controller: "ai" }), on("a2", BEAR, { controller: "ai" })] });
    expect(records(s, "leaf")).toMatchObject([{ amount: 1 }]);
  });

  it("the explicit tap: Leafkin Druid with four creatures adds {G}{G}", () => {
    const s = table([on("leaf", LEAFKIN), on("b1", BEAR), on("b2", BEAR), on("b3", BEAR)]);
    const out = dispatchAction(s, tapFor(s, "leaf", "G"));
    expect(out.players.user.manaPool.G).toBe(2);
  });

  it("Raucous Audience: {G}{G} beside Craw Wurm (power 6), {G} beside Hill Giant (3)", () => {
    expect(records(table([on("aud", AUDIENCE), on("wurm", CRAW_WURM)]), "aud")).toMatchObject([{ colors: ["G"], amount: 2 }]);
    expect(records(table([on("aud", AUDIENCE), on("giant", HILL_GIANT)]), "aud")).toMatchObject([{ colors: ["G"], amount: 1 }]);
  });

  it("Raucous Audience reads power as it is now: Hill Giant with a +1/+1 counter is a 4/4 (CR 613.4c)", () => {
    expect(records(table([on("aud", AUDIENCE), on("giant", HILL_GIANT, { counters: { "+1/+1": 1 } })]), "aud")).toMatchObject([{ amount: 2 }]);
  });

  it("⛔ control: an opponent's Craw Wurm is not a creature Raucous Audience's controller controls", () => {
    expect(records(table([on("aud", AUDIENCE)], { aiBattlefield: [on("aw", CRAW_WURM, { controller: "ai" })] }), "aud")).toMatchObject([{ amount: 1 }]);
  });

  it("Ilysian Caryatid beside Craw Wurm pays {U}{U} — two of one colour, never {U}{R}", () => {
    const src = manaSources(table([on("cary", CARYATID), on("wurm", CRAW_WURM)]), "user");
    expect(canAfford(EMPTY, src, cost({ U: 2 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ U: 1, R: 1 }))).toBe(false);
  });

  it("⛔ control: Ilysian Caryatid alone pays {U}, not {U}{U}", () => {
    const src = manaSources(table([on("cary", CARYATID)]), "user");
    expect(canAfford(EMPTY, src, cost({ U: 1 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ U: 2 }))).toBe(false);
  });

  it("Tower Worker beside a Mine Worker and a Power Plant Worker makes {C}{C}{C}", () => {
    expect(records(table([on("tw", TOWER_WORKER), on("mw", MINE_WORKER), on("pw", POWER_PLANT_WORKER)]), "tw")).toMatchObject([{ colors: ["C"], amount: 3 }]);
  });

  it("⛔ SYNTHETIC: a permanent named Power Plant Worker that is no creature now doesn't satisfy \"creatures named …\"", () => {
    const notACreature = { ...POWER_PLANT_WORKER, type: "Artifact — Assembly-Worker" };
    expect(records(table([on("tw", TOWER_WORKER), on("mw", MINE_WORKER), on("pw", notACreature)]), "tw")).toMatchObject([{ amount: 1 }]);
  });

  it("⛔ control: Tower Worker beside a Mine Worker alone, or with the opponent's Power Plant Worker, makes {C}", () => {
    expect(records(table([on("tw", TOWER_WORKER), on("mw", MINE_WORKER)]), "tw")).toMatchObject([{ amount: 1 }]);
    expect(records(table([on("tw", TOWER_WORKER), on("mw", MINE_WORKER)], { aiBattlefield: [on("apw", POWER_PLANT_WORKER, { controller: "ai" })] }), "tw"))
      .toMatchObject([{ amount: 1 }]);
  });
});

describe("A · the tier: native-mana only for a rider the runtime reads", () => {
  it("Leafkin Druid, Raucous Audience, Ilysian Caryatid and Tower Worker keep native-mana — now read", () => {
    expect([LEAFKIN, AUDIENCE, CARYATID, TOWER_WORKER].map(classifyCard)).toEqual(["native-mana", "native-mana", "native-mana", "native-mana"]);
  });

  it("⛔ SYNTHETIC: a mana creature whose rider the runtime can't read is refused native-mana", () => {
    const probe = { name: "Probe Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: "1", toughness: "1", colors: ["G"],
      oracle: "{T}: Add {G}. If you've completed a dungeon, add {G}{G} instead." };
    expect(manaProduction(probe).insteadUnread).toBe(true);
    expect(classifyCard(probe)).toBe("body-only");
  });

  it("⛔ SYNTHETIC: Tower Worker's names without the creature noun are not read as its condition", () => {
    const probe = { ...TOWER_WORKER, name: "Probe Worker", oracle: "Reach\n{T}: Add {C}. If you control Mine Worker and Power Plant Worker, add {C}{C}{C} instead." };
    expect(manaProduction(probe).insteadUnread).toBe(true);
    expect(classifyCard(probe)).toBe("body-only");
  });

  it("control: Brood Astronomer, Sarevok's Tome and Undermountain Adventurer stay body-only; Ugin's Labyrinth land-partial", () => {
    expect([BROOD, TOME, ADVENTURER, UGINS_LABYRINTH].map(classifyCard)).toEqual(["body-only", "body-only", "body-only", "land-partial"]);
  });
});

describe("B · Rhystic Cave makes no mana a record can't honour", () => {
  it("the line is refused: no product (it was the land's {C} fallback)", () => {
    expect(manaProduction(RHYSTIC_CAVE)).toBeNull();
  });

  it("no source on the board, no tap offered, no Grizzly Bears off a Forest and the Cave", () => {
    const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", colors: [], oracle: "({T}: Add {G}.)" };
    const s = table([on("cave", RHYSTIC_CAVE), on("forest", FOREST)]);
    expect(records(s, "cave")).toEqual([]);
    expect(taps(s, "cave")).toEqual([]);
    expect(castFrom(s, "h-bears")).toBeUndefined();
  });

  it("tier: land-partial (it was credited `land`)", () => {
    expect(classifyCard(RHYSTIC_CAVE)).toBe("land-partial");
  });
});
