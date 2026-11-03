/**
 * nezahalPrimalTide.test.js — NEZAHAL, PRIMAL TIDE (the play-weighted program, EDHREC #1114):
 *
 *   "This spell can't be countered.
 *    You have no maximum hand size.
 *    Whenever an opponent casts a noncreature spell, draw a card.
 *    Discard three cards: Exile Nezahal. Return it to the battlefield tapped under its owner's control at the beginning of the next
 *    end step."
 *
 * The last line was the one unread: the self delayed blink (effects/templateMatchers.matchDelayedBlink's `self` arm →
 * zones.applyDelayedBlink). The source is exiled as the ability resolves only if it is still the object that made it — one that left
 * the battlefield in response is gone or a new object (CR 400.7), so nothing is exiled and nothing comes back (Aetherling's bundled
 * ruling) — and the card returns at the next end step under its OWNER's control (CR 603.7), tapped (CR 110.5b), a new object with no
 * counters (Nezahal's bundled ruling). Its rulings: the ability can be activated in response to removal (an activated ability, CR
 * 602.2); it returns before the next cleanup step. The discard-three cost is the counted discard (legalChoices' COUNTED DISCARD COST,
 * countedCostSets — pw25's blind review, F1): a person picks the three (one offer per set, CR 602.2b, 601.2h); a seat no person plays
 * pays with its three least valuable. The default AI never spends its hand on it (its
 * safe-ability picker takes only a tap or mana cost, its targeted picker only a targeted ability).
 *
 * Twins, the same reader untapped: Aetherling ({U}), Fleeting Spirit (discard a card), Anurid Brushhopper (discard two cards), and
 * Djinn of the Fountain's second mode (a cast trigger's choose-one — the default AI keeps the first mode, +1/+1), and Ghost Council of
 * Orzhova ("{1}, Sacrifice a creature:" — its rulings: sacrificed to its own ability it is in the graveyard and nothing returns; it
 * comes back untapped, a new object).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const NEZAHAL = {"name":"Nezahal, Primal Tide","type":"Legendary Creature — Elder Dinosaur","mana":"{5}{U}{U}","oracle":"This spell can't be countered.\nYou have no maximum hand size.\nWhenever an opponent casts a noncreature spell, draw a card.\nDiscard three cards: Exile Nezahal. Return it to the battlefield tapped under its owner's control at the beginning of the next end step.","layout":"normal","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1114
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","oracle":"Destroy target creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #861
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #217
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","oracle":"Draw two cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6263
const AETHERLING = {"name":"Aetherling","type":"Creature — Shapeshifter","mana":"{4}{U}{U}","oracle":"{U}: Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.\n{U}: This creature can't be blocked this turn.\n{1}: This creature gets +1/-1 until end of turn.\n{1}: This creature gets -1/+1 until end of turn.","layout":"normal","cmc":6,"power":"4","toughness":"5","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #15894
const FLEETING = {"name":"Fleeting Spirit","type":"Creature — Spirit","mana":"{1}{W}","oracle":"{W}, Exile three cards from your graveyard: This creature gains first strike until end of turn.\nDiscard a card: Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #21008
const BRUSHHOPPER = {"name":"Anurid Brushhopper","type":"Creature — Frog Beast","mana":"{1}{G}{W}","oracle":"Discard two cards: Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.","layout":"normal","cmc":3,"power":"3","toughness":"4","loyalty":null,"keywords":[],"colors":["G","W"],"colorIdentity":["G","W"]}; // EDHREC #31183
const GHOST_COUNCIL = {"name":"Ghost Council of Orzhova","type":"Legendary Creature — Spirit","mana":"{W}{W}{B}{B}","oracle":"When Ghost Council of Orzhova enters, target opponent loses 1 life and you gain 1 life.\n{1}, Sacrifice a creature: Exile Ghost Council of Orzhova. Return it to the battlefield under its owner's control at the beginning of the next end step.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":[],"colors":["B","W"],"colorIdentity":["B","W"]}; // EDHREC #19155
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const DJINN = {"name":"Djinn of the Fountain","type":"Creature — Djinn","mana":"{4}{U}{U}","oracle":"Flying\nWhenever you cast an instant or sorcery spell, choose one —\n• This creature gets +1/+1 until end of turn.\n• Exile this creature. Return it to the battlefield under its owner's control at the beginning of the next end step.\n• Scry 1.","layout":"normal","cmc":6,"power":"4","toughness":"4","loyalty":null,"keywords":["Scry","Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #25001

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const hand4 = () => [{ ...ISLAND, id: "h-island" }, { ...OPT, id: "h-opt" }, { ...DIVINATION, id: "h-div" }, { ...MURDER, id: "h-murder" }];
/** Two seats; `seat` active in its precombat main; `boards`/`hands` per seat, `pools` floating mana. */
function table({ seat = "user", boards = {}, hands = {}, pools = {}, person = false } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [], library: [{ ...ISLAND, id: `lib1-${pid}` }, { ...ISLAND, id: `lib2-${pid}` }], manaPool: { ...EMPTY, ...(pools[pid] || {}) } };
  }
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players,
    ...(person ? { humanSeats: ["user"] } : {}) }; // `person`: the user seat a person plays (state.humanSeats, as createLearnSession stamps it below Expert)
}
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return s;
}
/** The game loop's way to the end step (advanceStep, then the step's actions — where the delayed queue drains), then its triggers. */
function toEndStep(s0) {
  let s = s0;
  for (let i = 0; i < 20 && s.step !== "end"; i++) s = runStepActions(advanceStep(s));
  return settle(s);
}
/** The offer `a`, asserted present first — on a board where it is missing the test fails on that assertion, never on a dispatch of nothing. */
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const blinkActs = (s, seat, permId) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === permId && /exile/i.test(a.abilityText || ""));
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();

