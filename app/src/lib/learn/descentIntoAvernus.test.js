/**
 * descentIntoAvernus.test.js — DESCENT INTO AVERNUS (the play-weighted program, EDHREC #891):
 *
 *   "At the beginning of your upkeep, put two descent counters on this enchantment. Then each player creates X Treasure tokens and
 *    this enchantment deals X damage to each player, where X is the number of descent counters on this enchantment."
 *
 * Two readers were missing. "Each player creates …" — every player creates the tokens under their own control (CR 111.2), in APNAP
 * order (CR 101.4), their own token doubler applying (tokens.js `whoCreates: "each"`). And ONE X ACROSS CONJUNCTS — the trailing
 * "where X is …" defines the X of both halves, read once when the effect is applied (CR 608.2h): the parser emits a `bind-x` step
 * (parser.bindXAcrossConjuncts) that runEffectProgram reads as the program's X, after the counters are put on, before either half.
 * The trigger is played through the real path: the untap step advanced to the upkeep (gameEngine.nextStep — the trigger goes on
 * the stack), then resolved (resolveTopOfStack). Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { nextStep, resolveTopOfStack, closeAttackDeclaration, finalizeStackResolution } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { parseLoyaltyAbilities } from "./effects/loyaltyAbilities.js";

beforeEach(() => _resetIdsForTests());

const DESCENT = {"name":"Descent into Avernus","type":"Enchantment","mana":"{2}{R}","oracle":"At the beginning of your upkeep, put two descent counters on this enchantment. Then each player creates X Treasure tokens and this enchantment deals X damage to each player, where X is the number of descent counters on this enchantment.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Treasure"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #891
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #190
const PARALLEL_LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #408
const CAMARADERIE = {"name":"Camaraderie","type":"Sorcery","mana":"{4}{G}{W}","oracle":"You gain X life and draw X cards, where X is the number of creatures you control. Creatures you control get +1/+1 until end of turn.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G","W"],"colorIdentity":["G","W"]}; // EDHREC #4776 // the twin shape (see the last block)

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** A four-seat pod at `seat`'s untap step, Descent on `seat`'s battlefield with `counters` descent counters, plus `extra` permanents. */
function pod({ seat = "user", counters = 0, extra = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const desc = on(seat, "desc", DESCENT, counters ? { counters: { descent: counters } } : {});
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const mine = extra.filter((p) => p.controller === pid);
    players[pid] = { ...players[pid], battlefield: [...(pid === seat ? [desc] : []), ...mine], hand: [], library: Array.from({ length: 5 }, (_, i) => ({ name: "Wastes", type: "Basic Land", oracle: "({T}: Add {C}.)", id: `${pid}-w${i}` })) };
  }
  return { ...g, turn: 5, phase: "beginning", step: "untap", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
/** Advance from the untap step into the upkeep and resolve everything on the stack. */
function upkeep(s) {
  let n = nextStep(s);
  expect(n.step).toBe("upkeep");
  let g = 0;
  while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n);
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error" || e.kind === "pending-arbiter");
  expect(crash, `a resolver crashed or routed to the Arbiter: ${JSON.stringify(crash)}`).toBeFalsy();
  return n;
}
const treasures = (s, pid) => (s.players[pid].battlefield || []).filter((p) => p.card?.name === "Treasure" && p.controller === pid).length;
const lives = (s) => Object.fromEntries(Object.keys(s.players).map((pid) => [pid, s.players[pid].life]));
const tally = (s) => Object.fromEntries(Object.keys(s.players).map((pid) => [pid, treasures(s, pid)]));
const counters = (s) => s.players.user.battlefield.find((p) => p.id === "desc")?.counters?.descent ?? 0;

describe("the card", () => {
  it("⭐ native: the upkeep trigger reads as the counters, the bound X, each player's Treasures and the damage to each player", () => {
    const [d] = detectTriggers(DESCENT);
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    expect({ tier: classifyCard(DESCENT), event: d.event, confidence: p.confidence, xSpell: p.xSpell, atoms: p.atoms }).toEqual({
      tier: "native-trigger", event: "upkeep", confidence: "high", xSpell: false,
      atoms: [
        { op: "add-named-counter-self", counterType: "descent", amount: 2 },
        { op: "bind-x", countFor: { kind: "namedCountersOnSource", counterType: "descent" }, targetType: null },
        { op: "create-named-token", token: "treasure", countX: true, targetType: null, whoCreates: "each" },
        { op: "deal-damage", targetType: "eachPlayer", amountX: true },
      ],
    });
  });
});

describe("the upkeep trigger", () => {
  it("⭐ first upkeep: two counters, then each of the four players creates two Treasures under their own control and is dealt 2 damage", () => {
    const s = upkeep(pod());
    expect({ counters: counters(s), treasures: tally(s), life: lives(s) }).toEqual({
      counters: 2, treasures: { user: 2, ai1: 2, ai2: 2, ai3: 2 }, life: { user: 38, ai1: 38, ai2: 38, ai3: 38 },
    });
  });
  it("⭐ X is the counters as the effect is applied — after the two are put on: four already there make six, so six Treasures each and 6 damage", () => {
    const s = upkeep(pod({ counters: 4 }));
    expect({ counters: counters(s), treasures: tally(s), life: lives(s) }).toEqual({
      counters: 6, treasures: { user: 6, ai1: 6, ai2: 6, ai3: 6 }, life: { user: 34, ai1: 34, ai2: 34, ai3: 34 },
    });
  });
  it("⭐ one X for both halves: Doubling Season under Descent's controller puts four counters (X = 4), and doubles only its controller's Treasures", () => {
    const s = upkeep(pod({ extra: [on("user", "ds", DOUBLING_SEASON)] }));
    expect({ counters: counters(s), treasures: tally(s), life: lives(s) }).toEqual({
      counters: 4, treasures: { user: 8, ai1: 4, ai2: 4, ai3: 4 }, life: { user: 36, ai1: 36, ai2: 36, ai3: 36 },
    });
  });
  it("⭐ an opponent's Parallel Lives doubles that opponent's Treasures only (CR 111.2 — the tokens are theirs, created under their control)", () => {
    const s = upkeep(pod({ extra: [on("ai2", "pl", PARALLEL_LIVES)] }));
    expect(tally(s)).toEqual({ user: 2, ai1: 2, ai2: 4, ai3: 2 });
  });
  it("each player's Treasures are their own mana: an opponent's Treasure is offered to that opponent", () => {
    const s = upkeep(pod());
    const ai1Treasure = s.players.ai1.battlefield.find((p) => p.card?.name === "Treasure");
    expect({ owner: ai1Treasure?.controller, tapped: ai1Treasure?.tapped }).toEqual({ owner: "ai1", tapped: false });
  });
  it("⛔ not on an opponent's upkeep", () => {
    const s0 = pod();
    const s = upkeep({ ...s0, activePlayer: "ai1", priorityHolder: "ai1" });
    expect({ counters: counters(s), treasures: tally(s), life: lives(s).user }).toEqual({ counters: 0, treasures: { user: 0, ai1: 0, ai2: 0, ai3: 0 }, life: 40 });
  });
  it("⭐ Descent leaves with its trigger on the stack: X is its last known counters (CR 608.2h) — 4 Treasures each and 4 damage to each player", () => {
    let s = nextStep(pod({ counters: 4 }));
    expect({ step: s.step, onStack: (s.stack || []).map((o) => o.source?.name) }).toEqual({ step: "upkeep", onStack: ["Descent into Avernus"] });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "desc" });
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Descent into Avernus"]);
    s = resolveTopOfStack(s);
    expect({ treasures: tally(s), life: lives(s), x: (s.log || []).filter((e) => e.effect === "bind-x").map((e) => e.x) }).toEqual({
      treasures: { user: 4, ai1: 4, ai2: 4, ai3: 4 }, life: { user: 36, ai1: 36, ai2: 36, ai3: 36 }, x: [4],
    });
  });
  it("a player who has left the game creates nothing and is dealt nothing", () => {
    const s0 = pod();
    const { ai3: _gone, ...rest } = s0.players;
    const s = upkeep({ ...s0, players: rest, turnOrder: ["user", "ai1", "ai2"] });
    expect({ treasures: tally(s), life: lives(s) }).toEqual({ treasures: { user: 2, ai1: 2, ai2: 2 }, life: { user: 38, ai1: 38, ai2: 38 } });
  });
});

