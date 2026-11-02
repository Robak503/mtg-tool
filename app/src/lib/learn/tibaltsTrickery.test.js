/**
 * tibaltsTrickery.test.js — TIBALT'S TRICKERY (the play-weighted program, EDHREC #597):
 *
 *   "Counter target spell. Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles cards from the top of their
 *    library until they exile a nonland card with a different name than that spell. They may cast that card without paying its mana
 *    cost. Then they put the exiled cards on the bottom of their library in a random order."
 *
 * One counter atom with a rider on the countered spell's controller (effects/spanMatchers.matchCounterTrickery → applyCounter →
 * effects/atoms/library.applyTrickeryRider): the number off the threaded seed (never Math.random), the mill (CR 701.17a), the dig
 * to a nonland card with a different name (CR 201.2c) than the spell as it was cast, that card parked on the cascade window for THAT
 * player — cast free (X is 0, its ruling; CR 601.2b) or declined — and every other exiled card on the bottom in a random order. The
 * bundled rulings witnessed: a spell that can't be countered isn't, and everything else still happens; with no such card, every card
 * is exiled and all go to the bottom. The decision belongs to the countered spell's controller — the person or the default AI.
 *
 * Seeds: rngSeed 7 rolls 1, 1 rolls 2, 2 rolls 3 (deterministicRng — checked in the first test). Card text: the bundled Scryfall
 * oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, deterministicRng } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const TRICKERY = {"name":"Tibalt's Trickery","type":"Instant","mana":"{1}{R}","oracle":"Counter target spell. Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell. They may cast that card without paying its mana cost. Then they put the exiled cards on the bottom of their library in a random order.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Mill"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #597
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const TYRANT = {"name":"Carnage Tyrant","type":"Creature — Dinosaur","mana":"{4}{G}{G}","oracle":"This spell can't be countered.\nTrample, hexproof","layout":"normal","cmc":6,"power":"7","toughness":"6","loyalty":null,"keywords":["Hexproof","Trample"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #6667
const BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.","layout":"normal","cmc":0,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #425
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387

const POOL = { W: 0, U: 9, B: 0, R: 9, G: 9, C: 9 };
/** The ai's spell `spellCard` cast onto the stack in the ai's main phase; the user holds Trickery and priority. `aiLib` / `userLib`. */
function table({ spellCard = GIANT, aiLib = [], userLib = [], seed = 7, caster = "ai", counterer = "user", castPred = () => true, countererBf = [], pool = POOL } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (pid) => ({ ...g.players[pid], battlefield: pid === counterer && pid !== caster ? countererBf : [], graveyard: [], library: pid === "ai" ? aiLib : userLib, manaPool: { ...pool },
    hand: [...(pid === caster ? [{ ...spellCard, id: "h-spell" }] : []), ...(pid === counterer ? [{ ...TRICKERY, id: "h-trick" }] : [])] });
  const players = { ...g.players, [caster]: seat(caster), [counterer]: seat(counterer) };
  let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players, stack: [], pendingTriggers: [], rngSeed: seed };
  const castIt = legalActionsForPlayer(s, caster).find((a) => a.kind === "cast-spell" && a.cardId === "h-spell" && (a.xValue == null || a.xValue === 0) && castPred(a));
  s = flushTriggers(dispatchAction(s, castIt), { chooseTargets: chooseTriggerTargets });
  return { ...s, priorityHolder: counterer, rngSeed: seed };
}
function trick(s, counterer = "user") {
  const target = s.stack.find((o) => o.kind === "spell");
  const a = legalActionsForPlayer(s, counterer).find((x) => x.kind === "cast-spell" && x.cardId === "h-trick" && (x.targets || []).some((t) => t.id === target?.id));
  expect(a, "no Trickery cast at the spell").toBeTruthy();
  let n = dispatchAction(s, a);
  n = resolveTopOfStack(flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  return finalizeStackResolution(n);
}
const L = (prefix, card, n) => Array.from({ length: n }, (_, i) => ({ ...card, id: `${prefix}${i}` }));
const lib = () => [...L("i", ISLAND, 3), { ...GIANT, id: "g2" }, { ...MOUNTAIN, id: "m1" }, { ...WURM, id: "w" }, { ...BEARS, id: "b" }, ...L("t", ISLAND, 2)];
const names = (cards) => (cards || []).map((c) => c.name);
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && !n.pendingCascade && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return finalizeStackResolution(n);
}

