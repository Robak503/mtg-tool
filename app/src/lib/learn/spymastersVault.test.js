/**
 * spymastersVault.test.js — SPYMASTER'S VAULT (the play-weighted program, EDHREC #1145):
 *
 *   "{B}, {T}: Target creature you control connives X, where X is the number of creatures that died this turn."
 *
 * Connive N (CR 701.50e): the conniving creature's controller draws N cards, discards N cards, then puts a +1/+1 counter on it for
 * each nonland card discarded this way — the counters put on it once, after the discards (one placement: Hardened Scales adds one, not
 * one per card). X is the count as the ability resolves (CR 608.2h): every player's creatures that died this turn (CR 700.4).
 * The discards are the discarding player's choice (CR 701.9a — the discard chain: a person is asked card by card, the default AI sheds
 * its least valuable, a hand no bigger than what is owed goes without a question). The ability targets: a target gone before it resolves
 * means nothing happens (CR 608.2b). Witnessed through real game states, for the person and for the AI seat.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickDiscardCandidate, resolveDiscardChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VAULT = {"name":"Spymaster's Vault","type":"Land","mana":"","oracle":"This land enters tapped unless you control a Swamp.\n{T}: Add {B}.\n{B}, {T}: Target creature you control connives X, where X is the number of creatures that died this turn. (Draw X cards, then discard X cards. Put a +1/+1 counter on that creature for each nonland card discarded this way.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Connive"],"colors":[],"colorIdentity":["B"]}; // EDHREC #1145
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const DOOM = {"name":"Doom Blade","type":"Instant","mana":"{1}{B}","oracle":"Destroy target nonblack creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2206
const SCALES = {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #186
const SHATTER = {"name":"Shatterskull Smashing // Shatterskull, the Hammer Pass","type":"Sorcery // Land","mana":"{X}{R}{R}","oracle":"Shatterskull Smashing - Sorcery {X}{R}{R}\nShatterskull Smashing deals X damage divided as you choose among up to two target creatures and/or planeswalkers. If X is 6 or more, Shatterskull Smashing deals twice X damage divided as you choose among them instead.\n//\nShatterskull, the Hammer Pass - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {R}.","layout":"modal_dfc","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #1407
const INFORMANT = {"name":"Raffine's Informant","type":"Creature — Human Wizard","mana":"{1}{W}","oracle":"When this creature enters, it connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Connive"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #20895
const PATHWAY = {"name":"Hengegate Pathway // Mistgate Pathway","type":"Land // Land","mana":"","oracle":"Hengegate Pathway - Land \n{T}: Add {W}.\n//\nMistgate Pathway - Land \n{T}: Add {U}.","layout":"modal_dfc","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U","W"]}; // EDHREC #1157
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","oracle":"Pyroclasm deals 2 damage to each creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #7698
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const cardsOf = (prefix, list) => list.map((c, i) => ({ ...c, id: `${prefix}${i}` }));
/**
 * `seat`'s precombat main: Spymaster's Vault (untapped) and Grizzly Bears, `pool` floating, `hand` and `library` (top first); every seat's
 * `died` tally (creaturesDiedThisTurn, the death chokepoint's per-turn count). Heads-up unless `pod`.
 */
function table({ seat = "user", pod = false, died = {}, hand = [], library = [], board = [], foes = [], pool = { B: 1 } } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  const foe = Object.keys(players).find((p) => p !== seat);
  for (const pid of Object.keys(players)) {
    const mine = pid === seat;
    players[pid] = { ...players[pid], graveyard: [], creaturesDiedThisTurn: died[pid] ?? 0,
      battlefield: mine ? [on(pid, "vault", VAULT), on(pid, "bears", BEARS), ...board] : pid === foe ? foes : [],
      hand: mine ? cardsOf("h", hand) : [], library: mine ? cardsOf("l", library) : [],
      manaPool: mine ? { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const vaultOffers = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "vault" && !a.isManaAbility);
const offerAt = (s, targetId, seat = "user") => vaultOffers(s, seat).find((a) => (a.targets || []).some((t) => t.id === targetId));
/** Settle every discard question: the person's take the next of `picks`, an AI seat's its autopilot. Records each question. */
function settle(n, picks = []) {
  const asked = [];
  const queue = [...picks];
  let g = 0;
  while (g++ < 40) {
    if (n.pendingChoice?.kind === "discard") {
      const pc = n.pendingChoice;
      asked.push({ seat: pc.controller, remaining: pc.remaining, candidates: pc.candidates.map((c) => c.id) });
      const id = pc.controller === "user" ? queue.shift() : autoPickDiscardCandidate(n, pc);
      expect(id, `no pick for ${pc.controller}`).toBeTruthy();
      n = resolveDiscardChoice(n, id);
      continue;
    }
    if (n.pendingChoice) break;
    if (n.stack?.length) { n = resolveTopOfStack(n); continue; }
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s: finalizeStackResolution(n), asked };
}
/** `seat` activates the Vault at `targetId`; it resolves (with each discard question settled). */
function connive(s, targetId, picks = [], seat = "user") {
  const a = offerAt(s, targetId, seat);
  expect(a, `the Vault's ability is not offered at ${targetId}`).toBeTruthy();
  return settle(dispatchAction(s, a), picks);
}
const handIds = (s, pid = "user") => s.players[pid].hand.map((c) => c.id);
const yard = (s, pid = "user") => s.players[pid].graveyard.map((c) => c.id);
const plus = (s, id, pid = "user") => s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;
const tapped = (s, id, pid = "user") => !!s.players[pid].battlefield.find((p) => p.id === id)?.tapped;

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(VAULT)).toBe("land");
  });
});

