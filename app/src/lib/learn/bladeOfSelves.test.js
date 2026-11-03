/**
 * bladeOfSelves.test.js — BLADE OF SELVES (the play-weighted program, EDHREC #898), and myriad played:
 *
 *   "Equipped creature has myriad. (Whenever it attacks, for each opponent other than defending player, you may create a token copy
 *    that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)
 *    Equip {4}"
 *
 * Myriad was credited as an optional rider the engine always declined (coverage KW-MYRIAD); on this Equipment the grant is the whole
 * card, so it needs the real copies (effects/atoms/myriad.js — CR 702.116a, 702.116b): the trigger queued as the attack declaration
 * closes, one per instance, printed or granted (a layer-6 "myriad" grant — the Equipment's, Legion Loyalty's team grant); its
 * resolution's one yes/no; a token copy of the creature for each opponent other than the defending player, tapped and attacking that
 * player (never declared — no attack trigger for it, CR 508.4); the copies exiled at end of combat (a delayed trigger fired at the end
 * of combat step, CR 511.2). The bundled rulings witnessed: a copy copies the printed creature only (not the Equipment on it); the
 * defending player is the only opponent → no copy; two instances → two copies per opponent; a legendary creature's copies meet the
 * legend rule (the creature that attacked stays; the copies' dies triggers work); a token doubler makes two per opponent. Real
 * combat: the declaration closed (gameEngine.closeAttackDeclaration), the stack, the choice settled (runProgram.resolveOptionalChoice;
 * the default AI's answer is runProgram.optionalAutoTakeValue), combat damage and the end of combat (gameEngine.nextStep). Card text:
 * the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { closeAttackDeclaration, nextStep, resolveTopOfStack, finalizeStackResolution, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice, optionalAutoTakeValue } from "./effects/runProgram.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { keywordInstanceCount, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLADE = {"name":"Blade of Selves","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has myriad. (Whenever it attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\nEquip {4}","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #898
const LEGION_LOYALTY = {"name":"Legion Loyalty","type":"Enchantment","mana":"{6}{W}{W}","oracle":"Creatures you control have myriad. (Whenever a creature with myriad attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)","layout":"normal","cmc":8,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2948
const CALLER = {"name":"Caller of the Pack","type":"Creature — Beast","mana":"{5}{G}{G}","oracle":"Trample\nMyriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)","layout":"normal","cmc":7,"power":"8","toughness":"6","loyalty":null,"keywords":["Trample","Myriad"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #11567
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","oracle":"","layout":"normal","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #7269
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","layout":"normal","cmc":2,"power":"0","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #141
const SQUAD_CAPTAIN = {"name":"Squad Captain","type":"Creature — Human Soldier","mana":"{4}{W}","oracle":"Vigilance (Attacking doesn't cause this creature to tap.)\nThis creature enters with a +1/+1 counter on it for each other creature you control.","layout":"normal","cmc":5,"power":"2","toughness":"2","loyalty":null,"keywords":["Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #20506
const SHERIFF = {"name":"Sheriff of Safe Passage","type":"Creature — Human Knight","mana":"{2}{W}","oracle":"This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control.\nPlot {1}{W} (You may pay {1}{W} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)","layout":"normal","cmc":3,"power":"0","toughness":"0","loyalty":null,"keywords":["Plot"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #17750
const SOUL_WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","oracle":"Whenever another creature enters, you gain 1 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #474
const SCURRY = {"name":"Scurry of Squirrels","type":"Creature — Squirrel Scout","mana":"{2}{G}","oracle":"Myriad, myriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token that's a copy of this creature that's tapped and attacking that player or a planeswalker they control. Then do it again. Exile the tokens at end of combat.)\nWhenever this creature deals combat damage to a player, put a +1/+1 counter on target creature you control.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Myriad"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #3300
const PEREGRIN_TOOK = {"name":"Peregrin Took","type":"Legendary Creature — Halfling Citizen","mana":"{2}{G}","oracle":"If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Food"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #791
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const PARALLEL_LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #408

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/**
 * `seat`'s declare attackers step in a four-seat pod (or a duel): `attacker` declared at `defender`, tapped; `blades` Blades of Selves
 * attached to it; `extra` permanents. The declaration is closed (the triggers go on the stack).
 */
