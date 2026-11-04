/**
 * laeliaBladeReforged.test.js — LAELIA, THE BLADE REFORGED (the play-weighted program, EDHREC #1338):
 *
 *   "Haste
 *    Whenever Laelia attacks, exile the top card of your library. You may play that card this turn.
 *    Whenever one or more cards are put into exile from your library and/or your graveyard, put a +1/+1 counter on Laelia."
 *
 * One trigger per exile EVENT that puts one or more cards its controller owns into exile from their library or graveyard (CR 603.2c),
 * whoever exiles them and for whatever reason — the bundled rulings: "doesn't care which player is exiling cards from the library or
 * graveyard. Cards put into exile from your library or graveyard for any reason, such as the delve ability, cause the ability to
 * trigger"; "triggers only once for each time cards are put into exile from your library and/or graveyard, no matter how many cards
 * were exiled at the same time"; and an "exile … until" (cascade, discover) exiles one at a time — "Laelia's last ability will trigger
 * that many times." A milled card Rest in Peace exiles instead is put into exile from the library. Cards exiled from a hand, from the
 * battlefield or from another player's library or graveyard are not. Witnessed through real game states, for the person and the
 * default AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, nextStep, passPriority, raiseTriggerTargetChoice, settleTriggerTargetChoice } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LAELIA = {"name":"Laelia, the Blade Reforged","type":"Legendary Creature — Spirit Warrior","mana":"{2}{R}","oracle":"Haste\nWhenever Laelia attacks, exile the top card of your library. You may play that card this turn.\nWhenever one or more cards are put into exile from your library and/or your graveyard, put a +1/+1 counter on Laelia.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1338
const OOZE = {"name":"Scavenging Ooze","type":"Creature — Ooze","mana":"{1}{G}","oracle":"{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1607
const BOG = {"name":"Bojuka Bog","type":"Land","mana":"","oracle":"This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #24
const SCOUR = {"name":"Thought Scour","type":"Instant","mana":"{U}","oracle":"Target player mills two cards.\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Mill"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1793
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2307
const BBE = {"name":"Bloodbraid Elf","type":"Creature — Elf Berserker","mana":"{2}{R}{G}","oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)","layout":"normal","cmc":4,"power":"3","toughness":"2","loyalty":null,"keywords":["Haste","Cascade"],"colors":["G","R"],"colorIdentity":["G","R"]}; // EDHREC #4920
const ORING = {"name":"Oblivion Ring","type":"Enchantment","mana":"{2}{W}","oracle":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #5071
const LUTS = {"name":"Light Up the Stage","type":"Sorcery","mana":"{2}{R}","oracle":"Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nExile the top two cards of your library. Until the end of your next turn, you may play those cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Spectacle"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1232
const CRYPT = {"name":"Tormod's Crypt","type":"Artifact","mana":"{0}","oracle":"{T}, Sacrifice this artifact: Exile target player's graveyard.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1834
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const LIVING_DEATH = {"name":"Living Death","type":"Sorcery","mana":"{3}{B}{B}","oracle":"Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #456
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));
const cardsOf = (prefix, list) => list.map((c, i) => ({ ...c, id: `${prefix}${i}` }));
/** Heads-up, `active`'s turn 5 precombat main: `boards`, `hands`, `graveyards`, `libraries` (top first) per seat. The person: user. */
function table({ active = "user", boards = {}, hands = {}, graveyards = {}, libraries = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, battlefield: boards[pid] || [], hand: cardsOf(`${pid}-h`, hands[pid] || []), graveyard: cardsOf(`${pid}-g`, graveyards[pid] || []), exile: [],
      library: cardsOf(`${pid}-l`, libraries[pid] || Array.from({ length: 8 }, () => ISLAND)), landsPlayedThisTurn: 0 };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const plus = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;
/** Resolve the stack and every pause (each "may" answered yes), settled as the session settles it. */
function settle(s0, { pick = (rows) => rows[0] } = {}) {
  let s = s0;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 200; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, pick(q.pendingChoice.candidates).id); continue; }
    if (!s.stack.length && !(s.pendingTriggers || []).length) break;
    s = passPriority(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return s;
}
const cast = (s, seat, name, pred = () => true) => {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.name === name && pred(x));
  expect(a, `${name} is not offered to ${seat}`).toBeTruthy();
  return settle(dispatchAction(s, a));
};
/** The active player's combat: `attacks` declared; the rest passed. Stops at the postcombat main phase. */
function combat(s0, attacks) {
  let s = s0;
  const me = s0.activePlayer;
  const declared = new Set();
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 300 && s.phase !== "postcombat-main" && s.turn === s0.turn; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.step === "declare-attackers" && s.priorityHolder === me) {
      const id = attacks.find((x) => !declared.has(x) && offered(s, me, "declare-attacker").some((a) => a.permanentId === x));
      if (id) { declared.add(id); s = dispatchAction(s, offered(s, me, "declare-attacker").find((a) => a.permanentId === id)); continue; }
    }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  return s;
}

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(LAELIA)).toBe("native-trigger");
  });
});

