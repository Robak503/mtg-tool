/**
 * ghostlyPilferer.test.js — GHOSTLY PILFERER (the play-weighted program, EDHREC #1424):
 *
 *   "Whenever this creature becomes untapped, you may pay {2}. If you do, draw a card.
 *    Whenever an opponent casts a spell from anywhere other than their hand, draw a card.
 *    Discard a card: This creature can't be blocked this turn."
 *
 * The second line was the one unread: the cast watcher's OPPONENT form of Vega's "from anywhere other than your hand" (triggers.js —
 * the same castNotFromHand gate, checkCastTriggers reading the cast action's source zone; whose "opponent", opponentsOf the
 * watcher's controller). Its rulings: the ability resolves before the spell that caused it to trigger, even if that spell is
 * countered; the untap trigger's {2} is paid once at most. The other two lines were already played (the untap event's
 * optional-mana-payment, the "Discard a card" cost).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { autoPickOptionalManaPayment, resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { canBlockAttacker } from "./combatEvasion.js";

beforeEach(() => _resetIdsForTests());

const PILFERER = {"name":"Ghostly Pilferer","type":"Creature — Spirit Rogue","mana":"{1}{U}","oracle":"Whenever this creature becomes untapped, you may pay {2}. If you do, draw a card.\nWhenever an opponent casts a spell from anywhere other than their hand, draw a card.\nDiscard a card: This creature can't be blocked this turn.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1424
const THINK_TWICE = {"name":"Think Twice","type":"Instant","mana":"{1}{U}","oracle":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Flashback"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2199
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","oracle":"","layout":"normal","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #7269
const VEGA = {"name":"Vega, the Watcher","type":"Legendary Creature — Bird Spirit","mana":"{1}{W}{U}","oracle":"Flying\nWhenever you cast a spell from anywhere other than your hand, draw a card.","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":["U","W"],"colorIdentity":["U","W"]}; // EDHREC #2674

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ ...BEARS, id: `lib${i}-${pid}` }));
/** `seat` active with priority in its precombat main. `pod`: a four-seat Commander pod. `commanders`: { seat: card } in the command zone. */
function table({ seat = "user", boards = {}, hands = {}, graves = {}, pools = {}, commanders = {}, pod = false } = {}) {
  const g = pod
    ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] })
    : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = {
      ...players[pid], battlefield: boards[pid] || [], graveyard: graves[pid] || [], exile: [], hand: hands[pid] || [], library: lib(pid),
      manaPool: { ...EMPTY, ...(pools[pid] || {}) },
      command: commanders[pid] ? [{ ...commanders[pid], id: `cmd-${pid}`, isCommander: true }] : [],
      commanderCastCount: {},
    };
  }
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const castAction = (s, seat, cardId, pred = () => true) =>
  offered(legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a)), `casting ${cardId}`);
const handIds = (s, seat) => s.players[seat].hand.map((c) => c.id);
/** Cast, then flush the cast triggers onto the stack (the spell stays below them). */
const castAndFlush = (s, seat, cardId, pred) => flush(dispatchAction(s, castAction(s, seat, cardId, pred)));
const top = (s) => (s.stack || [])[s.stack.length - 1];

describe("the card", () => {
  it("⭐ native: the untap trigger, the opponent's not-from-hand cast watcher and the discard cost", () => {
    expect(isNativeTier(classifyCard(PILFERER))).toBe(true);
    const d = detectTriggers(PILFERER).find((x) => x.event === "cast");
    expect({ whose: d?.whose, castNotFromHand: d?.castNotFromHand, routes: !!d && triggerRoutesNatively(d) }).toEqual({ whose: "opponent", castNotFromHand: true, routes: true });
  });
});

