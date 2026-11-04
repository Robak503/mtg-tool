/**
 * baralChiefOfCompliance.test.js — BARAL, CHIEF OF COMPLIANCE (the play-weighted program, EDHREC #1340), with its twin LULLMAGE MENTOR
 * (#8255):
 *
 *   "Instant and sorcery spells you cast cost {1} less to cast.
 *    Whenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card."
 *
 * The event is the COUNTER (CR 701.6a): one trigger per spell a spell or ability its controller controls counters — a hard counter,
 * a soft counter its target's controller didn't pay, an activated ability's counter (Glen Elendra Archmage), a ward its controller's
 * permanent has (a triggered ability — ward, CR 702.21a), Kira's granted trigger. The bundled rulings: "A spell or ability counters a
 * spell only if it specifically contains the word 'counter' in its text. If a spell or ability you control causes all the targets of a
 * spell to become illegal, that spell doesn't resolve but it's not countered." So a spell that fizzles, a spell returned to its owner's
 * hand by Venser (no counter), a soft counter paid, a counter an OPPONENT controls — none triggers it. The draw is optional (CR 603.5),
 * the discard the controller's choice (CR 701.9a). Witnessed through real game states, for the person and the default AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, passPriority, raiseTriggerTargetChoice, settleTriggerTargetChoice } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { autoPickDiscardCandidate, autoPickOptionalDrawDiscard, autoPickSoftCounterPay, optionalAutoTakeValue, resolveDiscardChoice, resolveOptionalChoice, resolveOptionalDrawDiscardChoice, resolveSoftCounterChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BARAL = {"name":"Baral, Chief of Compliance","type":"Legendary Creature — Human Wizard","mana":"{1}{U}","oracle":"Instant and sorcery spells you cast cost {1} less to cast.\nWhenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card.","layout":"normal","cmc":2,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1340
const MENTOR = {"name":"Lullmage Mentor","type":"Creature — Merfolk Wizard","mana":"{1}{U}{U}","oracle":"Whenever a spell or ability you control counters a spell, you may create a 1/1 blue Merfolk creature token.\nTap seven untapped Merfolk you control: Counter target spell.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8255
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const LEAK = {"name":"Mana Leak","type":"Instant","mana":"{1}{U}","oracle":"Counter target spell unless its controller pays {3}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1761
const GLEN = {"name":"Glen Elendra Archmage","type":"Creature — Faerie Wizard","mana":"{3}{U}","oracle":"Flying\n{U}, Sacrifice this creature: Counter target noncreature spell.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying","Persist"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1706
const GUARD = {"name":"Tomakul Honor Guard","type":"Creature — Human Soldier","mana":"{1}{G}","oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":["Ward"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #30187
const KIRA = {"name":"Kira, Great Glass-Spinner","type":"Legendary Creature — Spirit","mana":"{1}{U}{U}","oracle":"Flying\nCreatures you control have \"Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.\"","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #5590
const VENSER = {"name":"Venser, Shaper Savant","type":"Legendary Creature — Human Wizard","mana":"{2}{U}{U}","oracle":"Flash (You may cast this spell any time you could cast an instant.)\nWhen Venser enters, return target spell or permanent to its owner's hand.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Flash"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1973
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","oracle":"Return target creature to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2928
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","oracle":"Draw two cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6263
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const LOOTER = {"name":"Merfolk Looter","type":"Creature — Merfolk Rogue","mana":"{1}{U}","oracle":"{T}: Draw a card, then discard a card.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #4392
// A 1/1 blue Merfolk token, as the engine mints Lullmage Mentor's (createPermanent of the minted card).
const MERFOLK = { name: "Merfolk", type: "Token Creature — Merfolk", mana: "", oracle: "", power: 1, toughness: 1, keywords: [], colors: ["U"], token: true };
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const CLONE = {"name":"Clone","type":"Creature — Shapeshifter","mana":"{3}{U}","oracle":"You may have this creature enter as a copy of any creature on the battlefield.","layout":"normal","cmc":4,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #3711
const PEARL = {"name":"Merfolk of the Pearl Trident","type":"Creature — Merfolk","mana":"{U}","oracle":"","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #25741

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));
/**
 * Heads-up, `active`'s precombat main on turn 5: each seat's `board`, `hand` (ids `<seat>-h<i>`) and a library (the user's, top
 * first: Hill Giant, then Islands; the AI's Mountains). The person plays the user seat.
 */
