/**
 * auraMassReturn.test.js — Aura cards returned to the battlefield TOGETHER: Replenish ("Return all enchantment cards from your
 * graveyard to the battlefield.") and Retether ("Return each Aura card from your graveyard to the battlefield. Only creatures can
 * be enchanted this way."). Until 2026-10-16 the mass return skipped every Aura card (zones.applyMassReanimate) because the
 * non-cast entry had no way to choose what an Aura enchants; it has one now (auraEntry.chooseAuraEntryHost, inside
 * effects/atoms/zones.enterCardFromZone), so the skip is lifted.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — an Aura entering by any means other than resolving as an Aura spell, with nothing named by the effect: "that
 *     player chooses what it will enchant as the Aura enters the battlefield" — a legal object, by its enchant ability.
 *   · CR 303.4g — "If an Aura is entering the battlefield and there is no legal object or player for it to enchant, the Aura
 *     remains in its current zone".
 *   · CR 603.6a — "Each time an event puts one or more permanents onto the battlefield, all permanents on the battlefield
 *     (including the newcomers) are checked for any enters-the-battlefield triggers that match the event."
 * The bundled rulings (scryfall.rulings.local.json):
 *   · Replenish (2005-08-01): "Auras can only be placed on permanents that were on the battlefield before this effect started to
 *     resolve. You can't put an enchantment onto the battlefield with Replenish and put an Aura that is also entering onto one of
 *     those enchantments." and "You must return Auras if possible, even if this means enchanting an opponent's permanent with a
 *     good enchantment."
 *   · Retether (2007-02-01): "Auras don't need to say "enchant creature" to return to the battlefield. For example, an Aura with
 *     "enchant land" will return to the battlefield if there's an animated land for it to enchant." and "Whether an Aura can be
 *     attached to a creature is checked before any of them are returned and doesn't take into account any simultaneously
 *     returning Auras."
 *
 * Every spell is cast for real (legal action → dispatch → resolve). Real oracle fixtures (bundled Scryfall snapshot, generated
 * 2026-10-16; the trailing comment is the generator's tier read).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { checkAllStateBasedActions } from "./sba.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REPLENISH = {"name":"Replenish","type":"Sorcery","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Return all enchantment cards from your graveyard to the battlefield. (Auras with nothing to enchant remain in your graveyard.)"}; // native-spell
const RETETHER = {"name":"Retether","type":"Sorcery","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Return each Aura card from your graveyard to the battlefield. Only creatures can be enchanted this way. (Aura cards that can't enchant a creature on the battlefield remain in your graveyard.)"}; // arbiter-spell
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const HOLY_STRENGTH = {"name":"Holy Strength","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +1/+2."}; // native-aura
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."}; // native-mana-aura
const GHOSTLY_PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // native-static
const PROPAGANDA = {"name":"Propaganda","type":"Enchantment","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // native-static
const NYXBORN_COLOSSUS = {"name":"Nyxborn Colossus","type":"Enchantment Creature — Giant","mana":"{3}{G}{G}{G}","cmc":6,"power":"6","toughness":"7","keywords":[],"colors":["G"],"oracle":""}; // native-body
const EIDOLON = {"name":"Eidolon of Blossoms","type":"Enchantment Creature — Spirit","mana":"{2}{G}{G}","cmc":4,"power":"2","toughness":"2","keywords":["Constellation"],"colors":["G"],"oracle":"Constellation — Whenever this creature or another enchantment you control enters, draw a card."}; // native-trigger
const DRYAD_ARBOR = {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")"}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const G = (id, card) => ({ ...card, id }); // a card in a graveyard / hand / library
const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
// The user's precombat main phase, priority held, an empty stack, {W}{C}{C}{C} floating (either sorcery's cost).
function board({ user = [], ai = [], userGy = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, W: 1, C: 3 }, library: [1, 2, 3, 4].map((i) => G(`ul${i}`, FOREST)) },
      ai: { ...s.players.ai, battlefield: ai, graveyard: [], hand: [], library: [1, 2, 3].map((i) => G(`al${i}`, FOREST)) } } };
}
function cast(s, cardId) {
  const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(action, `a legal cast of ${cardId}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, action));
}
const named = (s, name) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === name);
/** What the (single) permanent called `name` is attached to: "<host name> (<host controller>)", null when attached to nothing. */
function hostOf(s, name) {
  const p = named(s, name)[0];
  if (!p?.attachedTo) return null;
  const h = findPermanent(s, p.attachedTo);
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
}
const gyNames = (s, pid = "user") => s.players[pid].graveyard.map((c) => c.name).sort();
const events = (s, kind) => (s.log || []).filter((e) => e.kind === kind);

