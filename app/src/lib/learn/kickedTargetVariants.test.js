/**
 * kickedTargetVariants.test.js — a kicked spell's targets depend on the kick (CR 601.2c, CR 702.33g — shelf decks D8,
 * 2026-09-30: Galadriel's Dismissal in Shalai, Otharri and Light-Paws; Divine Resilience in Otharri).
 *
 * targeting.expandAtoms enumerates each cast on its own: an atom that will not run in the cast being offered takes no
 * target (`kickedOnly` on an unkicked cast, `nonKickedOnly` on a kicked one). Two lanes graduate on it:
 *   · the WHOLE replacement — "<one sentence>. If this spell was kicked, instead <a complete clause>" — Bloodchief's
 *     Thirst, Tear Asunder, Highly Illogical, Galadriel's Dismissal, Divine Resilience, and three the flip-diff found:
 *     Field Research, Wild Onslaught, Bold Defense;
 *   · the kicked-only target — Probe "If this spell was kicked, target player discards two cards."
 * It also closes a shipped false positive in the magnitude lane. Burst Lightning offered a cartesian of two independent
 * picks, so every cast targeted two things while dealing damage to one: the unused pick still saw "becomes the target"
 * (a Phantasmal Bear was sacrificed by a spell aimed at a player), and the AI chose its kicked cast by the pick the
 * kicked cast doesn't use.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { autoPickDiscardCandidate, resolveDiscardChoice, resolveOptionalChoice, runEffectProgram } from "./effects/runProgram.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const KICKER = ["Kicker"];
const BURST_LIGHTNING = card("Burst Lightning", "Instant", "{R}", 1, "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.", { keywords: KICKER });
const GALADRIELS_DISMISSAL = card("Galadriel's Dismissal", "Instant", "{W}", 1, "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature phases out. If this spell was kicked, each creature target player controls phases out instead. (Treat phased-out creatures and anything attached to them as though they don't exist until their controller's next turn.)", { keywords: KICKER });
const BLOODCHIEFS_THIRST = card("Bloodchief's Thirst", "Sorcery", "{B}", 1, "Kicker {2}{B} (You may pay an additional {2}{B} as you cast this spell.)\nDestroy target creature or planeswalker with mana value 2 or less. If this spell was kicked, instead destroy target creature or planeswalker.", { keywords: KICKER });
const TEAR_ASUNDER = card("Tear Asunder", "Instant", "{1}{G}", 2, "Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead.", { keywords: KICKER });
const HIGHLY_ILLOGICAL = card("Highly Illogical", "Instant", "{1}{U}", 2, "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nCounter target spell with mana value 2 or less. If this spell was kicked, instead counter target spell.", { keywords: KICKER });
const DIVINE_RESILIENCE = card("Divine Resilience", "Instant", "{W}", 1, "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature you control gains indestructible until end of turn. If this spell was kicked, instead any number of target creatures you control gain indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy them.)", { keywords: KICKER });
const PROBE = card("Probe", "Sorcery", "{2}{U}", 3, "Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nDraw three cards, then discard two cards. If this spell was kicked, target player discards two cards.", { keywords: KICKER });
const FIELD_RESEARCH = card("Field Research", "Sorcery", "{2}{U}", 3, "Kicker {2}{U} (You may pay an additional {2}{U} as you cast this spell.)\nDraw two cards. If this spell was kicked, draw three cards instead.", { keywords: KICKER });
const WILD_ONSLAUGHT = card("Wild Onslaught", "Instant", "{3}{G}", 4, "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nPut a +1/+1 counter on each creature you control. If this spell was kicked, put two +1/+1 counters on each creature you control instead.", { keywords: KICKER });
const BOLD_DEFENSE = card("Bold Defense", "Instant", "{2}{W}", 3, "Kicker {3}{W} (You may pay an additional {3}{W} as you cast this spell.)\nCreatures you control get +1/+1 until end of turn. If this spell was kicked, instead creatures you control get +2/+2 and gain first strike until end of turn.", { keywords: KICKER });
const DEFLECTING_SWAT = card("Deflecting Swat", "Instant", "{2}{R}", 3, "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.");
const LIGHTNING_BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.");
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const PHANTASMAL_BEAR = card("Phantasmal Bear", "Creature — Bear Illusion", "{U}", 1, "When this creature becomes the target of a spell or ability, sacrifice it.", { power: "2", toughness: "2" });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)");

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** `caster` holds priority in their main phase with `hand` and a pre-filled `mana` pool; `mine` / `theirs` are boards. */
function table({ caster = "user", hand = [], mana = {}, mine = [], theirs = [], lib = [], theirHand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const other = caster === "user" ? "ai" : "user";
  return { ...g, turn: 5, activePlayer: caster, priorityHolder: caster, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      [caster]: { ...g.players[caster], hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), library: lib.map((c, i) => ({ ...c, id: `l${i}` })), battlefield: mine, manaPool: { ...g.players[caster].manaPool, ...mana } },
      [other]: { ...g.players[other], battlefield: theirs, hand: theirHand.map((c, i) => ({ ...c, id: `oh${i}` })) } } };
}
const castsOf = (s, who = "user", cardId = "h0") => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const tgt = (a) => (a.targets || []).map((t) => `${t.atomIndex}:${t.type}:${t.id}`);
const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const settle = (s) => { let n = s; while (n.pendingChoice?.kind === "discard") n = resolveDiscardChoice(n, autoPickDiscardCandidate(n, n.pendingChoice)); return n; };
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && g++ < 20) n = resolveTopOfStack(n); return n; };