function attack({ seat = "user", attacker = GIANT, defender = "ai1", blades = 1, extra = [], duel = false } = {}) {
  const g = duel ? createGameState({ userDeck: [], aiDeck: [] }) : createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const mine = [on(seat, "atk", attacker, { tapped: true }), ...Array.from({ length: blades }, (_, i) => on(seat, `blade${i}`, BLADE)), ...extra.filter((p) => p.controller === seat)];
  const players = { ...g.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: pid === seat ? mine : extra.filter((p) => p.controller === pid), hand: [] };
  let s = { ...g, turn: 5, phase: "combat", step: "declare-attackers", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
  for (let i = 0; i < blades; i++) s = attachPermanent(s, { equipId: `blade${i}`, targetId: "atk" });
  s = { ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: seat, defender }], blockers: [] } };
  return closeAttackDeclaration(s).state;
}
/** Resolve the myriad trigger on top of the stack and answer its yes/no. */
/** The myriad trigger on top of the stack, resolved to its yes/no (asserted there first, so a board with no trigger fails on an assertion). */
const toMyriadChoice = (s) => {
  expect(stackSources(s).length, "no myriad trigger on the stack").toBeGreaterThan(0);
  return resolveTopOfStack(s);
};
const myriad = (s, take) => {
  const paused = toMyriadChoice(s);
  expect(paused.pendingChoice?.effectOp, "the myriad trigger did not ask").toBe("myriad");
  return resolveOptionalChoice(paused, take);
};
const copies = (s, seat = "user") => (s.players[seat].battlefield || []).filter((p) => p.card?.token && p.myriadToken);
const attacking = (s) => (s.combat?.attackers || []).map((a) => `${a.permanentId}->${a.defender}`).sort();
const stackSources = (s) => (s.stack || []).map((o) => o.source?.name);

describe("the cards", () => {
  it("⭐ Blade of Selves is a native Equipment: the grant is a layer-6 myriad", () => {
    expect({ tier: classifyCard(BLADE), bonus: parseAttachedBonus(BLADE) }).toEqual({ tier: "native-equipment", bonus: [{ layer: 6, op: { layerOp: "addKeyword", keyword: "myriad" }, duration: { kind: "permanent" } }] });
  });
  it("Legion Loyalty (the team grant, a twin) and a printed-myriad creature are native", () => {
    expect({ loyalty: classifyCard(LEGION_LOYALTY), caller: classifyCard(CALLER) }).toEqual({ loyalty: "native-static", caller: "native-body" });
  });
});

