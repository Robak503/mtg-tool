/**
 * valakutAwakening.test.js — the play-weighted program, #514: VALAKUT AWAKENING // VALAKUT STONEFORGE (EDHREC rank #514).
 *
 *   Valakut Awakening (Instant {2}{R}): "Put any number of cards from your hand on the bottom of your library, then draw that
 *   many cards plus one."
 *   Valakut Stoneforge (Land): "This land enters tapped. {T}: Add {R}."
 *
 * The land back already played (land-partial); this slice reads the front. splitClauses keeps the sentence whole ("that many"
 * is the count put back) and hand.js reads it as the CONTROLLER's form of the Teferi's Puzzle Box composite
 * (hand-to-bottom-draw-same, `anyNumber` + `plus: 1`). "Any number" is a choice made as the spell resolves; the house policy
 * puts back every card in hand except a commander (CR 903.9b — its owner's command-zone replacement is not modeled, so the
 * policy never tucks one), in hand order (CR 401.4 — the owner arranges them), then draws that many plus one through the draw
 * chokepoint — a short library is the ordinary empty-library draw (CR 121.4). The spell is on the stack while it resolves
 * (CR 601.2a), never one of the cards put back.
 *
 * The modal-DFC face projection now carries the face's OWN colours (CR 712.8f / 202.2 / 107.4e): every face view used to
 * inherit the combined card's top-level [] and was cast colourless (Kozilek's Sentinel fired on a red Valakut Awakening;
 * Ceremonious Rejection could counter it).
 *
 * Real oracle fixtures (bundled Scryfall data, generated 2026-10-01 with the fixture template — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { mdfcFaceCards, spellMdfcFaceCards } from "./modalDfc.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (cardIndex.publicCard over the bundled Scryfall data) ──
const VALAKUT = {"name":"Valakut Awakening // Valakut Stoneforge","type":"Instant // Land","mana":"{2}{R}","cmc":3,"keywords":[],"layout":"modal_dfc","colors":[],"oracle":"Valakut Awakening - Instant {2}{R}\nPut any number of cards from your hand on the bottom of your library, then draw that many cards plus one.\n//\nValakut Stoneforge - Land \nThis land enters tapped.\n{T}: Add {R}."}; // native-spell
const INTO_THE_FIRE = {"name":"Into the Fire","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Choose one —\n• Into the Fire deals 2 damage to each creature, planeswalker, and battle.\n• Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one."}; // arbiter-spell
const INTO_THE_NIGHT = {"name":"Into the Night","type":"Sorcery","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"It becomes night. Discard any number of cards, then draw that many cards plus one."}; // arbiter-spell
const PUZZLE_BOX = {"name":"Teferi's Puzzle Box","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards."}; // native-trigger
const SHEOLDRED = {"name":"Sheoldred, the Apocalypse","type":"Legendary Creature — Phyrexian Praetor","mana":"{2}{B}{B}","cmc":4,"power":"4","toughness":"5","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life."}; // native-trigger
const KRENKO = {"name":"Krenko, Mob Boss","type":"Legendary Creature — Goblin Warrior","mana":"{2}{R}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control."}; // native-activated
const SENTINEL = {"name":"Kozilek's Sentinel","type":"Creature — Eldrazi Drone","mana":"{1}{R}","cmc":2,"power":"1","toughness":"4","keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nWhenever you cast a colorless spell, this creature gets +1/+0 until end of turn."}; // native-trigger
const REJECTION = {"name":"Ceremonious Rejection","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Counter target colorless spell."}; // native-spell
const BEB = {"name":"Blue Elemental Blast","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Choose one —\n• Counter target red spell.\n• Destroy target red permanent."}; // native-spell
const BIRGI = {"name":"Birgi, God of Storytelling // Harnfel, Horn of Bounty","type":"Legendary Creature — God // Legendary Artifact","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"layout":"modal_dfc","colors":[],"oracle":"Birgi, God of Storytelling - Legendary Creature — God {2}{R}\nWhenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once.\n//\nHarnfel, Horn of Bounty - Legendary Artifact {4}{R}\nDiscard a card: Exile the top two cards of your library. You may play those cards this turn."}; // native-mixed
const DROWNER = {"name":"Drowner of Truth // Drowned Jungle","type":"Creature — Eldrazi // Land","mana":"{5}{G/U}{G/U}","cmc":7,"power":"7","toughness":"6","keywords":["Devoid"],"layout":"modal_dfc","colors":[],"oracle":"Drowner of Truth - Creature — Eldrazi {5}{G/U}{G/U}\nDevoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"\n//\nDrowned Jungle - Land \nThis land enters tapped.\n{T}: Add {G} or {U}."}; // land-partial
const STUMP = {"name":"Stump Stomp // Burnwillow Clearing","type":"Sorcery // Land","mana":"{1}{R/G}","cmc":2,"keywords":[],"layout":"modal_dfc","colors":[],"oracle":"Stump Stomp - Sorcery {1}{R/G}\nTarget creature you control deals damage equal to its power to target creature or planeswalker you don't control.\n//\nBurnwillow Clearing - Land \nThis land enters tapped.\n{T}: Add {R} or {G}."}; // native-spell
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const FRONT = mdfcFaceCards(VALAKUT)[0].oracle; // the front face's own text, read off the generated fixture
const ATOM = { op: "hand-to-bottom-draw-same", who: "controller", anyNumber: true, plus: 1, targetType: null };

const cards = (n, pfx) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${pfx}${i + 1}` }));
const ids = (zone) => zone.map((c) => c.id);
function board({ hand = [], library = cards(6, "L"), battlefield = [], aiHand = [], aiPool = {}, active = "user", priority = "user", pool = { R: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: priority, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, hand, library, battlefield, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, hand: aiHand, manaPool: { ...s.players.ai.manaPool, ...aiPool } } } };
}
const va = () => ({ ...VALAKUT, id: "va" });
const castsOf = (s, pid, cardId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
function castValakut(s) {
  const a = castsOf(s, "user", "va");
  if (a.length !== 1) throw new Error(`expected exactly one Valakut Awakening cast, found ${a.length}`);
  return dispatchAction(s, a[0]);
}
function resolveAll(s) {
  let n = s, guard = 0;
  while (n.stack.length && !n.pendingChoice && guard++ < 30) n = resolveTopOfStack(n);
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}

describe("the card", () => {
  it("⭐ native-spell: the front reads whole — one clause, one composite — and the land back is fully covered", () => {
    const [front, back] = mdfcFaceCards(VALAKUT);
    const program = parseEffectProgram(front);
    expect({ tier: classifyCard(VALAKUT), front: classifyCard(front), back: classifyCard(back), clauses: splitClauses(front.oracle).length,
      confidence: programConfidence(program), atoms: program.atoms })
      .toEqual({ tier: "native-spell", front: "native-spell", back: "land", clauses: 1, confidence: "high", atoms: [ATOM] });
  });

  it("⛔ seen-to-fail: every other wording stays LOW and the card stays land-partial", () => {
    const variants = [
      FRONT.replace(" plus one", ""), // "that many cards" — a different count
      FRONT.replace("on the bottom of", "on top of"), // the other end of the library
      FRONT.replace("Put any number of cards from your hand on the bottom of your library", "Discard any number of cards"), // the Into the Night verb
    ];
    expect(variants.map((t) => {
      const card = { ...VALAKUT, oracle: VALAKUT.oracle.replace(FRONT, t) };
      return [programConfidence(parseEffectProgram(mdfcFaceCards(card)[0])), classifyCard(card)];
    })).toEqual([["low", "land-partial"], ["low", "land-partial"], ["low", "land-partial"]]);
  });

  it("the same sentence elsewhere: Into the Fire's second mode reads the same atom, but the card stays parked on its unmodeled first mode; Into the Night's discard is another card", () => {
    const mode2 = parseEffectProgram({ ...INTO_THE_FIRE, oracle: FRONT });
    expect({ mode2: mode2.atoms, fire: classifyCard(INTO_THE_FIRE), night: classifyCard(INTO_THE_NIGHT), nightConfidence: programConfidence(parseEffectProgram(INTO_THE_NIGHT)) })
      .toEqual({ mode2: [ATOM], fire: "arbiter-spell", night: "arbiter-spell", nightConfidence: "low" });
  });
});

describe("the face (CR 712.11b, 712.12)", () => {
  it("⭐ from the hand: exactly one cast — the front face at {2}{R}, never the combined card — beside its land drop", () => {
    const acts = legalActionsForPlayer(board({ hand: [va()] }), "user");
    const casts = acts.filter((a) => a.kind === "cast-spell" && a.cardId === "va");
    expect({ casts: casts.map((a) => [a.faceCard?.name, a.cost.generic, a.cost.R]), lands: acts.filter((a) => a.kind === "play-land").map((a) => a.name) })
      .toEqual({ casts: [["Valakut Awakening", 2, 1]], lands: ["Valakut Stoneforge"] });
  });

  it("an instant: cast on an opponent's turn with priority (no land drop offered there)", () => {
    const acts = legalActionsForPlayer(board({ hand: [va()], active: "ai", priority: "user" }), "user");
    expect({ casts: acts.filter((a) => a.kind === "cast-spell" && a.cardId === "va").map((a) => a.faceCard?.name), lands: acts.filter((a) => a.kind === "play-land").length })
      .toEqual({ casts: ["Valakut Awakening"], lands: 0 });
  });

  it("the land face is a land play: Valakut Stoneforge enters tapped, uses the land drop, and nothing is cast", () => {
    const s0 = board({ hand: [va()] });
    const play = legalActionsForPlayer(s0, "user").find((a) => a.kind === "play-land" && a.cardId === "va");
    const s = dispatchAction(s0, play);
    const perm = s.players.user.battlefield.find((p) => p.printedCard?.id === "va");
    expect({ name: perm.card.name, tapped: perm.tapped, printed: perm.printedCard.name, landDrops: s.players.user.landsPlayedThisTurn, stack: s.stack.length, hand: s.players.user.hand.length, spellsCast: s.players.user.spellsCastThisTurn || 0 })
      .toEqual({ name: "Valakut Stoneforge", tapped: true, printed: VALAKUT.name, landDrops: 1, stack: 0, hand: 0, spellsCast: 0 });
  });
});

describe("resolution", () => {
  it("⭐ put back N → draw N + 1: the hand goes to the bottom in hand order, the draws come off the top, the whole card goes to the graveyard (WITNESS)", () => {
    const cast = castValakut(board({ hand: [va(), ...cards(3, "H")] }));
    const onStack = { hand: ids(cast.players.user.hand), stack: cast.stack.map((o) => o.source?.name) };
    const s = resolveAll(cast);
    const witness = { onStack, hand: ids(s.players.user.hand), library: ids(s.players.user.library), graveyard: s.players.user.graveyard.map((c) => c.name) };
    console.log(`WITNESS valakutAwakening ${JSON.stringify(witness)}`);
    expect(witness).toEqual({
      onStack: { hand: ["H1", "H2", "H3"], stack: ["Valakut Awakening"] }, // CR 601.2a — the spell left the hand it is about to read
      hand: ["L1", "L2", "L3", "L4"], // 3 put back, 3 + 1 drawn
      library: ["L5", "L6", "H1", "H2", "H3"], // the bottom three are the cards put back, in hand order
      graveyard: [VALAKUT.name], // the whole card (CR 608.2n), never one of the cards put back
    });
  });

  it("put back 0 → draw 1: with nothing else in hand the spell still draws one", () => {
    const s = resolveAll(castValakut(board({ hand: [va()], library: cards(3, "L") })));
    expect({ hand: ids(s.players.user.hand), library: ids(s.players.user.library) }).toEqual({ hand: ["L1"], library: ["L2", "L3"] });
  });

  it("a commander in hand stays there (CR 903.9b is not modeled, so the policy never tucks one); only the cards put back count", () => {
    const krenko = { ...KRENKO, id: "cmdr", isCommander: true };
    const s = resolveAll(castValakut(board({ hand: [va(), krenko, ...cards(1, "H")] })));
    expect({ hand: ids(s.players.user.hand), library: ids(s.players.user.library) })
      .toEqual({ hand: ["cmdr", "L1", "L2"], library: ["L3", "L4", "L5", "L6", "H1"] }); // one put back, two drawn
  });

  it("a short library: the extra draw is the ordinary empty-library draw (CR 121.4), not special-cased", () => {
    const s = resolveAll(castValakut(board({ hand: [va(), ...cards(2, "H")], library: [] })));
    expect({ hand: ids(s.players.user.hand), library: s.players.user.library.length, triedToDrawFromEmpty: !!s.players.user.triedToDrawFromEmpty })
      .toEqual({ hand: ["H1", "H2"], library: 0, triedToDrawFromEmpty: true });
  });

  it("the draws are real draws: Sheoldred sees N + 1 of them", () => {
    const sheoldred = createPermanent({ id: "sheol", card: { ...SHEOLDRED, id: "c-sheol" }, controller: "user", summoningSick: false });
    const s0 = board({ hand: [va(), ...cards(2, "H")], battlefield: [sheoldred] });
    const s = resolveAll(castValakut(s0));
    expect(s.players.user.life - s0.players.user.life).toBe(6); // three draws × 2
  });
});

describe("colour (CR 712.8f, 202.2) — the face is red, never colourless", () => {
  it("⭐ cast: Kozilek's Sentinel does not trigger; Blue Elemental Blast may counter it and Ceremonious Rejection may not", () => {
    const sentinel = createPermanent({ id: "sentinel", card: { ...SENTINEL, id: "c-sentinel" }, controller: "user", summoningSick: false });
    const cast = castValakut(board({ hand: [va()], battlefield: [sentinel], aiHand: [{ ...BEB, id: "beb" }, { ...REJECTION, id: "rej" }], aiPool: { U: 2 } }));
    const answer = { ...cast, priorityHolder: "ai" };
    const targetsOf = (cardId) => castsOf(answer, "ai", cardId).flatMap((a) => (a.targets || []).map((t) => t.name));
    expect({ stack: cast.stack.map((o) => o.source?.name), beb: targetsOf("beb"), rejection: targetsOf("rej") })
      .toEqual({ stack: ["Valakut Awakening"], beb: ["Valakut Awakening"], rejection: [] });
  });

  it("seen-to-fail control: a truly colourless spell (Sol Ring) does trigger the Sentinel and is a Rejection target", () => {
    const sentinel = createPermanent({ id: "sentinel", card: { ...SENTINEL, id: "c-sentinel" }, controller: "user", summoningSick: false });
    const s0 = board({ hand: [{ ...SOL_RING, id: "ring" }], battlefield: [sentinel], aiHand: [{ ...REJECTION, id: "rej" }], aiPool: { U: 1 }, pool: { C: 1 } });
    const cast = dispatchAction(s0, castsOf(s0, "user", "ring")[0]);
    const answer = flushTriggers({ ...cast, priorityHolder: "ai" }, { chooseTargets: chooseTriggerTargets });
    expect({ sentinelTriggered: answer.stack.length > 1, rejection: castsOf({ ...answer, priorityHolder: "ai" }, "ai", "rej").flatMap((a) => (a.targets || []).map((t) => t.name)) })
      .toEqual({ sentinelTriggered: true, rejection: ["Sol Ring"] });
  });

  it("the projection reads each FACE's own colours: red // colourless (Valakut), hybrid both (Stump Stomp), devoid none (Drowner of Truth), and the spell // spell lane too (Birgi)", () => {
    const colours = (views) => views.map((v) => v.colors);
    expect({ valakut: colours(mdfcFaceCards(VALAKUT)), stump: colours(mdfcFaceCards(STUMP)), drowner: colours(mdfcFaceCards(DROWNER)), birgi: colours(spellMdfcFaceCards(BIRGI)) })
      .toEqual({ valakut: [["R"], []], stump: [["R", "G"], []], drowner: [[], []], birgi: [["R"], ["R"]] });
  });

  it("⛔ synthetic (labelled): a combined card carrying its front's colours at the top level (a saved-deck snapshot may) still projects a colourless land face", () => {
    expect(mdfcFaceCards({ ...VALAKUT, colors: ["R"] }).map((v) => v.colors)).toEqual([["R"], []]);
  });
});

describe("the shared composite — Teferi's Puzzle Box keeps its mandatory whole-hand form", () => {
  function puzzleBoxDrawStep(aiHand) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "beginning", step: "draw",
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "box", card: { ...PUZZLE_BOX, id: "c-box" }, controller: "user" })] },
        ai: { ...s0.players.ai, hand: aiHand, library: cards(4, "A") } } };
    s = flushTriggers(checkStepTriggers(s, "draw"), { chooseTargets: chooseTriggerTargets });
    return resolveAll(s);
  }
  it("the Puzzle Box names every card in hand — a commander goes to the bottom with the rest (no house policy there)", () => {
    const s = puzzleBoxDrawStep([{ ...KRENKO, id: "ai-cmdr", isCommander: true }, ...cards(1, "X")]);
    expect({ hand: ids(s.players.ai.hand), library: ids(s.players.ai.library) }).toEqual({ hand: ["A1", "A2"], library: ["A3", "A4", "ai-cmdr", "X1"] });
  });
  it("an empty hand tucks nothing and draws nothing — no zero-card draw is logged", () => {
    const s = puzzleBoxDrawStep([]);
    expect({ hand: s.players.ai.hand.length, draws: (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "draw").length }).toEqual({ hand: 0, draws: 0 });
  });
});
