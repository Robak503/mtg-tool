/**
 * warRoom.test.js — War Room (the play-weighted program, P·6, 2026-10-01: EDHREC rank #140), and the commander color
 * identity read it needed.
 *
 *   War Room: "{T}: Add {C}.
 *              {3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card."
 *
 * The life cost is sized as the ability is activated (legalChoices folds it into payLife), off one shared read —
 * commanderIdentity.commanderColorIdentityOf: the identity stamped on the seat at game start (CR 903.4a), plus the command
 * zone. No commander: the cost is unpayable and the ability is not offered (CR 903.4f).
 *
 * The same read fixes Commander's Plate, which read the command zone alone: once the commander was CAST, the zone was empty
 * and the Plate gave protection from all five colors, its own included.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); the commanders are synthetic bodies with real identities.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { permanentProtectionColors } from "./layers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { commanderColorIdentityOf } from "./commanderIdentity.js";

beforeEach(() => _resetIdsForTests());

const WAR_ROOM = { id: "c-wr", name: "War Room", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card." };
const PLATE = { id: "c-plate", name: "Commander's Plate", type: "Artifact — Equipment", mana: "{3}", cmc: 3, colors: [], keywords: [],
  oracle: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}" };
const cmd = (id, identity, mana) => ({ id, name: `Commander ${id}`, type: "Legendary Creature — Human", mana, cmc: 1, colors: identity.slice(0, 1),
  colorIdentity: identity, power: "1", toughness: "1", keywords: [], oracle: "" });
const AZORIUS = cmd("cmd-wu", ["W", "U"], "{W}");
const GREEN = cmd("cmd-g", ["G"], "{G}");
const COLORLESS = cmd("cmd-c", [], "{1}");
const FILLER = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };

/** A main-phase table: War Room on the battlefield, {3} floating, a library to draw from; `commanders` start in the zone. */
function table({ commanders = [], life = null, pool = { C: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [], userCommanders: commanders });
  const wr = createPermanent({ id: "wr", card: WAR_ROOM, controller: "user", summoningSick: false });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: [wr], library: [{ ...FILLER, id: "lib1" }, { ...FILLER, id: "lib2" }],
      manaPool: { ...s.players.user.manaPool, ...pool }, ...(life != null ? { life } : {}) } } };
}
/** Cast the seat's first commander from the command zone (the real path — it leaves the zone) and resolve it. */
function castCommander(s, id, pip) {
  const withMana = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, [pip]: (s.players.user.manaPool[pip] || 0) + 1 } } } };
  const cast = legalActionsForPlayer(withMana, "user").find((a) => a.kind === "cast-spell" && a.cardId === id);
  if (!cast) throw new Error(`commander ${id} is not castable`);
  return finalizeStackResolution(resolveTopOfStack(dispatchAction(withMana, cast)));
}
const drawAction = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "wr" && !a.isManaAbility && /Draw a card/.test(a.abilityText || "") );

describe("the card", () => {
  it("War Room is a covered land; the draw ability carries the commander-identity life cost", () => {
    const draw = parseActivatedAbilities(WAR_ROOM).find((a) => a.effectClause === "Draw a card.");
    expect({ tier: classifyCard(WAR_ROOM), modeled: draw?.modeled, manaPips: draw?.manaPips, tapSelf: draw?.tapSelf, sized: draw?.payLifeCommanderColors })
      .toEqual({ tier: "land", modeled: true, manaPips: "{3}", tapSelf: true, sized: true });
  });

  it("fences (synthetic): a life cost sized off anything else stays unmodeled", () => {
    const other = { ...WAR_ROOM, oracle: "{3}, {T}, Pay life equal to the number of cards in your hand: Draw a card." };
    expect(parseActivatedAbilities(other)[0]?.modeled).toBe(false);
  });
});

