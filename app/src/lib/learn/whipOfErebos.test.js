/**
 * whipOfErebos.test.js — WHIP OF EREBOS (the play-weighted program, EDHREC #712):
 *
 *   "Creatures you control have lifelink.
 *    {2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of
 *    the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery."
 *
 * The temporary reanimation (zones.graveyardReturnClauseParser's temporary-return arm; applyReanimate's riders): the return this engine
 * already plays, plus three riders on the one permanent it makes — haste that lasts while it stays (CR 611.2a, 613.1f), a delayed
 * exile bound to that object at the next end step (CR 603.7, 603.7c), and the replacement "if it would leave the battlefield, exile it
 * instead" (CR 614.1a) honoured at every move off the battlefield (gameState.moveCardToZone) and every death site (deathExiledInstead:
 * it never dies, CR 700.4). The bundled rulings witnessed: it is exiled even if it loses all its abilities; the exiled creature is
 * never put into the graveyard and its "dies" abilities don't trigger; an exile that returns it makes a new object the Whip's effects
 * no longer apply to. Twins: Gruesome Encore (from an opponent's graveyard, "that creature" — to its OWNER's exile) and Moira and
 * Teshar (a nonland permanent card, on a historic cast).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { abilityLossOf, permanentHasKeyword, permanentHasTypeWord } from "./layers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WHIP = {"name":"Whip of Erebos","type":"Legendary Enchantment Artifact","mana":"{2}{B}{B}","oracle":"Creatures you control have lifelink.\n{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #712
const MOIRA = {"name":"Moira and Teshar","type":"Legendary Creature — Phyrexian Spirit Bird","mana":"{3}{W}{B}","oracle":"Flying\nWhenever you cast a historic spell, return target nonland permanent card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. (Artifacts, legendaries, and Sagas are historic.)","layout":"normal","cmc":5,"power":"4","toughness":"5","loyalty":null,"keywords":["Flying"],"colors":["B","W"],"colorIdentity":["B","W"]}; // EDHREC #15788
const ENCORE = {"name":"Gruesome Encore","type":"Sorcery","mana":"{2}{B}","oracle":"Put target creature card from an opponent's graveyard onto the battlefield under your control. It gains haste. Exile it at the beginning of the next end step. If that creature would leave the battlefield, exile it instead of putting it anywhere else.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #19182
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—
const TRAVELER = {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #5070
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #141
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","oracle":"Destroy target creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #861
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","oracle":"Return target creature to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2928
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11
const CLOUDSHIFT = {"name":"Cloudshift","type":"Instant","mana":"{W}","oracle":"Exile target creature you control, then return that card to the battlefield under your control.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #774
const FROG = {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8993
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const GRIPTIDE = {"name":"Griptide","type":"Instant","mana":"{3}{U}","oracle":"Put target creature on top of its owner's library.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #24428
const SEER = {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Scry"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #257
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const gyCard = (id, card) => ({ ...card, id });
const lib = (seat) => Array.from({ length: 5 }, (_, i) => ({ ...PLAINS, id: `L-${seat}-${i}` }));
/** `seat`'s main phase: the Whip and `swamps` Swamps untapped, `bf` more permanents, `graveyard` cards; the other seat's `oppBf` / `oppGy`. */
function table({ seat = "user", bf = [], graveyard = [], hand = [], oppBf = [], oppGy = [], swamps = 4, whip = true, phase = "precombat-main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [...(whip ? [on(seat, "whip", WHIP)] : []), ...Array.from({ length: swamps }, (_, i) => on(seat, `sw${i}`, SWAMP)), ...bf];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, graveyard, hand, library: lib(seat), landsPlayedThisTurn: 1 },
    [opp]: { ...g.players[opp], battlefield: oppBf, graveyard: oppGy, hand: [], library: lib(opp) } };
  return { ...g, turn: 5, phase, step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
const whipActs = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "whip");
const whipTargets = (s, seat = "user") => whipActs(s, seat).flatMap((a) => (a.targets || []).map((t) => t.id)).sort();
function whipBack(s, cardId, seat = "user") {
  const a = whipActs(s, seat).find((x) => (x.targets || []).some((t) => t.id === cardId));
  expect(a, `no Whip activation at ${cardId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** Cast `cardId` from `seat`'s hand at `targetId` (null: no target), paid from mana floated for exactly its pips. */
function cast(s, seat, cardId, targetId) {
  const card = s.players[seat].hand.find((c) => c.id === cardId);
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const p of (String(card.mana).match(/\{([^}]+)\}/g) || []).map((x) => x.slice(1, -1))) { if (/^\d+$/.test(p)) pool.C += Number(p); else pool[p] += 1; }
  s = { ...s, players: { ...s.players, [seat]: { ...s.players[seat], manaPool: pool } } };
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && (targetId == null || (x.targets || []).some((t) => t.id === targetId)));
  expect(a, `no cast of ${cardId}${targetId ? ` at ${targetId}` : ""}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** From the active player's main phase into the end step: the delayed triggers drained at its entry resolve. */
function toEndStep(s) {
  let t = nextStep({ ...s, phase: "postcombat-main", step: "main", stack: [], consecutivePasses: 0, priorityHolder: s.activePlayer });
  for (let g = 0; g < 10 && (t.stack.length || t.pendingTriggers?.length); g++) t = t.stack.length ? resolveTopOfStack(t) : flushTriggers(t, { chooseTargets: chooseTriggerTargets });
  return finalizeStackResolution(t);
}
const named = (s, seat, name) => s.players[seat].battlefield.find((p) => p.card?.name === name);
const names = (cards) => (cards || []).map((c) => c.name).sort();

describe("the card", () => {
  it("⭐ native: the lifelink anthem and the temporary return, sorcery-timed", () => {
    const act = parseActivatedAbilities(WHIP).find((a) => a.manaPips === "{2}{B}{B}");
    expect({ tier: classifyCard(WHIP), modeled: act?.modeled, sorceryOnly: act?.sorceryOnly, tap: act?.tapSelf, atoms: act?.program?.atoms }).toEqual({
      tier: "native-mixed", modeled: true, sorceryOnly: true, tap: true,
      atoms: [{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", gainsHaste: true, exileAtNextEndStep: true, leaveExiled: true }],
    });
  });
  it("⭐ creatures you control have lifelink: two Bears unblocked gain their controller 4", () => {
    const s = table({ bf: [on("user", "b1", BEARS), on("user", "b2", BEARS)] });
    const hit = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: ["b1", "b2"].map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } });
    expect({ user: hit.players.user.life, ai: hit.players.ai.life }).toEqual({ user: 44, ai: 36 });
  });
});

describe("the activation", () => {
  it("⭐ offered at each creature card in its controller's graveyard — not a noncreature card, not an opponent's creature card", () => {
    const s = table({ graveyard: [gyCard("g-giant", GIANT), gyCard("g-trav", TRAVELER), gyCard("g-murder", MURDER)], oppGy: [gyCard("o-giant", GIANT)] });
    expect(whipTargets(s)).toEqual(["g-giant", "g-trav"]);
  });
  it("⛔ only as a sorcery: not on the opponent's turn, not with a spell on the stack, not in combat; not without {2}{B}{B}", () => {
    const base = table({ graveyard: [gyCard("g-giant", GIANT)] });
    const oppTurn = { ...base, activePlayer: "ai", priorityHolder: "user" };
    const combat = { ...base, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    const threeSwamps = table({ graveyard: [gyCard("g-giant", GIANT)], swamps: 3 });
    expect({ oppTurn: whipActs(oppTurn).length, combat: whipActs(combat).length, three: whipActs(threeSwamps).length, own: whipActs(base).length }).toEqual({ oppTurn: 0, combat: 0, three: 0, own: 1 });
  });
  it("⭐ the Giant returns with haste (it can attack the turn it comes back); the Whip and four Swamps are tapped", () => {
    const s = whipBack(table({ graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    const giant = named(s, "user", "Hill Giant");
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect({ gy: s.players.user.graveyard.length, sick: giant?.summoningSick, haste: permanentHasKeyword(s, giant?.id, "Haste"), canAttack: legalActionsForPlayer(atk, "user").some((a) => a.kind === "declare-attacker" && a.permanentId === giant?.id),
      whipTapped: named(s, "user", "Whip of Erebos")?.tapped, swampsTapped: s.players.user.battlefield.filter((p) => p.card?.name === "Swamp" && p.tapped).length, scheduled: (s.delayedTriggers || []).length })
      .toEqual({ gy: 0, sick: true, haste: true, canAttack: true, whipTapped: true, swampsTapped: 4, scheduled: 1 });
  });
  it("⭐ at the beginning of the next end step it is exiled — its owner's exile, never the graveyard; the delayed trigger is gone", () => {
    const s = toEndStep(whipBack(table({ graveyard: [gyCard("g-giant", GIANT)] }), "g-giant"));
    expect({ step: s.step, onBattlefield: !!named(s, "user", "Hill Giant"), exile: names(s.players.user.exile), gy: names(s.players.user.graveyard), left: (s.delayedTriggers || []).length })
      .toEqual({ step: "end", onBattlefield: false, exile: ["Hill Giant"], gy: [], left: 0 });
  });
});

describe("if it would leave the battlefield, exile it instead", () => {
  const back = (extra = {}) => whipBack(table({ graveyard: [gyCard("g-trav", TRAVELER)], ...extra }), "g-trav");
  it("⭐ destroyed: exiled, not put into the graveyard — Doomed Traveler's dies trigger and Blood Artist's watcher don't trigger", () => {
    const s0 = back({ bf: [on("user", "artist", BLOOD_ARTIST)], hand: [{ ...MURDER, id: "h-murder" }] });
    const trav = named(s0, "user", "Doomed Traveler");
    const s = cast(s0, "user", "h-murder", trav?.id);
    expect({ trav: !!named(s, "user", "Doomed Traveler"), exile: names(s.players.user.exile), gy: names(s.players.user.graveyard), spirits: s.players.user.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length, aiLife: s.players.ai.life, userLife: s.players.user.life })
      .toEqual({ trav: false, exile: ["Doomed Traveler"], gy: ["Murder"], spirits: 0, aiLife: 40, userLife: 40 });
  });
  it("CONTROL — the same Murder on a Doomed Traveler that was cast normally: it dies, the Spirit is made and Blood Artist drains", () => {
    const s0 = table({ bf: [on("user", "artist", BLOOD_ARTIST), on("user", "trav", TRAVELER)], hand: [{ ...MURDER, id: "h-murder" }] });
    const s = cast(s0, "user", "h-murder", "trav");
    expect({ gy: names(s.players.user.graveyard), spirits: s.players.user.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length, lifeSwing: s.players.user.life - s.players.ai.life })
      .toEqual({ gy: ["Doomed Traveler", "Murder"], spirits: 1, lifeSwing: 2 });
  });
  it("⭐ returned to hand (Unsummon): exiled instead — never in the hand", () => {
    const s0 = back({ hand: [{ ...UNSUMMON, id: "h-uns" }] });
    const s = cast(s0, "user", "h-uns", named(s0, "user", "Doomed Traveler")?.id);
    expect({ hand: names(s.players.user.hand), exile: names(s.players.user.exile) }).toEqual({ hand: [], exile: ["Doomed Traveler"] });
  });
  it("⭐ put on top of its owner's library (Griptide): exiled instead — the library's top is unchanged", () => {
    const s0 = back({ hand: [{ ...GRIPTIDE, id: "h-grip" }] });
    const s = cast(s0, "user", "h-grip", named(s0, "user", "Doomed Traveler")?.id);
    expect({ top: s.players.user.library[0]?.name, size: s.players.user.library.length, exile: names(s.players.user.exile) }).toEqual({ top: "Plains", size: 5, exile: ["Doomed Traveler"] });
  });
  it("⭐ sacrificed (Viscera Seer): exiled instead, no Spirit; the scry still happens", () => {
    const s0 = back({ bf: [on("user", "seer", SEER)] });
    const trav = named(s0, "user", "Doomed Traveler");
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "seer" && a.sacCreatureId === trav?.id);
    const s = settle(dispatchAction(s0, act));
    const scried = s.pendingChoice?.kind === "scry" || (s.log || []).some((e) => /scry/.test(String(e.effect || e.kind || "")));
    expect({ trav: !!named(s, "user", "Doomed Traveler"), exile: names(s.players.user.exile), gy: names(s.players.user.graveyard), spirits: s.players.user.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length, scried })
      .toEqual({ trav: false, exile: ["Doomed Traveler"], gy: [], spirits: 0, scried: true });
  });
  it("⭐ already being exiled (Swords to Plowshares): exiled once, and its controller gains life equal to its power", () => {
    const s0 = back({ hand: [{ ...SWORDS, id: "h-stp" }] });
    const s = cast(s0, "user", "h-stp", named(s0, "user", "Doomed Traveler")?.id);
    expect({ exile: names(s.players.user.exile), life: s.players.user.life }).toEqual({ exile: ["Doomed Traveler"], life: 41 });
  });
  it("⭐ it lost all its abilities (Turn to Frog): still exiled at the end step, and destroyed meanwhile it is still exiled (its ruling)", () => {
    const s0 = back({ hand: [{ ...FROG, id: "h-frog" }, { ...MURDER, id: "h-murder" }] });
    const id = named(s0, "user", "Doomed Traveler")?.id;
    const frog = cast(s0, "user", "h-frog", id);
    const end = toEndStep(frog);
    const killed = cast(frog, "user", "h-murder", id);
    expect({ frogType: permanentHasTypeWord(frog, id, "Frog"), lost: !!abilityLossOf(frog, id), atEnd: names(end.players.user.exile), killedExile: names(killed.players.user.exile), killedGy: names(killed.players.user.graveyard), spirits: killed.players.user.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length })
      .toEqual({ frogType: true, lost: true, atEnd: ["Doomed Traveler"], killedExile: ["Doomed Traveler"], killedGy: ["Murder", "Turn to Frog"], spirits: 0 });
  });
  it("⭐ an exile that returns it (Cloudshift) makes a new object: not exiled at the end step, and a later death goes to the graveyard", () => {
    const s0 = back({ hand: [{ ...CLOUDSHIFT, id: "h-cs" }, { ...MURDER, id: "h-murder" }] });
    const shifted = cast(s0, "user", "h-cs", named(s0, "user", "Doomed Traveler")?.id);
    const trav = named(shifted, "user", "Doomed Traveler");
    const end = toEndStep(shifted);
    const killed = cast(shifted, "user", "h-murder", trav?.id);
    expect({ stamped: !!trav?.leaveExiledInstead, endStays: !!named(end, "user", "Doomed Traveler"), endExile: names(end.players.user.exile), killedGy: names(killed.players.user.graveyard), spirits: killed.players.user.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length })
      .toEqual({ stamped: false, endStays: true, endExile: [], killedGy: ["Cloudshift", "Doomed Traveler", "Murder"], spirits: 1 });
  });
});

describe("the twins", () => {
  it("⭐ Gruesome Encore: an opponent's creature card enters under its caster's control with haste and goes to its OWNER's exile at the end step", () => {
    expect(classifyCard(ENCORE)).toBe("native-spell");
    const s0 = table({ whip: false, swamps: 0, hand: [{ ...ENCORE, id: "h-enc" }], oppGy: [gyCard("o-giant", GIANT)] });
    const s = cast(s0, "user", "h-enc", "o-giant");
    const giant = named(s, "user", "Hill Giant");
    const end = toEndStep(s);
    expect({ mine: !!giant, haste: permanentHasKeyword(s, giant?.id, "Haste"), userExile: names(end.players.user.exile), aiExile: names(end.players.ai.exile), aiGy: names(end.players.ai.graveyard) })
      .toEqual({ mine: true, haste: true, userExile: [], aiExile: ["Hill Giant"], aiGy: [] });
  });
  it("⭐ Gruesome Encore: destroyed while it is held, the stolen card goes to its owner's exile", () => {
    const s0 = table({ whip: false, swamps: 0, hand: [{ ...ENCORE, id: "h-enc" }, { ...MURDER, id: "h-murder" }], oppGy: [gyCard("o-giant", GIANT)] });
    const s1 = cast(s0, "user", "h-enc", "o-giant");
    const s = cast(s1, "user", "h-murder", named(s1, "user", "Hill Giant")?.id);
    expect({ aiExile: names(s.players.ai.exile), aiGy: names(s.players.ai.graveyard), userGy: names(s.players.user.graveyard) }).toEqual({ aiExile: ["Hill Giant"], aiGy: [], userGy: ["Gruesome Encore", "Murder"] });
  });
  it("⭐ Moira and Teshar: a historic spell (Sol Ring) returns a nonland permanent card (Mind Stone) — never a land card — and it is exiled at the end step", () => {
    expect(classifyCard(MOIRA)).toBe("native-trigger");
    const s0 = table({ whip: false, swamps: 0, bf: [on("user", "moira", MOIRA)], hand: [{ ...SOL_RING, id: "h-ring" }], graveyard: [gyCard("g-stone", MIND_STONE), gyCard("g-plains", PLAINS), gyCard("g-murder", MURDER)] });
    const pool = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } } };
    const castRing = legalActionsForPlayer(pool, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-ring");
    let s = flushTriggers(dispatchAction(pool, castRing), { chooseTargets: chooseTriggerTargets });
    const trig = s.stack[s.stack.length - 1];
    s = settle(s);
    const stone = named(s, "user", "Mind Stone");
    const end = toEndStep(s);
    expect({ trigTargets: (trig?.targets || []).map((t) => t.id), stone: !!stone, ring: !!named(s, "user", "Sol Ring"), haste: permanentHasKeyword(s, stone?.id, "Haste"), endExile: names(end.players.user.exile), endGy: names(end.players.user.graveyard) })
      .toEqual({ trigTargets: ["g-stone"], stone: true, ring: true, haste: true, endExile: ["Mind Stone"], endGy: ["Murder", "Plains"] });
  });
});

describe("the default AI", () => {
  it("⭐ precombat, it whips back its biggest creature card and attacks with it", () => {
    const s0 = table({ seat: "ai", graveyard: [gyCard("g-giant", GIANT), gyCard("g-trav", TRAVELER)] });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: pick?.kind, permanentId: pick?.permanentId, target: pick?.targets?.[0]?.id }).toEqual({ kind: "activate-ability", permanentId: "whip", target: "g-giant" });
    const s = settle(dispatchAction(s0, pick));
    const giant = named(s, "ai", "Hill Giant");
    const atk = { ...s, phase: "combat", step: "declare-attackers", priorityHolder: "ai", combat: { attackers: [], blockers: [] } };
    const declared = legalActionsForPlayer(atk, "ai").filter((a) => a.kind === "declare-attacker" && a.permanentId === giant?.id);
    expect(declared.length).toBeGreaterThan(0);
    const aiPick = pickAction(atk, "ai", legalActionsForPlayer(atk, "ai"));
    expect({ kind: aiPick?.kind, permanentId: aiPick?.permanentId }).toEqual({ kind: "declare-attacker", permanentId: giant?.id });
  });
  it("⛔ postcombat it holds the Whip (the creature would only be exiled at the end step)", () => {
    const s0 = table({ seat: "ai", phase: "postcombat-main", graveyard: [gyCard("g-giant", GIANT)] });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect(pick?.permanentId).not.toBe("whip");
  });
});
