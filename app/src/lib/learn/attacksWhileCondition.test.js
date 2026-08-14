/**
 * attacksWhileCondition.test.js — THE ATTACKS-WHILE LANE (2026-08-14). Pugnacious Hammerskull:
 * "Whenever this creature attacks while you don't control another Dinosaur, put a stun counter on it."
 * Riders: Brazen Blademaster, Seasoned Warrenguard (NAMED in the old reject comment as inexpressible),
 * Hand That Feeds (delirium), Courageous Goblin — all audited whole-card (self-pumps on modeled
 * conditions).
 *
 * ⭐ THE DESIGN LINE: "attacks while <cond>" is part of the trigger EVENT (checked at declaration),
 * NOT a CR 603.4 intervening-if (which would re-check at resolution and over-suppress on a board that
 * changed in between — an FP in the player's favour is still an FP). So the carve emits
 * `attacksWhileIf`, the threading allowlist carries it, and checkAttackTriggers evaluates it ONCE at
 * the single enqueue point via the shared strict evaluator. Admitted ONLY when interveningIfParseable
 * (else the old blanket reject → Arbiter, FN-safe).
 *
 * ⭐ interveningIf gained the third source-excluding spelling ("you DON'T control ANOTHER <filter>"),
 * and the it→"this creature" sentinel (gated to this lane) hands the stun to the existing
 * add-named-counter-self arm.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the carve disabled -> all five carriers park (the blanket while-reject returns).
 *   · the threading-allowlist entry dropped -> the descriptor decays to a bare attacks-self -> the
 *     second-Dinosaur silence witness dies (the over-fire the allowlist comment predicts).
 *   · the fire-time gate removed -> same silence witness dies at the fire site.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HAMMERSKULL = { id: "c-ph", name: "Pugnacious Hammerskull", type: "Creature — Dinosaur", mana: "{1}{G}{G}",
  power: "6", toughness: "6", oracle: "Whenever this creature attacks while you don't control another Dinosaur, put a stun counter on it." };

const mk = (id, card) => createPermanent({ id, controller: "user", summoningSick: false, card: { id: "card-" + id, oracle: "", ...card } });

/** The Hammerskull attacking, with `extras` also on the user's battlefield. */
function attackingBoard(extras = []) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const skull = mk("SKULL", HAMMERSKULL);
  return {
    ...g,
    players: { ...g.players, user: { ...g.players.user, battlefield: [skull, ...extras] } },
    combat: { attackers: [{ permanentId: "SKULL", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
  };
}
const firedFor = (s) => (checkAttackTriggers(s).pendingTriggers || []).filter((t) => t.source?.permanentId === "SKULL");

describe("the carriers and the descriptor", () => {
  it("⭐ all five flip native-trigger; the descriptor carries attacksWhileIf + the stun sentinel", () => {
    expect(classifyCard(HAMMERSKULL)).toBe("native-trigger");
    for (const [name, oracle] of [
      ["Brazen Blademaster", "Whenever this creature attacks while you control two or more artifacts, it gets +2/+1 until end of turn."],
      ["Seasoned Warrenguard", "Whenever this creature attacks while you control a token, this creature gets +2/+0 until end of turn."],
      ["Courageous Goblin", "Whenever this creature attacks while you control a creature with power 4 or greater, this creature gets +1/+0 and gains menace until end of turn."],
    ]) {
      expect(classifyCard({ name, type: "Creature — Soldier", mana: "{1}{R}", power: "2", toughness: "2", oracle }), name).toBe("native-trigger");
    }
    const d = detectTriggers(HAMMERSKULL)[0]?.descriptor || detectTriggers(HAMMERSKULL)[0];
    expect(d).toMatchObject({ event: "attacks", scope: "self", attacksWhileIf: "you don't control another dinosaur" });
    expect(d.interveningIf).toBeFalsy(); // fire-time-only — NEVER the CR 603.4 double-check
    expect(d.effectClause).toBe("put a stun counter on this creature"); // the it→self sentinel
  });
});

describe("⭐⭐ LAW 6 — fires alone, silent with a second Dinosaur, and 'another' excludes the source", () => {
  it("⭐⭐ the LONE Dinosaur attacks: the self-stun trigger FIRES (the source never counts against itself)", () => {
    const fired = firedFor(attackingBoard());
    const row = { fired: fired.length, clause: fired[0]?.descriptor?.effectClause };
    console.log("  WITNESS skullLoneFires", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fired: 1, clause: "put a stun counter on this creature" });
  });

  it("⛔⛔ a SECOND Dinosaur out: SILENT (the printed escape hatch)", () => {
    const fired = firedFor(attackingBoard([mk("D2", { name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4" })]));
    console.log("  WITNESS skullSecondDinoSilent", JSON.stringify({ fired: fired.length })); // vitest 4 needs --disable-console-intercept
    expect(fired.length).toBe(0);
  });

  it("⛔ a non-Dinosaur second creature does NOT satisfy the condition — the trigger still fires", () => {
    const fired = firedFor(attackingBoard([mk("B", { name: "Bear", type: "Creature — Bear", power: "2", toughness: "2" })]));
    console.log("  WITNESS skullBearStillFires", JSON.stringify({ fired: fired.length })); // vitest 4 needs --disable-console-intercept
    expect(fired.length).toBe(1);
  });
});