function table({ active = "ai", user = [], ai = [], userHand = [], aiHand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (pid) => (pid === "user" ? [GIANT, ...Array.from({ length: 8 }, () => ISLAND)] : Array.from({ length: 9 }, () => MOUNTAIN)).map((c, i) => ({ ...c, id: `${pid}-l${i}` }));
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, graveyard: [], exile: [], battlefield: pid === "user" ? user : ai, library: lib(pid),
      hand: (pid === "user" ? userHand : aiHand).map((c, i) => ({ ...c, id: `${pid}-h${i}` })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const act = (s, seat, pred, what) => {
  const a = legalActionsForPlayer(s, seat).find(pred);
  expect(a, `${what} is not offered to ${seat}`).toBeTruthy();
  return dispatchAction(s, a);
};
const cast = (s, seat, name, targetId = null) => act(s, seat, (a) => a.kind === "cast-spell" && a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)), name);
/** Give priority to `seat` (the other seat passes). */
const handTo = (s, seat) => (s.priorityHolder === seat ? s : passPriority(s));
/**
 * Resolve everything. The person's Baral question: `loot` (true/false); their discard: the next of `discards`. An AI seat answers
 * by its own defaults. A soft counter is paid as its controller's default decides. Each answer is settled as the session settles it
 * (learnSession's settle* — the resolve, then finalizeStackResolution unless another choice is pending). Records each question by seat
 * and kind.
 */
function settle(s0, { loot = true, discards = [], optional = true, targetPick = (rows) => rows[0] } = {}) {
  let s = s0;
  const asked = [];
  const queue = [...discards];
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 200; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-draw-discard") { asked.push(`${pc.controller}:loot`); s = fin(resolveOptionalDrawDiscardChoice(s, pc.controller === "user" ? loot : autoPickOptionalDrawDiscard(s, pc))); continue; }
    if (pc?.kind === "discard") { asked.push(`${pc.controller}:discard`); s = fin(resolveDiscardChoice(s, pc.controller === "user" ? queue.shift() : autoPickDiscardCandidate(s, pc))); continue; }
    if (pc?.kind === "soft-counter") { asked.push(`${pc.controller}:pay`); s = fin(resolveSoftCounterChoice(s, autoPickSoftCounterPay(s, pc))); continue; }
    if (pc?.kind === "optional-effect") { asked.push(`${pc.controller}:may`); s = fin(resolveOptionalChoice(s, pc.controller === "user" ? optional : optionalAutoTakeValue(s, pc))); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, targetPick(q.pendingChoice.candidates, q).id); continue; }
    if (!s.stack.length && !(s.pendingTriggers || []).length) break;
    s = passPriority(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s, asked };
}
const names = (zone) => zone.map((c) => c.name);

describe("the card", () => {
  it("⭐ covered: both lines play", () => {
    expect(classifyCard(BARAL)).toBe("native-mixed");
  });
  it("⭐ the twin: Lullmage Mentor", () => {
    expect(classifyCard(MENTOR)).toBe("native-mixed");
  });
});