describe("⭐ Burst Lightning — one target per cast (the shipped double target)", () => {
  const board = (extraTheirs = []) => table({ hand: [BURST_LIGHTNING], mana: { R: 5 }, mine: [perm("u1", BEAR, "user")], theirs: [perm("a1", BEAR, "ai"), perm("a2", GIANT, "ai"), ...extraTheirs] });
  it("⭐ each cast targets exactly ONE thing, on the atom that runs in it (it was 5 × 5 picks × 2 = 50 casts)", () => {
    const casts = castsOf(board());
    const row = { casts: casts.length, unkicked: casts.filter((a) => !a.kicked).map(tgt), kicked: casts.filter((a) => a.kicked).map(tgt) };
    console.log(`WITNESS burstLightningCasts ${JSON.stringify(row)}`);
    expect(row.casts).toBe(10);
    expect(row.unkicked.every((t) => t.length === 1 && t[0].startsWith("0:"))).toBe(true);
    expect(row.kicked.every((t) => t.length === 1 && t[0].startsWith("1:"))).toBe(true);
    expect(row.kicked.map((t) => t[0].slice(2)).sort()).toEqual(row.unkicked.map((t) => t[0].slice(2)).sort());
  });
  it("⭐ the unused pick no longer TARGETS: an unkicked Burst Lightning at the opponent leaves their Phantasmal Bear alone", () => {
    const s = board([perm("ph", PHANTASMAL_BEAR, "ai")]);
    const atFace = castsOf(s).filter((a) => !a.kicked && a.targets.some((t) => t.type === "player" && t.id === "ai"));
    const out = drain(dispatchAction(s, atFace[0]));
    // The seen-to-fail control: aimed at the Phantasmal Bear itself, the same harness sacrifices it (its trigger
    // resolves above the spell, which then has no target left).
    const atBear = castsOf(s).find((a) => !a.kicked && a.targets.some((t) => t.id === "ph"));
    const control = drain(dispatchAction(s, atBear));
    expect({ faceCasts: atFace.map(tgt), bearAlive: onBf(out, "ai", "ph"), aiLifeLost: s.players.ai.life - out.players.ai.life, controlSacrificed: !onBf(control, "ai", "ph") })
      .toEqual({ faceCasts: [["0:player:ai"]], bearAlive: true, aiLifeLost: 2, controlSacrificed: true });
  });
  it("⭐ the AI's kicked cast hits the creature it picked — never its own", () => {
    const s = table({ caster: "ai", hand: [BURST_LIGHTNING], mana: { R: 5 }, mine: [perm("own", BEAR, "ai")], theirs: [perm("enemy", BEAR, "user")] });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
    const out = resolveTopOfStack(dispatchAction(s, pick));
    expect({ kicked: pick.kicked, targets: tgt(pick), enemyDead: !onBf(out, "user", "enemy"), ownAlive: onBf(out, "ai", "own") })
      .toEqual({ kicked: true, targets: ["1:creature:enemy"], enemyDead: true, ownAlive: true });
  });
});