describe("the card", () => {
  it("⭐ native: one counter atom with the rider; the seeds roll 1, 2 and 3", () => {
    expect({ tier: classifyCard(TRICKERY), atoms: parseEffectProgram(TRICKERY)?.atoms, rolls: [7, 1, 2].map((sd) => 1 + Math.floor(deterministicRng(sd)() * 3)) })
      .toEqual({ tier: "native-spell", atoms: [{ op: "counter", spellFilter: "any", targetType: "spell", trickeryRider: true }], rolls: [1, 2, 3] });
  });
});

describe("the countered spell's controller", () => {
  for (const [seed, n] of [[7, 1], [1, 2], [2, 3]]) {
    it(`⭐ rolls ${n}: the Giant is countered, ${n} milled, then exiled to the first nonland card not named Hill Giant (a Craw Wurm) — the land and the other Giant to the bottom`, () => {
      const s = trick(table({ aiLib: lib(), seed }));
      const milled = names(s.players.ai.graveyard).filter((x) => x === "Island").length;
      const libNames = names(s.players.ai.library);
      const bottom = libNames.slice(libNames.length - (3 - n + 2));
      expect({ gyGiant: names(s.players.ai.graveyard).filter((x) => x === "Hill Giant").length, milled, window: s.pendingCascade && { controller: s.pendingCascade.controller, cardId: s.pendingCascade.cardId },
        exile: names(s.players.ai.exile), top: libNames.slice(0, 3), bottom: [...bottom].sort(), size: libNames.length, trickInGy: names(s.players.user.graveyard) })
        .toEqual({ gyGiant: 1, milled: n, window: { controller: "ai", cardId: "w" }, exile: ["Craw Wurm"], top: ["Grizzly Bears", "Island", "Island"],
          bottom: [...Array.from({ length: 3 - n }, () => "Island"), "Hill Giant", "Mountain"].sort(), size: 3 + (3 - n) + 2, trickInGy: ["Tibalt's Trickery"] });
    });
  }
  it("⭐ the default AI, whose spell was countered, casts the found Wurm for nothing", () => {
    const s = trick(table({ aiLib: lib() }));
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: pick?.kind, cardId: pick?.cardId, free: !!pick?.freeCast }).toEqual({ kind: "cast-spell", cardId: "w", free: true });
    const after = settle(dispatchAction(s, pick));
    expect({ wurm: after.players.ai.battlefield.filter((p) => p.card?.name === "Craw Wurm").length, exile: after.players.ai.exile.length, poolUnspent: JSON.stringify(after.players.ai.manaPool) === JSON.stringify(s.players.ai.manaPool) }).toEqual({ wurm: 1, exile: 0, poolUnspent: true });
  });
  it("⭐ the person whose spell was countered (the AI's Trickery): the window is theirs — cast it free, or decline and it goes to the bottom", () => {
    const s = trick(table({ caster: "user", counterer: "ai", userLib: lib() }), "ai");
    const acts = legalActionsForPlayer(s, "user");
    expect({ window: s.pendingCascade?.controller, kinds: acts.map((a) => a.kind).sort(), aiActs: legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai") }).toEqual({ window: "user", kinds: ["cascade-decline", "cast-spell"], aiActs: [] });
    const declined = dispatchAction(s, acts.find((a) => a.kind === "cascade-decline"));
    expect({ window: declined.pendingCascade, last: declined.players.user.library.at(-1)?.name, exile: declined.players.user.exile.length }).toEqual({ window: undefined, last: "Craw Wurm", exile: 0 });
  });
});