describe("the person's Baral", () => {
  const COUNTER_BEARS = () => {
    let s = table({ user: [on("user", "baral", BARAL), ...many("user", "is", ISLAND, 2)], ai: many("ai", "fo", FOREST, 2), userHand: [COUNTERSPELL, MOUNTAIN], aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    return cast(s, "user", "Counterspell", s.stack.find((o) => o.source?.name === "Grizzly Bears").id);
  };
  it("⭐ Counterspell counters the AI's Bears: asked, yes — draws the Hill Giant, discards the Mountain of their choice", () => {
    const { s, asked } = settle(COUNTER_BEARS(), { loot: true, discards: ["user-h1"] });
    expect({ asked, aiYard: names(s.players.ai.graveyard), hand: names(s.players.user.hand), yard: names(s.players.user.graveyard) })
      .toEqual({ asked: ["user:loot", "user:discard"], aiYard: ["Grizzly Bears"], hand: ["Hill Giant"], yard: ["Counterspell", "Mountain"] });
  });
  it("⭐ the person declines: nothing drawn, nothing discarded", () => {
    const { s, asked } = settle(COUNTER_BEARS(), { loot: false });
    expect({ asked, hand: names(s.players.user.hand), library: s.players.user.library.length }).toEqual({ asked: ["user:loot"], hand: ["Mountain"], library: 9 });
  });
  it("⭐ Mana Leak the AI can't pay ({3} with no mana left): countered, and Baral asks", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "is0", ISLAND)], ai: many("ai", "fo", FOREST, 2), userHand: [LEAK, MOUNTAIN], aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    s = cast(s, "user", "Mana Leak", s.stack.find((o) => o.source?.name === "Grizzly Bears").id); // {1}{U} − {1}: one Island
    const { s: out, asked } = settle(s, { loot: true, discards: ["user-h1"] });
    expect({ asked, aiYard: names(out.players.ai.graveyard), hand: names(out.players.user.hand) }).toEqual({ asked: ["ai:pay", "user:loot", "user:discard"], aiYard: ["Grizzly Bears"], hand: ["Hill Giant"] });
  });
  it("⭐ an ability counters: Glen Elendra Archmage's on the AI's Lightning Bolt — Baral asks", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "glen", GLEN), on("user", "is0", ISLAND)], ai: [on("ai", "mt", MOUNTAIN)], userHand: [MOUNTAIN], aiHand: [BOLT] });
    s = handTo(cast(s, "ai", "Lightning Bolt", "user"), "user");
    const boltId = s.stack.find((o) => o.source?.name === "Lightning Bolt").id;
    s = act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "glen" && (a.targets || []).some((t) => t.id === boltId), "Glen Elendra's counter");
    const { s: out, asked } = settle(s, { loot: true, discards: ["user-h0"] });
    expect({ asked: asked.filter((q) => q.endsWith("loot")), life: out.players.user.life, aiYard: names(out.players.ai.graveyard) }).toEqual({ asked: ["user:loot"], life: 40, aiYard: ["Lightning Bolt"] });
  });
  it("⭐ the person's ward permanent counters the AI's Bolt (the AI can't pay {2}): Baral asks", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "guard", GUARD)], ai: [on("ai", "mt", MOUNTAIN)], userHand: [MOUNTAIN], aiHand: [BOLT] });
    s = cast(s, "ai", "Lightning Bolt", "guard");
    const { s: out, asked } = settle(s, { loot: true, discards: ["user-h0"] });
    expect({ asked: asked.filter((q) => !q.endsWith("discard")), guard: out.players.user.battlefield.some((p) => p.id === "guard"), hand: names(out.players.user.hand) })
      .toEqual({ asked: ["ai:pay", "user:loot"], guard: true, hand: ["Hill Giant"] });
  });
  it("⭐ Kira's granted trigger counters the AI's Bolt at the person's creature: Baral asks", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "kira", KIRA)], ai: [on("ai", "mt", MOUNTAIN)], userHand: [MOUNTAIN], aiHand: [BOLT] });
    s = cast(s, "ai", "Lightning Bolt", "baral");
    const { s: out, asked } = settle(s, { loot: true, discards: ["user-h0"] });
    expect({ asked: asked.filter((q) => q.endsWith("loot")), baral: out.players.user.battlefield.some((p) => p.id === "baral"), aiYard: names(out.players.ai.graveyard) })
      .toEqual({ asked: ["user:loot"], baral: true, aiYard: ["Lightning Bolt"] });
  });
});

