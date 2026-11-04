/**
 * scourgeOfTheThrone.test.js — SCOURGE OF THE THRONE (the play-weighted program, EDHREC #1281):
 *
 *   "Whenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for
 *    most life, untap all attacking creatures. After this phase, there is an additional combat phase."
 *
 * The first attack each turn (CR 603.2 — the once-per-turn latch, keyed per source permanent and event, set as the attack
 * happens whether or not the condition holds: "for the first time each turn" is a fact about the attack, so an earlier attack
 * at another player uses it up). The intervening "if" (CR 603.4) is checked as the creature attacks and again as the ability
 * resolves — the bundled ruling: "It must be attacking the player with the most life or tied with the most life both when it's
 * declared as an attacker and as it starts to resolve" — and it compares the attacked player's life with every player's, the
 * attacking player's included (dethrone's comparison, CR 702.105a). A planeswalker attack is not an attack on a player (CR
 * 508.3e). "Untap all attacking creatures" is the attacking-only mass untap (CR 506.3), "after this phase, there is an
 * additional combat phase" the extra-combat atom (CR 500.8). Witnessed through real game states.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, passPriority } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SCOURGE = {"name":"Scourge of the Throne","type":"Creature — Dragon","mana":"{4}{R}{R}","oracle":"Flying\nDethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nWhenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase.","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying","Dethrone"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1281
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const RELENTLESS = {"name":"Relentless Assault","type":"Sorcery","mana":"{2}{R}{R}","oracle":"Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1566
const NOURISH = {"name":"Nourish","type":"Instant","mana":"{G}{G}","oracle":"You gain 6 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #26334
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const KARLACH = {"name":"Karlach, Fury of Avernus","type":"Legendary Creature — Tiefling Barbarian","mana":"{4}{R}","oracle":"Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures. They gain first strike until end of turn. After this phase, there is an additional combat phase.\nChoose a Background (You can have a Background as a second commander.)","layout":"normal","cmc":5,"power":"5","toughness":"4","loyalty":null,"keywords":["Choose a background"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1058
const NEHEB = {"name":"Neheb, the Eternal","type":"Legendary Creature — Zombie Minotaur Warrior","mana":"{3}{R}{R}","oracle":"Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)\nAt the beginning of each of your postcombat main phases, add {R} for each 1 life your opponents have lost this turn.","layout":"normal","cmc":5,"power":"4","toughness":"6","loyalty":null,"keywords":["Afflict"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1195
const GIDEON = {"name":"Gideon Jura","type":"Legendary Planeswalker — Gideon","mana":"{3}{W}{W}","oracle":"+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if able.\n−2: Destroy target tapped creature.\n0: Until end of turn, Gideon Jura becomes a 6/6 Human Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":"6","keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11304

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...over });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i}`, card, controller));
const lib = (p) => Array.from({ length: 12 }, (_, i) => ({ ...FOREST, id: `${p}-lib-${i}` }));

/** A four-seat pod on `seat`'s turn 5, precombat main; `life` per seat, `board` per seat, `hand` for the seat. */
function pod({ seat = "user", life = {}, board = {}, hand = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, life: life[pid] ?? 40, battlefield: board[pid] || [], hand: pid === seat ? hand.map((c, i) => ({ ...c, id: `h${i}` })) : [], library: lib(pid), graveyard: [] };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const permOf = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id);

/**
 * Pass through the rest of `seat`'s turn. In the k-th declare attackers step `seat` declares each attacker of `attacks[k]`
 * (`{ permanentId: defender }`; a defender "pw:<id>" attacks that planeswalker). In each main phase after the first, `onMain(s, n)`
 * may act once (n counts the main phases from 1). Once the k-th combat reaches its declare blockers step, the tapped state of
 * every permanent of `watch` is recorded. With `respond(s, k)`, the seat acts once in the k-th declare attackers step, after the
 * declaration has closed and while the attack triggers are on the stack.
 */