describe("the trigger and its copies", () => {
  it("⭐ the equipped Giant attacks ai1: taken, a tapped copy attacks each of ai2 and ai3, never ai1; the copies carry no Equipment; combat damage 3 to each of the three", () => {
    let s = attack();
    expect(stackSources(s)).toEqual(["Hill Giant"]);
    s = myriad(s, true);
    const made = copies(s);
    expect({ made: made.map((p) => p.card.name), tapped: made.every((p) => p.tapped), equipped: made.map((p) => p.attachments?.length || 0), attacking: attacking(s), blade: s.players.user.battlefield.find((p) => p.id === "blade0").attachedTo })
      .toEqual({ made: ["Hill Giant", "Hill Giant"], tapped: true, equipped: [0, 0], attacking: ["atk->ai1", `${made[0].id}->ai2`, `${made[1].id}->ai3`].sort(), blade: "atk" });
    s = nextStep(nextStep(s)); // declare blockers (none), combat damage
    expect({ step: s.step, life: ["ai1", "ai2", "ai3"].map((p) => s.players[p].life) }).toEqual({ step: "combat-damage", life: [37, 37, 37] });
  });
  it("⭐ the copies are exiled at end of combat (the delayed trigger at the end of combat step); the Giant stays", () => {
    let s = nextStep(nextStep(myriad(attack(), true)));
    s = nextStep(s);
    expect({ step: s.step, onStack: stackSources(s) }).toEqual({ step: "end-of-combat", onStack: ["Hill Giant"] });
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ copies: copies(s).length, giant: s.players.user.battlefield.some((p) => p.id === "atk") }).toEqual({ copies: 0, giant: true });
  });
  it("declined: no copy, no delayed trigger", () => {
    const s = myriad(attack(), false);
    expect({ copies: copies(s).length, attacking: attacking(s), delayed: (s.delayedTriggers || []).length }).toEqual({ copies: 0, attacking: ["atk->ai1"], delayed: 0 });
  });
  it("⛔ a duel: the defending player is the only opponent — nothing triggers (the ruling: no tokens)", () => {
    const s = attack({ duel: true, defender: "ai" });
    expect({ stack: s.stack.length, copies: copies(s).length }).toEqual({ stack: 0, copies: 0 });
  });
  it("⭐ two Blades are two instances (CR 702.116b): two triggers, four copies — two at each other opponent", () => {
    let s = attack({ blades: 2 });
    expect(stackSources(s)).toEqual(["Hill Giant", "Hill Giant"]);
    s = myriad(s, true);
    s = myriad(s, true);
    expect(attacking(s).filter((a) => !a.startsWith("atk")).map((a) => a.split("->")[1]).sort()).toEqual(["ai2", "ai2", "ai3", "ai3"]);
  });
  it("⭐ the copies were never declared: a copy of a printed-myriad creature does not trigger its own myriad", () => {
    let s = attack({ attacker: CALLER, blades: 0 });
    expect(stackSources(s)).toEqual(["Caller of the Pack"]);
    s = myriad(s, true);
    expect({ copies: copies(s).length, stack: s.stack.length, pendingTriggers: (s.pendingTriggers || []).length }).toEqual({ copies: 2, stack: 0, pendingTriggers: 0 });
  });
  it("Legion Loyalty's team grant: a Giant with no Equipment attacks and its myriad triggers", () => {
    const s = attack({ blades: 0, extra: [on("user", "ll", LEGION_LOYALTY)] });
    expect(stackSources(s)).toEqual(["Hill Giant"]);
  });
  it("a token doubler (Parallel Lives) makes two copies at each other opponent (the ruling)", () => {
    const s = myriad(attack({ extra: [on("user", "pl", PARALLEL_LIVES)] }), true);
    expect(attacking(s).filter((a) => !a.startsWith("atk")).map((a) => a.split("->")[1]).sort()).toEqual(["ai2", "ai2", "ai3", "ai3"]);
  });
  it("⭐ legendary (the ruling): the copies enter and the legend rule keeps Isamaru, the one that attacked; Blood Artist sees the two copies die", () => {
    let s = myriad(attack({ attacker: ISAMARU, extra: [on("user", "ba", BLOOD_ARTIST)] }), true);
    s = finalizeStackResolution(s);
    const artist = (s.stack || []).filter((o) => o.source?.name === "Blood Artist").length + (s.pendingTriggers || []).filter((t) => t.source?.name === "Blood Artist").length;
    expect({ isamaru: s.players.user.battlefield.filter((p) => p.card?.name === "Isamaru, Hound of Konda").map((p) => p.id), attacking: attacking(s), artist })
      .toEqual({ isamaru: ["atk"], attacking: ["atk->ai1"], artist: 2 });
  });
});

describe("the default AI", () => {
  it("⭐ takes the copies for a nonlegendary creature", () => {
    const paused = toMyriadChoice(attack({ seat: "ai1", defender: "user" }));
    expect({ op: paused.pendingChoice?.effectOp, take: optionalAutoTakeValue(paused, paused.pendingChoice) }).toEqual({ op: "myriad", take: true });
    const s = resolveOptionalChoice(paused, true);
    expect(attacking(s).filter((a) => !a.startsWith("atk")).map((a) => a.split("->")[1]).sort()).toEqual(["ai2", "ai3"]);
  });
  it("⭐ declines them for a legendary creature (the legend rule would leave only the one that attacked)", () => {
    const paused = toMyriadChoice(attack({ seat: "ai1", defender: "user", attacker: ISAMARU }));
    expect(optionalAutoTakeValue(paused, paused.pendingChoice)).toBe(false);
  });
});