describe("⭐ Galadriel's Dismissal — a creature unkicked, a PLAYER kicked", () => {
  const board = () => table({ hand: [GALADRIELS_DISMISSAL], mana: { W: 4 }, mine: [perm("u1", BEAR, "user")], theirs: [perm("a1", BEAR, "ai"), perm("a2", GIANT, "ai")] });
  const ids = (arr) => (arr || []).map((p) => p.id).sort();
  const untapFor = (s, who) => runStepActions({ ...s, activePlayer: who, phase: "beginning", step: "untap", turn: s.turn + 1, stack: [] });
  it("offers the unkicked cast creatures only, and the kicked cast players only", () => {
    const casts = castsOf(board());
    expect({ unkicked: casts.filter((a) => !a.kicked).map(tgt).sort(), kicked: casts.filter((a) => a.kicked).map(tgt).sort() })
      .toEqual({ unkicked: [["0:creature:a1"], ["0:creature:a2"], ["0:creature:u1"]], kicked: [["1:player:ai"], ["1:player:user"]] });
  });
  it("⭐ kicked at the opponent: every creature they control phases out, yours stays, and theirs return at their untap", () => {
    const s = board();
    const out = resolveTopOfStack(dispatchAction(s, castsOf(s).find((a) => a.kicked && a.targets[0].id === "ai")));
    const back = untapFor(out, "ai");
    const row = { theirsOut: ids(out.players.ai.phasedOut), theirBoard: ids(out.players.ai.battlefield), mine: ids(out.players.user.battlefield), back: ids(back.players.ai.battlefield) };
    console.log(`WITNESS galadrielsDismissalKicked ${JSON.stringify(row)}`);
    expect(row).toEqual({ theirsOut: ["a1", "a2"], theirBoard: [], mine: ["u1"], back: ["a1", "a2"] });
  });
  it("unkicked: only the chosen creature phases out", () => {
    const s = board();
    const out = resolveTopOfStack(dispatchAction(s, castsOf(s).find((a) => !a.kicked && a.targets[0].id === "a2")));
    expect({ out: ids(out.players.ai.phasedOut), stays: ids(out.players.ai.battlefield) }).toEqual({ out: ["a2"], stays: ["a1"] });
  });
  it("with no creature on the battlefield only the kicked cast is offered — a player is always there to target", () => {
    const s = table({ hand: [GALADRIELS_DISMISSAL], mana: { W: 4 } });
    expect(castsOf(s).map((a) => [a.kicked, ...tgt(a)]).sort()).toEqual([[true, "1:player:ai"], [true, "1:player:user"]]);
  });
  it("⭐ Deflecting Swat re-aims a kicked Dismissal at another PLAYER (CR 115.7), and that player's creatures phase out", () => {
    const s = table({ caster: "ai", hand: [GALADRIELS_DISMISSAL], mana: { W: 4 }, mine: [perm("a1", BEAR, "ai")], theirs: [perm("u1", BEAR, "user")] });
    const cast = castsOf(s, "ai").find((a) => a.kicked && a.targets[0].id === "user");
    const onStack = dispatchAction(s, cast);
    const spellId = onStack.stack[onStack.stack.length - 1].id;
    const swat = parseEffectProgram(DEFLECTING_SWAT);
    const paused = runEffectProgram({ ...onStack, priorityHolder: "user" }, { id: "swat", kind: "spell", controller: "user", source: { name: "Deflecting Swat" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: swat, controller: "user", targets: [{ atomIndex: 0, type: "spell", id: spellId }] } } });
    const swatted = resolveOptionalChoice(paused, true);
    const retargeted = swatted.stack.find((o) => o.id === spellId).payload.params.targets.map((t) => `${t.atomIndex}:${t.type}:${t.id}`);
    const out = resolveTopOfStack(swatted);
    expect({ retargeted, aiOut: ids(out.players.ai.phasedOut), userStays: ids(out.players.user.battlefield) })
      .toEqual({ retargeted: ["1:player:ai"], aiOut: ["a1"], userStays: ["u1"] });
  });
});

