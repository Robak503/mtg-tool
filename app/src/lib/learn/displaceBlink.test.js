/**
 * displaceBlink.test.js — UP-TO-TWO BLINK (2026-08-12 — Displace; Illusionist's Stratagem rode along).
 * "Exile up to two target creatures you control, then return those cards to the battlefield under their
 * owner's control."
 *
 * ⭐ TWO SMALL PIECES: the multi-target parser arm (applyBlink already iterates ctx.targets) and the
 * splitClauses KEEP-WHOLE guard widened to the up-to-two form. The guard is the load-bearing half —
 * split at ", then", the first half ("exile up to two target creatures you control") parses HIGH alone
 * and describes a card that EXILES two creatures and NEVER RETURNS THEM: the non-fail-safe direction
 * the guard's own comment documents for the single form.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the keep-whole guard reverted to single-only -> Displace parks (the split severs the return).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DISPLACE = { id: "c-di", name: "Displace", type: "Instant", mana: "{2}{U}",
  oracle: "Exile up to two target creatures you control, then return those cards to the battlefield under their owner's control." };

describe("the carrier and the shape", () => {
  it("⭐ Displace flips; the clause parses WHOLE as one blink atom with the up-to-two bound", () => {
    expect(classifyCard(DISPLACE)).toMatch(/^native/);
    const p = parseEffectClause(DISPLACE.oracle, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "blink", maxTargets: 2, minTargets: 0, returnTo: "owner" });
  });
});

describe("⭐⭐ LAW 6 — both targets leave and COME BACK", () => {
  it("⭐⭐ two creatures blinked: both return to the battlefield (fresh ids, ETBs re-fire territory)", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id) => createPermanent({ id, controller: "user", summoningSick: false,
      card: { id: "card-" + id, name: "Bear " + id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [mk("A"), mk("B")] } } };
    const atom = parseEffectClause(DISPLACE.oracle, "Instant").atoms[0];
    const after = ATOM_RESOLVERS.blink(s, atom, { controller: "user", targets: [{ type: "creature", id: "A" }, { type: "creature", id: "B" }] });
    const names = after.players.user.battlefield.map((p) => p.card?.name).sort();
    console.log("  WITNESS displaceBoth", JSON.stringify({ battlefield: names, exile: (after.players.user.exile || []).length })); // vitest 4 needs --disable-console-intercept
    expect(names).toEqual(["Bear A", "Bear B"]); // both came back — never the exile-no-return half-card
  });
});
