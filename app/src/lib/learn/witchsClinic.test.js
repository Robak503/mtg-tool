/**
 * witchsClinic.test.js — WITCH'S CLINIC (the play-weighted program, EDHREC #1067):
 *
 *   "{T}: Add {C}.
 *    {2}, {T}: Target commander gains lifelink until end of turn."
 *
 * "Commander" names a permanent on the battlefield that is a commander (CR 903.3d) — any player's, of any type the designation can
 * sit on (a creature, an uncrewed Vehicle — CR 903.3). The designation is an attribute of the card, not a characteristic (CR 903.3),
 * so a token copy of a commander is no commander. The parse is the permanent keyword grant (effects/atoms/combat.js) with the
 * `commander` restriction (creatureRestrictions.js — `card.isCommander`, the stamp the seat build puts on each commander card); a
 * double-faced commander is in the pool whichever face is up (spellEffects.addPermanents reads no type line for it). The grant is a
 * layer-6 effect that ends with the turn (CR 613.1f, 611.2a); damage the commander deals then gains its controller that much life
 * (CR 702.15b). The default AI takes it precombat for its own commander that would attack (opponentAI.pickTargetedActivation).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed. A
 * commander is that card with the seat build's `isCommander` stamp (gameState.createPlayerState).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyCreateTokenCopy } from "./effects/atoms/tokens.js";

beforeEach(() => _resetIdsForTests());

const CLINIC = {"name":"Witch's Clinic","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{2}, {T}: Target commander gains lifelink until end of turn.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1067
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","oracle":"","layout":"normal","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #7269
const KENRITH = {"name":"Kenrith, the Returned King","type":"Legendary Creature — Human Noble","mana":"{4}{W}","oracle":"{R}: All creatures gain trample and haste until end of turn.\n{1}{G}: Put a +1/+1 counter on target creature.\n{2}{W}: Target player gains 5 life.\n{3}{U}: Target player draws a card.\n{4}{B}: Put target creature card from a graveyard onto the battlefield under its owner's control.","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["B","G","R","U","W"]}; // EDHREC #3129
const WEATHERLIGHT = {"name":"Weatherlight","type":"Legendary Artifact — Vehicle","mana":"{4}","oracle":"Flying\nWhenever Weatherlight deals combat damage to a player, look at the top five cards of your library. You may reveal a historic card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. (Artifacts, legendaries, and Sagas are historic.)\nCrew 3","layout":"normal","cmc":4,"power":"4","toughness":"5","loyalty":null,"keywords":["Flying","Crew"],"colors":[],"colorIdentity":[]}; // EDHREC #2488
const ESIKA = {"name":"Esika, God of the Tree // The Prismatic Bridge","type":"Legendary Creature — God // Legendary Enchantment","mana":"{1}{G}{G}","oracle":"Esika, God of the Tree - Legendary Creature — God {1}{G}{G}\nVigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and \"{T}: Add one mana of any color.\"\n//\nThe Prismatic Bridge - Legendary Enchantment {W}{U}{B}{R}{G}\nAt the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.","layout":"modal_dfc","cmc":3,"power":"1","toughness":"4","loyalty":null,"keywords":["Vigilance"],"colors":[],"colorIdentity":["B","G","R","U","W"]}; // EDHREC #2523
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","oracle":"{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #—

/** The seat build's designation (gameState.createPlayerState): the commander card carries `isCommander`. */
const commander = (card) => ({ ...card, isCommander: true });
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

/** A four-seat Commander pod in `seat`'s precombat main, `boards` per seat, `pool` floating for `seat`. */
function pod({ seat = "user", boards = {}, hand = [], pool = EMPTY } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], hand: pid === seat ? hand : [], library: [{ ...WASTES, id: `lib-${pid}` }],
      manaPool: pid === seat ? { ...pool } : { ...EMPTY } };
  }
  return { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
const clinicActs = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "clinic" && !a.isManaAbility && /lifelink/i.test(a.abilityText || a.label || ""));
const targetNames = (s, acts) => acts.map((a) => (a.targets || []).map((t) => [...Object.values(s.players)].flatMap((p) => p.battlefield).find((p) => p.id === t.id)?.card?.name).join("+")).sort();

/** The offer `a`, asserted present first — on a board where it is missing the test fails on that assertion, never on a dispatch of nothing. */
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
/** The user's board: the Clinic, two Wastes, its commander Isamaru, a non-commander legendary (Kenrith) and Grizzly Bears. */
const userBoard = () => [on("user", "clinic", CLINIC), on("user", "w1", WASTES), on("user", "w2", WASTES), on("user", "isamaru", commander(ISAMARU)), on("user", "kenrith", KENRITH), on("user", "bears", BEARS)];
const boards = () => ({ user: userBoard(), ai1: [on("ai1", "weatherlight", commander(WEATHERLIGHT))], ai2: [on("ai2", "esika", commander(ESIKA)), on("ai2", "bears2", BEARS)] });