describe("the whole replacements — each cast offers only its own targets, and exactly one half resolves", () => {
  it("Bloodchief's Thirst: unkicked offers mana value 2 or less; kicked offers every creature, and destroys the Giant", () => {
    const s = table({ hand: [BLOODCHIEFS_THIRST], mana: { B: 4 }, theirs: [perm("a1", BEAR, "ai"), perm("a2", GIANT, "ai")] });
    const casts = castsOf(s);
    const out = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.kicked && a.targets[0].id === "a2")));
    expect({ unkicked: casts.filter((a) => !a.kicked).map(tgt), kicked: casts.filter((a) => a.kicked).map(tgt).sort(), giantDead: !onBf(out, "ai", "a2"), bearAlive: onBf(out, "ai", "a1") })
      .toEqual({ unkicked: [["0:creature:a1"]], kicked: [["1:creature:a1"], ["1:creature:a2"]], giantDead: true, bearAlive: true });
  });
  it("Tear Asunder: unkicked offers artifacts and enchantments; kicked any NONLAND permanent, and exiles the Giant", () => {
    const s = table({ hand: [TEAR_ASUNDER], mana: { G: 2, B: 2 }, theirs: [perm("ring", SOL_RING, "ai"), perm("a2", GIANT, "ai"), perm("f", FOREST, "ai")] });
    const casts = castsOf(s);
    const out = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.kicked && a.targets[0].id === "a2")));
    expect({ unkicked: casts.filter((a) => !a.kicked).map((a) => a.targets[0].id), kicked: casts.filter((a) => a.kicked).map((a) => a.targets[0].id).sort(), giantExiled: out.players.ai.exile.some((c) => c.name === "Hill Giant") })
      .toEqual({ unkicked: ["ring"], kicked: ["a2", "ring"], giantExiled: true });
  });
  it("Highly Illogical: unkicked counters only a spell of mana value 2 or less; kicked any spell", () => {
    let s = table({ caster: "ai", hand: [GIANT, LIGHTNING_BOLT], mana: { R: 5 } });
    s = dispatchAction(s, castsOf(s, "ai", "h0")[0]);                                              // Hill Giant (MV 4)
    s = dispatchAction(s, castsOf(s, "ai", "h1").find((a) => a.targets[0]?.id === "user"));       // Lightning Bolt (MV 1) at the user
    const giant = s.stack.find((o) => o.source?.name === "Hill Giant").id;
    const bolt = s.stack.find((o) => o.source?.name === "Lightning Bolt").id;
    s = { ...s, priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, hand: [{ ...HIGHLY_ILLOGICAL, id: "hi" }], manaPool: { ...s.players.user.manaPool, U: 4 } } } };
    const casts = castsOf(s, "user", "hi");
    const out = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.kicked && a.targets[0].id === giant)));
    expect({ unkicked: casts.filter((a) => !a.kicked).map((a) => a.targets[0].id), kicked: casts.filter((a) => a.kicked).map((a) => a.targets[0].id).sort(), giantCountered: !out.stack.some((o) => o.id === giant), boltStill: out.stack.some((o) => o.id === bolt) })
      .toEqual({ unkicked: [bolt], kicked: [bolt, giant].sort(), giantCountered: true, boltStill: true });
  });
  it("Divine Resilience: unkicked picks one creature you control; kicked any number — and both survive a real wrath", () => {
    const s = table({ hand: [DIVINE_RESILIENCE], mana: { W: 4 }, mine: [perm("u1", BEAR, "user"), perm("u2", GIANT, "user")], theirs: [perm("a1", BEAR, "ai")] });
    const casts = castsOf(s);
    const both = casts.find((a) => a.kicked && a.targets.length === 2);
    const out = resolveTopOfStack(dispatchAction(s, both));
    const wrath = parseEffectClause("Destroy all creatures", "Sorcery").atoms.reduce((st, a) => resolveAtom(st, a, { controller: "ai", targets: [] }), out);
    expect({ unkicked: casts.filter((a) => !a.kicked).map(tgt).sort(), kickedTargets: tgt(both).sort(), survivors: wrath.players.user.battlefield.map((p) => p.id).sort(), theirsDied: !onBf(wrath, "ai", "a1") })
      .toEqual({ unkicked: [["0:creature:u1"], ["0:creature:u2"]], kickedTargets: ["1:creature:u1", "1:creature:u2"], survivors: ["u1", "u2"], theirsDied: true });
  });
  it("Field Research draws two or three (never five); Wild Onslaught puts one or two counters (never three)", () => {
    const lib = Array.from({ length: 8 }, () => FOREST);
    const fr = (kicked) => { const s = table({ hand: [FIELD_RESEARCH], mana: { U: 6 }, lib }); return resolveTopOfStack(dispatchAction(s, castsOf(s).find((a) => !!a.kicked === kicked))).players.user.hand.length; };
    const wo = (kicked) => { const s = table({ hand: [WILD_ONSLAUGHT], mana: { G: 8 }, mine: [perm("u1", BEAR, "user")] }); return resolveTopOfStack(dispatchAction(s, castsOf(s).find((a) => !!a.kicked === kicked))).players.user.battlefield.find((p) => p.id === "u1").counters?.["+1/+1"]; };
    expect({ drawUnkicked: fr(false), drawKicked: fr(true), countersUnkicked: wo(false), countersKicked: wo(true) })
      .toEqual({ drawUnkicked: 2, drawKicked: 3, countersUnkicked: 1, countersKicked: 2 });
  });
  it("Bold Defense: +1/+1, or +2/+2 and first strike — never both", () => {
    const bd = (kicked) => {
      const s = table({ hand: [BOLD_DEFENSE], mana: { W: 7 }, mine: [perm("u1", BEAR, "user")] });
      const out = resolveTopOfStack(dispatchAction(s, castsOf(s).find((a) => !!a.kicked === kicked)));
      return [permanentPower(out, "u1"), permanentToughness(out, "u1"), permanentHasKeyword(out, "u1", "First strike")];
    };
    expect({ unkicked: bd(false), kicked: bd(true) }).toEqual({ unkicked: [3, 3, false], kicked: [4, 4, true] });
  });
});