describe("the card", () => {
  it("⭐ native: the discard-three cost and the self delayed blink that returns tapped", () => {
    expect(classifyCard(NEZAHAL)).toBe("native-mixed");
    const ab = parseActivatedAbilities(NEZAHAL).find((a) => /^Discard three/.test(a.raw));
    expect({ modeled: ab.modeled, discardCount: ab.discardCount, mana: ab.manaPips, tap: ab.tapSelf, atoms: ab.program.atoms })
      .toEqual({ modeled: true, discardCount: 3, mana: "", tap: false, atoms: [{ op: "delayed-blink", targetType: null, withCounter: false, self: true, returnTapped: true }] });
  });
  it("controls: \"under your control\" and the upkeep return stay unread", () => {
    expect(parseEffectClause("Exile this creature. Return it to the battlefield tapped under your control at the beginning of the next end step.", "Instant").confidence).toBe("low");
    expect(parseEffectClause("Exile this creature. Return it to the battlefield under its owner's control at the beginning of your next upkeep.", "Instant").confidence).toBe("low");
  });
});

describe("the activation", () => {
  it("⭐ the person picks the three cards (CR 602.2b, 601.2h — one offer per set of three of their four); Nezahal is exiled as it resolves and returns TAPPED at the end step, a new object without its counter", () => {
    const s0 = table({ person: true, boards: { user: [on("user", "nez", NEZAHAL, { counters: { "+1/+1": 1 } })] }, hands: { user: hand4() } });
    const acts = blinkActs(s0, "user", "nez");
    const sets = acts.map((a) => names(a.discardIds.map((id) => s0.players.user.hand.find((c) => c.id === id))).join(" + ")).sort();
    expect(sets).toEqual(["Divination + Island + Murder", "Divination + Island + Opt", "Divination + Murder + Opt", "Island + Murder + Opt"]);
    const act = offered(acts.find((a) => !a.discardIds.includes("h-island")), "discarding Opt, Divination and Murder");
    const paid = dispatchAction(s0, act);
    expect({ hand: names(paid.players.user.hand), gy: names(paid.players.user.graveyard), stack: paid.stack.length }).toEqual({ hand: ["Island"], gy: ["Divination", "Murder", "Opt"], stack: 1 });
    const s = settle(paid);
    expect({ bf: names(s.players.user.battlefield), exile: names(s.players.user.exile) }).toEqual({ bf: [], exile: ["Nezahal, Primal Tide"] });
    const back = toEndStep(s);
    const nez = back.players.user.battlefield.find((p) => p.card?.name === "Nezahal, Primal Tide");
    expect({ step: back.step, back: !!nez, tapped: nez?.tapped, newObject: nez?.id !== "nez", counters: nez?.counters?.["+1/+1"] ?? 0, exile: names(back.players.user.exile) })
      .toEqual({ step: "end", back: true, tapped: true, newObject: true, counters: 0, exile: [] });
  });
  it("a seat no person plays is offered one activation, its three least valuable cards (the house pick — legalChoices.countedCostSets)", () => {
    const s0 = table({ boards: { user: [on("user", "nez", NEZAHAL)] }, hands: { user: hand4() } });
    const acts = blinkActs(s0, "user", "nez");
    expect(acts.map((a) => names(a.discardIds.map((id) => s0.players.user.hand.find((c) => c.id === id))))).toEqual([["Divination", "Island", "Opt"]]);
  });
  it("needs three cards: with two in hand it is not offered", () => {
    expect(blinkActs(table({ boards: { user: [on("user", "nez", NEZAHAL)] }, hands: { user: hand4().slice(0, 2) } }), "user", "nez")).toEqual([]);
  });
  it("⭐ in response to Murder: the ability resolves first, Murder's target is gone (it does nothing), and Nezahal is back at the end step", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "nez", NEZAHAL)] }, hands: { user: hand4(), ai: [{ ...MURDER, id: "ai-murder" }] }, pools: { ai: { B: 3 } } });
    const murder = legalActionsForPlayer(s0, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "ai-murder" && a.targets?.[0]?.id === "nez");
    expect(murder, "Murder on Nezahal is not offered").toBeTruthy();
    const cast = { ...flushTriggers(dispatchAction(s0, murder), { chooseTargets: chooseTriggerTargets }), priorityHolder: "user" };
    const [act] = blinkActs(cast, "user", "nez");
    expect(act, "the response is not offered").toBeTruthy();
    const s = settle(dispatchAction(cast, act));
    expect({ bf: names(s.players.user.battlefield), gy: names(s.players.user.graveyard), exile: names(s.players.user.exile), murderGone: !(s.stack || []).length })
      .toEqual({ bf: [], gy: ["Divination", "Island", "Opt"], exile: ["Nezahal, Primal Tide"], murderGone: true });
    const back = toEndStep(s);
    expect(back.players.user.battlefield.find((p) => p.card?.name === "Nezahal, Primal Tide")?.tapped).toBe(true);
  });
  it("⭐ a Nezahal that left the battlefield before the ability resolves is not exiled and does not come back (CR 400.7)", () => {
    // The real path: the AI answers the activation with Murder. Nezahal's own draw trigger (an opponent cast a noncreature spell) and
    // then Murder resolve first, above the ability, and Murder destroys Nezahal.
    const s0 = table({ boards: { user: [on("user", "nez", NEZAHAL)] }, hands: { user: hand4(), ai: [{ ...MURDER, id: "ai-murder" }] }, pools: { ai: { B: 3 } } });
    const paid = { ...dispatchAction(s0, offered(blinkActs(s0, "user", "nez")[0], "Nezahal's ability")), priorityHolder: "ai" };
    const murder = offered(legalActionsForPlayer(paid, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "ai-murder" && a.targets?.[0]?.id === "nez"), "Murder on Nezahal in response");
    let afterMurder = flushTriggers(dispatchAction(paid, murder), { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 6 && (afterMurder.stack || []).length > 1; i++) afterMurder = flushTriggers(resolveTopOfStack(afterMurder), { chooseTargets: chooseTriggerTargets });
    expect({ nezInGy: names(afterMurder.players.user.graveyard).includes("Nezahal, Primal Tide"), waiting: (afterMurder.stack || []).map((o) => o.kind) }).toEqual({ nezInGy: true, waiting: ["activated-ability"] });
    const s = settle(afterMurder);
    const back = toEndStep(s);
    expect({ bf: names(back.players.user.battlefield), exile: names(back.players.user.exile), gy: names(back.players.user.graveyard).includes("Nezahal, Primal Tide"), scheduled: (s.delayedTriggers || []).length })
      .toEqual({ bf: [], exile: [], gy: true, scheduled: 0 });
  });
  it("⭐ a stolen Nezahal returns under its OWNER's control", () => {
    const s0 = table({ boards: { ai: [on("ai", "nez", NEZAHAL, { owner: "user" })] }, hands: { ai: hand4() }, seat: "ai" });
    const s = settle(dispatchAction(s0, offered(blinkActs(s0, "ai", "nez")[0], "Nezahal's ability")));
    const back = toEndStep(s);
    expect({ user: names(back.players.user.battlefield), ai: names(back.players.ai.battlefield) }).toEqual({ user: ["Nezahal, Primal Tide"], ai: [] });
  });
  it("activated during the end step it returns at the NEXT end step, not this one", () => {
    const s0 = { ...table({ boards: { user: [on("user", "nez", NEZAHAL)] }, hands: { user: hand4() } }), phase: "ending", step: "end" };
    const s = settle(dispatchAction(s0, offered(blinkActs(s0, "user", "nez")[0], "Nezahal's ability")));
    const later = settle(runStepActions(advanceStep(s))); // cleanup
    expect(names(later.players.user.exile)).toEqual(["Nezahal, Primal Tide"]);
  });
});

