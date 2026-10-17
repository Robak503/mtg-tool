/**
 * targetOpponentOnly.test.js — "target opponent" names an OPPONENT: its controller is never a legal target.
 *
 * A player's opponent is the other player in a two-player game (CR 102.2), and in a Free-for-All game — Commander's default
 * multiplayer setup (CR 903.2) — the players compete as individuals (CR 806.1), so every other player; a target is chosen as the spell or ability is put on the stack (CR 115.1, 601.2c — for an
 * activated ability through CR 602.2b, for a triggered ability through CR 603.3d), and "target opponent" admits only
 * those players. The legacy damage parse (spellEffects.parseSpellEffect — the shape every clause falls back to through
 * parser.legacyToAtom) read "… damage to target opponent" and "… to target opponent or planeswalker" as targetType
 * "player", the every-player pool, and the counters-put / counters-placed damage sentinels (Shalai and Hallar, Casey
 * Jones) did the same. So:
 *   · Deadeye Duelist's "{1}, {T}: This creature deals 1 damage to target opponent." was OFFERED aimed at its own
 *     controller, and so was every spell and ability of the shape (Burning Fields, Jeskai Charm's damage mode, Vampiric
 *     Touch, a LOW spell's cast offer — Stinging Vitriol);
 *   · a triggered ability's chooser picks an enemy, but with every opponent untargetable (Leyline of Sanctity) it found no
 *     correct-side target and FORCED one from the pool — its own controller — where the rules remove the ability (CR
 *     603.3d: no legal choice).
 * Now the shape reads targetType "opponent" (the enumerator's opponent pool, spellEffects.addOpponents), and the CR 608.2b
 * resolution re-check judges a recorded target by the same pool, so a resolution never hits the controller either.
 * The "or planeswalker" half has no pool yet: those cards are offered the opponents alone (an under-offer, never an
 * illegal target).
 *
 * THE SIBLING — the same family, a pronoun resolving to the wrong subject. "It can't be blocked this turn" parsed as the SOURCE
 * (target "self") whatever came before it, so after a targeted clause — Assassin Den's "{3}{U}: Put a +1/+1 counter on target
 * creature you control. It can't be blocked this turn." — the Wall (defender) became unblockable and the creature that took
 * the counter did not; on a spell (no source permanent) the rider resolved to nothing. "It" there is the creature the
 * clause before it targeted (CR 608.2c — the rules of English): a bare "it" with a self referent, right after a clause that
 * targets with the controller (or the target) as its subject — "put …", "untap …", "tap …", "target …" — now binds to that
 * target (the parser's referent binding, CR 608.2); after any other clause that owns a target it is not read at all.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier before
 * this slice — none moves). Every runtime case runs through the engine's own entry points: the offers are
 * legalActionsForPlayer, the casts and activations are dispatched, the stack resolves through resolveTopOfStack.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseSpellEffect } from "./spellEffects.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { splitFaceCards } from "./splitCard.js";
import { detectTriggers } from "./triggers.js";
import { permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DUELIST = {"name":"Deadeye Duelist","type":"Creature — Human Assassin","mana":"{1}{R}","cmc":2,"power":"1","toughness":"3","keywords":["Reach"],"colors":["R"],"oracle":"Reach\n{1}, {T}: This creature deals 1 damage to target opponent."}; // native-activated
const DUO = {"name":"Kindlespark Duo","type":"Creature — Lizard Otter","mana":"{2}{R}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":["R"],"oracle":"{T}: This creature deals 1 damage to target opponent.\nWhenever you cast a noncreature spell, untap this creature."}; // native-mixed
const ZEALOT = {"name":"Zealot of the God-Pharaoh","type":"Creature — Minotaur Archer","mana":"{3}{R}","cmc":4,"power":"4","toughness":"3","keywords":[],"colors":["R"],"oracle":"{4}{R}: This creature deals 2 damage to target opponent or planeswalker."}; // native-activated
const FIELDS = {"name":"Burning Fields","type":"Sorcery","mana":"{4}{R}","cmc":5,"keywords":[],"colors":["R"],"oracle":"Burning Fields deals 5 damage to target opponent or planeswalker."}; // native-spell
const CHARM = {"name":"Jeskai Charm","type":"Instant","mana":"{U}{R}{W}","cmc":3,"keywords":[],"colors":["R","U","W"],"oracle":"Choose one —\n• Put target creature on top of its owner's library.\n• Jeskai Charm deals 4 damage to target opponent or planeswalker.\n• Creatures you control get +1/+1 and gain lifelink until end of turn."}; // native-spell
const TOUCH = {"name":"Vampiric Touch","type":"Sorcery","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Vampiric Touch deals 2 damage to target opponent or planeswalker and you gain 2 life."}; // native-spell
const VITRIOL = {"name":"Stinging Vitriol","type":"Sorcery","mana":"{B}{R}","cmc":2,"keywords":[],"colors":["B","R"],"oracle":"Stinging Vitriol deals 2 damage to target opponent. That player reveals their hand. You choose a nonland card from it. They discard that card."}; // arbiter-spell
const CARNIVAL = {"name":"Carnival // Carnage","type":"Instant // Sorcery","mana":"{B/R} // {2}{B}{R}","cmc":5,"keywords":[],"colors":["B","R"],"oracle":"Carnival - Instant {B/R}\nCarnival deals 1 damage to target creature or planeswalker and 1 damage to that permanent's controller.\n//\nCarnage - Sorcery {2}{B}{R}\nCarnage deals 3 damage to target opponent. That player discards two cards."}; // arbiter-spell
const SHARPSHOOTER = {"name":"Shocking Sharpshooter","type":"Creature — Human Archer","mana":"{1}{R}","cmc":2,"power":"1","toughness":"3","keywords":["Reach"],"colors":["R"],"oracle":"Reach\nWhenever another creature you control enters, this creature deals 1 damage to target opponent."}; // native-trigger
const SHALAI = {"name":"Shalai and Hallar","type":"Legendary Creature — Angel Elf","mana":"{1}{R}{G}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying","Vigilance"],"colors":["G","R","W"],"oracle":"Flying, vigilance\nWhenever one or more +1/+1 counters are put on a creature you control, Shalai and Hallar deals that much damage to target opponent."}; // native-trigger
const CASEY = {"name":"Casey Jones, Back Alley Brute","type":"Legendary Creature — Human Berserker","mana":"{3}{R}","cmc":4,"power":"4","toughness":"2","keywords":["Menace"],"colors":["R"],"oracle":"Menace\nWhenever Casey Jones attacks, put a +1/+1 counter on target attacking creature.\nWhenever you put one or more +1/+1 counters on a creature you control, Casey Jones deals that much damage to target opponent."}; // native-trigger
const GROWTH = {"name":"Battlegrowth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Put a +1/+1 counter on target creature."}; // native-spell
const LAVA_SPIKE = {"name":"Lava Spike","type":"Sorcery — Arcane","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lava Spike deals 3 damage to target player or planeswalker."}; // native-spell
const LEYLINE = {"name":"Leyline of Sanctity","type":"Enchantment","mana":"{2}{W}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)"}; // native-static
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const DEN = {"name":"Assassin Den","type":"Creature — Wall","mana":"{3}{U}","cmc":4,"power":"2","toughness":"4","keywords":["Defender"],"colors":["U"],"oracle":"Defender (This creature can't attack.)\n{3}{U}: Put a +1/+1 counter on target creature you control. It can't be blocked this turn. Activate only as a sorcery."}; // native-activated
const DAZZLER = {"name":"Razzle-Dazzler","type":"Creature — Human Wizard","mana":"{1}{U}","cmc":2,"power":"1","toughness":"2","keywords":[],"colors":["U"],"oracle":"Whenever you cast your second spell each turn, put a +1/+1 counter on this creature. It can't be blocked this turn."}; // native-trigger
const SCHEME = {"name":"Jailbreak Scheme","type":"Sorcery","mana":"{U}","cmc":1,"keywords":["Spree"],"colors":["U"],"oracle":"Spree (Choose one or more additional costs.)\n+ {3} — Put a +1/+1 counter on target creature. It can't be blocked this turn.\n+ {2} — Target artifact or creature's owner puts it on their choice of the top or bottom of their library."}; // arbiter-spell
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const perm = (id, c, controller, over = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...over });
const WALKER = { counters: { loyalty: 3 } };
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game (user, ai), the user active in its precombat main with priority and a full mana pool. */
function board({ hand = [], mine = [], theirs = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], ...o });
  return {
    ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...g.players,
      user: seat("user", { hand: hand.map(([cid, c]) => ({ ...c, id: cid })), battlefield: mine, manaPool: { ...g.players.user.manaPool, ...POOL } }),
      ai: seat("ai", { battlefield: theirs }),
    },
  };
}
function settle(s) {
  let n = s;
  for (let guard = 0; (n.stack.length || n.pendingTriggers.length) && !n.pendingChoice; guard++) {
    if (guard > 30) throw new Error("the stack did not settle");
    n = resolveTopOfStack(n);
  }
  const crash = n.log.find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
/** Every offered target list of `kind` for the source (a card id in hand, or a permanent id), as id lists. */
const offered = (s, kind, id, who = "user") => legalActionsForPlayer(s, who)
  .filter((a) => a.kind === kind && (a.cardId === id || a.permanentId === id))
  .map((a) => (a.targets || []).map((t) => t.id));
/** The offered action the case needs — asserted, so a missing offer fails on the assertion, not inside the dispatcher. */
const must = (a) => { expect(a).toBeDefined(); return a; };
const life = (s) => Object.fromEntries(Object.keys(s.players).map((p) => [p, s.players[p].life]));
const forced = (s) => s.log.filter((e) => e.kind === "trigger-target-forced").map((e) => e.targets);

describe("the parse — the shape names the opponent pool", () => {
  it("\"… damage to target opponent\" and \"… to target opponent or planeswalker\" read targetType opponent; \"target player\" stays player", () => {
    expect([FIELDS, VITRIOL, LAVA_SPIKE].map((c) => [c.name, parseSpellEffect(c)?.targetType])).toEqual([
      ["Burning Fields", "opponent"], ["Stinging Vitriol", "opponent"], ["Lava Spike", "playerOrPlaneswalker"],
    ]);
    expect(parseActivatedAbilities(DUELIST)[0].program.atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "opponent" }]);
  });

  it("\"that player\" after the damage still names the chosen opponent: Carnage (Carnival // Carnage's second half) keeps its HIGH read", () => {
    const carnage = splitFaceCards(CARNIVAL)[1];
    const p = parseEffectProgram(carnage);
    expect({ name: carnage.name, confidence: programConfidence(p), atoms: p.atoms }).toEqual({
      name: "Carnage", confidence: "high",
      atoms: [{ op: "deal-damage", amount: 3, targetType: "opponent" }, { op: "discard", amount: 2, targetType: null, who: "target", bindPreviousTargets: true }],
    });
  });

  it("control — no tier moves: the family stays native (the narrower pool is the printed one)", () => {
    const fam = [DUELIST, DUO, ZEALOT, FIELDS, CHARM, TOUCH, SHARPSHOOTER, SHALAI, CASEY];
    expect(fam.map((c) => [c.name, classifyCard(c)])).toEqual([
      ["Deadeye Duelist", "native-activated"], ["Kindlespark Duo", "native-mixed"], ["Zealot of the God-Pharaoh", "native-activated"],
      ["Burning Fields", "native-spell"], ["Jeskai Charm", "native-spell"], ["Vampiric Touch", "native-spell"],
      ["Shocking Sharpshooter", "native-trigger"], ["Shalai and Hallar", "native-trigger"], ["Casey Jones, Back Alley Brute", "native-trigger"],
    ]);
    expect(classifyCard(VITRIOL)).toBe("arbiter-spell");
  });
});

