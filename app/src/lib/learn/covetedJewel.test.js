/**
 * covetedJewel.test.js — COVETED JEWEL (the play-weighted program, EDHREC #1261):
 *
 *   "When this artifact enters, draw three cards.
 *    {T}: Add three mana of any one color.
 *    Whenever one or more creatures an opponent controls attack you and aren't blocked, that player draws three cards and gains
 *    control of this artifact. Untap it."
 *
 * The defending player's watcher, fired once blocks are declared (CR 509.2a — the bundled rulings: "triggers after you declare
 * blockers (or declare no blockers at all) if any attacking creatures are unblocked. It doesn't matter if some attacking creatures
 * were blocked."; "A creature attacking a planeswalker you control won't cause Coveted Jewel's last ability to trigger."; it
 * "resolves after blockers are chosen but before combat damage is dealt"). ONE trigger per such opponent (CR 603.2c). "That player" is
 * the attacking opponent: they draw three cards (their own draw), gain control of the Jewel for good (CR 611.2a — no duration) and
 * untap it, and may tap it for mana at once (a noncreature artifact isn't affected by summoning sickness, CR 302.6). Witnessed through
 * real game states, for the person and the default AI on each side.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, passPriority } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { manaSources } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const JEWEL = {"name":"Coveted Jewel","type":"Artifact","mana":"{6}","oracle":"When this artifact enters, draw three cards.\n{T}: Add three mana of any one color.\nWhenever one or more creatures an opponent controls attack you and aren't blocked, that player draws three cards and gains control of this artifact. Untap it.","layout":"normal","cmc":6,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1261
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","oracle":"Destroy target artifact.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #14015
const GIDEON = {"name":"Gideon Jura","type":"Legendary Planeswalker — Gideon","mana":"{3}{W}{W}","oracle":"+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if able.\n−2: Destroy target tapped creature.\n0: Until end of turn, Gideon Jura becomes a 6/6 Human Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":"6","keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11304
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid) => Array.from({ length: 10 }, (_, i) => ({ ...FOREST, id: `${pid}-l${i}` }));
/** `active`'s turn 5, beginning of combat (heads-up unless `pod`); `boards` and `hands` per seat. The person plays the user seat. */
function table({ active = "ai", pod = false, boards = {}, hands = {} } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, graveyard: [], battlefield: boards[pid] || [], hand: (hands[pid] || []).map((c, i) => ({ ...c, id: `${pid}-h${i}` })), library: lib(pid) };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
/**
 * Play the turn's combat. `attacks` — { attackerId: defender } ("pw:<id>" a planeswalker), declared by the active player; `blocks` —
 * { blockerId: attackerId }, declared by their controllers. `respond(state)` acts once, with the Jewel's ability on the stack, when
 * the person holds priority. Records the state the moment the Jewel's ability has resolved (`atResolve`) and stops at combat's end.
 */
function combat(s0, { attacks = {}, blocks = {}, respond = null } = {}) {
  let s = s0;
  const declared = new Set();
  const blocked = new Set();
  let responded = false;
  let atResolve = null;
  let sawJewel = false;
  for (let g = 0; g < 300; g++) {
    if (s.phase === "postcombat-main" || s.turn !== s0.turn) break;
    const jewelOnStack = s.stack.some((o) => o.source?.name === "Coveted Jewel");
    if (jewelOnStack) sawJewel = true;
    if (sawJewel && !jewelOnStack && !atResolve) atResolve = s;
    if (s.step === "declare-attackers" && s.priorityHolder === s0.activePlayer) {
      const next = Object.entries(attacks).find(([id]) => !declared.has(id));
      if (next) {
        const [id, def] = next;
        declared.add(id);
        const a = offered(s, s0.activePlayer, "declare-attacker").find((x) => x.permanentId === id && (def.startsWith("pw:") ? x.defenderPlaneswalkerId === def.slice(3) : (x.defenderId ?? def) === def && !x.defenderPlaneswalkerId));
        expect(a, `${id} can't attack ${def}`).toBeTruthy();
        s = dispatchAction(s, a);
        continue;
      }
    }
    if (s.step === "declare-blockers" && s.priorityHolder) {
      const next = Object.entries(blocks).find(([id]) => !blocked.has(id) && offered(s, s.priorityHolder, "declare-blocker").some((a) => a.permanentId === id));
      if (next) {
        const [id, atk] = next;
        blocked.add(id);
        s = dispatchAction(s, offered(s, s.priorityHolder, "declare-blocker").find((a) => a.permanentId === id && a.attackerId === atk));
        continue;
      }
    }
    if (respond && !responded && jewelOnStack && s.priorityHolder === "user") { responded = true; s = respond(s); continue; }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  return { s, atResolve };
}
const jewelAt = (s) => Object.entries(s.players).find(([, p]) => p.battlefield.some((x) => x.id === "jewel"))?.[0] ?? null;
const jewel = (s) => Object.values(s.players).flatMap((p) => p.battlefield).find((x) => x.id === "jewel");

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(JEWEL)).toBe("native-mana");
  });
});