describe("controls — no counter of the person's, no question", () => {
  it("control: the AI pays for Mana Leak — nothing is countered", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "is0", ISLAND)], ai: many("ai", "fo", FOREST, 5), userHand: [LEAK], aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    s = cast(s, "user", "Mana Leak", s.stack.find((o) => o.source?.name === "Grizzly Bears").id);
    const { s: out, asked } = settle(s);
    expect({ asked, bears: out.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears") }).toEqual({ asked: ["ai:pay"], bears: true });
  });
  it("control: Venser returns the AI's spell to its hand — not a counter", () => {
    let s = table({ user: [on("user", "baral", BARAL), ...many("user", "is", ISLAND, 4)], ai: many("ai", "ai-is", ISLAND, 3), userHand: [VENSER], aiHand: [DIVINATION] });
    s = handTo(cast(s, "ai", "Divination"), "user");
    s = cast(s, "user", "Venser, Shaper Savant");
    const divId = s.stack.find((o) => o.source?.name === "Divination")?.id;
    // Venser's enters trigger: the person aims it at the Divination (the AI's spell) — returned to its owner's hand, not countered.
    const out = settle(s, { targetPick: (rows) => rows.find((r) => r.targets.some((t) => t.id === divId)) });
    expect({ asked: out.asked.filter((q) => q.endsWith("loot")), aiHand: names(out.s.players.ai.hand) }).toEqual({ asked: [], aiHand: ["Divination"] });
  });
  it("control: the AI's Bolt fizzles — its target, the person's Bears, was returned by Unsummon: not countered", () => {
    let s = table({ user: [on("user", "baral", BARAL), on("user", "bears", BEARS), on("user", "is0", ISLAND)], ai: [on("ai", "mt", MOUNTAIN)], aiHand: [BOLT], userHand: [UNSUMMON] });
    s = handTo(cast(s, "ai", "Lightning Bolt", "bears"), "user");
    s = cast(s, "user", "Unsummon", "bears");
    const { s: out, asked } = settle(s);
    expect({ asked, hand: names(out.players.user.hand), aiYard: names(out.players.ai.graveyard) }).toEqual({ asked: [], hand: ["Grizzly Bears"], aiYard: ["Lightning Bolt"] });
  });
  it("control: the AI counters the person's spell — the person's Baral doesn't trigger", () => {
    let s = table({ active: "user", user: [on("user", "baral", BARAL), ...many("user", "fo", FOREST, 2)], ai: many("ai", "is", ISLAND, 2), userHand: [BEARS], aiHand: [COUNTERSPELL] });
    s = handTo(cast(s, "user", "Grizzly Bears"), "ai");
    s = cast(s, "ai", "Counterspell", s.stack.find((o) => o.source?.name === "Grizzly Bears").id);
    const { s: out, asked } = settle(s);
    expect({ asked, yard: names(out.players.user.graveyard) }).toEqual({ asked: [], yard: ["Grizzly Bears"] });
  });
});

describe("the default AI's Baral", () => {
  it("⭐ the AI counters the person's Bears: its Baral loots by its default — draws, then discards its least valuable card", () => {
    let s = table({ active: "user", user: many("user", "fo", FOREST, 2), ai: [on("ai", "baral", BARAL), ...many("ai", "is", ISLAND, 2)], userHand: [BEARS], aiHand: [COUNTERSPELL, MOUNTAIN] });
    s = handTo(cast(s, "user", "Grizzly Bears"), "ai");
    s = cast(s, "ai", "Counterspell", s.stack.find((o) => o.source?.name === "Grizzly Bears").id);
    const { s: out, asked } = settle(s);
    expect({ asked, aiHand: out.players.ai.hand.length, aiYard: names(out.players.ai.graveyard).sort(), library: out.players.ai.library.length })
      .toEqual({ asked: ["ai:loot", "ai:discard"], aiHand: 1, aiYard: ["Counterspell", "Mountain"], library: 8 });
  });
});

