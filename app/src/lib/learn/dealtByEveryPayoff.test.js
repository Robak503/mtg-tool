/**
 * THE DEALT-BY EVENT FIRES EVERY PAYOFF — "Whenever <this creature | equipped creature | enchanted creature> deals [combat] damage, …"
 * (CR 120.4b: abilities that trigger when damage is dealt trigger as it is dealt; CR 603.2c: once each time the event occurs; CR
 * 510.2: a combat damage step deals all its combat damage at once). Until now the event's one firing site (triggers.
 * checkDealtByTriggers) synthesized only the printed lifegain link "you gain that much life", read off the dealer's own card and its
 * Auras: every other payoff, and every granted body (an Equipment's or Aura's quoted ability, a group grant, an until-end-of-turn
 * grant), never triggered — play-weighted #16 refused them, parking Drinker of Sorrow, Olivia's Attendants, Angel of Deliverance and
 * Stir the Pride, and holding Ceremonial Knife and Quintessential Katana back. Now every dealt-by descriptor — printed on the dealer,
 * granted to it, or printed on what is attached to it — fires through the normal flush, "that much" / "that many" bound to what the
 * source actually dealt in that event (after replacement and prevention), once per event however many objects it damaged.
 *
 * The bundled rulings this reads: Drinker of Sorrow — "You only sacrifice one permanent, no matter how many things it deals damage
 * to."; Angel of Deliverance — "If Angel of Deliverance deals damage to multiple creatures, players, or planeswalkers at once … its
 * last ability triggers only once." and "If Angel of Deliverance deals damage and is dealt lethal damage at the same time, its ability
 * will trigger."; Stir the Pride — "Multiple instances of this ability trigger separately."; Living Lore — the combat-only form
 * triggers on combat damage to a player, a planeswalker or a creature alike.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-20). Ceremonial Knife's bundled text makes a Blood token.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkAttackTriggers, checkLifeLossTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively, isModeledGroupTriggeredBody } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveSacrificeChoice } from "./effects/runProgram.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, loseLife } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DRINKER_OF_SORROW = {"name":"Drinker of Sorrow","type":"Creature — Horror","mana":"{2}{B}","cmc":3,"power":"5","toughness":"3","keywords":[],"colors":["B"],"oracle":"This creature can't block.\nWhenever this creature deals combat damage, sacrifice a permanent."};
const OLIVIAS_ATTENDANTS = {"name":"Olivia's Attendants","type":"Creature — Vampire","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"6","keywords":["Menace"],"colors":["R"],"oracle":"Menace\nWhenever this creature deals damage, create that many Blood tokens. (They're artifacts with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\n{2}{R}: This creature deals 1 damage to any target."};
const ANGEL_OF_DELIVERANCE = {"name":"Angel of Deliverance","type":"Creature — Angel","mana":"{6}{W}{W}","cmc":8,"power":"6","toughness":"6","keywords":["Flying","Delirium"],"colors":["W"],"oracle":"Flying\nDelirium — Whenever this creature deals damage, if there are four or more card types among cards in your graveyard, exile target creature an opponent controls."};
const STIR_THE_PRIDE = {"name":"Stir the Pride","type":"Instant","mana":"{4}{W}","cmc":5,"power":null,"toughness":null,"keywords":["Entwine"],"colors":["W"],"oracle":"Choose one —\n• Creatures you control get +2/+2 until end of turn.\n• Until end of turn, creatures you control gain \"Whenever this creature deals damage, you gain that much life.\"\nEntwine {1}{W} (Choose both if you pay the entwine cost.)"};
const CEREMONIAL_KNIFE = {"name":"Ceremonial Knife","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+0 and has \"Whenever this creature deals combat damage, create a Blood token.\" (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"};
const QUINTESSENTIAL_KATANA = {"name":"Quintessential Katana","type":"Artifact — Equipment","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":["W"],"oracle":"Equipped creature gets +1/+1 and has \"Whenever this creature deals combat damage, untap it and you gain 2 life.\"\nWhenever a Ninja you control enters, you may attach this Equipment to it.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"};
const EXALTED_ANGEL = {"name":"Exalted Angel","type":"Creature — Angel","mana":"{4}{W}{W}","cmc":6,"power":"4","toughness":"5","keywords":["Flying","Morph"],"colors":["W"],"oracle":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"};
const SPIRIT_LINK = {"name":"Spirit Link","type":"Enchantment — Aura","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nWhenever enchanted creature deals damage, you gain that much life."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const KOR_FIREWALKER = {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["W"],"oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game: the user's battlefield and graveyard, the AI's battlefield, both at 20 life, both libraries stocked. */
function board({ user = [], ai = [], graveyard = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, graveyard, hand, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}
/** The user's `attackers` attack the AI; `blocks` pairs [blocker, attacker]. The regular combat damage step is dealt. */
function combat(s, attackers, blocks = []) {
  return resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage",
    combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })),
      blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, blockingPlayer: "ai", attackerId })) } });
}
/** Flush and resolve until the stack is empty (the engine's own chooser picks each trigger's targets). */
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const dealtBy = (s) => (s.pendingTriggers || []).filter((t) => t.event === "dealtBy").map((t) => t.descriptor?.effectClause ?? null);
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name).length;
const ids = (s, pid) => s.players[pid].battlefield.map((p) => p.id).sort();

