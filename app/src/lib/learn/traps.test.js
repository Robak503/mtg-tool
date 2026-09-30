/**
 * traps.test.js — the Zendikar Trap cycle's "If <condition>, you may pay <cost> rather than pay this spell's mana cost."
 * (shelf decks D17, 2026-09-30: Ricochet Trap for Killer Turts, Mindbreak Trap for Kinnan and Believe it!).
 *
 *   • the shared interveningIf reader learns the traps' opponent-scoped turn history — cast a <color> spell, cast N or more
 *     spells, drew N or more cards, gained life, had N or more cards put into their graveyard — and the live combat ("N or
 *     more creatures are attacking", "exactly one", "a <color> creature [with flying] is attacking"); the cast chokepoint now
 *     records each spell's colors;
 *   • the conditional fixed-mana alternative cost is stripped for the program parse only when that reader parses the
 *     condition, and offered at the cast site only while it holds;
 *   • Mindbreak Trap's "Exile any number of target spells" — each chosen spell to its owner's exile, not a counter.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, resetSpellsCastAllPlayers } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { evaluateInterveningIf, spellConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const RICOCHET = card("Ricochet Trap", "Instant — Trap", "{3}{R}", 4, "If an opponent cast a blue spell this turn, you may pay {R} rather than pay this spell's mana cost.\nChange the target of target spell with a single target.");
const MINDBREAK = card("Mindbreak Trap", "Instant — Trap", "{2}{U}{U}", 4, "If an opponent cast three or more spells this turn, you may pay {0} rather than pay this spell's mana cost.\nExile any number of target spells.");
const PITFALL = card("Pitfall Trap", "Instant — Trap", "{2}{W}", 3, "If exactly one creature is attacking, you may pay {W} rather than pay this spell's mana cost.\nDestroy target attacking creature without flying.");
const NEEDLEBITE = card("Needlebite Trap", "Instant — Trap", "{5}{B}{B}", 7, "If an opponent gained life this turn, you may pay {B} rather than pay this spell's mana cost.\nTarget player loses 5 life and you gain 5 life.");
const ADMIRALS = card("Admiral's Order", "Instant", "{1}{U}{U}", 3, "Raid — If you attacked this turn, you may pay {U} rather than pay this spell's mana cost.\nCounter target spell.", { keywords: ["Raid"] });
const REFRACTION = card("Refraction Trap", "Instant — Trap", "{3}{W}", 4, "If an opponent cast a red instant or sorcery spell this turn, you may pay {W} rather than pay this spell's mana cost.\nPrevent the next 3 damage that a source of your choice would deal to you and/or permanents you control this turn. If damage is prevented this way, Refraction Trap deals that much damage to any target.");
const COBRA = card("Cobra Trap", "Instant — Trap", "{4}{G}{G}", 6, "If a noncreature permanent under your control was destroyed this turn by a spell or ability an opponent controlled, you may pay {G} rather than pay this spell's mana cost.\nCreate four 1/1 green Snake creature tokens.");
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, "Return target creature to its owner's hand.", { colors: ["U"] });
const OPT = card("Opt", "Instant", "{U}", 1, "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", { keywords: ["Scry"], colors: ["U"] });
const BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const VOID_REND = card("Void Rend", "Instant", "{W}{U}{B}", 3, "This spell can't be countered.\nDestroy target nonland permanent.", { colors: ["W", "U", "B"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const SERRA = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", 5, "Flying\nVigilance (Attacking doesn't cause this creature to tap.)", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], colors: ["W"] });

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function board({ active = "ai", user = {}, ai = {}, over = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], ...(o.fields || {}), hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: (o.library || []).map((c, i) => ({ ...c, id: `${id}-lib${i}` })), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) }, ...over };
}
const castsOf = (s, who, id) => legalActionsForPlayer({ ...s, priorityHolder: who }, who).filter((a) => a.kind === "cast-spell" && a.cardId === id);
function cast(s, who, id, pick = () => true) {
  const a = castsOf(s, who, id).find(pick);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
const named = (s, name) => s.stack.find((o) => o.source?.name === name);
const ask = (s, cond, who = "user") => evaluateInterveningIf(s, cond, who);

describe("the reader learns the traps' conditions", () => {
  const withOpp = (fields) => board({ ai: { fields } });
  it("opponent-scoped turn history — true only for an OPPONENT's ledger, false for your own", () => {
    const row = {
      blue: [ask(withOpp({ spellColorsCastThisTurn: ["U"] }), "an opponent cast a blue spell this turn"), ask(withOpp({ spellColorsCastThisTurn: ["R"] }), "an opponent cast a blue spell this turn"),
        ask(board({ user: { fields: { spellColorsCastThisTurn: ["U"] } } }), "an opponent cast a blue spell this turn")],
      threeSpells: [ask(withOpp({ spellsCastThisTurn: 3 }), "an opponent cast three or more spells this turn"), ask(withOpp({ spellsCastThisTurn: 2 }), "an opponent cast three or more spells this turn")],
      drew: [ask(withOpp({ cardsDrawnThisTurn: 3 }), "an opponent drew three or more cards this turn"), ask(withOpp({ cardsDrawnThisTurn: 2 }), "an opponent drew three or more cards this turn")],
      gained: [ask(withOpp({ lifeGainedThisTurn: 1 }), "an opponent gained life this turn"), ask(withOpp({ lifeGainedThisTurn: 0 }), "an opponent gained life this turn"),
        ask(board({ user: { fields: { lifeGainedThisTurn: 4 } } }), "an opponent gained life this turn")],
      graveyard: [ask(withOpp({ gyEnteredThisTurn: 3 }), "an opponent had three or more cards put into their graveyard from anywhere this turn"), ask(withOpp({ gyEnteredThisTurn: 2 }), "an opponent had three or more cards put into their graveyard from anywhere this turn")],
    };
    expect(row).toEqual({ blue: [true, false, false], threeSpells: [true, false], drew: [true, false], gained: [true, false, false], graveyard: [true, false] });
  });
  it("the live combat: how many are attacking, and what — attackers that left the battlefield don't count", () => {
    const combat = (ids) => board({ active: "ai", ai: { bf: [perm("g", GIANT, "ai"), perm("b", BEAR, "ai"), perm("s", SERRA, "ai")] }, over: { combat: { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })) } } });
    const row = {
      oneOfOne: ask(combat(["g"]), "exactly one creature is attacking"), oneOfTwo: ask(combat(["g", "b"]), "exactly one creature is attacking"),
      threePlus: [ask(combat(["g", "b", "s"]), "three or more creatures are attacking"), ask(combat(["g", "b"]), "three or more creatures are attacking")],
      whiteFlyer: [ask(combat(["s"]), "a white creature with flying is attacking"), ask(combat(["g"]), "a white creature with flying is attacking")],
      goneAttacker: ask(combat(["g", "gone"]), "exactly one creature is attacking"),
      noCombat: ask(board(), "exactly one creature is attacking"),
    };
    expect(row).toEqual({ oneOfOne: true, oneOfTwo: false, threePlus: [true, false], whiteFlyer: [true, false], goneAttacker: true, noCombat: false });
  });
  it("each is readable by the spell gate; a condition outside the vocabulary is not", () => {
    const conds = ["an opponent cast a blue spell this turn", "an opponent cast three or more spells this turn", "an opponent drew three or more cards this turn", "an opponent gained life this turn",
      "an opponent had three or more cards put into their graveyard from anywhere this turn", "three or more creatures are attacking", "exactly one creature is attacking", "a black creature with flying is attacking"];
    expect({ read: conds.map(spellConditionParseable), red: spellConditionParseable("an opponent cast a red instant or sorcery spell this turn") }).toEqual({ read: Array(8).fill(true), red: false });
  });
  it("the cast chokepoint records a spell's colors for its caster; untap clears them", () => {
    let s = board({ active: "ai", ai: { hand: [["opt", OPT]], mana: { U: 1 }, library: [BEAR, BEAR] } });
    s = cast(s, "ai", "opt");
    expect({ cast: s.players.ai.spellColorsCastThisTurn, mine: s.players.user.spellColorsCastThisTurn ?? [], cleared: resetSpellsCastAllPlayers(s).players.ai.spellColorsCastThisTurn })
      .toEqual({ cast: ["U"], mine: [], cleared: [] });
  });
});

describe("⭐ the trap cost, offered only while the condition holds", () => {
  it("⭐ Ricochet Trap: {3}{R} until an opponent casts a blue spell — then {R} moves their Unsummon off your Giant", () => {
    const before = board({ active: "ai", user: { hand: [["ric", RICOCHET]], bf: [perm("giant", GIANT, "user")], mana: { R: 1 } }, ai: { hand: [["uns", UNSUMMON], ["bolt", BOLT]], bf: [perm("tb", BEAR, "ai")], mana: { U: 1, R: 1 } } });
    const redOnly = cast(before, "ai", "bolt", (a) => a.targets[0].id === "giant");
    const offeredOnRed = castsOf(redOnly, "user", "ric").length;
    let s = cast(before, "ai", "uns", (a) => a.targets[0].id === "giant");
    const trap = castsOf(s, "user", "ric");
    s = drain(dispatchAction({ ...s, priorityHolder: "user" }, trap[0]));
    const row = { offeredOnRed, offeredOnBlue: trap.length, cost: trap[0]?.cost?.R, giantHome: s.players.user.battlefield.some((p) => p.id === "giant"), bearBounced: s.players.ai.hand.some((c) => c.name === "Grizzly Bears") };
    console.log(`WITNESS ricochetTrap ${JSON.stringify(row)}`);
    expect(row).toEqual({ offeredOnRed: 0, offeredOnBlue: 1, cost: 1, giantHome: true, bearBounced: true });
  });
  it("⭐ Mindbreak Trap: free after an opponent's third spell — and it exiles the spells, even one that can't be countered", () => {
    let s = board({ active: "ai", user: { hand: [["mind", MINDBREAK]], bf: [perm("giant", GIANT, "user")] },
      ai: { hand: [["b1", BOLT], ["b2", BOLT], ["rend", VOID_REND]], mana: { R: 2, U: 1, W: 1, B: 1 } } });
    s = drain(cast(s, "ai", "b1", (a) => a.targets[0].id === "user"));
    const afterOne = castsOf(s, "user", "mind").length;
    s = drain(cast(s, "ai", "b2", (a) => a.targets[0].id === "user"));
    s = cast(s, "ai", "rend", (a) => a.targets[0].id === "giant");
    const free = castsOf(s, "user", "mind").find((a) => a.targets.length === 1 && a.targets[0].id === named(s, "Void Rend").id);
    s = drain(dispatchAction({ ...s, priorityHolder: "user" }, free));
    const row = { afterOne, cost: free && Object.values(free.cost || {}).filter((v) => typeof v === "number").reduce((x, y) => x + y, 0), rendExiled: s.players.ai.exile.some((c) => c.name === "Void Rend"), giantAlive: s.players.user.battlefield.some((p) => p.id === "giant") };
    console.log(`WITNESS mindbreakTrap ${JSON.stringify(row)}`);
    expect(row).toEqual({ afterOne: 0, cost: 0, rendExiled: true, giantAlive: true });
  });
  it("Pitfall Trap: {W} only while exactly one creature attacks", () => {
    const combat = (ids) => board({ active: "ai", user: { hand: [["pit", PITFALL]], mana: { W: 1 } }, ai: { bf: [perm("g", GIANT, "ai"), perm("b", BEAR, "ai")] },
      over: { phase: "combat", step: "declare-blockers", combat: { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })) } } });
    const lone = castsOf(combat(["g"]), "user", "pit");
    const pair = castsOf(combat(["g", "b"]), "user", "pit");
    expect({ lone: lone.map((a) => a.targets[0].id), pair: pair.length }).toEqual({ lone: ["g"], pair: 0 });
  });
  it("Admiral's Order's Raid form reads through its ability-word label: {U} only after you attacked", () => {
    const s = (attacked) => board({ active: "user", user: { hand: [["adm", ADMIRALS]], mana: { U: 1 }, fields: { attackedThisTurn: attacked } }, ai: { hand: [["bolt", BOLT]], mana: { R: 1 } } });
    const withBolt = (st) => cast(st, "ai", "bolt", (a) => a.targets[0].id === "user");
    expect({ attacked: castsOf(withBolt(s(true)), "user", "adm").length, not: castsOf(withBolt(s(false)), "user", "adm").length }).toEqual({ attacked: 1, not: 0 });
  });
});

describe("every other gained trap: the cheap cost appears exactly when its condition holds", () => {
  const RUNEFLARE = card("Runeflare Trap", "Instant — Trap", "{4}{R}{R}", 6, "If an opponent drew three or more cards this turn, you may pay {R} rather than pay this spell's mana cost.\nRuneflare Trap deals damage to target player equal to the number of cards in that player's hand.");
  const RAVENOUS = card("Ravenous Trap", "Instant — Trap", "{2}{B}{B}", 4, "If an opponent had three or more cards put into their graveyard from anywhere this turn, you may pay {0} rather than pay this spell's mana cost.\nExile all cards from target player's graveyard.");
  const LETHARGY = card("Lethargy Trap", "Instant — Trap", "{3}{U}", 4, "If three or more creatures are attacking, you may pay {U} rather than pay this spell's mana cost.\nAttacking creatures get -3/-0 until end of turn.");
  const SLINGBOW = card("Slingbow Trap", "Instant — Trap", "{3}{G}", 4, "If a black creature with flying is attacking, you may pay {G} rather than pay this spell's mana cost.\nDestroy target attacking creature with flying.");
  const NIGHTHAWK = card("Vampire Nighthawk", "Creature — Vampire Shaman", "{1}{B}{B}", 3, "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)", { power: "2", toughness: "3", keywords: ["Deathtouch", "Flying", "Lifelink"], colors: ["B"] });
  const offered = (trap, cheap, { ai = {}, over = {} } = {}) => castsOf(board({ active: "ai", user: { hand: [["t", trap]], mana: cheap }, ai, over }), "user", "t").length > 0;
  const attacking = (ids) => ({ phase: "combat", step: "declare-blockers", combat: { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })) } });
  it("'a black creature WITH FLYING is attacking' is false for a black creature on the ground — even beside a white flyer Slingbow could hit", () => {
    const GRAVEDIGGER = card("Gravedigger", "Creature — Zombie", "{3}{B}", 4, "When this creature enters, you may return target creature card from your graveyard to your hand.", { power: "2", toughness: "2", colors: ["B"] });
    const bf = [perm("gd", GRAVEDIGGER, "ai"), perm("s", SERRA, "ai")];
    expect(offered(SLINGBOW, { G: 1 }, { ai: { bf }, over: attacking(["gd", "s"]) })).toBe(false);
  });
  it("Needlebite, Runeflare, Ravenous, Lethargy, Slingbow — each offered for its trap cost only under its condition", () => {
    const three = [perm("g", GIANT, "ai"), perm("b", BEAR, "ai"), perm("s", SERRA, "ai")];
    expect({
      needlebite: [offered(NEEDLEBITE, { B: 1 }, { ai: { fields: { lifeGainedThisTurn: 2 } } }), offered(NEEDLEBITE, { B: 1 })],
      runeflare: [offered(RUNEFLARE, { R: 1 }, { ai: { fields: { cardsDrawnThisTurn: 3 } } }), offered(RUNEFLARE, { R: 1 }, { ai: { fields: { cardsDrawnThisTurn: 2 } } })],
      ravenous: [offered(RAVENOUS, {}, { ai: { fields: { gyEnteredThisTurn: 3 } } }), offered(RAVENOUS, {}, { ai: { fields: { gyEnteredThisTurn: 2 } } })],
      lethargy: [offered(LETHARGY, { U: 1 }, { ai: { bf: three }, over: attacking(["g", "b", "s"]) }), offered(LETHARGY, { U: 1 }, { ai: { bf: three }, over: attacking(["g", "b"]) })],
      slingbow: [offered(SLINGBOW, { G: 1 }, { ai: { bf: [perm("hawk", NIGHTHAWK, "ai")] }, over: attacking(["hawk"]) }), offered(SLINGBOW, { G: 1 }, { ai: { bf: [perm("s", SERRA, "ai")] }, over: attacking(["s"]) })],
    }).toEqual({ needlebite: [true, false], runeflare: [true, false], ravenous: [true, false], lethargy: [true, false], slingbow: [true, false] });
  });
});

describe("the tiers", () => {
  it("the readable traps are native; a trap whose condition the reader can't parse keeps its sentence and stays out", () => {
    expect({ native: [RICOCHET, MINDBREAK, PITFALL, NEEDLEBITE, ADMIRALS].map((x) => classifyCard(x)), out: [REFRACTION, COBRA].map((x) => classifyCard(x)) })
      .toEqual({ native: Array(5).fill("native-spell"), out: ["arbiter-spell", "arbiter-spell"] });
  });
});
