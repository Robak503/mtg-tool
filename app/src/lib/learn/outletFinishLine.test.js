/**
 * outletFinishLine.test.js — E7.2: the token loop's finishes that are not combat.
 *
 * Colton, 2026-10-03: the Squirrel Girl list also wins through its sacrifice outlets — Altar of Dementia, Blasting
 * Station, Altar of the Brood. "Enough" is lethal by ANY route on the battlefield, and the AI takes that route.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-03). The Squirrel is the token the
 * engine mints for her ability. Stack objects are made by the engine: the offered activation is dispatched and resolved.
 * The driver cases run learnSession.advanceUntilDecision on a real session with the AI's own picks.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { createGame } from "./gameApi.js";
import { advanceUntilDecision } from "./learnSession.js";
import { tokenLoopState } from "./tokenLoopLine.js";
import { OUTLET_BOARD_CAP, fodderOf, isMillOutletAbility, isShotOutletAbility, outletFinishAction, outletSources, outletState } from "./outletFinishLine.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DEMENTIA = {"name":"Altar of Dementia","type":"Artifact","mana":"{2}","cmc":2,"keywords":["Mill"],"colors":[],"colorIdentity":[],"oracle":"Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power."};
const STATION = {"name":"Blasting Station","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}, Sacrifice a creature: This artifact deals 1 damage to any target.\nWhenever a creature enters, you may untap this artifact."};
const BROOD = {"name":"Altar of the Brood","type":"Artifact","mana":"{1}","cmc":1,"keywords":["Mill"],"colors":[],"colorIdentity":[],"oracle":"Whenever another permanent you control enters, each opponent mills a card."};
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":["I LOVE Squirrels!"],"colors":["G"],"colorIdentity":["G"],"oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control."};
const RITE = {"name":"Cryptolith Rite","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Creatures you control have \"{T}: Add one mana of any color.\""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const BOMBARDMENT = {"name":"Goblin Bombardment","type":"Enchantment","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Sacrifice a creature: This enchantment deals 1 damage to any target."};
const ASHNOD = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"Sacrifice a creature: Add {C}{C}."};
const SEER = {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Scry"],"colors":["B"],"colorIdentity":["B"],"oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)"};
const BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"colorIdentity":[],"oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target."};
// The token the engine mints for her ability (effects/atoms/tokens.js builds exactly this card); a Treasure for the non-creature case.
const SQUIRREL = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this token: Add one mana of any color.", keywords: [], token: true, colors: [] };

const perm = (card, id, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: false }), ...extra });
const squirrels = (n, extra = {}, prefix = "sq") => Array.from({ length: n }, (_, i) => perm(SQUIRREL, `${prefix}${String(i).padStart(3, "0")}`, "user", extra));
const cards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-lib${i}`, ...BEARS }));

/** A four-seat pod on the user's precombat main with a full mana pool. `life` and `library` are per opposing seat. */
function pod({ user = [], life = {}, library = {}, activePlayer = "user", stack = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    players[seat] = { ...g.players[seat], battlefield: seat === "user" ? user : [], life: life[seat] ?? 40, library: cards(library[seat] ?? 30, seat),
      manaPool: { ...g.players[seat].manaPool, G: 40, C: 10 } };
  }
  return { ...g, players, phase: "precombat-main", step: "main", activePlayer, priorityHolder: "user", turn: 6, consecutivePasses: 0, stack, pendingTriggers: [] };
}
const SG = () => perm(SQUIRREL_GIRL, "sg");
const outletOffers = (state, name) => legalActionsForPlayer(state, "user").filter((a) => a.kind === "activate-ability" && a.name === name);
/** Activate Squirrel Girl's ability and resolve it: the engine makes the tokens and puts their enter-triggers on the stack. */
function loopOnce(state) {
  const action = legalActionsForPlayer(state, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sg");
  return { ...resolveTopOfStack(dispatchAction(state, action)), priorityHolder: "user" };
}
const abilities = (card) => parseActivatedAbilities(card);

// ─── which abilities are outlets ─────────────────────────────────────────────────────────────────────────────────────

describe("which ability is an outlet", () => {
  it("Altar of Dementia is a mill outlet; Blasting Station and Goblin Bombardment are shot outlets", () => {
    expect(abilities(DEMENTIA).map((a) => [isMillOutletAbility(a), isShotOutletAbility(a)])).toEqual([[true, false]]);
    expect(abilities(STATION).map((a) => [isMillOutletAbility(a), isShotOutletAbility(a)])).toEqual([[false, true]]);
    expect(abilities(BOMBARDMENT).map((a) => [isMillOutletAbility(a), isShotOutletAbility(a)])).toEqual([[false, true]]);
  });

  it("a sacrifice for mana, for a scry, or a counter-removal shot is neither", () => {
    for (const card of [ASHNOD, SEER, BALLISTA, SQUIRREL_GIRL, RITE]) {
      expect(abilities(card).some((a) => isMillOutletAbility(a) || isShotOutletAbility(a))).toBe(false);
    }
    expect(isMillOutletAbility(null)).toBe(false);
    expect(isShotOutletAbility(undefined)).toBe(false);
  });

  it("SYNTHETIC — a shot that costs mana, a mill by a fixed number, and a mill that taps are not outlets", () => {
    const one = (oracle) => abilities({ name: "Probe", type: "Artifact", oracle })[0];
    expect(isShotOutletAbility(one("{1}, Sacrifice a creature: This artifact deals 1 damage to any target."))).toBe(false);
    expect(isShotOutletAbility(one("Sacrifice another creature: This artifact deals 1 damage to any target."))).toBe(false);
    expect(isShotOutletAbility(one("Sacrifice a creature: This artifact deals 1 damage to target creature."))).toBe(false);
    expect(isMillOutletAbility(one("Sacrifice a creature: Target player mills two cards."))).toBe(false);
    expect(isMillOutletAbility(one("{T}, Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power."))).toBe(false);
  });

  it("outletSources reads the battlefield: mills, shots (tap state included) and passive mills; tokens are never a source", () => {
    const state = pod({ user: [SG(), perm(DEMENTIA, "dementia"), perm(STATION, "station", "user", { tapped: true }), perm(BOMBARDMENT, "bomb"), perm(BROOD, "brood"),
      perm({ ...DEMENTIA, token: true }, "copy"), ...squirrels(2)] });
    expect(outletSources(state, "user")).toEqual({
      mills: [{ permanentId: "dementia", abilityIndex: 0 }],
      shots: [{ permanentId: "station", tapped: true, abilityIndex: 0, tapSelf: true, amount: 1 }, { permanentId: "bomb", tapped: false, abilityIndex: 0, tapSelf: false, amount: 1 }],
      entersMill: ["brood"],
    });
    expect(outletSources(pod({ user: [SG(), ...squirrels(3)] }), "user")).toEqual({ mills: [], shots: [], entersMill: [] });
  });

  it("only token CREATURES are fed to an outlet", () => {
    const state = pod({ user: [SG(), perm(BEARS, "bear"), perm(TREASURE, "treasure"), ...squirrels(2)] });
    expect(fodderOf(state, "user")).toEqual([{ id: "sq000", power: 1 }, { id: "sq001", power: 1 }]);
  });
});

// ─── the routes ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe("outletState — the mill route (Altar of Dementia)", () => {
  const board = (n, library) => pod({ user: [SG(), perm(DEMENTIA, "dementia"), ...squirrels(n)], library });

  it("no outlet, or no opponent left: no line", () => {
    expect(outletState(pod({ user: [SG(), ...squirrels(9)] }), "user")).toBe(null);
    expect(outletState(pod({ user: [SG(), perm(DEMENTIA, "dementia")], life: { ai1: 0, ai2: 0, ai3: 0 } }), "user")).toBe(null);
  });

  it("one power short of every library: not live, and the loop is asked for more", () => {
    const o = outletState(board(11, { ai1: 3, ai2: 4, ai3: 5 }), "user");
    expect({ live: o.mill.live, complete: o.complete, wantsMore: o.wantsMore, done: o.done }).toEqual({ live: false, complete: false, wantsMore: true, done: false });
  });

  it("exactly enough: live, aimed at the biggest library, the loop asked for no more", () => {
    const o = outletState(board(12, { ai1: 3, ai2: 5, ai3: 4 }), "user");
    expect(o.mill).toEqual({ live: true, outlet: { permanentId: "dementia", abilityIndex: 0 }, target: "ai2", victim: "sq000" });
    expect({ complete: o.complete, wantsMore: o.wantsMore }).toEqual({ complete: true, wantsMore: false });
  });

  it("the biggest token goes first, and its whole power is counted", () => {
    const big = perm({ ...SQUIRREL, power: 5, toughness: 5 }, "big");
    const o = outletState(pod({ user: [SG(), perm(DEMENTIA, "dementia"), big, ...squirrels(2)], library: { ai1: 1, ai2: 5, ai3: 1 } }), "user");
    expect({ live: o.mill.live, victim: o.mill.victim, target: o.mill.target }).toEqual({ live: true, victim: "big", target: "ai2" });
    // one card more in any library and the three tokens no longer cover them
    expect(outletState(pod({ user: [SG(), perm(DEMENTIA, "dementia"), big, ...squirrels(2)], library: { ai1: 2, ai2: 5, ai3: 1 } }), "user").mill.live).toBe(false);
    // a 0-power token mills nothing and is never counted
    const zero = perm({ ...SQUIRREL, power: 0 }, "zero");
    expect(outletState(pod({ user: [SG(), perm(DEMENTIA, "dementia"), zero], library: { ai1: 1, ai2: 0, ai3: 0 } }), "user").mill.live).toBe(false);
  });

  it("a dead opponent's library is nobody's business; empty libraries all round is done", () => {
    expect(outletState(board(3, { ai1: 3, ai2: 30, ai3: 30 }), "user").mill.live).toBe(false);
    const twoDead = pod({ user: [SG(), perm(DEMENTIA, "dementia"), ...squirrels(3)], library: { ai1: 3, ai2: 30, ai3: 30 }, life: { ai2: 0, ai3: 0 } });
    expect(outletState(twoDead, "user").mill.live).toBe(true);
    const o = outletState(board(3, { ai1: 0, ai2: 0, ai3: 0 }), "user");
    expect({ done: o.done, complete: o.complete, live: o.mill.live, wantsMore: o.wantsMore }).toEqual({ done: true, complete: true, live: false, wantsMore: false });
  });

  it("a mill already on the stack counts: the next one is aimed at what is LEFT", () => {
    const start = board(9, { ai1: 1, ai2: 1, ai3: 3 });
    const first = outletFinishAction(outletState(start, "user"), legalActionsForPlayer(start, "user"));
    expect({ name: first.name, victim: first.sacCreatureId, target: first.targets[0].id }).toEqual({ name: "Altar of Dementia", victim: "sq000", target: "ai3" });
    const s1 = { ...dispatchAction(start, first), priorityHolder: "user" };
    expect(s1.players.ai3.library).toHaveLength(3); // not resolved yet, but one of the three is spoken for
    const second = outletFinishAction(outletState(s1, "user"), legalActionsForPlayer(s1, "user"));
    expect({ victim: second.sacCreatureId, target: second.targets[0].id }).toEqual({ victim: "sq001", target: "ai3" });
    const s2 = { ...dispatchAction(s1, second), priorityHolder: "user" };
    // ai3 now has one card not spoken for, like the others: ties go by seat
    expect(outletFinishAction(outletState(s2, "user"), legalActionsForPlayer(s2, "user")).targets[0].id).toBe("ai1");
  });

  it("all nine on the stack: complete, nothing more is sacrificed, and the seat passes until they resolve", () => {
    let s = board(12, { ai1: 2, ai2: 3, ai3: 4 });
    for (let i = 0; i < 9; i++) s = { ...dispatchAction(s, outletFinishAction(outletState(s, "user"), legalActionsForPlayer(s, "user"))), priorityHolder: "user" };
    const o = outletState(s, "user");
    expect({ done: o.done, complete: o.complete, pending: o.pending, live: o.mill.live }).toEqual({ done: true, complete: true, pending: true, live: false });
    expect(outletFinishAction(o, legalActionsForPlayer(s, "user"))).toMatchObject({ kind: "pass-priority" });
    expect(fodderOf(s, "user")).toHaveLength(3);
  });
});