describe("the person's Laelia", () => {
  it("⭐ she attacks: her own exile puts a counter on her before damage — 3 damage, the card playable", () => {
    const s = combat(table({ boards: { user: [on("user", "laelia", LAELIA)] }, libraries: { user: [GIANT, ISLAND, ISLAND] } }), ["laelia"]);
    expect({ counters: plus(s, "laelia"), ai: s.players.ai.life, exile: s.players.user.exile.map((c) => c.name), playable: !!s.players.user.exile[0]?._impulse })
      .toEqual({ counters: 1, ai: 37, exile: ["Hill Giant"], playable: true });
  });
  it("⭐ the person's own Scavenging Ooze exiles a Grizzly Bears from their graveyard: a counter on Laelia (and on the Ooze, its own rider)", () => {
    let s = table({ boards: { user: [on("user", "laelia", LAELIA), on("user", "ooze", OOZE), on("user", "fo0", FOREST)] }, graveyards: { user: [BEARS] } });
    const act = offered(s, "user", "activate-ability").find((a) => a.permanentId === "ooze" && (a.targets || []).some((t) => t.id === "user-g0"));
    expect(act, "the Ooze at the Bears is not offered").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ laelia: plus(s, "laelia"), ooze: plus(s, "ooze"), exile: s.players.user.exile.map((c) => c.name) }).toEqual({ laelia: 1, ooze: 1, exile: ["Grizzly Bears"] });
  });
  it("⭐ the AI exiles the person's graveyard (Bojuka Bog): another player's exile counts too — one counter", () => {
    let s = table({ active: "ai", boards: { user: [on("user", "laelia", LAELIA)] }, hands: { ai: [BOG] }, graveyards: { user: [BEARS, GIANT, FOREST] } });
    s = settle(dispatchAction(s, offered(s, "ai", "play-land").find((a) => a.name === "Bojuka Bog")), { pick: (rows) => rows.find((r) => r.targets.some((t) => t.id === "user")) });
    expect({ counters: plus(s, "laelia"), yard: s.players.user.graveyard.length, exile: s.players.user.exile.length }).toEqual({ counters: 1, yard: 0, exile: 3 });
  });
  it("⭐ Rest in Peace: two cards milled from the person's library are exiled instead — put into exile from the library, one counter", () => {
    const s = cast(table({ boards: { user: [on("user", "laelia", LAELIA), on("user", "rip", RIP), on("user", "is0", ISLAND)] }, hands: { user: [SCOUR] } }), "user", "Thought Scour", (a) => (a.targets || []).some((t) => t.id === "user"));
    // Exiled: the two milled cards (from the library) and Thought Scour itself (from the stack — not counted). One event, one counter.
    expect({ counters: plus(s, "laelia"), exile: s.players.user.exile.length, yard: s.players.user.graveyard.length }).toEqual({ counters: 1, exile: 3, yard: 0 });
  });
  it("⭐ cascade exiles one card at a time: Bloodbraid Elf over two lands to a Grizzly Bears — three exiles, three counters", () => {
    const s = cast(table({ boards: { user: [on("user", "laelia", LAELIA), ...many("user", "mt", MOUNTAIN, 2), ...many("user", "fo", FOREST, 2)] }, hands: { user: [BBE] }, libraries: { user: [FOREST, MOUNTAIN, BEARS, ISLAND, ISLAND] } }), "user", "Bloodbraid Elf");
    expect(plus(s, "laelia")).toBe(3);
  });
  it("⭐ Light Up the Stage exiles two cards at once — one counter; Tormod's Crypt, a second event later — a second counter", () => {
    let s = cast(table({ boards: { user: [on("user", "laelia", LAELIA), ...many("user", "mt", MOUNTAIN, 3), on("user", "crypt", CRYPT)] }, hands: { user: [LUTS] }, graveyards: { user: [BEARS] } }), "user", "Light Up the Stage");
    const first = plus(s, "laelia");
    const act = offered(s, "user", "activate-ability").find((a) => a.permanentId === "crypt" && (a.targets || []).some((t) => t.id === "user"));
    expect(act, "Tormod's Crypt at the person is not offered").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ first, second: plus(s, "laelia") }).toEqual({ first: 1, second: 2 });
  });
});

