/**
 * THE WIZARD'S CAST TRIGGER — a 0/1 black Wizard creature token "with 'Whenever you cast a noncreature spell, this token deals 1 damage
 * to each opponent.'" (play-weighted 2026-10-21):
 *   · Lindblum, Industrial Regency // Mage Siege (EDHREC #1401) — the Town's Adventure, an instant: "Create a 0/1 black Wizard creature
 *     token with …";
 *   · Circle of Power (#2347) — "You draw two cards and you lose 2 life. Create a 0/1 black Wizard … / Wizards you control get +1/+0 and
 *     gain lifelink until end of turn.";
 *   · Cornered by Black Mages, Mysidian Elder, Queen Brahne print the same token.
 * The token's quoted ability is minted as the printed creature form (parseHelpers' curated token-trigger gate), so the cast watcher a
 * printed creature with that sentence carries fires off the token: a noncreature spell its controller casts (CR 603.2 — the trigger
 * resolves before the spell), the token the damage's source, every opponent dealt 1. A creature spell, or an opponent's spell, does
 * nothing.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard). Runtime through legalActionsForPlayer → dispatchAction →
 * resolveTopOfStack (the waiting triggers go on the stack as each object resolves).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { parseTokenTriggeredAbility } from "./effects/parseHelpers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, advanceStep, runStepActions, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LINDBLUM = {"name":"Lindblum, Industrial Regency // Mage Siege","type":"Land — Town // Instant — Adventure","mana":"{2}{R}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"layout":"adventure","oracle":"Lindblum, Industrial Regency - Land — Town \nThis land enters tapped.\n{T}: Add {R}.\n//\nMage Siege - Instant — Adventure {2}{R}\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\""}; // land-partial on c2d7f0b0
const CIRCLE_OF_POWER = {"name":"Circle of Power","type":"Sorcery","mana":"{3}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B"],"layout":"normal","oracle":"You draw two cards and you lose 2 life. Create a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"\nWizards you control get +1/+0 and gain lifelink until end of turn."}; // arbiter-spell on c2d7f0b0
const CORNERED = {"name":"Cornered by Black Mages","type":"Sorcery","mana":"{1}{B}{B}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["B"],"layout":"normal","oracle":"Target opponent sacrifices a creature of their choice.\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\""}; // arbiter-spell on c2d7f0b0
const MYSIDIAN_ELDER = {"name":"Mysidian Elder","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":["R"],"layout":"normal","oracle":"When this creature enters, create a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\""}; // body-only on c2d7f0b0
const QUEEN_BRAHNE = {"name":"Queen Brahne","type":"Legendary Creature — Human Noble","mana":"{2}{R}","cmc":3,"power":"2","toughness":"1","keywords":["Prowess"],"colors":["R"],"layout":"normal","oracle":"Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever Queen Brahne attacks, create a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\""}; // body-only on c2d7f0b0
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"layout":"normal","oracle":"Draw two cards."};
const RAGING_GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"layout":"normal","oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"layout":"normal","oracle":""};
const land = (name, sub, c) => ({ name, type: `Basic Land — ${sub}`, mana: "", cmc: 0, keywords: [], colors: [], oracle: `({T}: Add {${c}}.)` });
const MOUNTAIN = land("Mountain", "Mountain", "R"), SWAMP = land("Swamp", "Swamp", "B"), ISLAND = land("Island", "Island", "U");

const cardOf = (card, id) => ({ ...card, id });
const perm = (id, card, controller = "user") => createPermanent({ id, card: cardOf(card, `c-${id}`), controller, summoningSick: false });
const lands = (prefix, card, n) => Array.from({ length: n }, (_, i) => perm(`${prefix}${i + 1}`, card));
const lib = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: "Card", type: "Instant", oracle: "" }));
/** Three opponents (a commander table), the user's precombat main. */
function table({ bf = [], hand = [], aiBf = [] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: pid === "user" ? bf : pid === "ai1" ? aiBf : [], hand: pid === "user" ? hand : [], library: lib(6, `${pid}-l`), graveyard: [], life: 40 };
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const opponents = (s) => Object.keys(s.players).filter((p) => p !== "user");
const oppLife = (s) => opponents(s).map((p) => s.players[p].life);
const wizards = (s) => s.players.user.battlefield.filter((p) => p.card?.token && p.card.name === "Wizard");
const castOffer = (s, cardId, pick = () => true) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && pick(a));
function settle(s0) {
  let s = s0;
  for (let g = 0; g < 30 && ((s.stack || []).length || (s.pendingTriggers || []).length) && !s.pendingChoice; g++) s = s.stack.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return s;
}
const castAndSettle = (s, cardId, pick) => { const a = castOffer(s, cardId, pick); expect(a, `cast of ${cardId} offered`).toBeTruthy(); return settle(dispatchAction(s, a)); };