describe("the commander color identity read (CR 903.4)", () => {
  it("the seat's identity is stamped at game start, survives the cast, and unions partners; no commander is null (CR 903.4f)", () => {
    // Both partners CAST, so the command zone is empty and the stamp alone answers (a partner still in the zone would mask it).
    const partners = castCommander(castCommander(table({ commanders: [cmd("p1", ["W"], "{W}"), cmd("p2", ["B", "G"], "{B}")] }), "p1", "W"), "p2", "B");
    const cast = castCommander(table({ commanders: [GREEN] }), "cmd-g", "G");
    expect({
      partnersZone: partners.players.user.command.length,
      partners: commanderColorIdentityOf(partners, "user"),
      castZone: cast.players.user.command.length,
      cast: commanderColorIdentityOf(cast, "user"),
      none: commanderColorIdentityOf(table(), "user"),
      colorless: commanderColorIdentityOf(table({ commanders: [COLORLESS] }), "user"),
    }).toEqual({ partnersZone: 0, partners: ["W", "B", "G"], castZone: 0, cast: ["G"], none: null, colorless: [] });
  });
});

describe("War Room in play", () => {
  it("an Azorius commander already cast: {3}, {T}, pay 2 life — draw a card (WITNESS)", () => {
    const s0 = castCommander(table({ commanders: [AZORIUS] }), "cmd-wu", "W");
    const act = drawAction(s0);
    if (!act) throw new Error("the draw ability is not offered");
    const lifeBefore = s0.players.user.life;
    const s1 = finalizeStackResolution(resolveTopOfStack(dispatchAction(s0, act)));
    const witness = { payLife: act.payLife, lifePaid: lifeBefore - s1.players.user.life, drew: s1.players.user.hand.length - s0.players.user.hand.length,
      warRoomTapped: s1.players.user.battlefield.find((p) => p.id === "wr")?.tapped };
    console.log(`WITNESS warRoom ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ payLife: 2, lifePaid: 2, drew: 1, warRoomTapped: true });
  });

  it("⛔ no commander: the cost is unpayable and the ability is not offered (CR 903.4f)", () => {
    expect(drawAction(table())).toBeUndefined();
  });

  it("the life must be there (CR 119.4): at 1 life it is not offered; at exactly 2 it is", () => {
    expect([drawAction(table({ commanders: [AZORIUS], life: 1 })), drawAction(table({ commanders: [AZORIUS], life: 2 }))?.payLife]).toEqual([undefined, 2]);
  });

  it("a colorless commander: the cost is zero life", () => {
    const s0 = table({ commanders: [COLORLESS] });
    const act = drawAction(s0);
    const s1 = finalizeStackResolution(resolveTopOfStack(dispatchAction(s0, act)));
    expect({ payLife: act.payLife, life: s1.players.user.life - s0.players.user.life, drew: s1.players.user.hand.length }).toEqual({ payLife: 0, life: 0, drew: 1 });
  });
});

describe("Commander's Plate on a cast commander (the fixed read)", () => {
  it("a mono-green commander cast and wearing the Plate: protection from W, U, B, R — never its own green (WITNESS)", () => {
    const s0 = castCommander(table({ commanders: [GREEN] }), "cmd-g", "G");
    const commanderId = s0.players.user.battlefield.find((p) => p.card?.isCommander)?.id;
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s1 = attachPermanent({ ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, plate] } } }, { equipId: "plate", targetId: commanderId });
    const colors = [...permanentProtectionColors(s1, commanderId)].sort();
    console.log(`WITNESS platedCommander ${JSON.stringify(colors)}`);
    expect(colors).toEqual(["B", "R", "U", "W"]);
  });

  it("⛔ no commander at all: the protection part does nothing (CR 903.4f) — not protection from all five", () => {
    const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s0 = table();
    const s1 = attachPermanent({ ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, plate] } } }, { equipId: "plate", targetId: "bear" });
    expect([...permanentProtectionColors(s1, "bear")]).toEqual([]);
  });
});