describe("classification — the payoffs that now fire are credited, the lifegain link as it was", () => {
  it("⭐ Drinker of Sorrow, Olivia's Attendants, Angel of Deliverance, Stir the Pride and Ceremonial Knife read native", () => {
    expect([DRINKER_OF_SORROW, OLIVIAS_ATTENDANTS, ANGEL_OF_DELIVERANCE, STIR_THE_PRIDE, CEREMONIAL_KNIFE].map((c) => classifyCard(c)))
      .toEqual(["native-trigger", "native-mixed", "native-trigger", "native-spell", "native-trigger"]);
  });
  it("⭐ the routing gate: any dealt-by payoff that parses routes, printed or granted", () => {
    const route = (card) => detectTriggers(card).filter((d) => d.event === "dealtBy").map((d) => triggerRoutesNatively(d));
    expect({ drinker: route(DRINKER_OF_SORROW), olivia: route(OLIVIAS_ATTENDANTS), granted: isModeledGroupTriggeredBody("Whenever this creature deals damage, you gain that much life.") })
      .toEqual({ drinker: [true], olivia: [true], granted: true });
  });
  it("CONTROL — Exalted Angel's lifegain link stays native-trigger, and Spirit Link stays native", () => {
    expect([classifyCard(EXALTED_ANGEL), isNativeTier(classifyCard(SPIRIT_LINK))]).toEqual(["native-trigger", true]);
  });
});

describe("runtime — the printed payoffs", () => {
  it("⭐ Drinker of Sorrow connects for 5: its trigger sacrifices one of its controller's permanents", () => {
    const s = board({ user: [P("drinker", DRINKER_OF_SORROW, "user"), P("swamp", SWAMP, "user"), P("thopter", ORNITHOPTER, "user")] });
    const hit = combat(s, ["drinker"]);
    expect({ life: hit.players.ai.life, fired: dealtBy(hit) }).toEqual({ life: 15, fired: ["sacrifice a permanent"] });
    const asked = settle(hit);
    expect({ choice: asked.pendingChoice?.kind, count: asked.pendingChoice?.queue?.length, offered: asked.pendingChoice?.candidates?.map((c) => c.id) })
      .toEqual({ choice: "sacrifice-choice", count: 1, offered: ["drinker", "swamp", "thopter"] });
    const out = resolveSacrificeChoice(asked, "swamp");
    expect({ left: ids(out, "user"), graveyard: out.players.user.graveyard.map((c) => c.name) }).toEqual({ left: ["drinker", "thopter"], graveyard: ["Swamp"] });
  });
  it("⭐ Drinker of Sorrow blocked by two Bears deals damage to both at once — ONE trigger (its ruling: one permanent)", () => {
    const s = board({ user: [P("drinker", DRINKER_OF_SORROW, "user"), P("swamp", SWAMP, "user"), P("thopter", ORNITHOPTER, "user")],
      ai: [P("b1", GRIZZLY_BEARS, "ai"), P("b2", GRIZZLY_BEARS, "ai")] });
    const hit = combat(s, ["drinker"], [["b1", "drinker"], ["b2", "drinker"]]);
    expect({ bears: named(hit, "ai", "Grizzly Bears"), fired: dealtBy(hit) }).toEqual({ bears: 0, fired: ["sacrifice a permanent"] });
    // The Drinker died to the Bears' 4 at the same time it dealt its damage, and its ability still triggered: one permanent.
    const asked = settle(hit);
    expect({ count: asked.pendingChoice?.queue?.length, offered: asked.pendingChoice?.candidates?.map((c) => c.id) }).toEqual({ count: 1, offered: ["swamp", "thopter"] });
    expect(ids(resolveSacrificeChoice(asked, "thopter"), "user")).toEqual(["swamp"]);
  });
  it("⭐ damage to several at once is ONE event: Olivia's Attendants blocked by Bears and Craw Wurm deals 2 + 4 → six Blood tokens", () => {
    const s = board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai"), P("wurm", CRAW_WURM, "ai")] });
    const hit = combat(s, ["olivia"], [["bears", "olivia"], ["wurm", "olivia"]]);
    expect(dealtBy(hit)).toEqual(["create that many Blood tokens"]);
    expect(named(settle(hit), "user", "Blood")).toBe(6);
  });
  it("⭐ 'that many' is what was DEALT: a blocker with protection from red takes none of its share — four Blood tokens", () => {
    const s = board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")], ai: [P("kor", KOR_FIREWALKER, "ai"), P("wurm", CRAW_WURM, "ai")] });
    const hit = combat(s, ["olivia"], [["kor", "olivia"], ["wurm", "olivia"]]);
    expect(named(settle(hit), "user", "Blood")).toBe(4);
  });
  it("⭐ any damage: Olivia's Attendants' own 1-damage ping makes one Blood token", () => {
    const s = board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")] });
    const pinged = applyDamageEffect(s, { controller: "user", amount: 1, targetType: "player", targets: [{ type: "player", id: "ai" }], source: { id: "olivia" } });
    expect({ life: pinged.players.ai.life, blood: named(settle(pinged), "user", "Blood") }).toEqual({ life: 19, blood: 1 });
  });
  it("⭐ Angel of Deliverance with delirium (four card types in the graveyard) exiles the opponent's creature", () => {
    const gy = [{ id: "g1", ...OPT }, { id: "g2", ...DIVINATION }, { id: "g3", ...ORNITHOPTER }, { id: "g4", ...SWAMP }];
    const s = board({ user: [P("angel", ANGEL_OF_DELIVERANCE, "user")], ai: [P("giant", HILL_GIANT, "ai")], graveyard: gy });
    const out = settle(combat(s, ["angel"]));
    expect({ life: out.players.ai.life, giant: named(out, "ai", "Hill Giant"), exiled: out.players.ai.exile.map((c) => c.name) })
      .toEqual({ life: 14, giant: 0, exiled: ["Hill Giant"] });
  });
  it("⭐ combat only: Drinker of Sorrow dealing damage outside combat triggers nothing", () => {
    const s = board({ user: [P("drinker", DRINKER_OF_SORROW, "user"), P("swamp", SWAMP, "user")] });
    const pinged = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "player", targets: [{ type: "player", id: "ai" }], source: { id: "drinker" } });
    expect({ life: pinged.players.ai.life, fired: dealtBy(pinged) }).toEqual({ life: 18, fired: [] });
  });
});

