/**
 * bareNoUntapLock.test.js — the BARE no-untap lockdown (CR 302.6): "Target creature doesn't untap during its
 * controller's next untap step." with NO tap of its own. Elvish Hunter, Barl's Cage, Sleeper Dart, House
 * Guildmage; Fifty Feet of Rope and Ajani Vengeant carry it behind other unread text.
 *
 * ⭐⭐ BUILT ENGINE, NO IGNITION — the purest instance of the pattern yet. Every runtime piece has been live
 * since Junk Winder: `setDoesNotUntapNext` flags a permanent, `untapAll` skips it for exactly one untap step
 * and clears the flag as it skips. What was missing was a way IN. `noUntapNext` was only ever produced as a
 * rider FOLDED ONTO A TAP ATOM, and both matchers anchor the tap ("The rider is REQUIRED ($ anchor)"), so the
 * standalone sentence had no atom at all. Barl's Cage sat parked next to a mechanism that already did its job.
 *
 * ⛔ IT MUST NOT TAP, and that is the whole reason `lockOnly` exists. These cards lock a creature that is
 * usually UNTAPPED — Barl's Cage is a repeatable soft-Pacifism, not a tapper. Tapping the target would be a
 * fabricated effect the card never prints, and it would ALSO read as working, because the creature would then
 * stay tapped for a turn either way. The witness row below prints `tapped` explicitly for that reason.
 *
 * ⭐ WHY REUSE THE TAP ATOM instead of minting an op: targeting, the enemy-side chooser (programQueries and
 * stack both map `"tap"` → enemy), the live target-type re-verification, and the restriction set are already
 * exactly right for this clause. A new op would have to re-derive all four, in four files.
 *
 * ⛔ WHOLE-CLAUSE ANCHORED ($), like both siblings: the conditional variants (Guardian of Tazeem, Celestial
 * Regulator) and the "up to one target" forms fall through → low → Arbiter. Pinned below.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * `lockOnly` guard removed -> the resolver TAPS the target and the witness shows tapped:true; the matcher's
 * `lockOnly` flag dropped -> same, because the guard has nothing to read.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { applyTapEffect, combatKeywordClauseParser } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, untapAll } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BARE = "Target creature doesn't untap during its controller's next untap step.";

const ELVISH_HUNTER = { name: "Elvish Hunter", type: "Creature — Elf Archer", mana: "{1}{G}", power: "1", toughness: "1",
  oracle: `{1}{G}, {T}: ${BARE}` };
const BARLS_CAGE = { name: "Barl's Cage", type: "Artifact", mana: "{4}", oracle: `{3}: ${BARE}` };
const SLEEPER_DART = { name: "Sleeper Dart", type: "Artifact", mana: "{2}",
  oracle: `When this artifact enters, draw a card.\n{T}, Sacrifice this artifact: ${BARE}` };

describe("the standalone sentence reaches an atom at last", () => {
  it("⭐ one clause, noUntapNext set, and lockOnly riding it", () => {
    const clauses = splitClauses(BARE);
    expect(clauses).toHaveLength(1);
    expect(combatKeywordClauseParser(clauses[0])).toMatchObject({
      op: "tap", targetType: "creature", restrictions: [], noUntapNext: true, lockOnly: true,
    });
  });

  it("the permanent-target form too (Ajani Vengeant's +1)", () => {
    expect(combatKeywordClauseParser("target permanent doesn't untap during its controller's next untap step"))
      .toMatchObject({ op: "tap", targetType: "permanent", noUntapNext: true, lockOnly: true });
  });

  it("⛔ the FOLDED tap-and-lock siblings are untouched — they still tap", () => {
    const folded = combatKeywordClauseParser("tap target creature and it doesn't untap during its controller's next untap step");
    expect(folded).toMatchObject({ op: "tap", targetType: "creature", noUntapNext: true });
    expect(folded.lockOnly).toBeUndefined(); // ⛔ a lockOnly leak here would stop Frost Lynx tapping anything
  });

  it("⛔ a conditional variant still falls through (CREED — whole clause or nothing)", () => {
    expect(combatKeywordClauseParser("target creature doesn't untap during its controller's next untap step if you control an island")).toBeNull();
    expect(combatKeywordClauseParser("up to one target creature doesn't untap during its controller's next untap step")).toBeNull();
  });
});

describe("classification", () => {
  it("⭐ the three whole-card carriers flip", () => {
    expect(classifyCard(ELVISH_HUNTER)).toBe("native-activated");
    expect(classifyCard(BARLS_CAGE)).toBe("native-activated");
    expect(classifyCard(SLEEPER_DART)).toBe("native-mixed");
  });
});

describe("⭐ LAW 6 — the resolver locks WITHOUT tapping", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const victim = createPermanent({ id: "vic", card: { id: "c-vic", name: "Victim", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai" });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [victim] } } };
  }
  const victim = (s) => s.players.ai.battlefield.find((p) => p.id === "vic");

  // ⛔ THE PARSED atom, never a hand-written one — a typo in the matcher would otherwise leave this row green.
  const ATOM = combatKeywordClauseParser(splitClauses(BARE)[0]);

  it("⭐⭐ the target is FLAGGED but NOT TAPPED, and the lock holds exactly one untap step", () => {
    const start = board();
    const after = applyTapEffect(start, ATOM, { targets: [{ id: "vic", type: "creature" }] }, true);
    const rows = [
      { when: "before", tapped: victim(start).tapped, flagged: !!victim(start).doesNotUntapNext },
      { when: "after resolve", tapped: victim(after).tapped, flagged: !!victim(after).doesNotUntapNext },
    ];
    // The creature is untapped and stays untapped — it simply may not untap next time, which only bites once
    // something taps it. Attacking is the usual way; here we tap it by hand and walk two untap steps.
    let s = { ...after, players: { ...after.players, ai: { ...after.players.ai,
      battlefield: after.players.ai.battlefield.map((p) => (p.id === "vic" ? { ...p, tapped: true } : p)) } } };
    s = untapAll(s, { playerId: "ai" });
    rows.push({ when: "untap step 1", tapped: victim(s).tapped, flagged: !!victim(s).doesNotUntapNext });
    s = untapAll(s, { playerId: "ai" });
    rows.push({ when: "untap step 2", tapped: victim(s).tapped, flagged: !!victim(s).doesNotUntapNext });
    console.log("  WITNESS", JSON.stringify(rows)); // printed (vitest 4 needs --disable-console-intercept to show it)
    expect(rows).toEqual([
      { when: "before", tapped: false, flagged: false },
      // ⭐ THE ROW THIS SLICE IS ABOUT: flagged true, tapped STILL FALSE. Without lockOnly this reads true.
      { when: "after resolve", tapped: false, flagged: true },
      { when: "untap step 1", tapped: true, flagged: false },   // held, and consumed itself
      { when: "untap step 2", tapped: false, flagged: false },  // one-shot, never a permanent freeze
    ]);
  });

  it("⛔ the folded sibling still TAPS — lockOnly did not leak across the family", () => {
    const foldedAtom = combatKeywordClauseParser("tap target creature and it doesn't untap during its controller's next untap step");
    const after = applyTapEffect(board(), foldedAtom, { targets: [{ id: "vic", type: "creature" }] }, true);
    expect(victim(after).tapped).toBe(true);
    expect(victim(after).doesNotUntapNext).toBe(true);
  });

  it("⛔ a non-creature target is refused — the lock is never fabricated onto a land", () => {
    const s = board();
    const withLand = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [
      ...s.players.ai.battlefield,
      createPermanent({ id: "lnd", card: { id: "c-l", name: "Forest", type: "Basic Land — Forest" }, controller: "ai" }),
    ] } } };
    const after = applyTapEffect(withLand, ATOM, { targets: [{ id: "lnd", type: "land" }] }, true);
    expect(after.players.ai.battlefield.find((p) => p.id === "lnd").doesNotUntapNext).toBeUndefined();
    // ⓘ STATED PLAINLY rather than over-claimed: the creature branch tests the ENUMERATOR-supplied `t.type`,
    // not the live type line (only the land/basic-land branches re-verify). Hand a land in mislabelled as a
    // creature and it WILL be locked. That is pre-existing behaviour shared by every tap atom in this file —
    // ctx.targets comes from enumerateTargets, which types permanents off the real card — and this slice does
    // not narrow or widen it. Written down so a later reader doesn't mistake this pin for a live-type guard.
  });
});