describe("the card", () => {
  it("⭐ a land whose every line is modeled: the colourless mana, and the commander-restricted lifelink grant", () => {
    expect(classifyCard(CLINIC)).toBe("land");
    const ab = parseActivatedAbilities(CLINIC).find((a) => /lifelink/.test(a.raw));
    expect({ modeled: ab.modeled, tapSelf: ab.tapSelf, mana: ab.manaPips, atoms: ab.program.atoms })
      .toEqual({ modeled: true, tapSelf: true, mana: "{2}", atoms: [{ op: "pump", targetType: "permanent", restrictions: [{ kind: "commander" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["Lifelink"] }] });
  });
  it("control: \"target legendary creature\" is not \"target commander\" — Plaza of Heroes' grant keeps its supertype pool", () => {
    const ab = parseActivatedAbilities({ ...CLINIC, oracle: "{2}, {T}: Target legendary creature gains lifelink until end of turn." })[0];
    expect(ab.program.atoms[0].restrictions).toEqual([{ kind: "supertype", value: "Legendary" }]);
  });
});

describe("the offer — every commander on the battlefield, and nothing else", () => {
  it("⭐ the person is offered Isamaru (theirs), the AI's uncrewed Weatherlight and the double-faced Esika (a commander whichever face is up) — never Kenrith (legendary, no commander) nor Grizzly Bears", () => {
    const s = pod({ boards: boards() });
    expect(targetNames(s, clinicActs(s))).toEqual(["Esika, God of the Tree // The Prismatic Bridge", "Isamaru, Hound of Konda", "Weatherlight"]);
  });
  it("⭐ a token copy of a commander is no commander (CR 903.3): the person's token copy of the AI's Weatherlight is not offered, Weatherlight still is", () => {
    // The real copy mint (effects/atoms/tokens.applyCreateTokenCopy — Cackling Counterpart's atom, its controller restriction aside):
    // a copy of a commander controlled by another player, so the legend rule (CR 704.5j) leaves both on the battlefield.
    const atom = parseActivatedAbilities({ ...CLINIC, oracle: "{T}: Create a token that's a copy of target creature you control." })[0].program.atoms[0];
    const s0 = pod({ boards: boards() });
    const s = applyCreateTokenCopy(s0, atom, { controller: "user", sourceId: "clinic", targets: [{ type: "permanent", id: "weatherlight", controller: "ai1" }] });
    const copy = s.players.user.battlefield.find((p) => p.card?.name === "Weatherlight");
    expect({ token: !!copy?.card?.token, commander: copy?.card?.isCommander === true }).toEqual({ token: true, commander: false });
    const offered = clinicActs(s).flatMap((a) => a.targets.map((t) => t.id));
    expect(offered).toContain("weatherlight");
    expect(offered).not.toContain(copy.id);
  });
  it("needs {2} beyond the Clinic's own tap: with one Wastes it is not offered", () => {
    const b = boards();
    b.user = b.user.filter((p) => p.id !== "w2");
    expect(clinicActs(pod({ boards: b }))).toEqual([]);
  });
});

describe("the resolution", () => {
  it("⭐ Isamaru gains lifelink until end of turn, and its combat damage gains the person 2 life (CR 702.15b)", () => {
    const s0 = pod({ boards: boards() });
    const act = clinicActs(s0).find((a) => a.targets[0].id === "isamaru");
    const s = settle(dispatchAction(s0, offered(act, "the Clinic on Isamaru")));
    expect({ isamaru: permanentHasKeyword(s, "isamaru", "Lifelink"), kenrith: permanentHasKeyword(s, "kenrith", "Lifelink"), clinicTapped: s.players.user.battlefield.find((p) => p.id === "clinic").tapped })
      .toEqual({ isamaru: true, kenrith: false, clinicTapped: true });
    const combat = { ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "isamaru", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    const after = resolveCombatDamage(combat);
    expect({ user: after.players.user.life - s.players.user.life, ai1: after.players.ai1.life - s.players.ai1.life }).toEqual({ user: 2, ai1: -2 });
  });
  it("⭐ the grant ends with the turn (CR 611.2a)", () => {
    const s0 = pod({ boards: boards() });
    const s = settle(dispatchAction(s0, offered(clinicActs(s0).find((a) => a.targets[0].id === "isamaru"), "the Clinic on Isamaru")));
    expect(permanentHasKeyword(s, "isamaru", "Lifelink")).toBe(true);
    expect(permanentHasKeyword(expireContinuousEffects(s, { atCleanupOfTurn: s.turn }), "isamaru", "Lifelink")).toBe(false);
  });
  it("the person may give an opponent's commander lifelink — the AI's Weatherlight has it", () => {
    const s0 = pod({ boards: boards() });
    const s = settle(dispatchAction(s0, offered(clinicActs(s0).find((a) => a.targets[0].id === "weatherlight"), "the Clinic on Weatherlight")));
    expect(permanentHasKeyword(s, "weatherlight", "Lifelink")).toBe(true);
  });
});

describe("the default AI", () => {
  /** The AI's main with the Clinic, two Wastes and its commander; an opponent's commander beside it. */
  const aiTable = ({ sick = false } = {}) => pod({ seat: "ai1", boards: {
    ai1: [on("ai1", "clinic", CLINIC), on("ai1", "w1", WASTES), on("ai1", "w2", WASTES), on("ai1", "kenrith", commander(KENRITH), { summoningSick: sick })],
    user: [on("user", "isamaru", commander(ISAMARU))],
  } });
  it("⭐ precombat, it gives its own commander that would attack lifelink — never the person's commander", () => {
    const s = aiTable();
    const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"));
    expect({ kind: pick?.kind, source: pick?.permanentId, target: pick?.targets?.map((t) => t.id) }).toEqual({ kind: "activate-ability", source: "clinic", target: ["kenrith"] });
  });
  it("a commander that can't attack (summoning sick) gets nothing — the grant would buy nothing", () => {
    const pick = pickAction(aiTable({ sick: true }), "ai1", legalActionsForPlayer(aiTable({ sick: true }), "ai1"));
    expect(pick?.permanentId === "clinic" && /lifelink/i.test(pick?.abilityText || "")).toBe(false);
  });
});