describe("outletState — the shot route (Blasting Station, Goblin Bombardment)", () => {
  it("Goblin Bombardment: one shot a token — live when the tokens cover every opponent's life", () => {
    const board = (n) => pod({ user: [SG(), perm(BOMBARDMENT, "bomb"), ...squirrels(n)], life: { ai1: 3, ai2: 2, ai3: 4 } });
    expect(outletState(board(8), "user").shot.live).toBe(false);
    const o = outletState(board(9), "user");
    expect(o.shot).toEqual({ live: true, ready: [{ permanentId: "bomb", tapped: false, abilityIndex: 0, tapSelf: false, amount: 1 }], target: "ai2", victim: "sq000" });
    expect({ complete: o.complete, wantsMore: o.wantsMore }).toEqual({ complete: true, wantsMore: false });
  });

  it("Blasting Station alone is one shot: live only against one point of life", () => {
    const board = (life) => pod({ user: [SG(), perm(STATION, "station"), ...squirrels(9)], life });
    expect(outletState(board({ ai1: 1, ai2: 0, ai3: 0 }), "user").shot.live).toBe(true);
    expect(outletState(board({ ai1: 2, ai2: 0, ai3: 0 }), "user").shot.live).toBe(false);
    const tapped = pod({ user: [SG(), perm(STATION, "station", "user", { tapped: true }), ...squirrels(9)], life: { ai1: 1, ai2: 0, ai3: 0 } });
    expect(outletState(tapped, "user").shot).toMatchObject({ live: false, ready: [] });
  });

  it("each untap trigger waiting on the stack is one more shot", () => {
    // 3 Squirrel tokens and Squirrel Girl (a Squirrel herself) → 4 more enter → 4 untap triggers wait. With the untapped
    // Station: 5 shots.
    const after = loopOnce(pod({ user: [SG(), perm(STATION, "station"), ...squirrels(3)], life: { ai1: 2, ai2: 1, ai3: 2 } }));
    expect(after.stack.filter((o) => o.source?.name === "Blasting Station")).toHaveLength(4);
    expect(outletState(after, "user").shot).toMatchObject({ live: true, target: "ai2" });
    const tooMuch = loopOnce(pod({ user: [SG(), perm(STATION, "station"), ...squirrels(3)], life: { ai1: 3, ai2: 1, ai3: 2 } }));
    expect(outletState(tooMuch, "user")).toMatchObject({ shot: { live: false }, pending: true, wantsMore: true });
  });

  it("shots are limited by the tokens there are to sacrifice", () => {
    const state = pod({ user: [SG(), perm(BOMBARDMENT, "bomb"), perm(STATION, "station"), ...squirrels(2)], life: { ai1: 2, ai2: 1, ai3: 0 } });
    expect(outletState(state, "user").shot.live).toBe(false); // 3 life, 2 tokens
  });

  it("a shot already on the stack counts: the next is aimed at the life that is left", () => {
    const start = pod({ user: [SG(), perm(BOMBARDMENT, "bomb"), ...squirrels(4)], life: { ai1: 1, ai2: 2, ai3: 1 } });
    const first = outletFinishAction(outletState(start, "user"), legalActionsForPlayer(start, "user"));
    expect({ name: first.name, target: first.targets[0].id, victim: first.sacCreatureId }).toEqual({ name: "Goblin Bombardment", target: "ai1", victim: "sq000" });
    const s1 = { ...dispatchAction(start, first), priorityHolder: "user" };
    expect(s1.players.ai1.life).toBe(1); // not resolved yet
    expect(outletFinishAction(outletState(s1, "user"), legalActionsForPlayer(s1, "user")).targets[0].id).toBe("ai3");
  });

  it("the Station fires, then the seat passes while the next untap is on the stack", () => {
    const after = loopOnce(pod({ user: [SG(), perm(STATION, "station"), ...squirrels(3)], life: { ai1: 2, ai2: 1, ai3: 2 } }));
    const shot = outletFinishAction(outletState(after, "user"), legalActionsForPlayer(after, "user"));
    expect({ name: shot.name, target: shot.targets[0].id }).toEqual({ name: "Blasting Station", target: "ai2" });
    const fired = { ...dispatchAction(after, shot), priorityHolder: "user" };
    const o = outletState(fired, "user");
    expect(o.shot).toMatchObject({ live: true, ready: [] }); // tapped; 4 untaps cover the 4 life left
    expect(outletFinishAction(o, legalActionsForPlayer(fired, "user"))).toMatchObject({ kind: "pass-priority" });
  });
});

