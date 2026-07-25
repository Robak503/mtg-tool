/**
 * tapCreatureLockdown.test.js — the SINGLE-TARGET creature tap-and-lock family (CR 302.6), census slice 10.
 *
 * The runtime already owned every piece of this: setDoesNotUntapNext flags a permanent, untapAll skips it for
 * exactly one untap step and CLEARS the flag as it skips. Only the recognition lane was missing — noUntapNext
 * was produced solely for the multi-tap ("Tap up to two target creatures…") and nonland-permanent (Junk Winder)
 * forms, so the single-target CREATURE sibling had no way in.
 *
 * Two printed shapes converge on one folded clause, differing only in the rider's pronoun:
 *   bare spell  — "Tap target creature. It doesn't untap during its controller's next untap step."
 *   ETB/trigger — "…tap target creature an opponent controls. That creature doesn't untap during its …"
 *
 * THE FOLD NEEDS BOTH HALVES. splitClauses joins the rider onto the tap sentence with " and it …", and a
 * keep-whole guard must then exempt that joined sentence from the top-level " and " split — otherwise the
 * split shatters it right back into "tap target creature" + an unbindable "it doesn't untap …". The first
 * attempt at this slice supplied only the fold and measured ZERO flips for exactly that reason.
 *
 * Flips 12 cards (7 permanents + 4 spells + Niblis of Frost / Wavecrash Triton off other trigger events).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { combatKeywordClauseParser } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, setDoesNotUntapNext, untapAll } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BARE = "Tap target creature. It doesn't untap during its controller's next untap step.";
const ETB = "When this creature enters, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.";

describe("the fold survives the top-level split and reaches the atom", () => {
  it("bare form → ONE clause carrying noUntapNext", () => {
    const clauses = splitClauses(BARE);
    expect(clauses).toHaveLength(1);
    expect(combatKeywordClauseParser(clauses[0])).toMatchObject({ op: "tap", targetType: "creature", restrictions: [], noUntapNext: true });
  });

  it("opponent-restricted form → ONE clause, pronoun normalized, restriction preserved", () => {
    const clauses = splitClauses("tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.");
    expect(clauses).toHaveLength(1);
    expect(combatKeywordClauseParser(clauses[0])).toMatchObject({
      op: "tap", targetType: "creature", noUntapNext: true,
      restrictions: [{ kind: "controller", who: "opponent" }],
    });
  });

  it("the shipped Junk Winder sibling is untouched (no regression on the form this generalizes)", () => {
    const clauses = splitClauses("Tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step.");
    expect(clauses).toHaveLength(1);
    expect(combatKeywordClauseParser(clauses[0])).toMatchObject({ op: "tap", targetType: "nonlandPermanent", noUntapNext: true });
  });

  it("a BARE tap with no rider stays plain — the lockdown is never invented", () => {
    expect(combatKeywordClauseParser("tap target creature")).toMatchObject({ op: "tap", targetType: "creature" });
    expect(combatKeywordClauseParser("tap target creature").noUntapNext).toBeUndefined();
  });
});

describe("classification", () => {
  it("the bare spell flips native-spell", () => {
    expect(classifyCard({ name: "Take into Custody", type: "Instant", mana: "{2}{U}", oracle: BARE })).toBe("native-spell");
  });
  it("the ETB creature flips native-trigger", () => {
    expect(classifyCard({ name: "Frost Lynx", type: "Creature — Elemental Cat", mana: "{2}{U}", power: 2, toughness: 2, oracle: ETB })).toBe("native-trigger");
  });
  it("and so does the same trigger behind a keyword line (the residue strip handles BOTH rider pronouns)", () => {
    expect(classifyCard({ name: "Frost Trickster", type: "Creature — Bird Wizard", mana: "{2}{U}", power: 2, toughness: 2, oracle: `Flying\n${ETB}` })).toBe("native-trigger");
  });
});

describe("CREED — the whole clause or nothing", () => {
  it("a CONDITIONAL rider is not modeled, so the card parks (Guardian of Tazeem)", () => {
    // "If that land is an Island" gates the lockdown; the atom has no lane for that, so the fold must not
    // fire and the card must stay non-native rather than silently applying an unconditional lock.
    const tier = classifyCard({ name: "Guardian of Tazeem", type: "Creature — Merfolk Wizard", mana: "{4}{U}", power: 2, toughness: 5,
      oracle: "Landfall — Whenever a land you control enters, tap target creature an opponent controls. If that land is an Island, that creature doesn't untap during its controller's next untap step." });
    expect(tier).not.toMatch(/^native/);
  });
  it("likewise a board-state-gated rider (Celestial Regulator)", () => {
    const tier = classifyCard({ name: "Celestial Regulator", type: "Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 3,
      oracle: "When Celestial Regulator enters, choose target creature you don't control and tap it. If you control a creature with a counter on it, the chosen creature doesn't untap during its controller's next untap step." });
    expect(tier).not.toMatch(/^native/);
  });
  it("the CONTINUOUS self-static's 'your NEXT untap step' wording stays UNCREDITED (metric mirrors runtime)", () => {
    // selfPreventsUntap deliberately refuses this wording — it's a one-shot rider on a mana ability (the
    // slow-dual family) with no lane, so coverage must not strip it either. A card whose only other text is
    // that mana ability must NOT read native, or the metric would claim a drawback the engine never applies.
    const tier = classifyCard({ name: "Cloudcrest Lake", type: "Land",
      oracle: "{T}: Add {C}.\n{T}: Add {W} or {U}. This land doesn't untap during your next untap step." });
    expect(tier).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the lock applies for exactly ONE untap step, then lifts", () => {
  // The safety property that makes this slice shippable: a lock that never cleared would freeze a creature
  // permanently, which is a far worse false positive than not modeling the card at all.
  function tappedBoard() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "vic", card: { id: "c-vic", name: "Victim", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...perm, tapped: true }] } } };
  }
  const victim = (s) => s.players.user.battlefield.find((p) => p.id === "vic");

  it("a flagged permanent stays tapped through its next untap step, and the flag clears", () => {
    let s = setDoesNotUntapNext(tappedBoard(), "vic", true);
    expect(victim(s).doesNotUntapNext).toBe(true);
    s = untapAll(s, { playerId: "user" });
    expect(victim(s).tapped).toBe(true);                 // skipped — the lockdown held
    expect(victim(s).doesNotUntapNext).toBeUndefined();  // …and consumed itself
  });

  it("the FOLLOWING untap step untaps it normally (one-shot, not a permanent freeze)", () => {
    let s = setDoesNotUntapNext(tappedBoard(), "vic", true);
    s = untapAll(s, { playerId: "user" });
    s = untapAll(s, { playerId: "user" });
    expect(victim(s).tapped).toBe(false);
  });

  it("an unflagged tapped permanent is untouched by any of this", () => {
    const s = untapAll(tappedBoard(), { playerId: "user" });
    expect(victim(s).tapped).toBe(false);
  });
});
