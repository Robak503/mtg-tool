/**
 * THE EQUIPPED ATTACKER'S PRONOUN — in "Whenever equipped creature attacks, …" the "it"/"its" of the effect is the attacking
 * creature, the trigger's triggering permanent (CR 608.2c), never the Equipment. The attack-watcher pronoun rewrites read it for
 * a counter, a pump and a keyword grant; two shapes were unread:
 *   · Two-Handed Axe // Sweeping Cleave (EDHREC #2389) — "Whenever equipped creature attacks, double its power until end of turn."
 *     (CR 701.10b: the creature gets +X/+0, X its power as the ability resolves);
 *   · Genji Glove (#1082) — "Whenever equipped creature attacks, if it's the first combat phase of the turn, untap it. After this
 *     phase, there is an additional combat phase." (CR 500.8; the intervening "if" is checked as it triggers and as it resolves,
 *     CR 603.4).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword, expireContinuousEffects } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const TWO_HANDED_AXE = {"name":"Two-Handed Axe // Sweeping Cleave","type":"Artifact — Equipment // Instant — Adventure","mana":"{2}{R} // {1}{R}","cmc":3,"power":null,"toughness":null,"keywords":["Equip","Double"],"colors":["R"],"oracle":"Two-Handed Axe - Artifact — Equipment {2}{R}\nWhenever equipped creature attacks, double its power until end of turn.\nEquip {1}{R}\n//\nSweeping Cleave - Instant — Adventure {1}{R}\nTarget creature you control gains double strike until end of turn. (Then exile this card. You may cast the artifact later from exile.)"}; // body-only on 0a65c51c
const GENJI_GLOVE = {"name":"Genji Glove","type":"Artifact — Equipment","mana":"{5}","cmc":5,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has double strike.\nWhenever equipped creature attacks, if it's the first combat phase of the turn, untap it. After this phase, there is an additional combat phase.\nEquip {3}"}; // body-only on 0a65c51c
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], colors: ["G"], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
// The battlefield face of the Axe (an adventurer card is its permanent half on the battlefield — CR 715.4).
const AXE_ON_BATTLEFIELD = { ...TWO_HANDED_AXE, name: "Two-Handed Axe", type: "Artifact — Equipment", mana: "{2}{R}", oracle: "Whenever equipped creature attacks, double its power until end of turn.\nEquip {1}{R}" };

const perm = (id, card, controller, over = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
// `attacker` wears `gear` and is attacking the AI in the turn's `combat`-th combat (the declare-attackers step, the attack tapped it).
function attacking(gear, attackerCard, { combat = 1, extra = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = perm("host", attackerCard, "user", { attachments: ["gear"], tapped: true });
  const eq = perm("gear", gear, "user", { attachedTo: "host" });
  const other = perm("other", BEARS, "user", { tapped: true });
  return { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], phase: "combat", step: "declare-attackers",
    combatsThisTurn: { turn: 5, count: combat }, ...(extra.length ? { extraPhases: extra } : {}),
    combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }, { permanentId: "other", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, eq, other] }, ai: { ...s0.players.ai, battlefield: [perm("ai-bears", BEARS, "ai")] } } };
}
function resolveAll(s) {
  let t = flushTriggers(s);
  let g = 0;
  while ((t.stack || []).length && g++ < 20) t = flushTriggers(resolveTopOfStack(t));
  return t;
}
const pt = (s, id) => [permanentPower(s, id), permanentToughness(s, id)];
const host = (s) => s.players.user.battlefield.find((p) => p.id === "host");

describe("the reader", () => {
  it("⭐ both cards play their whole text", () => {
    expect({ axe: classifyCard(TWO_HANDED_AXE), glove: classifyCard(GENJI_GLOVE) }).toEqual({ axe: "native-mixed", glove: "native-mixed" });
  });
  it("⭐ the pronoun names the triggering creature on the equipped attacker's watcher", () => {
    const eff = (card) => detectTriggers(card).map((d) => [d.event, d.scope, d.effectClause]);
    expect({ axe: eff(AXE_ON_BATTLEFIELD), glove: eff(GENJI_GLOVE) }).toEqual({
      axe: [["attacks", "equippedCreature", "double the triggering creature's power until end of turn"]],
      glove: [["attacks", "equippedCreature", "untap the triggering permanent. After this phase, there is an additional combat phase"]],
    });
  });
  it("control: a creature's own \"double its power\" (a self watcher) is not rewritten — Overclocked Electromancer's line", () => {
    const d = detectTriggers({ name: "Self Doubler", type: "Creature — Lizard Wizard", oracle: "Whenever this creature attacks, double its power until end of turn." });
    expect(d.map((x) => x.effectClause)).toEqual(["double its power until end of turn"]);
  });
});

describe("Two-Handed Axe", () => {
  it("⭐ the equipped Wurm attacks: 12/4 until end of turn; the Equipment, the other attacker and the opponent's Bears untouched", () => {
    const s = resolveAll(checkAttackTriggers(attacking(AXE_ON_BATTLEFIELD, WURM)));
    expect({ wurm: pt(s, "host"), other: pt(s, "other"), ai: pt(s, "ai-bears"), cleanup: pt(expireContinuousEffects(s, { atCleanupOfTurn: 5 }), "host") })
      .toEqual({ wurm: [12, 4], other: [2, 2], ai: [2, 2], cleanup: [6, 4] });
  });
});

describe("Genji Glove", () => {
  it("⭐ the first combat: the equipped creature has double strike, untaps, and an additional combat phase is queued", () => {
    const s0 = attacking(GENJI_GLOVE, WURM);
    const s = resolveAll(checkAttackTriggers(s0));
    expect({ doubleStrike: permanentHasKeyword(s0, "host", "Double strike"), tapped: host(s).tapped, other: s.players.user.battlefield.find((p) => p.id === "other").tapped, extra: s.extraPhases })
      .toEqual({ doubleStrike: true, tapped: false, other: true, extra: [{ kind: "combat" }] });
  });
  it("⭐ in the additional combat it does nothing: the creature stays tapped and no further combat is added", () => {
    const s = resolveAll(checkAttackTriggers(attacking(GENJI_GLOVE, WURM, { combat: 2 })));
    expect({ tapped: host(s).tapped, extra: s.extraPhases ?? [] }).toEqual({ tapped: true, extra: [] });
  });
});