describe("outletState — the passive mill (Altar of the Brood)", () => {
  it("asks the loop for more until the libraries are empty; the triggers waiting on the stack count", () => {
    const start = pod({ user: [SG(), perm(BROOD, "brood"), ...squirrels(3)], library: { ai1: 3, ai2: 2, ai3: 5 } });
    expect(outletState(start, "user")).toMatchObject({ done: false, complete: false, wantsMore: true, pending: false });
    const after = loopOnce(start); // 4 tokens enter (she is a Squirrel too): 4 triggers, each takes a card from every opponent
    expect(after.stack).toHaveLength(4);
    expect(outletState(after, "user")).toMatchObject({ done: false, wantsMore: true, pending: true }); // ai3 keeps one card
    const enough = loopOnce(pod({ user: [SG(), perm(BROOD, "brood"), ...squirrels(4)], library: { ai1: 3, ai2: 2, ai3: 5 } }));
    const o = outletState(enough, "user");
    expect({ done: o.done, complete: o.complete, wantsMore: o.wantsMore, pending: o.pending }).toEqual({ done: true, complete: true, wantsMore: false, pending: true });
    // complete with its own work on the stack: pass, do nothing else
    expect(outletFinishAction(o, legalActionsForPlayer(enough, "user"))).toMatchObject({ kind: "pass-priority" });
  });

  it("complete with nothing on the stack: no action — the game goes on to the opponents' draws", () => {
    const state = pod({ user: [SG(), perm(BROOD, "brood"), ...squirrels(3)], library: { ai1: 0, ai2: 0, ai3: 0 } });
    expect(outletFinishAction(outletState(state, "user"), legalActionsForPlayer(state, "user"))).toBe(null);
  });
});

