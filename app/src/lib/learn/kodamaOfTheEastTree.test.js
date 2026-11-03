/**
 * kodamaOfTheEastTree.test.js — KODAMA OF THE EAST TREE (the play-weighted program, EDHREC #991):
 *
 *   "Reach
 *    Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent
 *    card with equal or lesser mana value from your hand onto the battlefield.
 *    Partner"
 *
 * The enters watcher (event permanentEnters, another permanent you control) with its provenance intervening-if: a permanent this
 * ability put onto the battlefield is stamped `enteredViaAbilityOf` (the Kodama's permanent id) as it enters, before any enters
 * trigger is checked, so it never triggers the Kodama that put it (CR 603.4 — checked as it triggers and as it resolves; a stamp
 * read off the look-back when the permanent has left). Any other permanent triggers it — a copy's put triggers the original. The
 * put is the hand → battlefield search (effects/atoms/putFromHand.js) with a cap: a permanent card whose mana value (CR 202.3 — {X}
 * is 0, a modal double-faced card its front face's) is at most the entering permanent's, read as the ability resolves — the
 * permanent's current mana value, or its last known one when it has left (CR 608.2h). Partner is a deck-building rule.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveOptionalChoice, resolveOptionalLifePaymentChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KODAMA = {"name":"Kodama of the East Tree","type":"Legendary Creature — Spirit","mana":"{4}{G}{G}","oracle":"Reach\nWhenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.\nPartner (You can have two commanders if both have partner.)","layout":"normal","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":["Reach","Partner"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #991
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const THOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const HANGARBACK = {"name":"Hangarback Walker","type":"Artifact Creature — Construct","mana":"{X}{X}","oracle":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature.","layout":"normal","cmc":0,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1522
const MAMMOTH = {"name":"Kazandu Mammoth // Kazandu Valley","type":"Creature — Elephant // Land","mana":"{1}{G}{G}","oracle":"Kazandu Mammoth - Creature — Elephant {1}{G}{G}\nLandfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.\n//\nKazandu Valley - Land \nThis land enters tapped.\n{T}: Add {G}.","layout":"modal_dfc","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Landfall"],"colors":[],"colorIdentity":["G"]}; // EDHREC #9162
const ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","oracle":"Create two 1/1 white Soldier creature tokens.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #4505
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const TURNTIMBER = {"name":"Turntimber Symbiosis // Turntimber, Serpentine Wood","type":"Sorcery // Land","mana":"{4}{G}{G}{G}","oracle":"Turntimber Symbiosis - Sorcery {4}{G}{G}{G}\nLook at the top seven cards of your library. You may put a creature card from among them onto the battlefield. If that card has mana value 3 or less, it enters with three additional +1/+1 counters on it. Put the rest on the bottom of your library in a random order.\n//\nTurntimber, Serpentine Wood - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {G}.","layout":"modal_dfc","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #2318
const AVENGER = {"name":"Avenger of Zendikar","type":"Creature — Elemental","mana":"{5}{G}{G}","oracle":"When this creature enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.","layout":"normal","cmc":7,"power":"5","toughness":"5","loyalty":null,"keywords":["Landfall"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #295
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const cards = (seat, list) => list.map(([id, c]) => ({ ...c, id }));
/** `seat`'s precombat main with the Kodama out, `hand`, a land drop left and `pool` floating. */
function table({ seat = "user", hand = [], board = [], pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: pid === seat ? [on(seat, "kodama", KODAMA), ...board] : [], graveyard: [], library: [],
      hand: pid === seat ? cards(seat, hand) : [], landsPlayedThisTurn: 0, manaPool: pid === seat ? pool : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
/**
 * Run the stack and the triggers out. Each optional "you may" the person is asked takes the next of `yes` (true/false); each put
 * picker the person faces takes the next of `picks` (a card id, or null to put nothing); the AI takes its autopilot (yes, then its pick).
 * Records what each question offered.
 */
function drive(s, { yes = [], picks = [] } = {}) {
  let n = s, g = 0;
  const asked = [];
  const ys = [...yes], ps = [...picks];
  while (g++ < 80) {
    const pc = n.pendingChoice;
    if (pc?.kind === "optional-effect") {
      const say = pc.controller === "user" ? ys.shift() : true;
      asked.push({ q: "may", seat: pc.controller, say });
      n = resolveOptionalChoice(n, say);
      continue;
    }
    if (pc?.kind === "optional-life-payment") { n = resolveOptionalLifePaymentChoice(n, false); continue; } // a land's "you may pay 3 life" (Turntimber, Serpentine Wood): declined — it enters tapped
    if (pc?.kind === "tutor-search") {
      const id = pc.controller === "user" ? ps.shift() : autoPickTutorCandidate(n, pc);
      asked.push({ q: "put", seat: pc.controller, candidates: pc.candidates.map((c) => c.id), pick: id });
      n = resolveTutorChoice(n, id ?? null);
      continue;
    }
    if (pc) break;
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    if (n.stack?.length) { n = resolveTopOfStack(n); continue; }
    // A settled choice closes the resolution that paused for it: state-based actions, then any triggers (as the session driver does).
    const fin = finalizeStackResolution(n);
    if (fin !== n && (fin.pendingTriggers?.length || fin.stack?.length || fin.pendingChoice || fin.log.length !== n.log.length)) { n = fin; if (fin.pendingTriggers?.length || fin.stack?.length || fin.pendingChoice) continue; }
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s: n, asked };
}
const playOrCast = (s, cardId, seat = "user") => {
  const a = legalActionsForPlayer(s, seat).find((x) => (x.kind === "play-land" || x.kind === "cast-spell") && x.cardId === cardId);
  expect(a, `${cardId} is not offered`).toBeTruthy();
  return dispatchAction(s, a);
};
const names = (s, seat = "user") => s.players[seat].battlefield.map((p) => p.card.name);

describe("the card", () => {
  it("⭐ native: the watcher, its provenance check and the capped put all read", () => {
    expect(classifyCard(KODAMA)).toBe("native-trigger");
  });
});

describe("the person's Kodama", () => {
  it("⭐ a land drop (mana value 0): asked, the person puts Ornithopter — and Ornithopter, put by this ability, triggers nothing", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["f1", FOREST], ["orn", THOPTER], ["sol", SOL_RING], ["gnt", GIANT], ["f2", FOREST]] }), "f1"), { yes: [true], picks: ["orn"] });
    expect({ asked, bf: names(s), stamp: s.players.user.battlefield.find((p) => p.card.name === "Ornithopter")?.enteredViaAbilityOf })
      .toEqual({
        asked: [{ q: "may", seat: "user", say: true }, { q: "put", seat: "user", candidates: ["orn", "f2"], pick: "orn" }],
        bf: ["Kodama of the East Tree", "Forest", "Ornithopter"], stamp: "kodama",
      });
  });
  it("⭐ Sol Ring cast (mana value 1): the cap is 1 — Llanowar Elves, Ornithopter and a land are offered, Hill Giant (4) is not", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["sol", SOL_RING], ["elf", ELVES], ["orn", THOPTER], ["gnt", GIANT], ["f2", FOREST]], pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } }), "sol"), { yes: [true], picks: ["elf"] });
    expect({ offered: asked.find((x) => x.q === "put")?.candidates, bf: names(s), hand: s.players.user.hand.map((c) => c.id) })
      .toEqual({ offered: ["elf", "orn", "f2"], bf: ["Kodama of the East Tree", "Sol Ring", "Llanowar Elves"], hand: ["orn", "gnt", "f2"] });
  });
  it("the person may decline: asked, says no — nothing is put", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["f1", FOREST], ["orn", THOPTER]] }), "f1"), { yes: [false] });
    expect({ asked, bf: names(s) }).toEqual({ asked: [{ q: "may", seat: "user", say: false }], bf: ["Kodama of the East Tree", "Forest"] });
  });
  it("⭐ its ruling — {X} is 0 in hand: Hangarback Walker (mana value 0) is put off a land drop, enters with no counters and dies", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["f1", FOREST], ["hb", HANGARBACK]] }), "f1"), { yes: [true], picks: ["hb"] });
    expect({ offered: asked.find((x) => x.q === "put")?.candidates, bf: names(s), yard: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ offered: ["hb"], bf: ["Kodama of the East Tree", "Forest"], yard: ["Hangarback Walker"] });
  });
  it("⭐ a modal double-faced card is its front face's mana value in hand: Kazandu Mammoth (3) isn't offered off Sol Ring, is off Hill Giant", () => {
    const off = (castId, pool, extra) => drive(playOrCast(table({ hand: [[castId, castId === "sol" ? SOL_RING : GIANT], ["mam", MAMMOTH], ...extra], pool }), castId), { yes: [true], picks: [null] }).asked.find((x) => x.q === "put")?.candidates;
    expect({ sol: off("sol", { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 }, [["orn", THOPTER]]), giant: off("gnt", { W: 0, U: 0, B: 0, R: 1, G: 0, C: 3 }, []) })
      .toEqual({ sol: ["orn"], giant: ["mam"] });
  });
  it("⭐ (F2) a modal DFC played as its land face has only that face's characteristics (CR 712.8f) — Turntimber, Serpentine Wood (no mana cost, 0) caps it at 0: only the Forest, not Avenger of Zendikar or Hill Giant", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["tt", TURNTIMBER], ["av", AVENGER], ["cw", GIANT], ["f2", FOREST]] }), "tt"), { yes: [true], picks: ["f2"] });
    const land = s.players.user.battlefield.find((p) => p.card.name === "Turntimber, Serpentine Wood");
    expect({ land: !!land, offered: asked.find((x) => x.q === "put")?.candidates, bf: names(s) })
      .toEqual({ land: true, offered: ["f2"], bf: ["Kodama of the East Tree", "Turntimber, Serpentine Wood", "Forest"] });
  });
  it("⭐ (F2) and through its last known value: the land face gone before the trigger resolves still caps it at 0", () => {
    let s = playOrCast(table({ hand: [["tt", TURNTIMBER], ["av", AVENGER], ["orn", THOPTER]] }), "tt");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.card.name !== "Turntimber, Serpentine Wood") } } };
    const { asked } = drive(s, { yes: [true], picks: [null] });
    expect(asked.find((x) => x.q === "put")?.candidates).toEqual(["orn"]);
  });
  it("control (F2): the same card's FRONT face keeps its own mana value — Kazandu Mammoth cast as the creature caps it at 3", () => {
    const s0 = table({ hand: [["mam", MAMMOTH], ["gnt", GIANT], ["elf", ELVES]], pool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 1 } });
    const cast = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "mam");
    const { asked } = drive(dispatchAction(s0, cast), { yes: [true], picks: [null] });
    expect(asked.find((x) => x.q === "put")?.candidates).toEqual(["elf"]);
  });
  it("⭐ two tokens at once are two permanents entering: Raise the Alarm triggers it twice (mana value 0 each)", () => {
    const { s, asked } = drive(playOrCast(table({ hand: [["ra", ALARM], ["orn", THOPTER], ["f2", FOREST]], pool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } }), "ra"), { yes: [true, true], picks: ["orn", "f2"] });
    expect({ mays: asked.filter((x) => x.q === "may").length, bf: names(s).filter((n) => n !== "Soldier") })
      .toEqual({ mays: 2, bf: ["Kodama of the East Tree", "Ornithopter", "Forest"] });
  });
  it("⭐ CR 608.2h — the entering permanent gone by resolution: its last known mana value (1) is the cap", () => {
    let s = playOrCast(table({ hand: [["sol", SOL_RING], ["elf", ELVES], ["gnt", GIANT]], pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } }), "sol");
    s = resolveTopOfStack(s); // Sol Ring resolves; the Kodama's trigger waits
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.card.name !== "Sol Ring") } } };
    const { asked } = drive(s, { yes: [true], picks: [null] });
    expect(asked.find((x) => x.q === "put")?.candidates).toEqual(["elf"]);
  });
  it("⭐ \"this ability\": with a second, nonlegendary Kodama (as Spark Double copies it), a permanent one puts triggers the other", () => {
    const twin = on("user", "kodama2", { ...KODAMA, type: "Creature — Spirit" });
    const { s, asked } = drive(playOrCast(table({ board: [twin], hand: [["f1", FOREST], ["orn", THOPTER], ["f2", FOREST], ["f3", FOREST]] }), "f1"), { yes: [true, true, true, false, false], picks: ["orn", "f2", "f3"] });
    // The land drop triggers both; each put triggers only the OTHER Kodama, and that chain ends when the person declines.
    expect({ mays: asked.filter((x) => x.q === "may").length, bf: names(s).filter((n) => !/Kodama/.test(n)) })
      .toEqual({ mays: 5, bf: ["Forest", "Ornithopter", "Forest", "Forest"] });
  });
  it("⛔ an instant isn't a permanent card: Lightning Bolt (mana value 1) is never offered", () => {
    const { asked } = drive(playOrCast(table({ hand: [["sol", SOL_RING], ["bolt", BOLT], ["elf", ELVES]], pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } }), "sol"), { yes: [true], picks: [null] });
    expect(asked.find((x) => x.q === "put")?.candidates).toEqual(["elf"]);
  });
});