describe("the default AI", () => {
  it("⭐ never discards its hand to blink Nezahal for nothing in its own main", () => {
    const s = table({ seat: "ai", boards: { ai: [on("ai", "nez", NEZAHAL)] }, hands: { ai: hand4() } });
    expect(blinkActs(s, "ai", "nez")).toHaveLength(1);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick?.permanentId === "nez" && pick?.kind === "activate-ability").toBe(false);
  });
});

describe("the twins", () => {
  it("⭐ Aetherling, Fleeting Spirit and Anurid Brushhopper read the untapped form; Djinn of the Fountain's three modes all read", () => {
    expect([AETHERLING, FLEETING, BRUSHHOPPER].map(classifyCard)).toEqual(["native-activated", "native-activated", "native-activated"]);
    for (const c of [AETHERLING, FLEETING, BRUSHHOPPER]) {
      expect(parseActivatedAbilities(c).find((a) => /Exile this creature/.test(a.raw)).program.atoms).toEqual([{ op: "delayed-blink", targetType: null, withCounter: false, self: true }]);
    }
    expect(classifyCard(DJINN)).toBe("native-trigger");
    const d = detectTriggers(DJINN).find((x) => x.event === "cast");
    expect(parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).modal.modes.map((m) => m.atoms.map((a) => a.op))).toEqual([["pump"], ["delayed-blink"], ["scry"]]);
  });
  it("⭐ Ghost Council of Orzhova: sacrificing another creature exiles it, and it returns untapped at the end step — a new object, its enters drain again", () => {
    expect(classifyCard(GHOST_COUNCIL)).toBe("native-mixed");
    const s0 = table({ boards: { user: [on("user", "gc", GHOST_COUNCIL), on("user", "fodder", BEARS)] }, pools: { user: { C: 1 } } });
    const act = offered(blinkActs(s0, "user", "gc").find((a) => a.sacCreatureId === "fodder"), "Ghost Council's ability, sacrificing Grizzly Bears");
    const s = settle(dispatchAction(s0, act));
    expect({ bf: names(s.players.user.battlefield), exile: names(s.players.user.exile), gy: names(s.players.user.graveyard) })
      .toEqual({ bf: [], exile: ["Ghost Council of Orzhova"], gy: ["Grizzly Bears"] });
    const back = toEndStep(s);
    const gc = back.players.user.battlefield.find((p) => p.card?.name === "Ghost Council of Orzhova");
    expect({ back: !!gc, tapped: gc?.tapped, newObject: gc?.id !== "gc", user: back.players.user.life - s.players.user.life, ai: back.players.ai.life - s.players.ai.life })
      .toEqual({ back: true, tapped: false, newObject: true, user: 1, ai: -1 });
  });
  it("⭐ Ghost Council sacrificed to its own ability is in the graveyard, not exiled, and never returns (its ruling)", () => {
    const s0 = table({ boards: { user: [on("user", "gc", GHOST_COUNCIL)] }, pools: { user: { C: 1 } } });
    const act = offered(blinkActs(s0, "user", "gc").find((a) => a.sacCreatureId === "gc"), "Ghost Council's ability, sacrificing itself");
    const back = toEndStep(settle(dispatchAction(s0, act)));
    expect({ bf: names(back.players.user.battlefield), exile: names(back.players.user.exile), gy: names(back.players.user.graveyard) })
      .toEqual({ bf: [], exile: [], gy: ["Ghost Council of Orzhova"] });
  });
  it("⭐ Aetherling: {U} exiles it, and it returns UNTAPPED at the end step", () => {
    const s0 = table({ boards: { user: [on("user", "ae", AETHERLING, { tapped: true })] }, pools: { user: { U: 1 } } });
    const s = settle(dispatchAction(s0, offered(blinkActs(s0, "user", "ae")[0], "Aetherling's blink")));
    expect(names(s.players.user.exile)).toEqual(["Aetherling"]);
    const back = toEndStep(s);
    expect(back.players.user.battlefield.find((p) => p.card?.name === "Aetherling")?.tapped).toBe(false);
  });
  it("⭐ Djinn of the Fountain: the default AI keeps it on the battlefield (the first mode, +1/+1) when it casts an instant", () => {
    const s0 = table({ seat: "ai", boards: { ai: [on("ai", "djinn", DJINN)] }, hands: { ai: [{ ...OPT, id: "ai-opt" }] }, pools: { ai: { U: 1 } } });
    const opt = legalActionsForPlayer(s0, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "ai-opt");
    const s = flushTriggers(dispatchAction(s0, offered(opt, "Opt")), { chooseTargets: chooseTriggerTargets });
    const trig = (s.stack || []).find((o) => o.kind === "triggered-ability");
    expect(trig?.payload?.params?.chosenMode).toBe(0);
    const done = settle(s);
    expect(done.players.ai.battlefield.map((p) => p.card?.name)).toContain("Djinn of the Fountain");
  });
});
