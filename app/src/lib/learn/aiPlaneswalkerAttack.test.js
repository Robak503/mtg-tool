/**
 * aiPlaneswalkerAttack.test.js — the default AI attacks an opposing planeswalker when removing it is worth more than the face
 * damage the attackers give up (AI decision quality; the engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 508.1b (each attacking creature attacks a player or a planeswalker), CR 306.8 (damage
 * dealt to a planeswalker removes that many loyalty counters), CR 704.5i (a planeswalker with loyalty 0 is put into its
 * owner's graveyard), CR 606.3 (one loyalty ability of a permanent per turn, on its controller's turn — so a walker whose
 * loyalty already covers its ultimate fires it on its controller's next turn), CR 508.1d / 701.15b (a goaded creature
 * attacks a player other than the goader if able; a planeswalker is not a player) and CR 508.1h (an attack tax is a cost
 * to attack, per creature).
 *
 * Before this fix the AI attacked a planeswalker only when the walker's controller had NO untapped creature and the whole
 * swing covered its loyalty — 0 of 6,257 declared attacks in two 80-game A/B batches went at a planeswalker. Evasion,
 * outnumbering the blockers, a second walker, an ultimate due next turn, and a creature the racer held back from the
 * focused player were all invisible to it.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle_cards.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction, pickAttackPlan, POLICY_KEYS } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // EDHREC #3557
const LILIANA = {"name":"Liliana of the Veil","type":"Legendary Planeswalker — Liliana","mana":"{1}{B}{B}","cmc":3,"loyalty":"3","keywords":[],"colors":["B"],"oracle":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice."}; // EDHREC #2988
const AIR_ELEMENTAL = {"name":"Air Elemental","type":"Creature — Elemental","mana":"{3}{U}{U}","cmc":5,"power":"4","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // EDHREC #24441
const WIND_DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // EDHREC #26647
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387
const ONAKKE = {"name":"Onakke Oathkeeper","type":"Creature — Ogre Spirit","mana":"{1}{W}","cmc":2,"power":"0","toughness":"4","keywords":[],"colors":["W"],"oracle":"Creatures can't attack planeswalkers you control unless their controller pays {1} for each creature they control that's attacking a planeswalker you control.\n{4}{W}{W}, Exile this card from your graveyard: Return target planeswalker card from your graveyard to the battlefield."}; // EDHREC #6717
const SHINY = {"name":"Shiny Impetus","type":"Enchantment — Aura","mana":"{2}{R}","cmc":3,"keywords":["Goad","Treasure","Enchant"],"colors":["R"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // EDHREC #1389
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const walker = (id, card, controller, loyalty) => P(id, card, controller, { counters: { loyalty } });
const islands = (n, controller) => Array.from({ length: n }, (_, i) => P(`island${i + 1}`, ISLAND, controller));

/** `seat`'s declare attackers step; `boards` maps seat → permanents, `life` seat → life (default 40). Two players unless `pod`. */
function game({ pod = false, seat = "ai", boards = {}, life = {} }) {
  const s0 = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life: life[pid] ?? 40 };
  }
  return { ...s0, players, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
}

const attacks = (s, seat = "ai") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker");
const where = (a) => (a.defenderPlaneswalkerId ? `${a.defenderId}:${a.defenderPlaneswalkerId}` : a.defenderId);
/** The AI planner's choice for every attacking creature: { permanentId: target }. */
const planOf = (s, seat = "ai", opts = {}) => Object.fromEntries(pickAttackPlan(s, seat, attacks(s, seat), opts).map((a) => [a.permanentId, where(a)]));
/** How many of the planned (or declared) attacks go at each target. */
const tally = (targets) => Object.values(targets).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {});
/** The declaration as the engine's driver takes it: one pickAction per tick, each dispatched, until the AI stops declaring. */
function declareAll(s, seat = "ai") {
  for (let tick = 0; tick < 20; tick++) {
    const offered = legalActionsForPlayer(s, seat);
    if (!offered.some((a) => a.kind === "declare-attacker")) break;
    const pick = pickAction(s, seat, offered);
    if (pick?.kind !== "declare-attacker") break;
    s = dispatchAction(s, pick);
  }
  return s;
}
const declared = (s, seat = "ai") => Object.fromEntries((s.combat?.attackers || []).filter((a) => a.attackingPlayer === seat).map((a) => [a.permanentId, where({ defenderId: a.defender, defenderPlaneswalkerId: a.defenderPlaneswalkerId })]));