function walkTurn(s0, { seat = "user", attacks = [], watch = [], onMain = null, respond = null } = {}) {
  let s = s0;
  const combats = [];
  let prev = null;
  let mains = 0;
  let mainActed = new Set();
  let responded = new Set();
  for (let g = 0; g < 800 && s.turn === s0.turn; g++) {
    const here = `${s.phase}/${s.step}`;
    if (here !== prev) {
      if (s.step === "declare-attackers") combats.push({ declared: new Set(), tapped: null });
      if (s.step === "main") mains++;
      if (s.step === "declare-blockers" && combats.length) combats.at(-1).tapped = Object.fromEntries(watch.map((id) => [id, permOf(s, id)?.tapped ?? null]));
    }
    prev = here;
    const k = combats.length - 1;
    if (s.step === "declare-attackers" && s.priorityHolder === seat && attacks[k]) {
      const c = combats[k];
      const next = Object.entries(attacks[k]).find(([id]) => !c.declared.has(id));
      if (next) {
        const [id, def] = next;
        const a = offered(s, seat, "declare-attacker").find((x) => x.permanentId === id && (def.startsWith("pw:") ? x.defenderPlaneswalkerId === def.slice(3) : x.defenderId === def && !x.defenderPlaneswalkerId));
        c.declared.add(id);
        if (a) { s = dispatchAction(s, a); continue; }
      }
    }
    if (respond && s.step === "declare-attackers" && !responded.has(k) && s.stack.length && s.priorityHolder === seat) {
      responded.add(k);
      s = respond(s, k);
      continue;
    }
    if (onMain && s.step === "main" && mains > 1 && !mainActed.has(mains) && s.stack.length === 0 && s.priorityHolder === seat) {
      mainActed.add(mains);
      s = onMain(s, mains);
      continue;
    }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  return { state: s, combats: combats.map((c) => ({ tapped: c.tapped })) };
}
const lifeOf = (s) => Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, p.life]));
const counters = (s, id) => permOf(s, id)?.counters?.["+1/+1"] ?? 0;

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(SCOURGE)).toBe("native-trigger");
  });
  it("control: Karlach's first-combat gate is unchanged", () => {
    expect(classifyCard(KARLACH)).toBe("native-trigger");
  });
});