describe("the default AI", () => {
  it("⭐ (F2) its Kodama off a Turntimber land drop puts the Forest, never Avenger of Zendikar", () => {
    const { s, asked } = drive(playOrCast(table({ seat: "ai", hand: [["tt", TURNTIMBER], ["av", AVENGER], ["f2", FOREST]] }), "tt", "ai"));
    expect({ offered: asked.find((x) => x.q === "put")?.candidates, bf: names(s, "ai") }).toEqual({ offered: ["f2"], bf: ["Kodama of the East Tree", "Turntimber, Serpentine Wood", "Forest"] });
  });
  it("⭐ (F3) at cap 0 it doesn't put a creature that would die at once (Hangarback Walker, 0/0 with no counters) — it puts nothing; with Ornithopter beside it (mana value 0, a 0/2 that survives), the Ornithopter", () => {
    const only = drive(playOrCast(table({ seat: "ai", hand: [["f1", FOREST], ["hb", HANGARBACK]] }), "f1", "ai"));
    const both = drive(playOrCast(table({ seat: "ai", hand: [["f1", FOREST], ["hb", HANGARBACK], ["orn", THOPTER]] }), "f1", "ai"));
    expect({ only: { pick: only.asked.find((x) => x.q === "put")?.pick ?? null, bf: names(only.s, "ai") }, both: both.asked.find((x) => x.q === "put")?.pick })
      .toEqual({ only: { pick: null, bf: ["Kodama of the East Tree", "Forest"] }, both: "orn" });
  });
  it("⭐ its Kodama takes the put: off a land drop it puts its highest-mana-value card within the cap (its other land)", () => {
    const { s, asked } = drive(playOrCast(table({ seat: "ai", hand: [["f1", FOREST], ["f2", FOREST], ["gnt", GIANT]] }), "f1", "ai"));
    expect({ asked, bf: names(s, "ai") }).toEqual({
      asked: [{ q: "may", seat: "ai", say: true }, { q: "put", seat: "ai", candidates: ["f2"], pick: "f2" }],
      bf: ["Kodama of the East Tree", "Forest", "Forest"],
    });
  });
});