describe("the twin — Lullmage Mentor", () => {
  const MERFOLK_BOARD = (seat) => [on(seat, "mentor", MENTOR), ...many(seat, "mf", MERFOLK, 6), on(seat, "looter", LOOTER)];
  const offers = (s, seat) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "mentor");
  it("⭐ its counter, with the Merfolk the person chooses (CR 601.2h): the sets of seven differ only in which one stays untapped — three offers", () => {
    let s = table({ user: MERFOLK_BOARD("user"), ai: many("ai", "fo", FOREST, 2), aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    const bearsId = s.stack.find((o) => o.source?.name === "Grizzly Bears").id;
    const sets = offers(s, "user").filter((a) => (a.targets || []).some((t) => t.id === bearsId)).map((a) => {
      const all = ["mentor", ...Array.from({ length: 6 }, (_, i) => "mf" + i), "looter"];
      return all.filter((id) => !a.tapCountIds.includes(id)).map((id) => (id.startsWith("mf") ? "a Merfolk token" : id));
    });
    expect(sets.map((x) => x.join("")).sort()).toEqual(["a Merfolk token", "looter", "mentor"]);
    const keepLooter = offers(s, "user").find((a) => (a.targets || []).some((t) => t.id === bearsId) && !a.tapCountIds.includes("looter"));
    const { s: out, asked } = settle(dispatchAction(s, keepLooter), { optional: true });
    expect({ asked, looterTapped: out.players.user.battlefield.find((p) => p.id === "looter").tapped, aiYard: names(out.players.ai.graveyard), tokens: out.players.user.battlefield.filter((p) => p.card?.token).length })
      .toEqual({ asked: ["user:may"], looterTapped: false, aiYard: ["Grizzly Bears"], tokens: 7 });
  });
  // WHICH PAYERS ARE ONE CHOICE (legalChoices.interchangeablePayerKey — pw29's round-2 recheck, R2-F1, the same class in this key):
  // two permanents are offered as one choice only when nothing tells them apart. A blocker kept back is a real choice (a blocked
  // attacker stays blocked whichever blocker goes, CR 509.1h); a clone is a different object from the card it copies (CR 707.2).
  const leftOut = (a, all) => all.filter((id) => !a.tapCountIds.includes(id));
  it("⭐ seven Merfolk tokens, one of them blocking the AI's Hill Giant: the set that keeps the blocker untapped is offered, and the blocker is labelled", () => {
    let s = table({ user: [on("user", "mentor", MENTOR), ...many("user", "mf", MERFOLK, 7)], ai: [on("ai", "giant", GIANT), on("ai", "mt", MOUNTAIN)], aiHand: [BOLT] });
    s = { ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "giant", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "mf0", blockingPlayer: "user", attackerId: "giant" }], blockDeclarationOpen: false } };
    s = handTo(cast(s, "ai", "Lightning Bolt", "user"), "user");
    const boltId = s.stack.find((o) => o.source?.name === "Lightning Bolt").id;
    const all = ["mentor", ...Array.from({ length: 7 }, (_, i) => "mf" + i)];
    const rows = offers(s, "user").filter((a) => (a.targets || []).some((t) => t.id === boltId));
    const sets = rows.map((a) => leftOut(a, all).map((id) => (id === "mf0" ? "the blocker" : id.startsWith("mf") ? "an idle token" : id)).join("")).sort();
    const tappingBlocker = rows.find((a) => a.tapCountIds.includes("mf0"));
    expect({ sets, label: tappingBlocker?.tapCountNames?.filter((n) => /blocking/.test(n)) })
      .toEqual({ sets: ["an idle token", "mentor", "the blocker"], label: ["Merfolk (blocking Hill Giant, token)"] });
    // Taking the set that keeps the blocker untapped: the Bolt is countered, the blocker stays untapped and blocking.
    const { s: out } = settle(dispatchAction(s, rows.find((a) => !a.tapCountIds.includes("mf0"))), { optional: false });
    expect({ blockerTapped: out.players.user.battlefield.find((p) => p.id === "mf0").tapped, aiYard: names(out.players.ai.graveyard), user: out.players.user.life })
      .toEqual({ blockerTapped: false, aiYard: ["Lightning Bolt"], user: 40 });
  });
  it("⭐ a Clone that entered as a copy of Merfolk of the Pearl Trident, beside the real one: two payers, each labelled", () => {
    let s = table({ active: "user", user: [on("user", "mentor", MENTOR), ...many("user", "mf", MERFOLK, 5), on("user", "pearl", PEARL, { summoningSick: true }), ...many("user", "is", ISLAND, 4)], ai: many("ai", "fo", FOREST, 2), userHand: [CLONE], aiHand: [BEARS] });
    s = cast(s, "user", "Clone");
    for (let g = 0; g < 10 && !s.pendingChoice && s.stack.length; g++) s = passPriority(s);
    expect(s.pendingChoice?.kind).toBe("clone-search");
    s = finalizeStackResolution(resolveCloneChoice(s, "pearl"));
    const clone = s.players.user.battlefield.find((p) => p.printedCard?.name === "Clone");
    expect(clone?.card?.name, "the Clone entered as a copy").toBe("Merfolk of the Pearl Trident");
    s = { ...s, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0 };
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    const bearsId = s.stack.find((o) => o.source?.name === "Grizzly Bears").id;
    const all = ["mentor", ...Array.from({ length: 5 }, (_, i) => "mf" + i), "pearl", clone.id];
    const rows = offers(s, "user").filter((a) => (a.targets || []).some((t) => t.id === bearsId));
    const sets = rows.map((a) => leftOut(a, all).map((id) => (id === clone.id ? "the Clone" : id.startsWith("mf") ? "a token" : id)).join("")).sort();
    const both = rows.find((a) => a.tapCountIds.includes("pearl") && a.tapCountIds.includes(clone.id));
    expect({ sets, labels: both?.tapCountNames?.filter((n) => /Pearl Trident/.test(n)).sort() })
      .toEqual({ sets: ["a token", "mentor", "pearl", "the Clone"], labels: ["Clone (copy of Merfolk of the Pearl Trident, summoning sick)", "Merfolk of the Pearl Trident (summoning sick)"] });
  });
  it("control: identical idle Merfolk tokens are still one choice — six tokens, the Looter and the Mentor: three offers", () => {
    let s = table({ user: MERFOLK_BOARD("user"), ai: many("ai", "fo", FOREST, 2), aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    const bearsId = s.stack.find((o) => o.source?.name === "Grizzly Bears").id;
    const rows = offers(s, "user").filter((a) => (a.targets || []).some((t) => t.id === bearsId));
    expect({ n: rows.length, tokenLabels: [...new Set(rows.flatMap((a) => a.tapCountNames).filter((n) => n !== "Merfolk Looter" && n !== "Lullmage Mentor"))] }).toEqual({ n: 3, tokenLabels: ["Merfolk (token)"] });
  });
  it("control: the default AI's seat is offered its one house set, as before", () => {
    let s = table({ active: "user", user: many("user", "fo", FOREST, 2), ai: MERFOLK_BOARD("ai"), userHand: [BEARS] });
    s = handTo(cast(s, "user", "Grizzly Bears"), "ai");
    const bearsId = s.stack.find((o) => o.source?.name === "Grizzly Bears").id;
    expect(offers(s, "ai").filter((a) => (a.targets || []).some((t) => t.id === bearsId)).length).toBe(1);
  });
  it("⭐ Counterspell counters: the person may create a 1/1 blue Merfolk — yes, one token", () => {
    let s = table({ user: [on("user", "mentor", MENTOR), ...many("user", "is", ISLAND, 2)], ai: many("ai", "fo", FOREST, 2), userHand: [COUNTERSPELL], aiHand: [BEARS] });
    s = handTo(cast(s, "ai", "Grizzly Bears"), "user");
    s = cast(s, "user", "Counterspell", s.stack.find((o) => o.source?.name === "Grizzly Bears").id);
    const { s: out, asked } = settle(s, { optional: true });
    const tokens = out.players.user.battlefield.filter((p) => p.card?.token).map((p) => `${p.card.name} ${p.card.power}/${p.card.toughness}`);
    expect({ asked, tokens }).toEqual({ asked: ["user:may"], tokens: ["Merfolk 1/1"] });
  });
});
