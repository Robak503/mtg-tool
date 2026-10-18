/**
 * optionalFightLoop.test.js — "it fights UP TO ONE target creature you don't control": the controller may choose no target
 * (CR 115.6 — an ability that requires targets may allow zero to be chosen; CR 601.2c — a variable number of targets is announced
 * as the ability goes on the stack, CR 603.3d), so a fight that gains nothing is declined.
 *
 * Found in the goad entry's supplement (seed 3724842652, turn 32): Jurassic Ramp's Apex Altisaur — indestructible there — fought
 * Earth Bent's Lumra, Bellow of the Woods 2,000 times. Each fight dealt it damage, its enrage put the fight back on the stack, the
 * chooser took the first legal target every time (the decline is enumerated last), neither creature died, and the game ended
 * engine-stuck at 20,001 ticks. "Up to one" makes it an OPTIONAL loop: no draw (CR 104.4b — "Loops that contain an optional
 * action don't result in a draw"); the player who makes the optional choice stops it (CR 732.2a).
 *
 * Now (triggerTargetRestraint.js): a candidate's fight is taken only when the target dies and the fighter lives, or as a step of a
 * chain that ends that way — the fighter survives, is dealt damage, its own "is dealt damage" trigger fights again, and the target
 * (which damage can destroy, CR 704.5g / 702.12b) runs out of toughness first. The fight is read by resolving it on a copy of the
 * board (effects/atoms/combat.fightCreature — the resolver itself, CR 701.14a). Behind it, any trigger with an optional target whose
 * ability has already resolved LOOP_ITERATIONS times this turn declines its optional targets (the CR 732.2a shortcut).
 *
 * Every game below runs through the real engine (cast with legalActionsForPlayer + dispatchAction, the stack resolved with
 * resolveTopOfStack) under a resolution BUDGET, so a loop fails an assertion instead of hanging the suite. Both seats: a
 * triggered ability has no separate human target prompt — the same chooser targets it for either seat.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

// triggerTargetRestraint.LOOP_ITERATIONS — written here, not imported, so this file also runs (and fails on its assertions) on an
// engine without the module.
const LOOP_ITERATIONS = 300;

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const ALTISAUR = card("Apex Altisaur", "Creature — Dinosaur", "{7}{G}{G}", 9, "When this creature enters, it fights up to one target creature you don't control.\nEnrage — Whenever this creature is dealt damage, it fights up to one target creature you don't control.", { power: "10", toughness: "10", colors: ["G"], keywords: ["Enrage", "Fight"] });
const AVACYN = card("Avacyn, Angel of Hope", "Legendary Creature — Angel", "{5}{W}{W}{W}", 8, "Flying, vigilance, indestructible\nOther permanents you control have indestructible.", { power: "8", toughness: "8", colors: ["W"], keywords: ["Flying", "Indestructible", "Vigilance"] });
const COLOSSUS = card("Darksteel Colossus", "Artifact Creature — Golem", "{11}", 11, "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead.", { power: "11", toughness: "11", colors: [], keywords: ["Indestructible", "Trample"] });
const WURM = card("Worldspine Wurm", "Creature — Wurm", "{8}{G}{G}{G}", 11, "Trample\nWhen this creature dies, create three 5/5 green Wurm creature tokens with trample.\nWhen Worldspine Wurm is put into a graveyard from anywhere, shuffle it into its owner's library.", { power: "15", toughness: "15", colors: ["G"], keywords: ["Trample"] });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const GIGANTOSAURUS = card("Gigantosaurus", "Creature — Dinosaur", "{G}{G}{G}{G}{G}", 5, "", { power: "10", toughness: "10", colors: ["G"] });
const KOGLA = card("Kogla, the Titan Ape", "Legendary Creature — Ape", "{3}{G}{G}{G}", 6, "When Kogla enters, it fights up to one target creature you don't control.\nWhenever Kogla attacks, destroy target artifact or enchantment defending player controls.\n{1}{G}: Return target Human you control to its owner's hand. Kogla gains indestructible until end of turn.", { power: "7", toughness: "6", colors: ["G"], keywords: ["Fight"] });
const AUTOCHTHON = card("Autochthon Wurm", "Creature — Wurm", "{10}{G}{G}{G}{W}{W}", 15, "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nTrample", { power: "9", toughness: "14", colors: ["G", "W"], keywords: ["Trample", "Convoke"] });
const PHALANX = card("Unhallowed Phalanx", "Creature — Zombie Soldier", "{4}{B}", 5, "This creature enters tapped.", { power: "1", toughness: "13", colors: ["B"] });
const LUMRA = card("Lumra, Bellow of the Woods", "Legendary Creature — Elemental Bear", "{4}{G}{G}", 6, "Reach, vigilance\nLumra's power and toughness are each equal to the number of lands you control.\nWhen Lumra enters, mill four cards. Then return all land cards from your graveyard to the battlefield tapped.", { power: "*", toughness: "*", colors: ["G"], keywords: ["Reach", "Vigilance", "Mill"] });
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)", { colors: [] });
const SPITEMARE = card("Spitemare", "Creature — Elemental", "{2}{R/W}{R/W}", 4, "Whenever this creature is dealt damage, it deals that much damage to any target.", { power: "3", toughness: "3", colors: ["R", "W"] });
const RECKONER = card("Boros Reckoner", "Creature — Minotaur Wizard", "{R/W}{R/W}{R/W}", 3, "Whenever this creature is dealt damage, it deals that much damage to any target.\n{R/W}: This creature gains first strike until end of turn.", { power: "3", toughness: "3", colors: ["R", "W"] });

const other = (who) => (who === "ai" ? "user" : "ai");
const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** Turn 6, the active seat's precombat main with an empty stack and `hand` (Apex Altisaur) to cast; `mine` / `theirs` are the active seat's and its opponent's. */
function board(who, { mine = [], theirs = [], hand = ALTISAUR } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], ...o });
  return {
    ...g, turn: 6, activePlayer: who, priorityHolder: who, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...g.players,
      [who]: seat(who, { hand: [{ ...hand, id: "alt" }], battlefield: mine, manaPool: { ...g.players[who].manaPool, G: 9 } }),
      [other(who)]: seat(other(who), { battlefield: theirs }),
    },
  };
}
function cast(s, who) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: who }, who).find((x) => x.kind === "cast-spell" && x.cardId === "alt");
  if (!a) throw new Error(`no cast of the card in hand for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
/** Resolve the stack, at most `budget` objects. A loop runs out of budget with the stack still full (`settled: false`). */
function settleWithin(s, budget = 60) {
  let n = s;
  let resolutions = 0;
  while ((n.stack.length || n.pendingTriggers.length) && !n.pendingChoice && resolutions < budget) {
    n = resolveTopOfStack(n);
    resolutions += 1;
  }
  const crash = n.log.find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return { s: n, resolutions, settled: !n.stack.length && !n.pendingTriggers.length };
}
const play = (s, who, budget) => settleWithin(cast(s, who), budget);
const names = (zone) => zone.map((c) => c.card?.name ?? c.name);
// A fight that happened: its log line names the two creatures (a declined "up to one" resolves as a fight line naming none).
const fights = (s) => s.log.filter((e) => e.kind === "spell-effect" && e.effect === "fight" && (e.targets || []).length).map((e) => e.targets);
const altisaur = (s, who) => s.players[who].battlefield.find((p) => p.card?.name === "Apex Altisaur") ?? null;

describe("Apex Altisaur — a fight that gains nothing is declined (the soft-lock)", () => {
  it("⭐ indestructible (Avacyn) against Darksteel Colossus: the enters fight is declined — the stack settles, no fight, no damage", () => {
    const r = play(board("ai", { mine: [perm("avacyn", AVACYN, "ai")], theirs: [perm("colossus", COLOSSUS, "user")] }), "ai");
    expect({ settled: r.settled, fights: fights(r.s).length, damage: altisaur(r.s, "ai")?.damageMarked ?? null, colossus: r.s.players.user.battlefield.find((p) => p.id === "colossus")?.damageMarked ?? null })
      .toEqual({ settled: true, fights: 0, damage: 0, colossus: 0 });
  });

  it("⭐ the repro's shape: indestructible against Lumra (13 lands — damage never destroys it here): at most two fights, then the stack settles", () => {
    const forests = Array.from({ length: 13 }, (_, i) => perm(`f${i}`, FOREST, "user"));
    const r = play(board("ai", { mine: [perm("avacyn", AVACYN, "ai")], theirs: [perm("lumra", LUMRA, "user"), ...forests] }), "ai");
    expect({ settled: r.settled, fewFights: fights(r.s).length <= 2, altisaur: !!altisaur(r.s, "ai") })
      .toEqual({ settled: true, fewFights: true, altisaur: true });
  });

  it("⭐ against Worldspine Wurm (15/15) the fight would kill Apex Altisaur and leave the Wurm: declined — both stay undamaged", () => {
    const r = play(board("ai", { theirs: [perm("wurm", WURM, "user")] }), "ai");
    expect({ settled: r.settled, altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", wurm: r.s.players.user.battlefield.find((p) => p.id === "wurm")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, altisaur: 0, wurm: 0, fights: 0 });
  });

  it("⭐ the human seat gets the same chooser: the user's Apex Altisaur declines the AI's Worldspine Wurm", () => {
    const r = play(board("user", { theirs: [perm("wurm", WURM, "ai")] }), "user");
    expect({ settled: r.settled, altisaur: altisaur(r.s, "user")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, altisaur: 0, fights: 0 });
  });

  it("⭐ against Darksteel Colossus without Avacyn the fight would kill Apex Altisaur and not the Colossus: declined", () => {
    const r = play(board("ai", { theirs: [perm("colossus", COLOSSUS, "user")] }), "ai");
    expect({ settled: r.settled, altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, altisaur: 0, fights: 0 });
  });

  it("⭐ with Worldspine Wurm listed first and Grizzly Bears beside it, the fight goes to the Bears (the first legal target was the Wurm); the enrage after it declines the Wurm", () => {
    const r = play(board("ai", { theirs: [perm("wurm", WURM, "user"), perm("bears", BEARS, "user")] }), "ai");
    expect({ settled: r.settled, user: names(r.s.players.user.battlefield), graveyard: names(r.s.players.user.graveyard), altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", fights: fights(r.s) })
      .toEqual({ settled: true, user: ["Worldspine Wurm"], graveyard: ["Grizzly Bears"], altisaur: 2, fights: [["bears", r.s.players.ai.battlefield.find((p) => p.card?.name === "Apex Altisaur")?.id]] });
  });

  it("⭐ against Gigantosaurus (10/10) the fight is a trade — both would die: declined", () => {
    const r = play(board("ai", { theirs: [perm("giga", GIGANTOSAURUS, "user")] }), "ai");
    expect({ settled: r.settled, altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", gigantosaurus: names(r.s.players.user.battlefield), fights: fights(r.s).length })
      .toEqual({ settled: true, altisaur: 0, gigantosaurus: ["Gigantosaurus"], fights: 0 });
  });

  it("⭐ against Autochthon Wurm (9/14) both survive the first fight, and the enrage's second would kill both — a trade over two fights: declined", () => {
    const r = play(board("ai", { theirs: [perm("autochthon", AUTOCHTHON, "user")] }), "ai");
    expect({ settled: r.settled, altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", wurm: r.s.players.user.battlefield.find((p) => p.id === "autochthon")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, altisaur: 0, wurm: 0, fights: 0 });
  });

  it("⭐ Kogla (7/6, no enrage) against Unhallowed Phalanx (1/13): one fight can't kill it and nothing fights again — declined", () => {
    const r = play(board("ai", { hand: KOGLA, theirs: [perm("phalanx", PHALANX, "user")] }), "ai");
    const kogla = r.s.players.ai.battlefield.find((p) => p.card?.name === "Kogla, the Titan Ape");
    expect({ settled: r.settled, kogla: kogla?.damageMarked ?? "gone", phalanx: r.s.players.user.battlefield.find((p) => p.id === "phalanx")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, kogla: 0, phalanx: 0, fights: 0 });
  });

  it("⭐ 64 Worldspine Wurms: the enumeration's expansion cap cuts the decline off the candidates, and the chooser declines anyway", () => {
    const wurms = Array.from({ length: 64 }, (_, i) => perm(`wurm${i}`, WURM, "user"));
    const program = parseEffectClause("it fights up to one target creature you don't control", "Instant", { sourceScoped: true });
    const offered = expandCastChoices(board("ai", { theirs: wurms }), "ai", program, [], { sourceId: "x" });
    const r = play(board("ai", { theirs: wurms }), "ai");
    expect({ declineOffered: offered.some((c) => !(c.targets || []).length), settled: r.settled, altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ declineOffered: false, settled: true, altisaur: 0, fights: 0 });
  });
});

describe("Apex Altisaur — a fight worth taking is still taken (controls)", () => {
  it("control: against Grizzly Bears it fights, the Bears die, it lives with 2 damage; the enrage has nothing left to fight", () => {
    const r = play(board("ai", { theirs: [perm("bears", BEARS, "user")] }), "ai");
    expect({ settled: r.settled, graveyard: names(r.s.players.user.graveyard), altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, graveyard: ["Grizzly Bears"], altisaur: 2, fights: 1 });
  });

  it("control: against Unhallowed Phalanx (1/13) the first fight leaves it alive, the enrage fights again and kills it — Apex Altisaur lives with 2 damage", () => {
    const r = play(board("ai", { theirs: [perm("phalanx", PHALANX, "user")] }), "ai");
    expect({ settled: r.settled, graveyard: names(r.s.players.user.graveyard), altisaur: altisaur(r.s, "ai")?.damageMarked ?? "gone", fights: fights(r.s).length })
      .toEqual({ settled: true, graveyard: ["Unhallowed Phalanx"], altisaur: 2, fights: 2 });
  });

  it("control: the human seat's Apex Altisaur fights the AI's Grizzly Bears", () => {
    const r = play(board("user", { theirs: [perm("bears", BEARS, "ai")] }), "user");
    expect({ settled: r.settled, graveyard: names(r.s.players.ai.graveyard), altisaur: altisaur(r.s, "user")?.damageMarked ?? "gone" })
      .toEqual({ settled: true, graveyard: ["Grizzly Bears"], altisaur: 2 });
  });
});

describe("the chooser itself", () => {
  // Apex Altisaur on the battlefield with its enrage waiting — the trigger as flushTriggers hands it to the chooser (keyed).
  const ENRAGE = "it fights up to one target creature you don't control";
  const SENTENCE = "Enrage — Whenever this creature is dealt damage, it fights up to one target creature you don't control.";
  function enrage(s, resolvedThisTurn = null) {
    const program = parseEffectClause(ENRAGE, "Instant", { sourceScoped: true });
    const abilityKey = `alt-perm:${SENTENCE}`;
    const state = resolvedThisTurn ? { ...s, abilityResolutionsThisTurn: { [abilityKey]: resolvedThisTurn } } : s;
    const candidates = expandCastChoices(state, "ai", program, [], { sourceId: "alt-perm" });
    const trigger = { controller: "ai", source: { permanentId: "alt-perm", name: "Apex Altisaur" }, context: { abilityKey }, descriptor: { event: "dealtDamage", scope: "self", effectClause: ENRAGE, sourceText: SENTENCE } };
    return { state, picked: chooseTriggerTargets(candidates, { trigger, program, state }) };
  }
  const onBoard = (theirs) => {
    const s = board("ai", { mine: [perm("alt-perm", ALTISAUR, "ai")], theirs });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [] } } };
  };

  it("reading a fight leaves the board untouched (the fight is resolved on a copy)", () => {
    const s = onBoard([perm("wurm", WURM, "user"), perm("bears", BEARS, "user")]);
    const before = JSON.stringify(s);
    const { picked } = enrage(s);
    expect({ picked: (picked?.targets || []).map((t) => t.id), unchanged: JSON.stringify(s) === before }).toEqual({ picked: ["bears"], unchanged: true });
  });

  it(`⭐ the loop backstop: an optional target whose ability resolved ${LOOP_ITERATIONS} times this turn is declined — even a fight worth taking`, () => {
    const s = onBoard([perm("bears", BEARS, "user")]);
    const spent = enrage(s, { turn: 6, n: LOOP_ITERATIONS }).picked;
    const below = enrage(s, { turn: 6, n: LOOP_ITERATIONS - 1 }).picked;
    const lastTurn = enrage(s, { turn: 5, n: 5 * LOOP_ITERATIONS }).picked;
    expect({ spent: (spent?.targets || []).map((t) => t.id), below: (below?.targets || []).map((t) => t.id), lastTurn: (lastTurn?.targets || []).map((t) => t.id) })
      .toEqual({ spent: [], below: ["bears"], lastTurn: ["bears"] });
  });
});

describe("the loop backstop through the engine — two damage reflectors that can't die (Spitemare)", () => {
  // "Whenever this creature is dealt damage, it deals that much damage to any target": each trigger is mandatory but its target is
  // a choice, so a loop between two of them is not a draw (CR 104.4b). With Avacyn, Angel of Hope on each side neither dies, and
  // the chooser sent each hit to the other creature for ever. The ledger key is the one flushTriggers stamps (source:sentence).
  const KEY = (id) => `${id}:Whenever this creature is dealt damage, it deals that much damage to any target`;
  function table(ai, user, resolvedEach = 0) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      ...(resolvedEach ? { abilityResolutionsThisTurn: { [KEY("sa")]: { turn: 6, n: resolvedEach }, [KEY("sb")]: { turn: 6, n: resolvedEach } } } : {}),
      players: { ...g.players, ai: { ...g.players.ai, battlefield: ai, life: 40 }, user: { ...g.players.user, battlefield: user, life: 40 } },
    };
    s = applyDamageEffect(s, { controller: "user", amount: 1, targetType: "creature", targets: [{ type: "creature", id: "sa" }] });
    return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  }
  const shielded = (theirs, resolvedEach) => table([perm("sa", SPITEMARE, "ai"), perm("ava", AVACYN, "ai")], [perm("sb", theirs, "user"), perm("avb", AVACYN, "user")], resolvedEach);
  const lifeLost = (s) => 80 - s.players.ai.life - s.players.user.life;

  for (const [label, theirs] of [["Spitemare", SPITEMARE], ["Boros Reckoner", RECKONER]]) {
    it(`⭐ indestructible Spitemare against an indestructible ${label}, each ability ${LOOP_ITERATIONS - 4} resolutions in: the loop ends on a player within a few resolutions`, () => {
      const r = settleWithin(shielded(theirs, LOOP_ITERATIONS - 4), 40);
      expect({ settled: r.settled, lifeLost: lifeLost(r.s) }).toEqual({ settled: true, lifeLost: 1 });
    });
  }

  it(`⭐ from the first ping: the two Spitemares trade the 1 damage until each ability has resolved ${LOOP_ITERATIONS} times, then a player takes it`, () => {
    const r = settleWithin(shielded(SPITEMARE), 2 * LOOP_ITERATIONS + 40);
    const spitemares = [r.s.players.ai.battlefield, r.s.players.user.battlefield].flat().filter((p) => p.card?.name === "Spitemare").length;
    expect({ settled: r.settled, lifeLost: lifeLost(r.s), spitemares }).toEqual({ settled: true, lifeLost: 1, spitemares: 2 });
  });

  it("control: without Avacyn the plain Spitemares trade the damage until one dies — the backstop never comes into it", () => {
    const r = settleWithin(table([perm("sa", SPITEMARE, "ai")], [perm("sb", SPITEMARE, "user")]), 40);
    const died = [r.s.players.ai.graveyard, r.s.players.user.graveyard].flat().length;
    expect({ settled: r.settled, short: r.resolutions < 10, died: died >= 1 }).toEqual({ settled: true, short: true, died: true });
  });
});
