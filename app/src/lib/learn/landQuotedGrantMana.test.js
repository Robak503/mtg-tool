/**
 * landQuotedGrantMana.test.js — a quoted grant is never a land's own mana line (2026-10-16).
 *
 * landFullyCovered admits a land's mana lines through the runtime's own mana parser, one line at a time
 * (isManaLine → manaProduction). For a land, manaProduction keeps the raw oracle (the reminder-text duals print
 * their whole ability in parentheses), so the land path never runs the quoted-grant strip the nonland path uses,
 * and a quoted "{T}: Add …" inside a grant parsed as production. A line that only GRANTS a mana ability
 * ("Other Caves you control have \"{T}, Pay 1 life: Add one mana of any color.\"") was admitted as the land's own
 * mana line, and the card counted fully covered on a grant the runtime never applies.
 *
 * An effect that says an object "has" or "gains" an ability adds that ability to THAT object (CR 113.10): the
 * granted mana ability is the recipient's, never the granter's own mana ability (CR 605.1a). The gate now refuses
 * any line that quotes an ability as a mana line. The non-land native-mana gate closed the same hole in 4f492acd;
 * this is the land side.
 *
 * Fixtures: real oracle text copied verbatim from the bundled index (read 2026-10-16) unless marked SYNTHETIC.
 * Index-free, per coverage.test.js's convention (CI has no Scryfall bulk data).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaSources } from "./manaModel.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type, mana, mana_cost: mana, oracle, keywords: [], ...extra });

const FORGOTTEN_MONUMENT = card("Forgotten Monument", "Land — Cave", "", "{T}: Add {C}.\nOther Caves you control have \"{T}, Pay 1 life: Add one mana of any color.\"");
const RIFTSTONE_PORTAL = card("Riftstone Portal", "Land", "", "{T}: Add {C}.\nAs long as this card is in your graveyard, lands you control have \"{T}: Add {G} or {W}.\"");
const COMMAND_POWER_PLANT = card("Command Power Plant", "Land", "", "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Mine, add two mana of any color in your commander's color identity instead.\nCommand Towers you control have, \"{T}: If you control a Command Mine and a Command Power Plant, add three mana of any color in your commander's color identity.\"");
const COMMAND_TOWER = card("Command Tower", "Land", "", "{T}: Add one mana of any color in your commander's color identity.");
const COMMAND_MINE = card("Command Mine", "Land", "", "{T}: Add one mana of any color in your commander's color identity. If you control a Command Tower and a Command Power Plant, add two mana of any color in your commander's color identity instead.");
const HIDDEN_COURTYARD = card("Hidden Courtyard", "Land — Cave", "", "This land enters tapped.\n{T}: Add {W}.\n{4}{W}, {T}, Sacrifice this land: Discover 4. Activate only as a sorcery. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)");
const ISLAND = card("Island", "Basic Land — Island", "", "({T}: Add {U}.)");
const SPAWNING_BED = card("Spawning Bed", "Land", "", "{T}: Add {C}.\n{6}, {T}, Sacrifice this land: Create three 1/1 colorless Eldrazi Scion creature tokens. They have \"Sacrifice this token: Add {C}.\"");
const CRYPTOLITH_RITE = card("Cryptolith Rite", "Enchantment", "{1}{G}", "Creatures you control have \"{T}: Add one mana of any color.\"");
const GRIZZLY_BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { power: "2", toughness: "2" });
const URZAS_SAGA = card("Urza's Saga", "Enchantment Land — Urza's Saga", "", "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga gains \"{T}: Add {C}.\"\nII — This Saga gains \"{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for each artifact you control.'\"\nIII — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle.");
// SYNTHETIC recipients with no mana ability of their own: a granted mana ability is offered whole only to a permanent
// without one (manaModel.withGrantedMana), so these are the boards where a delivered grant would show.
const PROBE_CAVE = card("Probe Cave", "Land — Cave", "", "");
const PROBE_LAND = card("Probe Land", "Land", "", "");
// A commander with a stated identity: Command Tower makes its colours (CR 903.4) and nothing without one (CR 903.4f).
const OMNATH = card("Omnath, Locus of Mana", "Legendary Creature — Elemental", "{2}{G}", "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have.", { power: "1", toughness: "1", colorIdentity: ["G"] });

const perm = (c, id = c.id) => createPermanent({ id, card: c, controller: "user", summoningSick: false });
function board(battlefield, graveyard = [], userCommanders = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [], userCommanders });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, graveyard, hand: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const sourceOf = (s, id) => manaSources(s, "user").find((x) => x.permanentId === id);
const isManaGrant = (e) => e?.layer === 6 && e?.op?.layerOp === "addAbility" && e?.op?.grant?.kind === "mana";

describe("the witnesses: a land whose only extra text is a quoted mana grant the runtime never applies", () => {
  it("Forgotten Monument, Riftstone Portal and Command Power Plant are land-partial", () => {
    expect([FORGOTTEN_MONUMENT, RIFTSTONE_PORTAL, COMMAND_POWER_PLANT].map((c) => [c.name, classifyCard(c)])).toEqual([
      ["Forgotten Monument", "land-partial"],
      ["Riftstone Portal", "land-partial"],
      ["Command Power Plant", "land-partial"],
    ]);
  });

  it("the control beside each: the same land without its grant sentence is still land (the grant is the only thing that moved)", () => {
    expect(classifyCard({ ...FORGOTTEN_MONUMENT, oracle: "{T}: Add {C}." })).toBe("land");
    expect(classifyCard({ ...RIFTSTONE_PORTAL, oracle: "{T}: Add {C}." })).toBe("land");
  });

  it("⛔ SYNTHETIC: a grant welded onto a real mana line does not ride on that line's production", () => {
    // The whole line is refused, not the quote cut out of it: read with the quote removed, this line is "{T}: Add {C}."
    // plus a grant nothing reads, and the grant would go unread again.
    expect(classifyCard(card("Probe Weld", "Land — Cave", "", "{T}: Add {C}. Other Caves you control have \"{T}, Pay 1 life: Add one mana of any color.\""))).toBe("land-partial");
  });

  it("⛔ SYNTHETIC: an unmodeled activated ability whose effect GAINS a mana ability is not rescued as a mana line", () => {
    // The activated leg admitted any parsed ability the per-line mana read accepted, so this "gains" grant passed as a
    // mana ability of the land. The control: the same land without the line is land.
    expect(classifyCard(card("Probe Gift", "Land", "", "{T}: Add {C}.\n{2}, {T}: Target land you control gains \"{T}: Add {B}.\" until end of turn."))).toBe("land-partial");
    expect(classifyCard(card("Probe Gift", "Land", "", "{T}: Add {C}."))).toBe("land");
  });
});

describe("⭐ runtime: none of the three grants is applied on a board — the reader that would apply them emits nothing", () => {
  it("the static parser emits no mana grant for any of the three; it does for Cryptolith Rite (the control)", () => {
    expect([FORGOTTEN_MONUMENT, RIFTSTONE_PORTAL, COMMAND_POWER_PLANT].map((c) => parseStaticAbilities(c).filter(isManaGrant).length)).toEqual([0, 0, 0]);
    expect(parseStaticAbilities(CRYPTOLITH_RITE).filter(isManaGrant)).toHaveLength(1);
  });

  it("the harness sees a grant that IS applied: Cryptolith Rite makes a bear tap for any color", () => {
    expect(sourceOf(board([perm(GRIZZLY_BEARS)]), GRIZZLY_BEARS.id)).toBeUndefined();
    expect(sourceOf(board([perm(GRIZZLY_BEARS), perm(CRYPTOLITH_RITE)]), GRIZZLY_BEARS.id)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });

  it("Forgotten Monument: another Cave gains nothing — a Cave with no mana ability stays no source, Hidden Courtyard taps only for {W}", () => {
    const s = board([perm(FORGOTTEN_MONUMENT), perm(PROBE_CAVE), perm(HIDDEN_COURTYARD)]);
    expect(sourceOf(s, PROBE_CAVE.id)).toBeUndefined();
    expect(sourceOf(s, HIDDEN_COURTYARD.id)).toMatchObject({ colors: ["W"], amount: 1 });
    expect(sourceOf(s, FORGOTTEN_MONUMENT.id)).toMatchObject({ colors: ["C"], amount: 1 });
  });

  it("Riftstone Portal in the graveyard: lands gain nothing — a land with no mana ability stays no source, an Island taps only for {U}", () => {
    const s = board([perm(PROBE_LAND), perm(ISLAND)], [{ ...RIFTSTONE_PORTAL }]);
    expect(sourceOf(s, PROBE_LAND.id)).toBeUndefined();
    expect(sourceOf(s, ISLAND.id)).toMatchObject({ colors: ["U"], amount: 1 });
  });

  it("Command Power Plant beside a Command Tower and a Command Mine: the Tower never gains the three-mana ability", () => {
    const s = board([perm(COMMAND_POWER_PLANT), perm(COMMAND_TOWER), perm(COMMAND_MINE)], [], [OMNATH]);
    expect(sourceOf(s, COMMAND_TOWER.id)).toMatchObject({ amount: 1, colors: ["G"] });
    expect(sourceOf(s, COMMAND_TOWER.id)).toEqual(sourceOf(board([perm(COMMAND_TOWER)], [], [OMNATH]), COMMAND_TOWER.id));
  });
});

describe("lands that keep credit", () => {
  it("Spawning Bed: the quoted mana ability belongs to its own modeled token ability, vouched by the activated lane", () => {
    expect(classifyCard(SPAWNING_BED)).toBe("land");
  });

  it("Command Tower: a real own mana line, no quote", () => {
    expect(classifyCard(COMMAND_TOWER)).toBe("land");
  });

  it("Urza's Saga: a quoted mana grant the runtime DOES apply keeps land (the Saga gate decides it, not the mana-line read)", () => {
    expect(classifyCard(URZAS_SAGA)).toBe("land");
  });

  it("⭐ runtime: after chapter I the Saga taps for exactly {C}, and before it nothing", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const table = { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...URZAS_SAGA, id: "saga" }], landsPlayedThisTurn: 0, library: [] } } };
    const play = legalActionsForPlayer(table, "user").find((a) => a.kind === "play-land" && a.cardId === "saga");
    expect(play).toBeTruthy();
    let s = dispatchAction(table, play);
    const sagaId = s.players.user.battlefield.find((p) => p.card?.name === "Urza's Saga").id;
    expect(sourceOf(s, sagaId)).toBeUndefined();
    for (let g = 0; (s.stack?.length || s.pendingTriggers?.length) && !s.pendingChoice && g < 30; g++) {
      s = s.stack?.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    }
    expect(sourceOf(s, sagaId)).toMatchObject({ colors: ["C"], amount: 1 });
  });
});
