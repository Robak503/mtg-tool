/**
 * ghostlyFlickerBlink.test.js — GHOSTLY FLICKER (2026-08-14). "Exile two target artifacts, creatures,
 * and/or lands you control, then return those cards to the battlefield under your control."
 *
 * ⭐ THREE SMALL PIECES on the Displace rails: the blink3M parser arm (exact-two + the triple union),
 * the `artifactCreatureOrLandYouControl` enumeration in spellEffects (own-side, the BW-1 triple-union
 * precedent), and the splitClauses keep-whole guard widened to the union form — split at ", then" the
 * leading half exiles two permanents and NEVER RETURNS THEM.
 *
 * ⛔ EXACT-TWO IS THE CREED LINE: minTargets 2 = maxTargets 2 (CR 601.2c, the untap-exact-lands
 * discipline). One legal permanent ⇒ the spell is UNCASTABLE — never a half-cast that exiles your
 * only blocker and returns it alone as if the card said "up to two".
 *
 * ⛔ THE UNION IS AN ALLOWLIST, not "any permanent": an enchantment is NEVER offered. Witnessed.
 *
 * Whole-card audit: the card is this one sentence — nothing parked, nothing riding.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · blink3M arm disabled -> Ghostly Flicker parks (arbiter-spell); Displace unaffected.
 *   · minTargets 2 -> 0 on the arm -> the one-legal-target board becomes castable (⛔ witness fails).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FLICKER = { id: "c-gf", name: "Ghostly Flicker", type: "Instant", mana: "{2}{U}",
  oracle: "Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control." };

const mk = (id, card) => createPermanent({ id, controller: "user", summoningSick: false, card: { id: "card-" + id, oracle: "", ...card } });
const board = (perms) => {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: perms } } };
};

describe("the carrier and the shape", () => {
  it("⭐ Ghostly Flicker flips; one whole blink atom, exact-two, returns under YOUR control", () => {
    expect(classifyCard(FLICKER)).toMatch(/^native/);
    const p = parseEffectClause(FLICKER.oracle, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "blink", targetType: "artifactCreatureOrLandYouControl", maxTargets: 2, minTargets: 2, returnTo: "controller" });
  });
});

describe("⭐⭐ LAW 6 — the union pool and the exact-two bound", () => {
  const program = parseEffectClause(FLICKER.oracle, "Instant");

  it("⭐⭐ artifact+creature+land are the pool; the ENCHANTMENT is never offered; every choice is exactly 2", () => {
    const s = board([
      mk("A", { name: "Mind Stone", type: "Artifact" }),
      mk("C", { name: "Mulldrifter", type: "Creature — Elemental", power: "2", toughness: "2" }),
      mk("L", { name: "Island", type: "Basic Land — Island" }),
      mk("E", { name: "Rhystic Study", type: "Enchantment" }),
    ]);
    const choices = expandCastChoices(s, "user", program, [], {});
    const sizes = new Set(choices.map((c) => (c.targets || []).length));
    const idsUsed = new Set(choices.flatMap((c) => (c.targets || []).map((t) => t.id)));
    console.log("  WITNESS flickerPool", JSON.stringify({ choices: choices.length, sizes: [...sizes], enchantmentOffered: idsUsed.has("E") })); // vitest 4 needs --disable-console-intercept
    expect(choices.length).toBe(3);          // C(3,2) — the union pool is exactly {A, C, L}
    expect([...sizes]).toEqual([2]);         // exact-two: no 0- or 1-target cast exists
    expect(idsUsed.has("E")).toBe(false);    // an enchantment is NEVER a legal Flicker target
  });

  it("⛔⛔ ONE legal permanent ⇒ UNCASTABLE (CR 601.2c) — never a half-cast", () => {
    const s = board([mk("C", { name: "Mulldrifter", type: "Creature — Elemental", power: "2", toughness: "2" })]);
    const choices = expandCastChoices(s, "user", program, [], {});
    console.log("  WITNESS flickerUncastable", JSON.stringify({ choices: choices.length })); // vitest 4 needs --disable-console-intercept
    expect(choices).toEqual([]);
  });

  it("⭐⭐ resolution: artifact + land both leave and COME BACK under your control", () => {
    const s = board([
      mk("A", { name: "Mind Stone", type: "Artifact" }),
      mk("L", { name: "Island", type: "Basic Land — Island" }),
    ]);
    const after = ATOM_RESOLVERS.blink(s, program.atoms[0], { controller: "user", targets: [{ type: "creature", id: "A" }, { type: "creature", id: "L" }] });
    const names = after.players.user.battlefield.map((p) => p.card?.name).sort();
    console.log("  WITNESS flickerBoth", JSON.stringify({ battlefield: names })); // vitest 4 needs --disable-console-intercept
    expect(names).toEqual(["Island", "Mind Stone"]); // both returned — never the exile-no-return half-card
  });
});