describe("parse + classify", () => {
  it("Retether parses whole — every Aura card, entering on creatures only; Replenish keeps its mass return; both are native", () => {
    const retether = parseEffectClause(RETETHER.oracle, "Sorcery");
    const row = { conf: programConfidence(retether), atoms: retether.atoms, retether: classifyCard(RETETHER), replenish: classifyCard(REPLENISH) };
    console.log("  WITNESS auraMassReturnParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      conf: "high",
      atoms: [{ op: "mass-reanimate", cardFilter: { subtype: "Aura" }, entersTapped: false, auraHostOpts: { onlyCreatures: true }, targetType: null }],
      retether: "native-spell",
      replenish: "native-spell",
    });
  });

  it("⛔ the creatures-only rider is not optional: Retether's first sentence alone parks (it would return an enchant-land Aura onto a plain land)", () => {
    expect(programConfidence(parseEffectClause("Return each Aura card from your graveyard to the battlefield.", "Sorcery"))).toBe("low");
  });
});

describe("⭐ Replenish — every Aura comes back choosing what it enchants (CR 303.4f)", () => {
  it("⭐ Pacifism returns onto the opponent's biggest creature, Ghostly Prison beside it, and both stay through the state-based actions", () => {
    let s = cast(board({ ai: [P("bears", "ai", BEARS), P("wurm", "ai", WURM)], userGy: [G("g-pac", PACIFISM), G("g-prison", GHOSTLY_PRISON)], hand: [G("rep", REPLENISH)] }), "rep");
    s = checkAllStateBasedActions(s);
    const row = { pacifism: hostOf(s, "Pacifism"), prison: named(s, "Ghostly Prison").length, graveyard: gyNames(s),
      logged: events(s, "enters-attached").map((e) => [e.cardName, e.hostName]) };
    console.log("  WITNESS auraMassReturnReplenish", JSON.stringify(row));
    expect(row).toEqual({ pacifism: "Craw Wurm (ai)", prison: 1, graveyard: ["Replenish"], logged: [["Pacifism", "Craw Wurm"]] });
  });

  // The Colossus sits AHEAD of the Rancor in the graveyard, so it is already placed when the Rancor's turn to enter comes: only a
  // choice read off the board as the return began keeps it out.
  it("⭐ the Replenish ruling: never onto an enchantment returning with it — Rancor takes the Grizzly Bears already there, not the 6/7 Nyxborn Colossus beside it", () => {
    const s = cast(board({ user: [P("bears", "user", BEARS)], userGy: [G("g-colossus", NYXBORN_COLOSSUS), G("g-rancor", RANCOR)], hand: [G("rep", REPLENISH)] }), "rep");
    expect({ rancor: hostOf(s, "Rancor"), colossus: named(s, "Nyxborn Colossus").length }).toEqual({ rancor: "Grizzly Bears (user)", colossus: 1 });
  });

  it("\"You must return Auras if possible\": with no creature of yours, Rancor goes on the opponent's Bears — still never the Colossus returning with it", () => {
    const s = cast(board({ ai: [P("bears", "ai", BEARS)], userGy: [G("g-colossus", NYXBORN_COLOSSUS), G("g-rancor", RANCOR)], hand: [G("rep", REPLENISH)] }), "rep");
    expect({ rancor: hostOf(s, "Rancor"), graveyard: gyNames(s) }).toEqual({ rancor: "Grizzly Bears (ai)", graveyard: ["Replenish"] });
  });

  it("CR 303.4g — with nothing it can enchant, Pacifism stays in the graveyard (logged); Ghostly Prison still returns", () => {
    const s = cast(board({ ai: [P("forest", "ai", FOREST)], userGy: [G("g-pac", PACIFISM), G("g-prison", GHOSTLY_PRISON)], hand: [G("rep", REPLENISH)] }), "rep");
    expect({ pacifism: named(s, "Pacifism").length, prison: named(s, "Ghostly Prison").length, graveyard: gyNames(s), why: events(s, "aura-stays").map((e) => [e.cardName, e.reason]) })
      .toEqual({ pacifism: 0, prison: 1, graveyard: ["Pacifism", "Replenish"], why: [["Pacifism", "nothing it can enchant (CR 303.4g)"]] });
  });

  it("⭐ one event (CR 603.6a): Eidolon of Blossoms returning LAST still sees both enchantments that return with it — three draws on the stack", () => {
    // The graveyard order puts the Eidolon after the other two, so a card-by-card return would check their enters triggers
    // before the Eidolon is on the battlefield, and it would see only itself.
    const s = cast(board({ userGy: [G("g-prison", GHOSTLY_PRISON), G("g-prop", PROPAGANDA), G("g-eidolon", EIDOLON)], hand: [G("rep", REPLENISH)] }), "rep");
    const fromEidolon = (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Eidolon of Blossoms").length;
    expect(fromEidolon).toBe(3);
  });
});

describe("⭐ Retether — each Aura card, onto a creature only", () => {
  it("⭐ Pacifism on the opponent's Wurm, Holy Strength on your Bears; Wild Growth (enchant land) stays — a land that isn't a creature is not a host; Ghostly Prison is not an Aura and stays too", () => {
    let s = cast(board({ user: [P("bears", "user", BEARS), P("forest", "user", FOREST)], ai: [P("wurm", "ai", WURM), P("aforest", "ai", FOREST)],
      userGy: [G("g-pac", PACIFISM), G("g-holy", HOLY_STRENGTH), G("g-wild", WILD_GROWTH), G("g-prison", GHOSTLY_PRISON)], hand: [G("ret", RETETHER)] }), "ret");
    s = checkAllStateBasedActions(s);
    const row = { pacifism: hostOf(s, "Pacifism"), holy: hostOf(s, "Holy Strength"), wild: named(s, "Wild Growth").length, prison: named(s, "Ghostly Prison").length, graveyard: gyNames(s) };
    console.log("  WITNESS auraMassReturnRetether", JSON.stringify(row));
    expect(row).toEqual({ pacifism: "Craw Wurm (ai)", holy: "Grizzly Bears (user)", wild: 0, prison: 0, graveyard: ["Ghostly Prison", "Retether", "Wild Growth"] });
  });

  it("the Retether ruling: an enchant-land Aura returns onto an animated land — Wild Growth on Dryad Arbor (a land creature), never the plain Forest", () => {
    const s = cast(board({ user: [P("arbor", "user", DRYAD_ARBOR), P("forest", "user", FOREST)], userGy: [G("g-wild", WILD_GROWTH)], hand: [G("ret", RETETHER)] }), "ret");
    expect(hostOf(s, "Wild Growth")).toBe("Dryad Arbor (user)");
  });

  it("Replenish has no such limit: the same Wild Growth goes on the Forest (it may enchant any land)", () => {
    const s = cast(board({ user: [P("forest", "user", FOREST)], userGy: [G("g-wild", WILD_GROWTH)], hand: [G("rep", REPLENISH)] }), "rep");
    expect(hostOf(s, "Wild Growth")).toBe("Forest (user)");
  });
});