const SPIKE_COLONY = {"name":"Spike Colony","type":"Creature — Spike","mana":"{4}{G}","oracle":"This creature enters with four +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature.","layout":"normal","cmc":5,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #28271
const CORPOREAL = {"name":"Corporeal Projection","type":"Sorcery","mana":"{U}{R}","oracle":"Target creature you control gains myriad until end of turn. (Whenever it attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\nOverload {3}{U}{U}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Overload"],"colors":["R","U"],"colorIdentity":["R","U"]}; // EDHREC #12191
const DUKE = {"name":"Duke Ulder Ravengard","type":"Legendary Creature — Human Noble Soldier","mana":"{4}{R}{W}","oracle":"At the beginning of combat on your turn, another target creature you control gains haste and myriad until end of turn. (Whenever it attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":[],"colors":["R","W"],"colorIdentity":["R","W"]}; // EDHREC #6961
const MASS = {"name":"Mass of Mysteries","type":"Legendary Creature — Elemental","mana":"{W}{U}{B}{R}{G}","oracle":"First strike, vigilance, trample\nAt the beginning of combat on your turn, another target Elemental you control gains myriad until end of turn. (Whenever it attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":["Vigilance","First strike","Trample"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]}; // EDHREC #6576
const AIR_ELEMENTAL = {"name":"Air Elemental","type":"Creature — Elemental","mana":"{3}{U}{U}","oracle":"Flying","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #24441

/** `s` with the attacker's own +1/+1 counters set (the creature as it entered). */
const withAttackerCounters = (s, n) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "atk" ? { ...p, counters: { "+1/+1": n } } : p)) } } });
const plusCounters = (s) => copies(s).map((p) => p.counters?.["+1/+1"] ?? 0);

describe("a copy enters with what the copied creature enters with (CR 707.5, 614.1c — the bundled rulings)", () => {
  it("⭐ Spike Colony (a 0/0 that enters with four +1/+1 counters) equipped: each copy enters with its four counters and survives", () => {
    const s = finalizeStackResolution(myriad(withAttackerCounters(attack({ attacker: SPIKE_COLONY }), 4), true));
    expect({ copies: copies(s).length, counters: plusCounters(s), attacking: attacking(s).length }).toEqual({ copies: 2, counters: [4, 4], attacking: 3 });
  });
});

describe("one trigger's copies are one creation event (the rulings: \"The token creatures all enter the battlefield at the same time\"; CR 614.12, 603.6a)", () => {
  it("⭐ Squad Captain (\"a +1/+1 counter for each other creature you control\") with a Grizzly Bears: each copy counts the Captain and the Bears — 2 each, never the other copy", () => {
    const s = finalizeStackResolution(myriad(attack({ attacker: SQUAD_CAPTAIN, extra: [on("user", "bears", BEARS)] }), true));
    expect({ copies: copies(s).length, counters: plusCounters(s) }).toEqual({ copies: 2, counters: [2, 2] });
  });
  it("⭐ the same with Parallel Lives: four copies, all entering together — 2 counters each", () => {
    const s = finalizeStackResolution(myriad(attack({ attacker: SQUAD_CAPTAIN, extra: [on("user", "bears", BEARS), on("user", "pl", PARALLEL_LIVES)] }), true));
    expect({ copies: copies(s).length, counters: plusCounters(s) }).toEqual({ copies: 4, counters: [2, 2, 2, 2] });
  });
  it("⭐ Legion Loyalty on Sheriff of Safe Passage (one counter plus one for each other creature you control) with a Grizzly Bears: 3 each", () => {
    const s0 = withAttackerCounters(attack({ attacker: SHERIFF, blades: 0, extra: [on("user", "ll", LEGION_LOYALTY), on("user", "bears", BEARS)] }), 3);
    const s = finalizeStackResolution(myriad(s0, true));
    expect({ copies: copies(s).length, counters: plusCounters(s) }).toEqual({ copies: 2, counters: [3, 3] });
  });
  it("⭐ Soul Warden equipped: the original sees both copies enter and each copy sees the other (CR 603.6a) — 4 life", () => {
    let s = finalizeStackResolution(myriad(attack({ attacker: SOUL_WARDEN }), true));
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    for (let g = 0; s.stack.length && g < 12; g++) s = resolveTopOfStack(s);
    expect({ copies: copies(s).length, life: s.players.user.life }).toEqual({ copies: 2, life: 44 });
  });
  it("⭐ Peregrin Took's \"those tokens plus an additional Food token\" applies once to the one creation event: one Food", () => {
    const s = finalizeStackResolution(myriad(attack({ extra: [on("user", "took", PEREGRIN_TOOK)] }), true));
    expect({ copies: copies(s).length, food: s.players.user.battlefield.filter((p) => p.card?.name === "Food").length }).toEqual({ copies: 2, food: 1 });
  });
});