describe("runtime — the granted payoffs", () => {
  it("⭐ Stir the Pride's second mode: each creature that deals damage gains its controller that much life", () => {
    const stir = { id: "h-stir", ...STIR_THE_PRIDE };
    const s = board({ user: [P("bears", GRIZZLY_BEARS, "user"), P("giant", HILL_GIANT, "user")], ai: [P("foe", CRAW_WURM, "ai")], hand: [stir] });
    const modeTwo = (a) => a.kind === "cast-spell" && a.cardId === stir.id && (a.chosenMode === 1 || (Array.isArray(a.chosenMode) && a.chosenMode.length === 1 && a.chosenMode[0] === 1));
    const act = legalActionsForPlayer(s, "user").find(modeTwo);
    expect(act, "Stir the Pride is offered with its second mode").toBeTruthy();
    const granted = settle(resolveTopOfStack(dispatchAction(s, act)));
    const hit = combat({ ...granted, players: { ...granted.players, user: { ...granted.players.user, life: 20 } } }, ["bears", "giant"]);
    expect(dealtBy(hit)).toEqual(["you gain that much life", "you gain that much life"]);
    expect(settle(hit).players.user.life).toBe(25);
  });
  it("⭐ Stir the Pride's grant reaches only the creatures its controller had as it resolved (its ruling): a later Bears gains nothing", () => {
    const stir = { id: "h-stir", ...STIR_THE_PRIDE };
    const s = board({ user: [P("bears", GRIZZLY_BEARS, "user")], hand: [stir] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === stir.id && (a.chosenMode === 1 || (Array.isArray(a.chosenMode) && a.chosenMode.length === 1 && a.chosenMode[0] === 1)));
    expect(act, "Stir the Pride is offered with its second mode").toBeTruthy();
    const granted = settle(resolveTopOfStack(dispatchAction(s, act)));
    const late = { ...granted, players: { ...granted.players, user: { ...granted.players.user, life: 20, battlefield: [...granted.players.user.battlefield, P("late", GRIZZLY_BEARS, "user")] } } };
    const hit = combat(late, ["late"]);
    expect({ ai: hit.players.ai.life, fired: dealtBy(hit), user: settle(hit).players.user.life }).toEqual({ ai: 18, fired: [], user: 20 });
  });
  it("⭐ Ceremonial Knife: the equipped creature (2/2 +1/+0) connects for 3 and makes one Blood token; its damage outside combat makes none", () => {
    let s = board({ user: [P("bears", GRIZZLY_BEARS, "user"), P("knife", CEREMONIAL_KNIFE, "user")] });
    s = attachPermanent(s, { equipId: "knife", targetId: "bears" });
    const out = settle(combat(s, ["bears"]));
    expect({ life: out.players.ai.life, blood: named(out, "user", "Blood") }).toEqual({ life: 17, blood: 1 });
    const pinged = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "player", targets: [{ type: "player", id: "ai" }], source: { id: "bears" } });
    expect(named(settle(pinged), "user", "Blood")).toBe(0);
  });
  it("⭐ Quintessential Katana: the equipped creature connects, untaps and its controller gains 2", () => {
    let s = board({ user: [P("bears", GRIZZLY_BEARS, "user", { tapped: true }), P("katana", QUINTESSENTIAL_KATANA, "user")] });
    s = attachPermanent(s, { equipId: "katana", targetId: "bears" });
    const out = settle(combat(s, ["bears"]));
    const bears = out.players.user.battlefield.find((p) => p.id === "bears");
    expect({ ai: out.players.ai.life, user: out.players.user.life, tapped: bears.tapped }).toEqual({ ai: 17, user: 22, tapped: false });
  });
});