describe("outletState — the cap, and no line at all", () => {
  it("past the board cap the routes stop asking for more", () => {
    const under = pod({ user: [SG(), perm(BROOD, "brood"), ...squirrels(OUTLET_BOARD_CAP - 3)], library: { ai1: 900, ai2: 900, ai3: 900 } });
    expect(outletState(under, "user").wantsMore).toBe(true);
    const over = pod({ user: [SG(), perm(BROOD, "brood"), ...squirrels(OUTLET_BOARD_CAP - 2)], library: { ai1: 900, ai2: 900, ai3: 900 } });
    expect(outletState(over, "user").wantsMore).toBe(false);
  });

  it("outletFinishAction: no outlet, or a route that is not complete, is no action", () => {
    expect(outletFinishAction(null, [{ kind: "pass-priority" }])).toBe(null);
    const state = pod({ user: [SG(), perm(DEMENTIA, "dementia"), ...squirrels(2)], library: { ai1: 30, ai2: 30, ai3: 30 } });
    expect(outletFinishAction(outletState(state, "user"), legalActionsForPlayer(state, "user"))).toBe(null);
  });
});

// ─── the loop's hold, and the AI's pick ──────────────────────────────────────────────────────────────────────────────

describe("the loop and the pick", () => {
  // 30 Squirrels against three opponents on 3 life with no creatures: combat a turn from now is covered many times over.
  const wide = (extra, opts = {}) => pod({ user: [SG(), perm(RITE, "rite"), ...extra, ...squirrels(30, { summoningSick: true })], life: { ai1: 3, ai2: 3, ai3: 3 }, ...opts });

  it("no outlet: enough for next turn's attack holds the loop (as before)", () => {
    expect(tokenLoopState(wide([]), "user")).toMatchObject({ holdLoop: true, outlet: null });
  });

  it("an outlet whose route is not complete keeps the loop going past the combat threshold", () => {
    const state = wide([perm(DEMENTIA, "dementia")], { library: { ai1: 30, ai2: 30, ai3: 30 } });
    expect(tokenLoopState(state, "user")).toMatchObject({ holdLoop: false, outlet: { wantsMore: true } });
    const pick = pickAction(state, "user", legalActionsForPlayer(state, "user"));
    expect({ kind: pick.kind, source: pick.permanentId }).toEqual({ kind: "activate-ability", source: "sg" });
  });

  it("an outlet whose route is complete holds the loop, and the pick is the outlet — not the loop, not a land", () => {
    const state = wide([perm(DEMENTIA, "dementia")], { library: { ai1: 10, ai2: 10, ai3: 10 } });
    expect(tokenLoopState(state, "user")).toMatchObject({ holdLoop: true, outlet: { complete: true } });
    const withLand = { ...state, players: { ...state.players, user: { ...state.players.user, hand: [{ id: "h-forest", ...FOREST }] } } };
    const pick = pickAction(withLand, "user", legalActionsForPlayer(withLand, "user"));
    expect({ kind: pick.kind, name: pick.name, target: pick.targets[0].id }).toEqual({ kind: "activate-ability", name: "Altar of Dementia", target: "ai1" });
  });

  it("the outlet is fired with triggers on the stack: the finish does not wait for an empty stack", () => {
    const state = loopOnce(pod({ user: [SG(), perm(RITE, "rite"), perm(BOMBARDMENT, "bomb"), perm(BROOD, "brood"), ...squirrels(5)], life: { ai1: 3, ai2: 3, ai3: 3 } }));
    expect(state.stack.length).toBeGreaterThan(0);
    const pick = pickAction(state, "user", legalActionsForPlayer(state, "user"));
    expect({ kind: pick.kind, name: pick.name }).toEqual({ kind: "activate-ability", name: "Goblin Bombardment" });
  });

  it("UNDER-OFFER (documented): on an opponent's turn the engine offers no activated ability, so the outlet waits", () => {
    const state = wide([perm(BOMBARDMENT, "bomb")], { activePlayer: "ai1" });
    expect(outletOffers(state, "Goblin Bombardment")).toEqual([]);
    expect(pickAction(state, "user", legalActionsForPlayer(state, "user"))).toMatchObject({ kind: "pass-priority" });
  });

  it("a seat with outlets but NO token loop is not touched: the AI does not fire them", () => {
    const state = pod({ user: [perm(BOMBARDMENT, "bomb"), ...squirrels(30)], life: { ai1: 3, ai2: 3, ai3: 3 } });
    expect(tokenLoopState(state, "user")).toBe(null);
    const pick = pickAction(state, "user", legalActionsForPlayer(state, "user"));
    expect(pick?.name === "Goblin Bombardment").toBe(false);
  });
});