describe("the rulings", () => {
  it("⭐ a spell that can't be countered isn't, and the rest still happens: Carnage Tyrant stays on the stack, its controller mills and digs", () => {
    const s = trick(table({ spellCard: TYRANT, aiLib: lib() }));
    expect({ onStack: s.stack.filter((o) => o.source?.name === "Carnage Tyrant").length, milled: names(s.players.ai.graveyard), window: s.pendingCascade?.cardId }).toEqual({ onStack: 1, milled: ["Island"], window: "g2" }); // the spell is Carnage Tyrant: the Hill Giant has a different name
  });
  it("⭐ no nonland card with a different name: every card is exiled, all go to the bottom, nothing to cast", () => {
    const aiLib = [...L("i", ISLAND, 2), { ...GIANT, id: "g2" }, { ...GIANT, id: "g3" }];
    const s = trick(table({ aiLib }));
    expect({ window: s.pendingCascade, milled: names(s.players.ai.graveyard).sort(), lib: names(s.players.ai.library).sort(), exile: s.players.ai.exile.length }).toEqual({ window: undefined, milled: ["Hill Giant", "Island"], lib: ["Hill Giant", "Hill Giant", "Island"], exile: 0 });
  });
  it("⭐ an {X} card found is cast with X = 0 (its ruling): Walking Ballista enters with no counters and dies", () => {
    const aiLib = [...L("i", ISLAND, 3), { ...BALLISTA, id: "bal" }, ...L("t", ISLAND, 2)];
    const s = trick(table({ aiLib, seed: 2 }));
    const casts = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell");
    expect(casts.map((a) => [a.cardId, a.xValue ?? 0, !!a.freeCast])).toEqual([["bal", 0, true]]);
    const after = settle(dispatchAction(s, casts[0]));
    expect({ ballista: after.players.ai.battlefield.filter((p) => p.card?.name === "Walking Ballista").length, gy: names(after.players.ai.graveyard).includes("Walking Ballista") }).toEqual({ ballista: 0, gy: true });
  });
  it("⭐ countering its controller's own spell: the controller is the one who digs (the cEDH use)", () => {
    const s = trick(table({ caster: "user", counterer: "user", userLib: lib() }));
    expect({ window: s.pendingCascade?.controller, milled: names(s.players.user.graveyard).filter((x) => x === "Island").length }).toEqual({ window: "user", milled: 1 });
  });
});

describe("the default AI holding Trickery", () => {
  it("⭐ it counters an opponent's six-mana Craw Wurm", () => {
    const s = table({ spellCard: WURM, caster: "user", counterer: "ai", userLib: lib() });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    const target = s.stack.find((o) => o.kind === "spell");
    expect({ kind: pick?.kind, cardId: pick?.cardId, target: pick?.targets?.[0]?.id }).toEqual({ kind: "cast-spell", cardId: "h-trick", target: target?.id });
  });
  it("⛔ it never aims it at a spell that can't be countered (Carnage Tyrant would stay, and its controller would get a free spell)", () => {
    const s = table({ spellCard: TYRANT, caster: "user", counterer: "ai", userLib: lib() });
    expect(legalActionsForPlayer(s, "ai").some((a) => a.cardId === "h-trick")).toBe(true); // offered (its ruling) …
    expect(pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.cardId).not.toBe("h-trick"); // … but not chosen
  });
});

