/**
 * exhaustKeyword.test.js — EXHAUST (CR 702.180a): "Exhaust — {cost}: <effect>. (Activate each exhaust
 * ability only once.)" Pacesetter Paragon, Greenbelt Guardian, Skystreak Engineer, Rough Rhino Cavalry,
 * Prowcatcher Specialist, Rebellious Captives, Hazard of the Dunes, Stampeding Scurryfoot, Keen Buccaneer,
 * Camera Launcher.
 *
 * ⭐ BUILT ENGINE, NO IGNITION — structurally identical to POWER-UP, which shipped the hard part. Exhaust is
 * an ability WORD (CR 207.2c) with no rules meaning of its own; the whole restriction is a once-per-GAME
 * activation limit, and `activationLimitScope:"game"` already exists, is already read by the offer gate, and
 * is already stamped by the dispatcher. The only missing piece was the label.
 *
 * ⛔⛔ STRIPPING THE LABEL WITHOUT THE LIMIT IS THE FORBIDDEN DIRECTION, and it is why this arm carries a
 * scope instead of just deleting a prefix. The default ONCE-1 ledger is SELF-EXPIRING by design — "a record
 * from an earlier turn counts as ZERO uses" — so reusing it would re-arm every exhaust ability at the start
 * of every turn: one free activation per turn, forever, on 39 carriers. **An engine strictly more permissive
 * than the card.** The turn-boundary pin below is the one that catches it, and a per-turn scope passes every
 * other assertion in this file.
 *
 * ⓘ THE LIMIT IS PER ABILITY, NOT PER CARD. Greenbelt Guardian carries a plain "{G}: target creature gains
 * trample" alongside its exhaust ability; the plain one keeps `activationLimit: null` and stays repeatable.
 * Pinned, because a card-level flag would have been the easy wrong shape.
 *
 * ⓘ 39 carriers print exhaust; 10 flip. The rest park on their EFFECTS (Sabotage Strategist, Jeong Jeong,
 * Winter, Cursed Rider and friends) — the keyword is no longer what holds them back.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * scope dropped to per-turn -> the witness shows the ability offered again on the next turn; the limit
 * dropped entirely -> it is offered again immediately.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PARAGON = { id: "c-pp", name: "Pacesetter Paragon", type: "Creature — Human Pilot", mana: "{2}{R}",
  power: "2", toughness: "2",
  oracle: "Exhaust — {2}{R}: Put a +1/+1 counter on this creature. It gains double strike until end of turn. (Activate each exhaust ability only once.)" };
const GUARDIAN = { id: "c-gg", name: "Greenbelt Guardian", type: "Creature — Elf Ranger", mana: "{1}{G}",
  power: "1", toughness: "2",
  oracle: "{G}: Target creature gains trample until end of turn.\nExhaust — {3}{G}: Put three +1/+1 counters on this creature. (Activate each exhaust ability only once.)" };

describe("the label parses, and the limit rides the shipped ledger", () => {
  it("⭐ an exhaust ability carries a GAME-scoped limit of 1", () => {
    const abs = parseActivatedAbilities(PARAGON);
    expect(abs).toHaveLength(1);
    expect(abs[0]).toMatchObject({ activationLimit: 1, activationLimitScope: "game" });
  });

  it("⛔⛔ THE LIMIT IS PER ABILITY — the plain ability beside it stays repeatable", () => {
    const abs = parseActivatedAbilities(GUARDIAN);
    expect(abs).toHaveLength(2);
    const plain = abs.find((a) => !a.activationLimit);
    const exhaust = abs.find((a) => a.activationLimit === 1);
    expect(plain).toBeTruthy();
    expect(plain.activationLimitScope).toBeUndefined();
    expect(exhaust.activationLimitScope).toBe("game");
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(PARAGON)).toBe("native-activated");
    expect(classifyCard(GUARDIAN)).toBe("native-activated");
  });
});

describe("⭐⭐ LAW 6 — offered ONCE, and NOT re-armed by a new turn", () => {
  function board({ ledger = {}, turn = 1 } = {}) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "pp", card: PARAGON, controller: "user", summoningSick: false });
    return { ...g, turn, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      activatedOncePerTurn: ledger,
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm],
        manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 3 } } } };
  }
  // ⚠️ THE ACTION KIND IS `activate-ability`, NOT `activate` — my first cut filtered on the wrong string and
  // the witness printed `fresh: 0`, which is indistinguishable from "the gate refuses it". Harness before
  // fix, again: an empty offer list means nothing until you have seen a NON-empty one from the same query.
  const offers = (s) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "activate-ability" && a.permanentId === "pp");

  it("⭐⭐ available at first, gone after one use, and STILL gone next turn", () => {
    const fresh = offers(board());
    const key = fresh[0]?.oncePerTurnKey;
    const usedSameTurn = offers(board({ ledger: { [key]: { turn: 1, n: 1 } }, turn: 1 }));
    // ⭐ THE LOAD-BEARING ROW: turn 5, with the use recorded on turn 1. A per-turn ledger reads that record
    // as expired and re-offers the ability — one free activation every turn, forever.
    const usedNextTurn = offers(board({ ledger: { [key]: { turn: 1, n: 1 } }, turn: 5 }));
    const row = { fresh: fresh.length, hasLedgerKey: !!key, afterUseSameTurn: usedSameTurn.length, laterTurn: usedNextTurn.length };
    console.log("  WITNESS exhaust", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fresh: 1, hasLedgerKey: true, afterUseSameTurn: 0, laterTurn: 0 });
  });
});