describe("the offer — an activated ability (CR 602.2b)", () => {
  it("⭐ Deadeye Duelist's ability is offered at the opponent only, never at its controller", () => {
    const s = board({ mine: [perm("dd", DUELIST, "user")] });
    expect(offered(s, "activate-ability", "dd")).toEqual([["ai"]]);
  });

  it("⭐ the same for Kindlespark Duo and for Zealot of the God-Pharaoh's \"target opponent or planeswalker\"", () => {
    const s = board({ mine: [perm("duo", DUO, "user"), perm("zealot", ZEALOT, "user")] });
    expect({ duo: offered(s, "activate-ability", "duo"), zealot: offered(s, "activate-ability", "zealot") }).toEqual({ duo: [["ai"]], zealot: [["ai"]] });
  });

  it("⭐ in a four-seat Commander game: the three opponents, not the activator", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm("dd", DUELIST, "user")], manaPool: { ...g.players.user.manaPool, ...POOL } } } };
    expect(offered(s, "activate-ability", "dd")).toEqual([["ai1"], ["ai2"], ["ai3"]]);
  });

  it("⭐ an opponent behind Leyline of Sanctity leaves no legal target: the ability is not offered at all", () => {
    const s = board({ mine: [perm("dd", DUELIST, "user")], theirs: [perm("ley", LEYLINE, "ai")] });
    expect(offered(s, "activate-ability", "dd")).toEqual([]);
  });

  it("control — activated at the opponent and resolved: the opponent takes the 1", () => {
    let s = board({ mine: [perm("dd", DUELIST, "user")] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "dd" && x.targets?.[0]?.id === "ai");
    s = settle(dispatchAction(s, must(a)));
    expect(life(s)).toEqual({ user: 40, ai: 39 });
  });

  it("the planeswalker half has no pool yet: Zealot is not offered at a planeswalker (an under-offer, never an illegal target)", () => {
    const s = board({ mine: [perm("zealot", ZEALOT, "user")], theirs: [perm("jace", JACE, "ai", WALKER)] });
    expect(offered(s, "activate-ability", "zealot")).toEqual([["ai"]]);
  });
});