describe("the person's Jewel, the AI attacking", () => {
  it("⭐ the AI's Bears unblocked: the AI draws three, takes the Jewel and untaps it — before combat damage, and it can tap it for mana at once", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL, { tapped: true })], ai: [on("ai", "bears", BEARS)] } });
    const { s: out, atResolve } = combat(s, { attacks: { bears: "user" } });
    expect(atResolve, "the Jewel's trigger resolves in the declare blockers step").toBeTruthy();
    // Its mana ability is one of the AI's mana sources right away (an instant cast in this step can tap it — CR 302.6 reaches only creatures).
    const aiMana = manaSources(atResolve, "ai").some((src) => src.permanentId === "jewel");
    expect({ at: jewelAt(atResolve), tapped: jewel(atResolve).tapped, aiHand: atResolve.players.ai.hand.length, userHand: atResolve.players.user.hand.length, userLife: atResolve.players.user.life, step: atResolve.step, aiMana })
      .toEqual({ at: "ai", tapped: false, aiHand: 3, userHand: 0, userLife: 40, step: "declare-blockers", aiMana: true });
    expect({ at: jewelAt(out), userLife: out.players.user.life }).toEqual({ at: "ai", userLife: 38 });
  });
  it("⭐ one attacker blocked, one not: it still triggers, once", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL), on("user", "ugiant", GIANT)], ai: [on("ai", "bears", BEARS), on("ai", "giant", GIANT)] } });
    const { s: out } = combat(s, { attacks: { bears: "user", giant: "user" }, blocks: { ugiant: "giant" } });
    expect({ at: jewelAt(out), aiHand: out.players.ai.hand.length, userLife: out.players.user.life }).toEqual({ at: "ai", aiHand: 3, userLife: 38 });
  });
  it("⭐ Shattered in response: the AI still draws three; there is no Jewel to take", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL), on("user", "mt0", MOUNTAIN), on("user", "mt1", MOUNTAIN)], ai: [on("ai", "bears", BEARS)] }, hands: { user: [SHATTER] } });
    const respond = (st) => dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.kind === "cast-spell" && a.name === "Shatter" && (a.targets || []).some((t) => t.id === "jewel")));
    const { s: out } = combat(s, { attacks: { bears: "user" }, respond });
    expect({ at: jewelAt(out), yard: out.players.user.graveyard.map((c) => c.name).sort(), aiHand: out.players.ai.hand.length }).toEqual({ at: null, yard: ["Coveted Jewel", "Shatter"], aiHand: 3 });
  });
});

describe("controls", () => {
  it("control: the only attacker is blocked — nothing", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL), on("user", "ugiant", GIANT)], ai: [on("ai", "bears", BEARS)] } });
    const { s: out } = combat(s, { attacks: { bears: "user" }, blocks: { ugiant: "bears" } });
    expect({ at: jewelAt(out), aiHand: out.players.ai.hand.length }).toEqual({ at: "user", aiHand: 0 });
  });
  it("control: an unblocked creature attacking the person's planeswalker — not an attack on the person", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL), on("user", "gid", GIDEON, { counters: { loyalty: 6 } })], ai: [on("ai", "bears", BEARS)] } });
    const { s: out } = combat(s, { attacks: { bears: "pw:gid" } });
    expect({ at: jewelAt(out), aiHand: out.players.ai.hand.length }).toEqual({ at: "user", aiHand: 0 });
  });
  it("control: no attack at all — nothing", () => {
    const s = table({ boards: { user: [on("user", "jewel", JEWEL)], ai: [on("ai", "bears", BEARS)] } });
    const { s: out } = combat(s, {});
    expect({ at: jewelAt(out), aiHand: out.players.ai.hand.length }).toEqual({ at: "user", aiHand: 0 });
  });
});

describe("the AI's Jewel, the person attacking", () => {
  it("⭐ the person's Bears unblocked: the person draws three and takes the Jewel, untapped", () => {
    const s = table({ active: "user", boards: { ai: [on("ai", "jewel", JEWEL, { tapped: true })], user: [on("user", "bears", BEARS)] } });
    const { s: out } = combat(s, { attacks: { bears: "ai" } });
    expect({ at: jewelAt(out), tapped: jewel(out).tapped, userHand: out.players.user.hand.length, aiHand: out.players.ai.hand.length }).toEqual({ at: "user", tapped: false, userHand: 3, aiHand: 0 });
  });
  it("⭐ in a pod: ai1's Jewel, the person attacking ai1 — only the person draws and takes it; ai2 and ai3 untouched", () => {
    const s = table({ active: "user", pod: true, boards: { ai1: [on("ai1", "jewel", JEWEL)], user: [on("user", "bears", BEARS)] } });
    const { s: out } = combat(s, { attacks: { bears: "ai1" } });
    expect({ at: jewelAt(out), hands: ["user", "ai1", "ai2", "ai3"].map((p) => out.players[p].hand.length) }).toEqual({ at: "user", hands: [3, 0, 0, 0] });
  });
  it("control (pod): the person attacks ai2 — ai1's Jewel doesn't care", () => {
    const s = table({ active: "user", pod: true, boards: { ai1: [on("ai1", "jewel", JEWEL)], user: [on("user", "bears", BEARS)] } });
    const { s: out } = combat(s, { attacks: { bears: "ai2" } });
    expect({ at: jewelAt(out), hand: out.players.user.hand.length }).toEqual({ at: "ai1", hand: 0 });
  });
});