// THE MULTI-FACE CARDS IN THE LIBRARY (the blind review's F2): a library card has its front face's characteristics only (CR 712.8a —
// a double-faced card outside the battlefield and the stack), and an adventurer card its normal ones (CR 715.4) — one name, the
// creature's; a split card has both halves' (CR 709.4a). The land test reads the front face, the name test the card's own names.
const FELL = {"name":"Fell the Profane // Fell Mire","type":"Instant // Land","mana":"{2}{B}{B}","oracle":"Fell the Profane - Instant {2}{B}{B}\nDestroy target creature or planeswalker.\n//\nFell Mire - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","layout":"modal_dfc","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #200
const AZCANTA = {"name":"Search for Azcanta // Azcanta, the Sunken Ruin","type":"Legendary Enchantment // Legendary Land","mana":"{1}{U}","oracle":"Search for Azcanta - Legendary Enchantment {1}{U}\nAt the beginning of your upkeep, surveil 1. Then if you have seven or more cards in your graveyard, you may transform Search for Azcanta. (Look at the top card of your library. You may put that card into your graveyard.)\n//\nAzcanta, the Sunken Ruin - Legendary Land \n(Transforms from Search for Azcanta.)\n{T}: Add {U}.\n{2}{U}, {T}: Look at the top four cards of your library. You may reveal a noncreature, nonland card from among them and put it into your hand. Put the rest on the bottom of your library in any order.","layout":"transform","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Surveil","Transform"],"colors":[],"colorIdentity":["U"]}; // EDHREC #3985
const RIDER = {"name":"Murderous Rider // Swift End","type":"Creature — Zombie Knight // Instant — Adventure","mana":"{1}{B}{B} // {1}{B}{B}","oracle":"Murderous Rider - Creature — Zombie Knight {1}{B}{B}\nLifelink\nWhen this creature dies, put it on the bottom of its owner's library.\n//\nSwift End - Instant — Adventure {1}{B}{B}\nDestroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)","layout":"adventure","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Lifelink"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1672
const FIRE_ICE = {"name":"Fire // Ice","type":"Instant // Instant","mana":"{1}{R} // {1}{U}","oracle":"Fire - Instant {1}{R}\nFire deals 2 damage divided as you choose among one or two targets.\n//\nIce - Instant {1}{U}\nTap target permanent.\nDraw a card.","layout":"split","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","U"],"colorIdentity":["R","U"]}; // EDHREC #13120
const BONECRUSHER = {"name":"Bonecrusher Giant // Stomp","type":"Creature — Giant // Instant — Adventure","mana":"{2}{R} // {1}{R}","oracle":"Bonecrusher Giant - Creature — Giant {2}{R}\nWhenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.\n//\nStomp - Instant — Adventure {1}{R}\nDamage can't be prevented this turn. Stomp deals 2 damage to any target.","layout":"adventure","cmc":3,"power":"4","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #5929
const PLAINS_T = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
/** seed 7 rolls 1: one Mountain milled, then the dig over `[Mountain, Mountain, <card>, Craw Wurm, Plains]`. */
const multiLib = (card, id) => [...L("m", MOUNTAIN, 3), { ...card, id }, { ...WURM, id: "w" }, { ...PLAINS_T, id: "p" }];
const dig = (s, pid) => ({ window: s.pendingCascade && { controller: s.pendingCascade.controller, cardId: s.pendingCascade.cardId }, exile: names(s.players[pid].exile), top: s.players[pid].library[0]?.name });

describe("the multi-face cards in the library (CR 712.8a, 715.4, 709.4a)", () => {
  it("⭐ a modal double-faced card with a land back (Fell the Profane // Fell Mire) is a nonland card there: the dig stops at it, not at the Craw Wurm below", () => {
    const s = trick(table({ caster: "user", counterer: "ai", userLib: multiLib(FELL, "fell") }), "ai");
    expect(dig(s, "user")).toEqual({ window: { controller: "user", cardId: "fell" }, exile: ["Fell the Profane // Fell Mire"], top: "Craw Wurm" });
  });
  it("⭐ a transforming card with a land back (Search for Azcanta) is a nonland card there: the dig stops at it", () => {
    const s = trick(table({ caster: "user", counterer: "ai", userLib: multiLib(AZCANTA, "azc") }), "ai");
    expect(dig(s, "user")).toEqual({ window: { controller: "user", cardId: "azc" }, exile: ["Search for Azcanta // Azcanta, the Sunken Ruin"], top: "Craw Wurm" });
  });
  it("⭐ Swift End countered: a Murderous Rider in the library has only its creature's name (CR 715.4) — a different name — and is the card found", () => {
    const bears = { ...createPermanent({ id: "o-bears", card: { ...BEARS, id: "c-o-bears" }, controller: "ai", summoningSick: false }) };
    const s0 = table({ spellCard: RIDER, caster: "user", counterer: "ai", userLib: multiLib(RIDER, "rider2"), pool: { ...POOL, B: 9 }, countererBf: [bears],
      castPred: (a) => !!a.adventureCast && (a.targets || []).some((t) => t.id === "o-bears") });
    expect(s0.stack.find((o) => o.kind === "spell")?.source?.name).toBe("Swift End");
    const s = trick(s0, "ai");
    expect(dig(s, "user")).toEqual({ window: { controller: "user", cardId: "rider2" }, exile: ["Murderous Rider // Swift End"], top: "Craw Wurm" });
  });
  it("CONTROL — Bonecrusher Giant countered as the creature: a Bonecrusher Giant in the library has the same name and goes by; the Wurm is found", () => {
    const s = trick(table({ spellCard: BONECRUSHER, castPred: (a) => !a.adventureCast, userLib: [], aiLib: multiLib(BONECRUSHER, "bc2") }));
    expect(dig(s, "ai")).toEqual({ window: { controller: "ai", cardId: "w" }, exile: ["Craw Wurm"], top: "Plains" });
  });
  it("CONTROL — Fire // Ice countered as Fire: a Fire // Ice in the library has both names (CR 709.4a), one in common — it goes by; the Wurm is found", () => {
    const s = trick(table({ spellCard: FIRE_ICE, castPred: (a) => a.faceCard?.name === "Fire", aiLib: multiLib(FIRE_ICE, "fi2") }));
    expect({ countered: s.stack.length, ...dig(s, "ai") }).toEqual({ countered: 0, window: { controller: "ai", cardId: "w" }, exile: ["Craw Wurm"], top: "Plains" });
  });
});