describe("the offer — a spell (CR 601.2c)", () => {
  it("⭐ Burning Fields (the single-target cast path) is cast at the opponent only", () => {
    expect(offered(board({ hand: [["f", FIELDS]] }), "cast-spell", "f")).toEqual([["ai"]]);
  });

  it("⭐ Jeskai Charm's damage mode (the modal path) targets the opponent only; its other modes are untouched", () => {
    const s = board({ hand: [["c", CHARM]], theirs: [perm("bears", BEARS, "ai")] });
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c")
      .map((a) => [a.chosenMode, (a.targets || []).map((t) => t.id)]);
    expect(casts).toEqual([[0, ["bears"]], [1, ["ai"]], [2, []]]);
  });

  it("⭐ Vampiric Touch (a two-atom program) targets the opponent only", () => {
    expect(offered(board({ hand: [["t", TOUCH]] }), "cast-spell", "t")).toEqual([["ai"]]);
  });

  it("⭐ a LOW spell's cast offer too: Stinging Vitriol (resolved by the Arbiter) is cast at the opponent only", () => {
    expect(offered(board({ hand: [["v", VITRIOL]] }), "cast-spell", "v")).toEqual([["ai"]]);
  });

  it("⭐ the opponent behind Leyline of Sanctity: Burning Fields has no legal target and is not offered", () => {
    expect(offered(board({ hand: [["f", FIELDS]], theirs: [perm("ley", LEYLINE, "ai")] }), "cast-spell", "f")).toEqual([]);
  });

  it("control — \"target player or planeswalker\" still offers every player and the planeswalker (Lava Spike)", () => {
    const s = board({ hand: [["l", LAVA_SPIKE]], theirs: [perm("jace", JACE, "ai", WALKER)] });
    expect(offered(s, "cast-spell", "l").flat().sort()).toEqual(["ai", "jace", "user"]);
  });
});