describe("⭐ Probe — a target chosen only when kicked (CR 702.33g)", () => {
  it("the unkicked cast has no target; the kicked one targets a player, who discards two", () => {
    const s = table({ hand: [PROBE], mana: { U: 3, B: 2 }, lib: Array.from({ length: 5 }, () => FOREST), theirHand: [BEAR, GIANT, SOL_RING] });
    const casts = castsOf(s);
    const out = settle(resolveTopOfStack(dispatchAction(s, casts.find((a) => a.kicked && a.targets[0].id === "ai"))));
    expect({ unkicked: casts.filter((a) => !a.kicked).map(tgt), kicked: casts.filter((a) => a.kicked).map(tgt).sort(), theirHand: out.players.ai.hand.length, myHand: out.players.user.hand.length })
      .toEqual({ unkicked: [[]], kicked: [["2:player:ai"], ["2:player:user"]], theirHand: 1, myHand: 1 });
  });
});

describe("⛔ still refused", () => {
  const refused = (name, oracle, type = "Instant") => classifyCard({ name, type, mana: "{1}{U}", keywords: KICKER, oracle });
  it("'another target' (Jilt, Urborg Repossession) — nothing enforces distinctness ACROSS atoms", () => {
    expect(refused("Jilt", "Kicker {1}{R}\nReturn target creature to its owner's hand. If this spell was kicked, it deals 2 damage to another target creature.")).toBe("arbiter-spell");
    expect(refused("Urborg Repossession", "Kicker {1}{G}\nReturn target creature card from your graveyard to your hand. You gain 2 life. If this spell was kicked, return another target permanent card from your graveyard to your hand.", "Sorcery")).toBe("arbiter-spell");
    expect(refused("Fake Another", "Kicker {2}\nReturn target creature to its owner's hand. If this spell was kicked, destroy another target creature.")).toBe("arbiter-spell");
  });
  it("a kicked clause that isn't the last sentence (Expel the Unworthy, Waste Management)", () => {
    expect(refused("Expel the Unworthy", "Kicker {2}{W}\nChoose target creature with mana value 3 or less. If this spell was kicked, instead choose target creature. Exile the chosen creature, then its controller gains life equal to its mana value.", "Sorcery")).toBe("arbiter-spell");
    expect(refused("Waste Management", "Kicker {3}{B}\nExile up to two target cards from a single graveyard. If this spell was kicked, instead exile target player's graveyard. Create a 2/2 black Rogue creature token for each creature card exiled this way.")).toBe("arbiter-spell");
  });
  it("a replacement clause that doesn't parse (Blood Beckoning's 'return two target creature cards')", () => {
    expect(refused("Blood Beckoning", "Kicker {3}\nReturn target creature card from your graveyard to your hand. If this spell was kicked, instead return two target creature cards from your graveyard to your hand.", "Sorcery")).toBe("arbiter-spell");
  });
  it("a TWO-sentence base — nothing says which sentence 'instead' replaces", () => {
    expect(refused("Fake Two Sentences", "Kicker {2}\nDraw a card. Scry 1. If this spell was kicked, draw two cards instead.", "Sorcery")).toBe("arbiter-spell");
  });
});