describe("controls — not from the person's library or graveyard", () => {
  it("control: Oblivion Ring exiles a creature from the battlefield — no counter", () => {
    let s = table({ boards: { user: [on("user", "laelia", LAELIA), ...many("user", "pl", PLAINS, 3)], ai: [on("ai", "giant", GIANT)] }, hands: { user: [ORING] } });
    s = settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.name === "Oblivion Ring")), { pick: (rows) => rows.find((r) => r.targets.some((t) => t.id === "giant")) });
    expect({ counters: plus(s, "laelia"), aiExile: s.players.ai.exile.map((c) => c.name) }).toEqual({ counters: 0, aiExile: ["Hill Giant"] });
  });
  it("control: the person exiles the AI's graveyard (Tormod's Crypt at the AI) — not their own: no counter", () => {
    let s = table({ boards: { user: [on("user", "laelia", LAELIA), on("user", "crypt", CRYPT)] }, graveyards: { ai: [BEARS, GIANT] } });
    s = settle(dispatchAction(s, offered(s, "user", "activate-ability").find((a) => a.permanentId === "crypt" && (a.targets || []).some((t) => t.id === "ai"))));
    expect({ counters: plus(s, "laelia"), aiExile: s.players.ai.exile.length }).toEqual({ counters: 0, aiExile: 2 });
  });
  it("control: the AI's own Light Up the Stage exiles from the AI's library — the person's Laelia: no counter", () => {
    const s = cast(table({ active: "ai", boards: { user: [on("user", "laelia", LAELIA)], ai: many("ai", "mt", MOUNTAIN, 3) }, hands: { ai: [LUTS] } }), "ai", "Light Up the Stage");
    expect({ counters: plus(s, "laelia"), aiExile: s.players.ai.exile.length }).toEqual({ counters: 0, aiExile: 2 });
  });
  // CR 603.10a — an exile from a graveyard is a leave event, looked back on: immediately before it Laelia was a card in the graveyard
  // (her battlefield ability didn't exist), and Living Death exiles her with the rest before it returns them all.
  it("⭐ Living Death exiles Laelia from the graveyard with the Hill Giant, then returns them: she hears nothing — no counter", () => {
    const s = cast(table({ boards: { user: many("user", "sw", SWAMP, 5) }, hands: { user: [LIVING_DEATH] }, graveyards: { user: [LAELIA, GIANT] } }), "user", "Living Death");
    const laelia = s.players.user.battlefield.find((p) => p.card?.name === "Laelia, the Blade Reforged");
    expect({ back: !!laelia, counters: laelia?.counters?.["+1/+1"] ?? 0, giant: s.players.user.battlefield.some((p) => p.card?.name === "Hill Giant") })
      .toEqual({ back: true, counters: 0, giant: true });
  });
});

describe("the default AI's Laelia", () => {
  it("⭐ the AI's Laelia attacks: its exile, its counter — 3 damage to the person", () => {
    const s = combat(table({ active: "ai", boards: { ai: [on("ai", "laelia", LAELIA)] } }), ["laelia"]);
    expect({ counters: plus(s, "laelia"), user: s.players.user.life }).toEqual({ counters: 1, user: 37 });
  });
});
