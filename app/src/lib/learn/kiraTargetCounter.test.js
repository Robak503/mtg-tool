/**
 * kiraTargetCounter.test.js — KIRA, GREAT GLASS-SPINNER (a HARD-counter group-ward analogue).
 *
 * Kira grants every creature you control "Whenever this creature becomes the target of a spell or ability
 * for the first time each turn, counter that spell or ability." Three pieces are pinned here:
 *  (1) CLASSIFIER — the card flips native-trigger; the residue (Flying) is honored keyword-only; CREED
 *      near-misses (a subtype-restricted grant, the opponent-restricted Diffusion grant, a pay-rider) stay
 *      NON-native.
 *  (2) RUNTIME — a spell/ability targeting a Kira-protected creature the FIRST time each turn is countered
 *      outright (no pay). No opponent restriction: even the controller's OWN spell is countered. The SECOND
 *      targeting that turn resolves. No Kira source → no counter.
 *  (3) GATE RESET — resetBecameTargetThisTurnAllPlayers clears the per-turn flag for every seat.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState,
  createPermanent,
  findPermanent,
  resetBecameTargetThisTurnAllPlayers,
  _resetIdsForTests,
} from "./gameState.js";
import { publicCard, lookupCard } from "../server/cardIndex.js";
import { classifyCard } from "./coverage.js";
import { hasKiraGrant, isNativeKira, applyKiraTargetCounter } from "./kiraTargetCounter.js";
import { isKeywordOnly } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const KIRA_ORACLE =
  'Flying\nCreatures you control have "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability."';

// ─── (1) CLASSIFIER ─────────────────────────────────────────────────────────────

describe("KIRA — classifier", () => {
  it("the real Kira, Great Glass-Spinner classifies native-trigger", () => {
    const c = publicCard(lookupCard("Kira, Great Glass-Spinner"));
    expect(c.oracle).toContain("becomes the target of a spell or ability for the first time each turn");
    expect(classifyCard(c)).toBe("native-trigger");
  });

  it("hasKiraGrant matches the canonical sentence (reminder-tolerant)", () => {
    expect(hasKiraGrant({ oracle: KIRA_ORACLE })).toBe(true);
    expect(
      hasKiraGrant({
        oracle:
          'Creatures you control have "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability." (Reminder here.)',
      }),
    ).toBe(true);
  });

  it("isNativeKira honors Flying as keyword-only residue", () => {
    expect(isNativeKira({ oracle: KIRA_ORACLE, name: "Kira, Great Glass-Spinner" }, isKeywordOnly)).toBe(true);
  });

  it("CREED near-miss: a SUBTYPE-restricted grant is NOT this card (safe FN)", () => {
    // "Sliver creatures you control have …" — a narrower, different grant. Not matched.
    expect(
      hasKiraGrant({
        oracle:
          'Sliver creatures you control have "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability."',
      }),
    ).toBe(false);
  });

  it("CREED near-miss: the OPPONENT-restricted / pay-rider Diffusion grant is NOT Kira (that's groupWard)", () => {
    expect(
      hasKiraGrant({
        oracle:
          'Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.',
      }),
    ).toBe(false);
  });

  it("CREED near-miss: an unmodeled extra clause leaves residue → NOT native", () => {
    // Kira grant + an unmodeled "At the beginning of your upkeep, draw a card." rider.
    const oracle = KIRA_ORACLE + "\nAt the beginning of your upkeep, draw a card.";
    expect(isNativeKira({ oracle, name: "Faux Kira" }, isKeywordOnly)).toBe(false);
  });
});

// ─── (2) RUNTIME — cast integration ─────────────────────────────────────────────

// A Kira source + a protected creature, both controlled by `controller`.
function kiraBoard(controller) {
  const kira = createPermanent({
    card: { id: "kira-c", name: "Kira, Great Glass-Spinner", power: 2, toughness: 2, type_line: "Creature — Spirit", oracle: KIRA_ORACLE },
    controller,
  });
  const bear = createPermanent({
    card: { id: "bear-c", name: "Grizzly Bears", power: 2, toughness: 2, type_line: "Creature — Bear", oracle: "" },
    controller,
  });
  return { kira, bear };
}

// A base state with `user` active, holding a Doom Blade + one black mana.
function stateWithRemoval(userBattlefield, aiBattlefield) {
  const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [removal], manaPool: { ...s.players.user.manaPool, B: 5 }, battlefield: userBattlefield },
      ai: { ...s.players.ai, battlefield: aiBattlefield },
    },
  };
}

function castRemovalAt(state, targetId) {
  const cast = legalActionsForPlayer(state, "user").find(
    (a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === targetId),
  );
  expect(cast).toBeTruthy();
  return dispatchAction(state, cast);
}

describe("KIRA — runtime hard counter (first targeting each turn)", () => {
  it("an OPPONENT's removal targeting a Kira-protected creature is countered outright (no pay)", () => {
    const { kira, bear } = kiraBoard("ai");
    const s = stateWithRemoval([], [kira, bear]);
    const out = castRemovalAt(s, bear.id);
    // Countered → the spell is off the stack (no soft-counter pending, no pay).
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(false);
    expect(out.pendingChoice).toBeFalsy();
    // The targeted creature is marked as having become a target this turn.
    expect(findPermanent(out, bear.id).permanent.becameTargetThisTurn).toBe(true);
    // Counter is logged with the kira via-tag.
    expect(out.log.some((e) => e.effect === "counter" && e.via === "kira")).toBe(true);
  });

  it("NO opponent restriction: the controller's OWN spell targeting their OWN Kira creature is countered too", () => {
    const { kira, bear } = kiraBoard("user"); // user controls Kira AND casts the removal
    const s = stateWithRemoval([kira, bear], []);
    const out = castRemovalAt(s, bear.id);
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(false);
    expect(out.log.some((e) => e.effect === "counter" && e.via === "kira")).toBe(true);
  });

  it("SECOND targeting that turn resolves (the counter is 'the first time each turn' only)", () => {
    const { kira, bear } = kiraBoard("ai");
    // Bear already became a target this turn.
    const marked = { ...bear, becameTargetThisTurn: true };
    const s = stateWithRemoval([], [kira, marked]);
    const out = castRemovalAt(s, bear.id);
    // NOT countered → the spell sits on the stack.
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(true);
    expect(out.log.some((e) => e.effect === "counter" && e.via === "kira")).toBe(false);
  });

  it("NO Kira source in play → the spell resolves normally (no counter)", () => {
    const bear = createPermanent({
      card: { id: "bear-c", name: "Grizzly Bears", power: 2, toughness: 2, type_line: "Creature — Bear", oracle: "" },
      controller: "ai",
    });
    const s = stateWithRemoval([], [bear]);
    const out = castRemovalAt(s, bear.id);
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(true);
    expect(out.log.some((e) => e.via === "kira")).toBe(false);
  });

  it("targeting a NON-creature (a Kira controller's land) is not affected — Kira grants only to creatures", () => {
    // applyKiraTargetCounter unit: a spell targeting only a non-creature permanent → no counter, no mark.
    const { kira } = kiraBoard("ai");
    const land = createPermanent({ card: { id: "land-c", name: "Forest", type_line: "Basic Land — Forest", oracle: "" }, controller: "ai" });
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [kira, land] } } };
    const stackObj = { id: "stk-x", kind: "spell", controller: "user", targets: [{ type: "permanent", id: land.id }] };
    const out = applyKiraTargetCounter(st, stackObj);
    expect(out).toBe(st); // no-op (no targeted creature)
  });
});

// ─── (3) GATE RESET ─────────────────────────────────────────────────────────────

describe("KIRA — the first-time-each-turn gate resets each turn", () => {
  it("resetBecameTargetThisTurnAllPlayers clears the flag for EVERY seat's battlefield", () => {
    const a = createPermanent({ card: { id: "a-c", name: "A", type_line: "Creature", oracle: "" }, controller: "user" });
    const b = createPermanent({ card: { id: "b-c", name: "B", type_line: "Creature", oracle: "" }, controller: "ai" });
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [{ ...a, becameTargetThisTurn: true }] },
        ai: { ...s.players.ai, battlefield: [{ ...b, becameTargetThisTurn: true }] },
      },
    };
    const out = resetBecameTargetThisTurnAllPlayers(st);
    expect(findPermanent(out, a.id).permanent.becameTargetThisTurn).toBe(false);
    expect(findPermanent(out, b.id).permanent.becameTargetThisTurn).toBe(false);
  });
});