describe("the offer", () => {
  it("⭐ targets only the creatures you control, for {B} and the tap", () => {
    const s = table({ board: [on("user", "elves", ELVES)], foes: [on("ai", "giant", GIANT)], died: { user: 1 } });
    const targets = [...new Set(vaultOffers(s).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
    expect({ targets, broke: vaultOffers(table({ pool: {}, died: { user: 1 } })).length }).toEqual({ targets: ["bears", "elves"], broke: 0 });
  });
});

describe("the person's Vault", () => {
  it("⭐ two creatures died (one of each seat): two cards drawn, two discarded of the person's choice — a creature and a land, one counter", () => {
    const { s, asked } = connive(table({ died: { user: 1, ai: 1 }, hand: [BOLT], library: [GIANT, FOREST, WURM] }), "bears", ["l0", "l1"]);
    expect({ asked, hand: handIds(s), yard: yard(s), counters: plus(s, "bears"), vault: tapped(s, "vault"), pool: s.players.user.manaPool.B })
      .toEqual({
        asked: [{ seat: "user", remaining: 2, candidates: ["h0", "l0", "l1"] }, { seat: "user", remaining: 1, candidates: ["h0", "l1"] }],
        hand: ["h0"], yard: ["l0", "l1"], counters: 1, vault: true, pool: 0,
      });
  });
  it("⭐ two nonland cards discarded: two counters", () => {
    const { s } = connive(table({ died: { ai: 2 }, hand: [BOLT], library: [GIANT, FOREST] }), "bears", ["h0", "l0"]);
    expect({ hand: handIds(s), counters: plus(s, "bears") }).toEqual({ hand: ["l1"], counters: 2 });
  });
  it("⭐ the counters are put on it once, after the discards: Hardened Scales makes two into three, not four", () => {
    const { s } = connive(table({ died: { ai: 2 }, hand: [BOLT], library: [GIANT, FOREST], board: [on("user", "scales", SCALES)] }), "bears", ["h0", "l0"]);
    expect(plus(s, "bears")).toBe(3);
  });
  it("⭐ a pod: every seat's deaths count — three cards drawn and three discarded", () => {
    const { s, asked } = connive(table({ pod: true, died: { ai1: 1, ai2: 1, ai3: 1 }, hand: [BOLT], library: [GIANT, FOREST, WURM, ELVES] }), "bears", ["h0", "l1", "l2"]);
    expect({ remaining: asked.map((q) => q.remaining), hand: handIds(s), yard: yard(s), counters: plus(s, "bears") })
      .toEqual({ remaining: [3, 2, 1], hand: ["l0"], yard: ["h0", "l1", "l2"], counters: 2 });
  });
  it("⭐ no creature died this turn: X is 0 — nothing drawn or discarded, no counter; the {B} and the tap are still paid", () => {
    const { s, asked } = connive(table({ hand: [BOLT], library: [GIANT] }), "bears");
    expect({ asked, hand: handIds(s), library: s.players.user.library.length, counters: plus(s, "bears"), vault: tapped(s, "vault"), pool: s.players.user.manaPool.B })
      .toEqual({ asked: [], hand: ["h0"], library: 1, counters: 0, vault: true, pool: 0 });
  });
  it("⭐ the hand after the draw is no bigger than X: it all goes without a question, a counter for each nonland card", () => {
    const { s, asked } = connive(table({ died: { ai: 2 }, library: [GIANT, FOREST, WURM] }), "bears");
    expect({ asked, hand: handIds(s), yard: yard(s), counters: plus(s, "bears") }).toEqual({ asked: [], hand: [], yard: ["l0", "l1"], counters: 1 });
  });
  it("⭐ X is counted as it resolves: a creature killed in response by Lightning Bolt makes it two", () => {
    const s0 = table({ died: { user: 1 }, hand: [BOLT, ELVES], library: [GIANT, FOREST, WURM], foes: [on("ai", "giant", GIANT)], pool: { B: 1, R: 1 } });
    const a0 = offerAt(s0, "bears");
    expect(a0, "the Vault's ability is not offered at bears").toBeTruthy();
    const s1 = dispatchAction(s0, a0);
    const bolt = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && (a.targets || []).some((t) => t.id === "giant"));
    expect(bolt, "Lightning Bolt at the Giant is not offered in response").toBeTruthy();
    const s2 = resolveTopOfStack(dispatchAction(s1, bolt));
    expect({ giant: s2.players.ai.battlefield.length, stack: s2.stack.length }).toEqual({ giant: 0, stack: 1 });
    const { s, asked } = settle(s2, ["l0", "l1"]);
    expect({ remaining: asked.map((q) => q.remaining), hand: handIds(s), counters: plus(s, "bears") }).toEqual({ remaining: [2, 1], hand: ["h1"], counters: 1 });
  });
  it("⭐ the target dies in response: the ability does nothing — no card drawn (CR 608.2b)", () => {
    const s0 = table({ died: { ai: 2 }, hand: [DOOM], library: [GIANT, FOREST], pool: { B: 2, C: 1 } });
    const a0 = offerAt(s0, "bears");
    expect(a0, "the Vault's ability is not offered at bears").toBeTruthy();
    const s1 = dispatchAction(s0, a0);
    const doom = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && (a.targets || []).some((t) => t.id === "bears"));
    expect(doom, "Doom Blade at the Bears is not offered in response").toBeTruthy();
    const { s, asked } = settle(dispatchAction(s1, doom));
    expect({ asked, bears: s.players.user.battlefield.some((p) => p.id === "bears"), hand: handIds(s), library: s.players.user.library.length })
      .toEqual({ asked: [], bears: false, hand: [], library: 2 });
  });
  it("⭐ X from real deaths (the review's F5): the person's Pyroclasm kills their Bears and Elves and the AI's Elves and Soldier token — X is 4 as the ability resolves", () => {
    const SOLDIER = { name: "Soldier", type: "Token Creature — Soldier", mana: "", oracle: "", power: "1", toughness: "1", colors: ["W"], keywords: [], token: true };
    const s0 = table({ hand: [PYROCLASM, BOLT], library: [GIANT, FOREST, WURM, ELVES, FOREST], board: [on("user", "elves", ELVES), on("user", "giant", GIANT)],
      foes: [on("ai", "aelves", ELVES), on("ai", "tok", SOLDIER)], pool: { B: 1, R: 1, C: 1 } });
    const clasm = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(clasm, "Pyroclasm is not offered").toBeTruthy();
    const s1 = finalizeStackResolution(resolveTopOfStack(dispatchAction(s0, clasm)));
    expect({ died: [s1.players.user.creaturesDiedThisTurn, s1.players.ai.creaturesDiedThisTurn], giant: s1.players.user.battlefield.some((p) => p.id === "giant") }).toEqual({ died: [2, 2], giant: true });
    const { s, asked } = connive(s1, "giant", ["h1", "l0", "l1", "l2"]);
    expect({ remaining: asked.map((q) => q.remaining), hand: handIds(s), counters: plus(s, "giant") }).toEqual({ remaining: [4, 3, 2, 1], hand: ["l3"], counters: 3 });
  });
});