describe("whenever an opponent casts a spell from anywhere other than their hand", () => {
  it("⭐ the AI casts its commander from the command zone — the user's Pilferer triggers above the spell and the user draws lib0-user while Isamaru is still on the stack (its ruling: the ability resolves first)", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "pilf", PILFERER)] }, pools: { ai: { W: 1 } }, commanders: { ai: ISAMARU } });
    const cast = castAndFlush(s0, "ai", "cmd-ai", (a) => a.fromZone === "command");
    expect(top(cast)?.source?.name).toBe("Ghostly Pilferer");
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const drew = resolveTopOfStack(cast);
    expect({ hand: handIds(drew, "user"), stack: drew.stack.map((o) => o.source?.name ?? o.card?.name ?? o.name) }).toEqual({ hand: ["lib0-user"], stack: ["Isamaru, Hound of Konda"] });
    const landed = resolveTopOfStack(drew);
    expect(landed.players.ai.battlefield.some((p) => p.card?.name === "Isamaru, Hound of Konda")).toBe(true);
    expect(handIds(landed, "user")).toEqual(["lib0-user"]);
  });

  it("⭐ the AI casts Think Twice by flashback from its graveyard — the user draws lib0-user", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "pilf", PILFERER)] }, graves: { ai: [{ ...THINK_TWICE, id: "g-think" }] }, pools: { ai: { U: 3 } } });
    const cast = castAndFlush(s0, "ai", "g-think", (a) => a.fromZone === "graveyard");
    expect(top(cast)?.source?.name).toBe("Ghostly Pilferer");
    const drew = resolveTopOfStack(cast);
    expect(handIds(drew, "user")).toEqual(["lib0-user"]);
  });

  it("⭐ the AI's Pilferer: the user casts their commander from the command zone — the AI draws lib0-ai", () => {
    const s0 = table({ seat: "user", boards: { ai: [on("ai", "pilf", PILFERER)] }, pools: { user: { W: 1 } }, commanders: { user: ISAMARU } });
    const cast = castAndFlush(s0, "user", "cmd-user", (a) => a.fromZone === "command");
    expect(top(cast)?.source?.name).toBe("Ghostly Pilferer");
    const drew = resolveTopOfStack(cast);
    expect({ ai: handIds(drew, "ai"), user: handIds(drew, "user") }).toEqual({ ai: ["lib0-ai"], user: [] });
  });

  it("⭐ a pod: ai1 casts Think Twice by flashback, then ai2 casts its commander — two triggers, two cards (lib0-user, lib1-user)", () => {
    const s0 = table({ pod: true, seat: "ai1", boards: { user: [on("user", "pilf", PILFERER)] }, graves: { ai1: [{ ...THINK_TWICE, id: "g-think" }] }, pools: { ai1: { U: 3 }, ai2: { W: 1 } }, commanders: { ai2: ISAMARU } });
    const first = castAndFlush(s0, "ai1", "g-think", (a) => a.fromZone === "graveyard");
    let s = resolveTopOfStack(first);
    expect(handIds(s, "user")).toEqual(["lib0-user"]);
    s = resolveTopOfStack(s); // Think Twice resolves: ai1 draws
    s = { ...s, activePlayer: "ai2", priorityHolder: "ai2", consecutivePasses: 0 };
    const second = castAndFlush(s, "ai2", "cmd-ai2", (a) => a.fromZone === "command");
    expect(top(second)?.source?.name).toBe("Ghostly Pilferer");
    expect(handIds(resolveTopOfStack(second), "user")).toEqual(["lib0-user", "lib1-user"]);
  });

  it("control: the AI casts Lightning Bolt from its hand — no trigger, the user draws nothing", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "pilf", PILFERER)] }, hands: { ai: [{ ...BOLT, id: "h-bolt" }] }, pools: { ai: { R: 1 } } });
    const cast = castAndFlush(s0, "ai", "h-bolt", (a) => a.targets?.[0]?.id === "user");
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell"]);
    expect(handIds(resolveTopOfStack(cast), "user")).toEqual([]);
  });

  it("control: the user's own flashback (the watcher is an opponent's cast only) — no trigger", () => {
    const s0 = table({ seat: "user", boards: { user: [on("user", "pilf", PILFERER)] }, graves: { user: [{ ...THINK_TWICE, id: "g-think" }] }, pools: { user: { U: 3 } } });
    const cast = castAndFlush(s0, "user", "g-think", (a) => a.fromZone === "graveyard");
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell"]);
  });

  it("control: Vega (the \"you\" form) still draws for its controller's own flashback and not for an opponent's", () => {
    const own = table({ seat: "user", boards: { user: [on("user", "vega", VEGA)] }, graves: { user: [{ ...THINK_TWICE, id: "g-think" }] }, pools: { user: { U: 3 } } });
    expect(top(castAndFlush(own, "user", "g-think", (a) => a.fromZone === "graveyard"))?.source?.name).toBe("Vega, the Watcher");
    const theirs = table({ seat: "ai", boards: { user: [on("user", "vega", VEGA)] }, graves: { ai: [{ ...THINK_TWICE, id: "g-think" }] }, pools: { ai: { U: 3 } } });
    expect(castAndFlush(theirs, "ai", "g-think", (a) => a.fromZone === "graveyard").stack.map((o) => o.kind)).toEqual(["spell"]);
  });
});