describe("printed instances (CR 702.116b — \"each triggers separately\")", () => {
  it("⭐ Scurry of Squirrels' \"Myriad, myriad\": two triggers; both taken — two copies at each other opponent", () => {
    let s = attack({ attacker: SCURRY, blades: 0 });
    expect(stackSources(s)).toEqual(["Scurry of Squirrels", "Scurry of Squirrels"]);
    s = myriad(myriad(s, true), true);
    expect(attacking(s).filter((a) => !a.startsWith("atk")).map((a) => a.split("->")[1]).sort()).toEqual(["ai2", "ai2", "ai3", "ai3"]);
  });
  it("Caller of the Pack's one printed myriad is one trigger", () => {
    expect(stackSources(attack({ attacker: CALLER, blades: 0 }))).toEqual(["Caller of the Pack"]);
  });
});

describe("the twins — the myriad grants that now play", () => {
  /** `seat`'s precombat main in a pod, `perms` on its battlefield. */
  const main = (perms, extra = {}) => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, battlefield: perms, hand: [], ...extra } } };
  };
  /** Declare `id` attacking ai1 from `s` (declare attackers step), close the declaration. */
  const swing = (s, id) => closeAttackDeclaration({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: id, attackingPlayer: "user", defender: "ai1" }], blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === id ? { ...p, tapped: true } : p)) } } }).state;
  it("⭐ Corporeal Projection (#12191): the Giant gains myriad until end of turn, then attacks — its myriad triggers and makes two copies", () => {
    const s0 = main([on("user", "atk", GIANT)], { hand: [{ ...CORPOREAL, id: "h-cp" }], manaPool: { W: 0, U: 1, B: 0, R: 1, G: 0, C: 0 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-cp" && a.targets?.[0]?.id === "atk");
    expect(cast, "Corporeal Projection at the Giant is not offered").toBeTruthy();
    const s1 = resolveTopOfStack(dispatchAction(s0, cast));
    const s2 = swing(s1, "atk");
    expect(stackSources(s2)).toEqual(["Hill Giant"]);
    expect(copies(myriad(s2, true)).length).toBe(2);
  });
  it("⭐ Duke Ulder Ravengard (#6961): at the beginning of combat another creature of yours gains haste and myriad; it attacks and its myriad triggers", () => {
    let s = nextStep(main([on("user", "duke", DUKE), on("user", "atk", { ...GIANT }, { summoningSick: true })]));
    expect(s.step).toBe("beginning-of-combat");
    while (s.stack.length) s = resolveTopOfStack(s);
    const giant = s.players.user.battlefield.find((p) => p.id === "atk");
    expect({ haste: permanentHasKeyword(s, "atk", "Haste"), myriad: keywordInstanceCount(s, "atk", "myriad", 0), duke: keywordInstanceCount(s, "duke", "myriad", 0), sick: giant.summoningSick }).toEqual({ haste: true, myriad: 1, duke: 0, sick: true });
    expect(stackSources(swing(s, "atk"))).toEqual(["Hill Giant"]);
  });
  it("⭐ Mass of Mysteries (#6576): another Elemental gains myriad — the Air Elemental; a Giant is no Elemental and isn't chosen", () => {
    let s = nextStep(main([on("user", "mass", MASS), on("user", "air", AIR_ELEMENTAL), on("user", "hg", GIANT)]));
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ air: keywordInstanceCount(s, "air", "myriad", 0), giant: keywordInstanceCount(s, "hg", "myriad", 0), mass: keywordInstanceCount(s, "mass", "myriad", 0) }).toEqual({ air: 1, giant: 0, mass: 0 });
    expect(stackSources(swing(s, "air"))).toEqual(["Air Elemental"]);
  });
});