describe("a nonland card is its front face (CR 712.8a)", () => {
  it("⭐ the Vault: Shatterskull Smashing discarded is a sorcery, a nonland card — a counter; a Pathway is a land — none", () => {
    const { s } = connive(table({ died: { ai: 2 }, hand: [SHATTER, PATHWAY, BOLT], library: [FOREST, FOREST] }), "bears", ["h0", "h1"]);
    expect({ yard: yard(s), counters: plus(s, "bears") }).toEqual({ yard: ["h0", "h1"], counters: 1 });
  });
  it("⭐ a plain connive too (Raffine's Informant): the person discards Shatterskull Smashing — the Informant gets its counter", () => {
    const s0 = table({ hand: [INFORMANT, SHATTER], library: [FOREST], pool: { W: 1, C: 1 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Raffine's Informant is not offered").toBeTruthy();
    const { s, asked } = settle(dispatchAction(s0, cast), ["h1"]);
    const informant = s.players.user.battlefield.find((p) => p.card?.name === "Raffine's Informant");
    expect({ asked: asked.map((q) => q.candidates), yard: yard(s), counters: informant?.counters?.["+1/+1"] ?? 0 })
      .toEqual({ asked: [["h1", "l0"]], yard: ["h1"], counters: 1 });
  });
});

describe("the default AI", () => {
  it("holds it (no connive line): its main phase with deaths this turn picks no Vault activation", () => {
    const s = table({ seat: "ai", died: { user: 2 }, hand: [BOLT], library: [GIANT, FOREST] });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick?.kind === "activate-ability" && pick?.permanentId === "vault").toBe(false);
  });
  it("⭐ made to activate it, the AI seat draws two and sheds its least valuable two — a counter for the nonland one", () => {
    const { s, asked } = connive(table({ seat: "ai", died: { user: 2 }, hand: [WURM, ELVES], library: [GIANT, FOREST] }), "bears", [], "ai");
    expect({ seats: asked.map((q) => q.seat), hand: handIds(s, "ai").sort(), yard: yard(s, "ai").sort(), counters: plus(s, "bears", "ai") })
      .toEqual({ seats: ["ai", "ai"], hand: ["h0", "l0"], yard: ["h1", "l1"], counters: 1 });
  });
});
