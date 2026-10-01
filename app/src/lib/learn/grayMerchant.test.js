/**
 * grayMerchant.test.js — the drain family past the X spell (the play-weighted program, P·13, 2026-10-01: Gray Merchant of
 * Asphodel, EDHREC rank #242; CR 700.5, 608.2h, 119.3).
 *
 *   "When this creature enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the
 *    life lost this way."
 *
 * matchDrainEachOpponent collapses the two sentences into ONE drain-each-opponent atom for a printed N (Kokusho, Blood
 * Tithe), Gray Merchant's devotion and a parseCountSource count (Malakir Bloodwitch's Vampires). The resolver reads the
 * amount once, before any life moves (CR 608.2h), and gains the life each opponent actually lost — an opponent whose
 * life total can't change lost none.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, grantTeferiShield } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GRAY_MERCHANT = { name: "Gray Merchant of Asphodel", type: "Creature — Zombie", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], power: "2", toughness: "4", keywords: [],
  oracle: "When this creature enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)" };
const KOKUSHO = { name: "Kokusho, the Evening Star", type: "Legendary Creature — Dragon Spirit", mana: "{4}{B}{B}", cmc: 6, colors: ["B"], power: "5", toughness: "5", keywords: ["Flying"],
  oracle: "Flying\nWhen Kokusho dies, each opponent loses 5 life. You gain life equal to the life lost this way." };
const BLOODWITCH = { name: "Malakir Bloodwitch", type: "Creature — Vampire Shaman", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], power: "4", toughness: "4", keywords: ["Flying", "Protection"],
  oracle: "Flying, protection from white\nWhen this creature enters, each opponent loses life equal to the number of Vampires you control. You gain life equal to the life lost this way." };
const BLOOD_TITHE = { name: "Blood Tithe", type: "Sorcery", mana: "{3}{B}", cmc: 4, colors: ["B"], keywords: [], oracle: "Each opponent loses 3 life. You gain life equal to the life lost this way." };
const AGENT_OF_MASKS = { name: "Agent of Masks", type: "Creature — Human Advisor", mana: "{3}{W}{B}", cmc: 5, colors: ["W", "B"], power: "2", toughness: "3", keywords: [],
  oracle: "At the beginning of your upkeep, each opponent loses 1 life. You gain life equal to the life lost this way." };
const SUBVERSION = { name: "Subversion", type: "Enchantment", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], keywords: [],
  oracle: "At the beginning of your upkeep, each opponent loses 1 life. You gain life equal to the life lost this way." };
const SCHOLAR = { name: "Scholar of Athreos", type: "Creature — Human Cleric", mana: "{2}{W}", cmc: 3, colors: ["W"], power: "1", toughness: "4", keywords: [],
  oracle: "{2}{B}: Each opponent loses 1 life. You gain life equal to the life lost this way." };
const SERVANT = { name: "Servant of Tymaret", type: "Creature — Zombie", mana: "{2}{B}", cmc: 3, colors: ["B"], power: "1", toughness: "3", keywords: ["Inspired", "Regenerate"],
  oracle: "Inspired — Whenever this creature becomes untapped, each opponent loses 1 life. You gain life equal to the life lost this way.\n{2}{B}: Regenerate this creature." };
const TORMENTED_HERO = { name: "Tormented Hero", type: "Creature — Human Warrior", mana: "{B}", cmc: 1, colors: ["B"], power: "2", toughness: "1", keywords: ["Heroic"],
  oracle: "This creature enters tapped.\nHeroic — Whenever you cast a spell that targets this creature, each opponent loses 1 life. You gain life equal to the life lost this way." };
// Devotion fodder: a hybrid pip and a Phyrexian pip each count once (CR 700.5).
const ARENA = { name: "Phyrexian Arena", type: "Enchantment", mana: "{1}{B}{B}", cmc: 3, colors: ["B"], keywords: [], oracle: "At the beginning of your upkeep, you draw a card and you lose 1 life." };
const SKIRGE = { name: "Vault Skirge", type: "Artifact Creature — Phyrexian Imp", mana: "{1}{B/P}", cmc: 2, colors: ["B"], power: "1", toughness: "1", keywords: ["Flying", "Lifelink"],
  oracle: "({B/P} can be paid with either {B} or 2 life.)\nFlying\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };
const DEATHRITE = { name: "Deathrite Shaman", type: "Creature — Elf Shaman", mana: "{B/G}", cmc: 1, colors: ["B", "G"], power: "1", toughness: "2", keywords: [],
  oracle: "{T}: Exile target land card from a graveyard. Add one mana of any color.\n{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.\n{G}, {T}: Exile target creature card from a graveyard. You gain 2 life." };
const NIGHTHAWK = { name: "Vampire Nighthawk", type: "Creature — Vampire Shaman", mana: "{1}{B}{B}", cmc: 3, colors: ["B"], power: "2", toughness: "3", keywords: ["Deathtouch", "Flying", "Lifelink"],
  oracle: "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };

const OPPS = ["ai1", "ai2", "ai3"];
/** A four-seat Commander pod (40 life), the user in their main phase with `hand`, B mana and `board` already in play. */
function pod({ hand = [], board = [], black = 6 } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  let s = { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, B: black } } } };
  for (const [id, c] of board) {
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield,
      createPermanent({ id: `p-${id}`, card: { ...c, id }, controller: "user", summoningSick: false })] } } };
  }
  return s;
}
const cast = (s, cardId) => {
  const a = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === cardId);
  if (a.length !== 1) throw new Error(`expected exactly one cast of ${cardId}, found ${a.length}`);
  return dispatchAction(s, a[0]);
};
/** Resolve the stack and any pending triggers to quiet. */
function settle(s) {
  let n = finalizeStackResolution(s), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = finalizeStackResolution(n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const lives = (s) => Object.fromEntries(["user", ...OPPS].map((p) => [p, s.players[p].life]));

describe("the cards", () => {
  it("one drain atom per form: devotion (Gray Merchant), a printed N (Kokusho), a board count (Malakir Bloodwitch)", () => {
    const atomsOf = (clause) => { const p = parseEffectClause(clause, "trigger"); return [p.confidence, p.atoms]; };
    expect({
      merchant: atomsOf("each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way"),
      kokusho: atomsOf("each opponent loses 5 life. You gain life equal to the life lost this way"),
      bloodwitch: atomsOf("each opponent loses life equal to the number of Vampires you control. You gain life equal to the life lost this way"),
    }).toEqual({
      merchant: ["high", [{ op: "drain-each-opponent", amountCount: { kind: "devotion", color: "B", per: 1 }, targetType: null }]],
      kokusho: ["high", [{ op: "drain-each-opponent", amount: 5, targetType: null }]],
      bloodwitch: ["high", [{ op: "drain-each-opponent", amountCount: { kind: "permanentsYouControl", subtype: "Vampire", per: 1 }, targetType: null }]],
    });
  });

  it("⛔ an unmodeled count source or a trailing rider leaves the compound unread (low → Arbiter)", () => {
    const conf = (clause) => parseEffectClause(clause, "trigger").confidence;
    expect([
      conf("each opponent loses life equal to the number of creatures your opponents control. You gain life equal to the life lost this way"),
      conf("each opponent loses 2 life. You gain life equal to the life lost this way. Draw a card"),
    ]).toEqual(["low", "low"]);
  });

  it("the nine carriers are native", () => {
    expect([GRAY_MERCHANT, KOKUSHO, BLOODWITCH, BLOOD_TITHE, AGENT_OF_MASKS, SUBVERSION, SCHOLAR, SERVANT, TORMENTED_HERO].map((c) => [c.name, classifyCard(c)])).toEqual([
      ["Gray Merchant of Asphodel", "native-trigger"], ["Kokusho, the Evening Star", "native-trigger"], ["Malakir Bloodwitch", "native-trigger"],
      ["Blood Tithe", "native-spell"], ["Agent of Masks", "native-trigger"], ["Subversion", "native-trigger"], ["Scholar of Athreos", "native-activated"],
      ["Servant of Tymaret", "native-mixed"], ["Tormented Hero", "native-trigger"],
    ]);
  });
});

describe("in play", () => {
  it("Gray Merchant drains each opponent for your devotion to black — its own two pips, the Arena's two, a hybrid and a Phyrexian pip (WITNESS)", () => {
    const s = settle(cast(pod({ hand: [["gm", GRAY_MERCHANT]], board: [["arena", ARENA], ["skirge", SKIRGE], ["drs", DEATHRITE]], black: 5 }), "gm"));
    const witness = { lives: lives(s), merchant: s.players.user.battlefield.some((p) => p.card?.name === "Gray Merchant of Asphodel") };
    console.log(`WITNESS grayMerchant ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ lives: { user: 58, ai1: 34, ai2: 34, ai3: 34 }, merchant: true });
  });

  it("the devotion is read as the trigger resolves (CR 608.2h): Gray Merchant gone by then counts nothing", () => {
    const entered = finalizeStackResolution(resolveTopOfStack(cast(pod({ hand: [["gm", GRAY_MERCHANT]], board: [["arena", ARENA]], black: 5 }), "gm")));
    const gmId = entered.players.user.battlefield.find((p) => p.card?.name === "Gray Merchant of Asphodel").id;
    const killed = ATOM_RESOLVERS["destroy"](entered, { op: "destroy", targetType: "creature" }, { controller: "ai1", targets: [{ type: "creature", id: gmId }] });
    expect(lives(settle(killed))).toEqual({ user: 46, ai1: 38, ai2: 38, ai3: 38 });
  });

  it("an opponent whose life total can't change loses nothing — and you gain only what the others lost", () => {
    const shielded = grantTeferiShield(pod({ hand: [["gm", GRAY_MERCHANT]], black: 5 }), "ai2");
    expect(lives(settle(cast(shielded, "gm")))).toEqual({ user: 44, ai1: 38, ai2: 40, ai3: 38 });
  });

  it("life lost past 0 is still life lost (CR 119.3): an opponent at 1 loses all 2, and you gain 2 for them", () => {
    const low = pod({ hand: [["gm", GRAY_MERCHANT]], black: 5 });
    const s = settle(cast({ ...low, players: { ...low.players, ai3: { ...low.players.ai3, life: 1 } } }, "gm"));
    expect({ user: s.players.user.life, ai3: s.players.ai3.life }).toEqual({ user: 46, ai3: -1 });
  });

  it("Kokusho dies: each opponent loses 5 and you gain 15", () => {
    const s = settle(cast(pod({ hand: [["k", KOKUSHO]], black: 6 }), "k"));
    const kId = s.players.user.battlefield.find((p) => p.card?.name === "Kokusho, the Evening Star").id;
    const died = settle(ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "creature" }, { controller: "ai1", targets: [{ type: "creature", id: kId }] }));
    expect(lives(died)).toEqual({ user: 55, ai1: 35, ai2: 35, ai3: 35 });
  });

  it("Malakir Bloodwitch counts the Vampires you control as it resolves — itself and a Nighthawk", () => {
    const s = settle(cast(pod({ hand: [["mb", BLOODWITCH]], board: [["nh", NIGHTHAWK]], black: 5 }), "mb"));
    expect(lives(s)).toEqual({ user: 46, ai1: 38, ai2: 38, ai3: 38 });
  });

  it("Scholar of Athreos's {2}{B} activation drains 1 from each opponent", () => {
    const s = pod({ board: [["sch", SCHOLAR]], black: 3 });
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p-sch");
    expect({ offers: act.length, lives: act.length === 1 ? lives(settle(dispatchAction(s, act[0]))) : null })
      .toEqual({ offers: 1, lives: { user: 43, ai1: 39, ai2: 39, ai3: 39 } });
  });

  it("Blood Tithe is one cast — no X to choose — and drains 3 from each opponent", () => {
    expect(lives(settle(cast(pod({ hand: [["bt", BLOOD_TITHE]], black: 4 }), "bt")))).toEqual({ user: 49, ai1: 37, ai2: 37, ai3: 37 });
  });
});