// ─── the offer: a face target survives a board full of creatures ─────────────────────────────────────────────────────

describe("\"any target\" beside more than 64 creatures still offers the players", () => {
  it("Blasting Station on a 70-Squirrel board can be aimed at each opponent", () => {
    const state = pod({ user: [SG(), perm(STATION, "station"), ...squirrels(70)] });
    const targets = new Set(outletOffers(state, "Blasting Station").filter((a) => a.sacCreatureId === "sq000").map((a) => `${a.targets[0].type}:${a.targets[0].id}`));
    for (const id of ["user", "ai1", "ai2", "ai3"]) expect(targets.has(`player:${id}`)).toBe(true);
    expect(targets.size).toBeGreaterThan(60); // the cap still holds (64, less the Squirrel being sacrificed)
    expect(targets.size).toBeLessThanOrEqual(64);
  });

  it("at or under the cap the order of the offered targets is unchanged", () => {
    const state = pod({ user: [SG(), perm(STATION, "station"), ...squirrels(5)] });
    const order = outletOffers(state, "Blasting Station").filter((a) => a.sacCreatureId === "sq000").map((a) => a.targets[0].id);
    // creatures in battlefield order (the Squirrel being sacrificed is no target), then the players: NOT players first
    expect(order).toEqual(["sg", "sq001", "sq002", "sq003", "sq004", "user", "ai1", "ai2", "ai3"]);
  });
});