describe("controls — the same on both trees", () => {
  it("CONTROL — Exalted Angel connects for 4 and its controller gains 4", () => {
    const out = settle(combat(board({ user: [P("angel", EXALTED_ANGEL, "user")] }), ["angel"]));
    expect({ ai: out.players.ai.life, user: out.players.user.life }).toEqual({ ai: 16, user: 24 });
  });
  it("CONTROL — Spirit Link on the AI's creature: its ping feeds the Aura's controller", () => {
    const foe = P("foe", GRIZZLY_BEARS, "ai", { attachments: ["link"] });
    const link = P("link", SPIRIT_LINK, "user", { attachedTo: "foe" });
    const s = board({ user: [link], ai: [foe] });
    const out = settle(applyDamageEffect(s, { controller: "ai", amount: 2, targetType: "player", targets: [{ type: "player", id: "user" }], source: { id: "foe" } }));
    expect(out.players.user.life).toBe(20);
  });
  it("CONTROL — no damage dealt, no trigger: Olivia's Attendants blocked by two Kor Firewalkers (protection from red)", () => {
    const s = board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")], ai: [P("kor1", KOR_FIREWALKER, "ai"), P("kor2", KOR_FIREWALKER, "ai")] });
    const hit = combat(s, ["olivia"], [["kor1", "olivia"], ["kor2", "olivia"]]);
    expect({ fired: dealtBy(hit), blood: named(settle(hit), "user", "Blood") }).toEqual({ fired: [], blood: 0 });
  });
  it("CONTROL — not a damage event: Olivia's Attendants declared as an attacker, then the AI losing 3 life, fire no dealt-by trigger", () => {
    const s = board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")] });
    const attacked = checkAttackTriggers({ ...s, phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "olivia", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    const lost = checkLifeLossTriggers(loseLife(attacked, { playerId: "ai", amount: 3, combatDamage: false }), { playerId: "ai", amount: 3 });
    expect({ life: lost.players.ai.life, fired: dealtBy(lost), blood: named(settle(lost), "user", "Blood") }).toEqual({ life: 17, fired: [], blood: 0 });
  });
  it("CONTROL — being dealt damage is not dealing it: a Shock on Drinker of Sorrow fires nothing", () => {
    const s = board({ user: [P("drinker", DRINKER_OF_SORROW, "user")] });
    const shocked = applyDamageEffect(s, { controller: "ai", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "drinker" }], source: null });
    expect(dealtBy(shocked)).toEqual([]);
  });
  it("CONTROL — Angel of Deliverance without delirium (three card types: instant, sorcery, land) exiles nothing", () => {
    const gy = [{ id: "g1", ...OPT }, { id: "g2", ...DIVINATION }, { id: "g4", ...SWAMP }];
    const out = settle(combat(board({ user: [P("angel", ANGEL_OF_DELIVERANCE, "user")], ai: [P("giant", HILL_GIANT, "ai")], graveyard: gy }), ["angel"]));
    expect({ life: out.players.ai.life, giant: named(out, "ai", "Hill Giant") }).toEqual({ life: 14, giant: 1 });
  });
});