describe("the resolution — a target that isn't an opponent is illegal (CR 608.2b)", () => {
  it("⭐ a Burning Fields whose recorded target is its own controller fizzles: no damage to anyone", () => {
    let s = board({ hand: [["f", FIELDS]] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "f" && x.targets?.[0]?.id === "ai");
    s = dispatchAction(s, must(a));
    // The record a pre-fix offer could make (or a saved game carries): the caster as the target.
    const self = [{ type: "player", id: "user", name: "user" }];
    const top = s.stack[s.stack.length - 1];
    s = { ...s, stack: [...s.stack.slice(0, -1), { ...top, targets: self, payload: { ...top.payload, params: { ...top.payload.params, targets: self } } }] };
    s = settle(s);
    expect({ life: life(s), fizzled: s.log.some((e) => e.kind === "spell-fizzle") }).toEqual({ life: { user: 40, ai: 40 }, fizzled: true });
  });

  it("control — the opponent target resolves: Burning Fields deals 5 to the opponent", () => {
    let s = board({ hand: [["f", FIELDS]] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "f" && x.targets?.[0]?.id === "ai");
    s = settle(dispatchAction(s, must(a)));
    expect(life(s)).toEqual({ user: 40, ai: 35 });
  });
});

describe("a triggered ability (CR 603.3d)", () => {
  /** Cast Grizzly Bears beside Shocking Sharpshooter; its enters trigger resolves. */
  const bearsEnter = (theirs) => {
    const s = board({ hand: [["b", BEARS]], mine: [perm("sharp", SHARPSHOOTER, "user")], theirs });
    return settle(dispatchAction(s, must(legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "b"))));
  };
  /** Battlegrowth on the counter watcher itself; the counters trigger resolves. */
  const growthOn = (watcher, id, theirs) => {
    const s = board({ hand: [["g", GROWTH]], mine: [perm(id, watcher, "user")], theirs });
    return settle(dispatchAction(s, must(legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "g" && x.targets?.[0]?.id === id))));
  };

  it("control — Shocking Sharpshooter's trigger hits the opponent (the chooser picks the enemy on both)", () => {
    expect(life(bearsEnter([]))).toEqual({ user: 40, ai: 39 });
  });

  it("⭐ the opponent behind Leyline of Sanctity: no legal target, the ability is removed — its controller is never forced as the target", () => {
    const s = bearsEnter([perm("ley", LEYLINE, "ai")]);
    expect({ life: life(s), forced: forced(s) }).toEqual({ life: { user: 40, ai: 40 }, forced: [] });
  });

  it("control — the counters-put and counters-placed sentinels hit the opponent (Shalai and Hallar, Casey Jones)", () => {
    expect({ shalai: life(growthOn(SHALAI, "sh", [])), casey: life(growthOn(CASEY, "ca", [])) })
      .toEqual({ shalai: { user: 40, ai: 39 }, casey: { user: 40, ai: 39 } });
  });

  it("⭐ the same sentinels behind Leyline of Sanctity: removed, never forced at their controller", () => {
    const sh = growthOn(SHALAI, "sh", [perm("ley", LEYLINE, "ai")]);
    const ca = growthOn(CASEY, "ca", [perm("ley", LEYLINE, "ai")]);
    expect({ shalai: [life(sh), forced(sh)], casey: [life(ca), forced(ca)] })
      .toEqual({ shalai: [{ user: 40, ai: 40 }, []], casey: [{ user: 40, ai: 40 }, []] });
  });
});