describe("ONE X ACROSS CONJUNCTS — the twin shape on a spell", () => {
  it("⭐ Camaraderie's \"You gain X life and draw X cards, where X is the number of creatures you control\": bound once, no X chosen at cast", () => {
    const p = parseEffectProgram(CAMARADERIE);
    expect({ confidence: p.confidence, xSpell: p.xSpell, ops: p.atoms.map((a) => a.op) }).toEqual({ confidence: "high", xSpell: false, ops: ["bind-x", "gain-life", "draw", "pump"] });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const bears = (i) => on("user", `b${i}`, { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"] });
    const s = { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...g.players, user: { ...g.players.user, battlefield: [bears(0), bears(1), bears(2)], hand: [{ ...CAMARADERIE, id: "h-cam" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 1, C: 4 },
        library: Array.from({ length: 6 }, (_, i) => ({ name: "Wastes", type: "Basic Land", oracle: "({T}: Add {C}.)", id: `w${i}` })) } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-cam");
    expect(casts.map((a) => a.xValue ?? null)).toEqual([null]);
    const n = resolveTopOfStack(dispatchAction(s, casts[0]));
    expect({ life: n.players.user.life, hand: n.players.user.hand.length }).toEqual({ life: 43, hand: 3 });
  });
});

describe("⛔ no binding inside a loyalty parse reaches every nested parse (noBindX — the recheck's R2)", () => {
  // Synthetic clause SHAPES (parser input, not card text): the binder's sentence inside each nested reader — a conditional's base, a
  // mode, a reflexive payoff. Parsed with noBindX, then without, then with again, so a cached program never crosses the option.
  const BOUND = "you gain X life and draw X cards, where X is the number of lands you control";
  const SHAPES = {
    conditional: `You gain X life and draw X cards, where X is the number of lands you control. If you control six or more lands, draw a card instead.`,
    modal: `Choose one —\n• ${BOUND[0].toUpperCase()}${BOUND.slice(1)}.\n• Draw a card.`,
    reflexive: `You may sacrifice a creature. When you do, ${BOUND}.`,
  };
  const binds = (p) => JSON.stringify(p || {}).includes('"bind-x"');
  for (const [shape, text] of Object.entries(SHAPES)) {
    it(`${shape}: no bind-x under noBindX, before and after the plain parse binds it`, () => {
      const first = parseEffectClause(text, "Instant", { noBindX: true });
      const plain = parseEffectClause(text, "Instant");
      const again = parseEffectClause(text, "Instant", { noBindX: true });
      expect({ first: binds(first), plain: binds(plain) && plain.confidence, again: binds(again) }).toEqual({ first: false, plain: "high", again: false });
    });
  }
});

const NISSA = {"name":"Nissa, Voice of Zendikar","type":"Legendary Planeswalker — Nissa","mana":"{1}{G}{G}","oracle":"+1: Create a 0/1 green Plant creature token.\n−2: Put a +1/+1 counter on each creature you control.\n−7: You gain X life and draw X cards, where X is the number of lands you control.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"3","keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #5239
const DUODRONE = {"name":"Marching Duodrone","type":"Artifact Creature — Construct","mana":"{2}","oracle":"Whenever this creature attacks, each player creates a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Treasure"],"colors":[],"colorIdentity":[]}; // EDHREC #6957
const EDGE_ROVER = {"name":"Edge Rover","type":"Artifact Creature — Robot Scout","mana":"{G}","oracle":"Reach\nWhen this creature dies, each player creates a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")","layout":"normal","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":["Reach"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #16060
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","oracle":"Shock deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2215
const FOREST_CARD = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};

describe("the twins", () => {
  /** A four-seat pod in `seat`'s precombat main with `perms` and `extra` on `seat`'s side. */
  const main = (perms, extra = {}) => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, battlefield: perms, hand: [], library: Array.from({ length: 8 }, (_, i) => ({ ...FOREST_CARD, id: `lib-${i}` })), ...extra } } };
  };
  it("⛔ Nissa, Voice of Zendikar (#5239) is held back: planeswalkers are their own program, so a loyalty ability never reads the binder — her −7 stays unmodeled and she stays playable-pw", () => {
    const loyalty = parseLoyaltyAbilities(NISSA);
    expect({ tier: classifyCard(NISSA), modeled: loyalty.map((l) => l.modeled), ops: (loyalty[2].program?.atoms || []).map((a) => a.op) })
      .toEqual({ tier: "playable-pw", modeled: [true, true, false], ops: [] });
  });
  it("⭐ Marching Duodrone (#6957, each player creates): it attacks — each of the four players creates a Treasure", () => {
    const s0 = main([on("user", "duo", DUODRONE)]);
    let s = closeAttackDeclaration({ ...s0, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "duo", attackingPlayer: "user", defender: "ai1" }], blockers: [] } }).state;
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ tier: classifyCard(DUODRONE), treasures: tally(s) }).toEqual({ tier: "native-trigger", treasures: { user: 1, ai1: 1, ai2: 1, ai3: 1 } });
  });
  it("⭐ Edge Rover (#16060, each player creates): Shocked, it dies — each player creates a Lander token under their own control", () => {
    const s0 = main([on("user", "rover", EDGE_ROVER)], { hand: [{ ...SHOCK, id: "h-shock" }], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } });
    const shock = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-shock" && a.targets?.[0]?.id === "rover");
    let s = finalizeStackResolution(resolveTopOfStack(dispatchAction(s0, shock)));
    while (s.stack.length) s = finalizeStackResolution(resolveTopOfStack(s));
    const landers = Object.fromEntries(Object.keys(s.players).map((pid) => [pid, s.players[pid].battlefield.filter((p) => p.card?.name === "Lander" && p.controller === pid).length]));
    expect({ tier: classifyCard(EDGE_ROVER), rover: s.players.user.graveyard.some((c) => c.name === "Edge Rover"), landers }).toEqual({ tier: "native-trigger", rover: true, landers: { user: 1, ai1: 1, ai2: 1, ai3: 1 } });
  });
});

describe("⛔ a rider \"each player creates\" must not leave behind", () => {
  const RENDMAW = {"name":"Rendmaw, Creaking Nest","type":"Legendary Artifact Creature — Scarecrow","mana":"{3}{B}{G}","oracle":"Reach, menace\nWhen Rendmaw enters and whenever you play a card with two or more card types, each player creates a tapped 2/2 black Bird creature token with flying. The tokens are goaded for the rest of the game. (They attack each combat if able and attack a player other than you if able.)","layout":"normal","cmc":5,"power":"5","toughness":"5","loyalty":null,"keywords":["Reach","Goad","Menace"],"colors":["B","G"],"colorIdentity":["B","G"]}; // EDHREC #6487
  it("Rendmaw, Creaking Nest's compound trigger keeps \"The tokens are goaded …\" in its enters half, so the half (and the card) stay on the Arbiter", () => {
    const [d] = detectTriggers(RENDMAW);
    expect({ event: d.event, effect: d.effectClause, native: triggerRoutesNatively(d), tier: classifyCard(RENDMAW) }).toEqual({
      event: "etb", effect: "each player creates a tapped 2/2 black Bird creature token with flying. The tokens are goaded for the rest of the game", native: false, tier: "body-only",
    });
  });
});