describe("the reader", () => {
  it("⭐ the five cards play their whole text", () => {
    expect([LINDBLUM, CIRCLE_OF_POWER, CORNERED, MYSIDIAN_ELDER, QUEEN_BRAHNE].map((c) => classifyCard(c)))
      .toEqual(["native-mixed", "native-spell", "native-spell", "native-trigger", "native-trigger"]);
  });
  it("⭐ the token's ability is minted as the printed creature form", () => {
    const [atom] = parseEffectProgram({ name: "Mage Siege", type: "Instant", mana: "{2}{R}", oracle: "Create a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"" }).atoms;
    expect(atom).toEqual({ op: "create-token", count: 1, power: 0, toughness: 1, descriptor: "black wizard", targetType: null,
      tokenOracle: "Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent." });
  });
  it("control: another payoff on the same trigger is not this ability and stays unread", () => {
    expect([
      "\"Whenever you cast a noncreature spell, this token deals 1 damage to any target.\"",
      "\"Whenever you cast a spell, this token deals 1 damage to each opponent.\"",
      "\"Whenever you cast a noncreature spell, this token deals 1 damage to each creature.\"",
    ].map((q) => parseTokenTriggeredAbility(q))).toEqual([null, null, null]);
  });
});

describe("Lindblum, Industrial Regency // Mage Siege", () => {
  const mageSiege = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-lb" && a.adventureCast);
  it("⭐ Mage Siege (an instant, from hand): a 0/1 black Wizard; the card goes on an adventure, and the Town plays from exile later", () => {
    const s0 = table({ bf: lands("m", MOUNTAIN, 3), hand: [cardOf(LINDBLUM, "c-lb")] });
    const act = mageSiege(s0);
    expect(act, "Mage Siege is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    const [wiz] = wizards(s);
    const fromExile = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.fromZone === "exile").map((a) => a.name);
    expect({ type: wiz.card.type, pt: [creaturePower(wiz, s), creatureToughness(wiz, s)], colors: wiz.card.colors, oracle: wiz.card.oracle, exiled: s.players.user.exile.some((c) => c.id === "c-lb"), fromExile })
      .toEqual({ type: "Token Creature — Wizard", pt: [0, 1], colors: ["B"], oracle: "Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent.", exiled: true, fromExile: ["Lindblum, Industrial Regency"] });
  });
  it("⭐ then a noncreature spell: each of the three opponents is dealt 1 by the Wizard; a creature spell does nothing", () => {
    const s0 = table({ bf: lands("m", MOUNTAIN, 4), hand: [cardOf(LINDBLUM, "c-lb"), cardOf(DIVINATION, "c-div"), cardOf(RAGING_GOBLIN, "c-rg")] });
    expect(mageSiege(s0), "Mage Siege is offered").toBeTruthy();
    let s = settle(dispatchAction(s0, mageSiege(s0)));
    const afterSiege = oppLife(s);
    s = castAndSettle(s, "c-rg");
    const afterGoblin = oppLife(s);
    // SETUP: three Islands for the Divination (the Mountains are spent).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...lands("i", ISLAND, 3)] } } };
    s = castAndSettle(s, "c-div");
    expect({ afterSiege, afterGoblin, afterDivination: oppLife(s), drew: s.players.user.hand.length }).toEqual({ afterSiege: [40, 40, 40], afterGoblin: [40, 40, 40], afterDivination: [39, 39, 39], drew: 2 });
  });
  it("an opponent's noncreature spell does not trigger it", () => {
    const s0 = table({ bf: lands("m", MOUNTAIN, 3), hand: [cardOf(LINDBLUM, "c-lb")] });
    expect(mageSiege(s0), "Mage Siege is offered").toBeTruthy();
    let s = settle(dispatchAction(s0, mageSiege(s0)));
    s = { ...s, activePlayer: "ai1", priorityHolder: "ai1", players: { ...s.players, ai1: { ...s.players.ai1, battlefield: lands("ai", ISLAND, 3).map((p) => ({ ...p, controller: "ai1" })), hand: [cardOf(DIVINATION, "c-adiv")] } } };
    const a = legalActionsForPlayer(s, "ai1").find((x) => x.kind === "cast-spell" && x.cardId === "c-adiv");
    expect(a, "the opponent's Divination is offered").toBeTruthy();
    s = settle(dispatchAction(s, a));
    expect({ opp: oppLife(s), me: s.players.user.life }).toEqual({ opp: [40, 40, 40], me: 40 });
  });
});

describe("Circle of Power", () => {
  it("⭐ draw two, lose 2 life, a Wizard; every Wizard you control (the new one too) +1/+0 with lifelink — its ping then gains 3", () => {
    let s = castAndSettle(table({ bf: [...lands("s", SWAMP, 4), ...lands("i", ISLAND, 3)], hand: [cardOf(CIRCLE_OF_POWER, "c-cop"), cardOf(DIVINATION, "c-div")] }), "c-cop");
    const [wiz] = wizards(s);
    expect(wiz, "a Wizard was made").toBeTruthy();
    const afterCircle = { life: s.players.user.life, hand: s.players.user.hand.length, pt: [creaturePower(wiz, s), creatureToughness(wiz, s)], lifelink: permanentHasKeyword(s, wiz.id, "Lifelink") };
    s = castAndSettle(s, "c-div");
    expect({ afterCircle, opp: oppLife(s), life: s.players.user.life })
      .toEqual({ afterCircle: { life: 38, hand: 3, pt: [1, 1], lifelink: true }, opp: [39, 39, 39], life: 41 });
  });
});

describe("Cornered by Black Mages, Mysidian Elder, Queen Brahne", () => {
  it("Cornered by Black Mages: the opponent sacrifices its creature, and the Wizard is made", () => {
    const s = castAndSettle(table({ bf: lands("s", SWAMP, 3), hand: [cardOf(CORNERED, "c-cbm")], aiBf: [perm("bear", BEARS, "ai1")] }), "c-cbm", (a) => (a.targets || []).some((t) => t.id === "ai1"));
    expect({ bear: s.players.ai1.battlefield.length, wizards: wizards(s).length }).toEqual({ bear: 0, wizards: 1 });
  });
  it("Mysidian Elder's enters trigger makes the Wizard", () => {
    const s = castAndSettle(table({ bf: lands("m", MOUNTAIN, 3), hand: [cardOf(MYSIDIAN_ELDER, "c-me")] }), "c-me");
    expect(wizards(s).map((w) => w.card.oracle)).toEqual(["Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent."]);
  });
  it("Queen Brahne's attack trigger makes the Wizard", () => {
    const s0 = table({ bf: [perm("qb", QUEEN_BRAHNE)] });
    let s = runStepActions(advanceStep(runStepActions(advanceStep(s0))));
    const atk = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "qb");
    s = dispatchAction(s, atk);
    s = settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "pass-priority"))); // the declaration closes: the attack trigger
    expect({ attacking: (s.combat?.attackers || []).map((a) => a.permanentId), wizards: wizards(s).map((w) => w.card.oracle) })
      .toEqual({ attacking: ["qb"], wizards: ["Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent."] });
  });
});