describe("THE SIBLING — \"It can't be blocked this turn\" after a targeted clause names that target (CR 608.2c)", () => {
  const unblockable = (s, id) => permanentHasKeyword(s, id, "unblockable");

  it("⭐ Assassin Den: the creature that took the counter can't be blocked; the Wall itself is untouched", () => {
    let s = board({ mine: [perm("den", DEN, "user"), perm("bears", BEARS, "user")] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "den" && x.targets?.[0]?.id === "bears");
    s = settle(dispatchAction(s, must(a)));
    const bears = s.players.user.battlefield.find((p) => p.id === "bears");
    expect({ counter: bears.counters?.["+1/+1"] ?? 0, bears: unblockable(s, "bears"), den: unblockable(s, "den") }).toEqual({ counter: 1, bears: true, den: false });
  });

  it("⭐ the parse: the rider binds to the previous target (Assassin Den's ability; Jailbreak Scheme's first mode as a spell)", () => {
    const mode = SCHEME.oracle.split("\n")[1].replace(/^\+ \{3\} — /, "");
    const spell = parseEffectClause(mode, "Sorcery");
    expect({
      den: parseActivatedAbilities(DEN)[0].program.atoms.map((a) => [a.op, a.targetType ?? null, a.target ?? null, !!a.bindPreviousTargets]),
      spell: [programConfidence(spell), spell.atoms.map((a) => [a.op, a.targetType ?? null, a.target ?? null, !!a.bindPreviousTargets])],
    }).toEqual({
      den: [["add-counter", "creatureYouControl", null, false], ["cant-be-blocked", null, null, true]],
      spell: ["high", [["add-counter", "creature", null, false], ["cant-be-blocked", null, null, true]]],
    });
  });

  it("control — after a clause about the source itself (no target), \"it\" is still the source: Razzle-Dazzler", () => {
    const d = detectTriggers(DAZZLER)[0];
    const p = parseEffectClause(d.effectClause, "Instant", { sourceScoped: true });
    expect(p.atoms.map((a) => [a.op, a.target ?? null, !!a.bindPreviousTargets])).toEqual([["add-counter", "self", false], ["cant-be-blocked", "self", false]]);
    expect(classifyCard(DAZZLER)).toBe("native-trigger");
  });

  it("CREED (synthetic) — after a clause whose subject is not the controller or the target, a bare \"it\" is not read (the source might be meant)", () => {
    const p = parseEffectClause("This creature deals 1 damage to target creature. It can't be blocked this turn.", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("low");
  });

  it("control — no tier moves: Assassin Den stays native, Jailbreak Scheme stays parked (its second mode is unread)", () => {
    expect([classifyCard(DEN), classifyCard(SCHEME)]).toEqual(["native-activated", "arbiter-spell"]);
  });
});
