/**
 * crime.test.js — committing a crime (CR 700.13 — shelf decks D9, 2026-09-30: Patrolling Peacemaker in Otharri).
 *
 * "A player commits a crime as that player casts a spell, activates an ability, or puts a triggered ability on the stack
 * and that spell or ability targets at least one opponent; at least one permanent, spell, or ability an opponent
 * controls; and/or at least one card in an opponent's graveyard."
 *
 * triggers.checkCrimeTriggers runs at the four target-choice sites checkBecomesTargetTriggers already had (the spell cast,
 * the activated and loyalty abilities, a triggered ability reaching the stack). A crime stamps `crimeCommittedThisTurn`
 * on the criminal — read by "as long as you've committed a crime this turn" (a static gate) and "if you've committed a
 * crime this turn" (an intervening-if) — and queues the "Whenever you / an opponent commit(s) a crime" watchers.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const REMINDER = " (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)";
const LIGHTNING_BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.");
const GIANT_GROWTH = card("Giant Growth", "Instant", "{G}", 1, "Target creature gets +3/+3 until end of turn.");
const CREMATE = card("Cremate", "Instant", "{B}", 1, "Exile target card from a graveyard.\nDraw a card.");
const CANCEL = card("Cancel", "Instant", "{1}{U}{U}", 3, "Counter target spell.");
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const CHUPACABRA = card("Ravenous Chupacabra", "Creature — Beast Horror", "{2}{B}{B}", 4, "When this creature enters, destroy target creature an opponent controls.", { power: "2", toughness: "2" });
const RAVEN = card("Raven of Fell Omens", "Creature — Bird", "{1}{B}", 2, `Flying\nWhenever you commit a crime, each opponent loses 1 life and you gain 1 life. This ability triggers only once each turn.${REMINDER}`, { power: "1", toughness: "2", keywords: ["Flying"] });
const BLOOD_HUSTLER = card("Blood Hustler", "Creature — Vampire Rogue", "{1}{B}", 2, `Whenever you commit a crime, put a +1/+1 counter on this creature. This ability triggers only once each turn.${REMINDER}\n{3}{B}: Target opponent loses 1 life and you gain 1 life.`, { power: "1", toughness: "1" });
const PEACEMAKER = card("Patrolling Peacemaker", "Artifact Creature — Robot Soldier", "{2}{W}", 3, "This creature enters with two +1/+1 counters on it.\nWhenever an opponent commits a crime, proliferate. (They commit a crime if they target an opponent, anything an opponent controls, and/or cards in an opponent's graveyard. To proliferate, you choose any number of permanents and/or players, then give each another counter of each kind already there.)", { power: "0", toughness: "0" });
const MUSCLE = card("Overzealous Muscle", "Creature — Ogre Mercenary", "{4}{B}", 5, "Whenever you commit a crime during your turn, this creature gains indestructible until end of turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime. Damage and effects that say \"destroy\" don't destroy a creature with indestructible.)", { power: "5", toughness: "4" });
const VAULT_BUSTER = card("Slickshot Vault-Buster", "Creature — Human Rogue", "{2}{U}", 3, `Vigilance\nThis creature gets +2/+0 as long as you've committed a crime this turn.${REMINDER}`, { power: "1", toughness: "4", keywords: ["Vigilance"] });

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function table({ active = "user", caster = active, hand = [], mana = {}, mine = [], theirs = [], theirGy = [], myGy = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const other = caster === "user" ? "ai" : "user";
  return { ...g, turn: 5, activePlayer: active, priorityHolder: caster, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      [caster]: { ...g.players[caster], hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), battlefield: mine, graveyard: myGy, library: [{ ...BEAR, id: "lib1" }, { ...BEAR, id: "lib2" }], manaPool: { ...g.players[caster].manaPool, ...mana } },
      [other]: { ...g.players[other], battlefield: theirs, graveyard: theirGy } } };
}
const castsOf = (s, who, cardId) => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && g++ < 20) n = resolveTopOfStack(n); return n; };
const crimeOf = (s, pid) => s.players[pid].crimeCommittedThisTurn === true;
const counters = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
const untapFor = (s, who) => runStepActions({ ...s, activePlayer: who, phase: "beginning", step: "untap", turn: s.turn + 1, stack: [] });

describe("⭐ what is a crime (CR 700.13) — the cast site, each kind of target", () => {
  const bolt = (targetId) => {
    const s = table({ hand: [LIGHTNING_BOLT], mana: { R: 1 }, mine: [perm("raven", RAVEN, "user"), perm("ub", BEAR, "user")], theirs: [perm("ab", BEAR, "ai")] });
    const cast = castsOf(s, "user", "h0").find((a) => a.targets[0].id === targetId);
    const out = drain(dispatchAction(s, cast));
    return { crime: crimeOf(out, "user"), aiLife: s.players.ai.life - out.players.ai.life, myLife: out.players.user.life - s.players.user.life };
  };
  it("⭐ a spell at an opponent's creature is a crime — Raven of Fell Omens drains", () => {
    const row = { atTheirBear: bolt("ab"), atTheirFace: bolt("ai"), atMyBear: bolt("ub"), atMe: bolt("user") };
    console.log(`WITNESS crimeByTarget ${JSON.stringify(row)}`);
    expect(row).toEqual({
      atTheirBear: { crime: true, aiLife: 1, myLife: 1 },   // the Raven's drain only
      atTheirFace: { crime: true, aiLife: 4, myLife: 1 },   // Bolt's 3 + the drain
      atMyBear: { crime: false, aiLife: 0, myLife: 0 },     // your own creature: no crime
      atMe: { crime: false, aiLife: 0, myLife: -3 },        // yourself: no crime
    });
  });
  it("a card in an OPPONENT'S graveyard is a crime; one in yours is not (Cremate)", () => {
    const cremate = (targetId) => {
      const s = table({ hand: [CREMATE], mana: { B: 1 }, mine: [perm("raven", RAVEN, "user")], myGy: [{ ...BEAR, id: "mine-gy" }], theirGy: [{ ...BEAR, id: "their-gy" }] });
      return crimeOf(drain(dispatchAction(s, castsOf(s, "user", "h0").find((a) => a.targets[0].id === targetId))), "user");
    };
    expect({ theirs: cremate("their-gy"), mine: cremate("mine-gy") }).toEqual({ theirs: true, mine: false });
  });
  it("a spell an opponent controls is a crime to target (Cancel); your own is not", () => {
    const withSpellOnStack = (spellController) => {
      let s = table({ active: spellController, caster: spellController, hand: [GIANT_GROWTH], mana: { G: 1 }, mine: [perm("tgt", BEAR, spellController)] });
      s = dispatchAction(s, castsOf(s, spellController, "h0")[0]);
      const growth = s.stack[s.stack.length - 1].id;
      s = { ...s, priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, hand: [{ ...CANCEL, id: "cx" }], manaPool: { ...s.players.user.manaPool, U: 3 } } } };
      const out = dispatchAction(s, castsOf(s, "user", "cx").find((a) => a.targets[0].id === growth));
      return crimeOf(out, "user");
    };
    expect({ theirSpell: withSpellOnStack("ai"), mySpell: withSpellOnStack("user") }).toEqual({ theirSpell: true, mySpell: false });
  });
});

describe("⭐ the other two sites — an activated ability, a triggered ability reaching the stack", () => {
  it("⭐ activating Blood Hustler's drain at an opponent is a crime — its own watcher adds a counter, once each turn", () => {
    const s = table({ hand: [], mana: { B: 8 }, mine: [perm("hustler", BLOOD_HUSTLER, "user")] });
    const act = (st) => legalActionsForPlayer(st, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "hustler");
    const once = drain(dispatchAction(s, act(s)));
    const twice = drain(dispatchAction(once, act(once)));
    expect({ crime: crimeOf(once, "user"), afterOne: counters(once, "user", "hustler"), afterTwo: counters(twice, "user", "hustler"), aiLifeLost: s.players.ai.life - twice.players.ai.life })
      .toEqual({ crime: true, afterOne: 1, afterTwo: 1, aiLifeLost: 2 });
  });
  it("a loyalty ability at an opponent's creature is a crime (Ob Nixilis Reignited −3) — Raven of Fell Omens drains", () => {
    const OB = card("Ob Nixilis Reignited", "Legendary Planeswalker — Nixilis", "{3}{B}{B}", 5, "+1: You draw a card and you lose 1 life.\n−3: Destroy target creature.\n−8: Target opponent gets an emblem with \"Whenever a player draws a card, you lose 2 life.\"", { loyalty: "5" });
    const s = table({ mine: [perm("ob", OB, "user", { counters: { loyalty: 5 } }), perm("raven", RAVEN, "user")], theirs: [perm("ab", BEAR, "ai")] });
    const minus3 = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-loyalty" && a.costDelta === -3 && a.targets?.[0]?.id === "ab");
    const out = drain(dispatchAction(s, minus3));
    expect({ crime: crimeOf(out, "user"), bearDied: !out.players.ai.battlefield.some((p) => p.id === "ab"), aiLifeLost: s.players.ai.life - out.players.ai.life })
      .toEqual({ crime: true, bearDied: true, aiLifeLost: 1 });
  });
  it("⭐ a triggered ability that targets an opponent's creature is a crime — the opponent's Patrolling Peacemaker proliferates", () => {
    const s = table({ hand: [CHUPACABRA], mana: { B: 4 }, theirs: [perm("ab", BEAR, "ai"), perm("peace", PEACEMAKER, "ai", { counters: { "+1/+1": 2 } })] });
    const out = drain(dispatchAction(s, castsOf(s, "user", "h0")[0]));
    const row = { crime: crimeOf(out, "user"), bearDied: !out.players.ai.battlefield.some((p) => p.id === "ab"), peacemakerCounters: counters(out, "ai", "peace") };
    console.log(`WITNESS crimeByTrigger ${JSON.stringify(row)}`);
    expect(row).toEqual({ crime: true, bearDied: true, peacemakerCounters: 3 });
  });
});

describe("whose crime", () => {
  it("Patrolling Peacemaker answers an OPPONENT'S crime, never its controller's own", () => {
    const run = (caster) => {
      const s = table({ active: caster, caster, hand: [LIGHTNING_BOLT], mana: { R: 1 }, mine: [perm("peace", PEACEMAKER, caster, { counters: { "+1/+1": 2 } })], theirs: [perm("victim", BEAR, caster === "user" ? "ai" : "user")] });
      return counters(drain(dispatchAction(s, castsOf(s, caster, "h0").find((a) => a.targets[0].id === "victim"))), caster, "peace");
    };
    expect({ ownCrime: run("user") }).toEqual({ ownCrime: 2 });
  });
  it("Raven of Fell Omens answers only YOUR crime — an opponent's leaves it quiet", () => {
    const s = table({ active: "ai", caster: "ai", hand: [LIGHTNING_BOLT], mana: { R: 1 }, theirs: [perm("raven", RAVEN, "user"), perm("ub", BEAR, "user")] });
    const out = drain(dispatchAction(s, castsOf(s, "ai", "h0").find((a) => a.targets[0].id === "ub")));
    expect({ aiCrime: crimeOf(out, "ai"), myLifeGained: out.players.user.life - s.players.user.life }).toEqual({ aiCrime: true, myLifeGained: 0 });
  });
  it("Overzealous Muscle answers a crime only during its controller's turn", () => {
    const run = (active) => {
      const s = table({ active, caster: "user", hand: [LIGHTNING_BOLT], mana: { R: 1 }, mine: [perm("muscle", MUSCLE, "user")], theirs: [perm("ab", BEAR, "ai")] });
      const out = drain(dispatchAction(s, castsOf(s, "user", "h0").find((a) => a.targets[0].id === "ab")));
      return { crime: crimeOf(out, "user"), indestructible: permanentHasKeyword(out, "muscle", "Indestructible") };
    };
    expect({ myTurn: run("user"), theirTurn: run("ai") }).toEqual({ myTurn: { crime: true, indestructible: true }, theirTurn: { crime: true, indestructible: false } });
  });
});

describe("\"this turn\" — the static gate, the intervening-if, and the reset", () => {
  it("⭐ Slickshot Vault-Buster is 3/4 after your crime, and back to 1/4 at the next untap", () => {
    const s = table({ hand: [LIGHTNING_BOLT], mana: { R: 1 }, mine: [perm("vb", VAULT_BUSTER, "user")], theirs: [perm("ab", BEAR, "ai")] });
    const out = drain(dispatchAction(s, castsOf(s, "user", "h0").find((a) => a.targets[0].id === "ab")));
    const next = untapFor(out, "ai");
    expect({ before: permanentPower(s, "vb"), after: permanentPower(out, "vb"), nextTurn: permanentPower(next, "vb"), flagCleared: !crimeOf(next, "user") })
      .toEqual({ before: 1, after: 3, nextTurn: 1, flagCleared: true });
  });
  it("\"if you've committed a crime this turn\" reads the same flag", () => {
    const s = table({ hand: [LIGHTNING_BOLT], mana: { R: 1 }, theirs: [perm("ab", BEAR, "ai")] });
    const out = drain(dispatchAction(s, castsOf(s, "user", "h0").find((a) => a.targets[0].id === "ab")));
    expect({ before: evaluateInterveningIf(s, "you've committed a crime this turn", "user"), after: evaluateInterveningIf(out, "you've committed a crime this turn", "user"), theirs: evaluateInterveningIf(out, "you've committed a crime this turn", "ai") })
      .toEqual({ before: false, after: true, theirs: false });
  });
});

describe("the cards", () => {
  it("the crime watchers and gates read native; a crime line with an unmodeled payoff still parks", () => {
    expect([PEACEMAKER, RAVEN, BLOOD_HUSTLER, MUSCLE, VAULT_BUSTER].map((c) => classifyCard(c))).toEqual(["native-trigger", "native-trigger", "native-mixed", "native-trigger", "native-static"]);
    // Servant of the Stinger: the intervening-if reads now, but "you may sacrifice this creature. If you do, search …" doesn't.
    expect(classifyCard(card("Servant of the Stinger", "Creature — Human Warlock", "{1}{B}", 2, `Deathtouch\nWhenever this creature deals combat damage to a player, if you've committed a crime this turn, you may sacrifice this creature. If you do, search your library for a card, put it into your hand, then shuffle.${REMINDER}`, { power: "1", toughness: "3", keywords: ["Deathtouch"] }))).toBe("body-only");
  });
});