describe("the AI attacks a planeswalker it can remove when that is worth more than the face damage", () => {
  it("⭐ a 3-loyalty Jace Beleren its flyer kills unblocked: the Air Elemental goes at Jace, not at a player at 40 behind Grizzly Bears", () => {
    const s = game({ boards: { ai: [P("air", AIR_ELEMENTAL, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ air: "user:jace" });
  });

  it("⭐ outnumbering the blockers: two of three Hill Giants go at Jace (if the Bears chump one, the other kills it), the third at the player", () => {
    const s = game({ boards: { ai: [1, 2, 3].map((n) => P(`giant${n}`, HILL_GIANT, "ai")), user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(tally(planOf(s))).toEqual({ "user:jace": 2, user: 1 });
  });

  it("⭐ the same board through the engine's one-attacker-a-tick declaration: two Giants are declared at Jace, one at the player", () => {
    const s = game({ boards: { ai: [1, 2, 3].map((n) => P(`giant${n}`, HILL_GIANT, "ai")), user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(tally(declared(declareAll(s)))).toEqual({ "user:jace": 2, user: 1 });
  });

  it("⭐ two planeswalkers and two Hill Giants, no blockers: one Giant at each (the old focus sent the whole swing at one)", () => {
    const s = game({ boards: { ai: [P("giant1", HILL_GIANT, "ai"), P("giant2", HILL_GIANT, "ai")], user: [walker("jace", JACE, "user", 3), walker("lili", LILIANA, "user", 3)] } });
    expect(tally(planOf(s))).toEqual({ "user:jace": 1, "user:lili": 1 });
  });

  it("⭐ Commander: a Hill Giant the racer holds back from the focused player (a Craw Wurm would eat it) kills ai2's undefended Jace", () => {
    const s = game({ pod: true, seat: "ai1", life: { user: 10 },
      boards: { ai1: [P("giant", HILL_GIANT, "ai1")], user: [P("wurm", WURM, "user")], ai2: [walker("jace", JACE, "ai2", 3)] } });
    expect(planOf(s, "ai1")).toEqual({ giant: "ai2:jace" });
  });
});

describe("a planeswalker that can fire its ultimate on its controller's next turn", () => {
  it("⭐ Jace Beleren at 10 (−10 next turn) and nothing can kill it: the Wind Drake takes it below 10, the Hill Giant goes face", () => {
    const s = game({ boards: { ai: [P("drake", WIND_DRAKE, "ai"), P("giant", HILL_GIANT, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 10)] } });
    expect(planOf(s)).toEqual({ drake: "user:jace", giant: "user" });
  });

  it("⭐ through the engine: the Drake is declared at Jace and the Giant at the player", () => {
    const s = game({ boards: { ai: [P("drake", WIND_DRAKE, "ai"), P("giant", HILL_GIANT, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 10)] } });
    expect(declared(declareAll(s))).toEqual({ drake: "user:jace", giant: "user" });
  });

  it("control — Jace at 9 (its −10 is two turns away) and nothing can kill it: both go face", () => {
    const s = game({ boards: { ai: [P("drake", WIND_DRAKE, "ai"), P("giant", HILL_GIANT, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 9)] } });
    expect(planOf(s)).toEqual({ drake: "user", giant: "user" });
  });
});

describe("attack taxes (CR 508.1h): the planner counts what each attack at a planeswalker costs", () => {
  it("⭐ Onakke Oathkeeper ({1} per attacker at a planeswalker) and two Islands: both Wind Drakes kill the 3-loyalty Jace", () => {
    const s = game({ boards: { ai: [P("drake1", WIND_DRAKE, "ai"), P("drake2", WIND_DRAKE, "ai"), ...islands(2, "ai")], user: [P("onakke", ONAKKE, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ drake1: "user:jace", drake2: "user:jace" });
  });

  it("⭐ through the engine: both Drakes are declared at Jace and both Islands pay", () => {
    const s = game({ boards: { ai: [P("drake1", WIND_DRAKE, "ai"), P("drake2", WIND_DRAKE, "ai"), ...islands(2, "ai")], user: [P("onakke", ONAKKE, "user"), walker("jace", JACE, "user", 3)] } });
    const after = declareAll(s);
    expect({ declared: declared(after), untappedIslands: after.players.ai.battlefield.filter((p) => p.card.name === "Island" && !p.tapped).length })
      .toEqual({ declared: { drake1: "user:jace", drake2: "user:jace" }, untappedIslands: 0 });
  });

  it("control — one Island funds one taxed attack, and one Drake can't kill Jace: both Drakes go face", () => {
    const s = game({ boards: { ai: [P("drake1", WIND_DRAKE, "ai"), P("drake2", WIND_DRAKE, "ai"), ...islands(1, "ai")], user: [P("onakke", ONAKKE, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ drake1: "user", drake2: "user" });
  });
});

describe("controls — when the face is the right attack", () => {
  it("control — lethal on the player: the Air Elemental goes face (user at 4) even though it would kill Jace", () => {
    const s = game({ life: { user: 4 }, boards: { ai: [P("air", AIR_ELEMENTAL, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ air: "user" });
  });

  it("control — lethal only with every attacker: four Hill Giants at a player on 10 all go face, though one would kill Jace", () => {
    const s = game({ life: { user: 10 }, boards: { ai: [1, 2, 3, 4].map((n) => P(`giant${n}`, HILL_GIANT, "ai")), user: [walker("jace", JACE, "user", 3)] } });
    expect(tally(planOf(s))).toEqual({ user: 4 });
  });

  it("control — lethal on the player with no blockers at all: face", () => {
    const s = game({ life: { user: 3 }, boards: { ai: [P("giant", HILL_GIANT, "ai")], user: [walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ giant: "user" });
  });

  it("control — nothing can kill Jace at 5 and its ultimate is far off: the Hill Giant goes face", () => {
    const s = game({ boards: { ai: [P("giant", HILL_GIANT, "ai")], user: [walker("jace", JACE, "user", 5)] } });
    expect(planOf(s)).toEqual({ giant: "user" });
  });

  it("control — one Hill Giant into Grizzly Bears that can block it: no sure kill, face", () => {
    const s = game({ boards: { ai: [P("giant", HILL_GIANT, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s)).toEqual({ giant: "user" });
  });

  it("control — the face damage given up is worth more: four Craw Wurms into three Bears would all be needed for Jace, so all go face", () => {
    const s = game({ boards: { ai: [1, 2, 3, 4].map((n) => P(`wurm${n}`, WURM, "ai")), user: [...[1, 2, 3].map((n) => P(`bears${n}`, BEARS, "user")), walker("jace", JACE, "user", 3)] } });
    expect(tally(planOf(s))).toEqual({ user: 4 });
  });

  it("control — goaded by ai2 (Shiny Impetus): the Hill Giant attacks a player other than ai2, never ai3's free Jace kill (CR 701.15b)", () => {
    const s = game({ pod: true, seat: "ai1",
      boards: { ai1: [P("giant", HILL_GIANT, "ai1")], ai2: [P("impetus", SHINY, "ai2", { attachedTo: "giant" })], ai3: [walker("jace", JACE, "ai3", 3)] } });
    const plan = planOf(s, "ai1");
    expect(Object.keys(plan)).toEqual(["giant"]);
    expect(["user", "ai3"]).toContain(plan.giant);
  });
});

describe("the policy seam", () => {
  it("⭐ `walker` is a POLICY_KEYS subsystem", () => {
    expect(POLICY_KEYS).toContain("walker");
  });

  it("control — policy walker:'v1' keeps the old clean-kill focus: behind the user's Bears the flyer goes face", () => {
    const s = game({ boards: { ai: [P("air", AIR_ELEMENTAL, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s, "ai", { policy: { walker: "v1" } })).toEqual({ air: "user" });
  });

  it("control — policy walker:'v1' with no blockers sends the whole swing at the highest-loyalty walker", () => {
    const s = game({ boards: { ai: [P("giant1", HILL_GIANT, "ai"), P("giant2", HILL_GIANT, "ai")], user: [walker("jace", JACE, "user", 3), walker("lili", LILIANA, "user", 3)] } });
    expect(tally(planOf(s, "ai", { policy: { walker: "v1" } }))).toEqual({ "user:jace": 2 });
  });
});