describe("whenever this creature becomes untapped, you may pay {2}", () => {
  /** The AI's turn ends with `seat`'s Pilferer and two Islands tapped; step to `seat`'s upkeep, where the untap trigger has resolved to its payment question. */
  function untapInto(seat) {
    const other = seat === "user" ? "ai" : "user";
    let s = { ...table({ seat: other, boards: { [seat]: [on(seat, "pilf", PILFERER, { tapped: true }), on(seat, "isl1", ISLAND, { tapped: true }), on(seat, "isl2", ISLAND, { tapped: true })] } }), phase: "ending", step: "cleanup" };
    for (let i = 0; i < 6 && !s.pendingChoice; i++) {
      s = flush(nextStep(s));
      while ((s.stack || []).length && !s.pendingChoice) s = flush(resolveTopOfStack(s));
    }
    expect({ kind: s.pendingChoice?.kind, controller: s.pendingChoice?.controller, active: s.activePlayer }).toEqual({ kind: "optional-mana-payment", controller: seat, active: seat });
    return s;
  }
  it("⭐ the person pays {2}: both Islands tap and the user draws lib0-user", () => {
    const s = untapInto("user");
    const paid = resolveOptionalManaPaymentChoice(s, true);
    expect({ hand: handIds(paid, "user"), tapped: paid.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort() }).toEqual({ hand: ["lib0-user"], tapped: ["isl1", "isl2"] });
  });
  it("⭐ the person declines: nothing is tapped and nothing is drawn", () => {
    const s = untapInto("user");
    const declined = resolveOptionalManaPaymentChoice(s, false);
    expect({ hand: handIds(declined, "user"), tapped: declined.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id) }).toEqual({ hand: [], tapped: [] });
  });
  it("⭐ the default AI pays when it can: the AI draws lib0-ai", () => {
    const s = untapInto("ai");
    const pick = autoPickOptionalManaPayment(s, s.pendingChoice);
    expect(pick).toBe(true);
    expect(handIds(resolveOptionalManaPaymentChoice(s, pick), "ai")).toEqual(["lib0-ai"]);
  });
});

describe("Discard a card: this creature can't be blocked this turn", () => {
  it("⭐ the person chooses which card to discard (one offer per card name), and the AI's Bears can't block the Pilferer after it resolves", () => {
    const s0 = table({ seat: "user", boards: { user: [on("user", "pilf", PILFERER)], ai: [on("ai", "bears", BEARS)] }, hands: { user: [{ ...BOLT, id: "h-bolt" }, { ...HILL_GIANT, id: "h-giant" }] } });
    const acts = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "pilf");
    expect(acts.map((a) => a.discardCardId).sort()).toEqual(["h-bolt", "h-giant"]);
    const done = flush(resolveTopOfStack(dispatchAction(s0, acts.find((a) => a.discardCardId === "h-giant"))));
    expect({ hand: handIds(done, "user"), grave: done.players.user.graveyard.map((c) => c.id) }).toEqual({ hand: ["h-bolt"], grave: ["h-giant"] });
    const attacking = { ...done, phase: "combat", step: "declare-blockers", activePlayer: "user", priorityHolder: "ai", combat: { attackers: [{ permanentId: "pilf", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(canBlockAttacker(attacking, "bears", "pilf", "ai")).toBe(false);
    expect(canBlockAttacker({ ...s0, phase: "combat", step: "declare-blockers", priorityHolder: "ai", combat: attacking.combat }, "bears", "pilf", "ai")).toBe(true); // before the activation it could
  });
});
