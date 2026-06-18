/**
 * Tests for triggers.js + the N-seat APNAP flushTriggers (Phase-7 PR-5).
 *
 * PR-5 ships detection + matching + effect application + the APNAP ordering
 * generalization. Nothing is enqueued by a real game yet (PR-6..8 wire the
 * hooks), so these exercise the pieces in isolation.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  detectTriggers,
  hasTriggerFor,
  triggersForEvent,
  checkInterveningIf,
  applyTriggerEffect,
} from "./triggers.js";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function makeDeck(n, p = "C") {
  return Array.from({ length: n }, (_, i) => ({ id: `card-${p}-${i}`, name: `${p} ${i}` }));
}
function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function perm(card, controller = "user", id = "perm-x") {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {} };
}

describe("detectTriggers", () => {
  it("detects a self ETB draw trigger", () => {
    const t = detectTriggers(creature("Elvish Visionary", "When Elvish Visionary enters, draw a card."));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "etb", scope: "self", effect: { kind: "draw", amount: 1 } });
  });

  it("detects an 'another creature enters' watcher (Soul Warden style)", () => {
    const t = detectTriggers(creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life."));
    expect(t[0]).toMatchObject({ event: "etb", scope: "eachOtherCreature", effect: { kind: "gainLife", amount: 1 } });
  });

  it("detects a dies drain (Blood Artist style)", () => {
    const t = detectTriggers(creature("Bummer", "Whenever a creature dies, each opponent loses 1 life."));
    expect(t[0]).toMatchObject({ event: "dies", scope: "eachCreature", effect: { kind: "loseLife", who: "eachOpponent", amount: 1 } });
  });

  it("detects an upkeep draw gated to 'your' upkeep", () => {
    const t = detectTriggers(creature("Howler", "At the beginning of your upkeep, draw a card."));
    expect(t[0]).toMatchObject({ event: "upkeep", scope: "you", whose: "yours", effect: { kind: "draw" } });
    expect(hasTriggerFor(t[0] && creature("Howler", "At the beginning of your upkeep, draw a card."), "upkeep")).toBe(true);
  });

  it("does NOT treat 'enters tapped' as a trigger (CR 603.6d static guard)", () => {
    expect(detectTriggers(creature("Tapland", "Tapland enters tapped."))).toHaveLength(0);
  });

  it("extracts an intervening-if clause", () => {
    const t = detectTriggers(creature("Felidar", "At the beginning of your upkeep, if you have 40 or more life, draw a card."));
    expect(t[0].interveningIf).toMatch(/40 or more life/);
    expect(t[0].effect).toMatchObject({ kind: "draw" });
  });

  it("returns effect:null for an out-of-vocabulary effect (fail-safe, never fabricated)", () => {
    const t = detectTriggers(creature("Weird", "When Weird enters, surveil 2 then proliferate."));
    expect(t).toHaveLength(1);
    expect(t[0].effect).toBeNull();
  });

  it("ignores a mid-sentence 'when' (anchored matching)", () => {
    expect(detectTriggers(creature("Vanilla", "This creature gets +1/+0 when it would matter."))).toHaveLength(0);
  });
});

describe("classifyCondition — block-trigger compound/restricted guard (CREED: only a BARE self-block is modeled)", () => {
  const blocks = (oracle) => detectTriggers(creature("X", oracle)).some((t) => t.event === "blocks");
  it("detects a BARE self-block trigger (the one modeled form stays native)", () => {
    expect(blocks("Whenever this creature blocks, it gets +1/+1 until end of turn.")).toBe(true);
  });
  it("does NOT detect a 'blocks or becomes blocked …' compound (Serra Inquisitors / Raging Gorilla) — 2nd event + restriction dropped would mis-fire", () => {
    expect(blocks("Whenever this creature blocks or becomes blocked by one or more black creatures, it gets +2/+2 until end of turn.")).toBe(false);
    expect(blocks("Whenever this creature blocks or becomes blocked, it gets +2/-2 until end of turn.")).toBe(false);
  });
  it("does NOT detect a RESTRICTED block (Snarespinner / Skystinger — 'blocks a creature with flying') — the engine can't enforce the restriction", () => {
    expect(blocks("Whenever this creature blocks a creature with flying, this creature gets +1/+1 until end of turn.")).toBe(false);
    expect(blocks("Whenever this creature blocks a Dragon, draw a card.")).toBe(false);
  });
});

// ===== COMPOUND self-event + LTB guard (CREED) ===== Surfaced by the TOK-2 named-token slice: once
// "create a Food/Treasure token" became a modeled trigger EFFECT, compound conditions ("enters or
// leaves", "enters or dies", "dies and when you discard this card") and "leaves the battlefield"
// (which the engine never fires) would have flipped cards to native while DROPPING half the trigger.
describe("classifyCondition — compound self-event + LTB guard (CREED)", () => {
  const events = (oracle) => detectTriggers(creature("X", oracle)).map((t) => t.event);
  it("detects each SINGLE self event (the modeled forms stay native)", () => {
    expect(events("When this creature enters, create a Food token.")).toEqual(["etb"]);
    expect(events("When this creature dies, create a Food token.")).toEqual(["dies"]);
  });
  it("does NOT detect 'enters or leaves the battlefield' (Brandywine Farmer) — the LTB half would be dropped", () => {
    expect(detectTriggers(creature("Brandywine Farmer", "When this creature enters or leaves the battlefield, create a Food token."))).toHaveLength(0);
  });
  it("does NOT detect 'enters or dies' (Vinereap Mentor) — the dies half would be dropped", () => {
    expect(detectTriggers(creature("Vinereap Mentor", "When this creature enters or dies, create a Food token."))).toHaveLength(0);
  });
  it("does NOT detect a 'dies and when you discard this card' embedded second trigger (Bartered Cow)", () => {
    expect(detectTriggers(creature("Bartered Cow", "When this creature dies and when you discard this card, create a Food token."))).toHaveLength(0);
  });
  it("does NOT detect a 'leaves the battlefield' trigger (City Pigeon) — the engine never fires LTB", () => {
    expect(detectTriggers(creature("City Pigeon", "When this creature leaves the battlefield, create a Food token."))).toHaveLength(0);
  });
});

describe("triggersForEvent", () => {
  const visionary = creature("Elvish Visionary", "When Elvish Visionary enters, draw a card.");
  const warden = creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life.");
  const state = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };

  it("fires a self trigger for the source's own event", () => {
    const src = perm(visionary, "user", "perm-1");
    const fired = triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: src });
    expect(fired).toHaveLength(1);
    expect(fired[0].payload.resolver).toBe("trigger.effect");
    expect(fired[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });

  it("does NOT fire a self trigger for another permanent's event", () => {
    const src = perm(visionary, "user", "perm-1");
    const other = perm(creature("Bear", ""), "user", "perm-2");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: other })).toHaveLength(0);
  });

  it("fires an other-creature watcher when a DIFFERENT creature enters, not itself", () => {
    const src = perm(warden, "user", "perm-1");
    const other = perm(creature("Bear", ""), "ai", "perm-2");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: other })).toHaveLength(1);
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: src })).toHaveLength(0);
  });

  it("gates a 'your upkeep' trigger to the active player", () => {
    const howler = creature("Howler", "At the beginning of your upkeep, draw a card.");
    const mine = perm(howler, "user", "perm-1");
    const theirs = perm(howler, "ai", "perm-2");
    expect(triggersForEvent(state, { event: "upkeep", sourcePermanent: mine })).toHaveLength(1); // user is active
    expect(triggersForEvent(state, { event: "upkeep", sourcePermanent: theirs })).toHaveLength(0); // ai not active
  });
});

describe("checkInterveningIf", () => {
  const state = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };
  const trig = (cond) => ({ controller: "user", descriptor: { interveningIf: cond } });

  it("passes when no condition", () => {
    expect(checkInterveningIf(state, trig(null))).toBe(true);
  });
  it("evaluates a life threshold", () => {
    expect(checkInterveningIf(state, trig("you have 40 or more life"))).toBe(true);  // user at 40
    expect(checkInterveningIf(state, trig("you have 50 or more life"))).toBe(false);
  });
  it("fails open on an unknown condition (never fabricates a 'doesn't fire')", () => {
    expect(checkInterveningIf(state, trig("the planar die shows chaos"))).toBe(true);
  });
});

describe("applyTriggerEffect", () => {
  it("gainLife adds life to the controller", () => {
    const s = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };
    const out = applyTriggerEffect(s, { effect: { kind: "gainLife", amount: 3, who: "controller" }, controller: "user" });
    expect(out.players.user.life).toBe(43);
  });
  it("loseLife (eachOpponent) drains every opponent", () => {
    const s = { ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), activePlayer: "user" };
    const out = applyTriggerEffect(s, { effect: { kind: "loseLife", amount: 2, who: "eachOpponent" }, controller: "user" });
    expect(out.players.ai1.life).toBe(38);
    expect(out.players.ai2.life).toBe(38);
    expect(out.players.ai3.life).toBe(38);
    expect(out.players.user.life).toBe(40);
  });
  it("draw draws for the controller", () => {
    const s = { ...createGameState({ userDeck: makeDeck(3, "U"), aiDeck: [] }), activePlayer: "user" };
    const out = applyTriggerEffect(s, { effect: { kind: "draw", amount: 2, who: "controller" }, controller: "user" });
    expect(out.players.user.hand).toHaveLength(2);
  });
  it("a null effect is a safe no-op", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(applyTriggerEffect(s, { effect: null, controller: "user" })).toBe(s);
  });
});

describe("flushTriggers — N-seat APNAP (CR 603.3b)", () => {
  it("orders triggers active-player-first across a 4-seat pod, FIFO within a seat", () => {
    const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const state = {
      ...base,
      activePlayer: "ai1",
      pendingTriggers: [
        { id: "t-ai2", controller: "ai2", source: { name: "x" }, payload: {} },
        { id: "t-user", controller: "user", source: { name: "y" }, payload: {} },
        { id: "t-ai1", controller: "ai1", source: { name: "z" }, payload: {} },
      ],
    };
    const out = flushTriggers(state);
    // turnOrder [user,ai1,ai2,ai3]; rotate to active ai1 -> [ai1,ai2,ai3,user]
    expect(out.stack.map(s => s.id)).toEqual(["t-ai1", "t-ai2", "t-user"]);
    expect(out.pendingTriggers).toEqual([]);
  });

  it("mints a deterministic stack id for a trigger without one and carries its payload", () => {
    const state = {
      ...createGameState({ userDeck: [], aiDeck: [] }),
      activePlayer: "user",
      pendingTriggers: [
        { controller: "user", source: { name: "x" }, payload: { resolver: "trigger.effect", params: { effect: { kind: "draw", amount: 1 } } } },
      ],
    };
    const out = flushTriggers(state);
    expect(out.stack[0].id).toBe("stk-1");
    expect(out.idSeq).toBe(1);
    expect(out.stack[0].payload.resolver).toBe("trigger.effect");
  });
});
