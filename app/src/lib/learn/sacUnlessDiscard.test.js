/**
 * sacUnlessDiscard.test.js — SAC-UNLESS-DISCARD: "sacrifice this creature unless you discard a card".
 * Masticore, Razormane Masticore, Coral Net (via the quoted-grant path — the Aura gives the enchanted
 * creature the Masticore trigger verbatim).
 *
 * ⭐ SEVENTEENTH "BUILT ENGINE, PARTIAL IGNITION": the sac-unless-pay machine — the pausing atom, the
 * pending choice, the settle, the auto-pick — existed whole, for MANA costs. The cost object already
 * carried a `kind` discriminator, so the discard cost is a second arm on each side of an existing seam,
 * not a machine.
 *
 * ⛔⛔ THE AUTO-PICK ARM IS THE LOAD-BEARING ONE, and the bug it prevents is vicious: without it a discard
 * cost fell through to `canAfford(pool, sources, {})` — TRUE for an empty mana cost — so the auto-pick said
 * "pay", the settle's mana-only arm could not pay, and the Masticore DIED WITH A FULL HAND. An auto-pick
 * and a settle that disagree about payability is the cast lane's offer/payment split, one layer down.
 *
 * ⭐ The discard is a REAL discard: hand → graveyard through moveCardToZone, then checkDiscardTriggers so
 * madness/discard watchers see it (CR 701.9a). The wiring-completeness tripwire in discardTrigger.test.js
 * fired on the new site exactly as designed — its count moved 12 → 13 with `unwired` still empty.
 *
 * Mutation-checked (2026-08-07, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the discard arm removed from the MATCHER -> all three park.
 *   · the discard arm removed from the AUTO-PICK only -> the full-hand Masticore SACRIFICES ITSELF — the
 *     disagreement bug above, live. The tier cannot see it; only the runtime row can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-07).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { autoPickSacUnlessPay, resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MASTICORE = { id: "c-ma", name: "Masticore", type: "Artifact Creature — Masticore", mana: "{4}", power: "4", toughness: "4",
  oracle: "At the beginning of your upkeep, sacrifice this creature unless you discard a card.\n{2}: This creature deals 1 damage to target creature.\n{2}: Regenerate this creature." };
const RAZORMANE = { id: "c-rz", name: "Razormane Masticore", type: "Artifact Creature — Masticore", mana: "{5}", power: "5", toughness: "5",
  oracle: "First strike\nAt the beginning of your upkeep, sacrifice this creature unless you discard a card.\nAt the beginning of your draw step, you may have this creature deal 3 damage to target creature." };

describe("the carriers", () => {
  it("⭐ the Masticores flip native", () => {
    for (const c of [MASTICORE, RAZORMANE]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the matcher — discard kind, and the incumbents byte-identical", () => {
    const p = (c) => matchUpkeepSacUnlessPay(c)?.atom || null;
    const row = {
      discard: p("Sacrifice this creature unless you discard a card."),
      mana: p("Sacrifice this creature unless you pay {2}."),
      twoCards: p("Sacrifice this creature unless you discard two cards."),   // no carrier → parked
    };
    console.log("  WITNESS sacUnlessDiscardParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.discard).toEqual({ op: "sac-unless-pay", cost: { kind: "discard", count: 1 }, targetType: null });
    expect(row.mana?.cost?.kind).toBe("mana");
    expect(row.twoCards).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — both outcomes of the choice, run to completion", () => {
  function pausedState(hand) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "MASTI", controller: "user", summoningSick: false, card: MASTICORE });
    return { ...s, phase: "upkeep", step: "upkeep", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, hand, battlefield: [perm] } },
      pendingChoice: { kind: "sac-unless-pay", controller: "user", cost: { kind: "discard", count: 1 },
        sourceId: "MASTI", sourceName: "Masticore" } };
  }
  const held = () => [{ id: "h1", name: "Held Card", type: "Instant", oracle: "" }];

  it("⭐⭐ full hand: auto-pick says PAY, the settle discards, the Masticore LIVES", () => {
    const s = pausedState(held());
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      masticoreAlive: after.players.user.battlefield.some((p) => p.id === "MASTI"),
      handAfter: after.players.user.hand.length,
      cardInGraveyard: after.players.user.graveyard.some((c) => c.id === "h1"),
    };
    console.log("  WITNESS masticorePays", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ masticoreAlive: true, handAfter: 0, cardInGraveyard: true });
  });

  it("⭐⭐ EMPTY hand: auto-pick says CANNOT PAY, the settle sacrifices", () => {
    const s = pausedState([]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, false);
    const row = { masticoreAlive: after.players.user.battlefield.some((p) => p.id === "MASTI") };
    console.log("  WITNESS masticoreSacrifices", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ masticoreAlive: false });
  });

  it("⛔ the DISAGREEMENT guard: pay chosen with an empty hand still sacrifices (never a free keep)", () => {
    // The settle's own hand check is the second half of the auto-pick fix — a stale "pay" answer against an
    // emptied hand must not keep the creature for free.
    const s = pausedState([]);
    const after = resolveSacUnlessPayChoice(s, true);
    expect(after.players.user.battlefield.some((p) => p.id === "MASTI")).toBe(false);
  });
});