// ─── the driver: real sessions, the AI's own picks ───────────────────────────────────────────────────────────────────

describe("the driver takes the route (real sessions)", () => {
  const deck = (p) => [...Array.from({ length: 30 }, (_, i) => ({ id: `${p}-f-${i}`, ...FOREST })), ...Array.from({ length: 30 }, (_, i) => ({ id: `${p}-b-${i}`, ...BEARS }))];
  /** A two-player session; the active seat controls Squirrel Girl, Cryptolith Rite, six Forests, the outlets and `n` Squirrels. */
  function run({ outlets, n, sick }) {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "outlet" });
    const s = session.state;
    const me = s.activePlayer;
    const other = Object.keys(s.players).find((id) => id !== me);
    const P = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: me, summoningSick: false }), ...extra });
    const battlefield = [P("sg", SQUIRREL_GIRL), P("rite", RITE), ...outlets.map((c, i) => P(`outlet-${i}`, c)),
      ...Array.from({ length: n }, (_, i) => P(`sq-${i}`, SQUIRREL, { summoningSick: sick })), ...Array.from({ length: 6 }, (_, i) => P(`land-${i}`, FOREST))];
    const start = { ...session, state: { ...s, players: { ...s.players, [me]: { ...s.players[me], battlefield } } } };
    const fired = {};
    const recordDecision = (row) => {
      if (row?.seat !== me || row.action?.kind !== "activate-ability") return;
      const key = `t${row.turn} ${row.action.name}`;
      fired[key] = (fired[key] || 0) + 1;
    };
    const { session: out, decision } = advanceUntilDecision(start, { recordDecision, runawayLimits: { stack: 400, battlefield: 500 } });
    const won = out.status === (me === "user" ? "user-wins" : "ai-wins");
    const loser = out.state.players[other];
    return { won, kind: decision.kind, fired, turn: out.state.turn, startLibrary: s.players[other].library.length, startLife: s.players[other].life,
      loserLibrary: loser.library.length, loserLife: loser.life, tokens: out.state.players[me].battlefield.filter((p) => p.card.token).length };
  }

  it("Altar of Dementia: one loop activation, then exactly the opponent's library in sacrifices; they lose to their next draw", () => {
    const r = run({ outlets: [DEMENTIA], n: 30, sick: true });
    expect(r.startLibrary).toBeGreaterThan(31); // 30 Squirrels do not cover it: the loop has to run once
    expect({ won: r.won, kind: r.kind, turn: r.turn }).toEqual({ won: true, kind: "game-over", turn: 2 });
    expect(r.fired).toEqual({ "t1 The Unbeatable Squirrel Girl": 1, "t1 Altar of Dementia": r.startLibrary });
    expect({ library: r.loserLibrary, life: r.loserLife }).toEqual({ library: 0, life: r.startLife }); // decked, not damaged
    expect(r.tokens).toBe(61 - r.startLibrary); // 30 + 31 made, and not one more sacrificed than the library held

    // With enough Squirrels already there, the loop is not run at all.
    const ready = run({ outlets: [DEMENTIA], n: 60, sick: true });
    expect(ready.fired).toEqual({ "t1 Altar of Dementia": ready.startLibrary });
    expect(ready.tokens).toBe(60 - ready.startLibrary);
  });

  it("Blasting Station: the loop is run until the untaps cover the life total, then one shot a point of life — on turn 1", () => {
    const r = run({ outlets: [STATION], n: 12, sick: false });
    expect({ won: r.won, kind: r.kind }).toEqual({ won: true, kind: "game-over" });
    expect(r.fired).toEqual({ "t1 The Unbeatable Squirrel Girl": 2, "t1 Blasting Station": r.startLife });
    expect({ turn: r.turn, life: r.loserLife }).toEqual({ turn: 1, life: 0 });
  });

  it("Altar of the Brood: the loop is the finish — it runs until the library is empty and stops", () => {
    const r = run({ outlets: [BROOD], n: 30, sick: false });
    expect({ won: r.won, kind: r.kind }).toEqual({ won: true, kind: "game-over" });
    expect({ turn: r.turn, library: r.loserLibrary }).toEqual({ turn: 2, library: 0 });
    expect(r.loserLife).toBeGreaterThan(0); // decked on its draw: the Squirrels that attacked did not get it there
    expect(Object.keys(r.fired)).toEqual(["t1 The Unbeatable Squirrel Girl"]);
    // 31 enter (22 cards left), then 62 more: two activations empty the library; a third would be more than enough.
    expect(r.fired["t1 The Unbeatable Squirrel Girl"]).toBe(2);
  });

  it("CONTROL — no outlet: the same board wins by combat, as before", () => {
    const r = run({ outlets: [], n: 30, sick: false });
    expect({ won: r.won, kind: r.kind }).toEqual({ won: true, kind: "game-over" });
    expect(r.loserLife).toBeLessThanOrEqual(0);
    expect(r.loserLibrary).toBeGreaterThan(0);
  });
});