describe("attacking the player tied for the most life", () => {
  it("⭐ the attackers untap and there is one additional combat — the second attack doesn't trigger again (the first time each turn)", () => {
    const s = pod({ life: { user: 40, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user"), P("gb", BEARS, "user")] } });
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai1", gb: "ai1" }, { sc: "ai1", gb: "ai1" }], watch: ["sc", "gb"] });
    // Combat 1: dethrone (ai1 tied at 40) — 6 + 2 to ai1 (32); the untap. Combat 2: ai1 (32) is behind the user (40) — no dethrone,
    // and the Scourge's ability is spent: 6 + 2 more (24), and no third combat.
    expect({ combats, life: lifeOf(state), counters: counters(state, "sc") }).toEqual({
      combats: [{ tapped: { sc: false, gb: false } }, { tapped: { sc: true, gb: true } }],
      life: { user: 40, ai1: 24, ai2: 30, ai3: 20 }, counters: 1,
    });
  });
  it("⭐ the clear leader: Scourge alone attacks ai2 on 50 — it untaps, attacks again in the additional combat", () => {
    const s = pod({ life: { user: 40, ai1: 40, ai2: 50, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user")] } });
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai2" }, { sc: "ai2" }], watch: ["sc"] });
    // 50 − 6 = 44 (still the most: dethrone again in combat 2 — a second counter), − 7 = 37.
    expect({ combats, life: lifeOf(state), counters: counters(state, "sc") }).toEqual({
      combats: [{ tapped: { sc: false } }, { tapped: { sc: true } }],
      life: { user: 40, ai1: 40, ai2: 37, ai3: 20 }, counters: 2,
    });
  });
  it("⭐ with Neheb, the Eternal: the additional combat comes straight after the first, so there is ONE postcombat main phase — Neheb adds {R} once, for all 12 life ai1 lost", () => {
    const s = pod({ life: { user: 40, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user"), P("neheb", NEHEB, "user")] } });
    const mains = [];
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai1" }, { sc: "ai1" }], watch: ["sc"], onMain: (st, n) => { mains.push({ n, step: st.phase, R: st.players.user.manaPool.R }); return st; } });
    // Combat 1: dethrone (tied) — 6; combat 2: ai1 (34) behind the person — 6 more. Then the postcombat main: Neheb, once.
    expect({ combats: combats.length, ai1: state.players.ai1.life, mains }).toEqual({ combats: 2, ai1: 28, mains: [{ n: 2, step: "postcombat-main", R: 12 }] });
  });
  it("⭐ untap ALL attacking creatures, and only attacking ones: the attacking Bears untap, the Elves tapped for mana stay tapped", () => {
    const s = pod({ life: { user: 30, ai1: 40, ai2: 30, ai3: 30 }, board: { user: [P("sc", SCOURGE, "user"), P("gb", BEARS, "user"), P("el", ELVES, "user", { tapped: true })] } });
    const { combats } = walkTurn(s, { attacks: [{ sc: "ai1", gb: "ai1" }], watch: ["sc", "gb", "el"] });
    expect(combats[0].tapped).toEqual({ sc: false, gb: false, el: true });
  });
  it("⭐ the AI's Scourge attacking the person, who has the most life: the same untap and additional combat", () => {
    const s = pod({ seat: "ai1", life: { user: 40, ai1: 30, ai2: 30, ai3: 30 }, board: { ai1: [P("sc", SCOURGE, "ai1")] } });
    const { state, combats } = walkTurn(s, { seat: "ai1", attacks: [{ sc: "user" }, { sc: "user" }], watch: ["sc"] });
    // The person (40, then 34) leads both times: dethrone twice — 6, then 7.
    expect({ combats: combats.length, untapped: combats[0].tapped, life: state.players.user.life, counters: counters(state, "sc") }).toEqual({ combats: 2, untapped: { sc: false }, life: 27, counters: 2 });
  });
});

describe("controls — no untap, no additional combat", () => {
  it("control: attacking a player behind the leader — no dethrone, no untap, one combat", () => {
    const s = pod({ life: { user: 40, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user"), P("gb", BEARS, "user")] } });
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai2", gb: "ai2" }, { sc: "ai2", gb: "ai2" }], watch: ["sc", "gb"] });
    expect({ combats, life: lifeOf(state), counters: counters(state, "sc") }).toEqual({
      combats: [{ tapped: { sc: true, gb: true } }], life: { user: 40, ai1: 40, ai2: 23, ai3: 20 }, counters: 0,
    });
  });
  it("control: the attacking player alone holds the most life — the attacked player isn't on the throne", () => {
    const s = pod({ life: { user: 45, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user")] } });
    const { combats } = walkTurn(s, { attacks: [{ sc: "ai1" }, { sc: "ai1" }], watch: ["sc"] });
    expect(combats).toEqual([{ tapped: { sc: true } }]);
  });
  it("control (the first time each turn): Scourge first attacks ai2 (behind), then in Relentless Assault's combat attacks the leader — its ability doesn't trigger, no third combat", () => {
    const s = pod({ life: { user: 30, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user"), ...lands("mt", MOUNTAIN, 4, "user")] }, hand: [RELENTLESS] });
    const cast = (st) => dispatchAction(st, offered(st, "user", "cast-spell").find((a) => a.name === "Relentless Assault"));
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai2" }, { sc: "ai1" }, { sc: "ai1" }], watch: ["sc"], onMain: (st, n) => (n === 2 ? cast(st) : st) });
    // Combat 1 at ai2 (30, behind ai1): nothing. Combat 2 (Relentless Assault's) at ai1 (40, the leader): dethrone, and nothing more.
    expect({ combats, life: lifeOf(state), counters: counters(state, "sc") }).toEqual({
      combats: [{ tapped: { sc: true } }, { tapped: { sc: true } }], life: { user: 30, ai1: 34, ai2: 25, ai3: 20 }, counters: 1,
    });
  });
  it("control (CR 603.4, the second check): the person gains 6 life in response — ai1 is no longer tied, nothing untaps, one combat", () => {
    const s = pod({ life: { user: 40, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user"), ...lands("fo", FOREST, 2, "user")] }, hand: [NOURISH] });
    const respond = (st) => dispatchAction(st, offered(st, "user", "cast-spell").find((a) => a.name === "Nourish"));
    const { state, combats } = walkTurn(s, { attacks: [{ sc: "ai1" }, { sc: "ai1" }], watch: ["sc"], respond });
    expect({ combats, user: state.players.user.life }).toEqual({ combats: [{ tapped: { sc: true } }], user: 46 });
  });
  it("control: attacking a planeswalker is not attacking a player — no untap, one combat", () => {
    const s = pod({ life: { user: 30, ai1: 40, ai2: 30, ai3: 20 }, board: { user: [P("sc", SCOURGE, "user")], ai1: [P("gid", GIDEON, "ai1", { counters: { loyalty: 6 } })] } });
    const { combats } = walkTurn(s, { attacks: [{ sc: "pw:gid" }, { sc: "pw:gid" }], watch: ["sc"] });
    expect(combats).toEqual([{ tapped: { sc: true } }]);
  });
});
