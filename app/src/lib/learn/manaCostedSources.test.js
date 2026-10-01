/**
 * manaCostedSources.test.js — THE FREE-ACTIVATION FIX (2026-10-01, found scoping the play-weighted worklist's #178).
 *
 * A mana ability whose cost includes mana — the Signets' "{1}, {T}: Add {U}{B}.", the {1} filter lands, Cabal Coffers'
 * "{2}, {T}: …", Chromatic Star — was tapped for FREE: the parse read the "Add" clause and nothing read the "{1}," in front of
 * it. A lone Dimir Signet paid {U}{B} with nothing else on the board; a Signet and an Island cast a three-mana spell.
 *
 * Now: manaActivationCost reads the mana part of the cost on the line the main product comes from; manaSources carries it;
 * the planner first pays without any costed source, then activates them one at a time, each FUNDED from other mana before it
 * produces (CR 602.2b — costs first; CR 605.3b — the mana ability resolves as it is activated), never from its own output;
 * the funding rides the plan as `activationSpend`, charged by the commit and kept out of `spend` (the mana spent on the spell).
 * The explicit tap charges the floating pool, and a fixed bundle is one action (a karoo made {U}{U} or {B}{B} before).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic unpriceable cost.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaActivationCost, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const SIGNET = { name: "Dimir Signet", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [], oracle: "{1}, {T}: Add {U}{B}." };
const COFFERS = { name: "Cabal Coffers", type: "Land", mana: "", cmc: 0, colors: [], keywords: [], oracle: "{2}, {T}: Add {B} for each Swamp you control." };
const STAR = { name: "Chromatic Star", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [],
  oracle: "{1}, {T}, Sacrifice this artifact: Add one mana of any color.\nWhen this artifact is put into a graveyard from the battlefield, draw a card." };
const CORMELA = { name: "Cormela, Glamour Thief", type: "Legendary Creature — Vampire Rogue", mana: "{1}{U}{B}{R}", cmc: 4, colors: ["U", "B", "R"], power: "2", toughness: "4", keywords: ["Haste"],
  oracle: "Haste\n{1}, {T}: Add {U}{B}{R}. Spend this mana only to cast instant and/or sorcery spells.\nWhen Cormela dies, return up to one target instant or sorcery card from your graveyard to your hand." };
const AQUEDUCT = { name: "Dimir Aqueduct", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {U}{B}." };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {B}.)" };
const DURESS = { name: "Duress", type: "Sorcery", mana: "{B}", cmc: 1, colors: ["B"], keywords: [],
  oracle: "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." };
const AGONY_WARP = { name: "Agony Warp", type: "Instant", mana: "{U}{B}", cmc: 2, colors: ["U", "B"], keywords: [],
  oracle: "Target creature gets -3/-0 until end of turn.\nTarget creature gets -0/-3 until end of turn." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Draw two cards." };
const GRAY_OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, colors: ["R"], power: "2", toughness: "2", keywords: [], oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };

const on = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
function table(battlefield, { pool = {}, hand = [DURESS, AGONY_WARP, DIVINATION] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield, manaPool: { ...s.players.user.manaPool, ...pool }, hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), library: [{ ...ISLAND, id: "lib" }] },
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "bear", card: { id: "c-bear", ...BEAR }, controller: "ai", summoningSick: false })], hand: [{ ...DURESS, id: "ai-h" }] } } };
}
const castable = (s) => [...new Set(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell").map((a) => a.name))].sort();
const affords = (s, cost) => planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...cost }) !== null;
const floating = (s) => Object.fromEntries(Object.entries(s.players.user.manaPool).filter(([, n]) => n));

describe("the activation cost is read off the line the product comes from", () => {
  it("Signet {1}, Coffers {2}, Chromatic Star {1}; a plain {T} line, a karoo and a basic are free; an unpriceable pip is refused", () => {
    expect({
      none: manaActivationCost({ name: "Blank", type: "Artifact", oracle: "" }),
      signet: manaActivationCost(SIGNET)?.generic,
      coffers: manaActivationCost(COFFERS)?.generic,
      star: manaActivationCost(STAR)?.generic,
      island: manaActivationCost(ISLAND),
      aqueduct: manaActivationCost(AQUEDUCT),
      // Mystic Gate's main product is its plain "{T}: Add {C}." — free, even though a costed line sits beside it.
      mysticGate: manaActivationCost({ name: "Mystic Gate", type: "Land", oracle: "{T}: Add {C}.\n{W/U}, {T}: Add {W}{W}, {W}{U}, or {U}{U}." }),
      xCost: manaActivationCost({ name: "Synthetic", type: "Artifact", oracle: "{X}, {T}: Add {C}{C}." }),
    }).toEqual({ none: null, signet: 1, coffers: 2, star: 1, island: null, aqueduct: null, mysticGate: null, xCost: { unpayable: true } });
  });

  it("⛔ a source whose cost can't be priced is no source at all (synthetic {X}-cost rock)", () => {
    const xRock = { name: "Synthetic X Rock", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{X}, {T}: Add {C}{C}." };
    expect(affords(table([on("xr", xRock)]), { generic: 2 })).toBe(false);
  });
});

describe("the planner funds a costed source from OTHER mana, before it produces", () => {
  it("⛔ a lone Signet pays for nothing — not even its own colours (WITNESS)", () => {
    const witness = castable(table([on("sig", SIGNET)]));
    console.log(`WITNESS loneSignet ${JSON.stringify(witness)}`);
    expect(witness).toEqual([]);
  });

  it("a Signet and an Island make exactly two mana: {U}{B} yes, a three-drop no; the cast leaves the pool empty", () => {
    const s = table([on("sig", SIGNET), on("isl", ISLAND)]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === "Agony Warp");
    const n = dispatchAction(s, act);
    expect({ castable: castable(s), tapped: n.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort(), pool: floating(n) })
      .toEqual({ castable: ["Agony Warp", "Duress"], tapped: ["isl", "sig"], pool: {} });
  });

  it("a cost the uncosted sources can pay leaves the Signet untapped — nothing is funded that isn't needed", () => {
    const s = table([on("sig", SIGNET), on("isl", ISLAND), on("sw", SWAMP)], { hand: [DURESS] });
    const n = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === "Duress"));
    expect(n.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id)).toEqual(["sw"]);
  });

  it("⛔ a costed source is never funded by its own permanent's other record (Crypt of Agadeem can't tap twice)", () => {
    const CRYPT = { name: "Crypt of Agadeem", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
      oracle: "This land enters tapped.\n{T}: Add {B}.\n{2}, {T}: Add {B} for each black creature card in your graveyard." };
    expect(affords(table([on("crypt", CRYPT), on("sw1", SWAMP), on("sw2", SWAMP)]), { C: 1, B: 1 })).toBe(false);
  });

  it("two Signets chain off one Island into three mana — {2}{U} yes, {3}{U} no", () => {
    const s = table([on("s1", SIGNET), on("s2", SIGNET), on("isl", ISLAND)]);
    expect([affords(s, { generic: 2, U: 1 }), affords(s, { generic: 3, U: 1 })]).toEqual([true, false]);
  });

  it("the activation is paid as activationSpend, never counted as mana spent on the spell", () => {
    const s = table([on("sig", SIGNET), on("isl", ISLAND)]);
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), { generic: 0, W: 0, U: 1, B: 1, R: 0, G: 0, C: 0, hybrid: [] });
    expect({ spend: plan.spend, activationSpend: plan.activationSpend })
      .toEqual({ spend: { W: 0, U: 1, B: 1, R: 0, G: 0, C: 0 }, activationSpend: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } });
  });

  it("Cabal Coffers with three Swamps: two Swamps fund it — four black mana, not six", () => {
    const s = table([on("cof", COFFERS), on("sw1", SWAMP), on("sw2", SWAMP), on("sw3", SWAMP)]);
    expect([affords(s, { generic: 3, B: 1 }), affords(s, { generic: 4, B: 1 })]).toEqual([true, false]);
  });

  it("Chromatic Star: an Island cracks it for the black Duress needs, and it is sacrificed; alone it does nothing", () => {
    const s = table([on("star", STAR), on("isl", ISLAND)], { hand: [DURESS] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === "Duress");
    const n = dispatchAction(s, act);
    expect({ alone: castable(table([on("star", STAR)], { hand: [DURESS] })), withIsland: castable(s), starInGraveyard: n.players.user.graveyard.some((c) => c.name === "Chromatic Star") })
      .toEqual({ alone: [], withIsland: ["Duress"], starInGraveyard: true });
  });

  it("⛔ Cormela's instant-and-sorcery mana never pays for a creature: no laundering through an activation", () => {
    expect(castable(table([on("cor", CORMELA), on("i1", ISLAND), on("i2", ISLAND)], { hand: [GRAY_OGRE] }))).toEqual([]);
  });
});

describe("the explicit tap (a manual mana ability)", () => {
  it("a Signet is offered only when the floating pool can pay its {1}; tapping it leaves exactly {U}{B}", () => {
    const dry = table([on("sig", SIGNET)]);
    const wet = table([on("sig", SIGNET)], { pool: { C: 1 } });
    const tap = legalActionsForPlayer(wet, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "sig");
    // Any colour pays the generic {1}: a floating {U} works too, and comes back as the Signet's own {U}.
    const blue = table([on("sig", SIGNET)], { pool: { U: 1 } });
    const blueTap = legalActionsForPlayer(blue, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "sig");
    expect({ dry: legalActionsForPlayer(dry, "user").some((a) => a.kind === "tap-for-mana"), after: floating(dispatchAction(wet, tap)), blue: blueTap ? floating(dispatchAction(blue, blueTap)) : null })
      .toEqual({ dry: false, after: { U: 1, B: 1 }, blue: { U: 1, B: 1 } });
  });

  it("⛔ a forged tap with nothing floating is refused by the dispatcher, never free mana", () => {
    const s = table([on("sig", SIGNET)]);
    expect(() => dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "sig", color: "U", amount: 2, fixed: { U: 1, B: 1 } })).toThrow(/activation cost/);
  });

  it("a karoo is ONE tap carrying {U}{B} — never {U}{U} or {B}{B} (WITNESS)", () => {
    const taps = legalActionsForPlayer(table([on("aq", AQUEDUCT)]), "user").filter((a) => a.kind === "tap-for-mana");
    const witness = taps.map((a) => ({ color: a.color, amount: a.amount, fixed: a.fixed }));
    console.log(`WITNESS karooTap ${JSON.stringify(witness)}`);
    expect(witness).toEqual([{ color: "U", amount: 2, fixed: { U: 1, B: 1 } }]);
  });
});
