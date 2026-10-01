/**
 * heroesInAHalfShell.test.js — Heroes in a Half Shell, Halfshell heroes' commander (shelf decks D22, 2026-09-30). "Whenever one
 * or more Mutants, Ninjas, and/or Turtles you control deal combat damage to a player, put a +1/+1 counter on each of those
 * creatures and draw a card."
 *
 *   • the batch combat-damage subject LIST — commas and "and/or" are a union, normalized onto the " or " list the subtype
 *     batch already reads; the trigger split needed the plural verb ("deal") to find the condition's end past the commas;
 *   • "each of those creatures" — the dealers the trigger's OWN subject names, stamped on it by
 *     checkBatchCombatDamageTriggers and read by the batchDealers scope at resolution (only those still on the battlefield);
 *   • only that event supplies the referent: the trigger gate and the spell fence refuse the atom anywhere else.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the one synthetic spell that pins the spell fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { checkBatchCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, keywords: [], oracle, ...extra });
const HEROES = card("Heroes in a Half Shell", "Legendary Creature — Mutant Ninja Turtle", "{W}{U}{B}{R}{G}", "Vigilance, menace, trample, haste\nWhenever one or more Mutants, Ninjas, and/or Turtles you control deal combat damage to a player, put a +1/+1 counter on each of those creatures and draw a card.", { power: "5", toughness: "5", keywords: ["Vigilance", "Menace", "Trample", "Haste"] });
const TURTLE = card("Horned Turtle", "Creature — Turtle", "{2}{U}", "", { power: "1", toughness: "4" });
const OGRE = card("Incurable Ogre", "Creature — Ogre Mutant", "{3}{R}", "", { power: "5", toughness: "1" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { power: "2", toughness: "2" });
const DRAKE = card("Wind Drake", "Creature — Drake", "{2}{U}", "Flying", { power: "2", toughness: "2", keywords: ["Flying"] });
// The WITH-KEYWORD batch (Quartzwood Crasher's shape) with the same payoff — the flip-diff's unaimed gain, verified in play below.
const VULTURE = card("Vulture, Feathered Fiend", "Legendary Creature — Human Artificer Villain", "{2}{U}{U}", "Flying\nWhenever one or more creatures you control with flying deal combat damage to a player, put a +1/+1 counter on each of those creatures and draw a card.", { power: "2", toughness: "4", keywords: ["Flying"] });

const perm = (id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false });
function board(ids) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: ids, library: lib } } };
}
const hit = (ids) => ids.map((id) => ({ kind: "combat-damage-player", attackerId: id, attackingPlayer: "user", defender: "ai", amount: 2 }));
const connect = (s, ids) => flushTriggers(checkBatchCombatDamageTriggers(s, hit(ids)), { chooseTargets: chooseTriggerTargets });
const resolveAll = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
const plus = (s, id) => findPermanent(s, id)?.permanent.counters?.["+1/+1"] || 0;
const drawn = (s) => 3 - s.players.user.library.length;

describe("the card", () => {
  it("detects the batch with the three-subtype union and parses its payoff; reads native", () => {
    const d = detectTriggers(HEROES)[0];
    expect({ event: d.event, subtypes: d.subtypeFilter, atoms: parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms, tier: classifyCard(HEROES) }).toEqual({
      event: "combatDamageBatch", subtypes: ["Mutant", "Ninja", "Turtle"],
      atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 1, scope: "batchDealers" }, { op: "draw", amount: 1, targetType: null }],
      tier: "native-trigger",
    });
  });
});

describe("⭐ in play", () => {
  it("⭐ Heroes, a Horned Turtle and a Bear connect: ONE trigger — a counter on Heroes and the Turtle, not the Bear — and one card", () => {
    const s1 = connect(board([perm("heroes", HEROES), perm("turtle", TURTLE), perm("bear", BEAR)]), ["heroes", "turtle", "bear"]);
    const s2 = resolveAll(s1);
    const row = { triggers: s1.stack.length, heroes: plus(s2, "heroes"), turtle: plus(s2, "turtle"), bear: plus(s2, "bear"), drew: drawn(s2) };
    console.log(`WITNESS heroesBatch ${JSON.stringify(row)}`);
    expect(row).toEqual({ triggers: 1, heroes: 1, turtle: 1, bear: 0, drew: 1 });
  });
  it("each listed type counts — an Incurable Ogre (a Mutant) connecting alone fires it; a Bear alone doesn't", () => {
    const ogre = resolveAll(connect(board([perm("heroes", HEROES), perm("ogre", OGRE)]), ["ogre"]));
    const bear = connect(board([perm("heroes", HEROES), perm("bear", BEAR)]), ["bear"]);
    expect({ ogreCounter: plus(ogre, "ogre"), ogreDrew: drawn(ogre), bearTriggers: bear.stack.length }).toEqual({ ogreCounter: 1, ogreDrew: 1, bearTriggers: 0 });
  });
  it("a dealer gone before the trigger resolves gets nothing (CR 400.7 — it is a new object now); the rest still resolves", () => {
    const s1 = connect(board([perm("heroes", HEROES), perm("turtle", TURTLE)]), ["heroes", "turtle"]);
    const gone = { ...s1, players: { ...s1.players, user: { ...s1.players.user, battlefield: s1.players.user.battlefield.filter((p) => p.id !== "turtle") } } };
    const s2 = resolveAll(gone);
    expect({ heroes: plus(s2, "heroes"), drew: drawn(s2) }).toEqual({ heroes: 1, drew: 1 });
  });
  it("Vulture, Feathered Fiend — the WITH-KEYWORD batch stamps its own dealers too: two Wind Drakes get counters, the Bear beside them doesn't; one card", () => {
    const s = resolveAll(connect(board([perm("vulture", VULTURE), perm("d1", DRAKE), perm("d2", DRAKE), perm("bear", BEAR)]), ["d1", "d2", "bear"]));
    const row = { tier: classifyCard(VULTURE), d1: plus(s, "d1"), d2: plus(s, "d2"), bear: plus(s, "bear"), drew: drawn(s) };
    console.log(`WITNESS vultureBatch ${JSON.stringify(row)}`);
    expect(row).toEqual({ tier: "native-trigger", d1: 1, d2: 1, bear: 0, drew: 1 });
  });
});

describe("the referent is the batch's alone", () => {
  it("the trigger gate accepts \"each of those creatures\" only on the batch combat-damage event; a spell carrying it is not native", () => {
    const p = parseEffectClause("put a +1/+1 counter on each of those creatures", "Instant", { sourceScoped: true });
    // SYNTHETIC spell — no printed spell parses to this atom today; it pins the spell fence (coverage.atomCarriesEventReferent).
    const spell = card("Synthetic Spell", "Sorcery", "{1}{G}", "Put a +1/+1 counter on each of those creatures.");
    expect({ batch: combatDamageReferentSatisfied(p, "combatDamageBatch"), attacks: combatDamageReferentSatisfied(p, "attacks"), spellTier: classifyCard(spell) })
      .toEqual({ batch: true, attacks: false, spellTier: expect.not.stringMatching(/^native/) });
  });
});