// ─── boundaries ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe("boundaries", () => {
  const big = () => perm({ ...SQUIRREL, power: 5, toughness: 5 }, "big");

  it("a shot spends the SMALLEST token: its power is wasted on a shot", () => {
    const state = pod({ user: [SG(), perm(BOMBARDMENT, "bomb"), big(), ...squirrels(2)], life: { ai1: 1, ai2: 1, ai3: 1 } });
    expect(outletState(state, "user").shot).toMatchObject({ live: true, victim: "sq000" });
  });

  it("a mill on the stack counts for the sacrificed creature's POWER, not for one card", () => {
    const start = pod({ user: [SG(), perm(DEMENTIA, "dementia"), big(), ...squirrels(2)], library: { ai1: 1, ai2: 5, ai3: 1 } });
    const first = outletFinishAction(outletState(start, "user"), legalActionsForPlayer(start, "user"));
    expect({ victim: first.sacCreatureId, target: first.targets[0].id }).toEqual({ victim: "big", target: "ai2" });
    const s1 = { ...dispatchAction(start, first), priorityHolder: "user" };
    // ai2's five cards are all spoken for by the one activation: the next is aimed elsewhere
    expect(outletFinishAction(outletState(s1, "user"), legalActionsForPlayer(s1, "user")).targets[0].id).toBe("ai1");
  });

  it("a shot-only board is not complete just because the libraries are empty", () => {
    const state = pod({ user: [SG(), perm(BOMBARDMENT, "bomb"), ...squirrels(2)], library: { ai1: 0, ai2: 0, ai3: 0 }, life: { ai1: 3, ai2: 3, ai3: 3 } });
    expect(outletState(state, "user")).toMatchObject({ done: true, complete: false, wantsMore: true });
  });

  it("untaps waiting on the stack with the route NOT live: no pass — the seat plays on", () => {
    const waiting = loopOnce(pod({ user: [SG(), perm(STATION, "station"), ...squirrels(3)], life: { ai1: 30, ai2: 30, ai3: 30 } }));
    const o = outletState(waiting, "user");
    expect({ pending: o.pending, complete: o.complete }).toEqual({ pending: true, complete: false });
    expect(outletFinishAction(o, legalActionsForPlayer(waiting, "user"))).toBe(null);
  });

  it("shots before mills when both routes are live", () => {
    const state = pod({ user: [SG(), perm(DEMENTIA, "dementia"), perm(BOMBARDMENT, "bomb"), ...squirrels(9)], life: { ai1: 3, ai2: 3, ai3: 3 }, library: { ai1: 3, ai2: 3, ai3: 3 } });
    const o = outletState(state, "user");
    expect({ shot: o.shot.live, mill: o.mill.live }).toEqual({ shot: true, mill: true });
    expect(outletFinishAction(o, legalActionsForPlayer(state, "user")).name).toBe("Goblin Bombardment");
  });

  it("a complete outlet route holds the loop even when next turn's attack would not be enough", () => {
    // Three Squirrels against 40 life each: nowhere near a combat kill. One card in each library: the Altar covers it.
    const state = pod({ user: [SG(), perm(RITE, "rite"), perm(DEMENTIA, "dementia"), ...squirrels(3, { summoningSick: true })], library: { ai1: 1, ai2: 1, ai3: 1 } });
    expect(tokenLoopState(state, "user")).toMatchObject({ finishNow: false, holdLoop: true, outlet: { complete: true } });
    const without = pod({ user: [SG(), perm(RITE, "rite"), ...squirrels(3, { summoningSick: true })], library: { ai1: 1, ai2: 1, ai3: 1 } });
    expect(tokenLoopState(without, "user")).toMatchObject({ holdLoop: false, outlet: null });
  });

  it("the option cap: 64 candidates keep their order, 65 put the players first", () => {
    const firstTargets = (n) => outletOffers(pod({ user: [SG(), perm(STATION, "station"), ...squirrels(n)] }), "Blasting Station")
      .filter((a) => a.sacCreatureId === "sq000").map((a) => a.targets[0].id);
    // Squirrel Girl + n Squirrels + 4 players = n + 5 candidates (the Squirrel being sacrificed is dropped afterwards)
    const at = firstTargets(59);
    expect({ count: at.length, first: at[0], last: at.at(-1) }).toEqual({ count: 63, first: "sg", last: "ai3" });
    const over = firstTargets(60);
    expect({ count: over.length, firstFour: over.slice(0, 4), fifth: over[4] }).toEqual({ count: 63, firstFour: ["user", "ai1", "ai2", "ai3"], fifth: "sg" });
  });
});
